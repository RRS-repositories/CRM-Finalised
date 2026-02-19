import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

// --- CLIENT EMAIL TRANSPORTER (for overdue notifications) ---
const clientEmailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@fastactionclaims.co.uk',
        pass: 'H!292668193906ah'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// Verify client email transporter on startup
clientEmailTransporter.verify((error, success) => {
    if (error) {
        console.error('[Worker] ❌ Client email transporter error:', error);
    } else {
        console.log('[Worker] ✅ Client email transporter ready for overdue notifications');
    }
});

// --- IRL EMAIL TRANSPORTER (for Category 3 confirmation emails) ---
const irlEmailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'irl@rowanrose.co.uk',
        pass: 'Farm54595459!!!'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// Verify IRL email transporter on startup
irlEmailTransporter.verify((error, success) => {
    if (error) {
        console.error('[Worker] ❌ IRL email transporter error:', error);
    } else {
        console.log('[Worker] ✅ IRL email transporter ready for Category 3 confirmations');
    }
});

// --- MICROSOFT GRAPH API CONFIGURATION FOR DRAFT CREATION ---
const DSAR_MAILBOX = 'DSAR@fastactionclaims.co.uk';
const INFO_MAILBOX = 'info@fastactionclaims.co.uk';
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

// ============================================================================
// LENDER CATEGORIES FOR DSAR PROCESSING
// ============================================================================

// Category 1: Standard lenders - NO ID required (only LOA, Cover Letter, Previous Address if available)
const CATEGORY_1_NO_ID_LENDERS = new Set([
    '118 LOANS', '118 MONEY', '1PLUS 1 LOANS', 'ADMIRAL LOAN', 'AMERICAN EXPRESS', 'AQUA', 'ARGOS', 'ASDA',
    'AVANT', 'BANK OF SCOTLAND', 'BARCLAYS / MONUMENT', 'BARCLAYS CREDIT CARD', 'BARCLAYS OVERDRAFT',
    'BETTER BORROW', 'BIP CREDIT CARD', 'CABOT', 'CAPITAL ONE', 'CAPQUEST/ ARROW', 'CAR CASH POINT',
    'CASH ASAP', 'CASH CONVERTERS', 'CASH PLUS', 'CASTLE COMMUNITY BANK', 'CITI BANK', 'CLC FINANCE',
    'CO-OP BANK OVERDRAFT', 'CO-OPERATIVE BANK', 'CONSOLADATION LOAN', 'CREATION FINANCE', 'CREDIT SPRING',
    'DANSKE BANK', 'DEBENHAMS', 'DOROTHY PERKINS', 'EVANS CATALOGUE', 'EVERDAY LENDING', 'EVOLUTION LENDING',
    'FAIR FINANCE', 'FERNOVO', 'FINIO LOANS', 'FINIO/LIKELY LOANS', 'FINTERN/ABOUND', 'FLUID',
    'FREEMANS CATALOUGE', 'FUND OURSELVES', 'G.L.M. FINANCE', 'GE CAPITAL', 'GRATTAN', 'GUARANTOR MY LOAN',
    'GURRANTOR MY LOAN', 'H&T PAWNBROKERS', 'HALIFAX', 'HERO LOANS', 'HSBC', 'HSBC BANK', 'ICO', 'INTRUM',
    'JUO LOANS', 'KAYS', 'KLARNA', 'KOYO LOANS', 'LANTERN', 'LENDABLE', 'LENDING WORKS', 'LIFE STYLE LOANS',
    'LINK FINANCIAL', 'LITTLE LOANS', 'LITTLEWOODS / GREAT UNIVERSAL', 'LIVE LEND',
    'LLOYDS BANK / BANK OF SCOTLAND / MBNA', 'LLOYDS OVERDRAFT', 'LOAN4YOU / NA', 'LOANS 2 GO', 'LOANS2GO',
    'LOGBOOK LENDING', 'LOGBOOK MONEY', 'LOWELL', 'LUMA', 'MARKS & SPENCERS', 'MBNA',
    'METRO BANK/RATE SETTER', 'MONEY BARN', 'MONEY BOAT', 'MONEY WAY', 'MONTHLY ADVANCE LOANS', 'MONZO',
    'MUIRHEAD FINANCE', 'MUTUAL FINANCE', 'MY COMMUNITY BANK', 'MY COMMUNITY FINANCE', 'MY FINANCE CLUB',
    'MY KREDIT', 'NATIONWIDE', 'NATWEST / RBS OVERDRAFT', 'NATWEST BANK / ROYAL BANK OF SCOTLAND',
    'NEWDAY / OPUS / MARBLES / FLUID / BURTONS', 'NEXT', 'NORWICH TRUST', 'NOVUNA', 'OCEAN FINANCE',
    'ONDAL', 'ONE PLUS ONE LOANS', 'ONMO', 'OPLO', 'OPOLO', 'PAYPAL', 'PEACHY LOANS', 'PERCH GROUP',
    'PLATA FINANCE', 'PLEND', 'PM LOANS', 'POLAR FINANCE', 'POST OFFICE', 'PRA', 'PROGRESSIVE MONEY',
    'PROVIDENT', 'PSA FINANCE', 'REEVO', "SAINSBURY'S BANK / POST", 'SALAD MONEY', 'SALARY FINANCE',
    'SAVVY LOANS', 'SHAWBROOK BANK', 'SHORT TERM FINANCE', 'SKYLINE DIRECT', 'SNAP FINANCE', 'STUDIO',
    'SUCO', 'SWIFT LOANS', 'TANDEM', 'TAPPILY', 'TESCO BANK', 'THINKMONEY', 'TM ADVANCES', 'TRANSUNION',
    'TSB', 'ULSTER BANK', 'UPDRAFT', 'VERY / SHOP DIRECT / G UNIVERSAL', 'VERY CATALOGUE',
    'VIRGIN/ CLYDESDALE/ YORKSHIRE BANK', 'WAGE DAY ADVANCES', 'WAGE STREAM', 'WAVE', 'ZABLE',
    'ZEMPLER BANK / CASHPLUS', 'ZOPA', 'TEST'
]);

// Category 2: ID Required lenders - Must have ID document or log error
const CATEGORY_2_ID_REQUIRED_LENDERS = new Set([
    'ADVANTAGE FINANCE', 'AUDI', 'VOLKSWAGEN FINANCE', 'SKODA', 'BLACKHORSE', 'BLUE MOTOR FINANCE',
    'BMW', 'MINI', 'ALPHERA FINANCE', 'CASH FLOAT', 'CLOSE BROTHERS', 'FLURO', 'MOTONOVO', 'OODLE',
    'RCI FINANCIAL', 'REVOLUT', 'SANTANDER', 'VANQUIS', 'VAUXHALL FINANCE', 'ZILCH', 'MONEY LINE', 'MR LENDER'
]);

// Category 3: Confirmation required lenders - Map of correct name to alternative (possibly misspelled)
const CATEGORY_3_CONFIRMATION_LENDERS = {
    'ANICO FINANCE': ['THE ANICO FINANCE'],
    'LOANS BY MAL': ['LOANS BY MAL'],
    'PAYDAY UK': ['PAYNIGHT UK'],
    'QUICK LOANS': ['QUICK LOANZ'],
    'THE ONE STOP MONEY SHOP': ['MONEY SHOP'],
    'TICK TOCK LOANS': ['TIK TOK LOANZ']
};
// Create a Set of all Category 3 lenders for quick lookup
const CATEGORY_3_ALL_LENDERS = new Set([
    ...Object.keys(CATEGORY_3_CONFIRMATION_LENDERS),
    ...Object.values(CATEGORY_3_CONFIRMATION_LENDERS).flat()
]);

// Category 4: Special email lenders - Create claim but send verification email to client instead of DSAR
const CATEGORY_4_SPECIAL_EMAIL_LENDERS = new Set([
    'DRAFTY', 'LENDING STREAM', 'QUID MARKET'
]);

// Lenders that should send DSAR directly (bypass draft mode)
const DIRECT_SEND_LENDERS = new Set([
    'TEST'
]);

// Helper function to normalize lender name for comparison
function normalizeLenderName(name) {
    if (!name) return '';
    return name.toUpperCase().trim();
}

// Helper function to get lender category
function getLenderCategory(lenderName) {
    const normalized = normalizeLenderName(lenderName);

    if (CATEGORY_1_NO_ID_LENDERS.has(normalized)) return 1;
    if (CATEGORY_2_ID_REQUIRED_LENDERS.has(normalized)) return 2;
    if (CATEGORY_3_ALL_LENDERS.has(normalized)) return 3;
    if (CATEGORY_4_SPECIAL_EMAIL_LENDERS.has(normalized)) return 4;

    return 5; // Default: DSAR not allowed
}

// ============================================================================

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
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_sent_at') THEN
                    ALTER TABLE cases ADD COLUMN dsar_sent_at TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_overdue_notified') THEN
                    ALTER TABLE cases ADD COLUMN dsar_overdue_notified BOOLEAN DEFAULT FALSE;
                END IF;
                -- Add email_sent column to pending_lender_confirmations if it doesn't exist
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pending_lender_confirmations' AND column_name='email_sent') THEN
                    ALTER TABLE pending_lender_confirmations ADD COLUMN email_sent BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);
        console.log('[Worker] ✅ DSAR columns and pending_lender_confirmations.email_sent verified/created');
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
    let normalizedInput = lenderName.toUpperCase().trim();

    // Normalize LOANS2GO variants to standard name
    if (normalizedInput === 'LOANS2GO') {
        normalizedInput = 'LOANS 2 GO';
    }

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
    let normalizedInput = lenderName.toUpperCase().trim();

    // Normalize LOANS2GO variants to standard name
    if (normalizedInput === 'LOANS2GO') {
        normalizedInput = 'LOANS 2 GO';
    }

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
// Helper to escape HTML special characters
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function generatePreviousAddressPDFForDSAR(contact, addresses) {
    const fullName = escapeHtml(`${contact.first_name} ${contact.last_name}`);
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
        const streetAddr = [addr.address_line_1, addr.address_line_2].filter(Boolean).map(escapeHtml).join(', ');
        addressBlocksHtml += `
        <div style="margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 10px;">PREVIOUS ADDRESS ${index + 1}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">Street Address:</span> ${streetAddr}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">City / Town:</span> ${escapeHtml(addr.city)}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">County / State:</span> ${escapeHtml(addr.county)}</div>
            <div style="margin-bottom: 10px;"><span style="font-weight: bold; display: inline-block; width: 120px;">Postal Code:</span> ${escapeHtml(addr.postal_code)}</div>
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

// Known lender aliases - ONLY these get flexible matching (to avoid false positives like BARCLAYS vs BARCLAYS CREDIT CARD)
const LENDER_ALIASES = {
    'ZABLE': ['ZABLE', 'ZABLE CREDIT', 'ZABLE_CREDIT'],
    'ZABLE CREDIT': ['ZABLE', 'ZABLE CREDIT', 'ZABLE_CREDIT'],
    'OCEAN FINANCE': ['OCEAN FINANCE', 'OCEAN', 'OCEAN_FINANCE'],
    'OCEAN': ['OCEAN FINANCE', 'OCEAN', 'OCEAN_FINANCE'],
};

// --- HELPER FUNCTION: FIND FILE IN S3 FOLDER BY PATTERN ---
async function findFileInS3Folder(folderPrefix, lenderName, docType, refSpec = null) {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: folderPrefix
        });
        const response = await s3Client.send(command);

        if (!response.Contents || response.Contents.length === 0) {
            return null;
        }

        const docTypeLower = docType.toLowerCase(); // 'loa' or 'cover letter'
        const lenderUpper = lenderName.toUpperCase();

        // Get all names to search for (including aliases if defined, otherwise just the lender name)
        const namesToMatch = LENDER_ALIASES[lenderUpper] || [lenderName];

        for (const obj of response.Contents) {
            const fileName = obj.Key.toLowerCase();

            // Check if file matches docType - match any file ending with LOA.pdf or COVER LETTER.pdf
            // Handles: "- LOA.pdf", "-LOA.pdf", "LOA.pdf", "LOA (1).pdf", "LOA(2).pdf" etc
            const loaPattern = /loa(\s*\(\d+\))?\.pdf$/i;
            const coverPattern = /cover\s*letter(\s*\(\d+\))?\.pdf$/i;
            const pattern = docTypeLower === 'loa' ? loaPattern : coverPattern;

            if (!pattern.test(fileName)) {
                continue;
            }

            // Make sure it's NOT a cover letter when looking for LOA (and vice versa)
            if (docTypeLower === 'loa' && /cover\s*letter/i.test(fileName)) {
                continue;
            }
            if (docTypeLower === 'cover letter' && !/cover\s*letter/i.test(fileName)) {
                continue;
            }

            // If refSpec provided, prefer files with case reference, but don't require it
            // (some files don't have the standard naming format)

            // Check if any of the lender names/aliases match (strict matching)
            for (const name of namesToMatch) {
                const nameLower = name.toLowerCase();
                const nameNoSpaces = nameLower.replace(/[\s_-]+/g, '');
                const fileNameNoSpaces = fileName.replace(/[\s_-]+/g, '');

                if (fileNameNoSpaces.includes(nameNoSpaces) ||
                    obj.Key.toLowerCase().includes(`/lenders/${nameLower.replace(/\s+/g, '_')}/`)) {
                    console.log(`[Worker] 🔍 Found ${docType} via S3 listing: ${obj.Key}${refSpec ? ` (case-specific: ${refSpec})` : ''}`);
                    return await fetchPdfFromS3(obj.Key);
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`[Worker] Error listing S3 folder (${folderPrefix}):`, error.message);
        return null;
    }
}

// --- HELPER FUNCTION: GATHER ALL DOCUMENTS FOR A CASE ---
async function gatherDocumentsForCase(contactId, lenderName, folderName, caseId, firstName, lastName) {
    const documents = {
        loa: null,
        coverLetter: null,
        previousAddress: null,
        idDocuments: [] // Array of ID documents from Documents/ID_Document/ and Lenders/{lender}/ID_Document/
    };

    const refSpec = `${contactId}${caseId}`;
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

    // 1. LOA PDF - First check documents table for this lender
    // Match any file ending with LOA.pdf (flexible pattern for various naming formats)
    try {
        const loaQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'LOA'
             AND LOWER(name) LIKE $2
             AND LOWER(name) ~ 'loa(\\s*\\(\\d+\\))?\\.pdf$'
             AND LOWER(name) NOT LIKE '%cover%letter%'
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId, `%${sanitizedLenderName.toLowerCase()}%`]
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
        const xRefSpec = `x${contactId}${caseId}`; // Backwards compatibility with x prefix
        const loaPathsToTry = [
            // New format (no x prefix)
            `${folderName}/Lenders/${sanitizedLenderName}/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
            `${folderName}/LOA/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
            // Old format (with x prefix)
            `${folderName}/Lenders/${sanitizedLenderName}/${xRefSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
            `${folderName}/LOA/${xRefSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
            // Legacy format
            `${folderName}/LOA/${sanitizedLenderName}_LOA.pdf`
        ];
        console.log(`[Worker] 🔍 Looking for LOA at: ${loaPathsToTry[0]}`);
        for (const loaPath of loaPathsToTry) {
            documents.loa = await fetchPdfFromS3(loaPath);
            if (documents.loa) {
                console.log(`[Worker] ✅ Found LOA for ${lenderName} at: ${loaPath}`);
                break;
            }
        }
        // Last resort: search S3 Lenders folder for file matching lender + LOA + case reference
        if (!documents.loa) {
            console.log(`[Worker] 🔍 Searching S3 Lenders folder for LOA (case-specific: ${refSpec})...`);
            documents.loa = await findFileInS3Folder(`${folderName}/Lenders/`, lenderName, 'LOA', refSpec);
        }
        if (!documents.loa) {
            console.log(`[Worker] ❌ LOA not found`);
        }
    }

    // 2. Cover Letter PDF - First check documents table for this lender
    // Match any file ending with COVER LETTER.pdf (flexible pattern for various naming formats)
    try {
        const coverQuery = await pool.query(
            `SELECT name FROM documents
             WHERE contact_id = $1
             AND category = 'Cover Letter'
             AND LOWER(name) LIKE $2
             AND LOWER(name) ~ 'cover\\s*letter(\\s*\\(\\d+\\))?\\.pdf$'
             ORDER BY created_at DESC
             LIMIT 1`,
            [contactId, `%${sanitizedLenderName.toLowerCase()}%`]
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
        const xRefSpecCover = `x${contactId}${caseId}`; // Backwards compatibility with x prefix
        const coverPathsToTry = [
            // New format (no x prefix)
            `${folderName}/Lenders/${sanitizedLenderName}/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
            `${folderName}/LOA/${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
            // Old format (with x prefix)
            `${folderName}/Lenders/${sanitizedLenderName}/${xRefSpecCover} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
            `${folderName}/LOA/${xRefSpecCover} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
            // Legacy format
            `${folderName}/LOA/${sanitizedLenderName}_Cover_Letter.pdf`
        ];
        console.log(`[Worker] 🔍 Looking for Cover Letter at: ${coverPathsToTry[0]}`);
        for (const coverPath of coverPathsToTry) {
            documents.coverLetter = await fetchPdfFromS3(coverPath);
            if (documents.coverLetter) {
                console.log(`[Worker] ✅ Found Cover Letter for ${lenderName} at: ${coverPath}`);
                break;
            }
        }
        // Last resort: search S3 Lenders folder for file matching lender + COVER LETTER + case reference
        if (!documents.coverLetter) {
            console.log(`[Worker] 🔍 Searching S3 Lenders folder for Cover Letter (case-specific: ${refSpec})...`);
            documents.coverLetter = await findFileInS3Folder(`${folderName}/Lenders/`, lenderName, 'COVER LETTER', refSpec);
        }
        if (!documents.coverLetter) {
            console.log(`[Worker] ❌ Cover Letter not found`);
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

                // Filter out addresses that have no actual content (all fields empty)
                addresses = addresses.filter(addr =>
                    addr.address_line_1?.trim() ||
                    addr.city?.trim() ||
                    addr.postal_code?.trim()
                );

                if (addresses.length > 0) {
                    try {
                        const prevAddrPdf = await generatePreviousAddressPDFForDSAR(contact, addresses);
                        if (prevAddrPdf) {
                            documents.previousAddress = prevAddrPdf;
                            console.log(`[Worker] ✅ Generated Previous Address PDF from contact data (${addresses.length} address(es))`);
                        }
                    } catch (genErr) {
                        console.warn('[Worker] Could not generate previous address PDF:', genErr.message);
                    }
                } else {
                    console.log(`[Worker] ℹ️ No previous address data - skipping Previous_Addresses.pdf`);
                }
            }
        }
    } catch (err) {
        console.warn('[Worker] Could not fetch previous address document:', err.message);
    }

    // 4. ID Documents - gather ALL from Documents/ID_Document/ AND Lenders/{lender}/ID_Document/
    try {
        // 4a. Get ID documents from Documents/ID_Document/ folder (category = 'ID Document')
        const generalIdDocsQuery = await pool.query(
            `SELECT name, type FROM documents
             WHERE contact_id = $1
             AND category = 'ID Document'
             ORDER BY created_at DESC`,
            [contactId]
        );

        for (const row of generalIdDocsQuery.rows) {
            const idDocKey = `${folderName}/Documents/ID_Document/${row.name}`;
            const docBuffer = await fetchPdfFromS3(idDocKey);
            if (docBuffer) {
                const contentType = row.type === 'image' ? 'image/jpeg' : 'application/pdf';
                documents.idDocuments.push({
                    filename: row.name,
                    content: docBuffer,
                    contentType: contentType
                });
                console.log(`[Worker] ✅ Found ID Document (general): ${row.name}`);
            }
        }

        // 4b. Get ID documents from Lenders/{lender}/ID_Document/ folder
        const lenderIdDocsQuery = await pool.query(
            `SELECT name, type FROM documents
             WHERE contact_id = $1
             AND category = 'ID Document'
             AND tags @> ARRAY[$2]::text[]
             ORDER BY created_at DESC`,
            [contactId, lenderName]
        );

        for (const row of lenderIdDocsQuery.rows) {
            const idDocKey = `${folderName}/Lenders/${sanitizedLenderName}/ID_Document/${row.name}`;
            const docBuffer = await fetchPdfFromS3(idDocKey);
            if (docBuffer) {
                const contentType = row.type === 'image' ? 'image/jpeg' : 'application/pdf';
                // Avoid duplicates
                const exists = documents.idDocuments.some(d => d.filename === row.name);
                if (!exists) {
                    documents.idDocuments.push({
                        filename: row.name,
                        content: docBuffer,
                        contentType: contentType
                    });
                    console.log(`[Worker] ✅ Found ID Document (lender): ${row.name}`);
                }
            }
        }

        // 4c. Fallback: check for legacy ID documents (keywords in name)
        if (documents.idDocuments.length === 0) {
            const legacyIdQuery = await pool.query(
                `SELECT name, type FROM documents
                 WHERE contact_id = $1
                 AND (
                     LOWER(name) LIKE '%passport%' OR
                     LOWER(name) LIKE '%license%' OR
                     LOWER(name) LIKE '%licence%' OR
                     LOWER(name) LIKE '%driving%' OR
                     LOWER(name) LIKE '%identity%'
                 )
                 ORDER BY created_at DESC
                 LIMIT 5`,
                [contactId]
            );

            for (const row of legacyIdQuery.rows) {
                // Try multiple paths
                const pathsToTry = [
                    `${folderName}/Documents/${row.name}`,
                    `${folderName}/Documents/ID_Document/${row.name}`
                ];
                for (const path of pathsToTry) {
                    const docBuffer = await fetchPdfFromS3(path);
                    if (docBuffer) {
                        const contentType = row.type === 'image' ? 'image/jpeg' : 'application/pdf';
                        documents.idDocuments.push({
                            filename: row.name,
                            content: docBuffer,
                            contentType: contentType
                        });
                        console.log(`[Worker] ✅ Found legacy ID Document: ${row.name}`);
                        break;
                    }
                }
            }
        }

        console.log(`[Worker] Total ID Documents found: ${documents.idDocuments.length}`);
    } catch (err) {
        console.warn('[Worker] Could not fetch ID documents:', err.message);
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
        const graphAttachments = attachments.map(att => {
            // Ensure content is a proper Buffer before encoding
            const contentBuffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
            return {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: att.filename,
                contentType: att.contentType,
                contentBytes: contentBuffer.toString('base64')
            };
        });

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

        // Debug: Log attachment info
        console.log(`[Worker] 📎 Attachments count: ${graphAttachments.length}`);
        graphAttachments.forEach((att, i) => {
            console.log(`[Worker] 📎 Attachment ${i + 1}: ${att.name} (${att.contentType}, ${att.contentBytes?.length || 0} base64 chars)`);
        });

        // Validate attachments before sending
        for (const att of graphAttachments) {
            if (!att.contentBytes || att.contentBytes.length === 0) {
                throw new Error(`Empty attachment content for: ${att.name}`);
            }
        }

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

// --- HELPER FUNCTION: SEND EMAIL TO CLIENT FOR CATEGORY 4 LENDERS ---
// For DRAFTY, LENDING STREAM, QUID MARKET - send verification notice to client
async function sendCategory4ClientEmail(lenderName, clientName, firstName, clientEmail, contactId, caseId) {
    console.log(`[Worker] Sending Category 4 verification email to client for lender: ${lenderName}`);

    if (!clientEmail) {
        console.log(`[Worker] ⚠️ No client email found for contact ${contactId}`);
        return { success: false, error: 'No client email address' };
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 30px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Rowan Rose Solicitors</h1>
                            <p style="color: #a8c5e2; margin: 8px 0 0 0; font-size: 13px;">Your Trusted Legal Partner</p>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="color: #1e3a5f; margin: 0 0 20px 0; font-size: 20px;">Hello ${firstName},</h2>

                            <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 0 0 20px 0;">
                                We've submitted a request to <strong style="color: #1e3a5f;">${lenderName}</strong> to review your lending history and assess whether you may be eligible for a potential refund of interest or charges.
                            </p>

                            <!-- Info Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f7ff; border-left: 4px solid #2d5a87; border-radius: 0 8px 8px 0; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #1e3a5f; font-size: 14px; margin: 0; font-weight: 600;">⏳ What happens next?</p>
                                        <p style="color: #555; font-size: 14px; margin: 10px 0 0 0; line-height: 1.6;">
                                            Within the next <strong>3 working days</strong>, you'll receive an email asking you to verify your details and authorise us to continue the review on your behalf.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff8e6; border: 1px solid #ffd54f; border-radius: 8px; margin: 25px 0;">
                                <tr>
                                    <td style="padding: 20px; text-align: center;">
                                        <p style="color: #8d6e00; font-size: 15px; margin: 0; font-weight: 600;">
                                            ⚡ Please complete that authorisation so we can proceed with your claim.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #444; font-size: 15px; line-height: 1.7; margin: 25px 0 0 0;">
                                If you have any questions, please don't hesitate to contact us.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 30px 40px; border-top: 1px solid #e9ecef;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td>
                                        <p style="color: #1e3a5f; font-size: 15px; font-weight: 600; margin: 0;">Customer Care Team</p>
                                        <p style="color: #666; font-size: 14px; margin: 8px 0 0 0;">
                                            📞 0161 505 0150<br>
                                            ✉️ info@rowanrose.co.uk
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Bottom Bar -->
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 20px 40px; text-align: center;">
                            <p style="color: #a8c5e2; font-size: 11px; margin: 0; line-height: 1.6;">
                                Rowan Rose Solicitors | SRA No. 8000843<br>
                                1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const subject = `Your ${lenderName} Claim - Action Required`;

    try {
        // Always send directly to client (no drafts) via irlEmailTransporter (irl@rowanrose.co.uk)
        const mailOptions = {
            from: '"Rowan Rose Solicitors" <irl@rowanrose.co.uk>',
            to: LENDER_EMAIL_TEST_MODE ? TEST_EMAIL_ADDRESS : clientEmail,
            subject: subject,
            html: htmlBody
        };

        const info = await irlEmailTransporter.sendMail(mailOptions);
        console.log(`[Worker] ✅ Category 4 email sent to ${clientEmail}, Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId, email: clientEmail };
    } catch (error) {
        console.error(`[Worker] ❌ Failed to send Category 4 email:`, error);
        return { success: false, error: error.message };
    }
}

// --- HELPER FUNCTION: SEND DOCUMENTS TO LENDER (or create draft) ---
// includeIdDocuments: whether to include ID documents in attachments
// requireIdDocuments: if true, will fail if no ID documents found
async function sendDocumentsToLender(lenderName, clientName, contactId, folderName, caseId, referenceSpecified, includeIdDocuments = false, requireIdDocuments = false, includePreviousAddress = true, requireCoverLetter = false) {
    console.log(`[Worker] Preparing to ${EMAIL_DRAFT_MODE ? 'create draft for' : 'send documents to'} lender: ${lenderName} (Include ID: ${includeIdDocuments}, Require ID: ${requireIdDocuments})`);

    // Get contact data to generate clientId
    let clientId = null;
    clientId = generateClientId(contactId);

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

    // Must have at least LOA
    if (!documents.loa) {
        console.log(`[Worker] ⚠️ Missing required document (LOA). Skipping.`);
        return { success: false, reason: 'missing_required_docs' };
    }

    // Category 1 lenders require Cover Letter as well
    if (requireCoverLetter && !documents.coverLetter) {
        console.log(`[Worker] ⚠️ Missing required document (Cover Letter). Skipping.`);
        return { success: false, reason: 'missing_cover_letter' };
    }

    // Build attachments array
    const attachments = [];
    const refSpec = `${contactId}${caseId}`;
    const sanitizedLenderName = lenderName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

    // Always include LOA (required)
    attachments.push({
        filename: `${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - LOA.pdf`,
        content: documents.loa,
        contentType: 'application/pdf'
    });

    // Add Cover Letter if available (optional)
    if (documents.coverLetter) {
        attachments.push({
            filename: `${refSpec} - ${firstName} ${lastName} - ${sanitizedLenderName} - COVER LETTER.pdf`,
            content: documents.coverLetter,
            contentType: 'application/pdf'
        });
    }

    // Add Previous Address if available and requested
    if (includePreviousAddress && documents.previousAddress) {
        attachments.push({
            filename: `Previous_Addresses.pdf`,
            content: documents.previousAddress,
            contentType: 'application/pdf'
        });
    } else if (!includePreviousAddress) {
        console.log(`[Worker] Previous Address skipped for this lender category`);
    }

    // Add ID Documents based on flags
    if (includeIdDocuments) {
        if (documents.idDocuments && documents.idDocuments.length > 0) {
            for (let i = 0; i < documents.idDocuments.length; i++) {
                const idDoc = documents.idDocuments[i];
                attachments.push({
                    filename: idDoc.filename,
                    content: idDoc.content,
                    contentType: idDoc.contentType
                });
            }
            console.log(`[Worker] Added ${documents.idDocuments.length} ID document(s) to attachments`);
        } else if (requireIdDocuments) {
            // Category 2 lenders require ID - fail if not found
            console.log(`[Worker] ⚠️ ID documents required but not found for ${lenderName}. Cannot send DSAR.`);
            return { success: false, reason: 'missing_id_documents' };
        }
    } else {
        console.log(`[Worker] ID documents not included for this lender category`);
    }

    // Email subject and body - use clientId/caseId format
    const subject = `RE: ${lenderName} DSAR, FULL NAME OF CLIENT: ${clientName}, OUR REFERENCE: ${clientId}/${caseId}`;
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
            Contact no: 0161 505 0150<br>
            Address: 1.03, Boat Shed, 12 Exchange Quay, Salford, M5 3EQ<br>
            Client id: ${clientId}/${caseId}</p>

            <p>Dear Sirs,</p>

            <p><strong>Data Subject Access Request (DSAR)</strong></p>

            <p>We refer to the above matter.</p>

            <p>Please find attached our DSAR and our client's signed Letter of Authority.</p>

            <p>We would be grateful if you could provide us with the requested information.</p>

            <p>We look forward to hearing from you.</p>

            <p><strong>DSAR Team</strong><br>
            <strong>Fast Action Claims</strong><br>
            T: 0161 505 0150<br>
            E: <a href="mailto:dsar@fastactionclaims.co.uk">dsar@fastactionclaims.co.uk</a><br>
            A: 1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>

            <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">

            <p style="font-size: 11px; color: #666;">
            THIS EMAIL AND ANY FILES TRANSMITTED WITH IT IS/ARE CONFIDENTIAL AND LEGALLY PRIVILEGED. Accordingly any dissemination, distribution, copying of other use of this message or any of its content by any person other than the intended Recipient may constitute a breach of civil and/or criminal law and is strictly prohibited. If you are not the Intended Recipient, please notify us as soon as possible and remove it from your system. This e-mail is sent on behalf of Fast Action Claims and no other person. Email transmission cannot be guaranteed to be secure or error free as information could arrive late or incomplete, or contain viruses. We therefore accept no liability for any errors or omissions in the contents of this message which arise as a result of email transmission. If verification is required please request a hard copy version signed by or on behalf of Fast Action Claims. Copyright in this email and any documents created by Fast Action Claims will be and remain vested in Fast Action Claims. We assert the right to be identified as the author of, and to object to the misuse of, this email and such documents. Fast Action Claims is a trading name of Rowan Rose Limited, a limited company registered in England under number 12916452. Authorised and Regulated by the Solicitors Regulation Authority under number 8000843.
            </p>
        </body>
        </html>
        `;

    // Check if this lender should send directly (bypass draft mode)
    const shouldSendDirectly = DIRECT_SEND_LENDERS.has(normalizeLenderName(lenderName));

    // DRAFT MODE: Create draft email using Microsoft Graph API (unless lender is in direct send list)
    if (EMAIL_DRAFT_MODE && !shouldSendDirectly) {
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
    if (shouldSendDirectly) {
        console.log(`[Worker] 📧 DIRECT SEND: ${lenderName} is in direct send list - sending immediately`);
    }
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

// --- HELPER FUNCTION: GENERATE CLIENT ID (simple format: RR-contactId) ---
function generateClientId(contactId) {
    return `RR-${contactId}`;
}

// --- LOA GENERATION REMOVED ---
// LOA and Cover Letter PDF generation is now handled by AWS Lambda (pdf-generator)
// Triggered via triggerPdfGenerator() in server.js
// Old functions removed: generateCoverLetterHTML, generateLOAHTML, processPendingLOAs

// --- DSAR EMAIL SENDER (triggered by status = 'DSAR Prepared') ---
const processPendingDSAREmails = async () => {
    console.log(`[Worker] Checking for pending DSAR ${EMAIL_DRAFT_MODE ? 'drafts to create' : 'emails to send'}...`);
    try {
        const query = `
            SELECT c.id as case_id, c.lender, c.contact_id, c.reference_specified,
                   cnt.first_name, cnt.last_name, cnt.email as client_email
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
                const lenderCategory = getLenderCategory(record.lender);

                console.log(`[Worker] 📧 Processing DSAR for Case ${record.case_id}, Lender: ${record.lender} (Category ${lenderCategory}), Client: ${clientName}`);

                // Handle Category 3: Confirmation Required - confirmation email sent at claim creation, now create DSAR draft
                // Category 3 is processed the same as Category 1 (no ID documents required)

                // Category 4: Client verification email sent at claim creation, now create DSAR draft like other categories

                // Handle Category 5: DSAR Not Allowed
                if (lenderCategory === 5) {
                    console.log(`[Worker] ❌ Category 5 lender: DSAR not allowed for ${record.lender}`);
                    await pool.query(
                        `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                        [record.case_id]
                    );
                    await pool.query(
                        `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                         VALUES ($1, $2, 'system', 'worker', 'dsar_blocked', 'claims', $3)`,
                        [record.contact_id, record.case_id, `DSAR not allowed for ${record.lender} - please contact support for manual processing`]
                    );
                    continue;
                }

                // Category 1 & 2: Send DSAR with appropriate documents
                const includeIdDocuments = (lenderCategory === 2); // Only include ID for Category 2
                const requireIdDocuments = (lenderCategory === 2); // Category 2 requires ID
                const includePreviousAddress = true; // Include if available, skip if not
                const requireCoverLetter = (lenderCategory === 1); // Category 1 requires Cover Letter

                const emailResult = await sendDocumentsToLender(
                    record.lender,
                    clientName,
                    record.contact_id,
                    folderName,
                    record.case_id,
                    record.reference_specified,
                    includeIdDocuments,
                    requireIdDocuments,
                    includePreviousAddress,
                    requireCoverLetter
                );

                console.log(`[Worker] 📧 DSAR result for Case ${record.case_id}:`, JSON.stringify(emailResult));

                if (emailResult.success) {
                    const statusMessage = EMAIL_DRAFT_MODE
                        ? `DSAR draft created for Case ${record.case_id} (${record.lender})`
                        : `DSAR email sent for Case ${record.case_id} (${record.lender})`;

                    await pool.query(
                        `UPDATE cases SET status = 'DSAR Sent to Lender', dsar_sent = true, dsar_sent_at = NOW() WHERE id = $1`,
                        [record.case_id]
                    );

                    // Log to action timeline
                    await pool.query(
                        `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                         VALUES ($1, $2, 'system', 'worker', 'dsar_sent', 'claims', $3)`,
                        [record.contact_id, record.case_id, `DSAR ${EMAIL_DRAFT_MODE ? 'draft created' : 'sent'} to ${record.lender} (${emailResult.email})`]
                    );

                    console.log(`[Worker] ✅ ${statusMessage}`);
                } else {
                    console.log(`[Worker] ⚠️ DSAR not ${EMAIL_DRAFT_MODE ? 'drafted' : 'sent'} for Case ${record.case_id}: ${emailResult.reason}${emailResult.error ? ' - ' + emailResult.error : ''}`);
                    if (emailResult.reason === 'no_email') {
                        // No email for this lender - revert to LOA Signed so user knows action is needed
                        await pool.query(
                            `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                            [record.case_id]
                        );
                        // Log to action timeline
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'dsar_failed', 'claims', $3)`,
                            [record.contact_id, record.case_id, `DSAR failed for ${record.lender} - no email address available. Status reverted to LOA Signed.`]
                        );
                        console.log(`[Worker] ⚠️ Status reverted to 'LOA Signed' for Case ${record.case_id} - no lender email`);
                    } else if (emailResult.reason === 'send_failed' || emailResult.reason === 'draft_failed') {
                        console.error(`[Worker] ❌ ${EMAIL_DRAFT_MODE ? 'Draft creation' : 'Email send'} FAILED for Case ${record.case_id}. Error: ${emailResult.error}`);
                        // Revert to LOA Signed so it doesn't loop forever
                        await pool.query(
                            `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                            [record.case_id]
                        );
                        // Log to action timeline
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'dsar_failed', 'claims', $3)`,
                            [record.contact_id, record.case_id, `DSAR ${EMAIL_DRAFT_MODE ? 'draft creation' : 'send'} failed for ${record.lender}. Error: ${emailResult.error}. Status reverted to LOA Signed.`]
                        );
                        console.log(`[Worker] ⚠️ Status reverted to 'LOA Signed' for Case ${record.case_id} - ${emailResult.reason}`);
                    } else if (emailResult.reason === 'missing_required_docs') {
                        // Missing LOA - revert to LOA Signed so user knows action is needed
                        await pool.query(
                            `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                            [record.case_id]
                        );
                        // Log to action timeline
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'dsar_failed', 'claims', $3)`,
                            [record.contact_id, record.case_id, `DSAR failed for ${record.lender} - missing LOA document. Status reverted to LOA Signed.`]
                        );
                        console.log(`[Worker] ⚠️ Status reverted to 'LOA Signed' for Case ${record.case_id} - missing LOA`);
                    } else if (emailResult.reason === 'missing_id_documents') {
                        // Category 2 lenders require ID - fail and log
                        await pool.query(
                            `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                            [record.case_id]
                        );
                        // Log to action timeline with clear message
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'dsar_blocked', 'claims', $3)`,
                            [record.contact_id, record.case_id, `⚠️ No ID document available - cannot send DSAR for ${record.lender}. Please upload ID document in Documents or Claim Documents section.`]
                        );
                        console.log(`[Worker] ⚠️ Status reverted to 'LOA Signed' for Case ${record.case_id} - missing ID documents (required for ${record.lender})`);
                    } else if (emailResult.reason === 'missing_cover_letter') {
                        // Category 1 lenders require Cover Letter - fail and log
                        await pool.query(
                            `UPDATE cases SET status = 'LOA Signed' WHERE id = $1`,
                            [record.case_id]
                        );
                        // Log to action timeline with clear message
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'dsar_blocked', 'claims', $3)`,
                            [record.contact_id, record.case_id, `⚠️ Missing Cover Letter - cannot send DSAR for ${record.lender}. Both LOA and Cover Letter are required.`]
                        );
                        console.log(`[Worker] ⚠️ Status reverted to 'LOA Signed' for Case ${record.case_id} - missing Cover Letter (required for ${record.lender})`);
                    }
                }
            } catch (err) {
                console.error(`[Worker] ❌ Error sending DSAR for Case ${record.case_id}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[Worker] DSAR Email Process Error:', error);
    }
};

// --- DSAR OVERDUE: Mark cases as overdue after 33 days ---
const markOverdueDSARs = async () => {
    console.log('[Worker] Checking for DSAR cases to mark as overdue...');
    try {
        // Production: 33 days
        const query = `
            UPDATE cases
            SET status = 'DSAR Overdue'
            WHERE status = 'DSAR Sent to Lender'
            AND dsar_sent_at IS NOT NULL
            AND dsar_sent_at < NOW() - INTERVAL '33 days'
            RETURNING id
        `;
        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log('[Worker] No DSAR cases to mark as overdue.');
        } else {
            console.log(`[Worker] ✅ Marked ${rows.length} case(s) as DSAR Overdue: ${rows.map(r => r.id).join(', ')}`);

            // Log each to action timeline with timestamp
            const timestamp = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            for (const row of rows) {
                await pool.query(
                    `INSERT INTO action_logs (claim_id, actor_type, actor_id, action_type, action_category, description)
                     VALUES ($1, 'system', 'worker', 'status_change', 'claims', $2)`,
                    [row.id, `[${timestamp}] Status automatically changed to DSAR Overdue after 33 days with no response from lender`]
                );
            }
        }
    } catch (error) {
        console.error('[Worker] DSAR Overdue Mark Error:', error);
    }
};

// --- DSAR OVERDUE: Send notification emails ---
const sendOverdueNotifications = async () => {
    console.log('[Worker] Checking for overdue DSAR notifications to send...');
    try {
        const query = `
            SELECT c.id as case_id, c.lender, c.contact_id, c.reference_specified,
                   cnt.first_name, cnt.last_name, cnt.email as client_email
            FROM cases c
            JOIN contacts cnt ON c.contact_id = cnt.id
            WHERE c.status = 'DSAR Overdue'
            AND (c.dsar_overdue_notified IS NULL OR c.dsar_overdue_notified = false)
            LIMIT 20
        `;
        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log('[Worker] No overdue DSAR notifications to send.');
            return;
        }

        console.log(`[Worker] Found ${rows.length} overdue DSAR notification(s) to send.`);

        for (const record of rows) {
            try {
                const clientName = `${record.first_name} ${record.last_name}`;
                const lenderName = record.lender;
                const referenceNo = record.reference_specified || `${record.first_name} ${record.last_name}`;
                const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

                console.log(`[Worker] 📧 Sending overdue notifications for Case ${record.case_id}, Client: ${clientName}, Lender: ${lenderName}`);

                // --- 1. Create Draft for Lender ---
                const lenderData = allLendersData.find(l => l.lender?.toUpperCase() === lenderName?.toUpperCase());
                const lenderEmail = lenderData?.email || null;
                const lenderAddress = lenderData?.address ?
                    `${lenderData.address.company_name || ''}\n${lenderData.address.first_line_address || ''}\n${lenderData.address.town_city || ''}\n${lenderData.address.postcode || ''}`.trim()
                    : lenderName;

                if (lenderEmail && graphClient) {
                    const lenderHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px 40px; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Fast Action Claims</h1>
                            <p style="color: #a8c5e2; margin: 5px 0 0 0; font-size: 14px;">Legal Representatives</p>
                        </td>
                    </tr>
                    <!-- Alert Banner -->
                    <tr>
                        <td style="background-color: #dc3545; padding: 15px 40px;">
                            <p style="color: #ffffff; margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">⚠️ Final Notice – Urgent Response Required</p>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #666; font-size: 14px; margin: 0 0 20px 0;"><strong>Date:</strong> ${currentDate}</p>
                            <div style="background-color: #f8f9fa; padding: 15px 20px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #1e3a5f;">
                                <p style="color: #333; font-size: 14px; margin: 0;"><strong>To:</strong><br/>${lenderAddress.replace(/\n/g, '<br/>')}</p>
                            </div>
                            <p style="color: #1e3a5f; font-size: 16px; font-weight: 600; margin: 0 0 20px 0;">Re: Outstanding Data Subject Access Request – ${referenceNo}</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">Dear Sir/Madam,</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">We act on behalf of our client, <strong>${clientName}</strong>, and write further to our Data Subject Access Request submitted over 33 days ago, to which we have not yet received a response.</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">As you are aware, under <strong>Article 12(3) of the UK General Data Protection Regulation (UK GDPR)</strong>, you are required to respond to a DSAR without undue delay and, at the latest, within one calendar month of receipt. This statutory deadline has now passed.</p>
                            <div style="background-color: #fff3cd; padding: 15px 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                <p style="color: #856404; font-size: 14px; margin: 0;">⚠️ Failure to comply with the UK GDPR may result in a complaint being lodged with the <strong>Information Commissioner's Office (ICO)</strong>, which has the authority to investigate and take enforcement action, including the imposition of significant fines.</p>
                            </div>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">We respectfully request that you provide all personal data held on our client without further delay. If we do not receive a substantive response within <strong style="color: #dc3545;">14 days</strong> of the date of this letter, we will have no alternative but to escalate this matter to the ICO.</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">Please find attached a copy of the original DSAR, along with identification and Letter of Authority, for your reference.</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 25px 0;">We trust this matter will now receive your urgent attention.</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 5px 0;">Yours faithfully,</p>
                            <p style="color: #1e3a5f; font-size: 16px; font-weight: 600; margin: 0;"><strong>Fast Action Claims</strong></p>
                            <p style="color: #666; font-size: 14px; margin: 5px 0 0 0;">On behalf of ${clientName}</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
                            <p style="color: #666; font-size: 12px; margin: 0 0 10px 0; text-align: center;"><strong>Fast Action Claims</strong> | Consumer Rights Specialists</p>
                            <p style="color: #999; font-size: 11px; margin: 0; text-align: center;">This email and any attachments are confidential and intended solely for the addressee.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                    `;

                    // Check if this lender should send directly (bypass draft mode)
                    const shouldSendDirectly = DIRECT_SEND_LENDERS.has(normalizeLenderName(lenderName));
                    const overdueSubject = `Final Notice – Outstanding Data Subject Access Request (DSAR) – ${referenceNo}`;

                    if (shouldSendDirectly) {
                        // DIRECT SEND for LOANS 2 GO, TEST, etc.
                        console.log(`[Worker] 📧 DIRECT SEND OVERDUE: ${lenderName} is in direct send list - sending immediately`);
                        try {
                            const mailOptions = {
                                from: '"DSAR Team - Fast Action Claims" <DSAR@fastactionclaims.co.uk>',
                                to: lenderEmail,
                                subject: overdueSubject,
                                html: lenderHtml
                            };

                            const info = await lenderEmailTransporter.sendMail(mailOptions);
                            console.log(`[Worker] ✅ Overdue email SENT directly to ${lenderName} (${lenderEmail}). MessageId: ${info.messageId}`);

                            // Log success
                            const successTimestamp = new Date().toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', hour12: false
                            });
                            await pool.query(
                                `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                                 VALUES ($1, $2, 'system', 'worker', 'overdue_email_sent', 'claims', $3)`,
                                [record.contact_id, record.case_id, `[${successTimestamp}] DSAR Overdue email sent directly to ${lenderName} (${lenderEmail})`]
                            );
                        } catch (sendErr) {
                            console.error(`[Worker] ❌ Failed to send overdue email for Case ${record.case_id}:`, sendErr.message);
                            const failTimestamp = new Date().toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', hour12: false
                            });
                            await pool.query(
                                `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                                 VALUES ($1, $2, 'system', 'worker', 'overdue_send_failed', 'claims', $3)`,
                                [record.contact_id, record.case_id, `[${failTimestamp}] Failed to send overdue email to ${lenderName}: ${sendErr.message}`]
                            );
                        }
                    } else {
                        // DRAFT MODE for other lenders
                        try {
                            const draftMessage = {
                                subject: overdueSubject,
                                body: {
                                    contentType: 'HTML',
                                    content: lenderHtml
                                },
                                toRecipients: [{
                                    emailAddress: {
                                        address: lenderEmail
                                    }
                                }]
                            };

                            await graphClient
                                .api(`/users/${DSAR_MAILBOX}/messages`)
                                .post(draftMessage);

                            console.log(`[Worker] ✅ Lender overdue draft created for Case ${record.case_id} to ${lenderEmail}`);
                        } catch (draftErr) {
                            console.error(`[Worker] ❌ Failed to create lender draft for Case ${record.case_id}:`, draftErr.message);
                            // Log failure to action timeline
                            const failTimestamp = new Date().toLocaleString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', hour12: false
                            });
                            await pool.query(
                                `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                                 VALUES ($1, $2, 'system', 'worker', 'overdue_draft_failed', 'claims', $3)`,
                                [record.contact_id, record.case_id, `[${failTimestamp}] Failed to create overdue lender draft for ${lenderName}: ${draftErr.message}`]
                            );
                        }
                    }
                } else {
                    console.log(`[Worker] ⚠️ No lender email found for ${lenderName} - skipping lender draft`);
                }

                // --- 2. Send Email to Client ---
                if (record.client_email) {
                    const clientHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px 40px; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Fast Action Claims</h1>
                            <p style="color: #a8c5e2; margin: 5px 0 0 0; font-size: 14px;">Your Claim Update</p>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #333; font-size: 18px; font-weight: 600; margin: 0 0 20px 0;">Hi ${record.first_name},</p>
                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">We just wanted to give you a quick update on your claim against <strong style="color: #1e3a5f;">${lenderName}</strong>.</p>

                            <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2d5a87;">
                                <p style="color: #1e3a5f; font-size: 15px; line-height: 1.7; margin: 0;">📋 We've sent a formal data request to the lender, but unfortunately, they haven't responded within the expected timeframe. <strong>Don't worry</strong>—this isn't unusual, and we're on it!</p>
                            </div>

                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 15px 0;">Our team has now <strong>escalated the matter</strong> and sent a final reminder to ensure they provide the information we need. If we still don't hear back, we'll be taking further steps to push things forward.</p>

                            <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745;">
                                <p style="color: #155724; font-size: 15px; line-height: 1.7; margin: 0;">✅ Rest assured, we're actively working on your case, and we'll keep you updated as soon as we have more news.</p>
                            </div>

                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 25px 0;">If you have any questions in the meantime, feel free to reach out—we're here to help!</p>

                            <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 5px 0;">Best regards,</p>
                            <p style="color: #1e3a5f; font-size: 16px; font-weight: 600; margin: 0;"><strong>The Fast Action Claims Team</strong></p>
                        </td>
                    </tr>
                    <!-- Contact Section -->
                    <tr>
                        <td style="padding: 0 40px 30px 40px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa; border-radius: 8px;">
                                <tr>
                                    <td style="padding: 20px; text-align: center;">
                                        <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;"><strong>Need to get in touch?</strong></p>
                                        <p style="color: #1e3a5f; font-size: 14px; margin: 0;">📧 info@fastactionclaims.co.uk</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 25px 40px; border-radius: 0 0 8px 8px;">
                            <p style="color: #a8c5e2; font-size: 12px; margin: 0 0 10px 0; text-align: center;"><strong style="color: #ffffff;">Fast Action Claims</strong> | Consumer Rights Specialists</p>
                            <p style="color: #7a9cc6; font-size: 11px; margin: 0; text-align: center;">Helping you get the compensation you deserve</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                    `;

                    try {
                        await clientEmailTransporter.sendMail({
                            from: '"Fast Action Claims" <info@fastactionclaims.co.uk>',
                            to: record.client_email,
                            subject: `Quick Update on Your Claim – ${lenderName}`,
                            html: clientHtml
                        });

                        console.log(`[Worker] ✅ Client overdue email sent for Case ${record.case_id} to ${record.client_email}`);
                    } catch (sendErr) {
                        console.error(`[Worker] ❌ Failed to send client email for Case ${record.case_id}:`, sendErr.message);
                        // Log failure to action timeline
                        const failTimestamp = new Date().toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: false
                        });
                        await pool.query(
                            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                             VALUES ($1, $2, 'system', 'worker', 'overdue_email_failed', 'claims', $3)`,
                            [record.contact_id, record.case_id, `[${failTimestamp}] Failed to send overdue client email to ${record.client_email}: ${sendErr.message}`]
                        );
                    }
                } else {
                    console.log(`[Worker] ⚠️ No client email for Case ${record.case_id} - skipping client notification`);
                }

                // --- 3. Mark as notified ---
                await pool.query(
                    `UPDATE cases SET dsar_overdue_notified = true WHERE id = $1`,
                    [record.case_id]
                );

                // Log to action timeline with timestamp
                const successTimestamp = new Date().toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                await pool.query(
                    `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                     VALUES ($1, $2, 'system', 'worker', 'overdue_notification', 'claims', $3)`,
                    [record.contact_id, record.case_id, `[${successTimestamp}] DSAR Overdue notifications sent - Draft to ${lenderName}${lenderEmail ? ` (${lenderEmail})` : ''}, Email to client${record.client_email ? ` (${record.client_email})` : ''}`]
                );

            } catch (err) {
                console.error(`[Worker] ❌ Error sending overdue notifications for Case ${record.case_id}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[Worker] DSAR Overdue Notification Error:', error);
    }
};

// --- CATEGORY 3 CONFIRMATION EMAIL PROCESSING ---
// Get misspelled alternatives for a Category 3 lender
function getCategory3Alternatives(lenderName) {
    const normalized = lenderName.toUpperCase().trim();
    return CATEGORY_3_CONFIRMATION_LENDERS[normalized] || [];
}

// Process pending Category 3 confirmation emails
const processPendingCategory3Confirmations = async () => {
    console.log('[Worker] Checking for pending Category 3 confirmation emails...');
    try {
        // Get pending confirmations where email hasn't been sent yet
        // Only get 'confirm' action records - we'll find the matching reject token for each
        const query = `
            SELECT p.id, p.contact_id, p.lender, p.token as confirm_token,
                   c.first_name, c.last_name, c.email
            FROM pending_lender_confirmations p
            JOIN contacts c ON p.contact_id = c.id
            WHERE p.email_sent = false
            AND p.action = 'confirm'
            AND p.used = false
            LIMIT 10
        `;
        const { rows } = await pool.query(query);

        if (rows.length === 0) {
            console.log('[Worker] No pending Category 3 confirmation emails to send.');
            return;
        }

        console.log(`[Worker] Found ${rows.length} pending Category 3 confirmation email(s) to send.`);

        for (const record of rows) {
            try {
                if (!record.email) {
                    console.log(`[Worker] ⚠️ No email for contact ${record.contact_id} - skipping Category 3 confirmation`);
                    // Mark as sent to avoid retrying
                    await pool.query(
                        `UPDATE pending_lender_confirmations SET email_sent = true WHERE id = $1`,
                        [record.id]
                    );
                    continue;
                }

                // Get the matching reject token for this contact and lender
                const rejectResult = await pool.query(
                    `SELECT token FROM pending_lender_confirmations
                     WHERE contact_id = $1 AND lender = $2 AND action = 'reject' AND used = false
                     ORDER BY created_at DESC LIMIT 1`,
                    [record.contact_id, record.lender]
                );

                if (rejectResult.rows.length === 0) {
                    console.error(`[Worker] ❌ No reject token found for contact ${record.contact_id}, lender ${record.lender}`);
                    continue;
                }

                const rejectToken = rejectResult.rows[0].token;
                const lenderName = record.lender;
                const alternatives = getCategory3Alternatives(lenderName);
                const alternativeName = alternatives[0] || lenderName;
                const clientName = `${record.first_name} ${record.last_name}`;

                // Auto-detect environment: PM2 = production, otherwise local
                const isProduction = process.env.PM2_HOME || process.env.NODE_ENV === 'production';
                const FRONTEND_URL = isProduction
                    ? 'http://rowanroseclaims.co.uk'
                    : 'http://localhost:3000';
                const confirmUrl = `${FRONTEND_URL}/confirm-lender/${record.confirm_token}`;
                const rejectUrl = `${FRONTEND_URL}/confirm-lender/${rejectToken}`;

                console.log(`[Worker] 📧 Sending Category 3 confirmation email to ${record.email} for ${lenderName}`);

                const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="620" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 40px 45px; text-align: center;">
                            <h1 style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 1px; margin: 0;">ROWAN ROSE SOLICITORS</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 45px;">
                            <h2 style="color: #0f172a; font-size: 22px; margin: 0 0 8px; font-weight: 700; text-align: center;">Confirm Your Lender</h2>
                            <p style="color: #64748b; font-size: 16px; margin: 0 0 30px; text-align: center;">Hi ${record.first_name}, we need a quick confirmation</p>

                            <!-- Lender Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f1f5f9; border-radius: 12px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 25px; text-align: center;">
                                        <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">You selected:</p>
                                        <p style="color: #0f172a; font-size: 26px; font-weight: 700; margin: 0;">${lenderName}</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin: 0 0 30px;">
                                Please click the button below to confirm if this is the correct lender for your claim.
                            </p>

                            <!-- Single Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="center">
                                        <a href="${confirmUrl}" style="display: inline-block; background: #1e3a5f; color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                            Confirm Your Selection
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 25px 0 0;">
                                This link will expire in 7 days
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background: #f8fafc; padding: 25px 45px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="color: #64748b; font-size: 13px; margin: 0;">Rowan Rose Solicitors Ltd | 0161 533 0444</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
                `;

                // Send the email using irlEmailTransporter (irl@rowanrose.co.uk)
                await irlEmailTransporter.sendMail({
                    from: '"Rowan Rose Solicitors" <irl@rowanrose.co.uk>',
                    to: record.email,
                    subject: `Confirm Your Lender Selection - ${lenderName}`,
                    html: emailHtml
                });

                console.log(`[Worker] ✅ Category 3 confirmation email sent to ${record.email} for ${lenderName}`);

                // Mark email as sent for both confirm and reject tokens
                await pool.query(
                    `UPDATE pending_lender_confirmations SET email_sent = true
                     WHERE contact_id = $1 AND lender = $2 AND used = false`,
                    [record.contact_id, record.lender]
                );

                // Log to action timeline
                const timestamp = new Date().toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                await pool.query(
                    `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                     VALUES ($1, 'system', 'worker', 'category3_email_sent', 'claims', $2, $3)`,
                    [
                        record.contact_id,
                        `[${timestamp}] ${lenderName} confirmation email sent to ${record.email}`,
                        JSON.stringify({ lender: lenderName, email: record.email })
                    ]
                );

            } catch (err) {
                console.error(`[Worker] ❌ Error sending Category 3 confirmation for contact ${record.contact_id}:`, err.message);

                // Log failure to action timeline
                const failTimestamp = new Date().toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                await pool.query(
                    `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                     VALUES ($1, 'system', 'worker', 'category3_email_failed', 'claims', $2)`,
                    [record.contact_id, `[${failTimestamp}] Failed to send ${record.lender} confirmation email to ${record.email}: ${err.message}`]
                );
            }
        }
    } catch (error) {
        console.error('[Worker] Category 3 Confirmation Email Error:', error);
    }
};

// --- DOCUMENT EXPIRY & CHASE PROCESSOR ---
const processDocumentExpiry = async () => {
    try {
        // STEP 1: Expire documents that are 30+ days since sent_at
        const { rows: toExpire } = await pool.query(
            `SELECT d.id, d.name, d.contact_id
             FROM documents d
             WHERE d.document_status IN ('Sent', 'Viewed')
               AND d.sent_at IS NOT NULL
               AND d.sent_at < NOW() - INTERVAL '30 days'`
        );

        for (const doc of toExpire) {
            await pool.query(
                `UPDATE documents SET document_status = 'Expired', updated_at = NOW() WHERE id = $1`,
                [doc.id]
            );
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'system', 'system', 'System', 'document_expired', 'documents', $2, $3, NOW())`,
                [doc.contact_id, `Document "${doc.name}" expired after 30 days without completion`, JSON.stringify({ document_id: doc.id })]
            );
            // Cancel any active chase workflow
            await pool.query(
                `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW()
                 WHERE workflow_type = 'document_chase' AND metadata->>'document_id' = $1 AND status = 'active'`,
                [doc.id.toString()]
            );
        }

        if (toExpire.length > 0) {
            console.log(`[Worker] Expired ${toExpire.length} documents (30+ days)`);
        }

        // STEP 2: Process due chase emails
        const { rows: dueChases } = await pool.query(
            `SELECT wt.id as trigger_id, wt.client_id, wt.current_step, wt.total_steps, wt.metadata,
                    c.email, c.first_name, c.last_name,
                    d.id as doc_id, d.name as doc_name, d.document_status, d.tracking_token, d.sent_at
             FROM workflow_triggers wt
             JOIN contacts c ON wt.client_id = c.id
             JOIN documents d ON d.id = (wt.metadata->>'document_id')::int
             WHERE wt.workflow_type = 'document_chase'
               AND wt.status = 'active'
               AND wt.next_action_at <= NOW()
               AND d.document_status IN ('Sent', 'Viewed')`
        );

        const isProduction = process.env.PM2_HOME || process.env.NODE_ENV === 'production';
        const APP_BASE_URL = isProduction
            ? 'http://rowanroseclaims.co.uk'
            : 'http://localhost:5000';

        // Chase schedule: Day 3, 10, 17, 24, 30 from sent_at
        const dayOffsets = [3, 10, 17, 24, 30];

        for (const chase of dueChases) {
            const step = chase.current_step;
            const trackingUrl = `${APP_BASE_URL}/api/documents/track/${chase.tracking_token}/view`;
            const declineUrl = `${APP_BASE_URL}/api/documents/track/${chase.tracking_token}/decline`;

            // Send chase email
            if (!EMAIL_DRAFT_MODE && chase.email) {
                try {
                    await clientEmailTransporter.sendMail({
                        from: '"Fast Action Claims" <info@fastactionclaims.co.uk>',
                        to: chase.email,
                        subject: `Reminder: Action Required - ${chase.doc_name}`,
                        html: `
                            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                                <div style="background:linear-gradient(135deg,#1E3A5F,#0f172a);padding:24px;text-align:center">
                                    <span style="color:white;font-size:20px;font-weight:bold">ROWAN ROSE SOLICITORS</span>
                                </div>
                                <div style="padding:32px;background:#fff">
                                    <p>Dear ${chase.first_name},</p>
                                    <p>This is a friendly reminder that your document <strong>${chase.doc_name}</strong> requires your attention.</p>
                                    <p>Please click the button below to view and complete it:</p>
                                    <div style="text-align:center;margin:24px 0">
                                        <a href="${trackingUrl}" style="display:inline-block;background:#1E3A5F;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold">View Document</a>
                                    </div>
                                    <p style="color:#666;font-size:13px">This document will expire 30 days from when it was first sent to you.</p>
                                    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
                                    <p style="color:#999;font-size:12px">If you wish to decline this document, <a href="${declineUrl}" style="color:#be123c">click here</a>.</p>
                                </div>
                            </div>
                        `
                    });
                    console.log(`[Worker] Chase email sent (step ${step}/${chase.total_steps}) for doc ${chase.doc_id} to ${chase.email}`);
                } catch (emailErr) {
                    console.error(`[Worker] Chase email failed for doc ${chase.doc_id}:`, emailErr.message);
                }
            } else {
                console.log(`[Worker] Chase step ${step} for doc ${chase.doc_id} (DRAFT MODE or no email)`);
            }

            // Log chase
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'system', 'system', 'System', 'document_chase_sent', 'documents', $2, $3, NOW())`,
                [chase.client_id, `Chase email step ${step} of 5 for document "${chase.doc_name}"`, JSON.stringify({ document_id: chase.doc_id, step })]
            );

            // Advance to next step or complete
            const nextStep = step + 1;
            if (nextStep <= 5) {
                const nextOffset = dayOffsets[nextStep - 1];
                const sentAt = chase.sent_at ? new Date(chase.sent_at) : new Date();
                const nextAt = new Date(sentAt.getTime() + nextOffset * 86400000);
                await pool.query(
                    `UPDATE workflow_triggers SET current_step = $1, next_action_at = $2, next_action_description = $3 WHERE id = $4`,
                    [nextStep, nextAt.toISOString(), `Chase step ${nextStep} - Day ${nextOffset}`, chase.trigger_id]
                );
            } else {
                await pool.query(
                    `UPDATE workflow_triggers SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                    [chase.trigger_id]
                );
            }
        }

        if (dueChases.length > 0) {
            console.log(`[Worker] Processed ${dueChases.length} document chase(s)`);
        }
    } catch (err) {
        console.error('[Worker] Document expiry/chase error:', err);
    }
};

// --- RUNNER ---
console.log('Starting LOA Background Worker...');

// Combined runner: check for DSAR emails and other tasks (LOA generation moved to Lambda)
const runWorkerCycle = async () => {
    // LOA generation removed - now handled by Lambda via triggerPdfGenerator()
    await processPendingDSAREmails();
    // Check for DSAR cases that have been waiting 33 days and mark as overdue
    await markOverdueDSARs();
    // Send notifications for newly overdue cases
    await sendOverdueNotifications();
    // Send pending Category 3 confirmation emails
    await processPendingCategory3Confirmations();
    // Process document expiry (30-day) and chase emails (Day 3, 10, 17, 24, 30)
    await processDocumentExpiry();
};

// Run immediately on start (with small delay for DB migration)
setTimeout(() => {
    runWorkerCycle();
    // Then run every 2 minutes
    setInterval(() => {
        runWorkerCycle();
    }, 120000);
}, 5000);
