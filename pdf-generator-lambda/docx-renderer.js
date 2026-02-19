/**
 * DOCX Template Renderer
 * Loads DOCX templates from S3, replaces variables, converts to HTML
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createReport } from 'docx-templates';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'client.landing.page';
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
const s3Client = new S3Client({ region: S3_REGION });

// Logo as base64 (loaded at startup)
let logoBase64 = null;

/**
 * Load logo from file
 */
function loadLogo() {
    const logoPath = path.join(__dirname, 'fac.png');
    if (fs.existsSync(logoPath)) {
        return `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    }
    return null;
}

/**
 * Fetch DOCX template from S3
 */
async function fetchDocxFromS3(templateKey) {
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: templateKey
        }));

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (err) {
        console.error(`Failed to fetch DOCX from S3 (${templateKey}):`, err.message);
        return null;
    }
}

/**
 * Build variable data for DOCX template
 */
export function buildDocxVariables(contact, caseData, lenderAddress, lenderEmail, signatureBase64 = null) {
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

    // DOCX templates use simple {{variable}} syntax
    return {
        // Client Details
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

        // Signature (as image tag for HTML)
        signatureImage: signatureBase64 ? `<img src="${signatureBase64}" style="max-width:200px;" />` : '[Signature]',
    };
}

/**
 * Load and render DOCX template to HTML
 */
export async function renderDocxTemplate(documentType, variables, signatureBuffer = null) {
    if (!logoBase64) {
        logoBase64 = loadLogo();
    }

    const templateKey = documentType === 'LOA'
        ? 'templates/loa-template.docx'
        : 'templates/cover-letter-template.docx';

    console.log(`Fetching DOCX template from S3: ${templateKey}`);
    const docxBuffer = await fetchDocxFromS3(templateKey);

    if (!docxBuffer) {
        throw new Error(`DOCX template not found: ${templateKey}`);
    }

    // Replace variables in DOCX using docx-templates
    console.log('Replacing variables in DOCX...');
    let processedDocx;
    try {
        processedDocx = await createReport({
            template: docxBuffer,
            data: variables,
            cmdDelimiter: ['{{', '}}'],
        });
    } catch (err) {
        console.warn('docx-templates failed, using mammoth directly:', err.message);
        processedDocx = docxBuffer;
    }

    // Convert DOCX to HTML using mammoth
    console.log('Converting DOCX to HTML...');
    const result = await mammoth.convertToHtml({ buffer: processedDocx });
    let html = result.value;

    // Replace any remaining {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        html = html.replace(pattern, String(value || ''));
    }

    // Also try different variable formats
    const variablePatterns = [
        /\{\{client\.fullName\}\}/gi,
        /\{\{client\.address\}\}/gi,
        /\{\{claim\.lender\}\}/gi,
        /\[Client Full Name\]/gi,
        /\[Client Address\]/gi,
        /\[Lender Name\]/gi,
        /\[DD\/MM\/YYYY\]/gi,
        /\[Postcode\]/gi,
        /\[Date\]/gi,
    ];

    const replacements = {
        '{{client.fullName}}': variables.clientFullName,
        '{{client.address}}': variables.clientAddress,
        '{{claim.lender}}': variables.lenderName,
        '[Client Full Name]': variables.clientFullName,
        '[Client Address]': variables.clientAddress,
        '[Lender Name]': variables.lenderName,
        '[DD/MM/YYYY]': variables.clientDOB,
        '[Postcode]': variables.clientPostcode,
        '[Date]': variables.today,
    };

    for (const [pattern, replacement] of Object.entries(replacements)) {
        html = html.split(pattern).join(replacement || '');
    }

    // Wrap in full HTML document with styles
    const fullHtml = wrapInDocument(html, logoBase64);

    return fullHtml;
}

/**
 * Wrap HTML body in full document with styles
 */
function wrapInDocument(bodyHtml, logoBase64) {
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
        p { margin: 0 0 8px 0; }
        h1 { font-size: 14pt; margin: 12px 0; text-align: center; }
        h2 { font-size: 12pt; margin: 10px 0; }
        h3, h4 { font-size: 11pt; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { padding: 5px 8px; border: 1px solid #ccc; }
        ul, ol { margin: 8px 0 8px 20px; padding-left: 10px; }
        li { margin: 4px 0; }
        img { max-width: 100%; }
        .header-logo { width: 120px; margin-bottom: 10px; }
        .signature-img { max-width: 200px; height: auto; }
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
    ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="Fast Action Claims" />` : ''}
    ${bodyHtml}
    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. A list of directors is available at our registered office. We are authorised and regulated by the Solicitors Regulation Authority.
    </div>
</body>
</html>`;
}

export { fetchDocxFromS3 };
