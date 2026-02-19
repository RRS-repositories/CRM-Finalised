/**
 * PDF Generator Module
 * Uses Puppeteer with Chromium to generate PDFs from HTML
 */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * Generate PDF from HTML content
 * @param {string} html - Full HTML document
 * @returns {Buffer} PDF buffer
 */
export async function generatePdf(html) {
    let browser = null;

    try {
        // Launch Chromium (using @sparticuz/chromium for Lambda compatibility)
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        // Set content and wait for it to load
        await page.setContent(html, {
            waitUntil: ['domcontentloaded', 'networkidle0'],
            timeout: 30000
        });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                right: '15mm',
                bottom: '30mm',
                left: '15mm'
            }
        });

        return pdfBuffer;

    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
