/**
 * Template Renderer Module
 * Loads TipTap templates from S3, resolves variables, converts to HTML
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// S3 configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'client.landing.page';
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
const s3Client = new S3Client({ region: S3_REGION });

// Template cache (per Lambda invocation)
const templateCache = {};

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
 * Fetch template from S3
 */
async function fetchTemplateFromS3(templateKey) {
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: templateKey
        }));

        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const content = Buffer.concat(chunks).toString('utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Failed to fetch template from S3 (${templateKey}):`, err.message);
        return null;
    }
}

/**
 * Load a template by type (LOA or COVER_LETTER)
 * Fetches from S3: templates/loa-master-template.json or templates/cover-letter-master-template.json
 */
export async function loadTemplate(documentType) {
    if (!logoBase64) {
        logoBase64 = loadLogo();
    }

    const templateKey = documentType === 'LOA'
        ? 'templates/loa-master-template.json'
        : 'templates/cover-letter-master-template.json';

    // Check cache first
    if (templateCache[templateKey]) {
        console.log(`Using cached template: ${templateKey}`);
        return templateCache[templateKey];
    }

    console.log(`Fetching template from S3: ${templateKey}`);
    const template = await fetchTemplateFromS3(templateKey);

    if (template) {
        templateCache[templateKey] = template;
        return template;
    }

    console.error(`No template found in S3 for ${documentType}`);
    return null;
}

/**
 * Build variable map from contact and case data
 */
export function buildVariableMap(contact, caseData, lenderAddress, lenderEmail, signatureBase64 = null) {
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
        'client.postcode': contact.postal_code || '',
        'client.previousAddress': contact.previous_address || '—',
        'client.dateOfBirth': dob,
        'client.dob': dob,

        // Claim Details
        'claim.lender': caseData.lender || '',
        'claim.clientId': clientId,
        'claim.reference': fullReference,
        'claim.caseRef': fullReference,
        'claim.refSpec': refSpec,
        'claim.claimValue': caseData.claim_value
            ? `£${Number(caseData.claim_value).toLocaleString()}`
            : '',

        // Lender Details
        'lender.companyName': lenderAddress?.company_name || caseData.lender || '',
        'lender.company_name': lenderAddress?.company_name || caseData.lender || '',
        'lender.address': lenderAddress?.first_line_address || '',
        'lender.first_line_address': lenderAddress?.first_line_address || '',
        'lender.city': lenderAddress?.town_city || '',
        'lender.town_city': lenderAddress?.town_city || '',
        'lender.postcode': lenderAddress?.postcode || '',
        'lender.email': lenderEmail || '',

        // Firm Details
        'firm.name': 'Fast Action Claims',
        'firm.tradingName': 'Fast Action Claims',
        'firm.address': '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
        'firm.phone': '0161 505 0150',
        'firm.sraNumber': '8000843',
        'firm.entity': 'Rowan Rose Ltd',
        'firm.companyNumber': '12916452',

        // System
        'system.today': today,
        'system.year': String(new Date().getFullYear()),

        // Special
        'signature': signatureBase64 || '',
        'logo': logoBase64 || '',

        // Legacy {{mustache}} keys
        '{{fullName}}': fullName,
        '{{firstName}}': contact.first_name || '',
        '{{lastName}}': contact.last_name || '',
        '{{email}}': contact.email || '',
        '{{phone}}': contact.phone || '',
        '{{address}}': clientAddress,
        '{{lender}}': caseData.lender || '',
        '{{clientId}}': clientId,
        '{{reference}}': fullReference,
        '{{today}}': today,
    };
}

/**
 * Resolve variables in TipTap JSON node
 */
function resolveVariables(node, variableMap) {
    if (!node) return node;

    // Replace variable nodes with text
    if (node.type === 'variable') {
        const fieldKey = node.attrs?.fieldKey;
        const resolvedValue = variableMap[fieldKey] || node.attrs?.label || fieldKey || '';
        return {
            type: 'text',
            text: resolvedValue,
        };
    }

    // Handle signature nodes
    if (node.type === 'signature' || node.type === 'signatureImage') {
        const signatureBase64 = variableMap['signature'];
        if (signatureBase64) {
            return {
                type: 'image',
                attrs: {
                    src: signatureBase64,
                    width: 200
                }
            };
        }
        // No signature - return placeholder
        return {
            type: 'paragraph',
            content: [{
                type: 'text',
                text: '[Signature]'
            }]
        };
    }

    // Recurse into content
    if (node.content && Array.isArray(node.content)) {
        node.content = node.content.map(child => resolveVariables(child, variableMap));
    }

    return node;
}

/**
 * Convert TipTap JSON to HTML
 */
function tiptapJsonToHtml(doc, logoBase64) {
    if (!doc || !doc.content) return '';

    const nodes = doc.content;

    // Detect right-aligned header paragraphs
    let headerNodes = [];
    let bodyStartIndex = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
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

    // Render letterhead with logo
    if (headerNodes.length > 0 && logoBase64) {
        const detailsHtml = headerNodes.map(n => nodeToHtml(n)).join('');
        parts.push(`<table class="letterhead" style="width:100%; border:none; border-collapse:collapse; margin-bottom:10px;">
            <tr>
                <td style="width:150px; vertical-align:middle; padding:0;">
                    <img src="${logoBase64}" style="width:120px;" alt="Fast Action Claims" />
                </td>
                <td style="vertical-align:top; text-align:right; padding:0;">${detailsHtml}</td>
            </tr>
        </table>`);
    } else if (headerNodes.length > 0) {
        for (const n of headerNodes) parts.push(nodeToHtml(n));
    }

    // Render body
    for (let i = bodyStartIndex; i < nodes.length; i++) {
        parts.push(nodeToHtml(nodes[i]));
    }

    return parts.join('');
}

/**
 * Convert a single TipTap node to HTML
 */
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
            const styles = [];
            if (node.attrs?.textAlign) styles.push(`text-align: ${node.attrs.textAlign}`);
            const style = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
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
                            const styles = [];
                            if (mark.attrs?.fontSize) styles.push(`font-size: ${mark.attrs.fontSize}`);
                            if (mark.attrs?.color) styles.push(`color: ${mark.attrs.color}`);
                            if (mark.attrs?.fontFamily) styles.push(`font-family: ${mark.attrs.fontFamily}`);
                            if (styles.length > 0) {
                                text = `<span style="${styles.join('; ')}">${text}</span>`;
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

        case 'table':
            return `<table style="width:100%; border-collapse:collapse; border:1px solid #000;">${(node.content || []).map(n => nodeToHtml(n)).join('')}</table>`;

        case 'tableRow':
            return `<tr>${(node.content || []).map(n => nodeToHtml(n)).join('')}</tr>`;

        case 'tableCell':
        case 'tableHeader': {
            const tag = node.type === 'tableHeader' ? 'th' : 'td';
            const styles = ['border: 1px solid #000', 'padding: 8px'];
            if (node.attrs?.colspan) styles.push(`colspan="${node.attrs.colspan}"`);
            return `<${tag} style="${styles.join('; ')}">${(node.content || []).map(n => nodeToHtml(n)).join('')}</${tag}>`;
        }

        default:
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

/**
 * Wrap HTML body in full document with styles
 */
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
        h3, h4 { font-size: 11pt; margin: 4px 0; }
        a { color: #000; text-decoration: underline; }
        img { max-width: 100%; }
        .letterhead img { width: 120px; }
        ul, ol { margin: 4px 0 4px 20px; padding-left: 10px; }
        li { margin: 2px 0; }
        li p { margin: 0; }
        table { border-collapse: collapse; }
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

/**
 * Render template to HTML
 */
export function renderTemplate(template, variableMap) {
    // Parse template content - handle both string and object formats
    let tiptapDoc;
    try {
        let parsed;
        if (typeof template.content === 'string') {
            parsed = JSON.parse(template.content);
        } else {
            parsed = template.content;
        }

        // Handle multi-page templates
        if (parsed.__pages && Array.isArray(parsed.__pages)) {
            const allNodes = [];
            parsed.__pages.forEach((page, index) => {
                if (index > 0) {
                    allNodes.push({ type: 'horizontalRule' });
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

    // Resolve variables
    const resolvedDoc = resolveVariables(
        JSON.parse(JSON.stringify(tiptapDoc)),
        variableMap
    );

    // Convert to HTML
    let bodyHtml = tiptapJsonToHtml(resolvedDoc, logoBase64);

    // Inject page break after "affordability assessments conducted prior to lending" in cover letters
    // This prevents the numbered list from overlapping with the footer
    const affordabilityPattern = /(affordability assessments conducted prior to lending\.?<\/li>)/i;
    if (affordabilityPattern.test(bodyHtml)) {
        bodyHtml = bodyHtml.replace(
            affordabilityPattern,
            '$1</ol><div class="page-break"></div><ol start="3">'
        );
    }

    const fullHtml = wrapInDocument(bodyHtml);

    return fullHtml;
}
