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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        ctx.fillStyle = '#64748b'; // Slightly darker slate for visibility
        ctx.font = 'bold 14px Arial'; // Increased size and bold
        ctx.textAlign = 'center';
        ctx.fillText(`Signed At: ${timestamp}`, width / 2, height - 10);

        return canvas.toBuffer('image/png');
    } catch (error) {
        console.error("Error adding timestamp to signature:", error);
        return Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    }
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
        .logo-cell { width: 200px; vertical-align: middle; text-align: left; }
        .contact-cell { vertical-align: middle; text-align: right; font-size: 10px; line-height: 1.4; color: #000; font-weight: bold; }
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
                Email: Info@fastactionclaims.co.uk<br>
                Tel: 0161 533 1706<br>
                Address: 1.03, Boat Shed, 12 Exchange Quay,<br>
                Salford, M5 3EQ
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
                    Signature Date:
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
                   cnt.signature_2_url
            FROM cases c
            JOIN contacts cnt ON c.contact_id = cnt.id
            WHERE (c.status = 'LENDER SELECTION FORM COMPLETED' OR c.status = 'New Lead')
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
