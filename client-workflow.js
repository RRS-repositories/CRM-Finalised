// ============================================================================
// Client Workflow Engine — DB-backed email queue with scheduled sending
//
// Flow:
//   Contact Created → Queue 3 emails:
//     1. ID Upload link      (immediate, skip if ID already attached)
//     2. Extra Lender form   (+2 minutes)
//     3. Previous Address    (+5 minutes)
//   DSAR Sent to Lender → Queue:
//     4. Questionnaire       (immediate, once per contact regardless of # cases)
//
// Poller runs every 60s, picks up due emails, generates tokens, sends them.
// ============================================================================

import { randomUUID } from 'crypto';

let _pool = null;
let _emailTransporter = null;
let _pollInterval = null;

// ─── INIT ────────────────────────────────────────────────────────────────────

async function init(pool, emailTransporter) {
    _pool = pool;
    _emailTransporter = emailTransporter;

    // Create queue table + add workflow columns to contacts
    await _pool.query(`
        CREATE TABLE IF NOT EXISTS workflow_email_queue (
            id SERIAL PRIMARY KEY,
            contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            step TEXT NOT NULL,
            scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(contact_id, step)
        );
        CREATE INDEX IF NOT EXISTS idx_weq_pending ON workflow_email_queue (status, scheduled_at) WHERE status = 'pending';
    `);

    // Add workflow tracking columns to contacts if not exist
    await _pool.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='workflow_step') THEN
                ALTER TABLE contacts ADD COLUMN workflow_step TEXT;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='workflow_step_at') THEN
                ALTER TABLE contacts ADD COLUMN workflow_step_at TIMESTAMPTZ;
            END IF;
        END $$;
    `);

    // Start poller
    _pollInterval = setInterval(() => processQueue().catch(e => console.error('[Workflow Poller] Error:', e.message)), 60_000);
    console.log('[Client Workflow] ✅ Initialised — poller running every 60s');

    // Run once immediately on startup to clear any backlog
    setTimeout(() => processQueue().catch(e => console.error('[Workflow Poller] Startup error:', e.message)), 5_000);
}

function stop() {
    if (_pollInterval) clearInterval(_pollInterval);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getBaseUrl() {
    const isProduction = process.env.PM2_HOME || process.env.NODE_ENV === 'production';
    return isProduction ? 'https://rowanroseclaims.co.uk' : 'http://localhost:3000';
}

async function sendEmail(to, subject, html) {
    try {
        const info = await _emailTransporter.sendMail({
            from: '"Rowan Rose Solicitors" <irl@rowanrose.co.uk>',
            to,
            subject,
            html,
        });
        console.log(`[Client Workflow] ✅ Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[Client Workflow] ❌ Email failed to ${to}:`, err.message);
        return { success: false, error: err.message };
    }
}

async function logAction(contactId, actionType, description, metadata = {}) {
    try {
        await _pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, 'system', 'workflow', 'Client Workflow', $2, 'workflow', $3, $4, NOW())`,
            [contactId, actionType, description, JSON.stringify(metadata)]
        );
    } catch (e) {
        console.error('[Client Workflow] Log error:', e.message);
    }
}

// ─── QUEUE MANAGEMENT ────────────────────────────────────────────────────────

/**
 * Queue emails for a newly created contact.
 *
 * source = 'migration' (from sales CRM):
 *   ID Upload: immediate
 *   Extra Lender: +30 min
 *   Previous Address: +3 days
 *
 * source = 'intake' (from intake form — extra lender already sent by intake):
 *   ID Upload: +30 min (skip if ID already attached)
 *   Previous Address: +3 days
 *   Extra Lender: SKIPPED (already sent by intake flow)
 */
async function queueOnboardingEmails(contactId, { skipIdUpload = false, source = 'migration' } = {}) {
    try {
        if (source === 'intake') {
            // Intake: LOA/extra lender already sent. Queue ID (+30min if needed) and Prev Address (+3 days)
            if (!skipIdUpload) {
                await _pool.query(
                    `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
                     VALUES ($1, 'id_upload', NOW() + INTERVAL '30 minutes')
                     ON CONFLICT (contact_id, step) DO NOTHING`,
                    [contactId]
                );
            }
            await _pool.query(
                `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
                 VALUES ($1, 'previous_address', NOW() + INTERVAL '3 days')
                 ON CONFLICT (contact_id, step) DO NOTHING`,
                [contactId]
            );
            console.log(`[Client Workflow] Queued INTAKE onboarding for contact ${contactId} (skipId: ${skipIdUpload})`);
        } else {
            // Migration: ID (now), Extra Lender (+30min), Previous Address (+3 days)
            if (!skipIdUpload) {
                await _pool.query(
                    `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
                     VALUES ($1, 'id_upload', NOW())
                     ON CONFLICT (contact_id, step) DO NOTHING`,
                    [contactId]
                );
            }
            await _pool.query(
                `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
                 VALUES ($1, 'extra_lender', NOW() + INTERVAL '30 minutes')
                 ON CONFLICT (contact_id, step) DO NOTHING`,
                [contactId]
            );
            await _pool.query(
                `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
                 VALUES ($1, 'previous_address', NOW() + INTERVAL '3 days')
                 ON CONFLICT (contact_id, step) DO NOTHING`,
                [contactId]
            );
            console.log(`[Client Workflow] Queued MIGRATION onboarding for contact ${contactId} (skipId: ${skipIdUpload})`);
        }
    } catch (err) {
        console.error(`[Client Workflow] Queue error for contact ${contactId}:`, err.message);
    }
}

/**
 * Queue questionnaire email when DSAR sent to lender.
 * UNIQUE constraint ensures only 1 per contact regardless of # cases.
 */
async function queueQuestionnaireEmail(contactId) {
    try {
        await _pool.query(
            `INSERT INTO workflow_email_queue (contact_id, step, scheduled_at)
             VALUES ($1, 'questionnaire', NOW())
             ON CONFLICT (contact_id, step) DO NOTHING`,
            [contactId]
        );
        console.log(`[Client Workflow] Queued questionnaire email for contact ${contactId}`);
    } catch (err) {
        console.error(`[Client Workflow] Queue questionnaire error for contact ${contactId}:`, err.message);
    }
}

// ─── POLLER — Runs every 60s ─────────────────────────────────────────────────

async function processQueue() {
    // Pick up all due pending emails
    const { rows: dueEmails } = await _pool.query(
        `SELECT * FROM workflow_email_queue
         WHERE status = 'pending' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 50`
    );

    if (dueEmails.length === 0) return;
    console.log(`[Workflow Poller] Processing ${dueEmails.length} due email(s)...`);

    for (const item of dueEmails) {
        try {
            await processQueueItem(item);
        } catch (err) {
            console.error(`[Workflow Poller] Failed item ${item.id} (${item.step}):`, err.message);
            await _pool.query(
                `UPDATE workflow_email_queue SET status = 'failed', error = $1 WHERE id = $2`,
                [err.message, item.id]
            );
        }
    }
}

async function processQueueItem(item) {
    const { id, contact_id, step } = item;

    // Fetch contact
    const { rows } = await _pool.query(
        `SELECT id, first_name, last_name, email, document_checklist, loa_submitted,
                unique_form_link, problematic_gambling, questionnaire_submitted
         FROM contacts WHERE id = $1`,
        [contact_id]
    );
    if (rows.length === 0) {
        await markStatus(id, 'skipped', 'Contact not found');
        return;
    }
    const contact = rows[0];

    if (!contact.email) {
        await markStatus(id, 'skipped', 'No email on contact');
        return;
    }

    const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    const baseUrl = getBaseUrl();

    // --- Dispatch by step ---
    switch (step) {
        case 'id_upload':
            await processIdUpload(id, contact, clientName, baseUrl);
            break;
        case 'extra_lender':
            await processExtraLender(id, contact, clientName, baseUrl);
            break;
        case 'previous_address':
            await processPreviousAddress(id, contact, clientName, baseUrl);
            break;
        case 'questionnaire':
            await processQuestionnaire(id, contact, clientName, baseUrl);
            break;
        default:
            await markStatus(id, 'skipped', `Unknown step: ${step}`);
    }
}

// ─── STEP PROCESSORS ─────────────────────────────────────────────────────────

async function processIdUpload(queueId, contact, clientName, baseUrl) {
    // Skip if ID already uploaded
    const checklist = contact.document_checklist || {};
    if (checklist.identification) {
        await markStatus(queueId, 'skipped', 'ID already uploaded');
        return;
    }

    // Generate token
    await _pool.query('DELETE FROM id_upload_tokens WHERE contact_id = $1 AND submitted = false', [contact.id]);
    const tokenRes = await _pool.query('INSERT INTO id_upload_tokens (contact_id) VALUES ($1) RETURNING token', [contact.id]);
    const token = tokenRes.rows[0].token;
    const link = `${baseUrl}/id-upload/${token}`;

    const html = buildEmail(clientName,
        'Upload Your Identification',
        'Secure Document Upload for Your Claim',
        `<p>Thank you for choosing Rowan Rose Solicitors. To proceed with your claim, we require a copy of your identification document.</p>
        <div class="highlight-box">
            <span class="highlight-text">Action Required: Upload Your ID</span>
            <p>Please upload a clear photo or scan of one of the following: Passport, Driving Licence, or National ID Card.</p>
        </div>
        <div class="info-box">
            <p><strong>Why do we need this?</strong> Your identification is required to verify your identity and process your claim with lenders. Your documents are stored securely and handled in accordance with GDPR.</p>
        </div>`,
        'Upload ID Document', link, 'This secure link expires in 7 days'
    );

    const result = await sendEmail(contact.email, 'Upload Your Identification - Rowan Rose Solicitors', html);
    if (!result.success) throw new Error(result.error);

    await markStatus(queueId, 'sent', null, { token, link });
    await _pool.query(`UPDATE contacts SET workflow_step = 'id_upload_sent', workflow_step_at = NOW() WHERE id = $1`, [contact.id]);
    await logAction(contact.id, 'workflow_id_upload_sent', `ID upload link emailed to ${contact.email}`, { link });
}

async function processExtraLender(queueId, contact, clientName, baseUrl) {
    // Skip if LOA already submitted
    if (contact.loa_submitted) {
        await markStatus(queueId, 'skipped', 'LOA already submitted');
        return;
    }

    // Generate LOA form link
    const uniqueId = randomUUID();
    await _pool.query('UPDATE contacts SET unique_form_link = $1 WHERE id = $2', [uniqueId, contact.id]);
    const link = `${baseUrl}/loa-form/${uniqueId}`;

    const html = buildEmail(clientName,
        'Complete Your Lender Selection',
        'Expert Legal Support for Your Financial Claims',
        `<p>Successful claims can pay out £1,000+. Take a look at the list of lenders we deal with in the link below. Click the button below and select any lenders you may have dealt with in the last 15 years.</p>`,
        'Click Here', link, 'This secure link expires in 7 days',
        `<div class="highlight-box">
            <span class="highlight-text">Action Required: Select Additional Lenders</span>
            <p>To maximize your potential compensation, please tell us about any other lenders you have used in the last 15 years.</p>
        </div>
        <div class="info-box">
            <p><strong>Did you know?</strong> Establishing a pattern of irresponsible lending across multiple lenders significantly strengthens your case and can increase your compensation.</p>
        </div>`
    );

    const result = await sendEmail(contact.email, 'Complete Your Lender Selection - Rowan Rose Solicitors', html);
    if (!result.success) throw new Error(result.error);

    await markStatus(queueId, 'sent', null, { uniqueId, link });
    await _pool.query(`UPDATE contacts SET workflow_step = 'extra_lender_sent', workflow_step_at = NOW() WHERE id = $1`, [contact.id]);
    await logAction(contact.id, 'workflow_extra_lender_sent', `Extra Lender form link emailed to ${contact.email}`, { link });
}

async function processPreviousAddress(queueId, contact, clientName, baseUrl) {
    // Generate previous address token
    await _pool.query('DELETE FROM previous_address_tokens WHERE contact_id = $1 AND submitted = false', [contact.id]);
    const tokenRes = await _pool.query('INSERT INTO previous_address_tokens (contact_id) VALUES ($1) RETURNING token', [contact.id]);
    const token = tokenRes.rows[0].token;
    const link = `${baseUrl}/previous-address/${token}`;

    const html = buildEmail(clientName,
        'Confirm Your Previous Addresses',
        'Important Step to Complete Your Claim',
        `<p>Thank you for choosing Rowan Rose Solicitors. To help us build the strongest possible case, we need to verify your address history.</p>
        <div class="highlight-box">
            <span class="highlight-text">Action Required: Previous Address Details</span>
            <p>Please review your current address and let us know if you have lived at any other addresses in the past 10 years.</p>
        </div>
        <div class="info-box">
            <p><strong>Why is this important?</strong> Lenders may have records linked to your previous addresses. Having complete address details helps us recover all compensation you may be owed.</p>
        </div>`,
        'Complete Address Details', link, 'This secure link expires in 7 days'
    );

    const result = await sendEmail(contact.email, 'Confirm Your Previous Addresses - Rowan Rose Solicitors', html);
    if (!result.success) throw new Error(result.error);

    await markStatus(queueId, 'sent', null, { token, link });
    await _pool.query(`UPDATE contacts SET workflow_step = 'previous_address_sent', workflow_step_at = NOW() WHERE id = $1`, [contact.id]);
    await logAction(contact.id, 'workflow_prev_address_sent', `Previous Address form link emailed to ${contact.email}`, { link });
}

async function processQuestionnaire(queueId, contact, clientName, baseUrl) {
    // Skip if questionnaire already submitted
    if (contact.questionnaire_submitted) {
        await markStatus(queueId, 'skipped', 'Questionnaire already submitted');
        return;
    }

    const hasGambling = contact.problematic_gambling === true;

    // Generate tokenised IRL questionnaire link (type 2)
    await _pool.query('DELETE FROM questionnaire_tokens WHERE contact_id = $1 AND questionnaire_type = 2 AND submitted = false', [contact.id]);
    const irlTokenRes = await _pool.query(
        'INSERT INTO questionnaire_tokens (contact_id, questionnaire_type) VALUES ($1, 2) RETURNING token',
        [contact.id]
    );
    const irlLink = `${baseUrl}/questionnaire/token/${irlTokenRes.rows[0].token}`;

    // Generate tokenised Gambling questionnaire link (type 1) if applicable
    let gamblingLink = null;
    if (hasGambling) {
        await _pool.query('DELETE FROM questionnaire_tokens WHERE contact_id = $1 AND questionnaire_type = 1 AND submitted = false', [contact.id]);
        const gamblingTokenRes = await _pool.query(
            'INSERT INTO questionnaire_tokens (contact_id, questionnaire_type) VALUES ($1, 1) RETURNING token',
            [contact.id]
        );
        gamblingLink = `${baseUrl}/questionnaire/token/${gamblingTokenRes.rows[0].token}`;
    }

    // Send IRL questionnaire email (always)
    const irlHtml = buildEmail(clientName,
        'Complete Your Questionnaire',
        'Help Us Build Your Case',
        `<p>Great news — your DSAR has been sent to your lender(s). While we wait for their response, please complete the following questionnaire to help strengthen your case.</p>
        <div class="highlight-box">
            <span class="highlight-text">Action Required: Complete Your Questionnaire</span>
            <p>This questionnaire covers your experience with irresponsible lending. Your answers help us build the strongest possible case.</p>
        </div>
        <div class="info-box">
            <p><strong>What happens next?</strong> Once we receive the lender's response to our DSAR, we will review it alongside your questionnaire answers and proceed with your claim.</p>
        </div>`,
        'Complete IRL Questionnaire', irlLink, null
    );

    const irlResult = await sendEmail(contact.email, 'Complete Your Questionnaire - Rowan Rose Solicitors', irlHtml);
    if (!irlResult.success) throw new Error(irlResult.error);

    // Send separate gambling questionnaire email if applicable
    if (hasGambling && gamblingLink) {
        const gamblingHtml = buildEmail(clientName,
            'Complete Your Gambling Questionnaire',
            'Additional Questionnaire for Your Gambling Claim',
            `<p>As part of your gambling-related claim, we need you to complete an additional questionnaire to help us understand your experience.</p>
            <div class="highlight-box">
                <span class="highlight-text">Action Required: Gambling Questionnaire</span>
                <p>This questionnaire specifically covers your experience with gambling-related lending. Your detailed answers are crucial for building a strong case.</p>
            </div>
            <div class="info-box">
                <p><strong>Why is this separate?</strong> Gambling claims require specific details about your experience. This helps us tailor your case for the best possible outcome.</p>
            </div>`,
            'Complete Gambling Questionnaire', gamblingLink, null
        );

        await sendEmail(contact.email, 'Complete Your Gambling Questionnaire - Rowan Rose Solicitors', gamblingHtml);
    }

    await markStatus(queueId, 'sent', null, { irlLink, gamblingLink, hasGambling });
    await _pool.query(`UPDATE contacts SET workflow_step = 'questionnaire_sent', workflow_step_at = NOW() WHERE id = $1`, [contact.id]);
    await logAction(contact.id, 'workflow_questionnaire_sent', `Questionnaire link(s) emailed to ${contact.email} (gambling: ${hasGambling})`, { irlLink, gamblingLink, hasGambling });
}

// ─── MARK STATUS ─────────────────────────────────────────────────────────────

async function markStatus(queueId, status, error = null, metadata = null) {
    const updates = [`status = '${status}'`];
    if (status === 'sent') updates.push(`sent_at = NOW()`);
    if (error) updates.push(`error = ${_pool.escapeLiteral ? _pool.escapeLiteral(error) : `'${error.replace(/'/g, "''")}'`}`);
    if (metadata) updates.push(`metadata = '${JSON.stringify(metadata)}'::jsonb`);
    await _pool.query(`UPDATE workflow_email_queue SET ${updates.join(', ')} WHERE id = $1`, [queueId]);
}

// ─── EMAIL TEMPLATE ──────────────────────────────────────────────────────────

function buildEmail(clientName, heading, subtitle, bodyHtml, ctaText, ctaLink, expiryNote, afterButtonHtml) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 40px 20px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 620px; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 45px; text-align: center; }
        .logo-text { font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: 2px; margin: 0; text-transform: uppercase; }
        .content { padding: 48px 45px; background: #ffffff; }
        h1 { color: #0f172a; font-size: 28px; margin-top: 0; margin-bottom: 6px; font-weight: 700; letter-spacing: -0.5px; }
        .subtitle { color: #64748b; font-size: 16px; margin-bottom: 30px; font-weight: 500; }
        p { font-size: 18px; line-height: 1.75; margin-bottom: 16px; color: #475569; }
        .greeting { font-size: 20px; color: #1e293b; margin-bottom: 16px; }
        .highlight-box { background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); border-left: 5px solid #f59e0b; padding: 26px 30px; margin: 32px 0; border-radius: 0 14px 14px 0; }
        .highlight-text { font-weight: 700; color: #b45309; margin: 0; display: block; font-size: 20px; letter-spacing: -0.3px; }
        .highlight-box p { color: #92400e; margin-bottom: 0; margin-top: 12px; font-size: 17px; line-height: 1.6; }
        .info-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 20px 24px; border-radius: 12px; margin: 24px 0; }
        .info-box p { color: #0369a1; margin: 0; font-size: 17px; }
        .info-box strong { color: #075985; }
        .btn-container { text-align: center; margin: 40px 0 32px 0; }
        .btn { display: inline-block; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); color: #ffffff !important; font-size: 20px; font-weight: 700; padding: 20px 52px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); letter-spacing: 0.3px; border: 3px solid #000000; }
        .expiry-note { font-size: 14px; color: #ef4444; font-weight: 600; margin-top: 14px; display: block; }
        .divider { height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 28px 0; }
        .signature { margin-top: 8px; }
        .signature p { margin-bottom: 4px; font-size: 18px; }
        .footer { background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%); padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 5px 0; font-size: 14px; color: #64748b; }
        .footer-brand { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px !important; }
        .footer a { color: #f97316; text-decoration: none; font-weight: 600; }
        .footer-sra { font-size: 12px; color: #94a3b8; margin-top: 12px !important; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="main">
            <div class="header">
                <p class="logo-text">Rowan Rose Solicitors</p>
            </div>
            <div class="content">
                <h1>${heading}</h1>
                <p class="subtitle">${subtitle}</p>
                <p class="greeting">Dear ${clientName},</p>
                ${bodyHtml}
                <div class="btn-container">
                    <a href="${ctaLink}" class="btn">${ctaText}</a>
                    ${expiryNote ? `<span class="expiry-note">${expiryNote}</span>` : ''}
                </div>
                ${afterButtonHtml || ''}
                <div class="divider"></div>
                <p>If you have any questions, our dedicated team is here to assist you.</p>
                <div class="signature">
                    <p>Kind regards,</p>
                    <p><strong>The Rowan Rose Solicitors Team</strong></p>
                </div>
            </div>
            <div class="footer">
                <p class="footer-brand">Rowan Rose Solicitors</p>
                <p>1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
                <p><a href="tel:01615331706">0161 533 1706</a> &nbsp;|&nbsp; <a href="mailto:irl@rowanrose.co.uk">irl@rowanrose.co.uk</a></p>
                <p class="footer-sra">Authorised and Regulated by the Solicitors Regulation Authority (SRA No. 8000843)</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// ─── QUESTIONNAIRE EMAIL TEMPLATE (supports multiple CTA buttons) ───────────

function buildQuestionnaireEmail(clientName, heading, subtitle, bodyHtml, ctaButtonsHtml) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 40px 20px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 620px; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 45px; text-align: center; }
        .logo-text { font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: 2px; margin: 0; text-transform: uppercase; }
        .content { padding: 48px 45px; background: #ffffff; }
        h1 { color: #0f172a; font-size: 28px; margin-top: 0; margin-bottom: 6px; font-weight: 700; letter-spacing: -0.5px; }
        .subtitle { color: #64748b; font-size: 16px; margin-bottom: 30px; font-weight: 500; }
        p { font-size: 18px; line-height: 1.75; margin-bottom: 16px; color: #475569; }
        .greeting { font-size: 20px; color: #1e293b; margin-bottom: 16px; }
        .highlight-box { background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); border-left: 5px solid #f59e0b; padding: 26px 30px; margin: 32px 0; border-radius: 0 14px 14px 0; }
        .highlight-text { font-weight: 700; color: #b45309; margin: 0; display: block; font-size: 20px; letter-spacing: -0.3px; }
        .highlight-box p { color: #92400e; margin-bottom: 0; margin-top: 12px; font-size: 17px; line-height: 1.6; }
        .info-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 20px 24px; border-radius: 12px; margin: 24px 0; }
        .info-box p { color: #0369a1; margin: 0; font-size: 17px; }
        .info-box strong { color: #075985; }
        .btn-container { text-align: center; margin: 24px 0; }
        .btn { display: inline-block; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); color: #ffffff !important; font-size: 20px; font-weight: 700; padding: 20px 52px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); letter-spacing: 0.3px; border: 3px solid #000000; }
        .divider { height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 28px 0; }
        .signature { margin-top: 8px; }
        .signature p { margin-bottom: 4px; font-size: 18px; }
        .footer { background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%); padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { margin: 5px 0; font-size: 14px; color: #64748b; }
        .footer-brand { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px !important; }
        .footer a { color: #f97316; text-decoration: none; font-weight: 600; }
        .footer-sra { font-size: 12px; color: #94a3b8; margin-top: 12px !important; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="main">
            <div class="header">
                <p class="logo-text">Rowan Rose Solicitors</p>
            </div>
            <div class="content">
                <h1>${heading}</h1>
                <p class="subtitle">${subtitle}</p>
                <p class="greeting">Dear ${clientName},</p>
                ${bodyHtml}
                ${ctaButtonsHtml}
                <div class="divider"></div>
                <p>If you have any questions, our dedicated team is here to assist you.</p>
                <div class="signature">
                    <p>Kind regards,</p>
                    <p><strong>The Rowan Rose Solicitors Team</strong></p>
                </div>
            </div>
            <div class="footer">
                <p class="footer-brand">Rowan Rose Solicitors</p>
                <p>1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
                <p><a href="tel:01615331706">0161 533 1706</a> &nbsp;|&nbsp; <a href="mailto:irl@rowanrose.co.uk">irl@rowanrose.co.uk</a></p>
                <p class="footer-sra">Authorised and Regulated by the Solicitors Regulation Authority (SRA No. 8000843)</p>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// ============================================================================
// EXPORTS
// ============================================================================
const clientWorkflow = {
    init,
    stop,
    queueOnboardingEmails,   // Called on contact creation
    queueQuestionnaireEmail, // Called when DSAR sent to lender
    processQueue,            // Exposed for manual trigger if needed
};

export default clientWorkflow;
