/**
 * Lambda Handler for PDF Generation (LOA and Cover Letter)
 *
 * Event format:
 * {
 *   "caseId": 12345,
 *   "documentType": "LOA" | "COVER_LETTER"
 * }
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pg from 'pg';
import { generatePdf } from './pdf-generator.js';
import { loadTemplate, renderTemplate, buildVariableMap } from './template-renderer.js';
import { renderDocxTemplate, buildDocxVariables, fetchDocxFromS3 } from './docx-renderer.js';
import { getLenderAddress, getLenderEmail } from './lender-utils.js';

const { Pool } = pg;

// Environment variables (set in Lambda configuration)
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'client.landing.page';
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
const TEMPLATES_BUCKET = process.env.TEMPLATES_BUCKET || S3_BUCKET;

// Initialize clients
const s3Client = new S3Client({ region: S3_REGION });

let pool = null;
function getPool() {
    if (!pool) {
        pool = new Pool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 120000,
            connectionTimeoutMillis: 10000,
        });
    }
    return pool;
}

/**
 * Format previous address from individual columns or JSONB array
 * Shows first address, adds "......" if more addresses exist
 */
function formatPreviousAddress(row) {
    // Try individual columns first
    const addr1 = row.previous_address_line_1;
    const city = row.previous_city;
    const postcode = row.previous_postal_code;
    const addressesJson = row.previous_addresses;

    // Build first address from individual columns
    if (addr1) {
        const parts = [addr1, city, postcode].filter(Boolean);
        const firstAddr = parts.join(', ');

        // Check if there are more addresses in JSONB
        if (Array.isArray(addressesJson) && addressesJson.length > 1) {
            return firstAddr + ' ......';
        }
        return firstAddr;
    }

    // Fallback to JSONB array if individual columns are empty
    if (Array.isArray(addressesJson) && addressesJson.length > 0) {
        const first = addressesJson[0];
        // Handle both formats: {line1, city, county, postalCode} and {address_line_1, city, postal_code}
        const line1 = first.line1 || first.address_line_1 || '';
        const city = first.city || '';
        const county = first.county || '';
        const postcode = first.postalCode || first.postal_code || '';
        const parts = [line1, city, county, postcode].filter(Boolean);
        const firstAddr = parts.join(', ');

        if (addressesJson.length > 1) {
            return firstAddr + ' ......';
        }
        return firstAddr;
    }

    return '';
}

/**
 * Check if signature exists in S3
 */
async function checkSignatureExists(contact) {
    const folderName = `${contact.first_name}_${contact.last_name}_${contact.id}`;
    const signatureKey = `${folderName}/Signatures/signature.png`;

    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: signatureKey
        }));
        return { exists: true, key: signatureKey };
    } catch (err) {
        if (err.name === 'NotFound') {
            // Try signature_2.png pattern
            const signature2Key = `${folderName}/Signatures/signature_2.png`;
            try {
                await s3Client.send(new HeadObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: signature2Key
                }));
                return { exists: true, key: signature2Key };
            } catch {
                return { exists: false, key: null };
            }
        }
        throw err;
    }
}

/**
 * Get signature as base64 from S3
 */
async function getSignatureBase64(signatureKey) {
    if (!signatureKey) return null;

    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: signatureKey
        }));
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch (err) {
        console.error('Failed to get signature:', err);
        return null;
    }
}

/**
 * Fetch case and contact data from database
 */
async function fetchCaseData(caseId) {
    const dbPool = getPool();
    const result = await dbPool.query(`
        SELECT
            c.id as case_id,
            c.lender,
            c.claim_value,
            c.status,
            c.loa_generated,
            con.id as contact_id,
            con.first_name,
            con.last_name,
            con.email,
            con.phone,
            con.address_line_1,
            con.address_line_2,
            con.city,
            con.state_county,
            con.postal_code,
            con.dob,
            con.signature_url,
            con.signature_2_url,
            con.previous_address_line_1,
            con.previous_city as previous_city,
            con.previous_postal_code,
            con.previous_addresses,
            con.ip_address
        FROM cases c
        JOIN contacts con ON c.contact_id = con.id
        WHERE c.id = $1
    `, [caseId]);

    if (result.rows.length === 0) {
        throw new Error(`Case ${caseId} not found`);
    }

    const row = result.rows[0];
    return {
        case: {
            id: row.case_id,
            lender: row.lender,
            claim_value: row.claim_value,
            status: row.status,
            loa_generated: row.loa_generated,
        },
        contact: {
            id: row.contact_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            address_line_1: row.address_line_1,
            address_line_2: row.address_line_2,
            city: row.city,
            state_county: row.state_county,
            postal_code: row.postal_code,
            dob: row.dob,
            signature_url: row.signature_url,
            signature_2_url: row.signature_2_url,
            previous_address: formatPreviousAddress(row),
            ip_address: row.ip_address || '',
        }
    };
}

/**
 * Build S3 key for the PDF
 */
function buildS3Key(contact, caseData, documentType) {
    const folderName = `${contact.first_name}_${contact.last_name}_${contact.id}`;
    const refSpec = `${contact.id}${caseData.id}`;
    const sanitizedLender = (caseData.lender || 'Unknown')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_');

    const docSuffix = documentType === 'LOA' ? 'LOA' : 'COVER LETTER';
    const fileName = `${refSpec} - ${contact.first_name} ${contact.last_name} - ${sanitizedLender} - ${docSuffix}.pdf`;

    return {
        key: `${folderName}/Lenders/${sanitizedLender}/${fileName}`,
        fileName
    };
}

/**
 * Upload PDF to S3 and return signed URL
 */
async function uploadToS3(pdfBuffer, s3Key) {
    await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
    }));

    const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }),
        { expiresIn: 604800 } // 7 days
    );

    return signedUrl;
}

/**
 * Insert or update document record in database
 */
async function upsertDocumentRecord(contact, fileName, url, category, lender) {
    const dbPool = getPool();

    const existing = await dbPool.query(
        'SELECT id FROM documents WHERE contact_id = $1 AND name = $2 LIMIT 1',
        [contact.id, fileName]
    );

    if (existing.rows.length === 0) {
        await dbPool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contact.id, fileName, 'pdf', category, url, 'Auto-generated', [category, lender]]
        );
    } else {
        await dbPool.query(
            'UPDATE documents SET url = $1 WHERE id = $2',
            [url, existing.rows[0].id]
        );
    }
}

/**
 * Update case status
 */
async function updateCaseStatus(caseId, newStatus, setLoaGenerated = false) {
    const dbPool = getPool();

    if (setLoaGenerated) {
        await dbPool.query(
            'UPDATE cases SET status = $1, loa_generated = true WHERE id = $2',
            [newStatus, caseId]
        );
    } else {
        await dbPool.query(
            'UPDATE cases SET status = $1 WHERE id = $2',
            [newStatus, caseId]
        );
    }
}

/**
 * Log action to action_logs table
 */
async function logAction(contactId, caseId, documentType, metadata) {
    const dbPool = getPool();

    try {
        await dbPool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                contactId,
                'system',
                'pdf-generator-lambda',
                'PDF Generator Lambda',
                documentType === 'LOA' ? 'loa_generated' : 'cover_letter_generated',
                'case',
                `${documentType} generated via Lambda`,
                JSON.stringify(metadata)
            ]
        );
    } catch (err) {
        console.warn('Failed to log action:', err.message);
    }
}

/**
 * Fetch HTML template from database
 */
async function fetchHtmlTemplateFromDb(documentType) {
    const dbPool = getPool();
    const templateType = documentType === 'LOA' ? 'LOA' : 'COVER_LETTER';

    try {
        const result = await dbPool.query(
            'SELECT html_content FROM html_templates WHERE template_type = $1 LIMIT 1',
            [templateType]
        );

        if (result.rows.length > 0) {
            return result.rows[0].html_content;
        }
        return null;
    } catch (err) {
        console.warn('Failed to fetch HTML template from database:', err.message);
        return null;
    }
}

/**
 * Generate a document hash for certificate
 */
function generateDocumentHash(contact, caseData) {
    const data = `${contact.id}-${caseData.id}-${caseData.lender}-${Date.now()}`;
    // Simple hash for display purposes
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `FAC-${hex}-${contact.id}${caseData.id}`;
}

/**
 * Render HTML template by replacing variables
 */
function renderHtmlTemplate(htmlTemplate, contact, caseData, lenderAddress, lenderEmail, signatureBase64) {
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const clientId = `RR-${contact.id}`;
    const fullReference = `${clientId}/${caseData.id}`;
    const refSpec = `${contact.id}${caseData.id}`;

    const today = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const clientAddress = [
        contact.address_line_1,
        contact.address_line_2,
        contact.city,
        contact.state_county,
        contact.postal_code
    ].filter(Boolean).join(', ');

    const dob = contact.dob
        ? new Date(contact.dob).toLocaleDateString('en-GB')
        : '';

    // Generate document hash for certificate
    const documentHash = generateDocumentHash(contact, caseData);

    // Build variable map
    const variables = {
        // Client Details
        clientFullName: fullName,
        clientFirstName: contact.first_name || '',
        clientLastName: contact.last_name || '',
        clientEmail: contact.email || '',
        clientPhone: contact.phone || '',
        clientAddress: clientAddress,
        clientAddressLine1: contact.address_line_1 || '',
        clientAddressLine2: contact.address_line_2 || '',
        clientCity: contact.city || '',
        clientCounty: contact.state_county || '',
        clientPostcode: contact.postal_code || '',
        clientPreviousAddress: contact.previous_address || '',
        clientIpAddress: contact.ip_address || '',
        clientDateOfBirth: dob,
        clientDOB: dob,

        // Claim Details
        lenderName: caseData.lender || '',
        claimLender: caseData.lender || '',
        clientId: clientId,
        reference: fullReference,
        refSpec: refSpec,
        claimValue: caseData.claim_value
            ? `£${Number(caseData.claim_value).toLocaleString()}`
            : '',

        // Lender Details
        lenderCompanyName: lenderAddress?.company_name || caseData.lender || '',
        lenderAddress: lenderAddress?.first_line_address || '',
        lenderAddressLine1: lenderAddress?.first_line_address || '',
        lenderCity: lenderAddress?.town_city || '',
        lenderPostcode: lenderAddress?.postcode || '',
        lenderEmail: lenderEmail || '',

        // Firm Details
        firmName: 'Fast Action Claims',
        firmAddress: '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
        firmPhone: '0161 505 0150',
        sraNumber: '8000843',

        // System
        today: today,
        date: today,
        year: String(new Date().getFullYear()),

        // Document Certificate
        documentHash: documentHash,

        // Signature
        signatureImage: signatureBase64
            ? `<img src="${signatureBase64}" style="max-width:200px; height:auto;" />`
            : '[Signature]',
        signatureBase64: signatureBase64 || '',
    };

    // Replace all {{variable}} patterns
    let html = htmlTemplate;
    for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        html = html.replace(pattern, String(value || ''));
    }

    return html;
}

/**
 * Main Lambda Handler
 */
export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));

    // Parse event (supports both direct invocation and API Gateway)
    let caseId, documentType, skipStatusUpdate;

    if (event.body) {
        // API Gateway event
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        caseId = body.caseId;
        documentType = body.documentType;
        skipStatusUpdate = body.skipStatusUpdate || false;
    } else {
        // Direct invocation
        caseId = event.caseId;
        documentType = event.documentType;
        skipStatusUpdate = event.skipStatusUpdate || false;
    }

    if (!caseId || !documentType) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing caseId or documentType' })
        };
    }

    if (!['LOA', 'COVER_LETTER'].includes(documentType)) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'documentType must be LOA or COVER_LETTER' })
        };
    }

    try {
        // 1. Fetch case and contact data
        console.log(`Fetching data for case ${caseId}...`);
        const { case: caseData, contact } = await fetchCaseData(caseId);

        // 2. For LOA, check if signature exists
        let signatureBase64 = null;
        if (documentType === 'LOA') {
            const signatureCheck = await checkSignatureExists(contact);
            if (!signatureCheck.exists) {
                console.log(`No signature found for contact ${contact.id}, skipping LOA generation`);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        status: 'SKIPPED',
                        reason: 'No signature found',
                        caseId,
                        contactId: contact.id
                    })
                };
            }
            signatureBase64 = await getSignatureBase64(signatureCheck.key);
        }

        // 3. Get lender info
        const lenderAddress = getLenderAddress(caseData.lender);
        const lenderEmail = getLenderEmail(caseData.lender);

        // 4. Generate HTML based on document type
        let html;
        let templateName = 'unknown';

        if (documentType === 'LOA') {
            // LOA: Use HTML template from database
            console.log('Loading LOA HTML template from database...');
            const htmlTemplate = await fetchHtmlTemplateFromDb('LOA');

            if (htmlTemplate) {
                console.log('Using HTML template from database for LOA');
                templateName = 'HTML Template (LOA)';
                html = renderHtmlTemplate(htmlTemplate, contact, caseData, lenderAddress, lenderEmail, signatureBase64);
            } else {
                // Fall back to bundled HTML file
                console.log('No HTML template in DB, using bundled loa-template.html...');
                const fs = await import('fs');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const loaTemplatePath = path.join(__dirname, 'loa-template.html');

                if (fs.existsSync(loaTemplatePath)) {
                    const htmlContent = fs.readFileSync(loaTemplatePath, 'utf-8');
                    templateName = 'Bundled HTML (loa-template.html)';
                    html = renderHtmlTemplate(htmlContent, contact, caseData, lenderAddress, lenderEmail, signatureBase64);
                } else {
                    throw new Error('No LOA HTML template found in database or bundle');
                }
            }
        } else {
            // COVER_LETTER: Use TipTap template from templates-store.json
            console.log('Loading Cover Letter TipTap template...');
            const template = await loadTemplate('COVER_LETTER');

            if (!template) {
                throw new Error('No COVER_LETTER template found in templates-store.json');
            }

            templateName = template.name || 'TipTap Template (Cover Letter)';
            console.log(`Using TipTap template: ${templateName}`);
            const variableMap = buildVariableMap(contact, caseData, lenderAddress, lenderEmail, signatureBase64);
            html = renderTemplate(template, variableMap);
        }

        // 7. Generate PDF
        console.log('Generating PDF...');
        const pdfBuffer = await generatePdf(html);

        // 8. Upload to S3
        const { key: s3Key, fileName } = buildS3Key(contact, caseData, documentType);
        console.log(`Uploading PDF to S3: ${s3Key}`);
        const signedUrl = await uploadToS3(pdfBuffer, s3Key);

        // 9. Insert document record
        const category = documentType === 'LOA' ? 'LOA' : 'Cover Letter';
        await upsertDocumentRecord(contact, fileName, signedUrl, category, caseData.lender);

        // 10. Update case status (skip if requested)
        let newStatus = caseData.status; // Keep current status by default
        if (!skipStatusUpdate) {
            newStatus = documentType === 'LOA' ? 'LOA Uploaded' : 'LOA Signed';
            const setLoaGenerated = documentType === 'LOA';
            await updateCaseStatus(caseId, newStatus, setLoaGenerated);
            console.log(`Case ${caseId} status updated to "${newStatus}"`);
        } else {
            console.log(`Case ${caseId} status NOT updated (skipStatusUpdate=true), keeping "${caseData.status}"`);
        }

        // 11. Log action
        await logAction(contact.id, caseId, documentType, {
            caseId,
            lender: caseData.lender,
            templateName: templateName,
            s3Key,
            fileName
        });

        // 12. If LOA was generated, automatically trigger Cover Letter generation
        if (documentType === 'LOA') {
            console.log(`LOA generated, now generating Cover Letter for case ${caseId}...`);
            // Recursive call within the same Lambda invocation
            const coverLetterResult = await handler({
                caseId,
                documentType: 'COVER_LETTER',
                skipStatusUpdate: skipStatusUpdate // Pass through the flag
            });
            console.log('Cover Letter result:', coverLetterResult);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: 'SUCCESS',
                documentType,
                caseId,
                contactId: contact.id,
                s3Key,
                fileName,
                newStatus
            })
        };

    } catch (error) {
        console.error('Error generating PDF:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                status: 'ERROR',
                error: error.message,
                caseId,
                documentType
            })
        };
    }
};
