#!/usr/bin/env node
/**
 * Google Drive to S3 Migration Script
 * 
 * This script:
 * 1. Downloads PDFs from Google Drive
 * 2. Extracts reference number from filename (format: reference-name-type.pdf)
 * 3. Looks up contact in database using reference
 * 4. Uploads to S3: {contact_id}/Documents/{filename}
 * 5. Generates success and error logs
 */

import { google } from 'googleapis';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

dotenv.config();

const { Pool } = pg;

// Configuration
const DRIVE_FOLDER_ID = '1A3VxBI6d_zSjkbrUFZ1X1dO4F69hDQ8a';
const BATCH_SIZE = 50; // Process 50 files at a time
const MAX_RETRIES = 3;

// Initialize database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
});

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Logs
const successLog = [];
const errorLog = [];
let processedCount = 0;
let successCount = 0;
let errorCount = 0;

/**
 * Initialize Google Drive API
 */
async function initializeDrive() {
    const auth = new google.auth.GoogleAuth({
        keyFile: './google-credentials.json', // You'll need to download this from Google Cloud Console
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Extract reference number from filename
 * Format: 224384813-Kieran Jones-CASH ASAP -CL.pdf
 */
function extractReference(filename) {
    const match = filename.match(/^(\d+)-/);
    return match ? match[1] : null;
}

/**
 * Get contact by reference number
 */
async function getContactByReference(reference) {
    try {
        const result = await pool.query(
            'SELECT id, first_name, last_name, email FROM contacts WHERE reference = $1 LIMIT 1',
            [reference]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error(`Error fetching contact for reference ${reference}:`, error);
        return null;
    }
}

/**
 * Check if file already exists in S3
 */
async function fileExistsInS3(key) {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        throw error;
    }
}

/**
 * Download file from Google Drive
 */
async function downloadFile(drive, fileId) {
    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );
    return response.data;
}

/**
 * Upload stream to S3
 */
async function uploadToS3(stream, key, contentType = 'application/pdf') {
    const chunks = [];

    // Convert stream to buffer
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType
    });

    await s3Client.send(command);
    return buffer.length;
}

/**
 * Process a single file
 */
async function processFile(drive, file, retryCount = 0) {
    const filename = file.name;
    processedCount++;

    try {
        console.log(`[${processedCount}] Processing: ${filename}`);

        // Extract reference
        const reference = extractReference(filename);
        if (!reference) {
            throw new Error('Could not extract reference number from filename');
        }

        // Get contact
        const contact = await getContactByReference(reference);
        if (!contact) {
            throw new Error(`No contact found with reference: ${reference}`);
        }

        // Prepare S3 key
        const s3Key = `${contact.id}/Documents/${filename}`;

        // Check if already uploaded
        const exists = await fileExistsInS3(s3Key);
        if (exists) {
            console.log(`  ✓ Already exists in S3, skipping`);
            successLog.push({
                filename,
                reference,
                contactId: contact.id,
                contactName: `${contact.first_name} ${contact.last_name}`,
                s3Key,
                status: 'SKIPPED - Already exists',
                timestamp: new Date().toISOString()
            });
            successCount++;
            return;
        }

        // Download from Google Drive
        console.log(`  ↓ Downloading from Google Drive...`);
        const stream = await downloadFile(drive, file.id);

        // Upload to S3
        console.log(`  ↑ Uploading to S3: ${s3Key}`);
        const size = await uploadToS3(stream, s3Key);

        console.log(`  ✓ Success! (${(size / 1024).toFixed(2)} KB)`);

        successLog.push({
            filename,
            reference,
            contactId: contact.id,
            contactName: `${contact.first_name} ${contact.last_name}`,
            email: contact.email,
            s3Key,
            sizeKB: (size / 1024).toFixed(2),
            status: 'SUCCESS',
            timestamp: new Date().toISOString()
        });
        successCount++;

    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);

        // Retry logic
        if (retryCount < MAX_RETRIES) {
            console.log(`  ⟳ Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            return processFile(drive, file, retryCount + 1);
        }

        errorLog.push({
            filename,
            reference: extractReference(filename),
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        errorCount++;
    }
}

/**
 * List all PDF files in Google Drive folder
 */
async function listDrivePDFs(drive) {
    const files = [];
    let pageToken = null;

    do {
        const response = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`,
            fields: 'nextPageToken, files(id, name, size, createdTime)',
            pageSize: 1000,
            pageToken
        });

        files.push(...response.data.files);
        pageToken = response.data.nextPageToken;
    } while (pageToken);

    return files;
}

/**
 * Save logs to files
 */
async function saveLogs() {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logsDir = `./migration-logs-${timestamp}`;

    // Create logs directory
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    // Save success log
    if (successLog.length > 0) {
        const successFile = path.join(logsDir, 'success.json');
        fs.writeFileSync(successFile, JSON.stringify(successLog, null, 2));
        console.log(`\n✓ Success log saved: ${successFile}`);
    }

    // Save error log
    if (errorLog.length > 0) {
        const errorFile = path.join(logsDir, 'errors.json');
        fs.writeFileSync(errorFile, JSON.stringify(errorLog, null, 2));
        console.log(`✗ Error log saved: ${errorFile}`);
    }

    // Save summary
    const summary = {
        totalProcessed: processedCount,
        successful: successCount,
        failed: errorCount,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: `${((Date.now() - startTime.getTime()) / 1000 / 60).toFixed(2)} minutes`
    };

    const summaryFile = path.join(logsDir, 'summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📊 Summary saved: ${summaryFile}`);

    return logsDir;
}

/**
 * Upload logs to Google Drive (optional)
 */
async function uploadLogsToGoogleDrive(drive, logsDir) {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const logFolderName = `Migration-Logs-${timestamp}`;

        // Create logs folder in Google Drive
        const folderMetadata = {
            name: logFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [DRIVE_FOLDER_ID]
        };

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id'
        });

        console.log(`\n📁 Created logs folder in Google Drive: ${logFolderName}`);

        // Upload each log file
        const files = fs.readdirSync(logsDir);
        for (const file of files) {
            const filePath = path.join(logsDir, file);
            const fileMetadata = {
                name: file,
                parents: [folder.data.id]
            };

            const media = {
                mimeType: 'application/json',
                body: fs.createReadStream(filePath)
            };

            await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            });

            console.log(`  ✓ Uploaded: ${file}`);
        }

        console.log(`✓ All logs uploaded to Google Drive`);
    } catch (error) {
        console.error(`⚠️  Could not upload logs to Google Drive:`, error.message);
    }
}

/**
 * Main execution
 */
let startTime;

async function main() {
    startTime = new Date();
    console.log('='.repeat(70));
    console.log('GOOGLE DRIVE TO S3 MIGRATION');
    console.log('='.repeat(70));
    console.log(`Started at: ${startTime.toISOString()}\n`);

    try {
        // Initialize Google Drive
        console.log('📁 Initializing Google Drive connection...');
        const drive = await initializeDrive();
        console.log('✓ Connected to Google Drive\n');

        // List all PDFs
        console.log('📋 Listing PDFs in Google Drive folder...');
        const files = await listDrivePDFs(drive);
        console.log(`✓ Found ${files.length} PDF files\n`);

        if (files.length === 0) {
            console.log('No files to process. Exiting...');
            return;
        }

        // Process files in batches
        console.log(`🔄 Processing files in batches of ${BATCH_SIZE}...\n`);

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            console.log(`\n--- Batch ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}-${Math.min(i + BATCH_SIZE, files.length)} of ${files.length}) ---\n`);

            await Promise.all(batch.map(file => processFile(drive, file)));

            // Progress update
            console.log(`\n📊 Progress: ${processedCount}/${files.length} | Success: ${successCount} | Failed: ${errorCount}`);
        }

        // Save logs locally
        console.log('\n' + '='.repeat(70));
        console.log('SAVING LOGS...');
        console.log('='.repeat(70));
        const logsDir = await saveLogs();

        // Upload logs to Google Drive
        console.log('\n' + '='.repeat(70));
        console.log('UPLOADING LOGS TO GOOGLE DRIVE...');
        console.log('='.repeat(70));
        await uploadLogsToGoogleDrive(drive, logsDir);

        // Final summary
        console.log('\n' + '='.repeat(70));
        console.log('MIGRATION COMPLETE!');
        console.log('='.repeat(70));
        console.log(`Total files processed: ${processedCount}`);
        console.log(`✓ Successful: ${successCount}`);
        console.log(`✗ Failed: ${errorCount}`);
        console.log(`Duration: ${((Date.now() - startTime.getTime()) / 1000 / 60).toFixed(2)} minutes`);
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the script
main();
