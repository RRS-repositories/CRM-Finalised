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
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load lender details for cover letter generation
// Replace NaN with null since NaN is not valid JSON
const lendersJsonContent = fs.readFileSync(path.join(__dirname, 'all_lenders_details.json'), 'utf-8');
const allLendersData = JSON.parse(lendersJsonContent.replace(/:\s*NaN/g, ': null'));

// ============================================================================
// EMAIL MODE CONFIGURATION - COMMENT/UNCOMMENT TO SWITCH
// ============================================================================

// -------- DRAFT MODE: Set to true to CREATE DRAFTS in Outlook, false to SEND emails --------
const EMAIL_DRAFT_MODE = true; // Set to true to create drafts instead of sending
// -------- END DRAFT MODE --------

// -------- TEST MODE: Only used when DRAFT_MODE is false --------
const LENDER_EMAIL_TEST_MODE = true;
const TEST_EMAIL_ADDRESS = 'tezanyaniw@gmail.com';
// -------- END TEST MODE --------

// -------- PRODUCTION MODE: Keep this for production --------
// const LENDER_EMAIL_TEST_MODE = false;
// -------- END PRODUCTION MODE --------

// ============================================================================

// --- EMAIL CONFIGURATION FOR LENDER DOCUMENTS (DSAR) ---
// Nodemailer (kept for fallback if needed)
const lenderEmailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'DSAR@fastactionclaims.co.uk',
        pass: 'Farm54595459!!!'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// --- MICROSOFT GRAPH API CONFIGURATION FOR DRAFT CREATION ---
const DSAR_MAILBOX = 'DSAR@fastactionclaims.co.uk';
let graphClient = null;

// Initialize Microsoft Graph Client
try {
    const msalCredential = new ClientSecretCredential(
        process.env.MS_TENANT_ID,
        process.env.MS_CLIENT_ID,
        process.env.MS_CLIENT_SECRET
    );

    graphClient = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const token = await msalCredential.getToken('https://graph.microsoft.com/.default');
                return token.token;
            }
        }
    });

    console.log('[Worker] ✅ Microsoft Graph client initialized for draft creation');
} catch (error) {
    console.error('[Worker] ❌ Failed to initialize Microsoft Graph client:', error.message);
    console.error('[Worker] ⚠️ Draft email creation will not work. Falling back to nodemailer if DRAFT_MODE is disabled.');
}

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
    },
    connectionTimeoutMillis: 30000,  // 30 seconds for local dev
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

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// --- ENSURE DSAR COLUMNS EXIST (same migration as server.js) ---
(async () => {
    try {
        // Test connection first
        await pool.query('SELECT 1');
        console.log('[Worker] ✅ Database connection established');

        await pool.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_sent') THEN
                    ALTER TABLE cases ADD COLUMN dsar_sent BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_send_after') THEN
                    ALTER TABLE cases ADD COLUMN dsar_send_after TIMESTAMP;
                END IF;
            END $$;
        `);
        console.log('[Worker] ✅ DSAR columns verified/created in cases table');
    } catch (err) {
        console.error('[Worker] ❌ Failed to ensure DSAR columns:', err.message);
    }
})();

// --- HELPER FUNCTION: Add Timestamp to Signature ---
// Note: Timestamp is no longer added to the image itself, it's shown in the LOA HTML
async function addTimestampToSignature(base64Data) {
    if (!base64Data) return null;
    try {
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        // Return the image buffer without adding timestamp text
        return imageBuffer;
    } catch (error) {
        console.error("Error processing signature:", error);
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

// --- HELPER FUNCTION: GENERATE PREVIOUS ADDRESS PDF FOR DSAR ATTACHMENT ---
async function generatePreviousAddressPDFForDSAR(contact, addresses) {
    const fullName = `${contact.first_name} ${contact.last_name}`;
    const today = new Date().toLocaleDateString('en-GB');

    let logoBase64 = null;
    try {
        const logoPath = path.join(__dirname, 'public', 'fac.png');
        if (fs.existsSync(logoPath)) {
            const logoBuffer = await fs.promises.readFile(logoPath);
            logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }
    } catch (e) { /* ignore */ }

    let addressBlocksHtml = '';
    addresses.forEach((addr, index) => {
        addressBlocksHtml += `
        <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 10px;">PREVIOUS ADDRESS ${index + 1}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">Street Address:</span> ${[addr.address_line_1, addr.address_line_2].filter(Boolean).join(', ')}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">City / Town:</span> ${addr.city || ''}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">County / State:</span> ${addr.county || ''}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">Postal Code:</span> ${addr.postal_code || ''}</div>
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        `;
    });

    const htmlContent = `
<!DOCTYPE html>
<html><head><style>
    body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10pt; color: #333; line-height: 1.4; margin: 0; padding: 40px; }
</style></head>
<body>
    <table style="width: 100%; margin-bottom: 30px;">
        <tr>
            <td style="width: 30%; vertical-align: top;">
                ${logoBase64 ? `<img src="${logoBase64}" style="width: 150px; height: auto;" />` : ''}
                <div style="margin-top: 20px;">${today}</div>
            </td>
            <td style="width: 70%; text-align: right; font-size: 10pt; line-height: 1.5; vertical-align: top;">
                <strong>Fast Action Claims</strong><br>Tel: 0161 5331706<br>Address: 1.03 The boat shed<br>12 Exchange Quay<br>Salford<br>M5 3EQ<br>irl@rowanrose.co.uk
            </td>
        </tr>
    </table>
    <div style="margin-bottom: 30px; font-weight: bold;">
        Our Reference: ${contact.id}<br>Client Name: ${fullName}
    </div>
    <div style="font-weight: bold; text-decoration: underline; margin-bottom: 20px;">
        EXTRA INFORMATION PROVIDED BY OUR CLIENT
    </div>
    ${addressBlocksHtml}
    <div style="position: fixed; bottom: 40px; left: 40px; right: 40px; font-size: 8pt; text-align: center; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
        Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ.
    </div>
</body></html>`;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    await browser.close();
    return pdfBuffer;
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
async function gatherDocumentsForCase(contactId, lenderName, folderName, caseId, firstName, lastName) {
    const documents = {
        loa: null,
        coverLetter: null,
        previousAddress: null,
        idDocument: null
    };

    const refSpec = `x${contactId}${caseId}`;
    const sanitizedLenderName = lenderName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

    // Helper to try fetching a document from multiple possible S3 paths
    async function tryFetchFromPaths(fileName, docType) {
        const pathsToTry = [
            `${folderName}/Lenders/${sanitizedLenderName}/${fileName}`,
            `${folderName}/LOA/${fileName}`,
            `${folderName}/Documents/${fileName}`
        ];
        for (const path of pathsToTry) {
            const result = await fetchPdfFromS3(path);
            if (result) {
                console.log(`[Worker] ✅ Found ${docType} from DB at: ${path}`);
                return result;
            }
        }
        return null;
    }

    // 1. LOA PDF - First check documents table, then fall back to filename guessing
    try {
        const loaQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'LOA'
             AND LOWER(name) LIKE $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId, `%${lenderName.toLowerCase()}%loa%`]
        );

        if (loaQuery.rows.length > 0) {
            const loaFileName = loaQuery.rows[0].name;
            console.log(`[Worker] 🔍 Found LOA in documents table: ${loaFileName}`);
            documents.loa = await tryFetchFromPaths(loaFileName, 'LOA');
        }
    } catch (err) {
        console.log(`[Worker] DB query for LOA failed: ${err.message}`);
    }

    // Fallback to constructed filenames if not found in DB
    if (!documents.loa) {
        const loaKey = `${folderName}/Lenders/${sanitizedLenderName}/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`;
        console.log(`[Worker] 🔍 Looking for LOA at: ${loaKey}`);
        documents.loa = await fetchPdfFromS3(loaKey);
        if (documents.loa) {
            console.log(`[Worker] ✅ Found LOA for ${lenderName}`);
        } else {
            const oldLoaKey = `${folderName}/LOA/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`;
            documents.loa = await fetchPdfFromS3(oldLoaKey);
            if (documents.loa) {
                console.log(`[Worker] ✅ Found LOA (old LOA/ folder) for ${lenderName}`);
            } else {
                const legacyLoaKey = `${folderName}/LOA/${sanitizedLenderName}_LOA.pdf`;
                documents.loa = await fetchPdfFromS3(legacyLoaKey);
                if (documents.loa) {
                    console.log(`[Worker] ✅ Found LOA (legacy format) for ${lenderName}`);
                } else {
                    console.log(`[Worker] ❌ LOA not found`);
                }
            }
        }
    }

    // 2. Cover Letter PDF - First check documents table, then fall back to filename guessing
    try {
        const coverQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'Cover Letter'
             AND LOWER(name) LIKE $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId, `%${lenderName.toLowerCase()}%`]
        );

        if (coverQuery.rows.length > 0) {
            const coverFileName = coverQuery.rows[0].name;
            console.log(`[Worker] 🔍 Found Cover Letter in documents table: ${coverFileName}`);
            documents.coverLetter = await tryFetchFromPaths(coverFileName, 'Cover Letter');
        }
    } catch (err) {
        console.log(`[Worker] DB query for Cover Letter failed: ${err.message}`);
    }

    // Fallback to constructed filenames if not found in DB
    if (!documents.coverLetter) {
        const coverLetterKey = `${folderName}/Lenders/${sanitizedLenderName}/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`;
        console.log(`[Worker] 🔍 Looking for Cover Letter at: ${coverLetterKey}`);
        documents.coverLetter = await fetchPdfFromS3(coverLetterKey);
        if (documents.coverLetter) {
            console.log(`[Worker] ✅ Found Cover Letter for ${lenderName}`);
        } else {
            const oldCoverKey = `${folderName}/LOA/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`;
            documents.coverLetter = await fetchPdfFromS3(oldCoverKey);
            if (documents.coverLetter) {
                console.log(`[Worker] ✅ Found Cover Letter (old LOA/ folder) for ${lenderName}`);
            } else {
                const legacyCoverKey = `${folderName}/LOA/${sanitizedLenderName}_Cover_Letter.pdf`;
                documents.coverLetter = await fetchPdfFromS3(legacyCoverKey);
                if (documents.coverLetter) {
                    console.log(`[Worker] ✅ Found Cover Letter (legacy format) for ${lenderName}`);
                } else {
                    console.log(`[Worker] ❌ Cover Letter not found`);
                }
            }
        }
    }

    // 3. Previous Address PDF - check documents table first, then generate from contact data
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
                console.log(`[Worker] ✅ Found Previous Address PDF from documents`);
            }
        }

        // If no PDF found, generate one from contact's previous_addresses data
        if (!documents.previousAddress) {
            const contactQuery = await pool.query(
                `SELECT previous_addresses, previous_address_line_1, previous_address_line_2,
                        first_name, last_name, id
                 FROM contacts WHERE id = $1`,
                [contactId]
            );
            if (contactQuery.rows.length > 0) {
                const contact = contactQuery.rows[0];
                let addresses = [];

                if (contact.previous_addresses && Array.isArray(contact.previous_addresses) && contact.previous_addresses.length > 0) {
                    addresses = contact.previous_addresses.map(addr => ({
                        address_line_1: addr.line1 || addr.address_line_1 || '',
                        address_line_2: addr.line2 || addr.address_line_2 || '',
                        city: addr.city || '',
                        county: addr.county || addr.state_county || '',
                        postal_code: addr.postalCode || addr.postal_code || ''
                    }));
                } else if (contact.previous_address_line_1) {
                    addresses = [{
                        address_line_1: contact.previous_address_line_1,
                        address_line_2: contact.previous_address_line_2 || '',
                        city: '', county: '', postal_code: ''
                    }];
                }

                if (addresses.length > 0) {
                    try {
                        const prevAddrPdf = await generatePreviousAddressPDFForDSAR(contact, addresses);
                        if (prevAddrPdf) {
                            documents.previousAddress = prevAddrPdf;
                            console.log(`[Worker] ✅ Generated Previous Address PDF from contact data`);
                        }
                    } catch (genErr) {
                        console.warn('[Worker] Could not generate previous address PDF:', genErr.message);
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[Worker] Could not fetch previous address document:', err.message);
    }

    // 4. ID Document (3rd page document) - check documents table for uploaded ID
    try {
        // First try to find documents matching ID-related keywords
        const idDocQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'Client'
             AND (
                 LOWER(name) LIKE '%passport%' OR
                 LOWER(name) LIKE '%license%' OR
                 LOWER(name) LIKE '%licence%' OR
                 LOWER(name) LIKE '%driving%' OR
                 LOWER(name) LIKE '%identity%'
             )
             AND type IN ('pdf', 'image', 'png', 'jpg', 'jpeg')
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

        // If no ID document found by name, look for document_{contactId}.* files (renamed uploads)
        if (!documents.idDocument) {
            const renamedDocQuery = await pool.query(
                `SELECT name FROM documents
                 WHERE contact_id = $1
                 AND category = 'Client'
                 AND LOWER(name) LIKE $2
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [contactId, `document_${contactId}%`]
            );

            if (renamedDocQuery.rows.length > 0) {
                const docFileName = renamedDocQuery.rows[0].name;
                const docKey = `${folderName}/Documents/${docFileName}`;
                documents.idDocument = await fetchPdfFromS3(docKey);
                if (documents.idDocument) {
                    console.log(`[Worker] ✅ Found uploaded document: ${docFileName}`);
                }
            }
        }
    } catch (err) {
        console.warn('[Worker] Could not fetch ID document:', err.message);
    }

    return documents;
}

// --- HELPER FUNCTION: CREATE DRAFT EMAIL USING MICROSOFT GRAPH API ---
async function createDraftEmailWithGraph(lenderEmail, subject, htmlBody, attachments, lenderName, clientName, contactId, caseId) {
    if (!graphClient) {
        throw new Error('Microsoft Graph client not initialized');
    }

    try {
        // Prepare attachments for Microsoft Graph API (needs base64 encoding)
        const graphAttachments = attachments.map(att => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType,
            contentBytes: att.content.toString('base64')
        }));

        // Create draft message
        const draft = {
            subject: subject,
            body: {
                contentType: 'HTML',
                content: htmlBody
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: lenderEmail
                    }
                }
            ],
            from: {
                emailAddress: {
                    address: DSAR_MAILBOX
                }
            },
            attachments: graphAttachments
        };

        console.log(`[Worker] 📧 Creating draft email in ${DSAR_MAILBOX} for ${lenderName}...`);

        // Create the draft message
        const createdDraft = await graphClient
            .api(`/users/${DSAR_MAILBOX}/messages`)
            .post(draft);

        console.log(`[Worker] ✅ Draft email created successfully. Draft ID: ${createdDraft.id}`);

        return {
            success: true,
            draftId: createdDraft.id,
            email: lenderEmail
        };
    } catch (error) {
        console.error(`[Worker] ❌ Failed to create draft email via Microsoft Graph:`, error);
        throw error;
    }
}

// --- HELPER FUNCTION: SEND DOCUMENTS TO LENDER (or create draft) ---
async function sendDocumentsToLender(lenderName, clientName, contactId, folderName, caseId) {
    console.log(`[Worker] Preparing to ${EMAIL_DRAFT_MODE ? 'create draft for' : 'send documents to'} lender: ${lenderName}`);

    // Get contact data to generate clientId
    let clientId = null;
    try {
        const contactQuery = await pool.query(
            'SELECT id, created_at FROM contacts WHERE id = $1',
            [contactId]
        );
        if (contactQuery.rows.length > 0) {
            clientId = generateClientId(contactQuery.rows[0].id, contactQuery.rows[0].created_at);
        }
    } catch (err) {
        console.warn(`[Worker] Could not fetch contact for clientId generation:`, err.message);
        clientId = contactId; // fallback to just contactId
    }

    // Get lender email
    let lenderEmail = getLenderEmail(lenderName);

    // Use test email in test mode (only when not in draft mode, or when draft mode with test enabled)
    if (LENDER_EMAIL_TEST_MODE && !EMAIL_DRAFT_MODE) {
        console.log(`[Worker] TEST MODE: Redirecting email from ${lenderEmail || 'no email'} to ${TEST_EMAIL_ADDRESS}`);
        lenderEmail = TEST_EMAIL_ADDRESS;
    }

    if (!lenderEmail) {
        console.log(`[Worker] ⚠️ No email found for lender: ${lenderName}. Skipping.`);
        return { success: false, reason: 'no_email' };
    }

    // Extract first and last name from clientName
    const nameParts = clientName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Gather all available documents
    const documents = await gatherDocumentsForCase(contactId, lenderName, folderName, caseId, firstName, lastName);

    // Must have at least LOA and Cover Letter
    if (!documents.loa || !documents.coverLetter) {
        console.log(`[Worker] ⚠️ Missing required documents (LOA or Cover Letter). Skipping.`);
        return { success: false, reason: 'missing_required_docs' };
    }

    // Build attachments array
    const attachments = [];
    const refSpec = `x${contactId}${caseId}`;
    const sanitizedLenderName = lenderName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

    // Always include LOA and Cover Letter
    attachments.push({
        filename: `${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
        content: documents.loa,
        contentType: 'application/pdf'
    });

    attachments.push({
        filename: `${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
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

    // Email subject and body
    const subject = `RE: ${lenderName} DSAR, FULL NAME OF CLIENT: ${clientName}, OUR REFERENCE: FAC-${clientId}/${caseId}`;
    const htmlBody = `
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
            Client id: FAC-${clientId}/${caseId}</p>

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
        `;

    // DRAFT MODE: Create draft email using Microsoft Graph API
    if (EMAIL_DRAFT_MODE) {
        console.log(`[Worker] 📝 DRAFT MODE: Creating draft email for ${lenderName} (${lenderEmail})`);
        console.log(`[Worker] 📝 Subject: ${subject}`);
        console.log(`[Worker] 📝 Attachments: ${attachments.map(a => a.filename).join(', ')}`);

        try {
            const result = await createDraftEmailWithGraph(
                lenderEmail,
                subject,
                htmlBody,
                attachments,
                lenderName,
                clientName,
                contactId,
                caseId
            );

            // Log draft creation in action_logs
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
                        `DSAR draft email created in ${DSAR_MAILBOX} for ${lenderName} (${lenderEmail})`,
                        JSON.stringify({
                            lender: lenderName,
                            lenderEmail: lenderEmail,
                            caseId: caseId,
                            attachments: attachments.map(a => a.filename),
                            draftMode: true,
                            draftId: result.draftId,
                            subject: subject
                        })
                    ]
                );
            } catch (logErr) {
                console.warn('[Worker] Could not log draft action:', logErr.message);
            }

            return { success: true, draft: true, draftId: result.draftId, email: lenderEmail };
        } catch (error) {
            console.error(`[Worker] ❌ Failed to create draft email:`, error.message);
            return { success: false, reason: 'draft_failed', error: error.message };
        }
    }

    // SEND MODE: Send email directly using nodemailer
    const mailOptions = {
        from: '"DSAR Team - Fast Action Claims" <DSAR@fastactionclaims.co.uk>',
        to: lenderEmail,
        subject: subject,
        html: htmlBody,
        attachments: attachments
    };

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

// --- HELPER FUNCTION: GENERATE CLIENT ID (RR-YYMMDD-XXXX format) ---
function generateClientId(contactId, createdAt) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const idPart = String(contactId).slice(-4).padStart(4, '0');
    return `RR-${yy}${mm}${dd}-${idPart}`;
}

// --- HELPER FUNCTION: GENERATE COVER LETTER HTML ---
async function generateCoverLetterHTML(contact, lender, caseId, logoBase64) {
    const { first_name, last_name, id: contactId, created_at: createdAt } = contact;
    const fullName = `${first_name} ${last_name}`;
    const clientId = generateClientId(contactId, createdAt);

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
            padding-bottom: 80px;
        }
        .page-two {
            page-break-before: always;
            padding-bottom: 80px;
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
            <strong>Our Reference:</strong> ${clientId}/${caseId}<br>
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
        </ul>

        <div class="page-two">
            <ul class="bullet-list" style="margin-top: 0;">
                <li>Copies of all correspondence between your organisation and our client</li>
            </ul>

            <div class="body-text">
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
        dob,
        previous_addresses,
        previous_address_line_1,
        previous_address_line_2
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

    // Format Previous Addresses
    let previousAddressHTML = '';
    if (previous_addresses && Array.isArray(previous_addresses) && previous_addresses.length > 0) {
        // Handle JSONB array of previous addresses
        previousAddressHTML = previous_addresses.map((addr, index) => {
            const addrParts = [
                addr.line1 || addr.address_line_1,
                addr.line2 || addr.address_line_2,
                addr.city,
                addr.county || addr.state_county,
                addr.postalCode || addr.postal_code
            ].filter(Boolean).join(', ');
            return previous_addresses.length > 1
                ? `<div style="margin-bottom: 4px;"><strong>${index + 1}.</strong> ${addrParts}</div>`
                : `<strong>${addrParts}</strong>`;
        }).join('');
    } else if (previous_address_line_1) {
        // Legacy single previous address
        const addrParts = [previous_address_line_1, previous_address_line_2].filter(Boolean).join(', ');
        previousAddressHTML = `<strong>${addrParts}</strong>`;
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
                <td>${previousAddressHTML || ''}</td>
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

    <div class="signature-section" style="border: none; padding: 0;">
        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000;">
            <tr>
                <td style="width: 100px; padding: 10px 15px; border: 1px solid #000; font-size: 12px; vertical-align: middle;">Signature:</td>
                <td style="padding: 10px 15px; border-left: 1px solid #000; border-top: 1px solid #000; border-right: 1px solid #000; border-bottom: none; vertical-align: middle;">
                    ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height: 50px; max-width: 250px; display: block;" />` : '<span style="font-size: 12px;">Signed Electronically</span>'}
                </td>
            </tr>
            <tr>
                <td style="width: 100px; padding: 10px 15px; border: 1px solid #000; font-size: 12px; vertical-align: middle;">Date:</td>
                <td style="padding: 10px 15px; border-left: 1px solid #000; border-bottom: 1px solid #000; border-right: 1px solid #000; border-top: none; font-size: 12px; vertical-align: middle;">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
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
        // Now includes signature_url (signature.png from sales form) as fallback
        const query = `
            SELECT c.id as case_id, c.lender, c.created_at,
                   cnt.id as contact_id, cnt.first_name, cnt.last_name,
                   cnt.address_line_1, cnt.address_line_2, cnt.city, cnt.state_county, cnt.postal_code,
                   cnt.signature_2_url, cnt.signature_url, cnt.dob, cnt.created_at as contact_created_at,
                   cnt.previous_addresses, cnt.previous_address_line_1, cnt.previous_address_line_2
            FROM cases c
            JOIN contacts cnt ON c.contact_id = cnt.id
            WHERE (c.status = 'New Lead' OR c.status = 'Lender Selection Form Completed' OR c.status = 'Extra Lender Selection Form Sent')
            AND (c.loa_generated IS NULL OR c.loa_generated = false)
            AND (cnt.signature_2_url IS NOT NULL OR cnt.signature_url IS NOT NULL)
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
                // Try signature_2_url first (from LOA form), then fallback to signature_url (from sales form)
                const signatureUrlToUse = record.signature_2_url || record.signature_url;
                if (signatureUrlToUse) {
                    // Try to fetch image from S3 (via signed URL)
                    try {
                        const response = await fetch(signatureUrlToUse);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            signatureBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
                            console.log(`[Worker] Using ${record.signature_2_url ? 'signature_2_url' : 'signature_url (fallback)'} for contact ${record.contact_id}`);
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
                    id: record.contact_id,
                    created_at: record.contact_created_at
                };

                // Generate HTML
                const htmlContent = await generateLOAHTML(contactData, record.lender, logoBase64, signatureBase64);

                // Generate PDF using Puppeteer
                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                });
                const page = await browser.newPage();
                await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
                });
                await browser.close();

                // Upload S3
                const folderName = `${record.first_name}_${record.last_name}_${record.contact_id}`;
                const refSpec = `x${record.contact_id}${record.case_id}`;
                const sanitizedLenderName = record.lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
                const pdfFileName = `${refSpec} - ${record.first_name} ${record.last_name} - ${sanitizedLenderName} - LOA.pdf`;
                const pdfKey = `${folderName}/Lenders/${sanitizedLenderName}/${pdfFileName}`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: pdfKey,
                    Body: pdfBuffer,
                    ContentType: 'application/pdf'
                }));

                const pdfUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: pdfKey }), { expiresIn: 604800 });

                // Update Documents Metadata (skip if already exists to prevent duplicates)
                const existingLoa = await pool.query(
                    'SELECT id FROM documents WHERE contact_id = $1 AND name = $2 LIMIT 1',
                    [record.contact_id, pdfFileName]
                );
                if (existingLoa.rows.length === 0) {
                    await pool.query(
                        `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [record.contact_id, pdfFileName, 'pdf', 'LOA', pdfUrl, 'Auto-generated', ['LOA', record.lender]]
                    );
                } else {
                    // Update URL in case it changed (signed URLs expire)
                    await pool.query('UPDATE documents SET url = $1 WHERE id = $2', [pdfUrl, existingLoa.rows[0].id]);
                }

                // --- GENERATE COVER LETTER ---
                try {
                    const coverLetterHtml = await generateCoverLetterHTML(contactData, record.lender, record.case_id, logoBase64);

                    // Generate Cover Letter PDF using Puppeteer
                    const coverBrowser = await puppeteer.launch({
                        headless: 'new',
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                    });
                    const coverPage = await coverBrowser.newPage();
                    await coverPage.setContent(coverLetterHtml, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    const coverPdfBuffer = await coverPage.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: { top: '15mm', right: '15mm', bottom: '30mm', left: '15mm' }
                    });
                    await coverBrowser.close();

                    // Upload Cover Letter to S3
                    const coverLetterFileName = `${refSpec} - ${record.first_name} ${record.last_name} - ${sanitizedLenderName} - COVER LETTER.pdf`;
                    const coverLetterKey = `${folderName}/Lenders/${sanitizedLenderName}/${coverLetterFileName}`;

                    await s3Client.send(new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: coverLetterKey,
                        Body: coverPdfBuffer,
                        ContentType: 'application/pdf'
                    }));

                    const coverLetterUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: coverLetterKey }), { expiresIn: 604800 });

                    // Insert Cover Letter Document Record (skip if already exists to prevent duplicates)
                    const existingCover = await pool.query(
                        'SELECT id FROM documents WHERE contact_id = $1 AND name = $2 LIMIT 1',
                        [record.contact_id, coverLetterFileName]
                    );
                    if (existingCover.rows.length === 0) {
                        await pool.query(
                            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [record.contact_id, coverLetterFileName, 'pdf', 'Cover Letter', coverLetterUrl, 'Auto-generated', ['Cover Letter', record.lender]]
                        );
                    } else {
                        await pool.query('UPDATE documents SET url = $1 WHERE id = $2', [coverLetterUrl, existingCover.rows[0].id]);
                    }

                    console.log(`[Worker] ✅ Cover Letter Generated for Case ${record.case_id} (${record.lender})`);

                    // Just mark LOA as generated - DON'T automatically set to 'DSAR Prepared'
                    // User must manually change status to 'DSAR Prepared' to trigger draft creation
                    await pool.query(
                        `UPDATE cases SET loa_generated = true WHERE id = $1`,
                        [record.case_id]
                    );
                    console.log(`[Worker] ✅ LOA/Cover Letter ready for Case ${record.case_id} (${record.lender}). Status unchanged - waiting for manual DSAR Prepared.`);

                } catch (coverLetterErr) {
                    console.error(`[Worker] ⚠️ Cover Letter generation failed for Case ${record.case_id}:`, coverLetterErr.message);
                    // Still mark LOA as generated to prevent re-processing
                    await pool.query('UPDATE cases SET loa_generated = true WHERE id = $1', [record.case_id]);
                }

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

// --- DSAR EMAIL SENDER (triggered by status = 'DSAR Prepared') ---
const processPendingDSAREmails = async () => {
    console.log(`[Worker] Checking for pending DSAR ${EMAIL_DRAFT_MODE ? 'drafts to create' : 'emails to send'}...`);
    try {
        const query = `
            SELECT c.id as case_id, c.lender, c.contact_id,
                   cnt.first_name, cnt.last_name
            FROM cases c
            JOIN contacts cnt ON c.contact_id = cnt.id
            WHERE c.status = 'DSAR Prepared'
            AND UPPER(c.lender) != 'GAMBLING'
            LIMIT 20
        `;
        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log(`[Worker] No pending DSAR ${EMAIL_DRAFT_MODE ? 'drafts' : 'emails'}.`);
            return;
        }

        console.log(`[Worker] Found ${rows.length} DSAR ${EMAIL_DRAFT_MODE ? 'drafts to create' : 'emails to send'}.`);

        for (const record of rows) {
            try {
                const clientName = `${record.first_name} ${record.last_name}`;
                const folderName = `${record.first_name}_${record.last_name}_${record.contact_id}`;

                console.log(`[Worker] 📧 Processing DSAR for Case ${record.case_id}, Lender: ${record.lender}, Client: ${clientName}`);

                const emailResult = await sendDocumentsToLender(
                    record.lender,
                    clientName,
                    record.contact_id,
                    folderName,
                    record.case_id
                );

                console.log(`[Worker] 📧 DSAR result for Case ${record.case_id}:`, JSON.stringify(emailResult));

                if (emailResult.success) {
                    const statusMessage = EMAIL_DRAFT_MODE
                        ? `DSAR draft created for Case ${record.case_id} (${record.lender})`
                        : `DSAR email sent for Case ${record.case_id} (${record.lender})`;

                    await pool.query(
                        `UPDATE cases SET status = 'DSAR Sent to Lender', dsar_sent = true WHERE id = $1`,
                        [record.case_id]
                    );
                    console.log(`[Worker] ✅ ${statusMessage}`);
                } else {
                    console.log(`[Worker] ⚠️ DSAR not ${EMAIL_DRAFT_MODE ? 'drafted' : 'sent'} for Case ${record.case_id}: ${emailResult.reason}${emailResult.error ? ' - ' + emailResult.error : ''}`);
                    if (emailResult.reason === 'no_email') {
                        // No email for this lender - mark as sent, skip
                        await pool.query(
                            `UPDATE cases SET status = 'DSAR Sent to Lender', dsar_sent = true WHERE id = $1`,
                            [record.case_id]
                        );
                    } else if (emailResult.reason === 'send_failed' || emailResult.reason === 'draft_failed') {
                        console.error(`[Worker] ❌ ${EMAIL_DRAFT_MODE ? 'Draft creation' : 'Email send'} FAILED for Case ${record.case_id}. Error: ${emailResult.error}`);
                        await pool.query(
                            `UPDATE cases SET status = 'DSAR Sent to Lender', dsar_sent = true WHERE id = $1`,
                            [record.case_id]
                        );
                    }
                    // If missing_required_docs, keep status as 'DSAR Prepared' - retry next cycle
                }
            } catch (err) {
                console.error(`[Worker] ❌ Error sending DSAR for Case ${record.case_id}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[Worker] DSAR Email Process Error:', error);
    }
};

// --- RUNNER ---
console.log('Starting LOA Background Worker...');

// Combined runner: process LOAs first, then immediately check for DSAR emails
const runWorkerCycle = async () => {
    await processPendingLOAs();
    // Run DSAR check immediately after LOA processing so newly generated LOAs get emails sent
    await processPendingDSAREmails();
};

// Run immediately on start (with small delay for DB migration)
setTimeout(() => {
    runWorkerCycle();
    // Then run every 60 seconds
    setInterval(() => {
        runWorkerCycle();
    }, 300000);
}, 5000);
