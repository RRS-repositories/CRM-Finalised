/**
 * OnlyOffice Document Converter for EC2
 * Converts DOCX to PDF using OnlyOffice Document Server
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'client.landing.page';
const S3_REGION = process.env.AWS_REGION || 'eu-north-1';
const s3Client = new S3Client({ region: S3_REGION });

const ONLYOFFICE_URL = process.env.ONLYOFFICE_URL || 'https://docs.fastactionclaims.com';
const CONVERSION_ENDPOINT = `${ONLYOFFICE_URL}/ConvertService.ashx`;

/**
 * Convert DOCX buffer to PDF using OnlyOffice
 * @param {Buffer} docxBuffer - The DOCX file buffer
 * @param {string} fileName - Original file name (for conversion)
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function convertDocxToPdf(docxBuffer, fileName = 'document.docx') {
    try {
        console.log('[OO Converter] Converting DOCX to PDF using OnlyOffice...');

        // Upload DOCX to S3 temporarily
        const tempKey = `temp/oo-conversion/${Date.now()}-${fileName}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: tempKey,
            Body: docxBuffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }));

        // Get signed URL for OnlyOffice to access
        const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: tempKey
            }),
            { expiresIn: 300 } // 5 minutes
        );

        console.log(`[OO Converter] DOCX uploaded to S3: ${tempKey}`);

        // OnlyOffice conversion API payload
        const payload = {
            async: false,
            filetype: 'docx',
            key: `conversion_${Date.now()}`,
            outputtype: 'pdf',
            title: fileName,
            url: signedUrl
        };

        console.log(`[OO Converter] Calling OnlyOffice at ${CONVERSION_ENDPOINT}`);

        // Call OnlyOffice conversion service
        const response = await fetch(CONVERSION_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OO Converter] OnlyOffice error response: ${errorText}`);
            throw new Error(`OnlyOffice conversion failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(`OnlyOffice conversion error: ${result.error}`);
        }

        // Download the converted PDF
        if (!result.fileUrl && !result.uri) {
            throw new Error('No PDF URL in OnlyOffice response');
        }

        const pdfUrl = result.fileUrl || result.uri;
        console.log(`[OO Converter] Downloading PDF from: ${pdfUrl}`);

        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
            throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
        }

        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        console.log(`[OO Converter] PDF generated successfully (${pdfBuffer.length} bytes)`);

        return pdfBuffer;
    } catch (error) {
        console.error('[OO Converter] Error:', error.message);
        throw error;
    }
}
