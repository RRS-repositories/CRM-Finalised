/**
 * PDF Generator Module for EC2
 * Handles DOCX template filling and PDF conversion
 */

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReport } from 'docx-templates';
import { convertDocxToPdf } from './oo-converter.js';
import { getLenderAddress, getLenderEmail } from './lender-utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'client.landing.page';
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
const s3Client = new S3Client({ region: S3_REGION });

/**
 * Fetch file from S3 as buffer
 */
async function fetchFromS3(key) {
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        }));

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (err) {
        console.error(`Failed to fetch from S3 (${key}):`, err.message);
        return null;
    }
}

/**
 * Check if S3 object exists
 */
async function checkS3ObjectExists(key) {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        }));
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Upload buffer to S3 and get signed URL
 */
async function uploadToS3(buffer, key, contentType = 'application/pdf') {
    await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType
    }));

    const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        }),
        { expiresIn: 604800 } // 7 days (max for S3 SigV4)
    );

    return signedUrl;
}

/**
 * Build variable map for DOCX template
 */
function buildDocxVariables(contact, caseData, lenderAddress, lenderEmail, signatureBase64 = null) {
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

    // DOCX templates support both flat and nested {{variable}} syntax
    return {
        // Nested structure for templates using {{client.xxx}} and {{claim.xxx}}
        client: {
            fullName: fullName,
            firstName: contact.first_name || '',
            lastName: contact.last_name || '',
            email: contact.email || '',
            phone: contact.phone || '',
            address: clientAddress,
            postcode: contact.postal_code || '',
            previousAddress: contact.previous_address || '—',
            dateOfBirth: dob,
            dob: dob,
        },
        claim: {
            lender: caseData.lender || '',
            value: caseData.claim_value
                ? `£${Number(caseData.claim_value).toLocaleString()}`
                : '',
            reference: fullReference,
            refSpec: refSpec,
        },
        lender: {
            name: caseData.lender || '',
            companyName: lenderAddress?.company_name || caseData.lender || '',
            address: lenderAddress?.first_line_address || '',
            city: lenderAddress?.town_city || '',
            postcode: lenderAddress?.postcode || '',
            email: lenderEmail || '',
        },
        firm: {
            name: 'Fast Action Claims',
            address: '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
            phone: '0161 505 0150',
            sraNumber: '8000843',
        },

        // Flat structure for backward compatibility
        clientFullName: fullName,
        clientFirstName: contact.first_name || '',
        clientLastName: contact.last_name || '',
        clientEmail: contact.email || '',
        clientPhone: contact.phone || '',
        clientAddress: clientAddress,
        clientPostcode: contact.postal_code || '',
        clientPreviousAddress: contact.previous_address || '—',
        clientDateOfBirth: dob,
        clientDOB: dob,
        lenderName: caseData.lender || '',
        claimLender: caseData.lender || '',
        clientId: clientId,
        reference: fullReference,
        refSpec: refSpec,
        claimValue: caseData.claim_value
            ? `£${Number(caseData.claim_value).toLocaleString()}`
            : '',
        lenderCompanyName: lenderAddress?.company_name || caseData.lender || '',
        lenderAddress: lenderAddress?.first_line_address || '',
        lenderCity: lenderAddress?.town_city || '',
        lenderPostcode: lenderAddress?.postcode || '',
        lenderEmail: lenderEmail || '',
        firmName: 'Fast Action Claims',
        firmAddress: '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
        firmPhone: '0161 505 0150',
        sraNumber: '8000843',
        today: today,
        date: today,
        year: String(new Date().getFullYear()),
        signatureImage: signatureBase64 ? `<img src="${signatureBase64}" style="max-width:200px;" />` : '[Signature]',
    };
}

/**
 * Generate PDF from case data
 */
export async function generatePdfFromCase(contact, caseData, documentType, pool) {
    console.log(`[PDF Generator] Starting PDF generation for case ${caseData.id}, type: ${documentType}`);

    // 1. Check for signature
    let signatureBase64 = null;
    if (documentType === 'Cover Letter') {
        const signatureQuery = `
            SELECT key FROM signatures
            WHERE contact_id = $1
            ORDER BY uploaded_at DESC
            LIMIT 1
        `;
        const signatureResult = await pool.query(signatureQuery, [contact.id]);

        if (signatureResult.rows.length > 0) {
            const signatureBuffer = await fetchFromS3(signatureResult.rows[0].key);
            if (signatureBuffer) {
                signatureBase64 = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
            }
        }
    }

    // 2. Get lender details
    const lenderAddress = getLenderAddress(caseData.lender);
    const lenderEmail = getLenderEmail(caseData.lender);

    // 3. Load template from database
    // Map documentType to template field
    const useField = documentType === 'LOA' ? 'use_for_loa' : 'use_for_cover_letter';

    const templateQuery = `
        SELECT s3_key FROM oo_templates
        WHERE ${useField} = TRUE AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
    `;
    const templateResult = await pool.query(templateQuery);

    if (templateResult.rows.length === 0) {
        throw new Error(`No OnlyOffice template found for ${documentType}`);
    }

    const templateKey = templateResult.rows[0].s3_key;
    console.log(`[PDF Generator] Using template: ${templateKey}`);

    // 4. Fetch template from S3
    const templateBuffer = await fetchFromS3(templateKey);
    if (!templateBuffer) {
        throw new Error(`Failed to fetch template from S3: ${templateKey}`);
    }

    // 5. Build variables
    const variables = buildDocxVariables(contact, caseData, lenderAddress, lenderEmail, signatureBase64);
    console.log(`[PDF Generator] Built variables for contact ${contact.id}`);

    // 6. Fill template
    console.log('[PDF Generator] Filling DOCX template with variables...');
    const filledDocx = await createReport({
        template: templateBuffer,
        data: variables,
        cmdDelimiter: ['{{', '}}'],
    });

    // 7. Convert to PDF using OnlyOffice
    console.log('[PDF Generator] Converting DOCX to PDF using OnlyOffice...');
    const pdfBuffer = await convertDocxToPdf(filledDocx, `${documentType}.docx`);

    // 8. Build S3 key with proper naming convention
    const refSpec = `${contact.id}${caseData.id}`;
    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
    const sanitizedLender = (caseData.lender || 'NO_LENDER').replace(/[^a-zA-Z0-9_-]/g, '_');
    const docType = documentType === 'LOA' ? 'LOA' : 'COVER LETTER';
    const fileName = `${refSpec} - ${contactName} - ${sanitizedLender} - ${docType}.pdf`;
    const s3Key = `documents/${contact.id}/${fileName}`;

    // 9. Upload to S3
    console.log(`[PDF Generator] Uploading PDF to S3: ${s3Key}`);
    const signedUrl = await uploadToS3(pdfBuffer, s3Key);

    // 10. Insert document record
    const category = documentType === 'LOA' ? 'LOA' : 'Cover Letter';
    const fileSize = pdfBuffer.length;
    const tags = [caseData.lender, category, documentType, `Case: ${caseData.id}`];
    const insertQuery = `
        INSERT INTO documents (contact_id, name, type, category, url, size, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(insertQuery, [
        contact.id,
        fileName,
        'application/pdf',
        category,
        signedUrl,
        fileSize,
        tags
    ]);

    // 11. Update case status
    const newStatus = documentType === 'LOA' ? 'LOA Uploaded' : 'LOA Signed';
    const updateQuery = `
        UPDATE cases
        SET status = $1, loa_generated = $2, updated_at = NOW()
        WHERE id = $3
    `;
    await pool.query(updateQuery, [newStatus, documentType === 'LOA', caseData.id]);

    console.log(`[PDF Generator] PDF generated successfully: ${fileName}`);

    return {
        success: true,
        fileName,
        signedUrl,
        s3Key
    };
}
