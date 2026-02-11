// coverletter.js — Generate cover letter from saved template when claim status = "LOA Uploaded"
// Resolves TipTap JSON variable nodes with real claim/contact/lender data,
// converts to HTML, renders PDF via Puppeteer, uploads to S3.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOTE: Don't read process.env at module top level — ES module imports are hoisted
// before dotenv.config() runs, so env vars aren't available yet. Read at runtime instead.
const TEMPLATES_STORE_PATH = path.join(__dirname, 'templates-store.json');

// Load lender details
const lendersJsonContent = fs.readFileSync(path.join(__dirname, 'all_lenders_details.json'), 'utf-8');
const allLendersData = JSON.parse(lendersJsonContent.replace(/:\s*NaN/g, ': null'));

// Load FAC logo as base64 for PDF letterhead
const LOGO_PATH = path.join(__dirname, 'public', 'fac.png');
const LOGO_BASE64 = fs.existsSync(LOGO_PATH)
    ? 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64')
    : null;

// --- Lender address lookup (same logic as worker.js) ---
function getLenderAddress(lenderName) {
    if (!lenderName) return null;
    const normalizedInput = lenderName.toUpperCase().trim();
    let lenderData = allLendersData.find(l => l.lender?.toUpperCase() === normalizedInput);
    if (!lenderData) {
        lenderData = allLendersData.find(l => {
            const lenderUpper = l.lender?.toUpperCase() || '';
            return lenderUpper.includes(normalizedInput) || normalizedInput.includes(lenderUpper);
        });
    }
    if (!lenderData || !lenderData.address) return null;
    const addr = lenderData.address;
    return {
        company_name: addr.company_name && addr.company_name !== 'NaN' ? addr.company_name : '',
        first_line_address: addr.first_line_address && addr.first_line_address !== 'NaN' ? addr.first_line_address : '',
        town_city: addr.town_city && addr.town_city !== 'NaN' ? addr.town_city : '',
        postcode: addr.postcode && addr.postcode !== 'NaN' ? addr.postcode : ''
    };
}

function getLenderEmail(lenderName) {
    if (!lenderName) return null;
    const normalizedInput = lenderName.toUpperCase().trim();
    let lenderData = allLendersData.find(l => l.lender?.toUpperCase() === normalizedInput);
    if (!lenderData) {
        lenderData = allLendersData.find(l => {
            const lenderUpper = l.lender?.toUpperCase() || '';
            return lenderUpper.includes(normalizedInput) || normalizedInput.includes(lenderUpper);
        });
    }
    return lenderData?.email || null;
}

// --- Client ID generator (same as worker.js) ---
function generateClientId(contactId, createdAt) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const idPart = String(contactId).slice(-4).padStart(4, '0');
    return `RR-${yy}${mm}${dd}-${idPart}`;
}

// --- Load saved template from templates-store.json ---
function loadCoverLetterTemplate() {
    if (!fs.existsSync(TEMPLATES_STORE_PATH)) {
        console.error('[CoverLetter] templates-store.json not found');
        return null;
    }
    const templates = JSON.parse(fs.readFileSync(TEMPLATES_STORE_PATH, 'utf-8'));
    // Find a cover letter template (match by name or category)
    const coverLetterTpl = templates.find(t =>
        t.name?.toUpperCase().includes('COVER LETTER') ||
        t.category?.toUpperCase() === 'COVER LETTER'
    );
    if (!coverLetterTpl) {
        // Fallback: use the first template
        return templates[0] || null;
    }
    return coverLetterTpl;
}

// --- Build variable values map from contact + case + lender data ---
function buildVariableMap(contact, caseData, lenderAddress, lenderEmail) {
    const fullName = `${contact.first_name} ${contact.last_name}`;
    const clientId = generateClientId(contact.id, contact.created_at);
    const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    const clientAddress = [
        contact.address_line_1,
        contact.address_line_2,
        contact.city,
        contact.state_county,
        contact.postal_code
    ].filter(Boolean).join(', ');

    return {
        // Client Details
        'client.fullName': fullName,
        'client.full_name': fullName,
        'client.firstName': contact.first_name || '',
        'client.first_name': contact.first_name || '',
        'client.lastName': contact.last_name || '',
        'client.last_name': contact.last_name || '',
        'client.email': contact.email || '',
        'client.phone': contact.phone || '',
        'client.address': clientAddress,
        'client.dateOfBirth': contact.dob
            ? new Date(contact.dob).toLocaleDateString('en-GB')
            : '',

        // Claim Details
        'claim.lender': caseData.lender || '',
        'claim.clientId': clientId,
        'claim.caseRef': `x${contact.id}${caseData.id}`,
        'claim.claimValue': caseData.claim_value ? `£${Number(caseData.claim_value).toLocaleString()}` : '',

        // Lender Details
        'lender.companyName': lenderAddress?.company_name || caseData.lender || '',
        'lender.address': lenderAddress?.first_line_address || '',
        'lender.city': lenderAddress?.town_city || '',
        'lender.postcode': lenderAddress?.postcode || '',
        'lender.email': lenderEmail || '',

        // Firm Details
        'firm.name': 'Fast Action Claims',
        'firm.address': '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
        'firm.phone': '0161 5331706',

        // System
        'system.today': today,
        'system.year': String(new Date().getFullYear()),

        // Legacy {{mustache}} keys (for backward compat with old templates)
        '{{fullName}}': fullName,
        '{{firstName}}': contact.first_name || '',
        '{{lastName}}': contact.last_name || '',
        '{{email}}': contact.email || '',
        '{{phone}}': contact.phone || '',
        '{{address}}': clientAddress,
        '{{lender}}': caseData.lender || '',
        '{{clientId}}': clientId,
        '{{caseRef}}': `x${contact.id}${caseData.id}`,
        '{{today}}': today,
        '{{lenderCompanyName}}': lenderAddress?.company_name || caseData.lender || '',
        '{{lenderAddress}}': lenderAddress?.first_line_address || '',
        '{{lenderCity}}': lenderAddress?.town_city || '',
        '{{lenderPostcode}}': lenderAddress?.postcode || '',
        '{{lenderEmail}}': lenderEmail || '',
    };
}

// --- Walk TipTap JSON and replace variable nodes with resolved text ---
function resolveVariables(node, variableMap) {
    if (!node) return node;

    // If this is a variable node, replace it with a text node
    if (node.type === 'variable') {
        const fieldKey = node.attrs?.fieldKey;
        const resolvedValue = variableMap[fieldKey] || node.attrs?.label || fieldKey || '';
        return {
            type: 'text',
            text: resolvedValue,
        };
    }

    // Recurse into content array
    if (node.content && Array.isArray(node.content)) {
        node.content = node.content.map(child => resolveVariables(child, variableMap));
    }

    return node;
}

// --- Convert TipTap JSON to HTML ---
function tiptapJsonToHtml(doc) {
    if (!doc || !doc.content) return '';

    const nodes = doc.content;

    // Detect right-aligned paragraphs at the start (company details header).
    // Render them as a letterhead table: logo (from fac.png) on the left,
    // company details on the right — side by side.
    let headerNodes = [];
    let bodyStartIndex = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        // Skip image paragraphs at the start (logo injected separately via LOGO_BASE64)
        if (node.type === 'paragraph' && node.content?.some(c => c.type === 'image')) {
            bodyStartIndex = i + 1;
            continue;
        }
        if (node.attrs?.textAlign === 'right') {
            headerNodes.push(node);
            bodyStartIndex = i + 1;
        } else {
            break;
        }
    }

    const parts = [];

    // Render letterhead as a table: logo left, company details right
    if (headerNodes.length > 0 && LOGO_BASE64) {
        const detailsHtml = headerNodes.map(n => nodeToHtml(n)).join('');
        parts.push(`<table class="letterhead" style="width:100%; border:none; border-collapse:collapse; margin-bottom:10px;">
            <tr>
                <td style="width:150px; vertical-align:middle; padding:0;">
                    <img src="${LOGO_BASE64}" style="width:120px;" alt="Fast Action Claims" />
                </td>
                <td style="vertical-align:top; text-align:right; padding:0;">${detailsHtml}</td>
            </tr>
        </table>`);
    } else if (headerNodes.length > 0) {
        // No logo file — just render header normally
        for (const n of headerNodes) parts.push(nodeToHtml(n));
    }

    // Render remaining body nodes normally
    for (let i = bodyStartIndex; i < nodes.length; i++) {
        parts.push(nodeToHtml(nodes[i]));
    }

    return parts.join('');
}

function nodeToHtml(node) {
    if (!node) return '';

    switch (node.type) {
        case 'doc':
            return (node.content || []).map(n => nodeToHtml(n)).join('');

        case 'paragraph': {
            const styles = [];
            if (node.attrs?.textAlign) styles.push(`text-align: ${node.attrs.textAlign}`);
            if (node.attrs?.marginTop) styles.push(`margin-top: ${node.attrs.marginTop}`);
            if (node.attrs?.marginBottom) styles.push(`margin-bottom: ${node.attrs.marginBottom}`);
            if (node.attrs?.marginLeft) styles.push(`margin-left: ${node.attrs.marginLeft}`);
            if (node.attrs?.lineHeight) styles.push(`line-height: ${node.attrs.lineHeight}`);
            const style = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
            const inner = (node.content || []).map(n => nodeToHtml(n)).join('');
            return `<p${style}>${inner || '&nbsp;'}</p>`;
        }

        case 'heading': {
            const level = node.attrs?.level || 1;
            const hStyles = [];
            if (node.attrs?.textAlign) hStyles.push(`text-align: ${node.attrs.textAlign}`);
            if (node.attrs?.marginTop) hStyles.push(`margin-top: ${node.attrs.marginTop}`);
            if (node.attrs?.marginBottom) hStyles.push(`margin-bottom: ${node.attrs.marginBottom}`);
            const style = hStyles.length > 0 ? ` style="${hStyles.join('; ')}"` : '';
            const inner = (node.content || []).map(n => nodeToHtml(n)).join('');
            return `<h${level}${style}>${inner}</h${level}>`;
        }

        case 'text': {
            let text = escapeHtml(node.text || '');
            if (node.marks) {
                for (const mark of node.marks) {
                    switch (mark.type) {
                        case 'bold':
                            text = `<strong>${text}</strong>`;
                            break;
                        case 'italic':
                            text = `<em>${text}</em>`;
                            break;
                        case 'underline':
                            text = `<u>${text}</u>`;
                            break;
                        case 'link':
                            text = `<a href="${escapeHtml(mark.attrs?.href || '')}">${text}</a>`;
                            break;
                        case 'strike':
                            text = `<s>${text}</s>`;
                            break;
                        case 'textStyle': {
                            const tsStyles = [];
                            if (mark.attrs?.fontSize) tsStyles.push(`font-size: ${mark.attrs.fontSize}`);
                            if (mark.attrs?.color) tsStyles.push(`color: ${mark.attrs.color}`);
                            if (mark.attrs?.fontFamily) tsStyles.push(`font-family: ${mark.attrs.fontFamily}`);
                            if (tsStyles.length > 0) {
                                text = `<span style="${tsStyles.join('; ')}">${text}</span>`;
                            }
                            break;
                        }
                    }
                }
            }
            return text;
        }

        case 'hardBreak':
            return '<br>';

        case 'image': {
            const src = node.attrs?.src || '';
            const width = node.attrs?.width;
            const style = width ? ` style="width: ${width}px"` : '';
            return `<img src="${src}"${style} />`;
        }

        case 'bulletList':
            return `<ul>${(node.content || []).map(n => nodeToHtml(n)).join('')}</ul>`;

        case 'orderedList':
            return `<ol>${(node.content || []).map(n => nodeToHtml(n)).join('')}</ol>`;

        case 'listItem':
            return `<li>${(node.content || []).map(n => nodeToHtml(n)).join('')}</li>`;

        case 'blockquote':
            return `<blockquote>${(node.content || []).map(n => nodeToHtml(n)).join('')}</blockquote>`;

        case 'horizontalRule':
            return '<hr>';

        case 'signature': {
            const label = node.attrs?.label || 'Signature';
            return `<div style="border-bottom: 1px solid #000; width: 250px; height: 60px; margin: 20px 0;"><span style="font-size: 9px; color: #999;">${escapeHtml(label)}</span></div>`;
        }

        default:
            // Unknown node type — render children if any
            if (node.content) {
                return (node.content || []).map(n => nodeToHtml(n)).join('');
            }
            return '';
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Wrap HTML content in a full page document with styles ---
function wrapInDocument(bodyHtml) {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        @page { size: A4; margin: 15mm; }
        body {
            font-family: 'Arial', sans-serif;
            font-size: 11pt;
            color: #000;
            line-height: 1.5;
            margin: 0;
            padding: 25px;
        }
        p { margin: 0 0 4px 0; }
        h1 { font-size: 13pt; margin: 8px 0; }
        h2 { font-size: 12pt; margin: 6px 0; }
        h3 { font-size: 11pt; margin: 4px 0; }
        h4 { font-size: 11pt; margin: 4px 0; }
        a { color: #000; text-decoration: underline; }
        img { max-width: 100%; }
        .letterhead img { width: 120px; }
        ul, ol { margin: 4px 0 4px 20px; padding-left: 10px; }
        li { margin: 2px 0; }
        li p { margin: 0; }
        .page-break { page-break-before: always; }
        .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            font-size: 7pt;
            text-align: center;
            color: #555;
            padding: 5px 15mm;
            border-top: 1px solid #ddd;
            background: #fff;
            line-height: 1.3;
        }
    </style>
</head>
<body>
    ${bodyHtml}
    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. A list of directors is available at our registered office. We are authorised and regulated by the Solicitors Regulation Authority.
    </div>
</body>
</html>`;
}

// ============================================================================
// MAIN EXPORT: Generate cover letter for a case
// ============================================================================
export async function generateCoverLetterFromTemplate(caseId, pool, s3Client) {
    console.log(`[CoverLetter] Generating cover letter for case ${caseId}...`);

    // 1. Fetch case + contact data from DB
    const caseRes = await pool.query(
        `SELECT c.*, con.first_name, con.last_name, con.email, con.phone,
                con.address_line_1, con.address_line_2, con.city, con.state_county,
                con.postal_code, con.dob, con.id AS contact_id, con.created_at AS contact_created_at
         FROM cases c
         JOIN contacts con ON c.contact_id = con.id
         WHERE c.id = $1`,
        [caseId]
    );

    if (caseRes.rows.length === 0) {
        throw new Error(`Case ${caseId} not found`);
    }

    const record = caseRes.rows[0];
    const contact = {
        id: record.contact_id,
        first_name: record.first_name,
        last_name: record.last_name,
        email: record.email,
        phone: record.phone,
        address_line_1: record.address_line_1,
        address_line_2: record.address_line_2,
        city: record.city,
        state_county: record.state_county,
        postal_code: record.postal_code,
        dob: record.dob,
        created_at: record.contact_created_at,
    };
    const caseData = {
        id: record.id,
        lender: record.lender,
        claim_value: record.claim_value,
    };

    // 2. Look up lender address + email
    const lenderAddress = getLenderAddress(caseData.lender);
    const lenderEmail = getLenderEmail(caseData.lender);

    // 3. Load template
    const template = loadCoverLetterTemplate();
    if (!template) {
        throw new Error('No cover letter template found in templates-store.json');
    }

    // 4. Parse template content
    let tiptapDoc;
    try {
        const parsed = JSON.parse(template.content);
        // Use __pages if available (multi-page template), otherwise the doc itself
        if (parsed.__pages && Array.isArray(parsed.__pages) && parsed.__pages.length > 0) {
            // Merge all pages into a single document for HTML conversion
            const allNodes = [];
            parsed.__pages.forEach((page, index) => {
                if (index > 0) {
                    // Insert page break between pages
                    allNodes.push({ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: ' ' }] });
                    allNodes.push({ type: 'horizontalRule' }); // visual separator
                }
                if (page.content) {
                    allNodes.push(...page.content);
                }
            });
            tiptapDoc = { type: 'doc', content: allNodes };
        } else {
            tiptapDoc = parsed;
        }
    } catch (e) {
        throw new Error(`Failed to parse template content: ${e.message}`);
    }

    // 5. Build variable map and resolve
    const variableMap = buildVariableMap(contact, caseData, lenderAddress, lenderEmail);
    const resolvedDoc = resolveVariables(JSON.parse(JSON.stringify(tiptapDoc)), variableMap);

    // 6. Convert to HTML
    const bodyHtml = tiptapJsonToHtml(resolvedDoc);
    const fullHtml = wrapInDocument(bodyHtml);

    // 7. Generate PDF via Puppeteer
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '30mm', left: '15mm' }
    });
    await browser.close();

    // 8. Upload to S3 (same naming convention as worker.js)
    const bucketName = process.env.S3_BUCKET_NAME;
    const folderName = `${record.first_name}_${record.last_name}_${record.contact_id}`;
    const refSpec = `${record.contact_id}${record.id}`;
    const sanitizedLenderName = (caseData.lender || 'Unknown').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const coverLetterFileName = `${refSpec} - ${record.first_name} ${record.last_name} - ${sanitizedLenderName} - COVER LETTER.pdf`;
    const coverLetterKey = `${folderName}/Lenders/${sanitizedLenderName}/${coverLetterFileName}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: coverLetterKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
    }));

    const coverLetterUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: coverLetterKey }),
        { expiresIn: 604800 }
    );

    // 9. Insert/update document record in DB
    const existingDoc = await pool.query(
        'SELECT id FROM documents WHERE contact_id = $1 AND name = $2 LIMIT 1',
        [record.contact_id, coverLetterFileName]
    );

    if (existingDoc.rows.length === 0) {
        await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [record.contact_id, coverLetterFileName, 'pdf', 'Cover Letter', coverLetterUrl, 'Auto-generated', ['Cover Letter', caseData.lender]]
        );
    } else {
        await pool.query('UPDATE documents SET url = $1 WHERE id = $2', [coverLetterUrl, existingDoc.rows[0].id]);
    }

    // 10. Log the action
    try {
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                record.contact_id,
                'system',
                'coverletter',
                'Cover Letter Generator',
                'cover_letter_generated',
                'case',
                `Cover letter generated from template for ${caseData.lender}`,
                JSON.stringify({
                    caseId,
                    lender: caseData.lender,
                    templateId: template.id,
                    templateName: template.name,
                    s3Key: coverLetterKey,
                    fileName: coverLetterFileName,
                })
            ]
        );
    } catch (logErr) {
        console.warn('[CoverLetter] Could not log action:', logErr.message);
    }

    // 11. Update case status to "LOA Signed"
    try {
        const updateRes = await pool.query('UPDATE cases SET status = $1 WHERE id = $2 RETURNING id, status', ['LOA Signed', caseId]);
        if (updateRes.rowCount > 0) {
            console.log(`[CoverLetter] Case ${caseId} status updated to "LOA Signed"`);
        } else {
            console.warn(`[CoverLetter] WARNING: Case ${caseId} status NOT updated (0 rows affected)`);
        }
    } catch (statusErr) {
        console.error(`[CoverLetter] ERROR updating status for case ${caseId}:`, statusErr.message);
    }

    console.log(`[CoverLetter] Cover letter generated and uploaded to S3: ${coverLetterKey}`);

    return {
        success: true,
        fileName: coverLetterFileName,
        s3Key: coverLetterKey,
        url: coverLetterUrl,
    };
}

// ============================================================================
// STANDALONE EXECUTION: Run directly with `node coverletter.js <caseId>`
// ============================================================================
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('coverletter.js') ||
    process.argv[1].endsWith('coverletter')
);

if (isMainModule) {
    const caseIdArg = process.argv[2] ? parseInt(process.argv[2]) : null;
    const POLL_INTERVAL = 600_000; // 10 minutes

    // Load env vars (when run standalone, dotenv hasn't been called yet)
    const dotenv = await import('dotenv');
    dotenv.config();

    // Create DB pool and S3 client
    const pg = await import('pg');
    const { S3Client } = await import('@aws-sdk/client-s3');

    const pool = new pg.default.Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: { require: true, rejectUnauthorized: false },
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        max: 5
    });

    const s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
    });

    // Process all "LOA Uploaded" cases once
    async function processAllLoaUploaded() {
        const casesRes = await pool.query(
            `SELECT id, lender FROM cases WHERE status = 'LOA Uploaded' ORDER BY id`
        );

        if (casesRes.rows.length === 0) {
            return { success: 0, failed: 0, total: 0 };
        }

        console.log(`[CoverLetter] Found ${casesRes.rows.length} case(s) with status "LOA Uploaded".`);
        let success = 0;
        let failed = 0;

        for (const row of casesRes.rows) {
            try {
                const result = await generateCoverLetterFromTemplate(row.id, pool, s3Client);
                console.log(`  ✅ Case ${row.id} (${row.lender}): ${result.fileName} → LOA Signed`);
                success++;
            } catch (err) {
                console.error(`  ❌ Case ${row.id} (${row.lender}): ${err.message}`);
                failed++;
            }
        }

        return { success, failed, total: casesRes.rows.length };
    }

    if (caseIdArg && !isNaN(caseIdArg)) {
        // Single case mode — process one case and exit
        try {
            console.log(`\n[CoverLetter] Processing single case ${caseIdArg}...\n`);
            const result = await generateCoverLetterFromTemplate(caseIdArg, pool, s3Client);
            console.log('\nResult:', JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('\nFailed:', err.message);
        } finally {
            await pool.end();
            process.exit(0);
        }
    } else {
        // Loop mode — poll every 60 seconds for "LOA Uploaded" cases
        console.log(`\n[CoverLetter] Starting continuous polling (every ${POLL_INTERVAL / 1000}s)...`);
        console.log('[CoverLetter] Press Ctrl+C to stop.\n');

        // Run immediately on start
        try {
            const result = await processAllLoaUploaded();
            if (result.total > 0) {
                console.log(`[CoverLetter] Batch done: ${result.success} succeeded, ${result.failed} failed.\n`);
            } else {
                console.log(`[CoverLetter] No "LOA Uploaded" cases found. Waiting...\n`);
            }
        } catch (err) {
            console.error(`[CoverLetter] Error in batch:`, err.message);
        }

        // Then poll every 60 seconds
        setInterval(async () => {
            try {
                const result = await processAllLoaUploaded();
                if (result.total > 0) {
                    console.log(`[CoverLetter] Batch done: ${result.success} succeeded, ${result.failed} failed.\n`);
                }
            } catch (err) {
                console.error(`[CoverLetter] Error in batch:`, err.message);
            }
        }, POLL_INTERVAL);
    }
}
