import { google } from 'googleapis';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

// ─── Configuration ───────────────────────────────────────────────────────────
const DRIVE_FOLDER_ID = '1A3VxBI6d_zSjkbrUFZ1X1dO4F69hDQ8a';
const CREDENTIALS_FILE = './google-credentials.json';
AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
DB_HOST = process.env.DB_HOST;
DB_PASSWORD = process.env.DB_PASSWORD;

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const BATCH_SIZE = (() => {
    const idx = args.indexOf('--batch-size');
    return idx !== -1 ? parseInt(args[idx + 1], 10) : 50;
})();
const START_FROM = (() => {
    const idx = args.indexOf('--start-from');
    return idx !== -1 ? parseInt(args[idx + 1], 10) : 0;
})();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const CONCURRENCY = 5; // Files processed concurrently within a batch
const SIGNED_URL_EXPIRY = 604800; // 7 days in seconds

// ─── Clients ─────────────────────────────────────────────────────────────────
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10, // connection pool size
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ─── State ───────────────────────────────────────────────────────────────────
const successLog = [];
const errorLog = [];
let processedCount = 0;
let skippedCount = 0;
let successCount = 0;
let errorCount = 0;
let startTime;

// Cache contact lookups to avoid repeated DB queries for same reference
const contactCache = new Map();

// ─── Google Drive ────────────────────────────────────────────────────────────

async function initializeDrive() {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
        console.error(`\nERROR: ${CREDENTIALS_FILE} not found.`);
        console.error('Follow the setup steps in MIGRATION_SETUP.md to create it.\n');
        process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_FILE,
        scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file', // needed for uploading logs
        ],
    });

    const authClient = await auth.getClient();
    return google.drive({ version: 'v3', auth: authClient });
}

async function listDrivePDFs(drive) {
    const files = [];
    let pageToken = null;

    do {
        const response = await drive.files.list({
            q: `'${DRIVE_FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`,
            fields: 'nextPageToken, files(id, name, size, createdTime)',
            pageSize: 1000,
            pageToken,
        });

        files.push(...response.data.files);
        pageToken = response.data.nextPageToken;
    } while (pageToken);

    return files;
}

async function downloadFile(drive, fileId) {
    const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data);
}

// ─── Reference & Contact Lookup ──────────────────────────────────────────────

function extractReference(filename) {
    const match = filename.match(/^(\d+)\s*[-–]/);
    return match ? match[1] : null;
}

async function getContactByReference(reference) {
    // Check cache first
    if (contactCache.has(reference)) {
        return contactCache.get(reference);
    }

    try {
        const result = await pool.query(
            'SELECT id, first_name, last_name, email FROM contacts WHERE reference = $1 LIMIT 1',
            [reference]
        );
        const contact = result.rows[0] || null;
        contactCache.set(reference, contact);
        return contact;
    } catch (error) {
        console.error(`  DB error for reference ${reference}: ${error.message}`);
        return null;
    }
}

// ─── S3 Operations ───────────────────────────────────────────────────────────

function buildS3Key(contact, filename) {
    // Matches CRM format: {first_name}_{last_name}_{id}/Documents/{filename}
    return `${contact.first_name}_${contact.last_name}_${contact.id}/Documents/${filename}`;
}

async function fileExistsInS3(key) {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

async function uploadToS3(buffer, key) {
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
    }));
    return buffer.length;
}

async function getS3SignedUrl(key) {
    return getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
        { expiresIn: SIGNED_URL_EXPIRY }
    );
}

// ─── Database Operations ─────────────────────────────────────────────────────

async function insertDocumentRecord(contactId, filename, sizeBytes, s3Url) {
    const sizeKB = `${(sizeBytes / 1024).toFixed(1)} KB`;
    const fileType = filename.split('.').pop().toLowerCase();

    await pool.query(
        `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [contactId, filename, fileType, 'Client', s3Url, sizeKB, ['Uploaded', 'Drive Migration']]
    );
}

// ─── Process Single File ─────────────────────────────────────────────────────

async function processFile(drive, file, index) {
    const filename = file.name;
    processedCount++;

    const logPrefix = `[${index + 1}]`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Extract reference
            const reference = extractReference(filename);
            if (!reference) {
                throw new Error('Could not extract reference number from filename');
            }

            // 2. Look up contact
            const contact = await getContactByReference(reference);
            if (!contact) {
                throw new Error(`No contact found for reference: ${reference}`);
            }

            // 3. Build S3 key with CRM-matching format
            const s3Key = buildS3Key(contact, filename);

            // 4. Check if already exists
            const exists = await fileExistsInS3(s3Key);
            if (exists) {
                console.log(`${logPrefix} SKIP (exists): ${filename}`);
                skippedCount++;
                successLog.push({
                    filename,
                    reference,
                    contactId: contact.id,
                    contactName: `${contact.first_name} ${contact.last_name}`,
                    s3Key,
                    status: 'SKIPPED_EXISTS',
                    timestamp: new Date().toISOString(),
                });
                return; // Not an error, not a retry
            }

            if (DRY_RUN) {
                console.log(`${logPrefix} DRY RUN: ${filename} -> ${s3Key}`);
                successLog.push({
                    filename, reference, s3Key,
                    contactId: contact.id,
                    contactName: `${contact.first_name} ${contact.last_name}`,
                    status: 'DRY_RUN',
                    timestamp: new Date().toISOString(),
                });
                successCount++;
                return;
            }

            // 5. Download from Drive
            const buffer = await downloadFile(drive, file.id);

            // 6. Upload to S3
            const size = await uploadToS3(buffer, s3Key);

            // 7. Generate signed URL and insert DB record
            const signedUrl = await getS3SignedUrl(s3Key);
            await insertDocumentRecord(contact.id, filename, size, signedUrl);

            console.log(`${logPrefix} OK: ${filename} -> ${s3Key} (${(size / 1024).toFixed(1)} KB)`);

            successLog.push({
                filename,
                reference,
                contactId: contact.id,
                contactName: `${contact.first_name} ${contact.last_name}`,
                email: contact.email,
                s3Key,
                sizeKB: (size / 1024).toFixed(2),
                status: 'SUCCESS',
                timestamp: new Date().toISOString(),
            });
            successCount++;
            return; // Done

        } catch (error) {
            if (attempt < MAX_RETRIES) {
                console.log(`${logPrefix} RETRY ${attempt}/${MAX_RETRIES}: ${filename} - ${error.message}`);
                await sleep(RETRY_DELAY_MS * attempt); // Exponential-ish backoff
                continue;
            }

            // All retries exhausted
            console.error(`${logPrefix} FAIL: ${filename} - ${error.message}`);
            errorLog.push({
                filename,
                reference: extractReference(filename),
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            errorCount++;
        }
    }
}

// ─── Batch Processing with Concurrency Control ──────────────────────────────

async function processBatch(drive, files, batchNumber, totalBatches) {
    console.log(`\n--- Batch ${batchNumber}/${totalBatches} (${files.length} files) ---`);

    // Process with controlled concurrency (not all at once)
    for (let i = 0; i < files.length; i += CONCURRENCY) {
        const chunk = files.slice(i, i + CONCURRENCY);
        await Promise.all(
            chunk.map((file, idx) => {
                const globalIndex = (batchNumber - 1) * BATCH_SIZE + i + idx;
                return processFile(drive, file, globalIndex);
            })
        );
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`Progress: ${processedCount} processed | ${successCount} ok | ${skippedCount} skipped | ${errorCount} failed | ${elapsed}m elapsed`);
}

// ─── Logging ─────────────────────────────────────────────────────────────────

async function saveLogsLocally() {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logsDir = `./migration-logs-${timestamp}`;
    fs.mkdirSync(logsDir, { recursive: true });

    if (successLog.length > 0) {
        fs.writeFileSync(path.join(logsDir, 'success_log.json'), JSON.stringify(successLog, null, 2));
    }

    if (errorLog.length > 0) {
        fs.writeFileSync(path.join(logsDir, 'failed_log.json'), JSON.stringify(errorLog, null, 2));
    }

    const summary = {
        totalProcessed: processedCount,
        successful: successCount,
        skipped: skippedCount,
        failed: errorCount,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        durationMinutes: ((Date.now() - startTime.getTime()) / 1000 / 60).toFixed(2),
        dryRun: DRY_RUN,
        batchSize: BATCH_SIZE,
    };

    fs.writeFileSync(path.join(logsDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(`\nLogs saved locally: ${logsDir}/`);
    return logsDir;
}

async function uploadLogsToDrive(drive, logsDir) {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('T')[0];
        const folderName = `Migration-Logs-${timestamp}`;

        // Create timestamped log folder in the same Drive folder
        const folder = await drive.files.create({
            resource: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [DRIVE_FOLDER_ID],
            },
            fields: 'id',
        });

        console.log(`Created Drive log folder: ${folderName}`);

        // Upload each log file
        const logFiles = fs.readdirSync(logsDir);
        for (const file of logFiles) {
            const filePath = path.join(logsDir, file);
            await drive.files.create({
                resource: {
                    name: file,
                    parents: [folder.data.id],
                },
                media: {
                    mimeType: 'application/json',
                    body: fs.createReadStream(filePath),
                },
                fields: 'id',
            });
            console.log(`  Uploaded: ${file}`);
        }

        console.log(`All logs uploaded to Drive folder: ${folderName}`);
    } catch (error) {
        console.error(`Could not upload logs to Drive: ${error.message}`);
        console.error('Logs are still saved locally.');
    }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    startTime = new Date();
    console.log('='.repeat(70));
    console.log('S3 DOCUMENT UPLOAD - Google Drive to S3');
    console.log('='.repeat(70));
    console.log(`Started:    ${startTime.toISOString()}`);
    console.log(`Batch size: ${BATCH_SIZE}`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`Dry run:    ${DRY_RUN}`);
    console.log(`Start from: ${START_FROM}`);
    console.log(`S3 Bucket:  ${BUCKET_NAME}`);
    console.log(`S3 Format:  {first_name}_{last_name}_{id}/Documents/{filename}`);
    console.log('='.repeat(70));

    try {
        // 1. Connect to Google Drive
        console.log('\nConnecting to Google Drive...');
        const drive = await initializeDrive();
        console.log('Connected.\n');

        // 2. List all PDFs
        console.log('Listing PDFs in Drive folder...');
        let files = await listDrivePDFs(drive);
        console.log(`Found ${files.length} PDF files.`);

        if (files.length === 0) {
            console.log('Nothing to process.');
            return;
        }

        // 3. Apply start-from offset
        if (START_FROM > 0) {
            files = files.slice(START_FROM);
            console.log(`Starting from file #${START_FROM}, ${files.length} remaining.`);
        }

        // 4. Process in batches
        const totalBatches = Math.ceil(files.length / BATCH_SIZE);

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            await processBatch(drive, batch, batchNumber, totalBatches);
        }

        // 5. Save logs
        console.log('\n' + '='.repeat(70));
        console.log('SAVING LOGS');
        console.log('='.repeat(70));
        const logsDir = await saveLogsLocally();
        await uploadLogsToDrive(drive, logsDir);

        // 6. Final summary
        console.log('\n' + '='.repeat(70));
        console.log('COMPLETE');
        console.log('='.repeat(70));
        console.log(`Total processed: ${processedCount}`);
        console.log(`Successful:      ${successCount}`);
        console.log(`Skipped:         ${skippedCount}`);
        console.log(`Failed:          ${errorCount}`);
        console.log(`Duration:        ${((Date.now() - startTime.getTime()) / 1000 / 60).toFixed(2)} minutes`);
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\nFATAL ERROR:', error);
        // Still try to save logs
        try { await saveLogsLocally(); } catch (_) { /* ignore */ }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
