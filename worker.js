import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load lender details for cover letter generation
// Replace NaN with null since NaN is not valid JSON
const lendersJsonContent = fs.readFileSync(path.join(__dirname, 'all_lenders_details.json'), 'utf-8');
const allLendersData = JSON.parse(lendersJsonContent.replace(/:\s*NaN/g, ': null'));

// ============================================================================
// EMAIL MODE CONFIGURATION - COMMENT/UNCOMMENT TO SWITCH
// ============================================================================

// -------- DRAFT MODE: Set to true to SKIP sending emails (for review) --------
const EMAIL_DRAFT_MODE = true; // Set to false when ready to send emails
// -------- END DRAFT MODE --------

// -------- TEST MODE: Uncomment lines below to redirect to test email --------
// const LENDER_EMAIL_TEST_MODE = true;
// const TEST_EMAIL_ADDRESS = 'tezanyaniw@gmail.com';
// -------- END TEST MODE --------

// -------- PRODUCTION MODE: Keep this for production --------
const LENDER_EMAIL_TEST_MODE = false;
// -------- END PRODUCTION MODE --------

// ============================================================================

// --- EMAIL CONFIGURATION FOR LENDER DOCUMENTS (DSAR) ---
const lenderEmailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'DSAR@fastactionclaims.co.uk',
        pass: 'B$678397151113aq'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// Verify email configuration on startup
lenderEmailTransporter.verify((error, success) => {
    if (error) {
        console.error('[Worker] ❌ Email configuration error:', error);
    } else {
        console.log('[Worker] ✅ Email transporter ready for sending documents to lenders');
    }
});

// --- CONFIGURATION ---
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'crm-documents-bucket';

// --- DATABASE & S3 CLIENTS ---
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// --- HELPER FUNCTION: Add Timestamp to Signature ---
async function addTimestampToSignature(base64Data) {
    if (!base64Data) return null;
    try {
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const originalImage = await loadImage(imageBuffer);

        // Calculate new canvas dimensions
        // We add a small amount of padding and space for the timestamp if desired
        // But the user wants the main date in HTML. We'll keep a small certified timestamp at the bottom.
        const padding = 10;
        const timestampHeight = 35; // Increased for larger font
        const width = originalImage.width;
        const height = originalImage.height + timestampHeight;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, width, height);

        // Draw original signature
        ctx.drawImage(originalImage, 0, 0);

        // Add small, professional certified timestamp at the very bottom
        const now = new Date();
        const timestamp = now.toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });

        ctx.fillStyle = '#000000'; // Black color for visibility
        ctx.font = 'bold 14px Arial'; // Bold
        ctx.textAlign = 'left';
        ctx.fillText(`Signed At: ${timestamp}`, 10, height - 10);

        return canvas.toBuffer('image/png');
    } catch (error) {
        console.error("Error adding timestamp to signature:", error);
        return Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    }
}

// --- HELPER FUNCTION: LOOKUP LENDER ADDRESS ---
function getLenderAddress(lenderName) {
    if (!lenderName) return null;

    // Normalize the lender name for comparison
    const normalizedInput = lenderName.toUpperCase().trim();

    // Try exact match first
    let lenderData = allLendersData.find(l => l.lender?.toUpperCase() === normalizedInput);

    // If no exact match, try partial match
    if (!lenderData) {
        lenderData = allLendersData.find(l => {
            const lenderUpper = l.lender?.toUpperCase() || '';
            return lenderUpper.includes(normalizedInput) || normalizedInput.includes(lenderUpper);
        });
    }

    if (!lenderData || !lenderData.address) {
        return null;
    }

    const addr = lenderData.address;
    return {
        company_name: addr.company_name && addr.company_name !== 'NaN' ? addr.company_name : '',
        first_line_address: addr.first_line_address && addr.first_line_address !== 'NaN' ? addr.first_line_address : '',
        town_city: addr.town_city && addr.town_city !== 'NaN' ? addr.town_city : '',
        postcode: addr.postcode && addr.postcode !== 'NaN' ? addr.postcode : ''
    };
}

// --- HELPER FUNCTION: LOOKUP LENDER EMAIL ---
function getLenderEmail(lenderName) {
    if (!lenderName) return null;

    // Normalize the lender name for comparison
    const normalizedInput = lenderName.toUpperCase().trim();

    // Try exact match first
    let lenderData = allLendersData.find(l => l.lender?.toUpperCase() === normalizedInput);

    // If no exact match, try partial match
    if (!lenderData) {
        lenderData = allLendersData.find(l => {
            const lenderUpper = l.lender?.toUpperCase() || '';
            return lenderUpper.includes(normalizedInput) || normalizedInput.includes(lenderUpper);
        });
    }

    if (!lenderData || !lenderData.email) {
        return null;
    }

    // Clean the email (trim whitespace, handle special cases)
    const email = lenderData.email.trim();

    // Skip invalid emails
    if (!email || email === 'NaN' || email.toLowerCase().includes('send via post') || email.toLowerCase().includes('needs sending via post')) {
        return null;
    }

    return email;
}

// --- HELPER FUNCTION: FETCH PDF BUFFER FROM S3 ---
async function fetchPdfFromS3(s3Key) {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
        });
        const response = await s3Client.send(command);

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error(`[Worker] Error fetching PDF from S3 (${s3Key}):`, error.message);
        return null;
    }
}

// --- HELPER FUNCTION: GATHER ALL DOCUMENTS FOR A CASE ---
async function gatherDocumentsForCase(contactId, lenderName, folderName) {
    const documents = {
        loa: null,
        coverLetter: null,
        previousAddress: null,
        idDocument: null
    };

    const sanitizedLenderName = lenderName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

    // 1. LOA PDF
    const loaKey = `${folderName}/LOA/${sanitizedLenderName}_LOA.pdf`;
    documents.loa = await fetchPdfFromS3(loaKey);
    if (documents.loa) {
        console.log(`[Worker] ✅ Found LOA for ${lenderName}`);
    }

    // 2. Cover Letter PDF
    const coverLetterKey = `${folderName}/LOA/${sanitizedLenderName}_Cover_Letter.pdf`;
    documents.coverLetter = await fetchPdfFromS3(coverLetterKey);
    if (documents.coverLetter) {
        console.log(`[Worker] ✅ Found Cover Letter for ${lenderName}`);
    }

    // 3. Previous Address PDF - check documents table
    try {
        const prevAddrQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND (category = 'Client' OR tags @> '{"Previous Address"}')
             AND name LIKE 'Previous_Addresses%'
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId]
        );

        if (prevAddrQuery.rows.length > 0) {
            const prevAddrFileName = prevAddrQuery.rows[0].name;
            const prevAddrKey = `${folderName}/Documents/${prevAddrFileName}`;
            documents.previousAddress = await fetchPdfFromS3(prevAddrKey);
            if (documents.previousAddress) {
                console.log(`[Worker] ✅ Found Previous Address PDF`);
            }
        }
    } catch (err) {
        console.warn('[Worker] Could not fetch previous address document:', err.message);
    }

    // 4. ID Document (3rd page document) - check documents table for uploaded ID
    try {
        const idDocQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'Client'
             AND (
                 LOWER(name) LIKE '%id%' OR
                 LOWER(name) LIKE '%passport%' OR
                 LOWER(name) LIKE '%license%' OR
                 LOWER(name) LIKE '%licence%' OR
                 LOWER(name) LIKE '%driving%' OR
                 LOWER(name) LIKE '%identity%'
             )
             AND type IN ('pdf', 'png', 'jpg', 'jpeg')
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId]
        );

        if (idDocQuery.rows.length > 0) {
            const idDocFileName = idDocQuery.rows[0].name;
            const idDocKey = `${folderName}/Documents/${idDocFileName}`;
            documents.idDocument = await fetchPdfFromS3(idDocKey);
            if (documents.idDocument) {
                console.log(`[Worker] ✅ Found ID Document: ${idDocFileName}`);
            }
        }
    } catch (err) {
        console.warn('[Worker] Could not fetch ID document:', err.message);
    }

    return documents;
}

// --- HELPER FUNCTION: SEND DOCUMENTS TO LENDER ---
async function sendDocumentsToLender(lenderName, clientName, contactId, folderName, caseId) {
    console.log(`[Worker] Preparing to send documents to lender: ${lenderName}`);

    // Get lender email
    let lenderEmail = getLenderEmail(lenderName);

    // Use test email in test mode
    if (LENDER_EMAIL_TEST_MODE) {
        console.log(`[Worker] TEST MODE: Redirecting email from ${lenderEmail || 'no email'} to ${TEST_EMAIL_ADDRESS}`);
        lenderEmail = TEST_EMAIL_ADDRESS;
    }

    if (!lenderEmail) {
        console.log(`[Worker] ⚠️ No email found for lender: ${lenderName}. Skipping email send.`);
        return { success: false, reason: 'no_email' };
    }

    // Gather all available documents
    const documents = await gatherDocumentsForCase(contactId, lenderName, folderName);

    // Must have at least LOA and Cover Letter
    if (!documents.loa || !documents.coverLetter) {
        console.log(`[Worker] ⚠️ Missing required documents (LOA or Cover Letter). Skipping email.`);
        return { success: false, reason: 'missing_required_docs' };
    }

    // Build attachments array
    const attachments = [];
    const sanitizedLenderName = lenderName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

    // Always include LOA and Cover Letter
    attachments.push({
        filename: `${sanitizedLenderName}_LOA.pdf`,
        content: documents.loa,
        contentType: 'application/pdf'
    });

    attachments.push({
        filename: `${sanitizedLenderName}_Cover_Letter.pdf`,
        content: documents.coverLetter,
        contentType: 'application/pdf'
    });

    // Add Previous Address if available
    if (documents.previousAddress) {
        attachments.push({
            filename: `Previous_Addresses.pdf`,
            content: documents.previousAddress,
            contentType: 'application/pdf'
        });
    }

    // Add ID Document if available
    if (documents.idDocument) {
        attachments.push({
            filename: `ID_Document.pdf`,
            content: documents.idDocument,
            contentType: 'application/pdf'
        });
    }

    // Compose email with new format
    const mailOptions = {
        from: '"DSAR Team - Fast Action Claims" <DSAR@fastactionclaims.co.uk>',
        to: lenderEmail,
        subject: `RE: ${lenderName} DSAR, FULL NAME OF CLIENT: ${clientName}, OUR REFERENCE: ${caseId}`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; }
            </style>
        </head>
        <body>
            <p>Email: <a href="mailto:dsar@fastactionclaims.co.uk">Dsar@fastactionclaims.co.uk</a><br>
            Contact no: 0161 533 1706<br>
            Address: 1.03, Boat Shed, 12 Exchange Quay, Salford, M5 3EQ<br>
            Client id: ${caseId}</p>

            <p>Dear Sirs,</p>

            <p><strong>Data Subject Access Request (DSAR)</strong></p>

            <p>We refer to the above matter.</p>

            <p>Please find attached our DSAR and our client's signed Letter of Authority.</p>

            <p>We would be grateful if you could provide us with the requested information.</p>

            <p>We look forward to hearing from you.</p>

            <p><strong>DSAR Team</strong><br>
            <strong>Fast Action Claims</strong><br>
            T: 0161 533 1706<br>
            E: <a href="mailto:dsar@fastactionclaims.co.uk">dsar@fastactionclaims.co.uk</a><br>
            A: 1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>

            <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">

            <p style="font-size: 11px; color: #666;">
            THIS EMAIL AND ANY FILES TRANSMITTED WITH IT IS/ARE CONFIDENTIAL AND LEGALLY PRIVILEGED. Accordingly any dissemination, distribution, copying of other use of this message or any of its content by any person other than the intended Recipient may constitute a breach of civil and/or criminal law and is strictly prohibited. If you are not the Intended Recipient, please notify us as soon as possible and remove it from your system. This e-mail is sent on behalf of Fast Action Claims and no other person. Email transmission cannot be guaranteed to be secure or error free as information could arrive late or incomplete, or contain viruses. We therefore accept no liability for any errors or omissions in the contents of this message which arise as a result of email transmission. If verification is required please request a hard copy version signed by or on behalf of Fast Action Claims. Copyright in this email and any documents created by Fast Action Claims will be and remain vested in Fast Action Claims. We assert the right to be identified as the author of, and to object to the misuse of, this email and such documents. Fast Action Claims is a trading name of Rowan Rose Limited, a limited company registered in England under number 12916452. Authorised and Regulated by the Solicitors Regulation Authority under number 8000843.
            </p>
        </body>
        </html>
        `,
        attachments: attachments
    };

    // DRAFT MODE: Skip sending if enabled
    if (EMAIL_DRAFT_MODE) {
        console.log(`[Worker] 📝 DRAFT MODE: Email NOT sent to ${lenderName} (${lenderEmail})`);
        console.log(`[Worker] 📝 Subject: ${mailOptions.subject}`);
        console.log(`[Worker] 📝 Attachments: ${attachments.map(a => a.filename).join(', ')}`);

        // Log as draft in action_logs
        try {
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    contactId,
                    'system',
                    'worker',
                    'LOA Worker',
                    'lender_email_draft',
                    'case',
                    `DSAR email DRAFT created for ${lenderName} (${lenderEmail}) - NOT SENT`,
                    JSON.stringify({
                        lender: lenderName,
                        lenderEmail: lenderEmail,
                        caseId: caseId,
                        attachments: attachments.map(a => a.filename),
                        draftMode: true,
                        subject: mailOptions.subject
                    })
                ]
            );
        } catch (logErr) {
            console.warn('[Worker] Could not log draft action:', logErr.message);
        }

        return { success: true, draft: true, email: lenderEmail };
    }

    try {
        const info = await lenderEmailTransporter.sendMail(mailOptions);
        console.log(`[Worker] ✅ Email sent to lender ${lenderName} (${lenderEmail}). MessageId: ${info.messageId}`);

        // Log the email send to action_logs
        try {
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    contactId,
                    'system',
                    'worker',
                    'LOA Worker',
                    'lender_email_sent',
                    'case',
                    `DSAR documents emailed to ${lenderName} (${lenderEmail})`,
                    JSON.stringify({
                        lender: lenderName,
                        lenderEmail: lenderEmail,
                        caseId: caseId,
                        attachments: attachments.map(a => a.filename),
                        messageId: info.messageId,
                        testMode: LENDER_EMAIL_TEST_MODE
                    })
                ]
            );
        } catch (logErr) {
            console.warn('[Worker] Could not log email send action:', logErr.message);
        }

        return { success: true, messageId: info.messageId, email: lenderEmail };
    } catch (error) {
        console.error(`[Worker] ❌ Failed to send email to ${lenderName}:`, error.message);
        return { success: false, reason: 'send_failed', error: error.message };
    }
}

// --- HELPER FUNCTION: GENERATE COVER LETTER HTML ---
async function generateCoverLetterHTML(contact, lender, caseId, logoBase64) {
    const { first_name, last_name } = contact;
    const fullName = `${first_name} ${last_name}`;

    // Get today's date
    const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    // Get lender address
    const lenderAddress = getLenderAddress(lender);
    const addressLine1 = lenderAddress?.company_name || lender;
    const addressLine2 = lenderAddress?.first_line_address || '';
    const addressLine3 = lenderAddress?.town_city || '';
    const addressLine4 = lenderAddress?.postcode || '';

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            font-size: 11pt;
            color: #000;
            line-height: 1.5;
            margin: 0;
            padding: 25px;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
        }
        .logo-cell {
            width: 40%;
            vertical-align: top;
            text-align: left;
        }
        .company-cell {
            width: 60%;
            vertical-align: top;
            text-align: right;
            font-size: 10pt;
            line-height: 1.6;
        }
        .logo-img {
            width: 160px;
            height: auto;
        }
        .date-line {
            margin: 25px 0 20px 0;
            font-size: 11pt;
        }
        .address-block {
            margin-bottom: 20px;
            font-size: 11pt;
            line-height: 1.6;
        }
        .reference-block {
            margin-bottom: 20px;
            font-size: 11pt;
            line-height: 1.8;
        }
        .subject-line {
            font-weight: bold;
            margin-bottom: 20px;
            font-size: 11pt;
        }
        .greeting {
            margin-bottom: 15px;
        }
        .body-text {
            text-align: justify;
            margin-bottom: 12px;
            font-size: 11pt;
            line-height: 1.6;
        }
        .body-text p {
            margin-bottom: 12px;
        }
        .bullet-list {
            margin: 15px 0 15px 25px;
            padding-left: 0;
        }
        .bullet-list li {
            margin-bottom: 8px;
            font-size: 11pt;
            line-height: 1.5;
        }
        .signature-block {
            margin-top: 25px;
            font-size: 11pt;
            line-height: 1.6;
        }
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
        .page-content {
            padding-bottom: 60px;
        }
    </style>
</head>
<body>
    <div class="page-content">
        <table class="header-table">
            <tr>
                <td class="logo-cell">
                    ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : '<div style="font-size: 18px; font-weight: bold; color: #b45f06;">FAST ACTION CLAIMS</div>'}
                </td>
                <td class="company-cell">
                    <strong>Fast Action Claims</strong><br>
                    Tel: 0161 5331706<br>
                    1.03 The Boat Shed<br>
                    12 Exchange Quay<br>
                    Salford, M5 3EQ<br>
                    irl@rowanrose.co.uk
                </td>
            </tr>
        </table>

        <div class="date-line">
            <strong>Date:</strong> ${today}
        </div>

        <div class="address-block">
            ${addressLine1 ? `${addressLine1}<br>` : ''}
            ${addressLine2 ? `${addressLine2}<br>` : ''}
            ${addressLine3 ? `${addressLine3}<br>` : ''}
            ${addressLine4 ? `${addressLine4}` : ''}
        </div>

        <div class="reference-block">
            <strong>Our Reference:</strong> ${caseId}<br>
            <strong>Client Name:</strong> ${fullName}<br>
            <strong>Lender:</strong> ${lender}
        </div>

        <div class="subject-line">
            Subject: Request for Disclosure of Client Information – Data Subject Access Request
        </div>

        <div class="greeting">
            Dear Sir/Madam,
        </div>

        <div class="body-text">
            <p>We act on behalf of the above-named client.</p>

            <p>We formally request that your organisation promptly disclose and release to Fast Action Claims all documentation and information relating to our client's financial arrangements with your institution. This includes, but is not limited to, all data and records regarding loans, credit cards, borrowing, and account activity.</p>

            <p>Specifically, we require a complete file containing:</p>
        </div>

        <ul class="bullet-list">
            <li>True copies of all completed application forms</li>
            <li>All pre-contractual information and documentation provided</li>
            <li>Executed copies of credit or loan agreements</li>
            <li>Full statements of account, detailing all payments made, interest charged, fees incurred, and any outstanding balances</li>
            <li>Records of any affordability assessments or creditworthiness checks conducted</li>
            <li>Copies of all correspondence between your organisation and our client</li>
        </ul>

        <div class="body-text" style="page-break-before: always;">
            <p>This request is made under the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. We remind you that you are obligated to respond to this request within one calendar month from the date of receipt.</p>

            <p>Please forward all requested information directly to our office at the address shown above, or via email to irl@rowanrose.co.uk.</p>

            <p>Should you require verification of our authority to act on behalf of our client, please find enclosed the signed Letter of Authority.</p>

            <p>We look forward to your prompt response.</p>
        </div>

        <div class="signature-block">
            <p>Yours faithfully,</p>
            <br>
            <p><strong>Fast Action Claims</strong><br>
            On behalf of ${fullName}</p>
        </div>
    </div>

    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. A list of directors is available at our registered office. We are authorised and regulated by the Solicitors Regulation Authority.
    </div>
</body>
</html>
    `;
}

// --- HELPER FUNCTION: GENERATE LOA HTML CONTENT ---
async function generateLOAHTML(contact, lender, logoBase64, signatureBase64) {
    const {
        first_name,
        last_name,
        address_line_1,
        address_line_2,
        city,
        state_county,
        postal_code,
        dob
    } = contact;

    const fullName = `${first_name} ${last_name}`;
    const streetAddress = [address_line_1, address_line_2].filter(Boolean).join(', ');
    const finalCity = city || '';
    const finalState = state_county || '';

    // Format DOB
    let formattedDOB = '';
    if (dob) {
        try {
            const dobDate = new Date(dob);
            if (!isNaN(dobDate.getTime())) {
                formattedDOB = dobDate.toLocaleDateString('en-GB');
            } else {
                formattedDOB = dob;
            }
        } catch (e) {
            formattedDOB = dob;
        }
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; line-height: 1.4; margin: 0; padding: 25px; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .logo-cell { width: 30%; vertical-align: middle; text-align: left; padding-right: 20px; }
        .contact-cell { width: 70%; vertical-align: middle; text-align: right; font-size: 10px; line-height: 1.6; color: #000; font-weight: bold; padding-right: 0; }
        .logo-img { width: 160px; height: auto; }
        
        .h1-container { text-align: center; margin: 25px 0; }
        h1 { font-size: 18px; font-weight: bold; text-decoration: underline; text-transform: uppercase; margin: 0; }
        
        .lender-section { text-align: left; font-size: 12px; margin-bottom: 20px; text-decoration: none; }

        .client-box { width: 100%; margin-bottom: 20px; }
        .client-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
        .client-table td { padding: 8px 12px; border: 1px solid #000; vertical-align: top; font-size: 12px; color: #000; }
        .client-table td.label { font-weight: bold; width: 150px; background-color: #f2f2f2; font-size: 12px; }

        .legal-text { font-size: 9px; text-align: justify; margin-bottom: 20px; color: #000; line-height: 1.5; }
        .legal-text p { margin-bottom: 10px; }

        .signature-section { width: 100%; border: 2px solid #000; padding: 15px; margin-top: 20px; box-sizing: border-box; }
        .sign-table { width: 100%; border-collapse: collapse; }
        .sign-table td { vertical-align: middle; }
        .signature-img { max-height: 80px; max-width: 300px; display: block; margin: 0 auto; }
        
        .footer { font-size: 8px; text-align: center; color: #444; margin-top: 40px; padding-top: 15px; border-top: 1px solid #999; line-height: 1.3; }
    </style>
</head>
<body>

    <table class="header-table">
        <tr>
            <td class="logo-cell">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : '<div style="font-size: 20px; font-weight: bold; color: #b45f06;">FAST ACTION CLAIMS</div>'}
            </td>
            <td class="contact-cell">
                <strong>Fast Action Claims</strong><br>
                Tel: 0161 5331706<br>
                Address: 1.03 The boat shed<br>
                12 Exchange Quay<br>
                Salford<br>
                M5 3EQ<br>
                irl@rowanrose.co.uk
            </td>
        </tr>
    </table>

    <div class="h1-container">
        <h1>LETTER OF AUTHORITY</h1>
    </div>

    <div class="lender-section">
        IN RESPECT OF: <strong>${lender}</strong>
    </div>

    <div class="client-box">
        <table class="client-table">
            <tr>
                <td class="label">Full Name:</td>
                <td><strong>${fullName}</strong></td>
            </tr>
            <tr>
                <td class="label">Address:</td>
                <td>
                    <strong>
                    ${streetAddress}<br>
                    ${finalCity}, ${finalState}
                    </strong>
                </td>
            </tr>
            <tr>
                <td class="label">Postal Code:</td>
                <td><strong>${postal_code || ''}</strong></td>
            </tr>
            <tr>
                <td class="label">Date of Birth:</td>
                <td><strong>${formattedDOB}</strong></td>
            </tr>
            <tr>
                <td class="label">Previous Address:</td>
                <td></td>
            </tr>
        </table>
    </div>

    <div class="legal-text">
        <p><strong>I/We hereby Authorise and instruct:</strong> You (The Bank/Door Step Lender/Building Society/Card Provider/Finance Provider/Loan Broker/Underwriter/Insurance Provider/Financial Advisor/Pension Provider/Catalogue Loans provider/Mortgage Broker/HMRC) to: -</p>

        <p>1. Liaise exclusively with Fast Action Claims in respect of all aspects of my/our potential complaint/claim for compensation as stated above.</p>

        <p>2. Immediately release to Fast Action Claims any information/documentation relating to all my/our loans/credit cards/overdrafts/Store Cards/Car Finance/Packaged Bank Account/ to include all Broker Commissions, Tax deductions which may be requested. This includes information in response to a request made under Sections 77-78 of the Consumer Credit Act 1974 and/or Section 45 of the Data Protection Act 2018 and Article 15 GDPR (General Data Protection Regulations).</p>

        <p>3. Contact Fast Action Claims whenever they need to send me/us information or contact me/us in connection with this matter.</p>

        <p>I/We authorise Fast Action Claims of 1.03, 12 Exchange Quay, Salford, M5 3EQ as my/our sole representatives to deal with my potential complaint/claim for compensation in relation to all loans/credit cards/car finance/overdrafts/Packaged Bank Accounts/Store Cards/Packaged Bank Account. I/We confirm that Fast Action Claims are instructed to pursue all aspects they consider necessary in relation to my/our dealings with your organisation. This letter of authority relates to ALL products and accounts I/We have or have had with you. I/We have read, understand and agree to Fast Action Claims' Terms and Conditions. I/We give them full authority, in accordance with the FCA's Dispute Resolution Guidelines, to act on my/our behalf as my/our to pursue all aspects they deem necessary in relation to all my/our financial affairs/tax affairs with the aforementioned Provider(s). I/We authorise you to accept any signatures on documents sent to you by Fast Action Claims which have been obtained electronically (e-signed). I/We confirm that in the event that you need to contact a third party to progress my/our case for any reason, I/we hereby give my/our authority and consent for the third party to provide Fast Action Claims with any information they request and may require to pursue my/our claim/complaint. I/We understand that, in addition to the present Letter of Authority I/We will need to provide further information when raising an expression of dissatisfaction to you (The Bank/Building Society/Card Provider/Finance Provider/Loan Broker/Underwriter/Insurance Provider/Financial Advisor/HMRC), about the underlying products), service(s) and where known, specific account number(s) being complained about. I hereby authorise Fast Action Claims to submit my claim for irresponsible lending.</p>
    </div>

    <div class="signature-section">
        <table class="sign-table">
            <tr>
                <td style="width: 40%; font-weight: bold; font-size: 13px; height: 80px; vertical-align: middle;">
                    <strong>SIGNATURE</strong>
                </td>
                <td style="width: 60%; text-align: center; vertical-align: middle;">
                    ${signatureBase64 ? `<img src="${signatureBase64}" class="signature-img" />` : '<span style="font-size: 12px;">Signed Electronically</span>'}
                </td>
            </tr>
        </table>
    </div>

    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Solicitors, authorised and regulated by the Solicitors Regulation Authority (SRA No. 8000843). Registered office: 1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. Rowan Rose Solicitors is a limited company registered in England and Wales (Company No. 12916452)
    </div>

</body>
</html>
    `;
}

// --- BACKGROUND WORKER LOGIC ---
const processPendingLOAs = async () => {
    console.log('[Worker] Checking for pending LOA generations...');
    try {
        // Query cases that need LOA generation
        // Join with contacts to get necessary details
        const query = `
            SELECT c.id as case_id, c.lender, c.created_at,
                   cnt.id as contact_id, cnt.first_name, cnt.last_name,
                   cnt.address_line_1, cnt.address_line_2, cnt.city, cnt.state_county, cnt.postal_code,
                   cnt.signature_2_url, cnt.dob
            FROM cases c
            JOIN contacts cnt ON c.contact_id = cnt.id
            WHERE (c.status = 'LENDER SELECTION FORM COMPLETED' OR c.status = 'New Lead' OR c.status = 'LOA Sent')
            AND (c.loa_generated IS NULL OR c.loa_generated = false)
            AND cnt.signature_2_url IS NOT NULL
            LIMIT 50
        `;
        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log('[Worker] No pending LOAs found.');
            return { count: 0, success: true };
        }

        console.log(`[Worker] Found ${rows.length} pending LOAs.`);

        // Helper to load logo
        let logoBase64 = null;
        try {
            const logoPath = path.join(__dirname, 'public', 'fac.png');
            if (fs.existsSync(logoPath)) {
                const logoBuffer = await fs.promises.readFile(logoPath);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        } catch (e) { console.warn('Logo load failed', e); }

        const results = [];

        for (const record of rows) {
            try {
                let signatureBase64 = null;
                if (record.signature_2_url) {
                    // Try to fetch image from S3 (via signed URL)
                    try {
                        const response = await fetch(record.signature_2_url);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            signatureBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
                        } else {
                            console.warn(`Failed to fetch signature for contact ${record.contact_id}: ${response.statusText}`);
                        }
                    } catch (e) {
                        console.warn(`Could not fetch signature for contact ${record.contact_id}`, e);
                    }
                }

                const contactData = {
                    first_name: record.first_name,
                    last_name: record.last_name,
                    address_line_1: record.address_line_1,
                    address_line_2: record.address_line_2,
                    city: record.city,
                    state_county: record.state_county,
                    postal_code: record.postal_code,
                    dob: record.dob,
                    id: record.contact_id
                };

                // Generate HTML
                const htmlContent = await generateLOAHTML(contactData, record.lender, logoBase64, signatureBase64);

                // Generate PDF using Puppeteer
                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                });
                const page = await browser.newPage();
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
                });
                await browser.close();

                // Upload S3
                const folderName = `${record.first_name}_${record.last_name}_${record.contact_id}`;
                const sanitizedLenderName = record.lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
                const pdfFileName = `${sanitizedLenderName}_LOA.pdf`;
                const pdfKey = `${folderName}/LOA/${pdfFileName}`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: pdfKey,
                    Body: pdfBuffer,
                    ContentType: 'application/pdf'
                }));

                const pdfUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: pdfKey }), { expiresIn: 604800 });

                // Update Documents Metadata
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [record.contact_id, pdfFileName, 'pdf', 'LOA', pdfUrl, 'Auto-generated', ['LOA', record.lender]]
                );

                // --- GENERATE COVER LETTER ---
                try {
                    const coverLetterHtml = await generateCoverLetterHTML(contactData, record.lender, record.case_id, logoBase64);

                    // Generate Cover Letter PDF using Puppeteer
                    const coverBrowser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                    });
                    const coverPage = await coverBrowser.newPage();
                    await coverPage.setContent(coverLetterHtml, { waitUntil: 'networkidle0' });
                    const coverPdfBuffer = await coverPage.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '15mm', right: '15mm', bottom: '30mm', left: '15mm' }
                    });
                    await coverBrowser.close();

                    // Upload Cover Letter to S3
                    const coverLetterFileName = `${sanitizedLenderName}_Cover_Letter.pdf`;
                    const coverLetterKey = `${folderName}/LOA/${coverLetterFileName}`;

                    await s3Client.send(new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: coverLetterKey,
                        Body: coverPdfBuffer,
                        ContentType: 'application/pdf'
                    }));

                    const coverLetterUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: coverLetterKey }), { expiresIn: 604800 });

                    // Insert Cover Letter Document Record
                    await pool.query(
                        `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [record.contact_id, coverLetterFileName, 'pdf', 'Cover Letter', coverLetterUrl, 'Auto-generated', ['Cover Letter', record.lender]]
                    );

                    console.log(`[Worker] ✅ Cover Letter Generated for Case ${record.case_id} (${record.lender})`);

                    // --- SEND DOCUMENTS TO LENDER VIA EMAIL ---
                    try {
                        const clientName = `${record.first_name} ${record.last_name}`;
                        const emailResult = await sendDocumentsToLender(
                            record.lender,
                            clientName,
                            record.contact_id,
                            folderName,
                            record.case_id
                        );

                        if (emailResult.success) {
                            console.log(`[Worker] ✅ Documents emailed to lender for Case ${record.case_id}`);
                        } else {
                            console.log(`[Worker] ⚠️ Email not sent for Case ${record.case_id}: ${emailResult.reason}`);
                        }
                    } catch (emailErr) {
                        console.error(`[Worker] ⚠️ Email sending failed for Case ${record.case_id}:`, emailErr.message);
                        // Continue even if email fails - documents were already generated
                    }

                } catch (coverLetterErr) {
                    console.error(`[Worker] ⚠️ Cover Letter generation failed for Case ${record.case_id}:`, coverLetterErr.message);
                    // Continue even if cover letter fails - LOA was already generated
                }

                // Update Case Status to prevent re-generation
                await pool.query('UPDATE cases SET loa_generated = true WHERE id = $1', [record.case_id]);

                console.log(`[Worker] ✅ LOA Generated for Case ${record.case_id} (${record.lender})`);
                results.push({ case_id: record.case_id, lender: record.lender, status: 'generated' });

            } catch (err) {
                console.error(`[Worker] ❌ Error processing case ${record.case_id}`, err);
                results.push({ case_id: record.case_id, lender: record.lender, status: 'error', error: err.message });
            }
        }
        return { count: rows.length, results };

    } catch (error) {
        console.error('Pending LOA Process Error:', error);
        // Do not throw, just log, so worker keeps running
    }
};

// --- RUNNER ---
console.log('Starting LOA Background Worker...');

// Run immediately on start
processPendingLOAs();

// Run every 60 seconds
setInterval(() => {
    processPendingLOAs();
}, 60000);
