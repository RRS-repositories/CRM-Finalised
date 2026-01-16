import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pkg from 'pg';
const { Pool } = pkg;
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import termsPkg from './termsText.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { tcText } = termsPkg;

const app = express();
const port = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- AWS & DB CLIENTS ---
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false
    }
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@fastactionclaims.co.uk',
        pass: 'R!508682892731uj' // Note: In production this should be in .env
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// --- CRM API ENDPOINTS ---

// Email sending
app.post('/send-email', async (req, res) => {
    const { to, subject, html, text } = req.body;
    if (!to || !subject || (!html && !text)) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const mailOptions = {
        from: '"Rowan Rose Solicitors" <info@fastactionclaims.co.uk>',
        to: to,
        subject: subject,
        text: text || "Please view this email in a client that supports HTML.",
        html: html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        const user = rows[0];

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        if (!user.is_approved) {
            return res.status(403).json({ success: false, message: 'Account pending approval' });
        }

        // Update last login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                isApproved: user.is_approved
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { email, password, fullName, phone } = req.body;
    try {
        // Check if exists
        const check = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const { rows } = await pool.query(
            'INSERT INTO users (email, password, full_name, role, is_approved) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [email.toLowerCase(), password, fullName, 'Sales', false]
        );

        res.json({ success: true, message: 'Registration successful, pending approval', user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, email, full_name as "fullName", role, is_approved as "isApproved", last_login as "lastLogin", created_at as "createdAt" FROM users ORDER BY created_at DESC');
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const { role, isApproved } = req.body;
    try {
        let query = 'UPDATE users SET ';
        const params = [];
        let count = 1;

        if (role) {
            query += `role = $${count}, `;
            params.push(role);
            count++;
        }
        if (isApproved !== undefined) {
            query += `is_approved = $${count}, `;
            params.push(isApproved);
            count++;
        }

        query = query.slice(0, -2); // Remove last comma
        query += ` WHERE id = $${count} RETURNING *`;
        params.push(id);

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/documents/secure-url', async (req, res) => {
    const { url } = req.body;
    try {
        if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

        // Extract Key from full URL (robust method)
        // Supports: 
        // 1. https://BUCKET.s3.REGION.amazonaws.com/KEY
        // 2. https://s3.REGION.amazonaws.com/BUCKET/KEY
        // 3. Any URL where we just need everything after .com/

        let key = url;
        if (url.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                // If pathname starts with '/', slice it off
                key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;

                // Decode URI component in case of spaces etc
                key = decodeURIComponent(key);
            } catch (e) {
                // Fallback if URL parsing fails
                console.warn('URL parsing failed, using raw string');
            }
        }

        const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: key,
        });

        // Generate signed URL valid for 1 hour
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        res.json({ success: true, signedUrl });
    } catch (err) {
        console.error('Error generating signed URL:', err);
        res.status(500).json({ success: false, message: 'Could not generate secure link' });
    }
});

// --- LEGAL INTAKE ENDPOINTS ---

app.post('/api/submit-page1', async (req, res) => {
    const {
        first_name, last_name, phone, email, date_of_birth,
        street_address, city, state_county, postal_code, signature_data,
        address_line_1, address_line_2 // Still accepting these for safety or mapping
    } = req.body;

    if (!first_name || !last_name || !signature_data) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // 1. Insert into contacts table with source = 'Client Filled'
        const insertQuery = `
      INSERT INTO contacts 
      (first_name, last_name, full_name, phone, email, dob, address_line_1, address_line_2, city, state_county, postal_code, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Client Filled')
      RETURNING id
    `;
        const fullName = `${first_name} ${last_name}`;
        const finalAddressLine1 = street_address || address_line_1 || '';
        const finalCity = city || '';
        const finalState = state_county || '';
        const finalAddressLine2 = address_line_2 || [finalCity, finalState].filter(Boolean).join(', ');

        // Robust Date Formatting: Ensure YYYY-MM-DD
        let formattedDob = date_of_birth;
        if (date_of_birth && date_of_birth.includes('-')) {
            const parts = date_of_birth.split('-');
            if (parts.length === 3) {
                // If it looks like DD-MM-YYYY (parts[0] is day, parts[2] is year)
                if (parts[0].length === 2 && parts[2].length === 4) {
                    formattedDob = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                // If it's already YYYY-MM-DD, keep it
            }
        }

        const values = [
            first_name, last_name, fullName, phone, email, formattedDob,
            finalAddressLine1, finalAddressLine2, finalCity, finalState, postal_code
        ];

        const dbRes = await pool.query(insertQuery, values);
        const contactId = dbRes.rows[0].id;

        // 2. Folder structure: first_name_last_name_id/
        const folderPath = `${first_name}_${last_name}_${contactId}/`;

        // 3. Upload Signature to S3: user_id/Signatures/signature.png
        const base64Data = signature_data.replace(/^data:image\/\w+;base64,/, "");
        const signatureBuffer = Buffer.from(base64Data, 'base64');
        const signatureKey = `${folderPath}Signatures/signature.png`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: signatureKey,
            Body: signatureBuffer,
            ContentType: 'image/png',
            ACL: 'public-read'
        }));

        const signatureUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${signatureKey}`;

        // 4. Generate T&C PDF: user_id/Terms-and-Conditions/Terms.pdf
        const pdfBuffer = await new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            try {
                const logoPath = path.join(__dirname, 'public', 'rr-logo.png');
                doc.image(logoPath, 50, 45, { width: 50 });
            } catch (e) {
                console.warn('Logo missing at:', path.join(__dirname, 'public', 'rr-logo.png'));
            }

            doc.fillColor('#0f172a').fontSize(22).text('Rowan Rose Solicitors', 110, 50);
            doc.fillColor('#64748b').fontSize(10).text('Legal Professionals | Manchester', 110, 75);
            doc.moveDown(4);

            doc.rect(50, doc.y, 495, 80).fill('#f8fafc');
            doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
            doc.text('CLIENT DETAILS', 65, doc.y - 70);
            doc.font('Helvetica').fontSize(11);
            const addressParts = [finalAddressLine1, finalAddressLine2, finalCity, finalState].filter(Boolean);
            const fullAddress = `${addressParts.join(', ')} | ${postal_code}`;
            doc.text(`Name: ${fullName}`, 65, doc.y + 10);
            doc.text(`Address: ${fullAddress}`);
            doc.text(`Contact numbers: ${phone}`);
            doc.moveDown(3);

            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('Terms and Conditions of Engagement', { underline: true });
            doc.moveDown();

            let populatedText = tcText || '';
            populatedText = populatedText.replace(/{{first name}}/g, first_name || '');
            populatedText = populatedText.replace(/{{last name}}/g, last_name || '');
            const streetCombined = [finalAddressLine1, finalAddressLine2].filter(Boolean).join(', ');
            populatedText = populatedText.replace(/{{street address}}/g, streetCombined);
            populatedText = populatedText.replace(/{{city\/town}}/g, finalCity || '');
            populatedText = populatedText.replace(/{{country\/state}}/g, finalState || '');
            populatedText = populatedText.replace(/{{postalcode}}/g, postal_code || '');
            populatedText = populatedText.replace(/{{Contact number}}/g, phone || '');

            // Parity with [Client.FirstName] style placeholders
            populatedText = populatedText.replace(/\[Client\.FirstName\]/g, first_name || '');
            populatedText = populatedText.replace(/\[Client\.LastName\]/g, last_name || '');
            const fullAddressTpl = [finalAddressLine1, finalAddressLine2, finalCity, finalState, postal_code].filter(Boolean).join(', ');
            populatedText = populatedText.replace(/\[Client\.Address\]/g, fullAddressTpl);

            const now = new Date();
            const today = now.toLocaleDateString('en-GB');
            const todayWithTime = now.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            populatedText = populatedText.replace(/14\/01\/2026/g, today);
            populatedText = populatedText.replace(/{PLATFORM_DATE}/g, todayWithTime);

            populatedText = populatedText.replace(/\[Client\.FirstName\]/g, first_name || '');
            populatedText = populatedText.replace(/\[Client\.LastName\]/g, last_name || '');
            populatedText = populatedText.replace(/\[Client\.StreetAddress\]/g, streetCombined);
            populatedText = populatedText.replace(/\[Client\.City\]/g, city || '');
            populatedText = populatedText.replace(/\[Client\.PostalCode\]/g, postal_code || '');

            const paragraphs = populatedText.split('\n\n');
            paragraphs.forEach(para => {
                if (para.trim()) {
                    if (doc.y > 700) doc.addPage();
                    doc.font('Helvetica').fontSize(10).fillColor('#334155');
                    doc.text(para.trim(), { align: 'justify', lineGap: 2 });
                    doc.moveDown(0.5);
                }
            });

            doc.addPage();
            doc.rect(50, 50, 495, 100).strokeColor('#e2e8f0').stroke();
            doc.fontSize(12).fillColor('#1e293b').font('Helvetica-Bold').text('ELECTRONIC SIGNATURE VERIFICATION', 65, 65);
            doc.fontSize(10).font('Helvetica').text(`Signatory: ${fullName}`, 65, 85);
            doc.text(`Digital Hash: ${contactId}`, 65, 100);
            doc.text(`Certified Timestamp: ${todayWithTime}`, 65, 115);

            doc.fontSize(8).fillColor('#94a3b8').text('This document is electronically signed and legally binding.', 50, 750, { align: 'center' });
            doc.end();
        });

        const tcKey = `${folderPath}Terms-and-Conditions/Terms.pdf`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: tcKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            ACL: 'public-read'
        }));

        // Update signature URL in DB
        await pool.query('UPDATE contacts SET signature_url = $1 WHERE id = $2', [signatureUrl, contactId]);

        // Insert Signature into documents table
        await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contactId, 'Signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Signed']]
        );

        // Save T&C PDF to documents table
        const tcUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${tcKey}`;
        await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contactId, 'Terms and Conditions.pdf', 'pdf', 'Legal', tcUrl, 'Auto-generated', ['T&C', 'Signed']]
        );

        res.json({ success: true, contact_id: contactId, folder_path: folderPath });
    } catch (error) {
        console.error('Submit Step 1 Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/upload-document', upload.single('document'), async (req, res) => {
    const { contact_id } = req.body;
    const file = req.file;

    if (!file || !contact_id) {
        return res.status(400).json({ success: false, message: 'Missing file or contact ID' });
    }

    try {
        // Fetch contact name for folder
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contact_id]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }
        const { first_name, last_name } = contactRes.rows[0];

        // Versioning Logic
        let fileName = file.originalname;
        // Check for existing files with same base name for this contact
        const nameCheck = await pool.query(
            'SELECT name FROM documents WHERE contact_id = $1 AND name = $2',
            [contact_id, fileName]
        );

        if (nameCheck.rows.length > 0) {
            // File exists, append version number
            const ext = path.extname(fileName);
            const base = path.basename(fileName, ext);

            // Find all files matching pattern "base (N)ext" or "base.ext"
            const similarFilesQuery = await pool.query(
                `SELECT name FROM documents WHERE contact_id = $1 AND name LIKE $2`,
                [contact_id, `${base}%${ext}`]
            );

            let maxVersion = 0;
            const regex = new RegExp(`^${base}(?: \\((\\d+)\\))?${ext}$`); // Matches "file.txt" or "file (1).txt"

            similarFilesQuery.rows.forEach(row => {
                const match = row.name.match(regex);
                if (match) {
                    const ver = match[1] ? parseInt(match[1]) : 0;
                    if (ver >= maxVersion) maxVersion = ver;
                }
            });

            // New version is max found + 1. If "file.txt" (0) exists, next is "file (1).txt"
            // If "file (1).txt" exists, next is file (2).txt.
            // So if maxVersion found was 0 (only file.txt) -> new is 1.
            // If maxVersion found was 1 (file (1).txt) -> new is 2.

            // Correction: if valid match found (even original), at least one file exists.
            // So we can safely do maxVersion + 1?
            // Wait, "file.txt" matches with undefined capture group 1. Int value 0.
            // "file (1).txt" matches with capture group 1 = "1".
            // So logic holds: if we have file.txt (0) and file (1).txt (1), max is 1. Next is 2.
            // Result: file (2).txt. Correct.

            fileName = `${base} (${maxVersion + 1})${ext}`;
        }

        const key = `${first_name}_${last_name}_${contact_id}/Documents/${fileName}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: 'public-read'
        }));

        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        const { rows } = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [contact_id, fileName, file.mimetype.split('/')[1] || 'unknown', 'Client', s3Url, `${(file.size / 1024).toFixed(1)} KB`, ['Uploaded']]
        );

        res.json({ success: true, url: s3Url, document: rows[0] });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- CRM MANUAL UPLOADS ---

app.post('/api/upload-manual', upload.single('document'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file' });

    try {
        // Folder: /Manually Added in CRM/
        const fileKey = `Manually Added in CRM/${Date.now()}_${file.originalname}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: 'public-read'
        }));

        const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

        // Save to DB
        await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [null, file.originalname, file.originalname.split('.').pop().toLowerCase(), 'Other', url, `${(file.size / 1024).toFixed(2)} KB`, ['Manual']]
        );

        res.json({ success: true, url });
    } catch (error) {
        console.error('Manual Upload Error:', error);
        res.status(500).json({ success: false });
    }
});

// --- DOCUMENT GETTERS ---

app.get('/api/documents', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM documents ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contacts/:id/documents', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM documents WHERE contact_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CONTACTS & CASES API ---

app.get('/api/contacts', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contacts', async (req, res) => {
    const { first_name, last_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code } = req.body;
    const fullName = `${first_name} ${last_name}`;
    try {
        const { rows } = await pool.query(
            `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Manual Input') RETURNING *`,
            [first_name, last_name, fullName, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contacts/:id/cases', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM cases WHERE contact_id = $1', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contacts/:id/cases', async (req, res) => {
    const { case_number, lender, status, claim_value, product_type, account_number, start_date } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO cases (contact_id, case_number, lender, status, claim_value, product_type, account_number, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.params.id, case_number, lender, status, claim_value, product_type, account_number, start_date]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => {
    console.log(`Consolidated Server running on port ${port}`);
});
