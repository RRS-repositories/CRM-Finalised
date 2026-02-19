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
import * as msal from '@azure/msal-node';
import path from 'path';
import { fileURLToPath } from 'url';
import termsPkg from './termsText.cjs';
import termsHtmlPkg from './termsHtml.cjs';
import OpenAI from 'openai';
import { buildSystemPrompt, getEnabledTools, getCompactContext, TOOLS } from './aiSkills.js';
import { createCanvas, loadImage } from 'canvas';
import puppeteer from 'puppeteer';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import mammoth from 'mammoth';
import juice from 'juice';
import { generateCoverLetterFromTemplate } from './coverletter.js';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { tcText } = termsPkg;
const { tcHtml } = termsHtmlPkg;

const app = express();
const port = process.env.PORT || 5000;

// Trust proxy for correct protocol detection behind nginx (important for HTTPS)
// This ensures req.protocol returns 'https' when behind a reverse proxy
app.set('trust proxy', 1);

// ============================================================================
// EMAIL DRAFT MODE - Set to true to SKIP sending ALL emails (for review)
// ============================================================================
const EMAIL_DRAFT_MODE = false; // ENABLED - Lender Selection Form & General Emails will send
// NOTE: DSAR emails (worker.js) have separate DRAFT mode control
// ============================================================================

// --- MATTERMOST CONFIGURATION ---
const MATTERMOST_URL = process.env.MATTERMOST_URL || 'https://chat.rowanroseclaims.co.uk';
const MATTERMOST_BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN || 'quzf9nxpx3bdx8im4abycsgzuw';

// Mattermost API helper
async function mattermostAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${MATTERMOST_BOT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${MATTERMOST_URL}/api/v4${endpoint}`, options);
    const data = await response.json();
    if (!response.ok) {
        console.error('Mattermost API error:', data);
    }
    return { ok: response.ok, data };
}

// Create Mattermost user
async function createMattermostUser(email, password, fullName) {
    try {
        // Create user
        const username = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
        const { ok, data } = await mattermostAPI('/users', 'POST', {
            email,
            username,
            password,
            first_name: fullName.split(' ')[0] || fullName,
            last_name: fullName.split(' ').slice(1).join(' ') || ''
        });

        if (ok) {
            console.log(`✅ Mattermost user created: ${email}`);
            // Add to default team
            const teamsRes = await mattermostAPI('/teams');
            if (teamsRes.ok && teamsRes.data.length > 0) {
                const teamId = teamsRes.data[0].id;
                await mattermostAPI(`/teams/${teamId}/members`, 'POST', {
                    team_id: teamId,
                    user_id: data.id
                });
                console.log(`✅ Added ${email} to team`);
            }
            return data;
        } else {
            console.error(`❌ Failed to create Mattermost user: ${data.message}`);
            return null;
        }
    } catch (err) {
        console.error('Mattermost user creation error:', err);
        return null;
    }
}

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'public')));

// --- AWS & DB CLIENTS ---
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// Path-style S3 client for OnlyOffice — buckets with dots (e.g. client.landing.page)
// cause SSL cert failures with virtual-hosted-style URLs when fetched server-side
const s3ClientPathStyle = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    // AWS RDS requires SSL - always enable it
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// The pool will emit an error on behalf of any idle clients
// it contains if a backend error or network partition happens
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    // Don't exit the process specifically for ETIMEDOUT or ECONNRESET on idle clients
});
// --- DATABASE INITIALIZATION & MIGRATIONS ---
(async () => {
    try {
        const client = await pool.connect();
        try {
            // Add missing columns to cases table if they don't exist
            await client.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='finance_types') THEN
                        ALTER TABLE cases ADD COLUMN finance_types JSONB;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='loan_details') THEN
                        ALTER TABLE cases ADD COLUMN loan_details JSONB;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='billed_interest_charges') THEN
                        ALTER TABLE cases ADD COLUMN billed_interest_charges TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='overlimit_charges') THEN
                        ALTER TABLE cases ADD COLUMN overlimit_charges TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='credit_limit_increases') THEN
                        ALTER TABLE cases ADD COLUMN credit_limit_increases TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='balance_due_to_client') THEN
                        ALTER TABLE cases ADD COLUMN balance_due_to_client TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='our_fees_plus_vat') THEN
                        ALTER TABLE cases ADD COLUMN our_fees_plus_vat TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='our_fees_minus_vat') THEN
                        ALTER TABLE cases ADD COLUMN our_fees_minus_vat TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='vat_amount') THEN
                        ALTER TABLE cases ADD COLUMN vat_amount TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='total_fee') THEN
                        ALTER TABLE cases ADD COLUMN total_fee TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='outstanding_debt') THEN
                        ALTER TABLE cases ADD COLUMN outstanding_debt TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='payment_plan') THEN
                        ALTER TABLE cases ADD COLUMN payment_plan JSONB;
                    END IF;
                    
                    -- Add intake_lender to contacts table
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='intake_lender') THEN
                        ALTER TABLE contacts ADD COLUMN intake_lender TEXT;
                    END IF;

                    -- Add previous address columns to contacts table
                     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_address_line_1') THEN
                        ALTER TABLE contacts ADD COLUMN previous_address_line_1 TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_address_line_2') THEN
                        ALTER TABLE contacts ADD COLUMN previous_address_line_2 TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_city') THEN
                        ALTER TABLE contacts ADD COLUMN previous_city TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_county') THEN
                        ALTER TABLE contacts ADD COLUMN previous_county TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_postal_code') THEN
                        ALTER TABLE contacts ADD COLUMN previous_postal_code TEXT;
                    END IF;

                    -- Add previous_addresses JSONB column to contacts table (for storing array of addresses)
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='previous_addresses') THEN
                        ALTER TABLE contacts ADD COLUMN previous_addresses JSONB;
                    END IF;

                    -- Add document_checklist JSONB column to contacts table (for storing identification, extraLender, questionnaire, poa flags)
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='document_checklist') THEN
                        ALTER TABLE contacts ADD COLUMN document_checklist JSONB DEFAULT '{"identification": false, "extraLender": false, "questionnaire": false, "poa": false}';
                    END IF;

                    -- Create submission_tokens table if not exists
                    CREATE TABLE IF NOT EXISTS submission_tokens (
                        id SERIAL PRIMARY KEY,
                        token UUID UNIQUE NOT NULL,
                        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
                        lender TEXT,
                        expires_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    -- Create previous_addresses table
                    CREATE TABLE IF NOT EXISTS previous_addresses (
                        id SERIAL PRIMARY KEY,
                        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
                        address_line_1 TEXT,
                        address_line_2 TEXT,
                        city TEXT,
                        county TEXT,
                        postal_code TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    -- Add loa_generated to cases table
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='loa_generated') THEN
                         ALTER TABLE cases ADD COLUMN loa_generated BOOLEAN DEFAULT FALSE;
                    END IF;

                    -- Add dsar_sent and dsar_send_after columns for delayed DSAR email sending
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_sent') THEN
                         ALTER TABLE cases ADD COLUMN dsar_sent BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='dsar_send_after') THEN
                         ALTER TABLE cases ADD COLUMN dsar_send_after TIMESTAMP;
                    END IF;

                    -- Fix capitalization of status values
                    UPDATE cases SET status = 'Lender Selection Form Completed' WHERE status = 'LENDER SELECTION FORM COMPLETED';

                    -- ============================================
                    -- TASKS & REMINDERS SYSTEM TABLES
                    -- ============================================

                    -- Create tasks table for calendar events/tasks
                    CREATE TABLE IF NOT EXISTS tasks (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        type VARCHAR(50) DEFAULT 'appointment',
                        status VARCHAR(50) DEFAULT 'pending',
                        date DATE NOT NULL,
                        start_time TIME,
                        end_time TIME,
                        assigned_to INTEGER,
                        assigned_by INTEGER,
                        assigned_at TIMESTAMP,
                        is_recurring BOOLEAN DEFAULT FALSE,
                        recurrence_pattern VARCHAR(50),
                        recurrence_end_date DATE,
                        parent_task_id INTEGER,
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        completed_at TIMESTAMP,
                        completed_by INTEGER
                    );

                    -- Create task_contacts junction table
                    CREATE TABLE IF NOT EXISTS task_contacts (
                        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
                        PRIMARY KEY (task_id, contact_id)
                    );

                    -- Create task_claims junction table
                    CREATE TABLE IF NOT EXISTS task_claims (
                        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                        claim_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
                        PRIMARY KEY (task_id, claim_id)
                    );

                    -- Create task_reminders table
                    CREATE TABLE IF NOT EXISTS task_reminders (
                        id SERIAL PRIMARY KEY,
                        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                        reminder_time TIMESTAMP NOT NULL,
                        reminder_type VARCHAR(50) DEFAULT 'in_app',
                        is_sent BOOLEAN DEFAULT FALSE,
                        sent_at TIMESTAMP
                    );

                    -- Create persistent_notifications table
                    CREATE TABLE IF NOT EXISTS persistent_notifications (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER,
                        type VARCHAR(50) NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        message TEXT,
                        link VARCHAR(500),
                        related_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
                        is_read BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    -- Create pending_lender_confirmations table for Category 3 lenders
                    CREATE TABLE IF NOT EXISTS pending_lender_confirmations (
                        id SERIAL PRIMARY KEY,
                        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
                        lender VARCHAR(255) NOT NULL,
                        action VARCHAR(20) NOT NULL, -- 'confirm' or 'reject'
                        token VARCHAR(64) UNIQUE NOT NULL,
                        email_sent BOOLEAN DEFAULT FALSE,
                        used BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        used_at TIMESTAMP
                    );

                    -- Add email_sent column if it doesn't exist (for existing tables)
                    ALTER TABLE pending_lender_confirmations ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;

                    -- Create support_tickets table
                    CREATE TABLE IF NOT EXISTS support_tickets (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        user_name VARCHAR(255) NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        description TEXT NOT NULL,
                        screenshot_key VARCHAR(500),
                        status VARCHAR(20) DEFAULT 'open',
                        resolved_by INTEGER,
                        resolved_by_name VARCHAR(255),
                        resolved_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    -- Create indexes for better performance
                    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
                    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
                    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
                    CREATE INDEX IF NOT EXISTS idx_task_reminders_time ON task_reminders(reminder_time);
                    CREATE INDEX IF NOT EXISTS idx_notifications_user ON persistent_notifications(user_id);
                    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON persistent_notifications(user_id, is_read);
                    CREATE INDEX IF NOT EXISTS idx_pending_confirmations_token ON pending_lender_confirmations(token);
                    CREATE INDEX IF NOT EXISTS idx_pending_confirmations_contact ON pending_lender_confirmations(contact_id);
                    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
                    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

                    -- Performance indexes for cases pipeline queries
                    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
                    CREATE INDEX IF NOT EXISTS idx_cases_contact_id ON cases(contact_id);
                    CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_cases_lender ON cases(lender);
                END $$;
            `);
            console.log('✅ Cases table schema synchronized');

            // Add document_status column if not present
            await client.query(`
                ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_status VARCHAR(30) NOT NULL DEFAULT 'Draft'
            `);
            console.log('✅ documents.document_status column ready');

            // Document tracking columns
            await client.query(`
                ALTER TABLE documents ADD COLUMN IF NOT EXISTS tracking_token UUID UNIQUE DEFAULT NULL;
                ALTER TABLE documents ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NULL;
            `);

            // Workflow triggers metadata column for document chase
            await client.query(`
                ALTER TABLE workflow_triggers ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL
            `);

            // Document tracking events table
            await client.query(`
                CREATE TABLE IF NOT EXISTS document_tracking_events (
                    id SERIAL PRIMARY KEY,
                    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
                    event_type VARCHAR(30) NOT NULL,
                    tracking_token UUID NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_doc_tracking_doc_id ON document_tracking_events(document_id);
                CREATE INDEX IF NOT EXISTS idx_doc_tracking_token ON document_tracking_events(tracking_token);
            `);
            console.log('✅ Document tracking schema ready');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Database migration error:', err);
    }
})();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- OPENAI CLIENT ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Store chat sessions in memory (in production, use Redis or similar)
const chatSessions = new Map();

// ============================================================================
// ONLYOFFICE INTEGRATION - In-Memory Storage (Phase 1)
// Will be replaced with database tables in Phase 2
// ============================================================================
const ooTemplates = new Map();
const ooDocuments = new Map();
let ooTemplateIdCounter = 1;
let ooDocumentIdCounter = 1;

const OO_FIRM_DEFAULTS = {
    firm_name: 'Rowan Rose Solicitors',
    firm_trading_name: 'Fast Action Claims',
    firm_address: 'Boat Shed, Exchange Quay, Salford M5 3EQ',
    sra_number: '8000843',
    firm_entity: 'Rowan Rose Ltd',
    company_number: '12916452',
};

const OO_MOCK_CASE_DATA = {
    client_name: 'John Smith',
    client_address: '123 Test Street, Manchester M1 1AA',
    client_email: 'john@example.com',
    client_phone: '07700 900000',
    client_dob: '01/01/1980',
    lender_name: 'Vanquis Bank',
    lender_address: '1 Godwin Street, Bradford BD1 2SU',
    lender_ref: 'VB-2024-12345',
    lender_entity: 'Vanquis Banking Group plc',
    loan_amount: '2,500.00',
    loan_date: '15 March 2023',
    loan_type: 'Credit Card',
    interest_rate: '39.9',
    monthly_repayment: '125.00',
    total_repayable: '4,500.00',
    loan_term: '48 months',
    dti_ratio: '58',
    disposable_income: '-120.45',
    monthly_income: '1,800.00',
    monthly_expenditure: '1,920.45',
    total_debt: '15,000.00',
    case_ref: 'RR-2024-0001',
    case_status: 'Active',
    settlement_amount: '1,250.00',
    ...OO_FIRM_DEFAULTS,
    solicitor_name: 'Brad',
    today_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
};

// Helper: Download S3 object as Buffer
async function downloadS3Buffer(key) {
    const resp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    const chunks = [];
    for await (const chunk of resp.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// Helper: Upload buffer to S3
async function uploadS3Buffer(key, buffer, contentType) {
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
}

// Helper: Extract merge field names from DOCX template
function extractMergeFields(docxBuffer) {
    try {
        const zip = new PizZip(docxBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });
        const text = doc.getFullText();
        const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
        return [...new Set(matches.map(m => m.replace(/^\{\{|\}\}$/g, '').trim()))];
    } catch (err) {
        console.warn('[OO] Could not extract merge fields:', err.message);
        return [];
    }
}

// --- EMAIL CONFIGURATION ---
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
        user: 'irl@rowanrose.co.uk',
        pass: 'Farm54595459!!!'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// Verify email configuration
emailTransporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email configuration error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

// AI Configuration moved to aiSkills.js for modularity
// System prompt and tools are now dynamically built based on context
// See aiSkills.js for all skill definitions, tools, and knowledge base
// --- HELPER FUNCTION: Add Timestamp to Signature ---
// Note: Timestamp is no longer added to the image itself, it's shown in the LOA HTML
async function addTimestampToSignature(base64Data) {
    if (!base64Data) return null;
    try {
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        // Return the image buffer without adding timestamp text
        return imageBuffer;
    } catch (error) {
        console.error("Error processing signature:", error);
        return Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    }
}

// --- HELPER FUNCTION: Generate HTML Template for T&C PDF ---
async function generateTermsHTML(clientData, logoBase64) {
    const {
        first_name,
        last_name,
        street_address,
        address_line_2,
        city,
        state_county,
        postal_code,
        phone
    } = clientData;

    const fullName = `${first_name} ${last_name}`;
    const streetCombined = [street_address, address_line_2].filter(Boolean).join(', ');
    const addressParts = [streetCombined, city, state_county, postal_code].filter(Boolean);
    const fullAddress = addressParts.join(', ');

    // Get current date/time
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

    // Populate HTML content with client data
    let populatedHtml = tcHtml;
    populatedHtml = populatedHtml.replace(/{{first name}}/g, first_name || '');
    populatedHtml = populatedHtml.replace(/{{last name}}/g, last_name || '');
    populatedHtml = populatedHtml.replace(/{{street address}}/g, streetCombined);
    populatedHtml = populatedHtml.replace(/{{city\/town}}/g, city || '');
    populatedHtml = populatedHtml.replace(/{{country\/state}}/g, state_county || '');
    populatedHtml = populatedHtml.replace(/{{postalcode}}/g, postal_code || '');
    populatedHtml = populatedHtml.replace(/{{Contact number}}/g, phone || '');
    populatedHtml = populatedHtml.replace(/14\/01\/2026/g, today);
    populatedHtml = populatedHtml.replace(/{PLATFORM_DATE}/g, todayWithTime);
    populatedHtml = populatedHtml.replace(/\[Client\.FirstName\]/g, first_name || '');
    populatedHtml = populatedHtml.replace(/\[Client\.LastName\]/g, last_name || '');
    populatedHtml = populatedHtml.replace(/\[Client\.StreetAddress\]/g, streetCombined);
    populatedHtml = populatedHtml.replace(/\[Client\.City\]/g, city || '');
    populatedHtml = populatedHtml.replace(/\[Client\.PostalCode\]/g, postal_code || '');
    const fullAddressTpl = [street_address, address_line_2, city, state_county, postal_code].filter(Boolean).join(', ');
    populatedHtml = populatedHtml.replace(/\[Client\.Address\]/g, fullAddressTpl);

    // Create full HTML document
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terms and Conditions - ${fullName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 10pt;
            line-height: 1.6;
            color: #334155;
            background: white;
        }
        
        .page {
            padding: 20mm 15mm;
            max-width: 210mm;
            margin: 0 auto;
        }
        
        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e2e8f0;
            width: 100%;
        }

        .header-left {
            flex: 0 0 auto;
        }

        .logo {
            width: 180px;
            height: auto;
        }

        .header-right {
            flex: 1;
            text-align: right;
            padding-left: 40px;
            padding-right: 0;
        }
        
        .company-name {
            font-size: 14pt;
            font-weight: bold;
            color: #0f172a;
            margin-bottom: 5px;
        }
        
        .company-tel {
            font-size: 10pt;
            color: #334155;
            margin-bottom: 3px;
        }
        
        .company-address {
            font-size: 10pt;
            color: #334155;
            line-height: 1.4;
            margin-bottom: 5px;
        }
        
        .company-email {
            font-size: 10pt;
        }
        
        .company-email a {
            color: #2563eb;
            text-decoration: none;
        }
        
        .client-info {
            margin-top: 20px;
            margin-bottom: 25px;
        }
        
        .client-date {
            font-size: 12pt;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 10px;
        }
        
        .client-name {
            font-size: 12pt;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 10px;
        }
        
        .client-address {
            font-size: 12pt;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 15px;
            line-height: 1.4;
        }
        
        .tc-heading {
            font-size: 11pt;
            font-weight: bold;
            color: #1e293b;
            margin-top: 15px;
            margin-bottom: 20px;
        }
        
        .content {
            margin-top: 20px;
        }
        
        h1 {
            font-size: 16pt;
            font-weight: bold;
            color: #0f172a;
            margin-top: 25px;
            margin-bottom: 15px;
            text-decoration: underline;
        }
        
        h2 {
            font-size: 14pt;
            font-weight: bold;
            color: #0f172a;
            margin-top: 20px;
            margin-bottom: 12px;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 5px;
        }
        
        h3 {
            font-size: 12pt;
            font-weight: bold;
            color: #1e293b;
            margin-top: 15px;
            margin-bottom: 10px;
        }
        
        h4 {
            font-size: 10pt;
            font-weight: bold;
            color: #1e293b;
            margin-top: 12px;
            margin-bottom: 8px;
            font-style: italic;
        }
        
        p {
            margin-bottom: 10px;
            text-align: justify;
        }
        
        ul, ol {
            margin-bottom: 15px;
            padding-left: 25px;
        }
        
        li {
            margin-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 9pt;
        }
        
        th, td {
            border: 1px solid #e2e8f0;
            padding: 8px;
            text-align: left;
        }
        
        th {
            background-color: #f8fafc;
            font-weight: bold;
            color: #0f172a;
        }
        
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        
        strong {
            color: #0f172a;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 8pt;
            color: #94a3b8;
            font-style: italic;
        }
        
        .signature-box {
            border: 1px solid #e2e8f0;
            padding: 20px;
            margin-top: 30px;
            background: #fafafa;
        }
        
        .signature-box h3 {
            font-size: 12pt;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 10px;
        }
        
        .signature-box p {
            font-size: 10pt;
            margin-bottom: 5px;
        }
        
        @media print {
            .page {
                padding: 0;
            }
        }
    </style>
</head>
<body>
    <div class="page">
        <div class="header-container">
            <div class="header-left">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Fast Action Claims" />` : ''}
            </div>
            <div class="header-right">
                <div class="company-name">Fast Action Claims</div>
                <div class="company-tel">Tel: 0161 5331706</div>
                <div class="company-address">
                    Address: 1.03 The boat shed<br/>
                    12 Exchange Quay<br/>
                    Salford<br/>
                    M5 3EQ
                </div>
                <div class="company-email">
                    irl@rowanrose.co.uk
                </div>
            </div>
        </div>
        
        <div class="client-info">
            <div class="client-date">${today}</div>
            
            <div class="client-name">${fullName}</div>
            
            <div class="client-address">${fullAddress}</div>
            
            <div class="tc-heading">Terms and Conditions of Engagement</div>
        </div>
        
        <div class="content">
            ${populatedHtml}
        </div>
        
        <div class="signature-box">
            <h3>ELECTRONIC SIGNATURE VERIFICATION</h3>
            <p><strong>Signatory:</strong> ${fullName}</p>
            <p><strong>Certified Timestamp:</strong> ${todayWithTime}</p>
        </div>
        
        <div class="footer">
            This document is electronically signed and legally binding.
        </div>
    </div>
</body>
</html>
    `;
}

// --- 3. GENERATE LOA HTML CONTENT ---
async function generateLOAHTML(contact, lender, logoBase64, signatureBase64) {
    const {
        first_name,
        last_name,
        address_line_1,
        address_line_2,
        city,
        state_county,
        postal_code,
        dob,
        previous_addresses,
        previous_address_line_1,
        previous_address_line_2
    } = contact;

    const fullName = `${first_name} ${last_name}`;
    const streetAddress = [address_line_1, address_line_2].filter(Boolean).join(', ');
    const finalCity = city || '';
    const finalState = state_county || '';

    // Format DOB
    let formattedDOB = '';
    if (dob) {
        try {
            const dobDate = new Date(dob);
            if (!isNaN(dobDate.getTime())) {
                formattedDOB = dobDate.toLocaleDateString('en-GB');
            } else {
                formattedDOB = dob;
            }
        } catch (e) {
            formattedDOB = dob;
        }
    }

    // Format Previous Addresses
    let previousAddressHTML = '';
    if (previous_addresses && Array.isArray(previous_addresses) && previous_addresses.length > 0) {
        // Handle JSONB array of previous addresses
        previousAddressHTML = previous_addresses.map((addr, index) => {
            const addrParts = [
                addr.line1 || addr.address_line_1,
                addr.line2 || addr.address_line_2,
                addr.city,
                addr.county || addr.state_county,
                addr.postalCode || addr.postal_code
            ].filter(Boolean).join(', ');
            return previous_addresses.length > 1
                ? `<div style="margin-bottom: 4px;"><strong>${index + 1}.</strong> ${addrParts}</div>`
                : `<strong>${addrParts}</strong>`;
        }).join('');
    } else if (previous_address_line_1) {
        // Legacy single previous address
        const addrParts = [previous_address_line_1, previous_address_line_2].filter(Boolean).join(', ');
        previousAddressHTML = `<strong>${addrParts}</strong>`;
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; line-height: 1.4; margin: 0; padding: 25px; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .logo-cell { width: 30%; vertical-align: middle; text-align: left; padding-right: 20px; }
        .contact-cell { width: 70%; vertical-align: middle; text-align: right; font-size: 10px; line-height: 1.6; color: #000; font-weight: bold; padding-right: 0; }
        .logo-img { width: 160px; height: auto; }
        
        .h1-container { text-align: center; margin: 25px 0; }
        h1 { font-size: 18px; font-weight: bold; text-decoration: underline; text-transform: uppercase; margin: 0; }
        
        .lender-section { text-align: left; font-size: 12px; margin-bottom: 20px; text-decoration: none; }

        .client-box { width: 100%; margin-bottom: 20px; }
        .client-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
        .client-table td { padding: 8px 12px; border: 1px solid #000; vertical-align: top; font-size: 12px; color: #000; }
        .client-table td.label { font-weight: bold; width: 150px; background-color: #f2f2f2; font-size: 12px; }

        .legal-text { font-size: 9px; text-align: justify; margin-bottom: 20px; color: #000; line-height: 1.5; }
        .legal-text p { margin-bottom: 10px; }

        .signature-section { width: 100%; border: 2px solid #000; padding: 15px; margin-top: 20px; box-sizing: border-box; }
        .sign-table { width: 100%; border-collapse: collapse; }
        .sign-table td { vertical-align: middle; }
        .signature-img { max-height: 80px; max-width: 300px; display: block; margin: 0 auto; }
        
        .footer { font-size: 8px; text-align: center; color: #444; margin-top: 40px; padding-top: 15px; border-top: 1px solid #999; line-height: 1.3; }
    </style>
</head>
<body>

    <table class="header-table">
        <tr>
            <td class="logo-cell">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : '<div style="font-size: 20px; font-weight: bold; color: #b45f06;">FAST ACTION CLAIMS</div>'}
            </td>
            <td class="contact-cell">
                <strong>Fast Action Claims</strong><br>
                Tel: 0161 5331706<br>
                Address: 1.03 The boat shed<br>
                12 Exchange Quay<br>
                Salford<br>
                M5 3EQ<br>
                irl@rowanrose.co.uk
            </td>
        </tr>
    </table>

    <div class="h1-container">
        <h1>LETTER OF AUTHORITY</h1>
    </div>

    <div class="lender-section">
        IN RESPECT OF: <strong>${lender}</strong>
    </div>

    <div class="client-box">
        <table class="client-table">
            <tr>
                <td class="label">Full Name:</td>
                <td><strong>${fullName}</strong></td>
            </tr>
            <tr>
                <td class="label">Address:</td>
                <td>
                    <strong>
                    ${streetAddress}<br>
                    ${finalCity}, ${finalState}
                    </strong>
                </td>
            </tr>
            <tr>
                <td class="label">Postal Code:</td>
                <td><strong>${postal_code || ''}</strong></td>
            </tr>
            <tr>
                <td class="label">Date of Birth:</td>
                <td><strong>${formattedDOB}</strong></td>
            </tr>
            <tr>
                <td class="label">Previous Address:</td>
                <td>${previousAddressHTML || ''}</td>
            </tr>
        </table>
    </div>

    <div class="legal-text">
        <p><strong>I/We hereby Authorise and instruct:</strong> You (The Bank/Door Step Lender/Building Society/Card Provider/Finance Provider/Loan Broker/Underwriter/Insurance Provider/Financial Advisor/Pension Provider/Catalogue Loans provider/Mortgage Broker/HMRC) to: -</p>

        <p>1. Liaise exclusively with Fast Action Claims in respect of all aspects of my/our potential complaint/claim for compensation as stated above.</p>

        <p>2. Immediately release to Fast Action Claims any information/documentation relating to all my/our loans/credit cards/overdrafts/Store Cards/Car Finance/Packaged Bank Account/ to include all Broker Commissions, Tax deductions which may be requested. This includes information in response to a request made under Sections 77-78 of the Consumer Credit Act 1974 and/or Section 45 of the Data Protection Act 2018 and Article 15 GDPR (General Data Protection Regulations).</p>

        <p>3. Contact Fast Action Claims whenever they need to send me/us information or contact me/us in connection with this matter.</p>

        <p>I/We authorise Fast Action Claims of 1.03, 12 Exchange Quay, Salford, M5 3EQ as my/our sole representatives to deal with my potential complaint/claim for compensation in relation to all loans/credit cards/car finance/overdrafts/Packaged Bank Accounts/Store Cards/Packaged Bank Account. I/We confirm that Fast Action Claims are instructed to pursue all aspects they consider necessary in relation to my/our dealings with your organisation. This letter of authority relates to ALL products and accounts I/We have or have had with you. I/We have read, understand and agree to Fast Action Claims' Terms and Conditions. I/We give them full authority, in accordance with the FCA's Dispute Resolution Guidelines, to act on my/our behalf as my/our to pursue all aspects they deem necessary in relation to all my/our financial affairs/tax affairs with the aforementioned Provider(s). I/We authorise you to accept any signatures on documents sent to you by Fast Action Claims which have been obtained electronically (e-signed). I/We confirm that in the event that you need to contact a third party to progress my/our case for any reason, I/we hereby give my/our authority and consent for the third party to provide Fast Action Claims with any information they request and may require to pursue my/our claim/complaint. I/We understand that, in addition to the present Letter of Authority I/We will need to provide further information when raising an expression of dissatisfaction to you (The Bank/Building Society/Card Provider/Finance Provider/Loan Broker/Underwriter/Insurance Provider/Financial Advisor/HMRC), about the underlying products), service(s) and where known, specific account number(s) being complained about. I hereby authorise Fast Action Claims to submit my claim for irresponsible lending.</p>
    </div>

    <div class="signature-section">
        <table class="sign-table" style="width: 100%;">
            <tr>
                <td style="width: 40%; vertical-align: top; padding-right: 10px;">
                    <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px;">SIGNATURE</div>
                    <div style="font-size: 10px; color: #333;">Created at: ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</div>
                </td>
                <td style="width: 60%; text-align: left; vertical-align: top;">
                    ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height: 60px; max-width: 200px; display: block;" />` : '<span style="font-size: 12px;">Signed Electronically</span>'}
                </td>
            </tr>
        </table>
    </div>

    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Solicitors, authorised and regulated by the Solicitors Regulation Authority (SRA No. 8000843). Registered office: 1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. Rowan Rose Solicitors is a limited company registered in England and Wales (Company No. 12916452)
    </div>

</body>
</html>
    `;
}


// --- 3. GENERATE HTML CONTENT FOR FAST ACTION CLAIMS ---
// --- HELPER FUNCTION: Generate LOA PDF for Specific Lender ---
async function generateLenderLOA(lenderName, clientData, signatureBuffer) {
    // Prepare Signature
    let signatureBase64 = '';
    if (signatureBuffer) {
        signatureBase64 = 'data:image/png;base64,' + signatureBuffer.toString('base64');
    }

    // Read the logo image from public/fac.png
    let facLogoBase64 = '';
    try {
        const logoPath = path.join(__dirname, 'public', 'fac.png');
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            facLogoBase64 = 'data:image/png;base64,' + logoBuffer.toString('base64');
        }
    } catch (e) {
        console.error('Error reading fac.png:', e);
    }

    // Use consolidated generateLOAHTML
    const htmlContent = await generateLOAHTML(clientData, lenderName, facLogoBase64, signatureBase64);


    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
    });
    await browser.close();

    return pdfBuffer;
}

// --- HELPER FUNCTION: Generate Previous Address PDF ---
async function generatePreviousAddressPDF(clientData, addresses, logoBase64) {
    const {
        first_name,
        last_name,
        intake_lender
    } = clientData;

    const fullName = `${first_name} ${last_name}`;
    const today = new Date().toLocaleDateString('en-GB');

    // Lender Address Logic
    let lenderAddressBlock = '';
    const lenderName = intake_lender || '';

    if (lenderName.toLowerCase().includes('vanquis')) {
        lenderAddressBlock = `Vanquis Bank Limited,<br>Data Protection Team,<br>No. 1 Godwin Street,<br>Bradford,<br>BD1 2SU`;
    } else if (lenderName.toLowerCase().includes('loans 2 go')) {
        lenderAddressBlock = `Loans 2 Go Limited,<br>Bridge Studios,<br>34a Deodar Road,<br>Putney, London,<br>SW15 2NN`;
    } else {
        lenderAddressBlock = '';
    }

    // Build Address Blocks
    let addressBlocksHtml = '';
    if (addresses && addresses.length > 0) {
        addresses.forEach((addr, index) => {
            const addressParts = [
                addr.address_line_1,
                addr.address_line_2,
                addr.city,
                addr.county,
                addr.postal_code
            ].filter(Boolean).join(', ');

            addressBlocksHtml += `
            <div class="address-box">
                <div style="font-weight: bold; margin-bottom: 10px;">PREVIOUS ADDRESS ${index + 1}</div>
                
                <div class="address-row">
                    <span class="address-label">Street Address:</span>
                    <span>${[addr.address_line_1, addr.address_line_2].filter(Boolean).join(', ')}</span>
                </div>
                
                <div class="address-row">
                    <span class="address-label">City / Town:</span>
                    <span>${addr.city || ''}</span>
                </div>
                
                <div class="address-row">
                    <span class="address-label">County / State:</span>
                    <span>${addr.county || ''}</span>
                </div>
                
                <div class="address-row">
                    <span class="address-label">Postal Code:</span>
                    <span>${addr.postal_code || ''}</span>
                </div>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            `;
        });
    } else {
        addressBlocksHtml = '<p>No previous addresses provided.</p>';
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10pt; color: #333; line-height: 1.4; margin: 0; padding: 40px; }
        .header-table { width: 100%; margin-bottom: 30px; }
        .logo-cell { width: 30%; vertical-align: top; }
        .company-cell { width: 70%; text-align: right; font-size: 10pt; line-height: 1.5; vertical-align: top; padding-right: 0; }
        .logo-img { width: 150px; height: auto; display: block; }
        
        .lender-address { margin-top: 30px; margin-bottom: 30px; line-height: 1.5; }
        
        .ref-section { margin-bottom: 30px; font-weight: bold; }
        
        .extra-info-title { font-weight: bold; text-decoration: underline; margin-bottom: 20px; }
        
        .address-box { margin-bottom: 20px; }
        .address-row { margin-bottom: 10px; }
        .address-label { font-weight: bold; display: inline-block; width: 120px; }
        
        .footer { 
            position: fixed; 
            bottom: 40px; 
            left: 40px; 
            right: 40px; 
            font-size: 8pt; 
            text-align: center; 
            color: #666; 
            border-top: 1px solid #ddd; 
            padding-top: 20px; 
            line-height: 1.3;
        }
    </style>
</head>
<body>

    <table class="header-table">
        <tr>
            <td class="logo-cell">
                 ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                 <div style="margin-top: 20px;">${today}</div>
            </td>
            <td class="company-cell">
                <strong>Fast Action Claims</strong><br>
                Tel: 0161 5331706<br>
                Address: 1.03 The boat shed<br>
                12 Exchange Quay<br>
                Salford<br>
                M5 3EQ<br>
                irl@rowanrose.co.uk
            </td>
        </tr>
    </table>

    <div class="lender-address">
        ${lenderAddressBlock}
    </div>

    <div class="ref-section">
        Our Reference: ${clientData.id}<br>
        Client Name: ${fullName}
    </div>

    <div class="extra-info-title">
        EXTRA INFORMATION PROVIDED BY OUR CLIENT
    </div>

    ${addressBlocksHtml}

    <div class="footer">
        Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. A list of directors is available at our registered office. We are authorised and regulated by the Solicitors Regulation Authority
    </div>

</body>
</html>
    `;

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' } // PDF CSS handles margins
    });
    await browser.close();

    return pdfBuffer;
}

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@fastactionclaims.co.uk',
        pass: 'H!292668193906ah'
    },
    tls: {
        ciphers: 'SSLv3'
    }
});

// --- CRM API ENDPOINTS ---

// Email sending
app.post('/api/submit-previous-address', async (req, res) => {
    console.log('Received request to /api/submit-previous-address');
    console.log('Request Request Body:', JSON.stringify(req.body, null, 2));

    const {
        clientId,
        addresses // Array of address objects
    } = req.body;

    if (!clientId) {
        return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    try {
        // 1. Insert Addresses into previous_addresses table (if any)
        if (addresses && addresses.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Clear existing previous addresses for this contact to avoid duplicates
                await client.query('DELETE FROM previous_addresses WHERE contact_id = $1', [clientId]);

                for (const addr of addresses) {
                    await client.query(
                        `INSERT INTO previous_addresses 
                         (contact_id, address_line_1, address_line_2, city, county, postal_code)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [clientId, addr.address_line_1, addr.address_line_2, addr.city, addr.county, addr.postal_code]
                    );
                }

                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }

            // 2. Fire-and-forget PDF Generation & Upload
            // We do NOT await this, so the client gets a response immediately.
            (async () => {
                console.log(`[Background] Starting PDF generation for Client ${clientId}...`);
                try {
                    const { rows } = await pool.query('SELECT * FROM contacts WHERE id = $1', [clientId]);
                    if (rows.length === 0) {
                        console.error(`[Background] Contact ${clientId} not found.`);
                        return;
                    }
                    const contact = rows[0];
                    console.log(`[Background] Found contact: ${contact.first_name} ${contact.last_name}`);

                    // Read Logo
                    let facLogoBase64 = '';
                    try {
                        const logoPath = path.join(__dirname, 'public', 'fac.png');
                        if (fs.existsSync(logoPath)) {
                            const logoBuffer = fs.readFileSync(logoPath);
                            facLogoBase64 = 'data:image/png;base64,' + logoBuffer.toString('base64');
                            console.log(`[Background] Logo loaded.`);
                        } else {
                            console.warn(`[Background] Logo file not found at ${logoPath}`);
                        }
                    } catch (e) {
                        console.error('[Background] Error reading fac.png:', e);
                    }

                    console.log(`[Background] Generating PDF content...`);
                    const pdfBuffer = await generatePreviousAddressPDF(contact, addresses, facLogoBase64);
                    console.log(`[Background] PDF generated. Buffer size: ${pdfBuffer.length} bytes.`);

                    // 3. Upload to S3 (New Folder Structure)
                    const folderName = `${contact.first_name}_${contact.last_name}_${clientId}`;
                    const timestamp = Date.now();
                    const fileName = `${folderName}/Documents/Previous_Addresses_${timestamp}.pdf`;
                    console.log(`[Background] Uploading to S3 Key: ${fileName}`);

                    const uploadCommand = new PutObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: fileName,
                        Body: pdfBuffer,
                        ContentType: 'application/pdf'
                    });

                    await s3Client.send(uploadCommand);

                    console.log(`✅ [Background] Previous Addresses PDF uploaded successfully to: ${fileName}`);

                    // Generate Signed URL for access
                    const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: fileName
                    }), { expiresIn: 604800 }); // 7 days

                    // 4. Save to Documents Table for CRM Display
                    const fileSizeKB = (pdfBuffer.length / 1024).toFixed(1) + ' KB';

                    await pool.query(
                        `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [clientId, `Previous_Addresses_${timestamp}.pdf`, 'pdf', 'Client', signedUrl, fileSizeKB, ['Previous Address']]
                    );

                    console.log(`✅ [Background] Document record inserted into DB (Key stored for permanent access).`);
                } catch (bgError) {
                    console.error('❌ [Background] PDF Generation/Upload Error:', bgError);
                }
            })();
        }

        res.json({ success: true, message: 'Previous addresses submitted successfully' });

    } catch (error) {
        console.error('Error submitting previous addresses:', error);
        res.status(500).json({ success: false, message: 'Server error processing previous addresses' });
    }
});

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

    // DRAFT MODE: Skip sending if enabled
    if (EMAIL_DRAFT_MODE) {
        console.log(`📝 DRAFT MODE: Email NOT sent to ${to}`);
        console.log(`📝 Subject: ${subject}`);
        return res.status(200).json({ success: true, draft: true, message: 'Email in DRAFT mode - not sent' });
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Email error:', error);
        const isBounce = (error.responseCode && error.responseCode >= 500) ||
            /invalid|does not exist|user unknown|mailbox not found|undeliverable/i.test(error.message);
        if (isBounce) {
            try {
                const contactRes = await pool.query('SELECT id FROM contacts WHERE email = $1', [to]);
                if (contactRes.rows.length > 0) {
                    const cId = contactRes.rows[0].id;
                    await pool.query(
                        `UPDATE documents SET document_status = 'Draft', updated_at = NOW()
                         WHERE contact_id = $1 AND document_status = 'Sent'`, [cId]
                    );
                    await pool.query(
                        `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                         VALUES ($1, 'system', 'system', 'System', 'email_bounced', 'documents', $2, $3, NOW())`,
                        [cId, `Email bounced for ${to} - documents reverted to Draft`, JSON.stringify({ email: to, error: error.message })]
                    );
                    await pool.query(
                        `INSERT INTO persistent_notifications (type, title, message, link, is_read, created_at)
                         VALUES ('ticket_raised', 'Email Bounced', $1, $2, false, NOW())`,
                        [`Email to ${to} bounced: ${error.message}`, `/contacts`]
                    );
                }
            } catch (logErr) { console.error('Bounce log error:', logErr.message); }
        }
        res.status(500).json({ success: false, error: error.message, bounced: isBounce });
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

        // Get Mattermost token (with 3s timeout, don't block login)
        let mattermostToken = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const mmResponse = await fetch(`${MATTERMOST_URL}/api/v4/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login_id: email.toLowerCase(), password }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (mmResponse.ok) {
                mattermostToken = mmResponse.headers.get('token');
            }
        } catch (mmErr) {
            // Mattermost unavailable - continue without token
            console.log('Mattermost login skipped:', mmErr.name === 'AbortError' ? 'timeout' : mmErr.message);
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                isApproved: user.is_approved
            },
            mattermostToken
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

        // Create Mattermost user (async, don't block registration)
        createMattermostUser(email.toLowerCase(), password, fullName).catch(err => {
            console.error('Mattermost user creation failed:', err);
        });

        res.json({ success: true, message: 'Registration successful, pending approval', user: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Verify user session - checks if user still exists and is approved
app.post('/api/auth/verify', async (req, res) => {
    const { userId, email } = req.body;
    try {
        const { rows } = await pool.query(
            'SELECT id, is_approved FROM users WHERE id = $1 OR email = $2',
            [userId, email?.toLowerCase()]
        );

        if (rows.length === 0) {
            return res.json({ valid: false, reason: 'User not found' });
        }

        if (!rows[0].is_approved) {
            return res.json({ valid: false, reason: 'Account not approved' });
        }

        res.json({ valid: true });
    } catch (err) {
        res.status(500).json({ valid: false, reason: err.message });
    }
});

// Get Mattermost URL for embedding
app.get('/api/mattermost/config', (req, res) => {
    res.json({
        url: MATTERMOST_URL,
        team: 'beacon-legal-group' // Your team name (lowercase, hyphenated)
    });
});

// Mattermost login - returns session token for auto-login
app.post('/api/mattermost/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Login to Mattermost directly
        const response = await fetch(`${MATTERMOST_URL}/api/v4/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login_id: email, password })
        });

        if (response.ok) {
            const token = response.headers.get('token');
            const user = await response.json();
            res.json({ success: true, token, userId: user.id });
        } else {
            const error = await response.json();
            res.status(401).json({ success: false, message: error.message || 'Mattermost login failed' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mattermost logout - revokes session token
app.post('/api/mattermost/logout', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.json({ success: true }); // No token to revoke
    }
    try {
        const response = await fetch(`${MATTERMOST_URL}/api/v4/users/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({ success: response.ok });
    } catch (err) {
        console.error('Mattermost logout error:', err);
        res.json({ success: false, message: err.message });
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

        // If no fields to update, return error
        if (params.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        query = query.slice(0, -2); // Remove last comma
        query += ` WHERE id = $${count} RETURNING *`;
        params.push(id);

        // Execute the query (this was missing!)
        const { rows } = await pool.query(query, params);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log(`✅ User ${id} updated:`, { role, isApproved });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Prevent deletion of main admin
        const { rows: check } = await pool.query('SELECT email FROM users WHERE id = $1', [id]);
        if (check.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (check[0].email === 'info@fastactionclaims.co.uk') {
            return res.status(403).json({ success: false, message: 'Cannot delete the main admin account' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        console.log(`🗑️ User ${id} deleted`);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/documents/secure-url', async (req, res) => {
    const { url } = req.body;
    try {
        if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

        // Extract Key from full URL
        let key = url;
        const bucketName = process.env.S3_BUCKET_NAME;

        if (url.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
                key = decodeURIComponent(key);

                // Handle path-style URLs: strip bucket name if present
                if (key.startsWith(bucketName + '/')) {
                    key = key.substring(bucketName.length + 1);
                }
            } catch (e) {
                console.warn('URL parsing failed, using raw string');
            }
        }

        console.log(`[secure-url] Key: ${key}`);

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        res.json({ success: true, signedUrl });
    } catch (err) {
        console.error('Error generating signed URL:', err);
        res.status(500).json({ success: false, message: 'Could not generate secure link' });
    }
});

// Download file proxy - streams file from S3 to client with download headers
app.post('/api/documents/download', async (req, res) => {
    const { url, filename } = req.body;
    try {
        if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

        // Extract Key from full URL
        let key = url;
        const bucketName = process.env.S3_BUCKET_NAME;

        if (url.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
                key = decodeURIComponent(key);

                // Handle path-style URLs: strip bucket name if present
                if (key.startsWith(bucketName + '/')) {
                    key = key.substring(bucketName.length + 1);
                }
            } catch (e) {
                console.warn('URL parsing failed, using raw string');
            }
        }

        console.log(`[download] Key: ${key}`);

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const s3Response = await s3Client.send(command);

        // Set headers for download
        const downloadFilename = filename || key.split('/').pop() || 'download';
        res.setHeader('Content-Type', s3Response.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        // Stream the file to client
        s3Response.Body.pipe(res);
    } catch (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ success: false, message: 'Could not download file' });
    }
});

// --- LEGAL INTAKE ENDPOINTS ---

// Helper function to generate lender-specific LOA PDF


// Helper function to standardize lender names against SPEC_LENDERS
function standardizeLender(lenderName) {
    if (!lenderName) return lenderName;
    const SPEC_LENDERS = [
        '118 118 MONEY', 'AMIGO LOANS', 'CASH EURONET', 'QUICKQUID', 'EVERYDAY LOANS',
        'LENDING STREAM', 'LIKELY LOANS', 'LOANS 2 GO', 'MORSES CLUB',
        'NEWDAY', 'AQUA', 'MARBLES', 'AMAZON CREDIT', 'PIGGYBANK', 'PROVIDENT', 'QUIDIE',
        'SAFETYNET CREDIT', 'SHELBY FINANCE', 'SUNNY', 'THE MONEY SHOP',
        'FLUID', 'VANQUIS', 'WAGE DAY ADVANCE', 'GAMBLING',
        'BIP CREDIT CARD', 'LUMA', 'MBNA', 'OCEAN', 'REVOLUT CREDIT CARD', 'WAVE', 'ZABLE', 'ZILCH',
        'ADMIRAL LOANS', 'ANICO FINANCE', 'AVANT CREDIT', 'BAMBOO', 'BETTER BORROW', 'CREDIT SPRING',
        'CASH ASAP', 'CASH FLOAT', 'CAR CASH POINT', 'CREATION FINANCE', 'CASTLE COMMUNITY BANK',
        'DRAFTY LOANS', 'EVOLUTION MONEY', 'EVERY DAY LENDING', 'FERNOVO', 'FAIR FINANCE',
        'FINIO LOANS', 'FINTERN', 'FLURO', 'KOYO LOANS', 'LOANS BY MAL', 'LOGBOOK LENDING',
        'LOGBOOK MONEY', 'LENDABLE', 'LIFE STYLE LOANS', 'MY COMMUNITY FINANCE', 'MY KREDIT',
        'MY FINANCE CLUB', 'MONEY BOAT', 'MR LENDER', 'MONEY LINE', 'MY COMMUNITY BANK',
        'MONTHLY ADVANCE LOANS', 'NOVUNA', 'OPOLO', 'PM LOANS', 'POLAR FINANCE', 'POST OFFICE MONEY',
        'PROGRESSIVE MONEY', 'PLATA FINANCE', 'PLEND', 'QUID MARKET', 'QUICK LOANS', 'SKYLINE DIRECT',
        'SALAD MONEY', 'SAVVY LOANS', 'SALARY FINANCE', 'NEYBER', 'SNAP FINANCE', 'SHAWBROOK',
        'THE ONE STOP MONEY SHOP', 'TM ADVANCES', 'TANDEM', '118 LOANS', 'WAGESTREAM', 'CONSOLADATION LOAN',
        'GUARANTOR MY LOAN', 'HERO LOANS', 'JUO LOANS', 'SUCO', 'UK CREDIT', '1 PLUS 1',
        'CASH CONVERTERS', 'H&T PAWNBROKERS', 'FASHION WORLD', 'JD WILLIAMS', 'SIMPLY BE',
        'VERY CATALOGUE', 'ADVANTAGE FINANCE', 'AUDI FINANCE', 'VOLKSWAGEN FINANCE', 'SKODA FINANCE',
        'BLUE MOTOR FINANCE', 'CLOSE BROTHERS', 'HALIFAX', 'BANK OF SCOTLAND', 'MONEY WAY',
        'MOTONOVO', 'MONEY BARN', 'OODLE', 'PSA FINANCE', 'RCI FINANCIAL', 'HALIFAX OVERDRAFT',
        'BARCLAYS OVERDRAFT', 'CO-OP BANK OVERDRAFT', 'LLOYDS OVERDRAFT', 'TSB OVERDRAFT',
        'NATWEST OVERDRAFT', 'RBS OVERDRAFT', 'HSBC OVERDRAFT', 'SANTANDER OVERDRAFT'
    ];
    // Case-insensitive match, checking if the trimmed input equals any of the specified lenders
    const match = SPEC_LENDERS.find(l => l.toLowerCase() === lenderName.trim().toLowerCase());
    return match || lenderName;
}

// ============================================================================
// CATEGORY 3: CONFIRMATION REQUIRED LENDERS
// ============================================================================
// These lenders require client confirmation before creating a claim
// Maps correct lender name to intentionally misspelled alternative
// LEFT = correct name (create claim), RIGHT = misspelled (reject)
const CATEGORY_3_CONFIRMATION_LENDERS = {
    'ANICO FINANCE': ['THE ANICO FINANCE'],
    'LOANS BY MAL': ['LOANS BY MAL'],
    'PAYDAY UK': ['PAYNIGHT UK'],
    'QUICK LOANS': ['QUICK LOANZ'],
    'THE ONE STOP MONEY SHOP': ['MONEY SHOP'],
    'TICK TOCK LOANS': ['TIK TOK LOANZ']
};

// Helper function to check if a lender is Category 3
function isCategory3Lender(lenderName) {
    if (!lenderName) return false;
    const normalized = lenderName.toUpperCase().trim();
    return Object.keys(CATEGORY_3_CONFIRMATION_LENDERS).includes(normalized);
}

// Generate confirmation token
function generateConfirmationToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// NOTE: Category 3 confirmation emails are now sent by worker.js (processPendingCategory3Confirmations)
// ============================================================================

// Helper function to set reference_specified on a case and add to contact's reference column
async function setReferenceSpecified(pool, contactId, caseId) {
    const refSpec = `${contactId}${caseId}`;
    // Update case with reference_specified
    await pool.query(
        `UPDATE cases SET reference_specified = $1 WHERE id = $2`,
        [refSpec, caseId]
    );
    // Append to contact's reference column (comma-separated)
    await pool.query(
        `UPDATE contacts SET reference = CASE
            WHEN reference IS NULL OR reference = '' THEN $1
            ELSE reference || ',' || $1
        END WHERE id = $2`,
        [refSpec, contactId]
    );
    return refSpec;
}

// Helper function to send LOA email
async function sendLOAEmail(toEmail, clientName, loaLink) {
    const mailOptions = {
        from: '"Rowan Rose Solicitors" <irl@rowanrose.co.uk>',
        to: toEmail,
        subject: 'Complete Your Lender Selection - Rowan Rose Solicitors',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
                .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 40px 20px; }
                .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 620px; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; }
                .header { background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 45px 45px; text-align: center; }
                .logo-text { font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: 2px; margin: 0; text-transform: uppercase; }
                .content { padding: 48px 45px; background: #ffffff; }
                h1 { color: #0f172a; font-size: 28px; margin-top: 0; margin-bottom: 6px; font-weight: 700; letter-spacing: -0.5px; }
                .subtitle { color: #64748b; font-size: 16px; margin-bottom: 30px; font-weight: 500; }
                p { font-size: 18px; line-height: 1.75; margin-bottom: 16px; color: #475569; }
                .greeting { font-size: 20px; color: #1e293b; margin-bottom: 16px; }
                .highlight-box { background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); border-left: 5px solid #f59e0b; padding: 26px 30px; margin: 32px 0; border-radius: 0 14px 14px 0; }
                .highlight-text { font-weight: 700; color: #b45309; margin: 0; display: block; font-size: 20px; letter-spacing: -0.3px; }
                .highlight-box p { color: #92400e; margin-bottom: 0; margin-top: 12px; font-size: 17px; line-height: 1.6; }
                .info-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 20px 24px; border-radius: 12px; margin: 24px 0; }
                .info-box p { color: #0369a1; margin: 0; font-size: 17px; }
                .info-box strong { color: #075985; }
                .btn-container { text-align: center; margin: 40px 0 32px 0; }
                .btn { display: inline-block; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); color: #ffffff !important; font-size: 20px; font-weight: 700; padding: 20px 52px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); letter-spacing: 0.3px; }
                .expiry-note { font-size: 14px; color: #ef4444; font-weight: 600; margin-top: 14px; display: block; }
                .divider { height: 1px; background: linear-gradient(to right, transparent, #e2e8f0, transparent); margin: 28px 0; }
                .signature { margin-top: 8px; }
                .signature p { margin-bottom: 4px; font-size: 18px; }
                .footer { background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%); padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
                .footer p { margin: 5px 0; font-size: 14px; color: #64748b; }
                .footer-brand { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 8px !important; }
                .footer a { color: #f97316; text-decoration: none; font-weight: 600; }
                .footer a:hover { text-decoration: underline; }
                .footer-sra { font-size: 12px; color: #94a3b8; margin-top: 12px !important; }
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="main">
                    <div class="header">
                        <p class="logo-text">Rowan Rose Solicitors</p>
                    </div>
                    <div class="content">
                        <h1>Your Claim is Being Processed</h1>
                        <p class="subtitle">Expert Legal Support for Your Financial Claims</p>

                        <p class="greeting">Dear ${clientName},</p>
                        <p>Thank you for choosing Rowan Rose Solicitors. We are currently reviewing your initial information and preparing your case.</p>

                        <div class="highlight-box">
                            <span class="highlight-text">Action Required: Select Additional Lenders</span>
                            <p>To maximize your potential compensation, please tell us about any other lenders you have used in the last 15 years.</p>
                        </div>

                        <div class="info-box">
                            <p><strong>Did you know?</strong> Establishing a pattern of irresponsible lending across multiple lenders significantly strengthens your case and can increase your compensation.</p>
                        </div>

                        <div class="btn-container">
                            <a href="${loaLink}" class="btn">Complete Lender Selection</a>
                            <span class="expiry-note">This secure link expires in 7 days</span>
                        </div>

                        <div class="divider"></div>

                        <p>If you have any questions, our dedicated team is here to assist you.</p>
                        <div class="signature">
                            <p>Kind regards,</p>
                            <p><strong>The Rowan Rose Solicitors Team</strong></p>
                        </div>
                    </div>
                    <div class="footer">
                        <p class="footer-brand">Rowan Rose Solicitors</p>
                        <p>1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
                        <p><a href="tel:01615331706">0161 533 1706</a> &nbsp;|&nbsp; <a href="mailto:irl@rowanrose.co.uk">irl@rowanrose.co.uk</a></p>
                        <p class="footer-sra">Authorised and Regulated by the Solicitors Regulation Authority (SRA No. 8000843)</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `
    };

    // DRAFT MODE: Skip sending if enabled
    if (EMAIL_DRAFT_MODE) {
        console.log(`📝 DRAFT MODE: LOA Email NOT sent to ${toEmail}`);
        console.log(`📝 Subject: ${mailOptions.subject}`);
        console.log(`📝 Link: ${loaLink}`);
        return { success: true, draft: true, message: 'Email in DRAFT mode - not sent' };
    }

    try {
        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (smtpError) {
        console.error('❌ Email delivery failed:', smtpError.message);
        const isBounce = (smtpError.responseCode && smtpError.responseCode >= 500) ||
            /invalid|does not exist|user unknown|mailbox not found|undeliverable/i.test(smtpError.message);

        if (isBounce) {
            // Log bounce to action_logs - find contact by email
            try {
                const contactRes = await pool.query('SELECT id FROM contacts WHERE email = $1', [toEmail]);
                if (contactRes.rows.length > 0) {
                    const cId = contactRes.rows[0].id;
                    // Revert any Sent documents to Draft
                    await pool.query(
                        `UPDATE documents SET document_status = 'Draft', updated_at = NOW()
                         WHERE contact_id = $1 AND document_status = 'Sent'`, [cId]
                    );
                    await pool.query(
                        `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                         VALUES ($1, 'system', 'system', 'System', 'email_bounced', 'documents', $2, $3, NOW())`,
                        [cId, `Email bounced for ${toEmail} - documents reverted to Draft`, JSON.stringify({ email: toEmail, error: smtpError.message })]
                    );
                    await pool.query(
                        `INSERT INTO persistent_notifications (type, title, message, link, is_read, created_at)
                         VALUES ('ticket_raised', 'Email Bounced', $1, $2, false, NOW())`,
                        [`Email to ${toEmail} bounced: ${smtpError.message}. Please update the client's email address.`, `/contacts`]
                    );
                }
            } catch (logErr) {
                console.error('Failed to log bounce:', logErr.message);
            }
        }
        return { success: false, bounced: isBounce, error: smtpError.message };
    }
}

app.post('/api/submit-page1', async (req, res) => {
    const {
        first_name, last_name, phone, email, date_of_birth,
        street_address, city, state_county, postal_code, signature_data,
        address_line_1, address_line_2, // Still accepting these for safety or mapping
        lender_type // NEW: Accept lender type from form
    } = req.body;

    if (!first_name || !last_name || !signature_data) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // 1. Insert into contacts table with source = 'Client Filled' and intake_lender
        // Auto-generate sales_signature_token
        const { randomUUID } = await import('crypto');
        const salesToken = randomUUID();
        const insertQuery = `
                                INSERT INTO contacts
                                (first_name, last_name, full_name, phone, email, dob, address_line_1, address_line_2, city, state_county, postal_code, source, intake_lender, sales_signature_token)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Client Filled', $12, $13)
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
            finalAddressLine1, finalAddressLine2, finalCity, finalState, postal_code,
            lender_type || null, // Add lender type
            salesToken // Add sales_signature_token
        ];

        const dbRes = await pool.query(insertQuery, values);
        const contactId = dbRes.rows[0].id;
        const folderPath = `${first_name}_${last_name}_${contactId}/`;

        // --- IMMEDIATE RESPONSE TO CLIENT ---
        // We respond NOW so the user doesn't wait for PDF generation/Uploads
        res.json({ success: true, contact_id: contactId, folder_path: folderPath });

        // --- BACKGROUND PROCESSING ---
        // Explicitly NOT awaiting this block so it runs in background
        (async () => {
            try {
                console.log(`[Background] Starting processing for contact ${contactId} (${fullName})...`);

                // 3. Upload Signature to S3: user_id/Signatures/signature.png
                const signatureBufferWithTimestamp = await addTimestampToSignature(signature_data);
                const signatureKey = `${folderPath}Signatures/signature.png`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: signatureKey,
                    Body: signatureBufferWithTimestamp,
                    ContentType: 'image/png'
                }));

                const signatureUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: signatureKey }), { expiresIn: 604800 });

                // 4. Generate T&C PDF using Puppeteer (HTML to PDF)
                let logoBase64 = null;
                try {
                    const logoPath = path.join(__dirname, 'public', 'rowan-rose-logo.png');
                    const logoBuffer = await fs.promises.readFile(logoPath);
                    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                } catch (e) {
                    console.warn('[Background] Logo not found, PDF will be generated without logo');
                }

                // Prepare client data for HTML generation
                const clientData = {
                    first_name,
                    last_name,
                    street_address: finalAddressLine1,
                    address_line_2: finalAddressLine2,
                    city: finalCity,
                    state_county: finalState,
                    postal_code,
                    phone
                };

                // Generate HTML content
                const htmlContent = await generateTermsHTML(clientData, logoBase64);

                // Generate PDF using Puppeteer
                const browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                const page = await browser.newPage();
                await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });

                const pdfBuffer = await page.pdf({
                    format: 'A4',
                    margin: {
                        top: '10mm',
                        right: '10mm',
                        bottom: '10mm',
                        left: '10mm'
                    },
                    printBackground: true,
                    preferCSSPageSize: false
                });

                await browser.close();

                const tcKey = `${folderPath}Terms-and-Conditions/Terms.pdf`;
                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: tcKey,
                    Body: pdfBuffer,
                    ContentType: 'application/pdf'
                }));

                // Update signature URL in DB
                await pool.query('UPDATE contacts SET signature_url = $1, signature_2_url = $1 WHERE id = $2', [signatureUrl, contactId]);

                // Insert Signature into documents table
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, 'Signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Signed']]
                );

                // Save T&C PDF to documents table
                const tcUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: tcKey }), { expiresIn: 604800 });
                const tcDocName = `${first_name} ${last_name} Terms and Conditions.pdf`;
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, tcDocName, 'pdf', 'Legal', tcUrl, 'Auto-generated', ['T&C', 'Signed']]
                );

                // 5. NEW: If lender_type is provided, create a claim and generate LOA
                if (lender_type) {
                    const finalLender = standardizeLender(lender_type);
                    // Create claim for this lender - status is 'Extra Lender Selection Form Sent' until form is submitted
                    // Set dsar_send_after to 2 minutes from now (skip for GAMBLING)
                    const dsarSendAfter = finalLender.toUpperCase() !== 'GAMBLING'
                        ? new Date(Date.now() + 2 * 60 * 1000)
                        : null;
                    const claimRes = await pool.query(
                        `INSERT INTO cases (contact_id, lender, status, loa_generated, dsar_send_after)
                                        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [contactId, finalLender, 'Extra Lender Selection Form Sent', false, dsarSendAfter]
                    );
                    const claimId = claimRes.rows[0].id;
                    await setReferenceSpecified(pool, contactId, claimId);

                    console.log(`[Server] Created claim ${claimId} for ${lender_type}. Offloading PDF generation to worker.`);

                    // 6. Create submission token for additional lender selection
                    const { randomUUID } = await import('crypto');
                    const token = randomUUID();
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

                    await pool.query(
                        `INSERT INTO submission_tokens (token, contact_id, lender, expires_at)
                                        VALUES ($1, $2, $3, $4)`,
                        [token, contactId, lender_type, expiresAt]
                    );

                    // 7. Send email with unique link
                    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
                    const uniqueLink = `${baseUrl}/loa-form/${token}`;

                    try {
                        await sendLOAEmail(email, fullName, uniqueLink);
                        console.log(`[Background] ✅ Sent LOA email to ${email} with link: ${uniqueLink}`);
                    } catch (emailError) {
                        console.error('[Background] ⚠️  Email failed:', emailError.message);
                    }
                }

                // Create action log entry for contact creation via intake form
                await pool.query(
                    `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        contactId,
                        'client',
                        contactId.toString(),
                        fullName,
                        'contact_created',
                        'account',
                        `Created by - Intake Form`,
                        JSON.stringify({ source: 'Client Filled', email, phone, lender_type })
                    ]
                );

                console.log(`[Background] ✅ ALL TASKS COMPLETED for contact ${contactId}`);

            } catch (err) {
                console.error('[Background] ❌ Background Processing Error:', err);
                // Optional: Update DB to flag error state if we had a status column
            }
        })();

    } catch (error) {
        console.error('Submit Page1 Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/verify-loa-token/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            `SELECT st.lender, st.expires_at, c.first_name, c.last_name, c.loa_submitted
             FROM submission_tokens st
             JOIN contacts c ON st.contact_id = c.id
             WHERE st.token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid token' });
        }

        const data = result.rows[0];
        const now = new Date();
        const expiresAt = new Date(data.expires_at);

        if (now > expiresAt) {
            return res.status(410).json({ success: false, message: 'Token expired' });
        }

        if (data.loa_submitted) {
            return res.status(400).json({ success: false, message: 'LOA already submitted', alreadySubmitted: true });
        }

        res.json({
            success: true,
            lender: data.lender,
            clientName: `${data.first_name} ${data.last_name}`
        });
    } catch (error) {
        console.error('Verify Token Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/upload-document', upload.single('document'), async (req, res) => {
    const { contact_id, category } = req.body;
    const file = req.file;

    if (!file || !contact_id) {
        return res.status(400).json({ success: false, message: 'Missing file or contact ID' });
    }

    // Default category to 'Other' if not provided
    const docCategory = category || 'Other';

    try {
        // Fetch contact name for folder
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contact_id]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }
        const { first_name, last_name } = contactRes.rows[0];

        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        // Sanitize category for S3 path
        const sanitizedCategory = docCategory.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Check for existing file with same name in this category
        let s3FileName = `${baseName}${ext}`;
        const folderPath = `${first_name}_${last_name}_${contact_id}/Documents/${sanitizedCategory}`;

        const nameCheck = await pool.query(
            `SELECT name FROM documents WHERE contact_id = $1 AND name LIKE $2 AND category = $3`,
            [contact_id, `${baseName}%${ext}`, docCategory]
        );

        if (nameCheck.rows.length > 0) {
            // File exists, append version number
            let maxVersion = 0;
            const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((\\d+)\\))?\\${ext}$`);

            nameCheck.rows.forEach(row => {
                const match = row.name.match(regex);
                if (match) {
                    const ver = match[1] ? parseInt(match[1]) : 0;
                    if (ver >= maxVersion) maxVersion = ver;
                }
            });

            s3FileName = `${baseName} (${maxVersion + 1})${ext}`;
        }

        const key = `${folderPath}/${s3FileName}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

        // Determine document type from extension
        const extLower = ext.toLowerCase().replace('.', '');
        let docType = 'unknown';
        if (['pdf'].includes(extLower)) docType = 'pdf';
        else if (['doc', 'docx'].includes(extLower)) docType = 'docx';
        else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extLower)) docType = 'image';
        else if (['xls', 'xlsx', 'csv'].includes(extLower)) docType = 'spreadsheet';
        else if (['txt'].includes(extLower)) docType = 'txt';

        // Store with original filename and category
        const { rows } = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [contact_id, s3FileName, docType, docCategory, s3Url, `${(file.size / 1024).toFixed(1)} KB`, [docCategory, 'Uploaded', `Original: ${originalName}`]]
        );

        // Update document_checklist to set identification = true if ID Document category
        if (docCategory === 'ID Document') {
            await pool.query(
                `UPDATE contacts
                 SET document_checklist = COALESCE(document_checklist, '{}')::jsonb || '{"identification": true}'::jsonb
                 WHERE id = $1`,
                [contact_id]
            );
            // Auto-complete: ID Document uploaded by client = Completed
            await pool.query(
                `UPDATE documents SET document_status = 'Completed', updated_at = NOW() WHERE id = $1`,
                [rows[0].id]
            );
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'client', $1, 'Client', 'document_completed', 'documents', $2, $3, NOW())`,
                [contact_id, `Client uploaded ID document: "${s3FileName}"`, JSON.stringify({ document_id: rows[0].id, category: 'ID Document' })]
            );
            console.log(`[Upload] "${originalName}" → "${key}" for contact ${contact_id}, category ${docCategory}, identification set to true`);
        } else if (docCategory === 'Proof of Address') {
            // Auto-complete: POA uploaded by client = Completed
            await pool.query(
                `UPDATE documents SET document_status = 'Completed', updated_at = NOW() WHERE id = $1`,
                [rows[0].id]
            );
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'client', $1, 'Client', 'document_completed', 'documents', $2, $3, NOW())`,
                [contact_id, `Client uploaded proof of address: "${s3FileName}"`, JSON.stringify({ document_id: rows[0].id, category: 'Proof of Address' })]
            );
            console.log(`[Upload] "${originalName}" → "${key}" for contact ${contact_id}, category ${docCategory}, POA completed`);
        } else {
            console.log(`[Upload] "${originalName}" → "${key}" for contact ${contact_id}, category ${docCategory}`);
        }

        res.json({ success: true, url: s3Url, document: rows[0] });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- CLAIM DOCUMENT UPLOAD ---
// Uploads document to Lenders/{LenderName}/{Category}/ folder
// Special handling for LOA and Cover Letter - stored directly in lender folder with standard naming
app.post('/api/upload-claim-document', upload.single('document'), async (req, res) => {
    const { contact_id, claim_id, lender, category } = req.body;
    const file = req.file;

    if (!file || !contact_id || !lender || !category) {
        return res.status(400).json({ success: false, message: 'Missing file, contact_id, lender, or category' });
    }

    try {
        // Fetch contact name for folder
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contact_id]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }
        const { first_name, last_name } = contactRes.rows[0];

        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        // Sanitize lender and category names for S3 path
        const sanitizedLender = lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const sanitizedCategory = category.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Reference spec for standard naming
        const refSpec = `${contact_id}${claim_id || ''}`;
        const clientName = `${first_name} ${last_name}`;

        let s3FileName;
        let folderPath;
        let key;

        // Special handling for LOA and Cover Letter - store directly in lender folder with DSAR-compatible naming
        if (category === 'Letter of Authority') {
            s3FileName = `${refSpec} - ${clientName} - ${sanitizedLender} - LOA${ext}`;
            folderPath = `${first_name}_${last_name}_${contact_id}/Lenders/${sanitizedLender}`;
            key = `${folderPath}/${s3FileName}`;
        } else if (category === 'Cover Letter') {
            s3FileName = `${refSpec} - ${clientName} - ${sanitizedLender} - COVER LETTER${ext}`;
            folderPath = `${first_name}_${last_name}_${contact_id}/Lenders/${sanitizedLender}`;
            key = `${folderPath}/${s3FileName}`;
        } else {
            // Standard category - store in subfolder
            s3FileName = `${baseName}${ext}`;
            folderPath = `${first_name}_${last_name}_${contact_id}/Lenders/${sanitizedLender}/${sanitizedCategory}`;

            // Check for existing file with same name to handle versioning
            const nameCheck = await pool.query(
                `SELECT name FROM documents WHERE contact_id = $1 AND name LIKE $2 AND tags @> ARRAY[$3]::text[]`,
                [contact_id, `${baseName}%${ext}`, lender]
            );

            if (nameCheck.rows.length > 0) {
                // File exists, append version number
                let maxVersion = 0;
                const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((\\d+)\\))?\\${ext}$`);

                nameCheck.rows.forEach(row => {
                    const match = row.name.match(regex);
                    if (match) {
                        const ver = match[1] ? parseInt(match[1]) : 0;
                        if (ver >= maxVersion) maxVersion = ver;
                    }
                });

                s3FileName = `${baseName} (${maxVersion + 1})${ext}`;
            }
            key = `${folderPath}/${s3FileName}`;
        }

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

        // Determine document type from extension
        const extLower = ext.toLowerCase().replace('.', '');
        let docType = 'unknown';
        if (['pdf'].includes(extLower)) docType = 'pdf';
        else if (['doc', 'docx'].includes(extLower)) docType = 'docx';
        else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extLower)) docType = 'image';
        else if (['xls', 'xlsx', 'csv'].includes(extLower)) docType = 'spreadsheet';
        else if (['txt'].includes(extLower)) docType = 'txt';

        // Store with original filename, category, and tags including lender + 'claim-document'
        const { rows } = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [contact_id, s3FileName, docType, category, s3Url, `${(file.size / 1024).toFixed(1)} KB`, [lender, category, 'claim-document', `Original: ${originalName}`]]
        );

        console.log(`[Claim Doc Upload] "${originalName}" → "${key}" for contact ${contact_id}, lender ${lender}, category ${category}`);
        res.json({ success: true, url: s3Url, document: rows[0] });
    } catch (error) {
        console.error('Claim Document Upload Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- AI ASSISTANT DOCUMENT UPLOAD BY NAME ---
// Accepts a PDF with filename format "Full Name - Lender Name.pdf"
// Matches contact by name, finds or creates claim for the lender, uploads to S3

app.post('/api/upload-document-by-name', upload.single('document'), async (req, res) => {
    const { contact_id, lender_name, original_name } = req.body;
    const file = req.file;

    if (!file || !contact_id || !lender_name) {
        return res.status(400).json({ success: false, message: 'Missing file, contact_id, or lender_name' });
    }

    try {
        // 1. Get contact info
        const contactRes = await pool.query('SELECT * FROM contacts WHERE id = $1', [contact_id]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }
        const contact = contactRes.rows[0];

        // 2. Find or create claim for this lender
        let claimRes = await pool.query(
            'SELECT * FROM cases WHERE contact_id = $1 AND LOWER(lender) = LOWER($2) LIMIT 1',
            [contact_id, lender_name]
        );

        let claim;
        let claimCreated = false;

        if (claimRes.rows.length === 0) {
            // Auto-create claim for this lender with default status
            const newClaim = await pool.query(
                `INSERT INTO cases (contact_id, lender, status, claim_value) VALUES ($1, $2, 'New Lead', 0) RETURNING *`,
                [contact_id, lender_name]
            );
            claim = newClaim.rows[0];
            claimCreated = true;
            await setReferenceSpecified(pool, contact_id, claim.id);
            console.log(`[Upload-by-Name] Auto-created claim for contact ${contact_id}, lender "${lender_name}"`);
        } else {
            claim = claimRes.rows[0];
        }

        // 3. Upload to S3 under contact folder
        const firstName = contact.first_name || '';
        const lastName = contact.last_name || '';
        const docName = original_name || file.originalname;
        const key = `${firstName}_${lastName}_${contact_id}/Documents/${docName}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

        // 4. Record in documents table with lender tag
        const docRes = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [contact_id, docName, 'pdf', 'Client', s3Url,
                `${(file.size / 1024).toFixed(1)} KB`,
                ['Uploaded', `Lender: ${lender_name}`, `Claim: ${claim.id}`]]
        );

        console.log(`[Upload-by-Name] "${docName}" uploaded for contact ${contact_id} (${contact.full_name || firstName + ' ' + lastName}), lender "${lender_name}"`);

        res.json({
            success: true,
            document: docRes.rows[0],
            claim: claim,
            claimCreated: claimCreated,
            contactName: contact.full_name || `${firstName} ${lastName}`,
            lender: lender_name
        });
    } catch (error) {
        console.error('Upload by name error:', error);
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
            ContentType: file.mimetype
        }));

        const url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }), { expiresIn: 604800 });

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
        const contactId = req.params.id;
        // Clean up duplicates first (keep newest record for each filename)
        await pool.query(
            `DELETE FROM documents WHERE id NOT IN (
                SELECT MAX(id) FROM documents WHERE contact_id = $1 GROUP BY name
            ) AND contact_id = $1`,
            [contactId]
        );
        const { rows } = await pool.query('SELECT * FROM documents WHERE contact_id = $1 ORDER BY created_at DESC', [contactId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DOCUMENT STATUS UPDATE ---
app.put('/api/documents/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, actor_id, actor_name, previous_status } = req.body;

    const validStatuses = [
        'Draft', 'For Approval', 'Sent', 'Viewed',
        'Completed', 'Expired', 'Waiting for Payment', 'Paid', 'Declined'
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    try {
        const { rows } = await pool.query(
            `UPDATE documents SET document_status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, document_status, contact_id, name`,
            [status, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        // Log the status change to action_logs
        const doc = rows[0];
        await pool.query(
            `INSERT INTO action_logs
             (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, 'agent', $2, $3, 'document_status_changed', 'documents', $4, $5, NOW())`,
            [
                doc.contact_id,
                actor_id || 'system',
                actor_name || 'System',
                `Document "${doc.name}" status changed from "${previous_status || 'unknown'}" to "${status}"`,
                JSON.stringify({ document_id: id, new_status: status, old_status: previous_status || null })
            ]
        );

        res.json({ success: true, document: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- DOCUMENT DELETE (delete from DB and S3) ---
app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Get document details
        const { rows } = await pool.query(
            'SELECT id, name, url, contact_id FROM documents WHERE id = $1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const doc = rows[0];

        // 2. Delete from S3
        if (doc.url) {
            try {
                const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                const bucketName = process.env.S3_BUCKET_NAME;

                // Extract Key from full URL
                let key = doc.url;
                if (doc.url.startsWith('http')) {
                    try {
                        const urlObj = new URL(doc.url);
                        key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
                        key = decodeURIComponent(key);
                        // Handle path-style URLs: strip bucket name if present
                        if (key.startsWith(bucketName + '/')) {
                            key = key.substring(bucketName.length + 1);
                        }
                    } catch (e) {
                        console.warn('URL parsing failed, using raw string');
                    }
                }

                console.log(`🗑️  Deleting document from S3: ${key}`);
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: key
                }));
                console.log(`✅ Deleted document from S3: ${key}`);
            } catch (s3Error) {
                console.error('⚠️  S3 deletion error:', s3Error.message);
                // Continue with database deletion even if S3 fails
            }
        }

        // 3. Delete from database
        await pool.query('DELETE FROM documents WHERE id = $1', [id]);

        // 4. Log the deletion
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
             VALUES ($1, 'agent', 'system', 'document_deleted', 'documents', $2, $3)`,
            [
                doc.contact_id,
                `Document "${doc.name}" deleted`,
                JSON.stringify({ document_id: id, name: doc.name })
            ]
        );

        console.log(`✅ Document ${id} deleted successfully`);
        res.json({ success: true, message: 'Document deleted successfully', deletedDocument: doc.name });
    } catch (err) {
        console.error('❌ Error deleting document:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- DOCUMENT SEND (mark as Sent + generate tracking token) ---
app.post('/api/documents/:id/send', async (req, res) => {
    const { id } = req.params;
    const { actor_id, actor_name, contact_id } = req.body;

    try {
        const { randomUUID } = await import('crypto');
        const token = randomUUID();

        const { rows } = await pool.query(
            `UPDATE documents
             SET document_status = 'Sent', tracking_token = $1, sent_at = NOW(), updated_at = NOW()
             WHERE id = $2
             RETURNING id, name, contact_id, tracking_token`,
            [token, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const doc = rows[0];
        const resolvedContactId = contact_id || doc.contact_id;

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs
             (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, 'agent', $2, $3, 'document_sent', 'documents', $4, $5, NOW())`,
            [
                resolvedContactId,
                actor_id || 'system',
                actor_name || 'System',
                `Document "${doc.name}" sent to client`,
                JSON.stringify({ document_id: id, tracking_token: token })
            ]
        );

        // Insert tracking event
        await pool.query(
            `INSERT INTO document_tracking_events (document_id, event_type, tracking_token)
             VALUES ($1, 'sent', $2)`,
            [id, token]
        );

        // Create chase workflow trigger (Day 3 first chase)
        const day3 = new Date(Date.now() + 3 * 86400000).toISOString();
        await pool.query(
            `INSERT INTO workflow_triggers
             (client_id, workflow_type, workflow_name, triggered_by, status, current_step, total_steps, next_action_at, next_action_description, metadata)
             VALUES ($1, 'document_chase', 'Document Chase', $2, 'active', 1, 5, $3, 'First chase - Day 3', $4)`,
            [
                resolvedContactId,
                actor_name || 'System',
                day3,
                JSON.stringify({ document_id: parseInt(id) })
            ]
        );

        const BASE_URL = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
        res.json({
            success: true,
            tracking_url: `${BASE_URL}/api/documents/track/${token}/view`,
            decline_url: `${BASE_URL}/api/documents/track/${token}/decline`,
            tracking_token: token
        });
    } catch (err) {
        console.error('[Document Send]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- DOCUMENT VIEW TRACKING (client-facing, embedded in emails) ---
app.get('/api/documents/track/:token/view', async (req, res) => {
    const { token } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, contact_id, name, url, document_status FROM documents WHERE tracking_token = $1`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).send('<html><body style="font-family:Arial;text-align:center;padding:60px"><h2>This document link is no longer valid.</h2></body></html>');
        }

        const doc = rows[0];

        // Only advance to Viewed if currently Sent (guard against regression)
        if (doc.document_status === 'Sent') {
            await pool.query(
                `UPDATE documents SET document_status = 'Viewed', updated_at = NOW() WHERE id = $1`,
                [doc.id]
            );

            await pool.query(
                `INSERT INTO action_logs
                 (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'client', $1, 'Client', 'document_viewed', 'documents', $2, $3, NOW())`,
                [
                    doc.contact_id,
                    `Client opened document "${doc.name}"`,
                    JSON.stringify({ document_id: doc.id })
                ]
            );
        }

        // Always record tracking event
        await pool.query(
            `INSERT INTO document_tracking_events (document_id, event_type, tracking_token, ip_address, user_agent)
             VALUES ($1, 'viewed', $2, $3, $4)`,
            [doc.id, token, req.ip, req.headers['user-agent'] || null]
        );

        // Redirect to document URL or show landing page
        if (doc.url) {
            return res.redirect(doc.url);
        }
        res.send('<html><body style="font-family:Arial;text-align:center;padding:60px"><h2>Document opened successfully.</h2><p>Thank you for viewing this document.</p></body></html>');
    } catch (err) {
        console.error('[Track View]', err);
        res.status(500).send('Error processing document link');
    }
});

// --- DOCUMENT DECLINE TRACKING (client-facing, embedded in emails) ---
app.get('/api/documents/track/:token/decline', async (req, res) => {
    const { token } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT id, contact_id, name, document_status FROM documents WHERE tracking_token = $1`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(404).send('<html><body style="font-family:Arial;text-align:center;padding:60px"><h2>This document link is no longer valid.</h2></body></html>');
        }

        const doc = rows[0];

        // Only decline if not already Completed
        if (doc.document_status !== 'Completed' && doc.document_status !== 'Declined') {
            await pool.query(
                `UPDATE documents SET document_status = 'Declined', updated_at = NOW() WHERE id = $1`,
                [doc.id]
            );

            await pool.query(
                `INSERT INTO action_logs
                 (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'client', $1, 'Client', 'document_declined', 'documents', $2, $3, NOW())`,
                [
                    doc.contact_id,
                    `Client declined document "${doc.name}"`,
                    JSON.stringify({ document_id: doc.id })
                ]
            );

            // Record tracking event
            await pool.query(
                `INSERT INTO document_tracking_events (document_id, event_type, tracking_token, ip_address, user_agent)
                 VALUES ($1, 'declined', $2, $3, $4)`,
                [doc.id, token, req.ip, req.headers['user-agent'] || null]
            );

            // Cancel any active document chase workflow
            await pool.query(
                `UPDATE workflow_triggers
                 SET status = 'cancelled', cancelled_at = NOW()
                 WHERE workflow_type = 'document_chase'
                   AND metadata->>'document_id' = $1
                   AND status = 'active'`,
                [doc.id.toString()]
            );

            // Create notification for staff
            await pool.query(
                `INSERT INTO persistent_notifications (type, title, message, link, is_read, created_at)
                 VALUES ('ticket_raised', $1, $2, $3, false, NOW())`,
                [
                    'Document Declined',
                    `Client declined document "${doc.name}". Review required.`,
                    `/documents`
                ]
            );
        }

        res.send(`
            <html><body style="font-family:Arial;text-align:center;padding:60px;color:#333">
            <div style="max-width:500px;margin:0 auto;border:1px solid #ddd;border-radius:12px;padding:40px">
                <h2 style="color:#be123c">Document Declined</h2>
                <p>You have declined this document. If this was a mistake, please contact Rowan Rose Solicitors.</p>
                <p style="color:#666;font-size:14px;margin-top:24px">Email: info@fastactionclaims.co.uk</p>
            </div>
            </body></html>
        `);
    } catch (err) {
        console.error('[Track Decline]', err);
        res.status(500).send('Error processing decline');
    }
});

// --- DOCUMENT ACTIVITY TIMELINE FEED ---
app.get('/api/actions/documents', async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    try {
        const { rows } = await pool.query(
            `SELECT al.*, c.full_name as contact_name
             FROM action_logs al
             LEFT JOIN contacts c ON al.client_id = c.id
             WHERE al.action_category = 'documents'
             ORDER BY al.timestamp DESC
             LIMIT $1`,
            [limit]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PER-DOCUMENT TIMELINE ---
app.get('/api/documents/:id/timeline', async (req, res) => {
    const { id } = req.params;
    try {
        const [logsRes, eventsRes] = await Promise.all([
            pool.query(
                `SELECT id, action_type, description, actor_name, actor_type, timestamp, metadata
                 FROM action_logs
                 WHERE metadata->>'document_id' = $1
                 ORDER BY timestamp DESC`,
                [id]
            ),
            pool.query(
                `SELECT id, event_type, ip_address, user_agent, occurred_at as timestamp
                 FROM document_tracking_events
                 WHERE document_id = $1
                 ORDER BY occurred_at DESC`,
                [parseInt(id)]
            )
        ]);
        res.json({ action_logs: logsRes.rows, tracking_events: eventsRes.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- S3 DOCUMENT SYNC ---
// Sync S3 documents folder to database for a specific contact
app.post('/api/contacts/:id/sync-documents', async (req, res) => {
    const contactId = req.params.id;

    try {
        // 1. Get contact info for folder path
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contactId]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        const { first_name, last_name } = contactRes.rows[0];
        const baseFolder = `${first_name}_${last_name}_${contactId}/`;
        // Scan Documents/, Lenders/ (new structure), and LOA/ (legacy) subfolders
        const foldersToScan = [
            { prefix: `${baseFolder}Documents/`, defaultCategory: 'Client' },
            { prefix: `${baseFolder}Lenders/`, defaultCategory: 'LOA' },
            { prefix: `${baseFolder}LOA/`, defaultCategory: 'LOA' }  // Legacy fallback
        ];

        console.log(`[Sync] Starting S3 sync for contact ${contactId}, base folder: ${baseFolder}`);

        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

        // 2. Clean up any duplicate documents for this contact (keep newest)
        await pool.query(
            `DELETE FROM documents WHERE id NOT IN (
                SELECT MAX(id) FROM documents WHERE contact_id = $1 GROUP BY name
            ) AND contact_id = $1`,
            [contactId]
        );

        // 2b. Clean up documents that have folder paths in name (e.g., "VANQUIS/file.pdf")
        // if the base filename already exists without the path
        const pathDocs = await pool.query(
            `SELECT id, name FROM documents WHERE contact_id = $1 AND name LIKE '%/%'`,
            [contactId]
        );
        for (const doc of pathDocs.rows) {
            const baseName = doc.name.split('/').pop();
            // Check if clean version exists
            const cleanExists = await pool.query(
                `SELECT id FROM documents WHERE contact_id = $1 AND name = $2 AND id != $3`,
                [contactId, baseName, doc.id]
            );
            if (cleanExists.rows.length > 0) {
                // Delete the one with folder path in name
                await pool.query(`DELETE FROM documents WHERE id = $1`, [doc.id]);
                console.log(`[Sync] Removed duplicate with path: ${doc.name}`);
            }
        }

        // 3. Get existing documents from DB - check both full paths and base filenames
        const existingDocs = await pool.query(
            'SELECT name FROM documents WHERE contact_id = $1',
            [contactId]
        );
        const existingNames = new Set(existingDocs.rows.map(d => d.name));
        // Also track base filenames (without folder paths) to prevent duplicates
        const existingBaseNames = new Set(existingDocs.rows.map(d => {
            const parts = d.name.split('/');
            return parts[parts.length - 1]; // Get just the filename
        }));

        let syncedCount = 0;
        let totalCount = 0;

        for (const folder of foldersToScan) {
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: folder.prefix
            });

            const listedObjects = await s3Client.send(listCommand);
            if (!listedObjects.Contents) continue;

            totalCount += listedObjects.Contents.length;

            for (const obj of listedObjects.Contents) {
                if (obj.Key.endsWith('/')) continue; // Skip folder markers

                // Get relative path from folder prefix (preserves nested folder structure)
                // e.g., "First_Last_123/Documents/subfolder/file.pdf" → "subfolder/file.pdf"
                const relativePath = obj.Key.substring(folder.prefix.length);
                if (!relativePath) continue;

                // Get just the base filename (without folder path) for cleaner display
                const pathParts = relativePath.split('/');
                const baseName = pathParts[pathParts.length - 1];

                // Skip if this base filename already exists (prevent duplicates)
                if (existingNames.has(baseName) || existingBaseNames.has(baseName)) continue;

                // Use base filename for DB (cleaner display), but extract lender from path
                const fileName = baseName;

                // Generate signed URL
                const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key
                }), { expiresIn: 604800 });

                // Determine file type from extension
                const ext = relativePath.split('.').pop()?.toLowerCase() || 'unknown';
                const typeMap = {
                    'pdf': 'pdf', 'doc': 'docx', 'docx': 'docx',
                    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image',
                    'xls': 'spreadsheet', 'xlsx': 'spreadsheet',
                    'txt': 'txt', 'html': 'html'
                };
                const fileType = typeMap[ext] || 'unknown';

                // Auto-detect category from filename
                let category = folder.defaultCategory;
                if (fileName.includes('Cover_Letter') || fileName.includes('COVER LETTER')) category = 'Cover Letter';
                else if (fileName.includes('_LOA') || fileName.includes(' - LOA.pdf') || fileName.includes(' - LOA ')) category = 'LOA';
                // Detect category from folder path (e.g., Lenders/VANQUIS/ID_Document/)
                if (relativePath.includes('/ID_Document/') || relativePath.includes('/ID Document/')) category = 'ID Document';

                // Extract lender name from folder path (e.g., "Lenders/VANQUIS/..." → "VANQUIS")
                const tags = ['Synced from S3'];
                if (folder.prefix.includes('/Lenders/') && pathParts.length > 1) {
                    // First part of relativePath is the lender name
                    const lenderName = pathParts[0].replace(/_/g, ' ');
                    if (lenderName && lenderName !== baseName) {
                        tags.push(lenderName);
                    }
                }

                // Also extract lender from filename patterns
                if (category === 'LOA' || category === 'Cover Letter') {
                    // New format: "123456 - Name - LENDER - LOA.pdf"
                    const lenderMatch = fileName.match(/ - ([A-Z0-9_ ]+) - (LOA|COVER LETTER)/i);
                    if (lenderMatch && lenderMatch[1]) {
                        const lenderFromFile = lenderMatch[1].trim();
                        if (!tags.includes(lenderFromFile)) tags.push(lenderFromFile);
                    }
                }

                const sizeKB = obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : 'Unknown';

                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, fileName, fileType, category, signedUrl, sizeKB, tags]
                );

                syncedCount++;
                existingNames.add(fileName);
                existingBaseNames.add(baseName);
                console.log(`[Sync] Added: ${fileName} (${category})`);
            }
        }

        res.json({
            success: true,
            message: `Synced ${syncedCount} new documents`,
            synced: syncedCount,
            total: totalCount
        });

    } catch (error) {
        console.error('[Sync] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cleanup documents with invalid S3 paths (like client.landing.page)
app.post('/api/documents/cleanup-invalid', async (req, res) => {
    try {
        // Find documents with invalid paths
        const { rows: invalidDocs } = await pool.query(
            `SELECT id, name, url FROM documents WHERE url LIKE '%client.landing.page%'`
        );

        if (invalidDocs.length === 0) {
            return res.json({ success: true, message: 'No invalid documents found', deleted: 0 });
        }

        // Delete them
        await pool.query(`DELETE FROM documents WHERE url LIKE '%client.landing.page%'`);

        console.log(`[Cleanup] Deleted ${invalidDocs.length} documents with invalid S3 paths`);
        res.json({
            success: true,
            message: `Deleted ${invalidDocs.length} documents with invalid storage paths`,
            deleted: invalidDocs.length,
            deletedDocs: invalidDocs.map(d => d.name)
        });
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- CONTACTS & CASES API ---

// Reference map for Google Apps Script (Drive → S3 migration)
// Returns { "reference_number": { id, first_name, last_name }, ... }
// Splits comma-separated references so each one maps individually
app.get('/api/contacts/reference-map', async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT id, first_name, last_name, reference FROM contacts WHERE reference IS NOT NULL AND reference != ''"
        );
        const map = {};
        for (const row of rows) {
            const refs = row.reference.split(',').map(r => r.trim()).filter(Boolean);
            for (const ref of refs) {
                map[ref] = { id: row.id, first_name: row.first_name, last_name: row.last_name };
            }
        }
        res.json(map);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.*,
            (
                SELECT json_agg(pa.*)
                FROM previous_addresses pa
                WHERE pa.contact_id = c.id
            ) as previous_addresses_list
            FROM contacts c
            ORDER BY c.updated_at DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// OPTIMIZED: Get initial data with paginated contacts (not all 92K at once)
app.get('/api/init-data', async (req, res) => {
    try {
        const limit = 50;
        // Run queries in parallel for maximum performance
        const [contactsResult, totalResult, casesResult] = await Promise.all([
            // First page of contacts only
            pool.query(`
                SELECT c.*,
                       COALESCE(
                           (SELECT json_agg(pa.*) FROM previous_addresses pa WHERE pa.contact_id = c.id),
                           '[]'::json
                       ) as previous_addresses_list
                FROM contacts c
                ORDER BY c.updated_at DESC
                LIMIT ${limit}
            `),
            pool.query(`SELECT COUNT(*) as total FROM contacts`),
            // All cases
            pool.query(`
                SELECT id, contact_id, lender, status, claim_value, product_type, created_at
                FROM cases
                ORDER BY created_at DESC
            `)
        ]);

        const total = parseInt(totalResult.rows[0].total);

        res.json({
            contacts: contactsResult.rows,
            contactsPagination: {
                page: 1,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: 1 < Math.ceil(total / limit)
            },
            cases: casesResult.rows,
            actionLogs: [], // Lazy load per contact
            documents: []  // Lazy load per contact
        });
    } catch (err) {
        console.error('Error fetching init data:', err);
        res.status(500).json({ error: err.message });
    }
});

// Server-side paginated contacts with multi-field search
app.get('/api/contacts/paginated', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // Support both single 'search' param and individual field params
        const search = req.query.search || '';
        const fullName = req.query.fullName || '';
        const email = req.query.email || '';
        const phone = req.query.phone || '';
        const postcode = req.query.postcode || '';
        const clientId = req.query.clientId || '';

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (search) {
            conditions.push(`(c.full_name ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx})`);
            params.push(`%${search}%`);
            paramIdx++;
        }
        if (fullName) {
            conditions.push(`c.full_name ILIKE $${paramIdx}`);
            params.push(`%${fullName}%`);
            paramIdx++;
        }
        if (email) {
            conditions.push(`c.email ILIKE $${paramIdx}`);
            params.push(`%${email}%`);
            paramIdx++;
        }
        if (phone) {
            conditions.push(`c.phone ILIKE $${paramIdx}`);
            params.push(`%${phone}%`);
            paramIdx++;
        }
        if (postcode) {
            conditions.push(`c.postal_code ILIKE $${paramIdx}`);
            params.push(`%${postcode}%`);
            paramIdx++;
        }
        if (clientId) {
            // Search in client_id, id, and reference (comma-separated references)
            conditions.push(`(c.client_id ILIKE $${paramIdx} OR CAST(c.id AS TEXT) ILIKE $${paramIdx} OR c.reference ILIKE $${paramIdx})`);
            params.push(`%${clientId}%`);
            paramIdx++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [contactsResult, totalResult] = await Promise.all([
            pool.query(`
                SELECT c.*,
                       COALESCE(
                           (SELECT json_agg(pa.*) FROM previous_addresses pa WHERE pa.contact_id = c.id),
                           '[]'::json
                       ) as previous_addresses_list
                FROM contacts c
                ${whereClause}
                ORDER BY c.updated_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `, params),
            pool.query(`SELECT COUNT(*) as total FROM contacts c ${whereClause}`, params)
        ]);

        const total = parseInt(totalResult.rows[0].total);

        res.json({
            contacts: contactsResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching paginated contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contacts', async (req, res) => {
    const { first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source, previous_addresses } = req.body;

    // Handle full_name: use provided full_name, or construct from first_name + last_name
    let finalFullName = full_name;
    let finalFirstName = first_name;
    let finalLastName = last_name;

    if (!finalFullName && (first_name || last_name)) {
        finalFullName = [first_name, last_name].filter(Boolean).join(' ');
    }

    // If only fullName was provided, try to split it into first/last name
    if (finalFullName && !finalFirstName && !finalLastName) {
        const nameParts = finalFullName.trim().split(' ');
        if (nameParts.length >= 2) {
            finalFirstName = nameParts[0];
            finalLastName = nameParts.slice(1).join(' ');
        } else {
            finalFirstName = finalFullName;
        }
    }

    console.log('[Server POST /api/contacts] Request body:', req.body);
    console.log('[Server POST /api/contacts] Parsed values:', { finalFirstName, finalLastName, finalFullName, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source, previous_addresses });

    if (!finalFullName && !finalFirstName) {
        return res.status(400).json({ error: 'Name is required (provide full_name or first_name)' });
    }

    try {
        // Ensure previous_addresses is properly formatted for JSONB column
        let prevAddrsJson = null;
        if (previous_addresses) {
            // If it's already a string, parse and re-stringify to validate
            // If it's an array/object, stringify it
            if (typeof previous_addresses === 'string') {
                try {
                    JSON.parse(previous_addresses); // validate
                    prevAddrsJson = previous_addresses;
                } catch {
                    prevAddrsJson = null;
                }
            } else {
                prevAddrsJson = JSON.stringify(previous_addresses);
            }
        }

        // Auto-generate sales_signature_token for new contacts
        const { randomUUID } = await import('crypto');
        const salesToken = randomUUID();

        const { rows } = await pool.query(
            `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source, previous_addresses, sales_signature_token)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [finalFirstName || null, finalLastName || null, finalFullName, email || null, phone || null, dob || null, address_line_1 || null, address_line_2 || null, city || null, state_county || null, postal_code || null, source || 'Manual Input', prevAddrsJson, salesToken]
        );
        console.log('[Server POST /api/contacts] Inserted row:', rows[0]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/contacts/:id', async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (first_name !== undefined) { updates.push(`first_name = $${paramCount++}`); values.push(first_name); }
        if (last_name !== undefined) { updates.push(`last_name = $${paramCount++}`); values.push(last_name); }
        if (first_name !== undefined || last_name !== undefined) {
            updates.push(`full_name = $${paramCount++}`);
            values.push(`${first_name || ''} ${last_name || ''}`.trim());
        }
        if (email !== undefined) { updates.push(`email = $${paramCount++}`); values.push(email); }
        if (phone !== undefined) { updates.push(`phone = $${paramCount++}`); values.push(phone); }
        if (dob !== undefined) { updates.push(`dob = $${paramCount++}`); values.push(dob); }
        if (address_line_1 !== undefined) { updates.push(`address_line_1 = $${paramCount++}`); values.push(address_line_1); }
        if (address_line_2 !== undefined) { updates.push(`address_line_2 = $${paramCount++}`); values.push(address_line_2); }
        if (city !== undefined) { updates.push(`city = $${paramCount++}`); values.push(city); }
        if (state_county !== undefined) { updates.push(`state_county = $${paramCount++}`); values.push(state_county); }
        if (postal_code !== undefined) { updates.push(`postal_code = $${paramCount++}`); values.push(postal_code); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating contact:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/contacts/:id/cases', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM cases WHERE contact_id = $1', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contacts/:id/cases', async (req, res) => {
    const { case_number, lender, status, claim_value, product_type, account_number, start_date } = req.body;
    const contactId = req.params.id;

    try {
        const standardizedLender = standardizeLender(lender);

        // Check for duplicate lender for this contact
        const existingCase = await pool.query(
            `SELECT id, status FROM cases WHERE contact_id = $1 AND LOWER(lender) = LOWER($2)`,
            [contactId, standardizedLender]
        );
        if (existingCase.rows.length > 0) {
            return res.status(400).json({
                error: `A claim for ${standardizedLender} already exists for this contact (Case #${existingCase.rows[0].id}, Status: ${existingCase.rows[0].status})`
            });
        }

        // Check if this is a Category 3 lender requiring confirmation
        if (isCategory3Lender(standardizedLender)) {
            console.log(`[CRM] Category 3 lender detected: ${lender}. Sending confirmation email to client.`);

            // Get contact info for email
            const contactRes = await pool.query(
                `SELECT first_name, last_name, email FROM contacts WHERE id = $1`,
                [contactId]
            );

            if (contactRes.rows.length === 0) {
                return res.status(404).json({ error: 'Contact not found' });
            }

            const contact = contactRes.rows[0];

            // Generate tokens for confirm/reject actions
            const confirmToken = generateConfirmationToken();
            const rejectToken = generateConfirmationToken();

            // Store pending confirmations (email will be sent by worker)
            await pool.query(
                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                 VALUES ($1, $2, 'confirm', $3, false)`,
                [contactId, standardizedLender, confirmToken]
            );
            await pool.query(
                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                 VALUES ($1, $2, 'reject', $3, true)`,  // reject token doesn't need separate email
                [contactId, standardizedLender, rejectToken]
            );

            // Log the action - email will be sent by worker
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, 'staff', 'crm', 'category3_pending', 'claims', $2, $3)`,
                [
                    contactId,
                    `${standardizedLender} confirmation queued. Email will be sent shortly.`,
                    JSON.stringify({ lender: standardizedLender })
                ]
            );

            return res.json({
                success: true,
                category3: true,
                message: `${standardizedLender} is a Category 3 lender. A confirmation email will be sent to ${contact.email}. The claim will be created when the client confirms.`,
                lender: standardizedLender
            });
        }

        // Normal case creation for non-Category 3 lenders
        // Set dsar_send_after to now (no delay for CRM-created claims; skip for GAMBLING)
        const dsarSendAfter = lender && lender.toUpperCase() !== 'GAMBLING' ? new Date() : null;
        const { rows } = await pool.query(
            `INSERT INTO cases (contact_id, case_number, lender, status, claim_value, product_type, account_number, start_date, loa_generated, dsar_send_after)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) RETURNING *`,
            [contactId, case_number, standardizedLender, status, claim_value, product_type, account_number, start_date, dsarSendAfter]
        );
        await setReferenceSpecified(pool, contactId, rows[0].id);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DSAR STATUS & RETRY ENDPOINTS ---
// Check DSAR status for a contact's cases
app.get('/api/contacts/:id/dsar-status', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, lender, loa_generated, dsar_sent, dsar_send_after, status, created_at
             FROM cases WHERE contact_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json({ cases: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reset DSAR for a specific case (allows re-sending)
app.post('/api/cases/:id/reset-dsar', async (req, res) => {
    try {
        await pool.query(
            `UPDATE cases SET dsar_sent = false, status = 'DSAR Prepared' WHERE id = $1`,
            [req.params.id]
        );
        res.json({ success: true, message: `DSAR reset for case ${req.params.id}. Worker will re-send within 60 seconds.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- BULK IMPORT: PDF PARSING ENDPOINT ---

app.post('/api/parse-pdf-contacts', upload.single('document'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        // Convert buffer to base64 for Claude
        const base64Content = file.buffer.toString('base64');
        const mediaType = file.mimetype || 'application/pdf';

        // Use Claude to extract contact information from PDF
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "document",
                            source: {
                                type: "base64",
                                media_type: mediaType,
                                data: base64Content
                            }
                        },
                        {
                            type: "text",
                            text: `Extract ALL contact information from this document. Look for:
                                - Names (first name, last name, full name)
                                - Email addresses
                                - Phone numbers
                                - Addresses (street address, city, postal code)
                                - Any lender/bank names mentioned
                                - Any monetary amounts that could be claim values

                                Return a JSON array where each object represents a contact with these fields:
                                {
                                    "fullName": "string",
                                "firstName": "string",
                                "lastName": "string",
                                "email": "string",
                                "phone": "string",
                                "addressLine1": "string",
                                "city": "string",
                                "postalCode": "string",
                                "lender": "string",
                                "claimValue": number or null
}

                                IMPORTANT:
                                - Return ONLY a valid JSON array, no markdown code blocks or explanation
                                - If a field is not found, use empty string "" for text fields or null for numbers
                                - Extract as many contacts as you can find
                                - If the document contains a table or list of contacts, extract each one
                                - Parse UK phone formats (07xxx, 01xxx, +44)
                                - Parse UK postcodes
                                - If only a full name is available, try to split into firstName and lastName`
                        }
                    ]
                }
            ]
        });

        // Extract the text response
        const responseText = response.content
            .filter(block => block.type === "text")
            .map(block => block.text)
            .join("");

        // Clean up and parse JSON
        let jsonStr = responseText.trim();

        // Remove markdown code blocks if present
        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        const contacts = JSON.parse(jsonStr.trim());

        if (!Array.isArray(contacts)) {
            throw new Error('Invalid response format - expected array');
        }

        res.json({
            success: true,
            contacts: contacts,
            count: contacts.length
        });

    } catch (error) {
        console.error('PDF Parse Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to parse PDF',
            contacts: []
        });
    }
});

// --- BULK IMPORT: CSV/Text Parsing with AI Enhancement ---

app.post('/api/parse-text-contacts', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ success: false, message: 'No text provided' });
    }

    try {
        // Use Claude to extract contact information from unstructured text
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            messages: [
                {
                    role: "user",
                    content: `Extract ALL contact information from this text data. The text may be from a CSV, spreadsheet, or unstructured document.

                                Text to parse:
                                ${text.substring(0, 50000)}

                                Return a JSON array where each object represents a contact with these fields:
                                {
                                    "fullName": "string",
                                "firstName": "string",
                                "lastName": "string",
                                "email": "string",
                                "phone": "string",
                                "addressLine1": "string",
                                "city": "string",
                                "postalCode": "string",
                                "lender": "string",
                                "claimValue": number or null
}

                                IMPORTANT:
                                - Return ONLY a valid JSON array, no markdown code blocks or explanation
                                - If a field is not found, use empty string "" for text fields or null for numbers
                                - Extract as many contacts as you can find
                                - Parse UK phone formats (07xxx, 01xxx, +44)
                                - Parse UK postcodes
                                - If only a full name is available, try to split into firstName and lastName`
                }
            ]
        });

        // Extract the text response
        const responseText = response.content
            .filter(block => block.type === "text")
            .map(block => block.text)
            .join("");

        // Clean up and parse JSON
        let jsonStr = responseText.trim();

        if (jsonStr.startsWith("```json")) {
            jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        const contacts = JSON.parse(jsonStr.trim());

        res.json({
            success: true,
            contacts: contacts,
            count: contacts.length
        });

    } catch (error) {
        console.error('Text Parse Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to parse text',
            contacts: []
        });
    }
});

// --- BULK IMPORT: Batch Contact Creation ---

app.post('/api/contacts/bulk', async (req, res) => {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ success: false, message: 'No contacts provided' });
    }

    const { randomUUID } = await import('crypto');

    const results = {
        created: 0,
        failed: 0,
        errors: []
    };

    // Prepare valid contacts and track invalid ones
    const validContacts = [];
    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const fullName = contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();

        if (!fullName) {
            results.failed++;
            results.errors.push({ row: i + 1, error: 'Name is required' });
            continue;
        }

        validContacts.push({
            index: i,
            firstName: contact.firstName || null,
            lastName: contact.lastName || null,
            fullName,
            email: contact.email || null,
            phone: contact.phone || null,
            dateOfBirth: contact.dateOfBirth || null,
            addressLine1: contact.addressLine1 || null,
            addressLine2: contact.addressLine2 || null,
            city: contact.city || null,
            stateCounty: contact.stateCounty || null,
            postalCode: contact.postalCode || null,
            salesToken: randomUUID(),
            previousAddresses: Array.isArray(contact.previousAddresses) ? contact.previousAddresses : []
        });
    }

    if (validContacts.length === 0) {
        return res.json({
            success: true,
            ...results,
            total: contacts.length
        });
    }

    // Batch insert using UNNEST for maximum performance
    const BATCH_SIZE = 500;

    for (let batchStart = 0; batchStart < validContacts.length; batchStart += BATCH_SIZE) {
        const batch = validContacts.slice(batchStart, batchStart + BATCH_SIZE);

        // Prepare arrays for UNNEST
        const firstNames = [];
        const lastNames = [];
        const fullNames = [];
        const emails = [];
        const phones = [];
        const dobs = [];
        const addressLine1s = [];
        const addressLine2s = [];
        const cities = [];
        const stateCounties = [];
        const postalCodes = [];
        const salesTokens = [];

        for (const c of batch) {
            firstNames.push(c.firstName);
            lastNames.push(c.lastName);
            fullNames.push(c.fullName);
            emails.push(c.email);
            phones.push(c.phone);
            dobs.push(c.dateOfBirth);
            addressLine1s.push(c.addressLine1);
            addressLine2s.push(c.addressLine2);
            cities.push(c.city);
            stateCounties.push(c.stateCounty);
            postalCodes.push(c.postalCode);
            salesTokens.push(c.salesToken);
        }

        try {
            const result = await pool.query(
                `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source, sales_signature_token)
                SELECT * FROM UNNEST(
                    $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                    $6::date[], $7::text[], $8::text[], $9::text[], $10::text[],
                    $11::text[], $12::text[], $13::uuid[]
                )
                RETURNING id`,
                [
                    firstNames, lastNames, fullNames, emails, phones,
                    dobs, addressLine1s, addressLine2s, cities, stateCounties,
                    postalCodes, Array(batch.length).fill('Bulk Import'), salesTokens
                ]
            );
            results.created += result.rowCount;

            // Insert previous addresses for created contacts
            if (result.rows && result.rows.length > 0) {
                for (let i = 0; i < result.rows.length; i++) {
                    const contactId = result.rows[i].id;
                    const prevAddresses = batch[i].previousAddresses;
                    if (prevAddresses && prevAddresses.length > 0) {
                        for (const addr of prevAddresses) {
                            try {
                                await pool.query(
                                    `INSERT INTO previous_addresses (contact_id, address_line_1, address_line_2, city, county, postal_code)
                                    VALUES ($1, $2, $3, $4, $5, $6)`,
                                    [contactId, addr.line1 || '', addr.line2 || '', addr.city || '', addr.county || '', addr.postalCode || '']
                                );
                            } catch (addrErr) {
                                console.error(`Failed to insert previous address for contact ${contactId}:`, addrErr.message);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // If batch fails, fall back to individual inserts for this batch
            for (const c of batch) {
                try {
                    const insertResult = await pool.query(
                        `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source, sales_signature_token)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        RETURNING id`,
                        [c.firstName, c.lastName, c.fullName, c.email, c.phone, c.dateOfBirth, c.addressLine1, c.addressLine2, c.city, c.stateCounty, c.postalCode, 'Bulk Import', c.salesToken]
                    );
                    results.created++;

                    // Insert previous addresses for this contact
                    if (insertResult.rows[0] && c.previousAddresses && c.previousAddresses.length > 0) {
                        const contactId = insertResult.rows[0].id;
                        for (const addr of c.previousAddresses) {
                            try {
                                await pool.query(
                                    `INSERT INTO previous_addresses (contact_id, address_line_1, address_line_2, city, county, postal_code)
                                    VALUES ($1, $2, $3, $4, $5, $6)`,
                                    [contactId, addr.line1 || '', addr.line2 || '', addr.city || '', addr.county || '', addr.postalCode || '']
                                );
                            } catch (addrErr) {
                                console.error(`Failed to insert previous address for contact ${contactId}:`, addrErr.message);
                            }
                        }
                    }
                } catch (err) {
                    results.failed++;
                    results.errors.push({ row: c.index + 1, error: err.message });
                }
            }
        }
    }

    res.json({
        success: true,
        ...results,
        total: contacts.length
    });
});

// Bulk Claims/Cases Import API - Optimized for large datasets
app.post('/api/cases/bulk', async (req, res) => {
    const { claims } = req.body;

    if (!claims || !Array.isArray(claims) || claims.length === 0) {
        return res.status(400).json({ success: false, message: 'No claims provided' });
    }

    const results = {
        created: 0,
        failed: 0,
        errors: []
    };

    // Prepare valid claims
    const validClaims = [];
    for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];

        if (!claim.contactId || !claim.lender) {
            results.failed++;
            results.errors.push({ row: i + 1, error: 'contactId and lender are required' });
            continue;
        }

        validClaims.push({
            index: i,
            contactId: claim.contactId,
            lender: claim.lender,
            status: claim.status || 'New Lead',
            claimValue: claim.claimValue || null,
            productType: claim.productType || null,
            accountNumber: claim.accountNumber || null
        });
    }

    if (validClaims.length === 0) {
        return res.json({
            success: true,
            ...results,
            total: claims.length
        });
    }

    // Batch insert using UNNEST for performance
    const BATCH_SIZE = 500;

    for (let batchStart = 0; batchStart < validClaims.length; batchStart += BATCH_SIZE) {
        const batch = validClaims.slice(batchStart, batchStart + BATCH_SIZE);

        const contactIds = [];
        const lenders = [];
        const statuses = [];
        const claimValues = [];
        const productTypes = [];
        const accountNumbers = [];

        for (const c of batch) {
            contactIds.push(c.contactId);
            lenders.push(c.lender);
            statuses.push(c.status);
            claimValues.push(c.claimValue);
            productTypes.push(c.productType);
            accountNumbers.push(c.accountNumber);
        }

        try {
            const result = await pool.query(
                `INSERT INTO cases (contact_id, lender, status, claim_value, product_type, account_number, loa_generated)
                SELECT * FROM UNNEST(
                    $1::integer[], $2::text[], $3::text[], $4::numeric[],
                    $5::text[], $6::text[], $7::boolean[]
                ) RETURNING id, contact_id`,
                [
                    contactIds, lenders, statuses, claimValues,
                    productTypes, accountNumbers, Array(batch.length).fill(false)
                ]
            );
            results.created += result.rowCount;
            // Set reference_specified for each created case
            for (const row of result.rows) {
                await setReferenceSpecified(pool, row.contact_id, row.id);
            }
        } catch (error) {
            // Fall back to individual inserts if batch fails
            for (const c of batch) {
                try {
                    const insertRes = await pool.query(
                        `INSERT INTO cases (contact_id, lender, status, claim_value, product_type, account_number, loa_generated)
                        VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
                        [c.contactId, c.lender, c.status, c.claimValue, c.productType, c.accountNumber]
                    );
                    await setReferenceSpecified(pool, c.contactId, insertRes.rows[0].id);
                    results.created++;
                } catch (err) {
                    results.failed++;
                    results.errors.push({ row: c.index + 1, error: err.message });
                }
            }
        }
    }

    res.json({
        success: true,
        ...results,
        total: claims.length
    });
});

// --- OPENAI CHAT ENDPOINT ---
// Optimized for token efficiency and fast responses

app.post('/api/ai/chat', async (req, res) => {
    const { sessionId, message, context, toolResults, compactMode = true } = req.body;

    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    try {
        // Get or create session with message history limit for token optimization
        if (!chatSessions.has(sessionId)) {
            chatSessions.set(sessionId, {
                messages: [],
                context: null,
                messageCount: 0
            });
        }
        const session = chatSessions.get(sessionId);

        // Update context if provided
        if (context) {
            session.context = context;
        }

        // Build optimized system prompt based on context
        const systemPrompt = buildSystemPrompt({
            context: session.context ? { type: 'viewing', name: session.context } : null,
            compact: compactMode
        });

        // If tool results are provided, add them as tool response messages
        if (toolResults && toolResults.length > 0) {
            for (const tr of toolResults) {
                session.messages.push({
                    role: "tool",
                    tool_call_id: tr.toolUseId,
                    content: tr.result
                });
            }
        } else if (message) {
            // Add user message (context is now in system prompt)
            session.messages.push({
                role: "user",
                content: message
            });
            session.messageCount++;
        }

        // Token optimization: Keep only last 20 messages to prevent context overflow
        const MAX_HISTORY = 20;
        if (session.messages.length > MAX_HISTORY) {
            // Keep system context but trim old messages
            session.messages = session.messages.slice(-MAX_HISTORY);
        }

        // Call OpenAI API with optimized settings
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fast and cost-effective, use "gpt-4o" for complex tasks
            max_tokens: 2048,
            temperature: 0.7,
            messages: [
                { role: "system", content: systemPrompt },
                ...session.messages
            ],
            tools: TOOLS,
            tool_choice: "auto",
            // Parallel tool calls for efficiency
            parallel_tool_calls: true
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;

        // Extract text content
        const responseText = assistantMessage.content || '';

        // Extract tool calls if any
        const toolCalls = assistantMessage.tool_calls || [];

        // Store assistant response in session
        session.messages.push({
            role: "assistant",
            content: assistantMessage.content,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
        });

        // Format response for frontend
        res.json({
            success: true,
            text: responseText,
            toolCalls: toolCalls.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments || '{}')
            })),
            usage: {
                promptTokens: response.usage?.prompt_tokens,
                completionTokens: response.usage?.completion_tokens,
                totalTokens: response.usage?.total_tokens
            }
        });

    } catch (error) {
        console.error('OpenAI API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Clear chat session
app.post('/api/ai/clear-session', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && chatSessions.has(sessionId)) {
        chatSessions.delete(sessionId);
    }
    res.json({ success: true });
});

// Get session info (for debugging/analytics)
app.get('/api/ai/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (chatSessions.has(sessionId)) {
        const session = chatSessions.get(sessionId);
        res.json({
            success: true,
            messageCount: session.messageCount,
            historyLength: session.messages.length,
            hasContext: !!session.context
        });
    } else {
        res.json({ success: false, error: 'Session not found' });
    }
});

// ============================================
// Rowan Rose Solicitors CRM Specification APIs
// ============================================

// --- COMMUNICATIONS API ---

// Get all communications for a client
app.get('/api/clients/:id/communications', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM communications WHERE client_id = $1 ORDER BY timestamp DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new communication record
app.post('/api/communications', async (req, res) => {
    const {
        client_id, channel, direction, subject, content,
        call_duration_seconds, call_notes, agent_id, agent_name
    } = req.body;

    if (!client_id || !channel || !direction) {
        return res.status(400).json({ error: 'client_id, channel, and direction are required' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO communications
                                (client_id, channel, direction, subject, content, call_duration_seconds, call_notes, agent_id, agent_name)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [client_id, channel, direction, subject || null, content || null,
                call_duration_seconds || null, call_notes || null, agent_id || null, agent_name || null]
        );

        // Also log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [client_id, 'agent', agent_id || 'system', agent_name || 'System',
                `${direction}_${channel}`, 'communication',
                `${direction === 'outbound' ? 'Sent' : 'Received'} ${channel} message`]
        );

        res.json({ success: true, communication: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- WORKFLOW TRIGGERS API ---

// Get all workflow triggers for a client
app.get('/api/clients/:id/workflows', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM workflow_triggers WHERE client_id = $1 ORDER BY triggered_at DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Trigger a new workflow
app.post('/api/workflows/trigger', async (req, res) => {
    const { client_id, workflow_type, workflow_name, triggered_by, total_steps } = req.body;

    if (!client_id || !workflow_type) {
        return res.status(400).json({ error: 'client_id and workflow_type are required' });
    }

    try {
        // Calculate next action time (e.g., 2 days from now for first step)
        const nextActionAt = new Date();
        nextActionAt.setDate(nextActionAt.getDate() + 2);

        const { rows } = await pool.query(
            `INSERT INTO workflow_triggers
                                (client_id, workflow_type, workflow_name, triggered_by, total_steps, next_action_at, next_action_description)
                                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [client_id, workflow_type, workflow_name || workflow_type, triggered_by || 'system',
                total_steps || 4, nextActionAt, 'Send follow-up SMS']
        );

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6)`,
            [client_id, 'agent', triggered_by || 'system', 'workflow_triggered', 'workflows',
                `Triggered workflow: ${workflow_name || workflow_type}`]
        );

        res.json({ success: true, workflow: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel a workflow
app.put('/api/workflows/:id/cancel', async (req, res) => {
    const { id } = req.params;
    const { cancelled_by } = req.body;

    try {
        const { rows } = await pool.query(
            `UPDATE workflow_triggers
                                SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1
                                WHERE id = $2 RETURNING *`,
            [cancelled_by || 'system', id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6)`,
            [rows[0].client_id, 'agent', cancelled_by || 'system', 'workflow_cancelled', 'workflows',
            `Cancelled workflow: ${rows[0].workflow_name}`]
        );

        res.json({ success: true, workflow: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- NOTES API ---

// Get all notes for a client
app.get('/api/clients/:id/notes', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM notes WHERE client_id = $1 ORDER BY pinned DESC, created_at DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new note
app.post('/api/clients/:id/notes', async (req, res) => {
    const { id } = req.params;
    const { content, pinned, created_by, created_by_name } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO notes (client_id, content, pinned, created_by, created_by_name)
                                VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, content, pinned || false, created_by || 'system', created_by_name || 'System']
        );

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, 'agent', created_by || 'system', created_by_name || 'System', 'note_added', 'notes',
                `Added note: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`]
        );

        res.json({ success: true, note: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a note
app.put('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    const { content, pinned, updated_by } = req.body;

    try {
        const { rows } = await pool.query(
            `UPDATE notes SET content = COALESCE($1, content), pinned = COALESCE($2, pinned),
                                updated_by = $3, updated_at = NOW()
                                WHERE id = $4 RETURNING *`,
            [content, pinned, updated_by || 'system', id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({ success: true, note: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a note
app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { rows } = await pool.query(
            `DELETE FROM notes WHERE id = $1 RETURNING client_id`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Note not found' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ACTION LOGS API ---

// Get all action logs (for contacts list view - shows latest per client)
app.get('/api/actions/all', async (req, res) => {
    try {
        // Get the most recent action for each client
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (client_id) *
            FROM action_logs
            ORDER BY client_id, timestamp DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get action logs for a client
app.get('/api/clients/:id/actions', async (req, res) => {
    const { category, limit } = req.query;

    try {
        let query = `SELECT * FROM action_logs WHERE client_id = $1`;
        const params = [req.params.id];

        if (category && category !== 'all') {
            query += ` AND action_category = $2`;
            params.push(category);
        }

        query += ` ORDER BY timestamp DESC`;

        if (limit) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(parseInt(limit));
        }

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get action logs for a specific claim
app.get('/api/claims/:id/actions', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM action_logs WHERE claim_id = $1 ORDER BY timestamp DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXTENDED CONTACT FIELDS API ---

// Update contact with bank details and previous address
app.patch('/api/contacts/:id/extended', async (req, res) => {
    const { id } = req.params;
    const {
        bank_name, account_name, sort_code, bank_account_number,
        address_line_1, address_line_2, city, state_county, postal_code,
        previous_address_line_1, previous_address_line_2, previous_city,
        previous_county, previous_postal_code, previous_addresses,
        document_checklist, checklist_change, actor_id, actor_name,
        extra_lenders
    } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (bank_name !== undefined) { updates.push(`bank_name = $${paramCount++}`); values.push(bank_name); }
        if (account_name !== undefined) { updates.push(`account_name = $${paramCount++}`); values.push(account_name); }
        if (sort_code !== undefined) { updates.push(`sort_code = $${paramCount++}`); values.push(sort_code); }
        if (bank_account_number !== undefined) { updates.push(`bank_account_number = $${paramCount++}`); values.push(bank_account_number); }
        // Current address fields
        if (address_line_1 !== undefined) { updates.push(`address_line_1 = $${paramCount++}`); values.push(address_line_1); }
        if (address_line_2 !== undefined) { updates.push(`address_line_2 = $${paramCount++}`); values.push(address_line_2); }
        if (city !== undefined) { updates.push(`city = $${paramCount++}`); values.push(city); }
        if (state_county !== undefined) { updates.push(`state_county = $${paramCount++}`); values.push(state_county); }
        if (postal_code !== undefined) { updates.push(`postal_code = $${paramCount++}`); values.push(postal_code); }
        // Previous address fields
        if (previous_address_line_1 !== undefined) { updates.push(`previous_address_line_1 = $${paramCount++}`); values.push(previous_address_line_1); }
        if (previous_address_line_2 !== undefined) { updates.push(`previous_address_line_2 = $${paramCount++}`); values.push(previous_address_line_2); }
        if (previous_city !== undefined) { updates.push(`previous_city = $${paramCount++}`); values.push(previous_city); }
        if (previous_county !== undefined) { updates.push(`previous_county = $${paramCount++}`); values.push(previous_county); }
        if (previous_postal_code !== undefined) { updates.push(`previous_postal_code = $${paramCount++}`); values.push(previous_postal_code); }
        if (previous_addresses !== undefined) {
            updates.push(`previous_addresses = $${paramCount++}`);
            // Handle both string and object/array for JSONB
            const prevAddrsValue = typeof previous_addresses === 'string' ? previous_addresses : JSON.stringify(previous_addresses);
            values.push(prevAddrsValue);
        }
        if (document_checklist !== undefined) {
            updates.push(`document_checklist = $${paramCount++}`);
            // Handle both string and object for JSONB
            const docChecklistValue = typeof document_checklist === 'string' ? document_checklist : JSON.stringify(document_checklist);
            values.push(docChecklistValue);
        }
        if (extra_lenders !== undefined) {
            updates.push(`extra_lenders = $${paramCount++}`);
            values.push(extra_lenders);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const query = `UPDATE contacts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Sync previous addresses to the previous_addresses table
        if (previous_addresses && Array.isArray(previous_addresses) && previous_addresses.length > 0) {
            // Delete existing previous addresses for this contact
            await pool.query('DELETE FROM previous_addresses WHERE contact_id = $1', [id]);
            // Insert new previous addresses
            for (const addr of previous_addresses) {
                await pool.query(
                    `INSERT INTO previous_addresses (contact_id, address_line_1, address_line_2, city, county, postal_code)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [id, addr.line1 || addr.address_line_1 || '', addr.line2 || addr.address_line_2 || '', addr.city || '', addr.county || '', addr.postalCode || addr.postal_code || '']
                );
            }
        }

        // Log to action_logs - with specific description for document checklist changes
        console.log('[Extended Update] checklist_change received:', JSON.stringify(checklist_change));
        console.log('[Extended Update] document_checklist received:', JSON.stringify(document_checklist));

        if (checklist_change && checklist_change.field) {
            // Document checklist specific logging
            const fieldLabels = {
                identification: 'Identification',
                extraLender: 'Extra Lender',
                questionnaire: 'Questionnaire',
                poa: 'POA'
            };
            const fieldLabel = fieldLabels[checklist_change.field] || checklist_change.field;
            const action = checklist_change.value ? 'checked' : 'unchecked';
            const description = `Document checklist: ${fieldLabel} ${action}`;
            console.log('[Extended Update] Creating checklist log:', description);

            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [id, 'agent', actor_id || 'system', actor_name || 'System', 'checklist_updated', 'documents', description, JSON.stringify(checklist_change)]
            );
        } else {
            // Generic update log
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, 'agent', actor_id || 'system', actor_name || 'System', 'details_updated', 'account', 'Updated contact extended details']
            );
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXTENDED CLAIM FIELDS API ---

// Update case/claim with extended specification fields
app.patch('/api/cases/:id/extended', async (req, res) => {
    const { id } = req.params;
    const {
        lender_other, finance_type, finance_type_other, finance_types, number_of_loans, loan_details,
        lender_reference, dates_timeline, apr, outstanding_balance,
        dsar_review, complaint_paragraph, offer_made, late_payment_charges,
        billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
        total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
        our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
        our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan
    } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        // List of numeric (DECIMAL) fields that cannot accept empty strings
        const numericFields = [
            'apr', 'outstanding_balance', 'offer_made', 'late_payment_charges',
            'billed_interest_charges', 'billed_finance_charges', 'overlimit_charges', 'credit_limit_increases',
            'total_refund', 'total_debt', 'client_fee', 'balance_due_to_client', 'our_fees_plus_vat',
            'our_fees_minus_vat', 'vat_amount', 'total_fee', 'outstanding_debt',
            'our_total_fee', 'fee_without_vat', 'vat', 'our_fee_net', 'number_of_loans'
        ];

        const fields = {
            lender_other, finance_type, finance_type_other, finance_types, number_of_loans, loan_details,
            lender_reference, dates_timeline, apr, outstanding_balance,
            dsar_review, complaint_paragraph, offer_made, late_payment_charges,
            billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
            total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
            our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
            our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan
        };

        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                updates.push(`${key} = $${paramCount++}`);
                // Convert empty strings to null for numeric fields
                if (numericFields.includes(key) && value === '') {
                    values.push(null);
                } else {
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const query = `UPDATE cases SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [rows[0].contact_id, id, 'agent', 'system', 'claim_updated', 'claims', 'Updated claim extended details']
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single contact with all extended fields
app.get('/api/contacts/:id/full', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM contacts WHERE id = $1`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all cases (for Pipeline view)
app.get('/api/cases', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, contact_id, lender, status, claim_value, product_type, account_number, start_date
             FROM cases
             ORDER BY created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single case with all extended fields
app.get('/api/cases/:id/full', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM cases WHERE id = $1`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// CASCADE DELETE ENDPOINTS
// ============================================

// Delete Contact with Full S3 Cleanup
app.delete('/api/contacts/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get contact details for S3 cleanup
        const contactRes = await client.query(
            'SELECT first_name, last_name, id FROM contacts WHERE id = $1',
            [id]
        );

        if (contactRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Contact not found' });
        }

        const contact = contactRes.rows[0];
        const folderPath = `${contact.first_name}_${contact.last_name}_${contact.id}/`;

        console.log(`🗑️  Deleting contact ${id} and S3 folder: ${folderPath}`);

        // 2. Delete from S3 - delete entire folder
        try {
            const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');

            // List all objects in the folder
            const listParams = {
                Bucket: BUCKET_NAME,
                Prefix: folderPath
            };

            const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

            if (listedObjects.Contents && listedObjects.Contents.length > 0) {
                const deleteParams = {
                    Bucket: BUCKET_NAME,
                    Delete: {
                        Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
                    }
                };

                await s3Client.send(new DeleteObjectsCommand(deleteParams));
                console.log(`✅ Deleted ${listedObjects.Contents.length} files from S3 for contact ${id}`);
            } else {
                console.log(`ℹ️  No S3 files found for contact ${id}`);
            }
        } catch (s3Error) {
            console.error('⚠️  S3 deletion error:', s3Error);
            // Continue with database deletion even if S3 fails
        }

        // 3. Delete from database (CASCADE will handle related tables)
        // This will automatically delete:
        // - cases (claims)
        // - documents
        // - communications
        // - workflow_triggers
        // - notes
        // - action_logs
        // - submission_tokens
        await client.query('DELETE FROM contacts WHERE id = $1', [id]);

        await client.query('COMMIT');

        console.log(`✅ Contact ${id} and all associated data deleted successfully`);

        res.json({
            success: true,
            message: 'Contact and all associated data deleted successfully',
            deletedFolderPath: folderPath
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting contact:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Update Case Status (basic PATCH for status changes)
// When status = "Sale", auto-generate sales_signature_token and trigger Zapier webhook
app.patch('/api/cases/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        let salesSignatureToken = null;

        // If status is "Sale", generate a unique token for this claim
        if (status === 'Sale') {
            const { randomUUID } = await import('crypto');
            salesSignatureToken = randomUUID();
        }

        // Update case with status (and token if Sale)
        // If status is "DSAR Sent to Lender", also set dsar_sent_at and reset notification flag
        const isDSARSent = status === 'DSAR Sent to Lender';
        const result = await pool.query(
            `UPDATE cases
             SET status = $1,
                 sales_signature_token = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE sales_signature_token END,
                 dsar_sent_at = CASE WHEN $4::boolean THEN NOW() ELSE dsar_sent_at END,
                 dsar_overdue_notified = CASE WHEN $4::boolean THEN false ELSE dsar_overdue_notified END
             WHERE id = $3
             RETURNING *`,
            [status, salesSignatureToken, id, isDSARSent]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }

        const updatedCase = result.rows[0];

        // If status = "Sale", fetch contact details and trigger Zapier webhook
        if (status === 'Sale' && salesSignatureToken) {
            try {
                // Get contact details for the email
                const contactRes = await pool.query(
                    `SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = $1`,
                    [updatedCase.contact_id]
                );

                if (contactRes.rows.length > 0) {
                    const contact = contactRes.rows[0];
                    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
                    const salesLink = `${baseUrl}/intake/sales/${salesSignatureToken}`;

                    // Trigger Zapier webhook (if configured)
                    const zapierWebhookUrl = process.env.ZAPIER_SALES_WEBHOOK_URL;
                    if (zapierWebhookUrl) {
                        fetch(zapierWebhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                event: 'claim_status_sale',
                                caseId: updatedCase.id,
                                lender: updatedCase.lender,
                                contactId: contact.id,
                                firstName: contact.first_name,
                                lastName: contact.last_name,
                                email: contact.email,
                                phone: contact.phone,
                                salesSignatureLink: salesLink,
                                timestamp: new Date().toISOString()
                            })
                        }).catch(err => console.error('Zapier webhook error:', err));

                        console.log(`📧 Triggered Zapier webhook for case ${id} with sales link: ${salesLink}`);
                    } else {
                        console.log(`⚠️ No ZAPIER_SALES_WEBHOOK_URL configured. Sales link generated: ${salesLink}`);
                    }
                }
            } catch (webhookErr) {
                console.error('Error triggering sale webhook:', webhookErr);
                // Don't fail the status update even if webhook fails
            }
        }

        // If status = "LOA Uploaded", generate cover letter from template asynchronously
        if (status === 'LOA Uploaded') {
            generateCoverLetterFromTemplate(parseInt(id), pool, s3Client)
                .then(result => {
                    console.log(`📄 Cover letter generated for case ${id}: ${result.fileName}`);
                })
                .catch(err => {
                    console.error(`❌ Cover letter generation failed for case ${id}:`, err.message);
                });
        }

        console.log(`✅ Updated case ${id} status to: ${status}`);
        res.json(updatedCase);
    } catch (error) {
        console.error('❌ Error updating case status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk Update Case Status (optimized for multiple claims)
app.patch('/api/cases/bulk/status', async (req, res) => {
    const { claimIds, status } = req.body;

    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ error: 'claimIds array is required' });
    }

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Use a single query with ANY to update all claims at once
        // If status is "DSAR Sent to Lender", also set dsar_sent_at and reset notification flag
        let result;
        if (status === 'DSAR Sent to Lender') {
            result = await pool.query(
                `UPDATE cases SET status = $1, dsar_sent_at = NOW(), dsar_overdue_notified = false WHERE id = ANY($2::int[]) RETURNING *`,
                [status, claimIds]
            );
        } else {
            result = await pool.query(
                `UPDATE cases SET status = $1 WHERE id = ANY($2::int[]) RETURNING *`,
                [status, claimIds]
            );
        }

        // If status = "LOA Uploaded", generate cover letters for each case asynchronously
        if (status === 'LOA Uploaded') {
            for (const updatedCase of result.rows) {
                generateCoverLetterFromTemplate(updatedCase.id, pool, s3Client)
                    .then(res => console.log(`📄 Cover letter generated for case ${updatedCase.id}: ${res.fileName}`))
                    .catch(err => console.error(`❌ Cover letter generation failed for case ${updatedCase.id}:`, err.message));
            }
        }

        console.log(`✅ Bulk updated ${result.rows.length} cases to status: ${status}`);
        res.json({
            success: true,
            updatedCount: result.rows.length,
            updatedClaims: result.rows
        });
    } catch (error) {
        console.error('❌ Error bulk updating case status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Individual Claim with S3 Cleanup
app.delete('/api/cases/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get claim details
        const claimRes = await client.query(
            `SELECT c.id, c.lender, c.contact_id, con.first_name, con.last_name
                                FROM cases c
                                JOIN contacts con ON c.contact_id = con.id
                                WHERE c.id = $1`,
            [id]
        );

        if (claimRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Claim not found' });
        }

        const claim = claimRes.rows[0];
        const folderPath = `${claim.first_name}_${claim.last_name}_${claim.contact_id}/`;
        const refSpec = `${claim.contact_id}${id}`;
        const sanitizedLender = claim.lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // New structure paths (Lenders/{lenderName}/)
        const newLoaPath = `${folderPath}Lenders/${sanitizedLender}/${refSpec} - ${claim.first_name} ${claim.last_name} - ${sanitizedLender} - LOA.pdf`;
        const newCoverPath = `${folderPath}Lenders/${sanitizedLender}/${refSpec} - ${claim.first_name} ${claim.last_name} - ${sanitizedLender} - COVER LETTER.pdf`;
        // Old LOA/ folder paths (for backwards compatibility)
        const oldLoaPath = `${folderPath}LOA/${refSpec} - ${claim.first_name} ${claim.last_name} - ${sanitizedLender} - LOA.pdf`;
        const oldCoverPath = `${folderPath}LOA/${refSpec} - ${claim.first_name} ${claim.last_name} - ${sanitizedLender} - COVER LETTER.pdf`;
        // Legacy naming format paths
        const legacyLoaPath = `${folderPath}LOA/${sanitizedLender}_LOA.pdf`;
        const legacyCoverPath = `${folderPath}LOA/${sanitizedLender}_Cover_Letter.pdf`;

        console.log(`🗑️  Deleting claim ${id} for lender: ${claim.lender}`);

        // 2. Delete claim-specific LOA and Cover Letter from S3 (all formats)
        try {
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

            // Try deleting all format files (new Lenders/ structure, old LOA/ folder, legacy naming)
            for (const path of [newLoaPath, newCoverPath, oldLoaPath, oldCoverPath, legacyLoaPath, legacyCoverPath]) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: path
                    }));
                    console.log(`✅ Deleted file from S3: ${path}`);
                } catch (e) {
                    // Ignore - file may not exist
                }
            }
        } catch (s3Error) {
            console.error('⚠️  S3 deletion error:', s3Error.message);
            // Continue with database deletion even if S3 fails
        }

        // 3. Delete claim-specific documents from documents table (both formats)
        await client.query(
            "DELETE FROM documents WHERE contact_id = $1 AND (name LIKE $2 OR name LIKE $3)",
            [claim.contact_id, `%${claim.lender}%`, `${refSpec}%`]
        );

        // 4. Delete the claim from cases table
        await client.query('DELETE FROM cases WHERE id = $1', [id]);

        // 5. Log the deletion
        await client.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [claim.contact_id, id, 'agent', 'system', 'claim_deleted', 'claims', `Deleted claim for lender: ${claim.lender}`]
        );

        await client.query('COMMIT');

        console.log(`✅ Claim ${id} deleted successfully`);

        res.json({
            success: true,
            message: 'Claim deleted successfully',
            deletedLender: claim.lender
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error deleting claim:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// LENDER SELECTION FORM ENDPOINTS
// ============================================

// Generate unique LOA (Letter of Authority) form link for a contact
app.post('/api/contacts/:id/generate-loa-link', async (req, res) => {
    const { id } = req.params;
    const { userId, userName } = req.body; // User who generated the link

    try {
        // Check if contact exists
        const contactCheck = await pool.query('SELECT id, first_name, last_name FROM contacts WHERE id = $1', [id]);
        if (contactCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        const contact = contactCheck.rows[0];

        // Generate unique ID (UUID)
        const { randomUUID } = await import('crypto');
        const uniqueId = randomUUID();

        // Use FRONTEND_URL - auto-detect local vs production
        const isProduction = process.env.PM2_HOME || process.env.NODE_ENV === 'production';
        const frontendUrl = isProduction ? 'http://rowanroseclaims.co.uk' : 'http://localhost:3000';
        const uniqueLink = `${frontendUrl}/loa-form/${uniqueId}`;

        // Update contact with unique link
        await pool.query('UPDATE contacts SET unique_form_link = $1 WHERE id = $2', [uniqueId, id]);

        // Create action log entry
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                id,
                'user',
                userId || 'system',
                userName || 'System',
                'loa_link_generated',
                'system',
                `LOA (Letter of Authority) form link generated`,
                JSON.stringify({ uniqueId, link: uniqueLink })
            ]
        );

        res.json({ success: true, uniqueLink, uniqueId });
    } catch (error) {
        console.error('Error generating LOA link:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve LOA (Letter of Authority) form page (GET endpoint)
// Redirect to React frontend for the new layout
app.get('/loa-form/:uniqueId', async (req, res) => {
    const { uniqueId } = req.params;

    // Redirect to frontend URL (React app handles the form now)
    const isProduction = process.env.PM2_HOME || process.env.NODE_ENV === 'production';
    const frontendUrl = isProduction ? 'http://rowanroseclaims.co.uk' : 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/loa-form/${uniqueId}`);

    // OLD CODE BELOW - kept for reference but not executed due to redirect above
    try {
        // Find contact by unique link
        const contactRes = await pool.query(
            'SELECT id, first_name, last_name, full_name, intake_lender FROM contacts WHERE unique_form_link = $1',
            [uniqueId]
        );

        if (contactRes.rows.length === 0) {
            // Check submission_tokens table if not found in contacts
            const tokenRes = await pool.query(
                `SELECT c.id, c.first_name, c.last_name, c.full_name, c.loa_submitted, c.intake_lender, st.expires_at
                 FROM submission_tokens st
                 JOIN contacts c ON st.contact_id = c.id
                 WHERE st.token = $1`,
                [uniqueId]
            );

            if (tokenRes.rows.length === 0) {
                return res.status(404).send(`
                                <!DOCTYPE html>
                                <html>
                                    <head>
                                        <title>Invalid Link</title>
                                        <style>
                                            body {font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                            h1 {color: #EF4444; }
                                        </style>
                                    </head>
                                    <body>
                                        <h1>Invalid or Expired Link</h1>
                                        <p>This LOA form link is not valid. Please contact Rowan Rose Solicitors for assistance.</p>
                                    </body>
                                </html>
                                `);
            }

            const tokenData = tokenRes.rows[0];

            // Check if expired
            if (new Date() > new Date(tokenData.expires_at)) {
                return res.status(404).send(`
                                <!DOCTYPE html>
                                <html>
                                    <head>
                                        <title>Expired Link</title>
                                        <style>
                                            body {font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                            h1 {color: #EF4444; }
                                        </style>
                                    </head>
                                    <body>
                                        <h1>Link Expired</h1>
                                        <p>This LOA form link has expired. Please contact Rowan Rose Solicitors for a new link.</p>
                                    </body>
                                </html>
                                `);
            }

            // Check if already submitted
            if (tokenData.loa_submitted) {
                return res.status(400).send(`
                                <!DOCTYPE html>
                                <html>
                                    <head>
                                        <title>Already Submitted</title>
                                        <style>
                                            body {font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                            h1 {color: #F59E0B; }
                                        </style>
                                    </head>
                                    <body>
                                        <h1>Already Submitted</h1>
                                        <p>This form has already been submitted. Thank you.</p>
                                    </body>
                                </html>
                                `);
            }

            // Use token data as contact
            contactRes.rows = [tokenData];
        }

        const contact = contactRes.rows[0];
        const contactName = contact.full_name || `${contact.first_name} ${contact.last_name}`;

        // Filter out intake_lender from the list
        // Exception: DO NOT filter if the lender is 'GAMBLING'
        const intakeLenderToExclude = (contact.intake_lender && contact.intake_lender.toUpperCase() !== 'GAMBLING')
            ? contact.intake_lender.trim().toUpperCase()
            : null;

        // Base categories definition
        const initialCategories = [
            { title: 'TICK THE CREDIT CARDS WHICH APPLY TO YOU :', lenders: ['AQUA', 'BIP CREDIT CARD', 'FLUID', 'VANQUIS', 'LUMA', 'MARBLES', 'MBNA', 'OCEAN', 'REVOLUT CREDIT CARD', 'WAVE', 'ZABLE', 'ZILCH', '118 118 MONEY'] },
            { title: 'TICK THE PAYDAY LOANS / LOANS WHICH APPLY TO YOU :', lenders: ['ADMIRAL LOANS', 'ANICO FINANCE', 'AVANT CREDIT', 'BAMBOO', 'BETTER BORROW', 'CREDIT SPRING', 'CASH ASAP', 'CASH FLOAT', 'CAR CASH POINT', 'CREATION FINANCE', 'CASTLE COMMUNITY BANK', 'DRAFTY LOANS', 'EVOLUTION MONEY', 'EVERY DAY LENDING', 'FERNOVO', 'FAIR FINANCE', 'FINIO LOANS', 'FINTERN', 'FLURO', 'GAMBLING', 'KOYO LOANS', 'LIKELY LOANS', 'LOANS2GO', 'Loans 2 Go', 'LOANS BY MAL', 'LOGBOOK LENDING', 'LOGBOOK MONEY', 'LENDING STREAM', 'LENDABLE', 'LIFE STYLE LOANS', 'MY COMMUNITY FINANCE', 'MY KREDIT', 'MY FINANCE CLUB', 'MONEY BOAT', 'MR LENDER', 'MONEY LINE', 'MY COMMUNITY BANK', 'MONTHLY ADVANCE LOANS', 'NOVUNA', 'OPOLO', 'PM LOANS', 'POLAR FINANCE', 'POST OFFICE MONEY', 'PROGRESSIVE MONEY', 'PLATA FINANCE', 'PLEND', 'QUID MARKET', 'QUICK LOANS', 'SKYLINE DIRECT', 'SALAD MONEY', 'SAVVY LOANS', 'SALARY FINANCE (NEYBER)', 'SNAP FINANCE', 'SHAWBROOK', 'THE ONE STOP MONEY SHOP', 'TM ADVANCES', 'TANDEM', '118 LOANS', 'WAGESTREAM', 'CONSOLADATION LOAN'] },
            { title: 'TICK THE GUARANTOR LOANS WHICH APPLY TO YOU :', lenders: ['GUARANTOR MY LOAN', 'HERO LOANS', 'JUO LOANS', 'SUCO', 'UK CREDIT', '1 PLUS 1'] },
            { title: 'TICK THE LOGBOOK LOANS / PAWNBROKERS WHICH APPLY TO YOU :', lenders: ['CASH CONVERTERS', 'H&T PAWNBROKERS'] },
            { title: 'TICK THE CATALOGUES WHICH APPLY TO YOU :', lenders: ['FASHION WORLD', 'JD WILLIAMS', 'SIMPLY BE', 'VERY CATALOGUE'] },
            { title: 'TICK THE CAR FINANCE WHICH APPLY TO YOU :', lenders: ['ADVANTAGE FINANCE', 'AUDI / VOLKSWAGEN FINANCE / SKODA', 'BLUE MOTOR FINANCE', 'CLOSE BROTHERS', 'HALIFAX / BANK OF SCOTLAND', 'MONEY WAY', 'MOTONOVO', 'MONEY BARN', 'OODLE', 'PSA FINANCE', 'RCI FINANCIAL'] },
            { title: 'TICK THE OVERDRAFTS WHICH APPLY TO YOU :', lenders: ['HALIFAX OVERDRAFT', 'BARCLAYS OVERDRAFT', 'CO-OP BANK OVERDRAFT', 'LLOYDS OVERDRAFT', 'TSB OVERDRAFT OVERDRAFT', 'NATWEST / RBS OVERDRAFT', 'HSBC OVERDRAFT', 'SANTANDER OVERDRAFT'] }
        ];

        // Process categories to filter out the intake lender
        const filteredCategories = initialCategories.map(cat => ({
            ...cat,
            lenders: cat.lenders.filter(l => {
                if (!intakeLenderToExclude) return true;
                return standardizeLender(l).toUpperCase() !== standardizeLender(intakeLenderToExclude).toUpperCase();
            })
        }));


        // Build base URL dynamically for assets
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

        // Load mail_top.png as base64 for reliable display
        let mailTopBase64 = '';
        try {
            const mailTopPath = path.join(__dirname, 'public', 'mail_top.png');
            if (fs.existsSync(mailTopPath)) {
                const mailTopBuffer = fs.readFileSync(mailTopPath);
                mailTopBase64 = `data:image/png;base64,${mailTopBuffer.toString('base64')}`;
            }
        } catch (e) {
            console.warn('Could not load mail_top.png:', e.message);
        }

        // Return HTML form page
        res.send(`
                                <!DOCTYPE html>
                                <html lang="en">
                                    <head>
                                        <meta charset="UTF-8">
                                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                <title>LOA Form - ${contactName}</title>
                                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                                                    <style>
                                                        * {margin: 0; padding: 0; box-sizing: border-box; }
                                                        body {
                                                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                                                            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                                                            padding: 20px;
                                                            line-height: 1.8;
                                                            font-size: 17px;
                                                            min-height: 100vh;
                                                        }
                                                        .container {
                                                            max-width: 960px;
                                                            margin: 0 auto;
                                                            background: white;
                                                            padding: 0;
                                                            border-radius: 24px;
                                                            box-shadow: 0 8px 32px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.05);
                                                            overflow: hidden;
                                                        }
                                                        .header {
                                                            background: #ffffff;
                                                            padding: 0;
                                                            margin-bottom: 0;
                                                        }
                                                        .header-image {
                                                            width: 100%;
                                                            display: block;
                                                            height: auto;
                                                        }
                                                        .content-wrapper {
                                                            padding: 45px 50px;
                                                        }
                                                        .greeting {
                                                            font-size: 36px;
                                                            font-weight: 800;
                                                            color: #0f172a;
                                                            margin: 0 0 28px 0;
                                                            text-align: left;
                                                            letter-spacing: -0.5px;
                                                        }
                                                        .intro {
                                                            font-size: 22px;
                                                            color: #334155;
                                                            line-height: 1.8;
                                                            margin-bottom: 36px;
                                                            text-align: left;
                                                        }
                                                        .intro strong {
                                                            font-weight: 700;
                                                            color: #0f172a;
                                                        }
                                                        .intro p {
                                                            margin-bottom: 18px;
                                                            font-size: 22px;
                                                        }
                                                        .good-news-banner {
                                                            background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
                                                            padding: 26px 32px;
                                                            border-radius: 16px;
                                                            display: flex;
                                                            align-items: center;
                                                            gap: 16px;
                                                            font-size: 26px;
                                                            font-weight: 700;
                                                            color: #047857;
                                                            border: 3px solid #34d399;
                                                            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.12);
                                                        }
                                                        .good-news-icon {
                                                            font-size: 36px;
                                                        }
                                                        .friendly-note {
                                                            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                                                            padding: 28px 32px;
                                                            border-radius: 16px;
                                                            margin-top: 32px;
                                                            border: 3px solid #7dd3fc;
                                                            text-align: center;
                                                            box-shadow: 0 2px 8px rgba(56, 189, 248, 0.1);
                                                        }
                                                        .friendly-note p {
                                                            font-size: 22px;
                                                            color: #0369a1;
                                                            font-weight: 600;
                                                            margin: 0;
                                                            line-height: 1.7;
                                                        }
                                                        .category {
                                                            margin: 40px 0;
                                                            padding: 32px;
                                                            border-radius: 18px;
                                                            border: 2px solid #e2e8f0;
                                                            transition: box-shadow 0.2s;
                                                        }
                                                        .category:hover {
                                                            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
                                                        }
                                                        .category:nth-child(odd) {
                                                            background: #ffffff;
                                                        }
                                                        .category:nth-child(even) {
                                                            background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
                                                        }
                                                        .category-title {
                                                            font-size: 20px;
                                                            font-weight: 700;
                                                            color: #0f172a;
                                                            margin-bottom: 24px;
                                                            text-transform: uppercase;
                                                            letter-spacing: 0.8px;
                                                            padding-bottom: 14px;
                                                            border-bottom: 3px solid #f97316;
                                                            display: inline-block;
                                                        }
                                                        .lender-item {
                                                            display: flex;
                                                            align-items: center;
                                                            padding: 20px 22px;
                                                            margin: 10px 0;
                                                            border-radius: 14px;
                                                            transition: all 0.2s;
                                                            min-height: 72px;
                                                            border: 2px solid transparent;
                                                            background: #fafafa;
                                                        }
                                                        .lender-item:hover {
                                                            background: #fff7ed;
                                                            border-color: #fdba74;
                                                        }
                                                        .lender-item input[type="checkbox"] {
                                                            width: 44px;
                                                            height: 44px;
                                                            margin-right: 20px;
                                                            cursor: pointer;
                                                            accent-color: #f97316;
                                                            flex-shrink: 0;
                                                            border-radius: 8px;
                                                        }
                                                        .lender-item label {
                                                            font-size: 22px;
                                                            color: #1e293b;
                                                            cursor: pointer;
                                                            user-select: none;
                                                            font-weight: 600;
                                                            line-height: 1.5;
                                                        }
                                                        .questions {
                                                            margin: 48px 0;
                                                            padding: 36px;
                                                            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
                                                            border-radius: 18px;
                                                            border: 3px solid #fbbf24;
                                                            box-shadow: 0 2px 8px rgba(251, 191, 36, 0.15);
                                                        }
                                                        .question-item {
                                                            display: flex;
                                                            align-items: center;
                                                            margin: 24px 0;
                                                            min-height: 72px;
                                                        }
                                                        .question-item input[type="checkbox"] {
                                                            width: 44px;
                                                            height: 44px;
                                                            margin-right: 20px;
                                                            cursor: pointer;
                                                            accent-color: #f59e0b;
                                                            flex-shrink: 0;
                                                        }
                                                        .question-item label {
                                                            font-size: 22px;
                                                            font-weight: 700;
                                                            color: #92400e;
                                                            cursor: pointer;
                                                            line-height: 1.6;
                                                        }
                                                        .signature-section {
                                                            margin: 48px 0;
                                                            background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
                                                            padding: 40px;
                                                            border-radius: 22px;
                                                            border: 3px solid #1e3a5f;
                                                            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
                                                        }
                                                        .authorization-text {
                                                            font-size: 22px;
                                                            color: #334155;
                                                            line-height: 1.75;
                                                            padding: 28px 32px;
                                                            background: #ffffff;
                                                            border-radius: 16px;
                                                            border: 2px solid #e2e8f0;
                                                            margin-bottom: 28px;
                                                            text-align: center;
                                                        }
                                                        .authorization-text strong {
                                                            color: #f97316;
                                                            font-weight: 700;
                                                        }
                                                        .signature-title {
                                                            font-size: 26px;
                                                            font-weight: 700;
                                                            color: #0f172a;
                                                            margin-bottom: 8px;
                                                        }
                                                        .signature-subtitle {
                                                            font-size: 18px;
                                                            color: #64748b;
                                                            margin-bottom: 20px;
                                                        }
                                                        .signature-container {
                                                            position: relative;
                                                            width: 100%;
                                                            background: white;
                                                            border: 3px solid #e2e8f0;
                                                            border-radius: 16px;
                                                            overflow: hidden;
                                                            transition: all 0.2s;
                                                        }
                                                        .signature-container:hover {
                                                            border-color: #f97316;
                                                            box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
                                                        }
                                                        .signature-canvas {
                                                            cursor: crosshair;
                                                            display: block;
                                                            width: 100%;
                                                            height: 200px;
                                                            touch-action: none;
                                                        }
                                                        .signature-placeholder {
                                                            position: absolute;
                                                            top: 50%;
                                                            left: 50%;
                                                            transform: translate(-50%, -50%);
                                                            color: #cbd5e1;
                                                            font-size: 32px;
                                                            font-style: italic;
                                                            font-family: serif;
                                                            pointer-events: none;
                                                        }
                                                        .signature-footer {
                                                            display: flex;
                                                            justify-content: space-between;
                                                            align-items: center;
                                                            margin-top: 16px;
                                                            padding: 0 4px;
                                                        }
                                                        .signature-hint {
                                                            font-size: 16px;
                                                            font-weight: 700;
                                                            text-transform: uppercase;
                                                            letter-spacing: 0.5px;
                                                            color: #94a3b8;
                                                        }
                                                        .signature-buttons {
                                                            display: flex;
                                                            gap: 15px;
                                                        }
                                                        .btn {
                                                            padding: 20px 34px;
                                                            border: none;
                                                            border-radius: 14px;
                                                            font-size: 20px;
                                                            font-weight: 700;
                                                            cursor: pointer;
                                                            transition: all 0.2s;
                                                            font-family: 'Inter', sans-serif;
                                                            min-height: 64px;
                                                        }
                                                        .btn-clear {
                                                            background: transparent;
                                                            color: #64748b;
                                                            padding: 0;
                                                            min-height: auto;
                                                            font-size: 18px;
                                                            text-transform: uppercase;
                                                            letter-spacing: 0.5px;
                                                            transition: color 0.2s;
                                                        }
                                                        .btn-clear:hover {
                                                            color: #ef4444;
                                                        }
                                                        .btn-submit {
                                                            background: linear-gradient(145deg, #f97316 0%, #ea580c 100%);
                                                            color: white;
                                                            padding: 26px 60px;
                                                            font-size: 26px;
                                                            font-weight: 700;
                                                            width: 100%;
                                                            margin-top: 44px;
                                                            min-height: 80px;
                                                            border-radius: 16px;
                                                            box-shadow: 0 6px 20px rgba(249, 115, 22, 0.35);
                                                            text-transform: uppercase;
                                                            letter-spacing: 1.5px;
                                                        }
                                                        .btn-submit:hover {
                                                            background: linear-gradient(145deg, #ea580c 0%, #c2410c 100%);
                                                            transform: translateY(-3px);
                                                            box-shadow: 0 8px 26px rgba(249, 115, 22, 0.5);
                                                        }
                                                        .btn-submit:disabled {
                                                            background: #9ca3af;
                                                            cursor: not-allowed;
                                                            transform: none;
                                                            box-shadow: none;
                                                        }
                                                        .disclaimer {
                                                            font-size: 18px;
                                                            color: #64748b;
                                                            margin-top: 28px;
                                                            padding: 24px 28px;
                                                            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                                                            border-radius: 14px;
                                                            line-height: 1.75;
                                                            border: 1px solid #e2e8f0;
                                                        }
                                                        .loading {
                                                            display: none;
                                                            text-align: center;
                                                            padding: 60px;
                                                            font-size: 24px;
                                                            color: #64748b;
                                                        }
                                                        .loading p {
                                                            margin-top: 20px;
                                                        }
                                                        .success-message {
                                                            display: none;
                                                            text-align: center;
                                                            padding: 70px 50px;
                                                        }
                                                        .success-message h2 {
                                                            color: #059669;
                                                            margin-bottom: 20px;
                                                            font-size: 36px;
                                                            font-weight: 800;
                                                        }
                                                        .success-message p {
                                                            font-size: 22px;
                                                            color: #475569;
                                                            line-height: 1.7;
                                                        }
                                                        .error-message {
                                                            display: none;
                                                            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                                                            color: #b91c1c;
                                                            padding: 18px 22px;
                                                            margin: 20px 0;
                                                            border-radius: 12px;
                                                            border: 1px solid #fca5a5;
                                                            font-size: 16px;
                                                            font-weight: 600;
                                                            text-align: center;
                                                        }

                                                        /* Mobile Responsiveness */
                                                        @media (max-width: 768px) {
                                                            body {
                                                                padding: 12px;
                                                                font-size: 16px;
                                                            }
                                                            .container {
                                                                border-radius: 16px;
                                                            }
                                                            .content-wrapper {
                                                                padding: 28px 24px;
                                                            }
                                                            .header-info-row {
                                                                padding: 16px 20px;
                                                                flex-direction: column;
                                                                text-align: center;
                                                            }
                                                            .header-address, .header-contact {
                                                                text-align: center;
                                                            }
                                                            .greeting {
                                                                font-size: 26px;
                                                            }
                                                            .intro {
                                                                font-size: 16px;
                                                            }
                                                            .good-news-banner {
                                                                font-size: 18px;
                                                                padding: 16px 20px;
                                                            }
                                                            .friendly-note {
                                                                padding: 18px 20px;
                                                            }
                                                            .friendly-note p {
                                                                font-size: 15px;
                                                            }
                                                            .category {
                                                                padding: 20px 18px;
                                                                margin: 24px 0;
                                                            }
                                                            .category-title {
                                                                font-size: 14px;
                                                            }
                                                            .lender-item {
                                                                padding: 12px 14px;
                                                                min-height: 48px;
                                                            }
                                                            .lender-item label {
                                                                font-size: 15px;
                                                            }
                                                            .question-item {
                                                                min-height: 48px;
                                                            }
                                                            .question-item label {
                                                                font-size: 14px;
                                                            }
                                                            .signature-section {
                                                                padding: 24px 20px;
                                                            }
                                                            .signature-canvas {
                                                                height: 150px;
                                                            }
                                                            .btn {
                                                                font-size: 16px;
                                                                padding: 14px 24px;
                                                            }
                                                            .btn-submit {
                                                                font-size: 17px;
                                                                padding: 18px 36px;
                                                            }
                                                        }

                                                        @media (max-width: 480px) {
                                                            .container {
                                                                border-radius: 12px;
                                                            }
                                                            .content-wrapper {
                                                                padding: 24px 18px;
                                                            }
                                                            .greeting {
                                                                font-size: 22px;
                                                            }
                                                            .intro {
                                                                font-size: 15px;
                                                            }
                                                            .good-news-banner {
                                                                font-size: 16px;
                                                                padding: 14px 16px;
                                                                flex-direction: column;
                                                                text-align: center;
                                                            }
                                                            .good-news-icon {
                                                                font-size: 22px;
                                                            }
                                                            .friendly-note {
                                                                padding: 14px 16px;
                                                            }
                                                            .friendly-note p {
                                                                font-size: 14px;
                                                            }
                                                            .category-title {
                                                                font-size: 13px;
                                                            }
                                                            .lender-item label,
                                                            .question-item label {
                                                                font-size: 14px;
                                                            }
                                                            .signature-title {
                                                                font-size: 18px;
                                                            }
                                                            .btn-submit {
                                                                font-size: 16px;
                                                                padding: 16px 28px;
                                                            }
                                                        }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="container">
                                                        <div class="header">
                                                            ${mailTopBase64
                ? `<img src="${mailTopBase64}" alt="Rowan Rose Solicitors" class="header-image">`
                : `<div style="background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 40px; text-align: center;"><span style="font-size: 32px; font-weight: 800; color: white; letter-spacing: 2px;">ROWAN ROSE SOLICITORS</span></div>`}
                                                        </div>

                                                        <div class="content-wrapper">
                                                            <div class="greeting">Hi ${contactName},</div>
                                                            <div class="intro">
                                                                <div class="good-news-banner">
                                                                    <span class="good-news-icon">&#127881;</span>
                                                                    <span>Great news — your claim is progressing smoothly!</span>
                                                                </div>
                                                                <p style="margin-top: 24px; font-size: 22px;">We're reaching out because <strong>millions of pounds have already been repaid to consumers</strong> just like you from lenders for irresponsible lending practices.</p>
                                                                <p style="margin-top: 18px; font-size: 22px;">To help maximise your potential refund, please take a quick look at the list below and <strong>tick any lenders you've used in the last 15 years</strong>.</p>
                                                                <p style="margin-top: 18px; font-size: 22px; color: #059669; font-weight: 600;">It only takes a minute and could make a real difference to your claim!</p>
                                                                <p style="margin-top: 18px; font-size: 20px; color: #64748b;">Questions? We're here to help — just get in touch.</p>
                                                            </div>
                                                                                <div id="errorMessage" class="error-message"></div>
                                                                                <form id="lenderForm">
                                                                                    <div id="lenderCategories"></div>
                                                                                    <div class="questions">
                                                                                        <div class="question-item"><input type="checkbox" id="ccj" name="ccj"><label for="ccj">HAVE YOU EVER HAD A CCJ IN THE LAST 6 YEARS?</label></div>
                                                                                        <div class="question-item"><input type="checkbox" id="scam" name="scam"><label for="scam">HAVE YOU BEEN A VICTIM OF A SCAM IN THE LAST 6 YEARS?</label></div>
                                                                                        <div class="question-item"><input type="checkbox" id="gambling" name="gambling"><label for="gambling">HAVE YOU EXPERIENCED PERIODS OF EXCESSIVE OR PROBLEMATIC GAMBLING WITHIN THE LAST 10 YEARS?</label></div>
                                                                                    </div>
                                                                                    <div class="friendly-note">
                                                                                        <p>Thank you for taking the time to complete this form. Your responses help us build the strongest possible case for your claim. We're committed to getting you the best outcome!</p>
                                                                                    </div>
                                                                                    <div class="signature-section">
                                                                                        <div class="authorization-text">
                                                                                            I, <strong>${contactName}</strong>, authorise Rowan Rose Solicitors to investigate and pursue any case or claim against the lender(s) I have selected within this form.
                                                                                        </div>
                                                                                        <div class="signature-title">Digital Signature</div>
                                                                                        <div class="signature-subtitle">By signing below, you confirm the above authorisation and agree to our terms of service.</div>
                                                                                        <div class="signature-container">
                                                                                            <canvas id="signatureCanvas" class="signature-canvas"></canvas>
                                                                                            <div class="signature-placeholder" id="signaturePlaceholder">Sign here</div>
                                                                                        </div>
                                                                                        <div class="signature-footer">
                                                                                            <span class="signature-hint">Draw with finger or mouse</span>
                                                                                            <button type="button" class="btn btn-clear" onclick="clearSignature()">Clear</button>
                                                                                        </div>
                                                                                    </div>
                                                                                    <button type="submit" class="btn btn-submit" id="submitBtn">Submit Your Selection</button>
                                                                                </form>
                                                                                <div class="loading" id="loading">
                                                                                    <div style="width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#f97316;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div>
                                                                                    <p style="margin-top:16px;color:#475569;font-weight:500;">Submitting your form...</p>
                                                                                </div>
                                                                                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                                                                                <div class="success-message" id="success">
                                                                                    <div style="width:64px;height:64px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;">
                                                                                        <span style="font-size:32px;color:#059669;">✓</span>
                                                                                    </div>
                                                                                    <h2>Form Submitted Successfully!</h2>
                                                                                    <p>Thank you for completing the lender selection form. We will process your information and be in touch shortly.</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                            <script>
                                                                                const lenderCategories = ${JSON.stringify(filteredCategories)};
                                                                                const container = document.getElementById('lenderCategories');
        lenderCategories.forEach((category, catIndex) => {
            const categoryDiv = document.createElement('div');
                                                                                categoryDiv.className = 'category';
                                                                                const title = document.createElement('div');
                                                                                title.className = 'category-title';
                                                                                title.textContent = category.title;
                                                                                categoryDiv.appendChild(title);
            category.lenders.forEach((lender, lenderIndex) => {
                const lenderDiv = document.createElement('div');
                                                                                lenderDiv.className = 'lender-item';
                                                                                const checkbox = document.createElement('input');
                                                                                checkbox.type = 'checkbox';
                                                                                checkbox.id = \`lender_\${catIndex}_\${lenderIndex}\`;
                                                                                checkbox.name = 'lenders';
                                                                                checkbox.value = lender;
                                                                                const label = document.createElement('label');
                                                                                label.htmlFor = checkbox.id;
                                                                                label.textContent = lender;
                                                                                lenderDiv.appendChild(checkbox);
                                                                                lenderDiv.appendChild(label);
                                                                                categoryDiv.appendChild(lenderDiv);
            });
                                                                                container.appendChild(categoryDiv);
        });
                                                                                const canvas = document.getElementById('signatureCanvas');
                                                                                const ctx = canvas.getContext('2d');
                                                                                const placeholder = document.getElementById('signaturePlaceholder');
                                                                                let isDrawing = false;
                                                                                let hasSignature = false;

                                                                                // Resize canvas to fit container
                                                                                function resizeCanvas() {
                                                                                    const container = canvas.parentElement;
                                                                                    const ratio = window.devicePixelRatio || 1;
                                                                                    const width = container.clientWidth;
                                                                                    const height = 200;
                                                                                    canvas.width = width * ratio;
                                                                                    canvas.height = height * ratio;
                                                                                    canvas.style.width = width + 'px';
                                                                                    canvas.style.height = height + 'px';
                                                                                    ctx.scale(ratio, ratio);
                                                                                    ctx.strokeStyle = '#0f172a';
                                                                                    ctx.lineWidth = 2.5;
                                                                                    ctx.lineCap = 'round';
                                                                                    ctx.lineJoin = 'round';
                                                                                }
                                                                                resizeCanvas();
                                                                                window.addEventListener('resize', resizeCanvas);

                                                                                function hidePlaceholder() {
                                                                                    if (placeholder) placeholder.style.display = 'none';
                                                                                    hasSignature = true;
                                                                                }

        canvas.addEventListener('mousedown', (e) => {isDrawing = true; const rect = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); });
        canvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; const rect = canvas.getBoundingClientRect(); ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('mouseup', () => {isDrawing = false; });
        canvas.addEventListener('mouseout', () => {isDrawing = false; });
        canvas.addEventListener('touchstart', (e) => {e.preventDefault(); const touch = e.touches[0]; const rect = canvas.getBoundingClientRect(); const x = touch.clientX - rect.left; const y = touch.clientY - rect.top; ctx.beginPath(); ctx.moveTo(x, y); isDrawing = true; });
        canvas.addEventListener('touchmove', (e) => {e.preventDefault(); if (!isDrawing) return; const touch = e.touches[0]; const rect = canvas.getBoundingClientRect(); const x = touch.clientX - rect.left; const y = touch.clientY - rect.top; ctx.lineTo(x, y); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('touchend', (e) => {e.preventDefault(); isDrawing = false; });
                                                                                function clearSignature() {
                                                                                    const ratio = window.devicePixelRatio || 1;
                                                                                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                                                                                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                                                                                    ctx.scale(ratio, ratio);
                                                                                    ctx.strokeStyle = '#0f172a';
                                                                                    ctx.lineWidth = 2.5;
                                                                                    ctx.lineCap = 'round';
                                                                                    ctx.lineJoin = 'round';
                                                                                    hasSignature = false;
                                                                                    if (placeholder) placeholder.style.display = 'block';
                                                                                }
        document.getElementById('lenderForm').addEventListener('submit', async (e) => {
                                                                                    e.preventDefault();
            const selectedLenders = Array.from(document.querySelectorAll('input[name="lenders"]:checked')).map(cb => cb.value);
                                                                                if (selectedLenders.length === 0) {alert('Please select at least one lender.'); return; }
                                                                                if (!hasSignature) {alert('Please provide your signature.'); return; }
                                                                                const signatureData = canvas.toDataURL('image/png');
                                                                                const hadCCJ = document.getElementById('ccj').checked;
                                                                                const victimOfScam = document.getElementById('scam').checked;
                                                                                const problematicGambling = document.getElementById('gambling').checked;
                                                                                document.getElementById('lenderForm').style.display = 'none';
                                                                                document.getElementById('loading').style.display = 'block';
                                                                                try {
                const response = await fetch('/api/submit-loa-form', {
                                                                                    method: 'POST',
                                                                                headers: {'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({uniqueId: '${uniqueId}', selectedLenders, signature2Data: signatureData, hadCCJ, victimOfScam, problematicGambling })
                });
                                                                                const result = await response.json();
                                                                                if (result.success) {
                                                                                    document.getElementById('loading').style.display = 'none';
                                                                                document.getElementById('success').style.display = 'block';
                } else {
                    const errorDiv = document.getElementById('errorMessage');
                                                                                errorDiv.textContent = result.message;
                                                                                errorDiv.style.display = 'block';
                                                                                document.getElementById('lenderForm').style.display = 'block';
                                                                                document.getElementById('loading').style.display = 'none';
                                                                                // Scroll to error message
                                                                                errorDiv.scrollIntoView({behavior: 'smooth' });
                }
            } catch (error) {
                const errorDiv = document.getElementById('errorMessage');
                                                                                errorDiv.textContent = 'Error submitting form. Please try again.';
                                                                                errorDiv.style.display = 'block';
                                                                                document.getElementById('lenderForm').style.display = 'block';
                                                                                document.getElementById('loading').style.display = 'none';
            }
        });
                                                                            </script>
                                                                        </body>
                                                                        </html>
                                                                        `);
    } catch (error) {
        console.error('Error serving lender form:', error);
        res.status(500).send('Server error');
    }
});

// Submit LOA form
app.post('/api/submit-loa-form', async (req, res) => {
    const { uniqueId, selectedLenders, signature2Data, hadCCJ, victimOfScam, problematicGambling } = req.body;

    if (!uniqueId || !selectedLenders || !signature2Data) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Find contact by unique link and fetch complete data
        const contactRes = await pool.query(
            `SELECT id, first_name, last_name, address_line_1, address_line_2,
                                                                        city, state_county, postal_code, dob, loa_submitted, intake_lender
                                                                        FROM contacts WHERE unique_form_link = $1`,
            [uniqueId]
        );

        let contact;
        if (contactRes.rows.length === 0) {
            // Check submission_tokens table if not found in contacts
            const tokenRes = await pool.query(
                `SELECT c.id, c.first_name, c.last_name, c.address_line_1, c.address_line_2,
                 c.city, c.state_county, c.postal_code, c.dob, c.loa_submitted, c.intake_lender
                 FROM submission_tokens st
                 JOIN contacts c ON st.contact_id = c.id
                 WHERE st.token = $1`,
                [uniqueId]
            );

            if (tokenRes.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Invalid form link' });
            }
            contact = tokenRes.rows[0];
        } else {
            contact = contactRes.rows[0];
        }

        // Check if LOA form has already been submitted
        if (contact.loa_submitted) {
            return res.status(400).json({
                success: false,
                message: 'This link has already been used.',
                alreadySubmitted: true
            });
        }

        const contactId = contact.id;
        const folderPath = `${contact.first_name}_${contact.last_name}_${contactId}/`;

        // --- UPDATE DB IMMEDIATELY ---
        await pool.query('UPDATE contacts SET loa_submitted = true WHERE id = $1', [contactId]);

        // --- IMMEDIATE RESPONSE ---
        res.json({ success: true, message: 'Form submitted successfully' });

        // --- BACKGROUND PROCESSING ---
        (async () => {
            try {
                console.log(`[Background LOA] Starting processing for contact ${contactId}...`);

                // 1. Upload Signature 2 to S3
                const signatureBufferWithTimestamp = await addTimestampToSignature(signature2Data);
                const timestamp = Date.now();
                const signature2Key = `${folderPath}Signatures/signature_2_${timestamp}.png`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: signature2Key,
                    Body: signatureBufferWithTimestamp,
                    ContentType: 'image/png'
                }));

                // Generate presigned URL
                const signature2Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: signature2Key }), { expiresIn: 604800 });

                // 2. Update contact with signature 2 URL
                await pool.query('UPDATE contacts SET signature_2_url = $1 WHERE id = $2', [signature2Url, contactId]);

                // 3. Save signature 2 to documents table
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                                                                        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, 'Signature_2.png', 'image', 'Legal', signature2Url, 'Auto-generated', ['Signature', 'LOA Form']]
                );

                // 4. Load logo for PDFs
                let logoBase64 = null;
                try {
                    const logoPath = path.join(__dirname, 'public', 'fac.png');
                    const logoBuffer = await fs.promises.readFile(logoPath);
                    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                } catch (e) {
                    console.warn('[Background LOA] Logo not found');
                }

                // Convert signature URL to base64 for embedding in PDF
                let signatureBase64 = null;
                try {
                    signatureBase64 = `data:image/png;base64,${signatureBufferWithTimestamp.toString('base64')}`;
                } catch (e) {
                    console.warn('[Background LOA] Could not convert signature to base64');
                }


                // 5. Create Claims for each selected lender (PDF Generation Deferred)
                // Category 3 lenders get confirmation emails instead of immediate claim creation
                const caseCreationPromises = selectedLenders.map(async (lender) => {
                    try {
                        const standardizedLenderName = standardizeLender(lender);

                        // Check if this is a Category 3 lender requiring confirmation
                        if (isCategory3Lender(standardizedLenderName)) {
                            console.log(`[Background LOA] Category 3 lender detected: ${lender}. Sending confirmation email.`);

                            // Generate tokens for confirm/reject actions
                            const confirmToken = generateConfirmationToken();
                            const rejectToken = generateConfirmationToken();

                            // Store pending confirmations
                            await pool.query(
                                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                                 VALUES ($1, $2, 'confirm', $3, false)`,
                                [contactId, standardizedLenderName, confirmToken]
                            );
                            await pool.query(
                                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                                 VALUES ($1, $2, 'reject', $3, true)`,  // reject token doesn't need separate email
                                [contactId, standardizedLenderName, rejectToken]
                            );

                            // Email will be sent by worker - log the action
                            await pool.query(
                                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                                 VALUES ($1, 'system', 'loa_form', 'category3_pending', 'claims', $2, $3)`,
                                [
                                    contactId,
                                    `${standardizedLenderName} confirmation queued. Email will be sent shortly.`,
                                    JSON.stringify({ lender: standardizedLenderName })
                                ]
                            );

                            return { lender, success: true, status: 'confirmation_queued' };
                        }

                        // Condition: Only the Intake Lender gets 'Lender Selection Form Completed' initially
                        // Others get 'New Lead'
                        let initialStatus = 'New Lead';
                        if (contact.intake_lender && standardizeLender(contact.intake_lender) === standardizedLenderName) {
                            initialStatus = 'Lender Selection Form Completed';
                        }

                        // CHECK FOR EXISTING CASE FIRST
                        const existingCaseRes = await pool.query(
                            `SELECT id, status FROM cases WHERE contact_id = $1 AND lower(lender) = lower($2)`,
                            [contactId, standardizedLenderName]
                        );

                        // Set dsar_send_after to now (no delay for extra lender form - docs already available; skip for GAMBLING)
                        const dsarSendAfterLender = standardizedLenderName.toUpperCase() !== 'GAMBLING'
                            ? new Date()
                            : null;

                        if (existingCaseRes.rows.length > 0) {
                            // Case exists - update status if it's the intake lender, otherwise leave as is (or update if needed)
                            console.log(`[Background LOA] Case already exists for ${lender}. Updating status if needed.`);

                            if (initialStatus === 'Lender Selection Form Completed') {
                                await pool.query(
                                    `UPDATE cases SET status = $1, dsar_send_after = COALESCE(dsar_send_after, $3) WHERE id = $2`,
                                    [initialStatus, existingCaseRes.rows[0].id, dsarSendAfterLender]
                                );
                            }
                            return { lender, success: true, status: 'updated' };
                        } else {
                            // Case does not exist - create new
                            const newCaseRes = await pool.query(
                                `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated, dsar_send_after)
                                 VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, false, $4) RETURNING id`,
                                [contactId, standardizedLenderName, initialStatus, dsarSendAfterLender]
                            );
                            await setReferenceSpecified(pool, contactId, newCaseRes.rows[0].id);

                            console.log(`[Background LOA] Created Case for ${lender} with status ${initialStatus} (PDF Generation Pending)`);
                            return { lender, success: true, status: 'created' };
                        }
                    } catch (error) {
                        console.error(`[Background LOA] ❌ Error processing case for ${lender}:`, error);
                        return { lender, success: false, error: error.message };
                    }
                });

                // Wait for all cases to be created
                await Promise.all(caseCreationPromises);

                // 6. Handle Intake Lender Claim (Ensure it exists and has correct status if not selected above)
                // Skip if it's a Category 3 lender (already handled via confirmation email)
                if (contact.intake_lender) {
                    console.log(`[Background LOA] Ensuring Intake Lender Case: ${contact.intake_lender}`);
                    const stdIntakeLender = standardizeLender(contact.intake_lender);

                    // Skip Category 3 lenders - they need email confirmation
                    if (isCategory3Lender(stdIntakeLender)) {
                        console.log(`[Background LOA] Intake lender ${stdIntakeLender} is Category 3. Confirmation email already sent.`);
                    } else {
                        // Update existing case if it exists (e.g. created created above or previously)
                        const intakeDsarSendAfter = stdIntakeLender.toUpperCase() !== 'GAMBLING' ? new Date() : null;
                        const updateResult = await pool.query(
                            `UPDATE cases SET status = 'Lender Selection Form Completed', dsar_send_after = COALESCE(dsar_send_after, $3)
                             WHERE contact_id = $1 AND lower(lender) = lower($2)`,
                            [contactId, stdIntakeLender, intakeDsarSendAfter]
                        );

                        if (updateResult.rowCount === 0) {
                            // If not exists (meaning user didn't select it? or it wasn't in list?), create it
                            const intakeCaseRes = await pool.query(
                                `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated, dsar_send_after)
                                 VALUES ($1, $2, 'Lender Selection Form Completed', 0, CURRENT_TIMESTAMP, false, $3) RETURNING id`,
                                [contactId, stdIntakeLender, intakeDsarSendAfter]
                            );
                            await setReferenceSpecified(pool, contactId, intakeCaseRes.rows[0].id);
                        }
                    }
                }

                // Create Action Log
                await pool.query(
                    `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        contactId,
                        'client',
                        contactId.toString(),
                        `${contact.first_name} ${contact.last_name}`,
                        'loa_form_submitted',
                        'case',
                        `Client submitted LOA Selection Form`,
                        JSON.stringify({ selectedLenders })
                    ]
                );

                // Auto-complete: Mark any Sent/Viewed LOA documents as Completed
                const loaCompleted = await pool.query(
                    `UPDATE documents SET document_status = 'Completed', updated_at = NOW()
                     WHERE contact_id = $1
                       AND document_status IN ('Sent', 'Viewed')
                       AND (tags @> ARRAY['LOA']::text[] OR tags @> ARRAY['LOA Form']::text[] OR name ILIKE '%LOA%')
                     RETURNING id, name`,
                    [contactId]
                );
                if (loaCompleted.rows.length > 0) {
                    for (const ld of loaCompleted.rows) {
                        await pool.query(
                            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                             VALUES ($1, 'client', $1, 'Client', 'document_completed', 'documents', $2, $3, NOW())`,
                            [contactId, `LOA form signed - document "${ld.name}" marked Completed`, JSON.stringify({ document_id: ld.id, trigger: 'loa_form_submission' })]
                        );
                    }
                    // Cancel active document chase workflows for these documents
                    for (const ld of loaCompleted.rows) {
                        await pool.query(
                            `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW()
                             WHERE workflow_type = 'document_chase' AND metadata->>'document_id' = $1 AND status = 'active'`,
                            [ld.id.toString()]
                        );
                    }
                    console.log(`[Background LOA] Marked ${loaCompleted.rows.length} LOA documents as Completed`);
                }

                console.log(`[Background LOA] ✅ ALL TASKS COMPLETED for contact ${contactId}`);

            } catch (err) {
                console.error('[Background LOA] ❌ Background Processing Error:', err);
            }
        })();

    } catch (error) {
        console.error('Submit LOA Form Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get action timeline for a contact
app.get('/api/contacts/:id/action-timeline', async (req, res) => {
    const { id } = req.params;

    try {
        const timelineRes = await pool.query(
            `SELECT * FROM action_logs WHERE client_id = $1 ORDER BY timestamp DESC`,
            [id]
        );

        // Group timeline entries
        const timeline = {
            creation: [],
            formSubmissions: [],
            updates: []
        };

        timelineRes.rows.forEach(entry => {
            const formattedEntry = {
                id: entry.id,
                timestamp: entry.timestamp,
                actorType: entry.actor_type,
                actorName: entry.actor_name,
                actionType: entry.action_type,
                description: entry.description,
                metadata: entry.metadata
            };

            if (entry.action_type === 'contact_created') {
                timeline.creation.push(formattedEntry);
            } else if (entry.action_type.includes('form') || entry.action_type.includes('link')) {
                timeline.formSubmissions.push(formattedEntry);
            } else {
                timeline.updates.push(formattedEntry);
            }
        });

        res.json({ success: true, timeline });
    } catch (error) {
        console.error('Error fetching action timeline:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ============================================
// TASKS & CALENDAR ENDPOINTS
// ============================================

// Get all tasks (with optional filters)
app.get('/api/tasks', async (req, res) => {
    try {
        const { startDate, endDate, status, assignedTo, type } = req.query;

        let query = `
            SELECT t.*,
                u1.full_name as assigned_to_name,
                u2.full_name as assigned_by_name,
                u3.full_name as created_by_name,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tc.contact_id, 'name', c.full_name))
                     FROM task_contacts tc
                     JOIN contacts c ON tc.contact_id = c.id
                     WHERE tc.task_id = t.id), '[]'
                ) as linked_contacts,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tcl.claim_id, 'lender', cs.lender))
                     FROM task_claims tcl
                     JOIN cases cs ON tcl.claim_id = cs.id
                     WHERE tcl.task_id = t.id), '[]'
                ) as linked_claims,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tr.id, 'reminder_time', tr.reminder_time, 'is_sent', tr.is_sent))
                     FROM task_reminders tr
                     WHERE tr.task_id = t.id), '[]'
                ) as reminders
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.assigned_by = u2.id
            LEFT JOIN users u3 ON t.created_by = u3.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND t.date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            query += ` AND t.date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }
        if (status) {
            query += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (assignedTo) {
            query += ` AND t.assigned_to = $${paramIndex}`;
            params.push(assignedTo);
            paramIndex++;
        }
        if (type) {
            query += ` AND t.type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        query += ` ORDER BY t.date ASC, t.start_time ASC`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single task
app.get('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT t.*,
                u1.full_name as assigned_to_name,
                u2.full_name as assigned_by_name,
                u3.full_name as created_by_name,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tc.contact_id, 'name', c.full_name))
                     FROM task_contacts tc
                     JOIN contacts c ON tc.contact_id = c.id
                     WHERE tc.task_id = t.id), '[]'
                ) as linked_contacts,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tcl.claim_id, 'lender', cs.lender))
                     FROM task_claims tcl
                     JOIN cases cs ON tcl.claim_id = cs.id
                     WHERE tcl.task_id = t.id), '[]'
                ) as linked_claims,
                COALESCE(
                    (SELECT json_agg(json_build_object('id', tr.id, 'reminder_time', tr.reminder_time, 'is_sent', tr.is_sent))
                     FROM task_reminders tr
                     WHERE tr.task_id = t.id), '[]'
                ) as reminders
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.assigned_by = u2.id
            LEFT JOIN users u3 ON t.created_by = u3.id
            WHERE t.id = $1
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create task
app.post('/api/tasks', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            title, description, type, date, startTime, endTime,
            assignedTo, assignedBy, isRecurring, recurrencePattern,
            recurrenceEndDate, contactIds, claimIds, reminders, createdBy
        } = req.body;

        // Insert task
        const taskResult = await client.query(`
            INSERT INTO tasks (title, description, type, date, start_time, end_time,
                assigned_to, assigned_by, assigned_at, is_recurring, recurrence_pattern,
                recurrence_end_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            title, description, type || 'appointment', date, startTime, endTime,
            assignedTo || null, assignedBy || null, assignedTo ? new Date() : null,
            isRecurring || false, recurrencePattern || null,
            recurrenceEndDate || null, createdBy || null
        ]);

        const taskId = taskResult.rows[0].id;

        // Link contacts
        if (contactIds && contactIds.length > 0) {
            for (const contactId of contactIds) {
                await client.query(
                    'INSERT INTO task_contacts (task_id, contact_id) VALUES ($1, $2)',
                    [taskId, contactId]
                );
            }
        }

        // Link claims
        if (claimIds && claimIds.length > 0) {
            for (const claimId of claimIds) {
                await client.query(
                    'INSERT INTO task_claims (task_id, claim_id) VALUES ($1, $2)',
                    [taskId, claimId]
                );
            }
        }

        // Add reminders
        if (reminders && reminders.length > 0) {
            for (const reminder of reminders) {
                await client.query(
                    'INSERT INTO task_reminders (task_id, reminder_time, reminder_type) VALUES ($1, $2, $3)',
                    [taskId, reminder.reminderTime, reminder.reminderType || 'in_app']
                );
            }
        }

        // Create notification for assignee if assigned to someone else
        if (assignedTo && assignedTo !== createdBy) {
            await client.query(`
                INSERT INTO persistent_notifications (user_id, type, title, message, related_task_id)
                VALUES ($1, 'task_assigned', $2, $3, $4)
            `, [assignedTo, `Task assigned: ${title}`, `You have been assigned a new task scheduled for ${date}`, taskId]);
        }

        // Log action
        if (contactIds && contactIds.length > 0) {
            await client.query(`
                INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                VALUES ($1, 'agent', $2, 'task_created', 'system', $3)
            `, [contactIds[0], createdBy, `Task "${title}" created`]);
        }

        await client.query('COMMIT');

        res.status(201).json({ success: true, id: taskId, task: taskResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating task:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Update task
app.patch('/api/tasks/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const {
            title, description, type, status, date, startTime, endTime,
            assignedTo, assignedBy, isRecurring, recurrencePattern,
            recurrenceEndDate, contactIds, claimIds, reminders
        } = req.body;

        // Get current task for comparison
        const currentTask = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (currentTask.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Task not found' });
        }

        // Update task
        const updateResult = await client.query(`
            UPDATE tasks SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                type = COALESCE($3, type),
                status = COALESCE($4, status),
                date = COALESCE($5, date),
                start_time = COALESCE($6, start_time),
                end_time = COALESCE($7, end_time),
                assigned_to = COALESCE($8, assigned_to),
                assigned_by = COALESCE($9, assigned_by),
                assigned_at = CASE WHEN $8 IS NOT NULL AND $8 != assigned_to THEN NOW() ELSE assigned_at END,
                is_recurring = COALESCE($10, is_recurring),
                recurrence_pattern = COALESCE($11, recurrence_pattern),
                recurrence_end_date = COALESCE($12, recurrence_end_date),
                updated_at = NOW()
            WHERE id = $13
            RETURNING *
        `, [title, description, type, status, date, startTime, endTime,
            assignedTo, assignedBy, isRecurring, recurrencePattern,
            recurrenceEndDate, id]);

        // Update linked contacts if provided
        if (contactIds !== undefined) {
            await client.query('DELETE FROM task_contacts WHERE task_id = $1', [id]);
            for (const contactId of contactIds) {
                await client.query(
                    'INSERT INTO task_contacts (task_id, contact_id) VALUES ($1, $2)',
                    [id, contactId]
                );
            }
        }

        // Update linked claims if provided
        if (claimIds !== undefined) {
            await client.query('DELETE FROM task_claims WHERE task_id = $1', [id]);
            for (const claimId of claimIds) {
                await client.query(
                    'INSERT INTO task_claims (task_id, claim_id) VALUES ($1, $2)',
                    [id, claimId]
                );
            }
        }

        // Update reminders if provided
        if (reminders !== undefined) {
            await client.query('DELETE FROM task_reminders WHERE task_id = $1', [id]);
            for (const reminder of reminders) {
                await client.query(
                    'INSERT INTO task_reminders (task_id, reminder_time, reminder_type) VALUES ($1, $2, $3)',
                    [id, reminder.reminderTime, reminder.reminderType || 'in_app']
                );
            }
        }

        // Notify if reassigned
        if (assignedTo && assignedTo !== currentTask.rows[0].assigned_to) {
            await client.query(`
                INSERT INTO persistent_notifications (user_id, type, title, message, related_task_id)
                VALUES ($1, 'task_assigned', $2, $3, $4)
            `, [assignedTo, `Task assigned: ${title || currentTask.rows[0].title}`, `You have been assigned a task`, id]);
        }

        await client.query('COMMIT');

        res.json({ success: true, task: updateResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating task:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Complete task
app.post('/api/tasks/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { completedBy } = req.body;

        const { rows } = await pool.query(`
            UPDATE tasks SET
                status = 'completed',
                completed_at = NOW(),
                completed_by = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [completedBy, id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true, task: rows[0] });
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reschedule task (creates follow-up if auto-reschedule)
app.post('/api/tasks/:id/reschedule', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const { newDate, newStartTime, newEndTime, autoFollowUp, rescheduledBy } = req.body;

        // Get current task
        const currentTask = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);
        if (currentTask.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = currentTask.rows[0];

        // Mark original as rescheduled
        await client.query(`
            UPDATE tasks SET status = 'rescheduled', updated_at = NOW() WHERE id = $1
        `, [id]);

        // Create new task with new date
        const newTaskResult = await client.query(`
            INSERT INTO tasks (title, description, type, date, start_time, end_time,
                assigned_to, assigned_by, is_recurring, recurrence_pattern,
                recurrence_end_date, parent_task_id, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            task.title, task.description, task.type, newDate,
            newStartTime || task.start_time, newEndTime || task.end_time,
            task.assigned_to, task.assigned_by, task.is_recurring,
            task.recurrence_pattern, task.recurrence_end_date, id, rescheduledBy
        ]);

        const newTaskId = newTaskResult.rows[0].id;

        // Copy contact links
        await client.query(`
            INSERT INTO task_contacts (task_id, contact_id)
            SELECT $1, contact_id FROM task_contacts WHERE task_id = $2
        `, [newTaskId, id]);

        // Copy claim links
        await client.query(`
            INSERT INTO task_claims (task_id, claim_id)
            SELECT $1, claim_id FROM task_claims WHERE task_id = $2
        `, [newTaskId, id]);

        // Log action
        const contacts = await client.query('SELECT contact_id FROM task_contacts WHERE task_id = $1 LIMIT 1', [id]);
        if (contacts.rows.length > 0) {
            await client.query(`
                INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                VALUES ($1, 'agent', $2, 'task_rescheduled', 'system', $3)
            `, [contacts.rows[0].contact_id, rescheduledBy, `Task "${task.title}" rescheduled to ${newDate}`]);
        }

        await client.query('COMMIT');

        res.json({ success: true, originalTaskId: id, newTaskId, newTask: newTaskResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error rescheduling task:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true, message: 'Task deleted' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get task history (all versions including rescheduled)
app.get('/api/tasks/:id/history', async (req, res) => {
    try {
        const { id } = req.params;

        // Get all tasks in the chain (parent and children)
        const { rows } = await pool.query(`
            WITH RECURSIVE task_chain AS (
                SELECT t.*, 0 as depth FROM tasks t WHERE t.id = $1
                UNION ALL
                SELECT t.*, tc.depth + 1 FROM tasks t
                JOIN task_chain tc ON t.parent_task_id = tc.id
            )
            SELECT * FROM task_chain ORDER BY created_at ASC
        `, [id]);

        res.json(rows);
    } catch (error) {
        console.error('Error fetching task history:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PERSISTENT NOTIFICATIONS ENDPOINTS
// ============================================

// Get notifications for a user
app.get('/api/notifications', async (req, res) => {
    try {
        const { userId, unreadOnly } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        let query = `
            SELECT n.*, t.title as task_title, t.date as task_date
            FROM persistent_notifications n
            LEFT JOIN tasks t ON n.related_task_id = t.id
            WHERE n.user_id = $1
        `;

        if (unreadOnly === 'true') {
            query += ' AND n.is_read = FALSE';
        }

        query += ' ORDER BY n.created_at DESC LIMIT 50';

        const { rows } = await pool.query(query, [userId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get unread notification count
app.get('/api/notifications/count', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const { rows } = await pool.query(
            'SELECT COUNT(*) as count FROM persistent_notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );

        res.json({ count: parseInt(rows[0].count) });
    } catch (error) {
        console.error('Error fetching notification count:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query('UPDATE persistent_notifications SET is_read = TRUE WHERE id = $1', [id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification read:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark all notifications as read for a user
app.patch('/api/notifications/read-all', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        await pool.query('UPDATE persistent_notifications SET is_read = TRUE WHERE user_id = $1', [userId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications read:', error);
        res.status(500).json({ error: error.message });
    }
});

// ===================== SUPPORT TICKETS =====================

// Create a support ticket (with optional screenshot upload)
app.post('/api/tickets', upload.single('screenshot'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, userName, title, description } = req.body;
        const file = req.file;

        if (!userId || !title || !description) {
            return res.status(400).json({ error: 'userId, title and description are required' });
        }

        let screenshotKey = null;

        // Upload screenshot to S3 if provided
        if (file) {
            const ext = file.originalname.substring(file.originalname.lastIndexOf('.'));
            screenshotKey = `SupportTickets/${userId}_${Date.now()}${ext}`;

            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: screenshotKey,
                Body: file.buffer,
                ContentType: file.mimetype
            }));
        }

        await client.query('BEGIN');

        // Insert ticket
        const { rows } = await client.query(
            `INSERT INTO support_tickets (user_id, user_name, title, description, screenshot_key)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, userName || 'Unknown', title, description, screenshotKey]
        );
        const ticket = rows[0];

        // Notify all Management users
        const mgmtUsers = await client.query(
            `SELECT id FROM users WHERE role = 'Management' AND is_approved = TRUE`
        );
        for (const mgmt of mgmtUsers.rows) {
            await client.query(
                `INSERT INTO persistent_notifications (user_id, type, title, message)
                 VALUES ($1, 'ticket_raised', $2, $3)`,
                [mgmt.id, `New ticket: ${title}`, `${userName || 'A user'} raised a support ticket: ${description.substring(0, 100)}`]
            );
        }

        await client.query('COMMIT');

        res.json({ success: true, ticket });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating ticket:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Get tickets (Management sees all, others see own)
app.get('/api/tickets', async (req, res) => {
    try {
        const { userId, role } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        let query, params;
        if (role === 'Management') {
            query = `SELECT * FROM support_tickets ORDER BY created_at DESC`;
            params = [];
        } else {
            query = `SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC`;
            params = [userId];
        }

        const { rows } = await pool.query(query, params);

        // Generate signed URLs for screenshots
        for (const ticket of rows) {
            if (ticket.screenshot_key) {
                try {
                    ticket.screenshot_url = await getSignedUrl(
                        s3Client,
                        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: ticket.screenshot_key }),
                        { expiresIn: 3600 }
                    );
                } catch (e) {
                    ticket.screenshot_url = null;
                }
            }
        }

        res.json(rows);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ error: error.message });
    }
});

// Resolve a ticket
app.patch('/api/tickets/:id/resolve', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { resolvedBy, resolvedByName } = req.body;

        if (!resolvedBy) {
            return res.status(400).json({ error: 'resolvedBy is required' });
        }

        await client.query('BEGIN');

        const { rows } = await client.query(
            `UPDATE support_tickets SET status = 'resolved', resolved_by = $1, resolved_by_name = $2, resolved_at = NOW()
             WHERE id = $3 RETURNING *`,
            [resolvedBy, resolvedByName || 'Management', id]
        );

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const ticket = rows[0];

        // Notify the original ticket creator
        await client.query(
            `INSERT INTO persistent_notifications (user_id, type, title, message)
             VALUES ($1, 'ticket_resolved', $2, $3)`,
            [ticket.user_id, `Ticket resolved: ${ticket.title}`, `Your support ticket has been resolved by ${resolvedByName || 'Management'}.`]
        );

        await client.query('COMMIT');

        res.json({ success: true, ticket });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resolving ticket:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Check and create reminder notifications (called by background job or frontend)
app.post('/api/reminders/check', async (req, res) => {
    try {
        // Find due reminders that haven't been sent
        const { rows: dueReminders } = await pool.query(`
            SELECT tr.*, t.title, t.date, t.assigned_to, t.created_by
            FROM task_reminders tr
            JOIN tasks t ON tr.task_id = t.id
            WHERE tr.is_sent = FALSE
            AND tr.reminder_time <= NOW()
            AND t.status = 'pending'
        `);

        const notifications = [];

        for (const reminder of dueReminders) {
            const userId = reminder.assigned_to || reminder.created_by;
            if (userId) {
                // Create notification
                await pool.query(`
                    INSERT INTO persistent_notifications (user_id, type, title, message, related_task_id)
                    VALUES ($1, 'follow_up_due', $2, $3, $4)
                `, [userId, `Reminder: ${reminder.title}`, `Task scheduled for ${reminder.date}`, reminder.task_id]);

                // Mark reminder as sent
                await pool.query('UPDATE task_reminders SET is_sent = TRUE, sent_at = NOW() WHERE id = $1', [reminder.id]);

                notifications.push({ taskId: reminder.task_id, userId });
            }
        }

        res.json({ success: true, processedCount: notifications.length, notifications });
    } catch (error) {
        console.error('Error checking reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// Auto follow-up check (reschedule incomplete tasks from yesterday)
app.post('/api/tasks/auto-followup', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find incomplete tasks from yesterday
        const { rows: incompleteTasks } = await client.query(`
            SELECT t.*,
                COALESCE((SELECT json_agg(contact_id) FROM task_contacts WHERE task_id = t.id), '[]') as contact_ids,
                COALESCE((SELECT json_agg(claim_id) FROM task_claims WHERE task_id = t.id), '[]') as claim_ids
            FROM tasks t
            WHERE t.status = 'pending'
            AND t.date < CURRENT_DATE
            AND t.is_recurring = FALSE
        `);

        const rescheduled = [];

        for (const task of incompleteTasks) {
            // Mark as rescheduled
            await client.query(`UPDATE tasks SET status = 'rescheduled', updated_at = NOW() WHERE id = $1`, [task.id]);

            // Create new task for today
            const newTaskResult = await client.query(`
                INSERT INTO tasks (title, description, type, date, start_time, end_time,
                    assigned_to, assigned_by, parent_task_id, created_by)
                VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [task.title, task.description, task.type, task.start_time, task.end_time,
            task.assigned_to, task.assigned_by, task.id, task.assigned_to || task.created_by]);

            const newTaskId = newTaskResult.rows[0].id;

            // Copy contact links
            if (task.contact_ids && task.contact_ids.length > 0) {
                for (const contactId of task.contact_ids) {
                    await client.query(
                        'INSERT INTO task_contacts (task_id, contact_id) VALUES ($1, $2)',
                        [newTaskId, contactId]
                    );
                }
            }

            // Copy claim links
            if (task.claim_ids && task.claim_ids.length > 0) {
                for (const claimId of task.claim_ids) {
                    await client.query(
                        'INSERT INTO task_claims (task_id, claim_id) VALUES ($1, $2)',
                        [newTaskId, claimId]
                    );
                }
            }

            // Create notification
            const userId = task.assigned_to || task.created_by;
            if (userId) {
                await client.query(`
                    INSERT INTO persistent_notifications (user_id, type, title, message, related_task_id)
                    VALUES ($1, 'follow_up_due', $2, $3, $4)
                `, [userId, `Auto-rescheduled: ${task.title}`, 'Task was not completed and has been rescheduled to today', newTaskId]);
            }

            rescheduled.push({ originalId: task.id, newId: newTaskId, title: task.title });
        }

        await client.query('COMMIT');

        res.json({ success: true, rescheduledCount: rescheduled.length, rescheduled });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in auto-followup:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// Get combined timeline (calendar + CRM activities) for a contact
app.get('/api/contacts/:id/combined-timeline', async (req, res) => {
    try {
        const { id } = req.params;

        // Get tasks linked to this contact
        const tasksQuery = await pool.query(`
            SELECT t.id, t.title, t.type, t.status, t.date, t.start_time,
                'task' as item_type, t.created_at as timestamp
            FROM tasks t
            JOIN task_contacts tc ON t.id = tc.task_id
            WHERE tc.contact_id = $1
            ORDER BY t.date DESC
        `, [id]);

        // Get action logs
        const actionsQuery = await pool.query(`
            SELECT id, action_type as type, description as title, action_category,
                'action' as item_type, timestamp
            FROM action_logs
            WHERE client_id = $1
            ORDER BY timestamp DESC
            LIMIT 50
        `, [id]);

        // Get communications
        const commsQuery = await pool.query(`
            SELECT id, channel as type, subject as title, direction,
                'communication' as item_type, timestamp
            FROM communications
            WHERE client_id = $1
            ORDER BY timestamp DESC
            LIMIT 50
        `, [id]);

        // Combine and sort
        const timeline = [
            ...tasksQuery.rows,
            ...actionsQuery.rows,
            ...commsQuery.rows
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(timeline.slice(0, 100));
    } catch (error) {
        console.error('Error fetching combined timeline:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- SALES SIGNATURE ENDPOINTS ---

// Generate sales signature link for a specific case (manual override)
// Note: Token is auto-generated when claim status changes to "Sale"
app.post('/api/cases/:id/sales-signature-link', async (req, res) => {
    const { id } = req.params;

    try {
        // Generate random UUID token
        const { randomUUID } = await import('crypto');
        const token = randomUUID();

        // Update case with the token
        const result = await pool.query(
            'UPDATE cases SET sales_signature_token = $1 WHERE id = $2 RETURNING contact_id, lender',
            [token, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        // Build the link
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/intake/sales/${token}`;

        console.log(`📧 Generated sales signature link for case ${id} (${result.rows[0].lender}): ${link}`);

        res.json({ success: true, link, token, caseId: id, lender: result.rows[0].lender });
    } catch (error) {
        console.error('Error generating sales signature link:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve sales signature capture page (now looks up by case token)
app.get('/intake/sales/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Find case by sales_signature_token, then join with contact
        const caseRes = await pool.query(
            `SELECT c.id as case_id, c.lender, c.sales_signature_token,
                    cnt.id as contact_id, cnt.first_name, cnt.last_name, cnt.dob, cnt.email, cnt.phone,
                    cnt.address_line_1, cnt.address_line_2, cnt.city, cnt.state_county, cnt.postal_code,
                    cnt.previous_address_line_1, cnt.previous_address_line_2, cnt.previous_city,
                    cnt.previous_county, cnt.previous_postal_code,
                    cnt.previous_addresses
             FROM cases c
             JOIN contacts cnt ON c.contact_id = cnt.id
             WHERE c.sales_signature_token = $1`,
            [token]
        );

        if (caseRes.rows.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Invalid or Expired Link</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                            h1 { color: #EF4444; }
                            .container { background: white; padding: 40px; border-radius: 12px; max-width: 500px; margin: 0 auto; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>Invalid or Expired Link</h1>
                            <p>This link is not valid, has already been used, or has expired. Please contact Rowan Rose Solicitors for assistance.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        const record = caseRes.rows[0];
        const contact = {
            id: record.contact_id,
            first_name: record.first_name,
            last_name: record.last_name,
            dob: record.dob,
            email: record.email,
            phone: record.phone,
            address_line_1: record.address_line_1,
            address_line_2: record.address_line_2,
            city: record.city,
            state_county: record.state_county,
            postal_code: record.postal_code,
            intake_lender: record.lender
        };
        const caseId = record.case_id;
        const fullName = `${contact.first_name} ${contact.last_name}`;
        const dob = contact.dob ? new Date(contact.dob).toLocaleDateString('en-GB') : '';

        // Format current address
        const addressParts = [contact.address_line_1, contact.address_line_2, contact.city, contact.state_county].filter(Boolean);
        const fullAddress = addressParts.join(', ');

        // Format ALL previous addresses - check JSONB first, then legacy fields
        let allPreviousAddresses = [];

        // Parse previous_addresses JSONB if available
        let prevAddrsJson = record.previous_addresses;
        if (typeof prevAddrsJson === 'string') {
            try { prevAddrsJson = JSON.parse(prevAddrsJson); } catch { prevAddrsJson = null; }
        }
        if (prevAddrsJson && Array.isArray(prevAddrsJson) && prevAddrsJson.length > 0) {
            allPreviousAddresses = prevAddrsJson.map(pa => {
                const parts = [
                    pa.line1 || pa.address_line_1,
                    pa.line2 || pa.address_line_2,
                    pa.city,
                    pa.county || pa.state_county,
                    pa.postalCode || pa.postal_code
                ].filter(Boolean);
                return parts.join(', ');
            }).filter(addr => addr.length > 0);
        }

        // Fall back to legacy previous address fields if no JSONB data
        if (allPreviousAddresses.length === 0) {
            const prevAddressParts = [
                record.previous_address_line_1,
                record.previous_address_line_2,
                record.previous_city,
                record.previous_county,
                record.previous_postal_code
            ].filter(Boolean);
            if (prevAddressParts.length > 0) {
                allPreviousAddresses.push(prevAddressParts.join(', '));
            }
        }

        // Load Rowan Rose logo as base64
        let logoBase64 = '';
        try {
            const logoPath = path.join(__dirname, 'public', 'rowan-rose-logo.png');
            if (fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        } catch (e) {
            console.warn('Could not load rowan-rose-logo.png:', e.message);
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sign Authorization - ${fullName}</title>
                <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Lato', sans-serif;
                        min-height: 100vh;
                        background: #f8fafc;
                    }
                    .page-container {
                        display: flex;
                        min-height: 100vh;
                    }
                    /* Left Sidebar - Rowan Rose Branding */
                    .sidebar {
                        width: 380px;
                        background: linear-gradient(180deg, #0D1B2A 0%, #1B263B 100%);
                        padding: 50px 40px;
                        display: flex;
                        flex-direction: column;
                        position: fixed;
                        height: 100vh;
                        left: 0;
                        top: 0;
                    }
                    .logo-container {
                        margin-bottom: 40px;
                    }
                    .logo-container img {
                        max-width: 200px;
                        height: auto;
                    }
                    .sidebar-title {
                        font-family: 'Playfair Display', serif;
                        font-size: 28px;
                        font-weight: 600;
                        color: #ffffff;
                        margin-bottom: 20px;
                        line-height: 1.3;
                    }
                    .sidebar-text {
                        color: #94a3b8;
                        font-size: 15px;
                        line-height: 1.7;
                        margin-bottom: 30px;
                    }
                    .contact-details {
                        margin-top: auto;
                        padding-top: 30px;
                        border-top: 1px solid rgba(255,255,255,0.1);
                    }
                    .contact-item {
                        color: #cbd5e1;
                        font-size: 14px;
                        margin-bottom: 12px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .contact-item span { color: #F18F01; }
                    /* Right Content Area */
                    .main-content {
                        flex: 1;
                        margin-left: 380px;
                        padding: 40px 60px;
                        min-height: 100vh;
                        background: #ffffff;
                    }
                    .form-header {
                        margin-bottom: 30px;
                    }
                    .lender-badge {
                        display: inline-block;
                        background: linear-gradient(135deg, #1E3A5F, #0D1B2A);
                        color: #F18F01;
                        padding: 10px 20px;
                        border-radius: 25px;
                        font-weight: 700;
                        font-size: 14px;
                        margin-bottom: 20px;
                        letter-spacing: 0.5px;
                    }
                    .form-title {
                        font-family: 'Playfair Display', serif;
                        font-size: 32px;
                        font-weight: 600;
                        color: #0D1B2A;
                        margin-bottom: 10px;
                    }
                    .form-subtitle {
                        color: #64748b;
                        font-size: 16px;
                    }
                    /* Contact Info Grid */
                    .contact-info {
                        background: #f8fafc;
                        border-radius: 12px;
                        padding: 25px;
                        margin-bottom: 30px;
                        border: 1px solid #e2e8f0;
                    }
                    .info-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                    }
                    .info-item {
                        background: white;
                        padding: 15px 18px;
                        border-radius: 8px;
                        border: 1px solid #e2e8f0;
                    }
                    .info-label {
                        font-size: 11px;
                        color: #64748b;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 5px;
                    }
                    .info-value {
                        font-size: 16px;
                        color: #0D1B2A;
                        font-weight: 600;
                    }
                    .full-width { grid-column: 1 / -1; }
                    /* Signature Section */
                    .signature-section {
                        margin: 30px 0;
                    }
                    .signature-label {
                        font-size: 16px;
                        font-weight: 700;
                        color: #0D1B2A;
                        margin-bottom: 12px;
                    }
                    .signature-box {
                        border: 2px dashed #1E3A5F;
                        border-radius: 12px;
                        background: #fafafa;
                        position: relative;
                        height: 180px;
                        cursor: crosshair;
                        transition: all 0.2s;
                    }
                    .signature-box:hover {
                        border-color: #F18F01;
                        background: #fffbf5;
                    }
                    #signatureCanvas {
                        width: 100%;
                        height: 100%;
                        border-radius: 10px;
                    }
                    .clear-btn {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: #ef4444;
                        color: white;
                        border: none;
                        padding: 8px 14px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 600;
                    }
                    .signature-hint {
                        text-align: center;
                        color: #94a3b8;
                        font-size: 13px;
                        margin-top: 10px;
                    }
                    /* Consent */
                    .consent-text {
                        font-size: 13px;
                        color: #475569;
                        line-height: 1.8;
                        margin: 25px 0;
                        padding: 20px;
                        background: #f8fafc;
                        border-radius: 10px;
                        border-left: 4px solid #1E3A5F;
                    }
                    /* Links */
                    .doc-links {
                        display: flex;
                        gap: 20px;
                        margin: 20px 0;
                        justify-content: center;
                    }
                    .doc-link {
                        color: #1E3A5F;
                        text-decoration: none;
                        font-size: 14px;
                        font-weight: 600;
                        padding: 10px 20px;
                        border: 2px solid #1E3A5F;
                        border-radius: 8px;
                        transition: all 0.2s;
                    }
                    .doc-link:hover {
                        background: #1E3A5F;
                        color: white;
                    }
                    /* Submit Button */
                    .submit-btn {
                        width: 100%;
                        background: linear-gradient(135deg, #F18F01, #d97706);
                        color: white;
                        border: none;
                        padding: 18px;
                        border-radius: 12px;
                        font-size: 18px;
                        font-weight: 700;
                        cursor: pointer;
                        margin-top: 25px;
                        transition: all 0.3s ease;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .submit-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 25px rgba(241, 143, 1, 0.35);
                    }
                    /* States */
                    .loading, .success-message { display: none; text-align: center; padding: 60px 40px; }
                    .spinner {
                        width: 50px;
                        height: 50px;
                        border: 4px solid #e2e8f0;
                        border-top-color: #F18F01;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 20px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .success-icon { font-size: 70px; margin-bottom: 20px; }
                    .success-title { font-family: 'Playfair Display', serif; font-size: 28px; color: #059669; margin-bottom: 10px; }
                    .success-text { color: #64748b; font-size: 16px; }
                    .error-message {
                        background: #fef2f2;
                        color: #dc2626;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 15px;
                        display: none;
                        text-align: center;
                        font-weight: 500;
                    }
                    /* Mobile */
                    @media (max-width: 900px) {
                        .sidebar { display: none; }
                        .main-content { margin-left: 0; padding: 30px 20px; }
                        .info-grid { grid-template-columns: 1fr; }
                        .doc-links { flex-direction: column; align-items: center; }
                    }
                </style>
            </head>
            <body>
                <div class="page-container">
                    <!-- Left Sidebar -->
                    <div class="sidebar">
                        <div class="logo-container">
                            ${logoBase64 ? `<img src="${logoBase64}" alt="Rowan Rose Solicitors">` : '<div style="color:#fff;font-size:24px;font-weight:bold;">Rowan Rose</div>'}
                        </div>
                        <h2 class="sidebar-title">Authorisation for Claims Investigation</h2>
                        <p class="sidebar-text">
                            Please review your details and sign below to authorize Rowan Rose Solicitors to investigate potential claims on your behalf.
                        </p>
                        <div class="contact-details">
                            <div class="contact-item"><span>✉</span> info@fastactionclaims.co.uk</div>
                            <div class="contact-item"><span>☎</span> 0161 533 1706</div>
                            <div class="contact-item"><span>🌐</span> fastactionclaims.co.uk</div>
                        </div>
                    </div>
                    <!-- Right Content -->
                    <div class="main-content">
                        <div id="formContent">
                            <div class="form-header">
                                <div class="lender-badge">CLAIMS FORM : ${contact.intake_lender || ''}</div>
                                <h1 class="form-title">Hello, ${contact.first_name}!</h1>
                                <p class="form-subtitle">Please verify your details and provide your signature below.</p>
                            </div>
                            <div class="contact-info">
                                <div class="info-grid">
                                    <div class="info-item">
                                        <div class="info-label">First Name</div>
                                        <div class="info-value">${contact.first_name || '-'}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Last Name</div>
                                        <div class="info-value">${contact.last_name || '-'}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Date of Birth</div>
                                        <div class="info-value">${dob || '-'}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Postcode</div>
                                        <div class="info-value">${contact.postal_code || '-'}</div>
                                    </div>
                                    <div class="info-item full-width">
                                        <div class="info-label">Current Address</div>
                                        <div class="info-value">${fullAddress || '-'}</div>
                                    </div>
                                    ${allPreviousAddresses.length > 0 ? allPreviousAddresses.map((addr, idx) => `
                                    <div class="info-item full-width">
                                        <div class="info-label">Previous Address ${allPreviousAddresses.length > 1 ? (idx + 1) : ''}</div>
                                        <div class="info-value">${addr}</div>
                                    </div>
                                    `).join('') : ''}
                                </div>
                            </div>
                            <div class="signature-section">
                                <div class="signature-label">Sign Here:</div>
                                <div class="signature-box">
                                    <canvas id="signatureCanvas"></canvas>
                                    <button type="button" class="clear-btn" onclick="clearSignature()">Clear</button>
                                </div>
                                <div class="signature-hint">Please sign in the box above using your mouse or finger.</div>
                            </div>
                            <div class="consent-text">
                                By signing here you consent to us to look into any potential claim/claims on your behalf. We will share your information with Rowan Rose Solicitors, a UK law Firm who will be submitting your claim. Your information will be handled in accordance with the applicable privacy laws and professional standards. You consent to us sharing your information with a credit reference agency for verification and assessment purposes. You agree that your electronic signature may be used for each letter of authority and Conditional Fee Agreement applicable to your claim. Furthermore, you hereby agree to accept our Terms of Use, Disclaimers, and Privacy Policy. Your IP address will be stored in our database.
                            </div>
                            <div class="doc-links">
                                <a href="/terms%20and%20conditions.pdf" target="_blank" class="doc-link">Terms and Conditions</a>
                                <a href="/Privacy%20Policy.pdf" target="_blank" class="doc-link">Privacy Policy</a>
                            </div>
                            <div class="error-message" id="errorMessage"></div>
                            <button type="button" class="submit-btn" onclick="submitSignature()">Sign & Submit</button>
                        </div>
                        <div class="loading" id="loading">
                            <div class="spinner"></div>
                            <p>Submitting your signature...</p>
                        </div>
                        <div class="success-message" id="successMessage">
                            <div class="success-icon">✓</div>
                            <div class="success-title">Signature Submitted Successfully!</div>
                            <div class="success-text">Thank you. Your authorization has been recorded.</div>
                        </div>
                    </div>
                </div>
                <script>
                    const canvas = document.getElementById('signatureCanvas');
                    const ctx = canvas.getContext('2d');
                    let isDrawing = false;
                    let hasSignature = false;

                    function resizeCanvas() {
                        const rect = canvas.parentElement.getBoundingClientRect();
                        canvas.width = rect.width;
                        canvas.height = rect.height;
                        ctx.strokeStyle = '#1e293b';
                        ctx.lineWidth = 2;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                    }
                    resizeCanvas();
                    window.addEventListener('resize', resizeCanvas);

                    function getPos(e) {
                        const rect = canvas.getBoundingClientRect();
                        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                        return {
                            x: (clientX - rect.left) * (canvas.width / rect.width),
                            y: (clientY - rect.top) * (canvas.height / rect.height)
                        };
                    }

                    function startDrawing(e) {
                        e.preventDefault();
                        isDrawing = true;
                        const pos = getPos(e);
                        ctx.beginPath();
                        ctx.moveTo(pos.x, pos.y);
                    }

                    function draw(e) {
                        if (!isDrawing) return;
                        e.preventDefault();
                        hasSignature = true;
                        const pos = getPos(e);
                        ctx.lineTo(pos.x, pos.y);
                        ctx.stroke();
                    }

                    function stopDrawing() { isDrawing = false; }

                    canvas.addEventListener('mousedown', startDrawing);
                    canvas.addEventListener('mousemove', draw);
                    canvas.addEventListener('mouseup', stopDrawing);
                    canvas.addEventListener('mouseout', stopDrawing);
                    canvas.addEventListener('touchstart', startDrawing);
                    canvas.addEventListener('touchmove', draw);
                    canvas.addEventListener('touchend', stopDrawing);

                    function clearSignature() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        hasSignature = false;
                    }

                    async function submitSignature() {
                        if (!hasSignature) {
                            document.getElementById('errorMessage').textContent = 'Please sign in the box above before submitting.';
                            document.getElementById('errorMessage').style.display = 'block';
                            return;
                        }
                        const signatureData = canvas.toDataURL('image/png');
                        document.getElementById('formContent').style.display = 'none';
                        document.getElementById('loading').style.display = 'block';
                        document.getElementById('errorMessage').style.display = 'none';

                        try {
                            const response = await fetch('/api/submit-sales-signature', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ token: '${token}', caseId: '${caseId}', signatureData })
                            });
                            const result = await response.json();
                            if (result.success) {
                                document.getElementById('loading').style.display = 'none';
                                document.getElementById('successMessage').style.display = 'block';
                            } else {
                                throw new Error(result.message || 'Failed to submit signature');
                            }
                        } catch (error) {
                            document.getElementById('loading').style.display = 'none';
                            document.getElementById('formContent').style.display = 'block';
                            document.getElementById('errorMessage').textContent = error.message;
                            document.getElementById('errorMessage').style.display = 'block';
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error serving sales signature page:', error);
        res.status(500).send('Server error');
    }
});

// Submit sales signature - uploads as signature.png to S3 (now uses case token)
app.post('/api/submit-sales-signature', async (req, res) => {
    const { token, caseId, signatureData } = req.body;

    if (!token || !signatureData) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Find case by token, join with contact
        const caseRes = await pool.query(
            `SELECT c.id as case_id, c.lender, cnt.id as contact_id, cnt.first_name, cnt.last_name
             FROM cases c
             JOIN contacts cnt ON c.contact_id = cnt.id
             WHERE c.sales_signature_token = $1`,
            [token]
        );

        if (caseRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }

        const record = caseRes.rows[0];
        const contactId = record.contact_id;
        const actualCaseId = record.case_id;
        const folderPath = `${record.first_name}_${record.last_name}_${contactId}/`;

        // Add timestamp to signature
        const signatureBufferWithTimestamp = await addTimestampToSignature(signatureData);

        // Upload to S3 as signature.png (will replace existing)
        const signatureKey = `${folderPath}Signatures/signature.png`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: signatureKey,
            Body: signatureBufferWithTimestamp,
            ContentType: 'image/png'
        }));

        console.log(`[Sales Signature] Uploaded signature for contact ${contactId} (case ${actualCaseId}) to ${signatureKey}`);

        // Generate presigned URL
        const signatureUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: signatureKey }), { expiresIn: 604800 });

        // Update contact with signature URL
        await pool.query(
            'UPDATE contacts SET signature_url = $1 WHERE id = $2',
            [signatureUrl, contactId]
        );

        // Clear the token from the case (one-time use)
        await pool.query(
            'UPDATE cases SET sales_signature_token = NULL WHERE id = $1',
            [actualCaseId]
        );

        // Save to documents table - check if signature.png already exists
        const existingDoc = await pool.query(
            'SELECT id FROM documents WHERE contact_id = $1 AND name = $2',
            [contactId, 'signature.png']
        );

        if (existingDoc.rows.length > 0) {
            await pool.query(
                'UPDATE documents SET url = $1, updated_at = NOW() WHERE id = $2',
                [signatureUrl, existingDoc.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [contactId, 'signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Sales']]
            );
        }

        // Log the action
        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [contactId, actualCaseId, 'client', contactId, `${record.first_name} ${record.last_name}`, 'signature_captured', 'Document', `Signature captured via sales form for ${record.lender} claim`]
        );

        // Auto-complete: Mark acceptance/signature documents as Completed
        const sigCompleted = await pool.query(
            `UPDATE documents SET document_status = 'Completed', updated_at = NOW()
             WHERE contact_id = $1
               AND document_status IN ('Sent', 'Viewed')
               AND (name ILIKE '%signature%' OR name ILIKE '%acceptance%' OR tags @> ARRAY['Signature']::text[])
             RETURNING id, name`,
            [contactId]
        );
        for (const sd of sigCompleted.rows) {
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                 VALUES ($1, 'client', $1, 'Client', 'document_completed', 'documents', $2, $3, NOW())`,
                [contactId, `Signature captured - document "${sd.name}" marked Completed`, JSON.stringify({ document_id: sd.id, trigger: 'sales_signature' })]
            );
            await pool.query(
                `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW()
                 WHERE workflow_type = 'document_chase' AND metadata->>'document_id' = $1 AND status = 'active'`,
                [sd.id.toString()]
            );
        }

        res.json({ success: true, message: 'Signature submitted successfully' });

    } catch (error) {
        console.error('Error submitting sales signature:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// MICROSOFT GRAPH API - EMAIL INTEGRATION (OAuth2)
// ============================================================================

const msalConfig = {
    auth: {
        clientId: process.env.MS_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
        clientSecret: process.env.MS_CLIENT_SECRET,
    }
};

const msalClient = new msal.ConfidentialClientApplication(msalConfig);

// Email accounts to read via Graph API
const EMAIL_ACCOUNTS_CONFIG = [
    { id: 'acc-irl', email: 'irl@rowanrose.co.uk', displayName: 'Rowan Rose IRL', provider: 'office365', color: '#9333ea' },
    { id: 'acc-info', email: 'info@fastactionclaims.co.uk', displayName: 'FAC Info', provider: 'office365', color: '#2563eb' },
    { id: 'acc-dsar', email: 'Dsar@fastactionclaims.co.uk', displayName: 'FAC DSAR', provider: 'office365', color: '#059669' },
];

// Graph API folder name mapping
const GRAPH_FOLDER_MAP = {
    inbox: 'Inbox',
    drafts: 'Drafts',
    sent: 'SentItems',
    archive: 'Archive',
    trash: 'DeletedItems'
};

// Helper: Get access token for Microsoft Graph
async function getGraphToken() {
    const result = await msalClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    return result.accessToken;
}

// Helper: Call Microsoft Graph API
async function graphRequest(endpoint, options = {}) {
    const token = await getGraphToken();
    const url = `https://graph.microsoft.com/v1.0${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Graph API ${res.status}: ${errBody}`);
    }
    // For attachment downloads, return the raw response
    if (options.raw) return res;
    return res.json();
}

// --- GET EMAIL ACCOUNTS ---
app.get('/api/email/accounts', async (req, res) => {
    const accounts = [];
    for (const config of EMAIL_ACCOUNTS_CONFIG) {
        let isConnected = false;
        let unreadCount = 0;
        try {
            const data = await graphRequest(`/users/${config.email}/mailFolders/Inbox?$select=unreadItemCount,totalItemCount`);
            isConnected = true;
            unreadCount = data.unreadItemCount || 0;
        } catch (err) {
            console.error(`Graph API connection failed for ${config.email}:`, err.message);
        }
        accounts.push({
            id: config.id,
            email: config.email,
            displayName: config.displayName,
            provider: config.provider,
            isConnected,
            lastSyncAt: new Date().toISOString(),
            unreadCount,
            color: config.color,
        });
    }
    res.json({ success: true, accounts });
});

// --- GET FOLDERS FOR AN ACCOUNT ---
app.get('/api/email/accounts/:accountId/folders', async (req, res) => {
    const { accountId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // Fetch ALL folders from Microsoft Graph API (including subfolders)
        const data = await graphRequest(
            `/users/${config.email}/mailFolders?$top=100&$select=id,displayName,unreadItemCount,totalItemCount,parentFolderId,childFolderCount`
        );

        const folders = [];

        // Process top-level folders (these are the ones directly returned by mailFolders endpoint)
        for (const folder of (data.value || [])) {
            const folderData = {
                id: `${accountId}-${folder.id}`,
                accountId,
                name: folder.id, // Use Graph folder ID as the name for API calls
                displayName: folder.displayName,
                unreadCount: folder.unreadItemCount || 0,
                totalCount: folder.totalItemCount || 0,
                hasChildren: folder.childFolderCount > 0,
                parentId: null, // Top-level folders have no parent in our UI
            };
            folders.push(folderData);

            // Fetch child folders if any
            if (folder.childFolderCount > 0) {
                try {
                    const childData = await graphRequest(
                        `/users/${config.email}/mailFolders/${folder.id}/childFolders?$top=50&$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount`
                    );
                    for (const child of (childData.value || [])) {
                        folders.push({
                            id: `${accountId}-${child.id}`,
                            accountId,
                            name: child.id,
                            displayName: child.displayName,
                            unreadCount: child.unreadItemCount || 0,
                            totalCount: child.totalItemCount || 0,
                            hasChildren: child.childFolderCount > 0,
                            parentId: folder.id, // Child folders reference their parent's Graph ID
                            parentDisplayName: folder.displayName,
                        });
                    }
                } catch (childErr) {
                    console.warn(`Failed to fetch child folders for ${folder.displayName}:`, childErr.message);
                }
            }
        }

        res.json({ success: true, folders });
    } catch (err) {
        console.error(`Graph folder fetch failed for ${config.email}:`, err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch folders: ' + err.message });
    }
});

// --- GET EMAILS IN A FOLDER ---
app.get('/api/email/accounts/:accountId/folders/:folderName/messages', async (req, res) => {
    const { accountId, folderName } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    // Support both old hardcoded folder names and new Graph folder IDs
    const graphFolder = GRAPH_FOLDER_MAP[folderName] || folderName;

    try {
        const data = await graphRequest(
            `/users/${config.email}/mailFolders/${graphFolder}/messages` +
            `?$top=${limit}&$orderby=receivedDateTime desc` +
            `&$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,isRead,flag,isDraft,hasAttachments,conversationId`
        );

        const emails = (data.value || []).map(msg => ({
            id: msg.id,
            uid: undefined,
            accountId,
            folderId: `${accountId}-${folderName}`,
            from: {
                email: msg.from?.emailAddress?.address || '',
                name: msg.from?.emailAddress?.name || null,
            },
            to: (msg.toRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name || null,
            })),
            cc: (msg.ccRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name || null,
            })),
            subject: msg.subject || '(No Subject)',
            bodyText: msg.bodyPreview || '',
            receivedAt: msg.receivedDateTime || new Date().toISOString(),
            isRead: msg.isRead || false,
            isStarred: msg.flag?.flagStatus === 'flagged',
            isDraft: msg.isDraft || false,
            hasAttachments: msg.hasAttachments || false,
            threadId: msg.conversationId || undefined,
        }));

        res.json({ success: true, emails });
    } catch (err) {
        console.error(`Graph message fetch failed for ${config.email}/${folderName}:`, err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch messages: ' + err.message });
    }
});

// --- GET SINGLE EMAIL WITH FULL BODY ---
app.get('/api/email/accounts/:accountId/messages/:messageId', async (req, res) => {
    const { accountId, messageId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // Fetch full message with body and attachments list
        const msg = await graphRequest(
            `/users/${config.email}/messages/${messageId}` +
            `?$select=id,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead,flag,isDraft,hasAttachments,conversationId` +
            `&$expand=attachments`
        );

        // Mark as read if not already
        if (!msg.isRead) {
            graphRequest(`/users/${config.email}/messages/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ isRead: true }),
            }).catch(err => console.error('Failed to mark as read:', err.message));
        }

        const attachments = (msg.attachments || []).map(att => ({
            id: att.id,
            filename: att.name || 'attachment',
            mimeType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
            isInline: att.isInline || false,
            contentId: att.contentId || null,
        }));

        const email = {
            id: msg.id,
            accountId,
            folderId: `${accountId}-inbox`,
            from: {
                email: msg.from?.emailAddress?.address || '',
                name: msg.from?.emailAddress?.name || null,
            },
            to: (msg.toRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name || null,
            })),
            cc: (msg.ccRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name || null,
            })),
            subject: msg.subject || '(No Subject)',
            bodyText: msg.bodyPreview || '',
            bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : undefined,
            receivedAt: msg.receivedDateTime || new Date().toISOString(),
            isRead: true,
            isStarred: msg.flag?.flagStatus === 'flagged',
            isDraft: msg.isDraft || false,
            hasAttachments: attachments.length > 0,
            attachments: attachments.length > 0 ? attachments : undefined,
            threadId: msg.conversationId || undefined,
        };

        // If body is text-only, put it in bodyText
        if (msg.body?.contentType === 'text') {
            email.bodyText = msg.body.content || msg.bodyPreview || '';
        }

        res.json({ success: true, email });
    } catch (err) {
        console.error('Graph message detail fetch failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch message: ' + err.message });
    }
});

// --- GET THREAD MESSAGES (all messages in a conversation) ---
app.get('/api/email/accounts/:accountId/threads/:conversationId/messages', async (req, res) => {
    const { accountId, conversationId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // Fetch message IDs in the conversation (filter + expand together causes InefficientFilter error)
        const data = await graphRequest(
            `/users/${config.email}/messages` +
            `?$filter=conversationId eq '${conversationId}'` +
            `&$select=id,receivedDateTime` +
            `&$top=50`
        );

        // Sort by date ascending (server-side since $orderby + $filter is too complex for Graph)
        const sorted = (data.value || []).sort((a, b) =>
            new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime()
        );

        // Fetch full details for each message (including body and attachments)
        const fullMessages = await Promise.all(
            sorted.map(stub =>
                graphRequest(
                    `/users/${config.email}/messages/${stub.id}` +
                    `?$select=id,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,isRead,flag,isDraft,hasAttachments,conversationId` +
                    `&$expand=attachments`
                )
            )
        );

        const emails = fullMessages.map(msg => {
            const attachments = (msg.attachments || []).map(att => ({
                id: att.id,
                filename: att.name || 'attachment',
                mimeType: att.contentType || 'application/octet-stream',
                size: att.size || 0,
                isInline: att.isInline || false,
                contentId: att.contentId || null,
            }));

            return {
                id: msg.id,
                accountId,
                folderId: `${accountId}-inbox`,
                from: {
                    email: msg.from?.emailAddress?.address || '',
                    name: msg.from?.emailAddress?.name || null,
                },
                to: (msg.toRecipients || []).map(r => ({
                    email: r.emailAddress?.address || '',
                    name: r.emailAddress?.name || null,
                })),
                cc: (msg.ccRecipients || []).map(r => ({
                    email: r.emailAddress?.address || '',
                    name: r.emailAddress?.name || null,
                })),
                subject: msg.subject || '(No Subject)',
                bodyText: msg.bodyPreview || '',
                bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : (msg.body?.contentType === 'text' ? undefined : undefined),
                receivedAt: msg.receivedDateTime || new Date().toISOString(),
                isRead: msg.isRead || false,
                isStarred: msg.flag?.flagStatus === 'flagged',
                isDraft: msg.isDraft || false,
                hasAttachments: attachments.length > 0,
                attachments: attachments.length > 0 ? attachments : undefined,
                threadId: msg.conversationId || undefined,
            };
        });

        res.json({ success: true, emails });
    } catch (err) {
        console.error('Graph thread fetch failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch thread: ' + err.message });
    }
});

// --- MARK EMAIL AS READ/UNREAD ---
app.put('/api/email/accounts/:accountId/messages/:messageId/read', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { isRead } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ isRead: !!isRead }),
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph flag update failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update read status: ' + err.message });
    }
});

// --- DOWNLOAD EMAIL ATTACHMENT ---
app.get('/api/email/accounts/:accountId/messages/:messageId/attachments/:attachmentId', async (req, res) => {
    const { accountId, messageId, attachmentId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const att = await graphRequest(
            `/users/${config.email}/messages/${messageId}/attachments/${attachmentId}`
        );

        if (!att.contentBytes) {
            return res.status(404).json({ success: false, error: 'Attachment content not found' });
        }

        const buffer = Buffer.from(att.contentBytes, 'base64');
        const contentType = att.contentType || 'application/octet-stream';
        const filename = att.name || 'attachment';

        // Use inline disposition for previewable types (PDF, images, text) so they render in-browser
        // Use ?download=true query param to force download when needed
        const forceDownload = req.query.download === 'true';
        const previewableTypes = ['application/pdf', 'image/', 'text/'];
        const isPreviewable = previewableTypes.some(t => contentType.startsWith(t));
        const disposition = (!forceDownload && isPreviewable) ? 'inline' : 'attachment';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `${disposition}; filename="${filename}"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (err) {
        console.error('Attachment download failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to download attachment: ' + err.message });
    }
});

// --- DOWNLOAD EMAIL AS MIME (EML) ---
app.get('/api/email/accounts/:accountId/messages/:messageId/download', async (req, res) => {
    const { accountId, messageId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // Get message subject for filename first
        const msg = await graphRequest(
            `/users/${config.email}/messages/${messageId}?$select=subject,receivedDateTime`
        );

        // Fetch the email in MIME format using raw fetch
        const token = await getGraphToken();
        const mimeRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${config.email}/messages/${messageId}/$value`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (!mimeRes.ok) {
            throw new Error(`Graph API ${mimeRes.status}: ${await mimeRes.text()}`);
        }

        const mimeContent = await mimeRes.text();

        // Create a safe filename from subject
        const subject = (msg.subject || 'email').replace(/[^a-zA-Z0-9\s-]/g, '').substring(0, 50).trim();
        const date = new Date(msg.receivedDateTime).toISOString().split('T')[0];
        const filename = `${subject}_${date}.eml`;

        res.set({
            'Content-Type': 'message/rfc822',
            'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.send(mimeContent);
    } catch (err) {
        console.error('Email download failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to download email: ' + err.message });
    }
});

// --- DELETE EMAIL ---
app.delete('/api/email/accounts/:accountId/messages/:messageId', async (req, res) => {
    const { accountId, messageId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}`, {
            method: 'DELETE',
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph delete message failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to delete email: ' + err.message });
    }
});

// --- TOGGLE EMAIL FLAG (Star/Unflag) ---
app.patch('/api/email/accounts/:accountId/messages/:messageId/flag', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { flagStatus } = req.body; // 'flagged' or 'notFlagged'
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                flag: {
                    flagStatus: flagStatus || 'notFlagged'
                }
            }),
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph flag update failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update flag: ' + err.message });
    }
});

// --- MOVE EMAIL TO FOLDER (Archive, etc.) ---
app.post('/api/email/accounts/:accountId/messages/:messageId/move', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { destinationFolderId } = req.body; // The Graph folder ID to move to
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const result = await graphRequest(`/users/${config.email}/messages/${messageId}/move`, {
            method: 'POST',
            body: JSON.stringify({ destinationId: destinationFolderId }),
        });
        res.json({ success: true, newMessageId: result.id });
    } catch (err) {
        console.error('Graph move message failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to move email: ' + err.message });
    }
});

// --- GET ARCHIVE FOLDER ID ---
app.get('/api/email/accounts/:accountId/folders/archive', async (req, res) => {
    const { accountId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // First try to find Archive folder by well-known name
        const data = await graphRequest(
            `/users/${config.email}/mailFolders?$filter=displayName eq 'Archive'&$select=id,displayName`
        );

        if (data.value && data.value.length > 0) {
            res.json({ success: true, folderId: data.value[0].id });
        } else {
            // Archive folder doesn't exist - could create one or return error
            res.status(404).json({ success: false, error: 'Archive folder not found' });
        }
    } catch (err) {
        console.error('Graph get archive folder failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to get archive folder: ' + err.message });
    }
});

// ============================================================================
// TEMPLATE MANAGEMENT ENDPOINTS
// ============================================================================

// POST /api/templates/upload-url - Get presigned URL for template file upload to S3
app.post('/api/templates/upload-url', async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        if (!fileName || !contentType) {
            return res.status(400).json({ success: false, message: 'fileName and contentType are required' });
        }

        const s3Key = `templates/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        res.json({ success: true, uploadUrl, s3Key });
    } catch (err) {
        console.error('Error generating template upload URL:', err);
        res.status(500).json({ success: false, message: 'Could not generate upload URL' });
    }
});

// ============================================
// TEMPLATE METADATA CRUD (persisted to templates-store.json)
// ============================================
const TEMPLATES_STORE_PATH = path.join(__dirname, 'templates-store.json');

function readTemplatesStore() {
    try {
        const data = fs.readFileSync(TEMPLATES_STORE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeTemplatesStore(templates) {
    fs.writeFileSync(TEMPLATES_STORE_PATH, JSON.stringify(templates, null, 2), 'utf-8');
}

// GET /api/templates - List all templates
app.get('/api/templates', (req, res) => {
    try {
        const templates = readTemplatesStore();
        res.json({ success: true, templates });
    } catch (err) {
        console.error('[Templates] Error reading templates:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load templates' });
    }
});

// POST /api/templates - Create a new template
app.post('/api/templates', (req, res) => {
    try {
        const templates = readTemplatesStore();
        const newTemplate = {
            id: req.body.id || `t${Date.now()}`,
            name: req.body.name || 'Untitled Template',
            category: req.body.category || 'General',
            description: req.body.description || '',
            content: req.body.content || '',
            lastModified: req.body.lastModified || new Date().toISOString().split('T')[0],
            customVariables: req.body.customVariables || [],
        };
        templates.unshift(newTemplate);
        writeTemplatesStore(templates);
        res.json({ success: true, template: newTemplate });
    } catch (err) {
        console.error('[Templates] Error creating template:', err.message);
        res.status(500).json({ success: false, message: 'Failed to create template' });
    }
});

// PUT /api/templates/:id - Update a template
app.put('/api/templates/:id', (req, res) => {
    try {
        const templates = readTemplatesStore();
        const idx = templates.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ success: false, message: 'Template not found' });
        templates[idx] = {
            ...templates[idx],
            name: req.body.name ?? templates[idx].name,
            category: req.body.category ?? templates[idx].category,
            description: req.body.description ?? templates[idx].description,
            content: req.body.content ?? templates[idx].content,
            lastModified: new Date().toISOString().split('T')[0],
            customVariables: req.body.customVariables ?? templates[idx].customVariables,
        };
        writeTemplatesStore(templates);
        res.json({ success: true, template: templates[idx] });
    } catch (err) {
        console.error('[Templates] Error updating template:', err.message);
        res.status(500).json({ success: false, message: 'Failed to update template' });
    }
});

// DELETE /api/templates/:id - Delete a template
app.delete('/api/templates/:id', (req, res) => {
    try {
        let templates = readTemplatesStore();
        const before = templates.length;
        templates = templates.filter(t => t.id !== req.params.id);
        if (templates.length === before) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        writeTemplatesStore(templates);
        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        console.error('[Templates] Error deleting template:', err.message);
        res.status(500).json({ success: false, message: 'Failed to delete template' });
    }
});

// POST /api/templates/upload - Upload template file via multer (alternative to presigned URL)
app.post('/api/templates/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: 'No file provided' });

        const s3Key = `templates/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
        });
        await s3Client.send(command);

        // Generate download URL
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        const downloadUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 604800 });

        res.json({
            success: true,
            s3Key,
            downloadUrl,
            fileName: file.originalname,
            fileSize: file.size,
            contentType: file.mimetype,
        });
    } catch (err) {
        console.error('Error uploading template file:', err);
        res.status(500).json({ success: false, message: 'Failed to upload template file' });
    }
});

// GET /api/templates/:s3Key/download-url - Get presigned download URL for a template file
app.get('/api/templates/download-url', async (req, res) => {
    try {
        const { s3Key } = req.query;
        if (!s3Key) return res.status(400).json({ success: false, message: 's3Key query parameter is required' });

        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        res.json({ success: true, downloadUrl });
    } catch (err) {
        console.error('Error generating template download URL:', err);
        res.status(500).json({ success: false, message: 'Could not generate download URL' });
    }
});

// POST /api/templates/generate-pdf - Generate a PDF with overlay fields merged
// Accepts: { s3Key (original PDF), fields (overlay field definitions), variableValues (resolved values) }
app.post('/api/templates/generate-pdf', async (req, res) => {
    try {
        const { s3Key, fields, variableValues } = req.body;

        if (!s3Key || !fields) {
            return res.status(400).json({ success: false, message: 's3Key and fields are required' });
        }

        // 1. Download original PDF from S3
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        const s3Response = await s3Client.send(getCmd);
        const chunks = [];
        for await (const chunk of s3Response.Body) {
            chunks.push(chunk);
        }
        const pdfBytes = Buffer.concat(chunks);

        // 2. Use pdf-lib to overlay field values
        // Dynamic import for ESM compatibility
        const { PDFDocument: PdfLibDoc, rgb, StandardFonts } = await import('pdf-lib');
        const pdfDoc = await PdfLibDoc.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        for (const field of fields) {
            const pageIndex = (field.page || 0);
            if (pageIndex >= pages.length) continue;
            const page = pages[pageIndex];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            // Convert percentage to absolute coordinates
            const x = (field.x / 100) * pageWidth;
            // PDF Y is bottom-up, our Y is top-down percentage
            const fieldH = (field.height / 100) * pageHeight;
            const y = pageHeight - ((field.y / 100) * pageHeight) - fieldH;

            const value = (field.variableKey && variableValues?.[field.variableKey])
                || field.textContent
                || field.value
                || '';

            if (field.type === 'text' || field.type === 'variable' || field.type === 'text_input' || field.type === 'text_block') {
                if (value) {
                    const fontSize = field.fontSize || 11;
                    page.drawText(String(value), {
                        x: x + 2,
                        y: y + fieldH / 2 - fontSize / 3,
                        size: fontSize,
                        font: field.isBold ? fontBold : font,
                        color: rgb(0, 0, 0),
                    });
                }
            } else if (field.type === 'date') {
                const dateValue = value || new Date().toLocaleDateString('en-GB');
                page.drawText(dateValue, {
                    x: x + 2,
                    y: y + fieldH / 2 - 4,
                    size: 11,
                    font,
                    color: rgb(0, 0, 0),
                });
            } else if (field.type === 'checkbox') {
                if (value === 'true' || value === 'yes' || value === '1') {
                    const checkSize = Math.min((field.width / 100) * pageWidth, fieldH) * 0.7;
                    page.drawText('✓', {
                        x: x + 2,
                        y: y + 2,
                        size: checkSize,
                        font,
                        color: rgb(0, 0, 0),
                    });
                }
            } else if (field.type === 'signature') {
                // If value is base64 PNG signature image
                if (value && value.startsWith('data:image/png')) {
                    try {
                        const base64Data = value.replace(/^data:image\/png;base64,/, '');
                        const sigImage = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'));
                        const sigWidth = (field.width / 100) * pageWidth;
                        page.drawImage(sigImage, {
                            x,
                            y,
                            width: sigWidth,
                            height: fieldH,
                        });
                    } catch (sigErr) {
                        console.warn('Could not embed signature image:', sigErr.message);
                    }
                } else if (value) {
                    // Fallback: draw signature as text
                    page.drawText(value, {
                        x: x + 2,
                        y: y + fieldH / 2 - 5,
                        size: 14,
                        font,
                        color: rgb(0, 0, 0.6),
                    });
                }
            }
        }

        // 3. Save the final PDF
        const finalPdfBytes = await pdfDoc.save();

        // 4. Upload generated document to S3
        const outputKey = `documents/generated/template-${Date.now()}.pdf`;
        const putCmd = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: outputKey,
            Body: Buffer.from(finalPdfBytes),
            ContentType: 'application/pdf',
        });
        await s3Client.send(putCmd);

        // 5. Generate download URL for the output
        const dlCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: outputKey });
        const downloadUrl = await getSignedUrl(s3Client, dlCmd, { expiresIn: 604800 });

        res.json({
            success: true,
            s3Key: outputKey,
            downloadUrl,
            size: finalPdfBytes.length,
        });
    } catch (err) {
        console.error('Error generating PDF from template:', err);
        res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + err.message });
    }
});

// ============================================================================
// DOCX CONVERSION HELPERS
// ============================================================================

/**
 * Find LibreOffice installation on the system.
 * Returns the path to soffice/libreoffice binary, or null if not found.
 */
async function findLibreOffice() {
    const candidates = process.platform === 'win32'
        ? [
            'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        ]
        : ['/usr/bin/libreoffice', '/usr/bin/soffice', '/usr/local/bin/libreoffice', '/usr/local/bin/soffice'];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    // Try PATH lookup
    try {
        const cmd = process.platform === 'win32' ? 'where soffice 2>nul' : 'which libreoffice 2>/dev/null || which soffice 2>/dev/null';
        const result = await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 5000 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout.trim().split('\n')[0]);
            });
        });
        if (result && fs.existsSync(result)) return result;
    } catch { /* not found in PATH */ }

    return null;
}

/**
 * Convert DOCX buffer to target format using LibreOffice headless.
 * @param {Buffer} docxBuffer - the raw DOCX file
 * @param {string} outputFormat - 'pdf' or 'html'
 * @param {string} libreOfficePath - path to soffice binary
 * @returns {Promise<Buffer>} converted file buffer
 */
async function convertWithLibreOffice(docxBuffer, outputFormat, libreOfficePath) {
    const tmpDir = path.join(os.tmpdir(), `docx-convert-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const docxPath = path.join(tmpDir, 'document.docx');
    fs.writeFileSync(docxPath, docxBuffer);

    await new Promise((resolve, reject) => {
        exec(
            `"${libreOfficePath}" --headless --convert-to ${outputFormat} --outdir "${tmpDir}" "${docxPath}"`,
            { timeout: 60000 },
            (error, stdout, stderr) => {
                if (error) reject(new Error(`LibreOffice conversion failed: ${stderr || error.message}`));
                else resolve(stdout);
            }
        );
    });

    const outputPath = path.join(tmpDir, `document.${outputFormat}`);
    if (!fs.existsSync(outputPath)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        throw new Error(`LibreOffice produced no output file at ${outputPath}`);
    }
    const outputBuffer = fs.readFileSync(outputPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return outputBuffer;
}

/**
 * Fallback: Convert DOCX to PDF using mammoth (HTML extraction) + Puppeteer (HTML to PDF).
 * This preserves less layout than LibreOffice but works without extra system dependencies.
 */
async function convertDocxToPdfWithPuppeteer(docxBuffer) {
    // Step 1: Extract HTML via mammoth (with alignment preservation)
    const htmlBody = await convertDocxToHtmlWithMammoth(docxBuffer);

    // Step 2: Render to PDF via Puppeteer with A4 page format
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page { size: A4; margin: 25mm; }
    * { box-sizing: border-box; }
    body {
        font-family: 'Times New Roman', 'Georgia', serif;
        font-size: 12pt;
        line-height: 1.5;
        margin: 0;
        padding: 0;
        color: #000;
    }
    h1 { font-size: 18pt; margin: 0.5em 0; }
    h2 { font-size: 14pt; margin: 0.5em 0; }
    h3 { font-size: 12pt; font-weight: bold; margin: 0.5em 0; }
    p { margin: 0.3em 0; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    td, th { border: 1px solid #ccc; padding: 4px 8px; vertical-align: top; }
    th { background: #f5f5f5; font-weight: bold; }
    /* Layout tables (used for letterhead, side-by-side content) - no visible borders */
    table.layout-table { border: none; margin: 0; }
    table.layout-table td, table.layout-table th { border: none; padding: 0 8px; }
    ul, ol { padding-left: 1.5em; }
    a { color: #0563C1; text-decoration: underline; }
</style>
</head>
<body>${htmlBody}</body>
</html>`;

    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '25mm', right: '25mm', bottom: '25mm', left: '25mm' },
    });

    await browser.close();
    return Buffer.from(pdfBuffer);
}

/**
 * Fallback: Convert DOCX to HTML using mammoth (server-side).
 * Enhanced with DOCX XML parsing to preserve image sizes, paragraph alignment,
 * indentation, and table column widths that mammoth normally discards.
 * Returns the HTML body string.
 */
async function convertDocxToHtmlWithMammoth(docxBuffer) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(docxBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string') || '';

    // ── 1. Parse image sizes from DOCX XML (EMU → px) ──
    const imageSizes = [];
    const drawingRegex = /<(?:wp:inline|wp:anchor)\b[\s\S]*?<\/(?:wp:inline|wp:anchor)>/g;
    let drawMatch;
    while ((drawMatch = drawingRegex.exec(docXml)) !== null) {
        const block = drawMatch[0];
        const extMatch = block.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/);
        if (extMatch) {
            // 914400 EMU = 1 inch = 96px
            const wPx = Math.round(parseInt(extMatch[1]) / 914400 * 96);
            const hPx = Math.round(parseInt(extMatch[2]) / 914400 * 96);
            imageSizes.push({ width: wPx, height: hPx });
        }
    }

    // ── 2. Parse table column widths ──
    // Tables in DOCX use <w:tblGrid><w:gridCol w:w="..." /> to define column widths (in twips)
    const tableGrids = [];
    const tblGridRegex = /<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g;
    let gridMatch;
    while ((gridMatch = tblGridRegex.exec(docXml)) !== null) {
        const cols = [];
        const colRegex = /<w:gridCol\s+w:w="(\d+)"/g;
        let colMatch;
        while ((colMatch = colRegex.exec(gridMatch[1])) !== null) {
            // Twips to mm: 1 twip = 1/1440 inch = 25.4/1440 mm ≈ 0.01764 mm
            cols.push(Math.round(parseInt(colMatch[1]) / 1440 * 25.4));
        }
        tableGrids.push(cols);
    }

    // ── 3. Parse table cell borders/properties to detect layout tables (no visible borders) ──
    // Check if a table has all borders set to "none" or "nil" — if so, it's a layout table
    const layoutTableIndices = new Set();
    const tableRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    let tblIdx = 0;
    let tblMatch;
    while ((tblMatch = tableRegex.exec(docXml)) !== null) {
        const tblXml = tblMatch[0];
        const hasBorders = /<w:tblBorders>/.test(tblXml);
        if (hasBorders) {
            const borderNoneCount = (tblXml.match(/<w:(?:top|left|bottom|right|insideH|insideV)\s+[^>]*w:val="(?:none|nil)"/g) || []).length;
            if (borderNoneCount >= 4) {
                layoutTableIndices.add(tblIdx);
            }
        }
        tblIdx++;
    }

    // ── 4. Extract text box content (mammoth drops <w:txbxContent>) ──
    // Text boxes in DOCX are inside <w:txbxContent> (floating text frames).
    // Mammoth ignores them entirely, so we extract the text ourselves.
    function extractHtmlFromDocxParagraphs(xmlFragment) {
        const lines = [];
        const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
        let pm;
        while ((pm = pRegex.exec(xmlFragment)) !== null) {
            const pBody = pm[1];
            const texts = [];
            const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
            let rm;
            while ((rm = runRegex.exec(pBody)) !== null) {
                const runBody = rm[1];
                const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
                let tm;
                while ((tm = tRegex.exec(runBody)) !== null) {
                    let text = tm[1];
                    const isBold = /<w:b[\s/>]/.test(runBody) && !/<w:b\s+w:val="(?:0|false)"/.test(runBody);
                    const isItalic = /<w:i[\s/>]/.test(runBody) && !/<w:i\s+w:val="(?:0|false)"/.test(runBody);
                    const isUnderline = /<w:u\s/.test(runBody) && !/<w:u\s+w:val="none"/.test(runBody);
                    if (isBold) text = `<strong>${text}</strong>`;
                    if (isItalic) text = `<em>${text}</em>`;
                    if (isUnderline) text = `<u>${text}</u>`;
                    texts.push(text);
                }
            }
            if (texts.length > 0) {
                const alignMatch = pBody.match(/<w:jc\s+w:val="(\w+)"/);
                const a = alignMatch ? alignMatch[1] : '';
                let style = '';
                if (a === 'right') style = ' style="text-align:right"';
                else if (a === 'center') style = ' style="text-align:center"';
                else if (a === 'both') style = ' style="text-align:justify"';
                lines.push(`<p${style}>${texts.join('')}</p>`);
            }
        }
        return lines.join('\n');
    }

    // Extract text boxes from document body
    const textBoxHtmlParts = [];
    const txbxRegex = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g;
    let txbxMatch;
    while ((txbxMatch = txbxRegex.exec(docXml)) !== null) {
        const tbHtml = extractHtmlFromDocxParagraphs(txbxMatch[1]);
        if (tbHtml.trim()) textBoxHtmlParts.push(tbHtml);
    }

    // ── 4b. Extract header/footer content from DOCX ZIP ──
    const headerFooterHtml = { headers: [], footers: [] };
    const zipFiles = Object.keys(zip.files);
    for (const fname of zipFiles) {
        if (/^word\/header\d*\.xml$/i.test(fname)) {
            const hdrXml = await zip.file(fname)?.async('string') || '';
            const hHtml = extractHtmlFromDocxParagraphs(hdrXml);
            if (hHtml.trim()) headerFooterHtml.headers.push(hHtml);
        }
        if (/^word\/footer\d*\.xml$/i.test(fname)) {
            const ftrXml = await zip.file(fname)?.async('string') || '';
            const fHtml = extractHtmlFromDocxParagraphs(ftrXml);
            if (fHtml.trim()) headerFooterHtml.footers.push(fHtml);
        }
    }

    // ── 5. Parse paragraph spacing from DOCX XML ──
    // Extract spacing (before, after, line height) from each <w:p> in <w:body>.
    // Values: before/after in twips (1/20 pt), line in 240ths with lineRule.
    const paraSpacingFromXml = [];
    const bodyXmlMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
    if (bodyXmlMatch) {
        const bodyContent = bodyXmlMatch[1];
        const wpRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
        let wpMatch;
        while ((wpMatch = wpRegex.exec(bodyContent)) !== null) {
            const pContent = wpMatch[1];
            const spacing = { before: 0, after: 0, line: 0, lineRule: '' };
            const spacingTagMatch = pContent.match(/<w:spacing\s+([^/>]*)\/?>/);
            if (spacingTagMatch) {
                const attrs = spacingTagMatch[1];
                const bMatch = attrs.match(/w:before="(\d+)"/);
                const aMatch = attrs.match(/w:after="(\d+)"/);
                const lMatch = attrs.match(/w:line="(\d+)"/);
                const lrMatch = attrs.match(/w:lineRule="(\w+)"/);
                if (bMatch) spacing.before = parseInt(bMatch[1]);
                if (aMatch) spacing.after = parseInt(aMatch[1]);
                if (lMatch) spacing.line = parseInt(lMatch[1]);
                if (lrMatch) spacing.lineRule = lrMatch[1];
            }
            paraSpacingFromXml.push(spacing);
        }
    }

    // ── 6. Collect paragraph alignment via mammoth's transformDocument ──
    const paragraphMeta = [];

    const result = await mammoth.convertToHtml({
        buffer: Buffer.from(docxBuffer),
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
            "b => strong",
            "i => em",
            "u => u",
            "strike => s",
        ],
        convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
                return {
                    src: "data:" + image.contentType + ";base64," + imageBuffer,
                };
            });
        }),
        transformDocument: function(document) {
            function walkElements(element) {
                if (element.type === 'paragraph') {
                    paragraphMeta.push({
                        alignment: element.alignment || null,
                        indent: element.indent || null,
                    });
                }
                if (element.children) {
                    element.children.forEach(walkElements);
                }
            }
            walkElements(document);
            return document;
        },
    });

    let html = result.value;

    // ── 7. Post-process: inject paragraph alignment, indentation & spacing ──
    let paraIndex = 0;
    html = html.replace(/<(p|h[1-6])((?:\s+[^>]*)?)>/gi, (match, tag, attrs) => {
        if (paraIndex >= paragraphMeta.length) return match;
        const meta = paragraphMeta[paraIndex];
        const spacing = paraSpacingFromXml[paraIndex] || { before: 0, after: 0, line: 0, lineRule: '' };
        paraIndex++;
        const styles = [];

        // Alignment
        if (meta.alignment && meta.alignment !== 'left') {
            const align = meta.alignment === 'both' ? 'justify' : meta.alignment;
            styles.push(`text-align:${align}`);
        }
        // Indentation
        if (meta.indent) {
            const start = parseInt(meta.indent.start, 10) || parseInt(meta.indent.left, 10) || 0;
            const end = parseInt(meta.indent.end, 10) || parseInt(meta.indent.right, 10) || 0;
            const firstLine = parseInt(meta.indent.firstLine, 10) || 0;
            if (start > 0) styles.push(`margin-left:${Math.round(start / 1440 * 25.4)}mm`);
            if (end > 0) styles.push(`margin-right:${Math.round(end / 1440 * 25.4)}mm`);
            if (firstLine > 0) styles.push(`text-indent:${Math.round(firstLine / 1440 * 25.4)}mm`);
        }
        // Spacing before/after (twips → pt: divide by 20)
        if (spacing.before > 0) {
            styles.push(`margin-top:${(spacing.before / 20).toFixed(1)}pt`);
        }
        if (spacing.after > 0) {
            styles.push(`margin-bottom:${(spacing.after / 20).toFixed(1)}pt`);
        }
        // Line spacing
        if (spacing.line > 0) {
            if (spacing.lineRule === 'auto' || spacing.lineRule === '') {
                // Auto: value is in 240ths of a line (240=single, 276=1.15, 360=1.5, 480=double)
                const lineHeight = (spacing.line / 240).toFixed(2);
                styles.push(`line-height:${lineHeight}`);
            } else if (spacing.lineRule === 'exact' || spacing.lineRule === 'atLeast') {
                // Exact/atLeast: value is in twips (1/20 pt)
                styles.push(`line-height:${(spacing.line / 20).toFixed(1)}pt`);
            }
        }

        if (styles.length === 0) return match;
        const styleStr = styles.join(';');
        if (attrs && attrs.includes('style="')) {
            return match.replace(/style="/, `style="${styleStr};`);
        }
        return `<${tag}${attrs || ''} style="${styleStr}">`;
    });

    // ── 8. Post-process: apply image dimensions from DOCX XML ──
    let imgIdx = 0;
    html = html.replace(/<img\s+([^>]*)>/gi, (match, attrs) => {
        if (imgIdx < imageSizes.length) {
            const size = imageSizes[imgIdx++];
            // Don't make images wider than the content area (~650px = 794 - 72*2 padding)
            const w = Math.min(size.width, 650);
            return `<img ${attrs} style="width:${w}px;height:auto;max-width:100%">`;
        }
        return match;
    });

    // ── 9. Post-process: style layout tables (no visible borders) ──
    let tableIdx = 0;
    html = html.replace(/<table>/gi, (match) => {
        const isLayout = layoutTableIndices.has(tableIdx);
        const colWidths = tableGrids[tableIdx] || [];
        tableIdx++;

        const styles = ['border-collapse:collapse', 'width:100%'];
        if (isLayout) {
            styles.push('border:none');
        }
        // Store column widths as a CSS custom property for cell width assignment
        const colWidthData = colWidths.length > 0 ? ` data-col-widths="${colWidths.join(',')}"` : '';
        const layoutClass = isLayout ? ' class="layout-table"' : '';
        return `<table style="${styles.join(';')}"${layoutClass}${colWidthData}>`;
    });

    // Apply column widths to table cells and hide borders on layout tables
    html = html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (tableMatch, tableAttrs, tableBody) => {
        const colWidthMatch = tableAttrs.match(/data-col-widths="([^"]+)"/);
        const isLayout = tableAttrs.includes('class="layout-table"');
        if (!colWidthMatch && !isLayout) return tableMatch;

        const colWidths = colWidthMatch ? colWidthMatch[1].split(',').map(Number) : [];
        const totalWidth = colWidths.reduce((a, b) => a + b, 0) || 1;

        // Apply widths to first row's cells, hide borders on layout tables
        let colIdx = 0;
        let firstRow = true;
        const processedBody = tableBody.replace(/<t([dh])([^>]*)>/gi, (cellMatch, cellTag, cellAttrs) => {
            const cellStyles = [];

            // Apply percentage width from column grid
            if (firstRow && colIdx < colWidths.length) {
                const pct = Math.round((colWidths[colIdx] / totalWidth) * 100);
                cellStyles.push(`width:${pct}%`);
            }

            // Hide borders on layout tables
            if (isLayout) {
                cellStyles.push('border:none', 'padding:0 8px', 'vertical-align:top');
            }

            colIdx++;
            if (cellStyles.length === 0) return cellMatch;
            return `<t${cellTag}${cellAttrs} style="${cellStyles.join(';')}">`;
        }).replace(/<\/tr>/gi, () => {
            firstRow = false;
            colIdx = 0;
            return '</tr>';
        });

        // Clean up the data attribute
        const cleanAttrs = tableAttrs.replace(/\s*data-col-widths="[^"]*"/, '');
        return `<table${cleanAttrs}>${processedBody}</table>`;
    });

    // ── 10. Prepend headers, text boxes; append footers ──
    // These were extracted directly from the DOCX XML (mammoth ignores them).
    const extraParts = [];

    // Headers (firm letterhead, contact info)
    if (headerFooterHtml.headers.length > 0) {
        extraParts.push(`<div class="docx-header" style="margin-bottom:12pt">${headerFooterHtml.headers.join('\n')}</div>`);
    }

    // Text boxes (floating content like addresses, reference boxes)
    if (textBoxHtmlParts.length > 0) {
        extraParts.push(`<div class="docx-textboxes" style="margin-bottom:6pt">${textBoxHtmlParts.join('\n')}</div>`);
    }

    // Prepend extracted content before main body
    if (extraParts.length > 0) {
        html = extraParts.join('\n') + '\n' + html;
    }

    // Append footers at the end
    if (headerFooterHtml.footers.length > 0) {
        html += `\n<div class="docx-footer" style="margin-top:12pt;border-top:1px solid #ccc;padding-top:6pt;font-size:9pt;color:#666">${headerFooterHtml.footers.join('\n')}</div>`;
    }

    // Log any mammoth warnings for debugging
    if (result.messages && result.messages.length > 0) {
        console.log(`[DOCX→HTML] Mammoth warnings (${result.messages.length}):`);
        result.messages.forEach(m => console.log(`  - [${m.type}] ${m.message}`));
    }

    return html;
}

// ============================================================================
// DOCX CONVERSION ENDPOINTS
// ============================================================================

// POST /api/templates/convert-docx - Convert DOCX to PDF for static preview
// Accepts: multipart file upload (the DOCX file)
// Returns: { success, originalS3Key, previewS3Key, originalUrl, pdfUrl, conversionMethod }
app.post('/api/templates/convert-docx', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: 'No file provided' });

        console.log(`[DOCX→PDF] Converting "${file.originalname}" (${(file.size / 1024).toFixed(1)} KB)...`);

        // 1. Upload original DOCX to S3
        const originalKey = `templates/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: originalKey,
            Body: file.buffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }));

        // 2. Convert DOCX → PDF (LibreOffice preferred, Puppeteer fallback)
        let pdfBuffer;
        let conversionMethod;
        const libreOfficePath = await findLibreOffice();

        if (libreOfficePath) {
            console.log(`[DOCX→PDF] Using LibreOffice at: ${libreOfficePath}`);
            pdfBuffer = await convertWithLibreOffice(file.buffer, 'pdf', libreOfficePath);
            conversionMethod = 'libreoffice';
        } else {
            console.log('[DOCX→PDF] LibreOffice not found, using mammoth + Puppeteer fallback');
            pdfBuffer = await convertDocxToPdfWithPuppeteer(file.buffer);
            conversionMethod = 'puppeteer';
        }

        // 3. Upload PDF to S3
        const pdfKey = originalKey.replace(/\.docx?$/i, '-preview.pdf');
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: pdfKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
        }));

        // 4. Generate download URLs
        const originalUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: originalKey }), { expiresIn: 604800 });
        const pdfUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: pdfKey }), { expiresIn: 604800 });

        console.log(`[DOCX→PDF] Conversion complete via ${conversionMethod}. PDF: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        res.json({
            success: true,
            originalS3Key: originalKey,
            previewS3Key: pdfKey,
            originalUrl,
            pdfUrl,
            conversionMethod,
        });
    } catch (err) {
        console.error('[DOCX→PDF] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to convert DOCX to PDF: ' + err.message });
    }
});

// POST /api/templates/convert-to-html - Convert DOCX to HTML for editable template
// Accepts: multipart file upload (the DOCX file)
// Returns: { success, html, originalS3Key, originalUrl, conversionMethod }
app.post('/api/templates/convert-to-html', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: 'No file provided' });

        console.log(`[DOCX→HTML] Converting "${file.originalname}" (${(file.size / 1024).toFixed(1)} KB)...`);

        // 1. Upload original DOCX to S3 (preserve source for generation)
        const originalKey = `templates/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: originalKey,
            Body: file.buffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }));

        // 2. Convert DOCX → HTML (LibreOffice preferred, mammoth fallback)
        let html;
        let conversionMethod;
        let docxHeaderHtml = '';
        let docxFooterHtml = '';
        const libreOfficePath = await findLibreOffice();

        if (libreOfficePath) {
            console.log(`[DOCX→HTML] Using LibreOffice at: ${libreOfficePath}`);

            // Parse image display sizes from the DOCX XML BEFORE conversion
            // LibreOffice outputs images at natural pixel dimensions, not the display size
            const JSZipLib = (await import('jszip')).default;
            const docxZip = await JSZipLib.loadAsync(file.buffer);
            const docXml = await docxZip.file('word/document.xml')?.async('string') || '';
            const imageSizesLO = [];
            const drawRegex = /<(?:wp:inline|wp:anchor)\b[\s\S]*?<\/(?:wp:inline|wp:anchor)>/g;
            let dm;
            while ((dm = drawRegex.exec(docXml)) !== null) {
                const block = dm[0];
                const extMatch = block.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/);
                if (extMatch) {
                    // 914400 EMU = 1 inch = 96px at screen resolution
                    const wPx = Math.round(parseInt(extMatch[1]) / 914400 * 96);
                    const hPx = Math.round(parseInt(extMatch[2]) / 914400 * 96);
                    imageSizesLO.push({ width: wPx, height: hPx });
                }
            }
            console.log(`[DOCX→HTML] Parsed ${imageSizesLO.length} image dimensions from DOCX XML`);

            // Extract header/footer content from DOCX ZIP
            const zipFileNames = Object.keys(docxZip.files);
            for (const fname of zipFileNames) {
                if (/^word\/header\d*\.xml$/i.test(fname)) {
                    const hdrXml = await docxZip.file(fname)?.async('string') || '';
                    // Simple extraction: get text runs from paragraphs
                    const pRegex2 = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
                    let pm2;
                    const hLines = [];
                    while ((pm2 = pRegex2.exec(hdrXml)) !== null) {
                        const pBody = pm2[1];
                        const texts = [];
                        const runRegex2 = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
                        let rm2;
                        while ((rm2 = runRegex2.exec(pBody)) !== null) {
                            const tRegex2 = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
                            let tm2;
                            while ((tm2 = tRegex2.exec(rm2[1])) !== null) {
                                texts.push(tm2[1]);
                            }
                        }
                        if (texts.length) {
                            const alignM = pBody.match(/<w:jc\s+w:val="(\w+)"/);
                            const a = alignM ? alignM[1] : '';
                            let st = '';
                            if (a === 'right') st = ' style="text-align:right"';
                            else if (a === 'center') st = ' style="text-align:center"';
                            hLines.push(`<p${st}>${texts.join('')}</p>`);
                        }
                    }
                    if (hLines.length && !docxHeaderHtml) docxHeaderHtml = hLines.join('');
                }
                if (/^word\/footer\d*\.xml$/i.test(fname)) {
                    const ftrXml = await docxZip.file(fname)?.async('string') || '';
                    const pRegex3 = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
                    let pm3;
                    const fLines = [];
                    while ((pm3 = pRegex3.exec(ftrXml)) !== null) {
                        const pBody = pm3[1];
                        const texts = [];
                        const runRegex3 = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
                        let rm3;
                        while ((rm3 = runRegex3.exec(pBody)) !== null) {
                            const tRegex3 = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
                            let tm3;
                            while ((tm3 = tRegex3.exec(rm3[1])) !== null) {
                                texts.push(tm3[1]);
                            }
                        }
                        if (texts.length) {
                            const alignM = pBody.match(/<w:jc\s+w:val="(\w+)"/);
                            const a = alignM ? alignM[1] : '';
                            let st = '';
                            if (a === 'right') st = ' style="text-align:right"';
                            else if (a === 'center') st = ' style="text-align:center"';
                            fLines.push(`<p${st}>${texts.join('')}</p>`);
                        }
                    }
                    if (fLines.length && !docxFooterHtml) docxFooterHtml = fLines.join('');
                }
            }
            console.log(`[DOCX→HTML] Header: ${docxHeaderHtml.length} chars, Footer: ${docxFooterHtml.length} chars`);

            // Also parse paragraph spacing from DOCX XML for post-processing
            const paraSpacings = [];
            const paraRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
            let pm;
            while ((pm = paraRegex.exec(docXml)) !== null) {
                const pBlock = pm[0];
                const spacingMatch = pBlock.match(/<w:spacing\b([^/]*?)\/>/);
                const spacing = {};
                if (spacingMatch) {
                    const beforeMatch = spacingMatch[1].match(/w:before="(\d+)"/);
                    const afterMatch = spacingMatch[1].match(/w:after="(\d+)"/);
                    const lineMatch = spacingMatch[1].match(/w:line="(\d+)"/);
                    if (beforeMatch) spacing.before = parseInt(beforeMatch[1]); // twips
                    if (afterMatch) spacing.after = parseInt(afterMatch[1]); // twips
                    if (lineMatch) spacing.line = parseInt(lineMatch[1]); // 240ths of a line
                }
                paraSpacings.push(spacing);
            }

            // Inline conversion so we can access extracted image files before cleanup
            const tmpDir = path.join(os.tmpdir(), `docx-html-${Date.now()}`);
            fs.mkdirSync(tmpDir, { recursive: true });
            const docxPath = path.join(tmpDir, 'document.docx');
            fs.writeFileSync(docxPath, file.buffer);

            await new Promise((resolve, reject) => {
                exec(
                    `"${libreOfficePath}" --headless --convert-to html --outdir "${tmpDir}" "${docxPath}"`,
                    { timeout: 60000 },
                    (error, stdout, stderr) => {
                        if (error) reject(new Error(`LibreOffice HTML conversion failed: ${stderr || error.message}`));
                        else resolve(stdout);
                    }
                );
            });

            const htmlPath = path.join(tmpDir, 'document.html');
            if (!fs.existsSync(htmlPath)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                throw new Error('LibreOffice produced no HTML output');
            }
            const fullHtml = fs.readFileSync(htmlPath, 'utf-8');

            // Inline CSS from <head> into element style attributes, then extract body
            const inlinedHtml = juice(fullHtml);
            const bodyMatch = inlinedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            html = bodyMatch ? bodyMatch[1] : inlinedHtml;

            // FIX 1: Convert local image files to base64 inline
            // Use DOCX-parsed dimensions (not LibreOffice's natural pixel size)
            let imgIdx = 0;
            html = html.replace(/<img\s+([^>]*)src="([^"]+)"([^>]*)>/gi, (fullMatch, before, src, after) => {
                if (src.startsWith('data:') || src.startsWith('http')) return fullMatch;
                const imgPath = path.join(tmpDir, src);
                if (fs.existsSync(imgPath)) {
                    const imgBuffer = fs.readFileSync(imgPath);
                    const base64 = imgBuffer.toString('base64');
                    const ext = path.extname(src).slice(1).toLowerCase();
                    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                    // Use DOCX XML dimensions (accurate display size) if available
                    let w, h;
                    if (imgIdx < imageSizesLO.length) {
                        const size = imageSizesLO[imgIdx];
                        w = size.width;
                        h = size.height;
                        console.log(`[DOCX→HTML] Image ${imgIdx}: ${w}x${h}px (from DOCX XML)`);
                    } else {
                        // Fallback: use HTML attributes from LibreOffice
                        const allAttrs = before + after;
                        const wMatch = allAttrs.match(/width="(\d+)"/);
                        const hMatch = allAttrs.match(/height="(\d+)"/);
                        w = wMatch ? wMatch[1] : '';
                        h = hMatch ? hMatch[1] : '';
                    }
                    imgIdx++;
                    const dimStyle = w ? `width:${w}px;height:auto;max-width:100%` : 'max-width:100%';
                    const dimAttrs = w ? ` width="${w}" height="${h}"` : '';
                    return `<img src="data:${mimeType};base64,${base64}"${dimAttrs} style="${dimStyle}" />`;
                }
                imgIdx++;
                return fullMatch;
            });

            // FIX 1b: Apply paragraph spacing from DOCX XML
            // LibreOffice HTML doesn't always preserve Word's paragraph spacing
            let paraIdx = 0;
            html = html.replace(/<p(\s[^>]*)?>|<p>/gi, (match, attrs) => {
                const spacing = paraSpacings[paraIdx] || {};
                paraIdx++;
                const styles = [];
                if (spacing.before) {
                    // Twips to px: 1 twip = 1/1440 inch = 96/1440 px ≈ 0.0667px
                    styles.push(`margin-top:${Math.round(spacing.before * 96 / 1440)}px`);
                }
                if (spacing.after) {
                    styles.push(`margin-bottom:${Math.round(spacing.after * 96 / 1440)}px`);
                }
                if (spacing.line && spacing.line !== 240) {
                    // 240 = single spacing. Convert to multiplier.
                    const multiplier = (spacing.line / 240).toFixed(2);
                    styles.push(`line-height:${multiplier}`);
                }
                if (styles.length === 0) return match;
                const styleStr = styles.join(';');
                if (attrs && attrs.includes('style="')) {
                    return match.replace(/style="/, `style="${styleStr};`);
                } else if (attrs) {
                    return `<p${attrs} style="${styleStr}">`;
                }
                return `<p style="${styleStr}">`;
            });

            // Clean up temp directory now that images are inlined
            fs.rmSync(tmpDir, { recursive: true, force: true });

            // FIX 2: Convert align="right|center|justify" to style="text-align: ..."
            // TipTap reads text-align from CSS style, NOT from the HTML align attribute
            html = html.replace(/<p([^>]*)\balign="(left|right|center|justify)"([^>]*)>/gi,
                (match, before, align, after) => {
                    const cleanBefore = before.replace(/\balign="[^"]*"/gi, '');
                    const cleanAfter = after.replace(/\balign="[^"]*"/gi, '');
                    const combined = cleanBefore + cleanAfter;
                    if (combined.includes('style="')) {
                        const updated = combined.replace(/style="([^"]*)"/, `style="$1; text-align: ${align};"`);
                        return `<p${updated}>`;
                    }
                    return `<p${cleanBefore}${cleanAfter} style="text-align: ${align};">`;
                }
            );

            // FIX 3: Convert <font> tags to <span> with inline styles (TipTap ignores <font>)
            html = html.replace(/<font\b([^>]*)>/gi, (match, attrs) => {
                const styles = [];
                const faceMatch = attrs.match(/face\s*=\s*"([^"]+)"/i);
                const colorMatch = attrs.match(/color\s*=\s*"([^"]+)"/i);
                const styleMatch = attrs.match(/style\s*=\s*"([^"]+)"/i);
                const sizeMatch = attrs.match(/\bsize\s*=\s*"(\d+)"/i);

                if (faceMatch) styles.push(`font-family: ${faceMatch[1]}`);
                if (colorMatch) styles.push(`color: ${colorMatch[1]}`);
                if (styleMatch) {
                    styles.push(styleMatch[1]);
                } else if (sizeMatch) {
                    const sizeMap = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' };
                    styles.push(`font-size: ${sizeMap[sizeMatch[1]] || '12pt'}`);
                }

                return styles.length ? `<span style="${styles.join('; ')}">` : '<span>';
            });
            html = html.replace(/<\/font>/gi, '</span>');

            // CLEANUP: Remove empty paragraphs with just line breaks
            html = html.replace(/<p[^>]*>\s*<br\s*\/?>\s*<br\s*\/?>\s*<\/p>/gi, '');
            html = html.replace(/style=";\s*/g, 'style="');
            html = html.replace(/style="\s*"/g, '');

            conversionMethod = 'libreoffice';
        } else {
            console.log('[DOCX→HTML] LibreOffice not found, using mammoth fallback');
            html = await convertDocxToHtmlWithMammoth(file.buffer);
            conversionMethod = 'mammoth';
        }

        // 3. Post-process: detect {{variable}} patterns
        html = html.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
            return `<span class="detected-variable" data-var="${varName.trim()}">[${varName.trim()}]</span>`;
        });

        const originalUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: originalKey }), { expiresIn: 604800 });

        console.log(`[DOCX→HTML] Conversion complete via ${conversionMethod}. HTML length: ${html.length} chars`);

        res.json({
            success: true,
            html,
            headerHtml: docxHeaderHtml || '',
            footerHtml: docxFooterHtml || '',
            originalS3Key: originalKey,
            originalUrl,
            conversionMethod,
        });
    } catch (err) {
        console.error('[DOCX→HTML] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to convert DOCX to HTML: ' + err.message });
    }
});

// POST /api/templates/generate-from-docx - Generate document from DOCX template with variable replacement
// Accepts: { s3Key (original DOCX), variables (key-value pairs) }
// Returns: { success, s3Key (output PDF), downloadUrl }
app.post('/api/templates/generate-from-docx', async (req, res) => {
    try {
        const { s3Key, variables } = req.body;
        if (!s3Key) return res.status(400).json({ success: false, message: 's3Key is required' });

        console.log(`[DOCX Generate] Generating from template: ${s3Key}`);

        // 1. Download template DOCX from S3
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        const s3Response = await s3Client.send(getCmd);
        const chunks = [];
        for await (const chunk of s3Response.Body) {
            chunks.push(chunk);
        }
        const templateBuffer = Buffer.concat(chunks);

        // 2. Replace variables in DOCX using simple text replacement
        // For now, do a basic find-and-replace on the document XML
        // (docx-templates can be added later for more robust replacement)
        let docxBuffer = templateBuffer;

        if (variables && Object.keys(variables).length > 0) {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(templateBuffer);
            const docXml = await zip.file('word/document.xml')?.async('string');

            if (docXml) {
                let modifiedXml = docXml;
                for (const [key, value] of Object.entries(variables)) {
                    // Replace {{key}} patterns (handle possible XML tag splits)
                    const cleanKey = key.replace(/^\{\{/, '').replace(/\}\}$/, '');
                    const patterns = [
                        `{{${cleanKey}}}`,
                        `{{ ${cleanKey} }}`,
                    ];
                    for (const pattern of patterns) {
                        modifiedXml = modifiedXml.split(pattern).join(String(value || ''));
                    }
                }
                zip.file('word/document.xml', modifiedXml);
                docxBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
            }
        }

        // 3. Convert filled DOCX → PDF
        let pdfBuffer;
        const libreOfficePath = await findLibreOffice();

        if (libreOfficePath) {
            pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
        } else {
            pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
        }

        // 4. Upload generated PDF to S3
        const outputKey = `documents/generated/template-${Date.now()}.pdf`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: outputKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
        }));

        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: outputKey }), { expiresIn: 604800 });

        console.log(`[DOCX Generate] Document generated: ${outputKey} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

        res.json({
            success: true,
            s3Key: outputKey,
            downloadUrl,
            size: pdfBuffer.length,
        });
    } catch (err) {
        console.error('[DOCX Generate] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate document: ' + err.message });
    }
});

// ============================================================================
// ONLYOFFICE INTEGRATION API ROUTES (Phase 1 - In-Memory)
// ============================================================================

// --- OO Template CRUD ---

// GET /api/oo/templates - List all templates, optional ?category filter
app.get('/api/oo/templates', (req, res) => {
    try {
        let templates = Array.from(ooTemplates.values());
        if (req.query.category) {
            templates = templates.filter(t => t.category === req.query.category);
        }
        res.json({ success: true, templates });
    } catch (err) {
        console.error('[OO Templates] List error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/oo/templates - Upload new DOCX template
app.post('/api/oo/templates', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const { name, description, category } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'name is required' });

        const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
        const s3Key = `oo-templates/${Date.now()}-${sanitizedName}.docx`;
        await uploadS3Buffer(s3Key, req.file.buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        const mergeFields = extractMergeFields(req.file.buffer);

        const id = ooTemplateIdCounter++;
        const now = new Date().toISOString();
        const template = {
            id, name,
            description: description || '',
            category: category || 'General',
            s3Key, mergeFields,
            createdAt: now,
            updatedAt: now,
        };
        ooTemplates.set(id, template);

        console.log(`[OO Templates] Created #${id}: "${name}" (${mergeFields.length} merge fields)`);
        res.json({ success: true, template });
    } catch (err) {
        console.error('[OO Templates] Create error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/oo/templates/:id - Get template metadata + presigned download URL
app.get('/api/oo/templates/:id', async (req, res) => {
    try {
        const template = ooTemplates.get(Number(req.params.id));
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: template.s3Key
        }), { expiresIn: 604800 });
        res.json({ success: true, template, downloadUrl });
    } catch (err) {
        console.error('[OO Templates] Get error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/oo/templates/:id - Update template metadata
app.put('/api/oo/templates/:id', (req, res) => {
    try {
        const template = ooTemplates.get(Number(req.params.id));
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        if (req.body.name !== undefined) template.name = req.body.name;
        if (req.body.description !== undefined) template.description = req.body.description;
        if (req.body.category !== undefined) template.category = req.body.category;
        template.updatedAt = new Date().toISOString();

        res.json({ success: true, template });
    } catch (err) {
        console.error('[OO Templates] Update error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/oo/templates/:id - Remove from in-memory store
app.delete('/api/oo/templates/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!ooTemplates.has(id)) return res.status(404).json({ success: false, message: 'Template not found' });
        ooTemplates.delete(id);
        console.log(`[OO Templates] Deleted #${id}`);
        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        console.error('[OO Templates] Delete error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- OO Editor Config ---

// GET /api/oo/templates/:id/editor-config
app.get('/api/oo/templates/:id/editor-config', async (req, res) => {
    try {
        const template = ooTemplates.get(Number(req.params.id));
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        // Use path-style S3 client — bucket "client.landing.page" has dots which break
        // virtual-hosted-style SSL certs when OnlyOffice fetches the file server-side
        const fileUrl = await getSignedUrl(s3ClientPathStyle, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: template.s3Key
        }), { expiresIn: 3600 });


        const callbackBase = process.env.ONLYOFFICE_CALLBACK_BASE_URL || 'http://localhost:5000';
        const callbackUrl = `${callbackBase}/api/oo/callback`;
        const callbackReachable = !callbackBase.includes('localhost') && !callbackBase.includes('127.0.0.1');

        const config = {
            documentType: 'word',
            document: {
                fileType: 'docx',
                key: `tpl_${template.id}_v${Date.now()}`,
                title: template.name,
                url: fileUrl,
                permissions: { download: true, edit: true, print: true },
            },
            editorConfig: {
                ...(callbackReachable ? { callbackUrl } : {}),
                mode: 'edit',
                user: { id: '1', name: 'Brad' },
                customization: {
                    autosave: callbackReachable,
                    forcesave: callbackReachable,
                    chat: false,
                    compactHeader: true,
                },
            },
        };

        if (process.env.ONLYOFFICE_JWT_SECRET) {
            config.token = jwt.sign(config, process.env.ONLYOFFICE_JWT_SECRET);
        }

        res.json({ success: true, config, onlyOfficeUrl: process.env.ONLYOFFICE_URL || '' });
    } catch (err) {
        console.error('[OO] Template editor config error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/oo/documents/:id/editor-config
app.get('/api/oo/documents/:id/editor-config', async (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

        // Path-style S3 URL for OnlyOffice (see template editor-config comment)
        const fileUrl = await getSignedUrl(s3ClientPathStyle, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: doc.s3KeyDocx
        }), { expiresIn: 3600 });

        const callbackBase = process.env.ONLYOFFICE_CALLBACK_BASE_URL || 'http://localhost:5000';
        const callbackUrl = `${callbackBase}/api/oo/callback`;
        const callbackReachable = !callbackBase.includes('localhost') && !callbackBase.includes('127.0.0.1');

        const config = {
            documentType: 'word',
            document: {
                fileType: 'docx',
                key: doc.ooDocKey,
                title: doc.name,
                url: fileUrl,
                permissions: { download: true, edit: true, print: true },
            },
            editorConfig: {
                ...(callbackReachable ? { callbackUrl } : {}),
                mode: 'edit',
                user: { id: '1', name: 'Brad' },
                customization: {
                    autosave: callbackReachable,
                    forcesave: callbackReachable,
                    chat: false,
                    compactHeader: true,
                },
            },
        };

        if (process.env.ONLYOFFICE_JWT_SECRET) {
            config.token = jwt.sign(config, process.env.ONLYOFFICE_JWT_SECRET);
        }

        res.json({ success: true, config, onlyOfficeUrl: process.env.ONLYOFFICE_URL || '' });
    } catch (err) {
        console.error('[OO] Document editor config error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- OO Callback ---

// POST /api/oo/callback - OnlyOffice save callback (MUST always return {"error": 0})
app.post('/api/oo/callback', async (req, res) => {
    try {
        const { status, url, key } = req.body;
        console.log(`[OO Callback] status=${status}, key=${key}`);

        // Status 2 = document ready for saving, 6 = force save
        if ((status === 2 || status === 6) && url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to download from OO: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());

            // Check documents
            for (const [id, doc] of ooDocuments) {
                if (doc.ooDocKey === key) {
                    await uploadS3Buffer(doc.s3KeyDocx, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    doc.ooDocKey = `doc_${id}_v${Date.now()}`;
                    doc.updatedAt = new Date().toISOString();
                    console.log(`[OO Callback] Updated document #${id}`);
                    break;
                }
            }

            // Check templates
            for (const [id, tpl] of ooTemplates) {
                if (key.startsWith(`tpl_${id}_`)) {
                    await uploadS3Buffer(tpl.s3Key, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    tpl.mergeFields = extractMergeFields(buffer);
                    tpl.updatedAt = new Date().toISOString();
                    console.log(`[OO Callback] Updated template #${id}`);
                    break;
                }
            }
        }
    } catch (err) {
        console.error('[OO Callback] Error:', err);
    }
    // MUST always return error:0
    res.json({ error: 0 });
});

// --- OO Document Generation & Management ---

// POST /api/oo/documents/generate - Generate merged document from template
app.post('/api/oo/documents/generate', async (req, res) => {
    try {
        const { templateId, caseId, name, mergeData } = req.body;
        if (!templateId) return res.status(400).json({ success: false, message: 'templateId is required' });

        const template = ooTemplates.get(Number(templateId));
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        // Download template from S3
        const templateBuffer = await downloadS3Buffer(template.s3Key);

        // Use provided merge data or fall back to mock data
        const data = mergeData || {
            ...OO_MOCK_CASE_DATA,
            case_ref: `RR-2024-${String(caseId || 1).padStart(4, '0')}`,
            today_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        };

        // Merge with docxtemplater
        const zip = new PizZip(templateBuffer);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });
        doc.render(data);
        const mergedBuffer = doc.getZip().generate({ type: 'nodebuffer' });

        // Upload merged DOCX to S3
        const docId = ooDocumentIdCounter++;
        const timestamp = Date.now();
        const effectiveCaseId = caseId || 0;
        const s3KeyDocx = `oo-documents/${effectiveCaseId}/${docId}_v${timestamp}.docx`;
        await uploadS3Buffer(s3KeyDocx, mergedBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        const now = new Date().toISOString();
        const document = {
            id: docId,
            caseId: effectiveCaseId,
            templateId: Number(templateId),
            name: name || `${template.name} - Generated ${new Date().toLocaleDateString('en-GB')}`,
            s3KeyDocx,
            s3KeyPdf: null,
            status: 'draft',
            ooDocKey: `doc_${docId}_v${timestamp}`,
            createdAt: now,
            updatedAt: now,
        };
        ooDocuments.set(docId, document);

        console.log(`[OO Documents] Generated #${docId} from template #${templateId}`);
        res.json({ success: true, document });
    } catch (err) {
        console.error('[OO Documents] Generate error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate document: ' + err.message });
    }
});

// GET /api/oo/documents - List documents, optional ?caseId filter
app.get('/api/oo/documents', (req, res) => {
    try {
        let documents = Array.from(ooDocuments.values());
        if (req.query.caseId) {
            documents = documents.filter(d => d.caseId === Number(req.query.caseId));
        }
        res.json({ success: true, documents });
    } catch (err) {
        console.error('[OO Documents] List error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/oo/documents/:id - Get document metadata
app.get('/api/oo/documents/:id', (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[OO Documents] Get error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/oo/documents/:id/download - Presigned download URL
app.get('/api/oo/documents/:id/download', async (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

        const key = req.query.format === 'pdf' && doc.s3KeyPdf ? doc.s3KeyPdf : doc.s3KeyDocx;
        const url = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: key
        }), { expiresIn: 604800 });
        res.json({ success: true, url });
    } catch (err) {
        console.error('[OO Documents] Download error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/oo/documents/:id/convert-pdf - Convert DOCX to PDF via LibreOffice
app.post('/api/oo/documents/:id/convert-pdf', async (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

        const docxBuffer = await downloadS3Buffer(doc.s3KeyDocx);

        const libreOfficePath = await findLibreOffice();
        let pdfBuffer;
        if (libreOfficePath) {
            pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
        } else {
            pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
        }

        const s3KeyPdf = `oo-documents/${doc.caseId}/${doc.id}.pdf`;
        await uploadS3Buffer(s3KeyPdf, pdfBuffer, 'application/pdf');

        doc.s3KeyPdf = s3KeyPdf;
        doc.updatedAt = new Date().toISOString();

        console.log(`[OO Documents] Converted #${doc.id} to PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[OO Documents] PDF conversion error:', err);
        res.status(500).json({ success: false, message: 'PDF conversion failed: ' + err.message });
    }
});

// PUT /api/oo/documents/:id/status - Update document status
app.put('/api/oo/documents/:id/status', (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

        const { status } = req.body;
        if (!['draft', 'final', 'sent'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status. Must be draft, final, or sent' });
        }
        doc.status = status;
        doc.updatedAt = new Date().toISOString();
        res.json({ success: true, document: doc });
    } catch (err) {
        console.error('[OO Documents] Status update error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/oo/documents/:id - Remove from in-memory store
app.delete('/api/oo/documents/:id', (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!ooDocuments.has(id)) return res.status(404).json({ success: false, message: 'Document not found' });
        ooDocuments.delete(id);
        console.log(`[OO Documents] Deleted #${id}`);
        res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
        console.error('[OO Documents] Delete error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- BACKGROUND WORKER: PROCESS PENDING LOAs ---
// Catch any unhandled errors so the server doesn't silently exit
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});

// ============================================================================
// CATEGORY 3 LENDER CONFIRMATION ENDPOINTS
// ============================================================================

// Verify token and return details (for React confirmation page)
app.get('/api/verify-lender-token/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Look up the pending confirmation
        const confirmRes = await pool.query(
            `SELECT p.*, c.first_name, c.last_name, c.email
             FROM pending_lender_confirmations p
             JOIN contacts c ON p.contact_id = c.id
             WHERE p.token = $1`,
            [token]
        );

        if (confirmRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid confirmation link' });
        }

        const confirmation = confirmRes.rows[0];

        if (confirmation.used) {
            return res.status(400).json({
                success: false,
                used: true,
                message: 'This confirmation has already been processed'
            });
        }

        // Get alternative name for Category 3 lender
        const alternatives = CATEGORY_3_CONFIRMATION_LENDERS[confirmation.lender.toUpperCase()] || [];
        const alternativeName = alternatives[0] || confirmation.lender;

        return res.json({
            success: true,
            lender: confirmation.lender,
            alternative: alternativeName,
            clientName: `${confirmation.first_name} ${confirmation.last_name}`,
            action: confirmation.action
        });
    } catch (error) {
        console.error('[Category 3] Error verifying token:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Process confirmation from React page
app.post('/api/process-lender-confirmation/:token', async (req, res) => {
    const { token } = req.params;
    const { userAction } = req.body; // 'yes' or 'no'

    try {
        // Look up the pending confirmation
        const confirmRes = await pool.query(
            `SELECT * FROM pending_lender_confirmations WHERE token = $1`,
            [token]
        );

        if (confirmRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid confirmation link' });
        }

        const confirmation = confirmRes.rows[0];

        if (confirmation.used) {
            return res.status(400).json({
                success: false,
                message: 'This confirmation has already been processed'
            });
        }

        // Mark token as used
        await pool.query(
            `UPDATE pending_lender_confirmations SET used = true, used_at = NOW() WHERE token = $1`,
            [token]
        );

        // Also mark the corresponding confirm/reject token as used
        await pool.query(
            `UPDATE pending_lender_confirmations
             SET used = true, used_at = NOW()
             WHERE contact_id = $1 AND lender = $2 AND used = false`,
            [confirmation.contact_id, confirmation.lender]
        );

        if (userAction === 'yes') {
            // Create the claim for the lender with 'New Lead' status
            const newCaseRes = await pool.query(
                `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated, dsar_send_after)
                 VALUES ($1, $2, 'New Lead', 0, CURRENT_TIMESTAMP, false, NOW()) RETURNING id`,
                [confirmation.contact_id, confirmation.lender]
            );

            // Set reference_specified
            await setReferenceSpecified(pool, confirmation.contact_id, newCaseRes.rows[0].id);

            // Log the action
            const timestamp = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            await pool.query(
                `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, $2, 'client', $3, 'lender_confirmed', 'claims', $4, $5)`,
                [
                    confirmation.contact_id,
                    newCaseRes.rows[0].id,
                    confirmation.contact_id.toString(),
                    `[${timestamp}] Client confirmed lender selection: ${confirmation.lender} - Claim created`,
                    JSON.stringify({ lender: confirmation.lender, caseId: newCaseRes.rows[0].id })
                ]
            );

            console.log(`[Category 3] ✅ Client confirmed ${confirmation.lender}, case ${newCaseRes.rows[0].id} created`);

            return res.json({
                success: true,
                action: 'confirmed',
                message: `Claim created for ${confirmation.lender}`
            });
        } else {
            // Log the rejection
            const timestamp = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, 'client', $2, 'lender_rejected', 'claims', $3, $4)`,
                [
                    confirmation.contact_id,
                    confirmation.contact_id.toString(),
                    `[${timestamp}] Client rejected lender selection: ${confirmation.lender} - No claim created`,
                    JSON.stringify({ lender: confirmation.lender })
                ]
            );

            console.log(`[Category 3] ❌ Client rejected ${confirmation.lender}, no claim created`);

            return res.json({
                success: true,
                action: 'rejected',
                message: 'No claim created'
            });
        }
    } catch (error) {
        console.error('[Category 3] Error processing confirmation:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Legacy endpoint (keeping for backward compatibility)
// Handle client's confirmation response for Category 3 lenders
app.get('/api/confirm-lender/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Look up the pending confirmation
        const confirmRes = await pool.query(
            `SELECT * FROM pending_lender_confirmations WHERE token = $1 AND used = false`,
            [token]
        );

        if (confirmRes.rows.length === 0) {
            return res.send(renderConfirmationPage({
                status: 'error',
                title: 'Link Expired or Invalid',
                message: 'This confirmation link has already been used or is no longer valid.',
                showRedirect: true
            }));
        }

        const confirmation = confirmRes.rows[0];
        const isConfirm = confirmation.action === 'confirm';

        // Mark token as used
        await pool.query(
            `UPDATE pending_lender_confirmations SET used = true, used_at = NOW() WHERE token = $1`,
            [token]
        );

        if (isConfirm) {
            // Create the claim for the lender
            const newCaseRes = await pool.query(
                `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated, dsar_send_after)
                 VALUES ($1, $2, 'Lender Selection Form Completed', 0, CURRENT_TIMESTAMP, false, NOW()) RETURNING id`,
                [confirmation.contact_id, confirmation.lender]
            );

            // Set reference_specified
            await setReferenceSpecified(pool, confirmation.contact_id, newCaseRes.rows[0].id);

            // Log the action
            await pool.query(
                `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, $2, 'client', $3, 'lender_confirmed', 'claims', $4, $5)`,
                [
                    confirmation.contact_id,
                    newCaseRes.rows[0].id,
                    confirmation.contact_id.toString(),
                    `Client confirmed lender selection: ${confirmation.lender}`,
                    JSON.stringify({ lender: confirmation.lender })
                ]
            );

            console.log(`[Category 3] ✅ Client confirmed ${confirmation.lender}, case ${newCaseRes.rows[0].id} created`);

            return res.send(renderConfirmationPage({
                status: 'success',
                title: 'Thank You!',
                message: `Your claim for ${confirmation.lender} has been created. We will process it shortly.`,
                showRedirect: true
            }));
        } else {
            // Log the rejection
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, 'client', $2, 'lender_rejected', 'claims', $3, $4)`,
                [
                    confirmation.contact_id,
                    confirmation.contact_id.toString(),
                    `Client rejected lender selection: ${confirmation.lender}`,
                    JSON.stringify({ lender: confirmation.lender })
                ]
            );

            console.log(`[Category 3] ❌ Client rejected ${confirmation.lender}, no claim created`);

            return res.send(renderConfirmationPage({
                status: 'info',
                title: 'Thank You!',
                message: 'We appreciate your response. No claim has been created for this lender.',
                showRedirect: true
            }));
        }
    } catch (error) {
        console.error('[Category 3] Error processing confirmation:', error);
        return res.send(renderConfirmationPage({
            status: 'error',
            title: 'Something Went Wrong',
            message: 'Please contact us if you continue to experience issues.',
            showRedirect: true
        }));
    }
});

// Helper function to render confirmation result page with redirect
function renderConfirmationPage({ status, title, message, showRedirect }) {
    const iconColors = {
        success: '#16a34a',
        info: '#0ea5e9',
        error: '#dc2626'
    };
    const iconColor = iconColors[status] || iconColors.info;

    const iconSvg = status === 'success'
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
        : status === 'error'
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Rowan Rose Solicitors</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { background: #ffffff; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); max-width: 480px; width: 100%; padding: 50px 40px; text-align: center; }
            .icon { color: ${iconColor}; margin-bottom: 24px; }
            h1 { color: #0f172a; font-size: 32px; margin-bottom: 16px; font-weight: 700; }
            p { color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
            .countdown { background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
            .countdown-text { color: #64748b; font-size: 14px; margin-bottom: 10px; }
            .countdown-number { color: #0f172a; font-size: 36px; font-weight: 700; }
            .btn { display: inline-block; background: linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%); color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; transition: transform 0.2s, box-shadow 0.2s; }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.2); }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">${iconSvg}</div>
            <h1>${title}</h1>
            <p>${message}</p>
            ${showRedirect ? `
            <div class="countdown">
                <div class="countdown-text">Redirecting to our website in</div>
                <div class="countdown-number" id="countdown">30</div>
            </div>
            ` : ''}
            <a href="https://www.rowanrose.co.uk" class="btn">Go to Website</a>
            <div class="footer">Rowan Rose Solicitors Ltd</div>
        </div>
        ${showRedirect ? `
        <script>
            let seconds = 30;
            const countdownEl = document.getElementById('countdown');
            const timer = setInterval(() => {
                seconds--;
                countdownEl.textContent = seconds;
                if (seconds <= 0) {
                    clearInterval(timer);
                    window.location.href = 'https://www.rowanrose.co.uk';
                }
            }, 1000);
        </script>
        ` : ''}
    </body>
    </html>
    `;
}

// Listen on 0.0.0.0 for cloud deployment (EC2, Docker, etc.)
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Consolidated Server running on port ${port} (listening on all interfaces)`);
});
server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
});
