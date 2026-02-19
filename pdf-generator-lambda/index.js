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
            con.previous_address_line_2
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
            previous_address: [row.previous_address_line_1, row.previous_address_line_2].filter(Boolean).join(', ') || '—',
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
 * Main Lambda Handler
 */
export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));

    // Parse event (supports both direct invocation and API Gateway)
    let caseId, documentType;

    if (event.body) {
        // API Gateway event
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        caseId = body.caseId;
        documentType = body.documentType;
    } else {
        // Direct invocation
        caseId = event.caseId;
        documentType = event.documentType;
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

        // 4. Try DOCX template first, then fall back to JSON/TipTap
        let html;
        let templateName = 'unknown';

        const docxKey = documentType === 'LOA'
            ? 'templates/loa-template.docx'
            : 'templates/cover-letter-template.docx';

        const docxExists = await fetchDocxFromS3(docxKey);

        if (docxExists) {
            // Use DOCX template
            console.log(`Using DOCX template: ${docxKey}`);
            templateName = docxKey;
            const variables = buildDocxVariables(contact, caseData, lenderAddress, lenderEmail, signatureBase64);
            html = await renderDocxTemplate(documentType, variables, signatureBase64);
        } else {
            // Fall back to JSON/TipTap template
            console.log(`DOCX not found, using JSON template for ${documentType}...`);
            const template = await loadTemplate(documentType);
            if (!template) {
                throw new Error(`No ${documentType} template found`);
            }
            templateName = template.name || 'JSON Template';
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

        // 10. Update case status
        const newStatus = documentType === 'LOA' ? 'LOA Uploaded' : 'LOA Signed';
        const setLoaGenerated = documentType === 'LOA';
        await updateCaseStatus(caseId, newStatus, setLoaGenerated);
        console.log(`Case ${caseId} status updated to "${newStatus}"`);

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
                documentType: 'COVER_LETTER'
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
