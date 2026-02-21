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

        const responseText = await response.text();

        if (!response.ok) {
            console.error(`[OO Converter] OnlyOffice error response (${response.status}): ${responseText.substring(0, 500)}`);
            throw new Error(`OnlyOffice conversion failed: ${response.status} ${response.statusText}`);
        }

        // OnlyOffice can return either JSON or XML
        let pdfUrl;

        if (responseText.trim().startsWith('<?xml') || responseText.trim().startsWith('<FileResult')) {
            // Parse XML response
            console.log('[OO Converter] Parsing XML response from OnlyOffice');
            const fileUrlMatch = responseText.match(/<FileUrl>(.*?)<\/FileUrl>/);
            const errorMatch = responseText.match(/<Error>(.*?)<\/Error>/);

            if (errorMatch) {
                throw new Error(`OnlyOffice conversion error: ${errorMatch[1]}`);
            }

            if (!fileUrlMatch) {
                throw new Error('No FileUrl found in OnlyOffice XML response');
            }

            pdfUrl = fileUrlMatch[1].replace(/&amp;/g, '&'); // Decode HTML entities
        } else {
            // Parse JSON response
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error(`[OO Converter] Invalid response format: ${responseText.substring(0, 500)}`);
                throw new Error(`OnlyOffice returned invalid response: ${parseError.message}`);
            }

            if (result.error) {
                throw new Error(`OnlyOffice conversion error: ${result.error}`);
            }

            if (!result.fileUrl && !result.uri) {
                throw new Error('No PDF URL in OnlyOffice JSON response');
            }

            pdfUrl = result.fileUrl || result.uri;
        }
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
