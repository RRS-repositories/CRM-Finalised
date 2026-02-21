/**
 * OnlyOffice Document Converter for EC2
 * Converts DOCX to PDF using OnlyOffice Document Server
 */

// Node.js 18+ has built-in fetch

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

        // OnlyOffice conversion requires the file to be accessible via URL
        // We'll use base64 encoding as a workaround
        const base64Docx = docxBuffer.toString('base64');

        // OnlyOffice conversion API payload
        const payload = {
            async: false,
            filetype: 'docx',
            key: `conversion_${Date.now()}`,
            outputtype: 'pdf',
            title: fileName,
            url: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64Docx}`
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
