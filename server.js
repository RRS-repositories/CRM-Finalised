import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pkg from 'pg';
const { Pool } = pkg;
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import * as msal from '@azure/msal-node';
import path from 'path';
import { fileURLToPath } from 'url';
// T&C generation removed — imports no longer needed
// import termsPkg from './termsText.cjs';
// import termsHtmlPkg from './termsHtml.cjs';
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
import { createReport } from 'docx-templates';
import { convertDocxToPdf } from './oo-converter.js';
import jwt from 'jsonwebtoken';
import crmEvents from './services/crmEvents.js';
import clientWorkflow from './client-workflow.js';
import { generatePdfFromCase, generateClientCareLetter } from './pdf-generator.js';
import marketingRouter from './routes/marketing/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// const { tcText } = termsPkg;
// const { tcHtml } = termsHtmlPkg;

const app = express();
const port = process.env.PORT || 5000;

// Sanitize contact names for S3 folder paths — strips /, \, and other special chars that break S3 paths
function sanitizeNameForS3(name) {
    return (name || '').replace(/[\/\\]/g, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '').replace(/_+/g, '_');
}
function buildS3Folder(firstName, lastName, contactId) {
    return `${sanitizeNameForS3(firstName)}_${sanitizeNameForS3(lastName)}_${contactId}/`;
}

function renderAlreadySubmittedPage(title, message) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Rowan Rose Solicitors</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%); padding: 20px; }
        .card { background: #fff; border-radius: 24px; padding: 48px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.3); }
        .icon { width: 80px; height: 80px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
        .icon svg { width: 40px; height: 40px; color: #f59e0b; }
        h1 { font-size: 28px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        p { font-size: 16px; color: #64748b; line-height: 1.6; margin-bottom: 32px; }
        .btn { display: inline-block; background: linear-gradient(145deg, #f97316, #ea580c); color: #fff; font-size: 16px; font-weight: 600; padding: 16px 40px; border-radius: 12px; text-decoration: none; box-shadow: 0 4px 16px rgba(249,115,22,0.35); transition: transform 0.2s, box-shadow 0.2s; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(249,115,22,0.4); }
        .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
        .footer p { font-size: 13px; color: #94a3b8; margin-bottom: 4px; }
        .footer a { color: #f97316; text-decoration: none; font-weight: 500; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="https://www.rowanrose.co.uk/" class="btn">Visit Our Website</a>
        <div class="footer">
            <p><strong>Rowan Rose Solicitors</strong></p>
            <p>1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
            <p><a href="tel:01615331706">0161 533 1706</a> | <a href="mailto:irl@rowanrose.co.uk">irl@rowanrose.co.uk</a></p>
        </div>
    </div>
</body>
</html>`;
}

// Trust proxy for correct protocol detection behind nginx (important for HTTPS)
// This ensures req.protocol returns 'https' when behind a reverse proxy
app.set('trust proxy', 1);

// ============================================================================
// EMAIL DRAFT MODE - Set to true to SKIP sending ALL emails (for review)
// ============================================================================
const EMAIL_DRAFT_MODE = false; // ENABLED - Lender Selection Form & General Emails will send
// NOTE: DSAR emails (worker.js) have separate DRAFT mode control
// ============================================================================

// ============================================================================
// PDF GENERATION QUEUE - ensures bulk updates run sequentially, not concurrently
// ============================================================================
const pdfQueue = {
    _chain: Promise.resolve(),
    enqueue(fn) {
        this._chain = this._chain.then(fn, fn);
        return this._chain;
    }
};

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
// compression() removed — Nginx handles gzip at the proxy level
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'public')));

// --- AWS & DB CLIENTS ---
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
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

// Initialise CRM event bus (Windmill automation dispatch)
crmEvents.init(pool);

// --- ACTIVITY LOG HELPER ---
async function logAction({ clientId, claimId, actorType = 'system', actorId = 'system', actorName = 'System', actionType, actionCategory, description, metadata = {} }) {
    try {
        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [clientId || null, claimId || null, actorType, actorId, actorName, actionType, actionCategory, description, JSON.stringify(metadata)]
        );
    } catch (err) {
        console.error(`[ActionLog] Failed to log ${actionType}:`, err.message);
    }
}

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
                    -- Convert late_payment_charges from DECIMAL to TEXT to support count/value format
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='late_payment_charges' AND data_type != 'text') THEN
                        ALTER TABLE cases ALTER COLUMN late_payment_charges TYPE TEXT;
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
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='fee_percent') THEN
                        ALTER TABLE cases ADD COLUMN fee_percent TEXT;
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

                    -- Task Work: columns on contacts (legacy)
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='task_work_assigned_to') THEN
                        ALTER TABLE contacts ADD COLUMN task_work_assigned_to INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='task_work_assigned_at') THEN
                        ALTER TABLE contacts ADD COLUMN task_work_assigned_at TIMESTAMP;
                    END IF;

                    -- Task Work: columns on cases (claim-level assignment)
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_assigned_to') THEN
                        ALTER TABLE cases ADD COLUMN tw_assigned_to INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_assigned_at') THEN
                        ALTER TABLE cases ADD COLUMN tw_assigned_at TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_completed') THEN
                        ALTER TABLE cases ADD COLUMN tw_completed BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_completed_at') THEN
                        ALTER TABLE cases ADD COLUMN tw_completed_at TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_completed_by') THEN
                        ALTER TABLE cases ADD COLUMN tw_completed_by INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_red_flag') THEN
                        ALTER TABLE cases ADD COLUMN tw_red_flag BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_red_flag_at') THEN
                        ALTER TABLE cases ADD COLUMN tw_red_flag_at TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_red_flag_by') THEN
                        ALTER TABLE cases ADD COLUMN tw_red_flag_by INTEGER;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='tw_originally_assigned_to') THEN
                        ALTER TABLE cases ADD COLUMN tw_originally_assigned_to INTEGER;
                    END IF;

                    -- User activity tracking: last_active_at on users table
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_active_at') THEN
                        ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP;
                    END IF;

                    -- Offline periods table for time wastage tracking
                    CREATE TABLE IF NOT EXISTS offline_periods (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        offline_start TIMESTAMP NOT NULL,
                        online_at TIMESTAMP NOT NULL,
                        duration_minutes NUMERIC(10,2) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_offline_periods_user_date ON offline_periods (user_id, offline_start);

                    -- One-time cleanup already ran (removed stale pre-fix records before 2026-03-12)

                    -- Normalize lender names: merge all 118 variants into "118 Money"
                    UPDATE cases SET lender = '118 Money' WHERE lender ILIKE '118%' AND lender != '118 Money';

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

                    -- Add end_date and value_of_loan columns to cases table (for top-level claim fields)
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='end_date') THEN
                        ALTER TABLE cases ADD COLUMN end_date TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='value_of_loan') THEN
                        ALTER TABLE cases ADD COLUMN value_of_loan TEXT;
                    END IF;

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

                    -- Create html_templates table for LOA/Cover Letter HTML templates
                    CREATE TABLE IF NOT EXISTS html_templates (
                        id SERIAL PRIMARY KEY,
                        template_type VARCHAR(50) UNIQUE NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        html_content TEXT NOT NULL,
                        variables TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_by VARCHAR(255)
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

                    -- Nova Integration: communications Twilio/messaging fields
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='type') THEN
                        ALTER TABLE communications ADD COLUMN type VARCHAR(20);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='from') THEN
                        ALTER TABLE communications ADD COLUMN "from" VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='to') THEN
                        ALTER TABLE communications ADD COLUMN "to" VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='media_url') THEN
                        ALTER TABLE communications ADD COLUMN media_url TEXT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='media_type') THEN
                        ALTER TABLE communications ADD COLUMN media_type VARCHAR(50);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='twilio_sid') THEN
                        ALTER TABLE communications ADD COLUMN twilio_sid VARCHAR(50);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='status') THEN
                        ALTER TABLE communications ADD COLUMN status VARCHAR(20) DEFAULT 'sent';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='template_name') THEN
                        ALTER TABLE communications ADD COLUMN template_name VARCHAR(100);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='communications' AND column_name='sent_by') THEN
                        ALTER TABLE communications ADD COLUMN sent_by VARCHAR(20) DEFAULT 'system';
                    END IF;
                    CREATE INDEX IF NOT EXISTS idx_communications_twilio_sid ON communications(twilio_sid) WHERE twilio_sid IS NOT NULL;

                    -- Nova Integration: ID chase state columns on contacts
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_active') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_active BOOLEAN DEFAULT false;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_stage') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_stage VARCHAR(30);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_started_at') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_started_at TIMESTAMPTZ;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_last_action_at') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_last_action_at TIMESTAMPTZ;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_last_client_at') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_last_client_at TIMESTAMPTZ;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='id_chase_channel') THEN
                        ALTER TABLE contacts ADD COLUMN id_chase_channel VARCHAR(20);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='bot_paused') THEN
                        ALTER TABLE contacts ADD COLUMN bot_paused BOOLEAN DEFAULT false;
                    END IF;
                    CREATE INDEX IF NOT EXISTS idx_contacts_id_chase_active ON contacts(id_chase_active) WHERE id_chase_active = true;

                END $$;
            `);
            console.log('✅ Cases table schema synchronized');

            // Add contact_id and contact_name columns to persistent_notifications for error notifications
            await client.query(`
                ALTER TABLE persistent_notifications ADD COLUMN IF NOT EXISTS contact_id INTEGER;
                ALTER TABLE persistent_notifications ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
            `);
            console.log('✅ persistent_notifications contact columns ready');

            // Backfill: migrate existing action_log errors into persistent_notifications
            const { rows: existingErrors } = await client.query(`
                SELECT al.client_id, al.description, al.timestamp,
                       c.first_name, c.last_name
                FROM action_logs al
                LEFT JOIN contacts c ON al.client_id = c.id
                WHERE al.action_type IN ('dsar_blocked', 'dsar_failed')
                AND al.actor_type = 'system'
                AND NOT EXISTS (
                    SELECT 1 FROM persistent_notifications pn
                    WHERE pn.type = 'action_error'
                    AND pn.contact_id = al.client_id
                    AND pn.message = al.description
                )
            `);
            if (existingErrors.length > 0) {
                for (const err of existingErrors) {
                    const contactName = err.first_name && err.last_name
                        ? `${err.first_name} ${err.last_name}` : 'Unknown';
                    await client.query(
                        `INSERT INTO persistent_notifications (type, title, message, contact_id, contact_name, link, is_read, created_at)
                         VALUES ('action_error', $1, $2, $3, $4, $5, false, $6)`,
                        [
                            `Error: ${contactName}`,
                            err.description,
                            err.client_id,
                            contactName,
                            `/contacts/${err.client_id}`,
                            err.timestamp || new Date()
                        ]
                    );
                }
                console.log(`✅ Backfilled ${existingErrors.length} error notifications from action_logs`);
            }

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

            // Link documents to a specific claim
            await client.query(`
                ALTER TABLE documents ADD COLUMN IF NOT EXISTS claim_id INTEGER REFERENCES cases(id) ON DELETE SET NULL
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_documents_claim_id ON documents(claim_id)
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

            // ============================================
            // AUTOMATION / WINDMILL INTEGRATION TABLES
            // ============================================

            await client.query(`
                CREATE TABLE IF NOT EXISTS automations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    windmill_flow_path VARCHAR(500),
                    trigger_type VARCHAR(50) NOT NULL,
                    trigger_config JSONB DEFAULT '{}',
                    module VARCHAR(50) NOT NULL,
                    is_active BOOLEAN DEFAULT true,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS automation_runs (
                    id SERIAL PRIMARY KEY,
                    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
                    windmill_job_id VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'running',
                    trigger_type VARCHAR(50),
                    trigger_data JSONB DEFAULT '{}',
                    result JSONB DEFAULT '{}',
                    error TEXT,
                    duration_ms INTEGER,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS automation_triggers (
                    id SERIAL PRIMARY KEY,
                    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
                    event_name VARCHAR(100) NOT NULL,
                    conditions JSONB DEFAULT '{}',
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS automation_webhooks (
                    id SERIAL PRIMARY KEY,
                    automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
                    webhook_path VARCHAR(500),
                    webhook_url TEXT,
                    secret VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_automations_module ON automations(module);
                CREATE INDEX IF NOT EXISTS idx_automations_active ON automations(is_active);
                CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
                CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
                CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_automation_triggers_event ON automation_triggers(event_name);
                CREATE INDEX IF NOT EXISTS idx_automation_triggers_automation ON automation_triggers(automation_id);
            `);
            console.log('✅ Automation tables ready');

            // Custom merge fields table (for OpenClaw / external use)
            await client.query(`
                CREATE TABLE IF NOT EXISTS custom_merge_fields (
                    id SERIAL PRIMARY KEY,
                    field_key VARCHAR(255) UNIQUE NOT NULL,
                    label VARCHAR(255) NOT NULL,
                    group_name VARCHAR(100) NOT NULL DEFAULT 'Custom',
                    default_value TEXT,
                    description TEXT,
                    created_by VARCHAR(100) DEFAULT 'openclaw',
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_custom_merge_fields_active ON custom_merge_fields(is_active);
                CREATE INDEX IF NOT EXISTS idx_custom_merge_fields_group ON custom_merge_fields(group_name);
            `);
            console.log('✅ Custom merge fields table ready');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Database migration error:', err);
    }
})();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 49 * 1024 * 1024 }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;


/**
 * Generate LOA or Cover Letter PDF using OnlyOffice (local EC2)
 * @param {number} caseId - The case ID
 * @param {string} documentType - 'LOA' or 'COVER_LETTER'
 * @param {boolean} skipStatusUpdate - If true, won't change case status (deprecated - always updates)
 */
async function triggerPdfGenerator(caseId, documentType, skipStatusUpdate = false) {
    try {
        console.log(`🚀 Generating PDF for case ${caseId}, type: ${documentType}`);

        // Fetch case and contact data
        const caseQuery = `
            SELECT c.*, ct.id as contact_id, ct.first_name, ct.last_name, ct.email, ct.phone,
                   ct.address_line_1, ct.address_line_2, ct.city, ct.state_county, ct.postal_code,
                   ct.previous_address_line_1, ct.previous_address_line_2, ct.previous_city,
                   ct.previous_county, ct.previous_postal_code, ct.previous_addresses,
                   ct.dob, ct.ip_address
            FROM cases c
            JOIN contacts ct ON c.contact_id = ct.id
            WHERE c.id = $1
        `;

        const result = await pool.query(caseQuery, [caseId]);

        if (result.rows.length === 0) {
            console.error(`❌ Case ${caseId} not found`);
            return { status: 'ERROR', error: `Case ${caseId} not found` };
        }

        const row = result.rows[0];
        const contact = {
            id: row.contact_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            address_line_1: row.address_line_1,
            address_line_2: row.address_line_2,
            city: row.city,
            state_county: row.state_county,
            postal_code: row.postal_code,
            previous_address_line_1: row.previous_address_line_1,
            previous_address_line_2: row.previous_address_line_2,
            previous_city: row.previous_city,
            previous_county: row.previous_county,
            previous_postal_code: row.previous_postal_code,
            previous_addresses: row.previous_addresses,
            dob: row.dob,
            ip_address: row.ip_address
        };

        const caseData = {
            id: row.id,
            contact_id: row.contact_id,
            lender: row.lender,
            claim_value: row.claim_value,
            status: row.status,
            reference_specified: row.reference_specified
        };

        // Generate PDF using local OnlyOffice
        const pdfResult = await generatePdfFromCase(contact, caseData, documentType, pool, skipStatusUpdate);

        console.log(`✅ PDF generated for case ${caseId}: ${pdfResult.fileName}`);

        // If LOA was successfully generated, automatically trigger cover letter generation
        if (documentType === 'LOA') {
            console.log(`🚀 LOA generated successfully, now triggering Cover Letter generation for case ${caseId}`);
            // Trigger cover letter generation asynchronously (don't wait for it)
            // Pass same skipStatusUpdate so status stays unchanged for Extra Lender Selection Form Sent
            triggerPdfGenerator(caseId, 'COVER_LETTER', skipStatusUpdate).catch(err => {
                console.error(`❌ Cover letter generation failed for case ${caseId}:`, err.message);
            });
        }

        return {
            status: 'SUCCESS',
            fileName: pdfResult.fileName,
            signedUrl: pdfResult.signedUrl,
            s3Key: pdfResult.s3Key
        };
    } catch (err) {
        console.error(`❌ Error generating PDF for case ${caseId}:`, err.message);
        return { status: 'ERROR', error: err.message };
    }
}

// ============================================================================
// IRL MULTIPLE LENDER FORM PDF GENERATION (DOCX Template Approach)
// ============================================================================

/**
 * Lender variable mapping for the IRL Multiple Lender Form DOCX template.
 *
 * In the DOCX template (edited via OnlyOffice), each lender checkbox is a variable:
 *   {{aqua}}  Aqua              {{barclays_credit_card}}  Barclays Credit Card
 *   {{fluid}} Fluid             {{luma}}                  Luma
 *
 * The code replaces each variable with ☑ (selected) or ☐ (not selected).
 *
 * Map key = UPPERCASE lender name (as it comes from the LOA form selection)
 * Map value = variable name used in the DOCX template (without {{ }})
 */
const IRL_LENDER_VARIABLES = {
    // ─── CREDIT CARDS ───
    'AQUA': 'aqua',
    'BARCLAYS CREDIT CARD': 'barclays_credit_card',
    'BIP CREDIT CARD': 'bip_credit_card',
    'CAPITAL ONE': 'capital_one',
    'FLUID': 'fluid',
    'LUMA': 'luma',
    'MARBLES': 'marbles',
    'MBNA': 'mbna',
    'OCEAN': 'ocean',
    'REVOLUT CREDIT CARD': 'revolut_credit_card',
    'VANQUIS': 'vanquis',
    'WAVE': 'wave',
    'ZABLE': 'zable',
    'ZILCH': 'zilch',
    'ZOPA': 'zopa',
    '118 118 MONEY': 'money_118',

    // ─── PAYDAY / SHORT-TERM LOANS (also includes 118 Loans) ───
    '118 LOANS': 'loans_118',
    'ADMIRAL LOANS': 'admiral_loans',
    'ANICO FINANCE': 'anico_finance',
    'AVANT CREDIT': 'avant_credit',
    'BAMBOO': 'bamboo',
    'BETTER BORROW': 'better_borrow',
    'CREDIT SPRING': 'credit_spring',
    'CASH ASAP': 'cash_asap',
    'CASH FLOAT': 'cash_float',
    'CAR CASH POINT': 'car_cash_point',
    'CREATION FINANCE': 'creation_finance',
    'CASTLE COMMUNITY BANK': 'castle_community_bank',
    'DRAFTY LOANS': 'drafty_loans',
    'EVOLUTION MONEY': 'evolution_money',
    'EVERY DAY LENDING': 'every_day_lending',
    'FERNOVO': 'fernovo',
    'FAIR FINANCE': 'fair_finance',
    'FINIO LOANS': 'finio_loans',
    'FINTERN': 'fintern',
    'FLURO': 'fluro',
    'GAMBLING': 'gambling_lender',
    'KOYO LOANS': 'koyo_loans',
    'LIKELY LOANS': 'likely_loans',
    'LOANS2GO': 'loans2go',
    'Loans 2 Go': 'loans2go',
    'LOANS BY MAL': 'loans_by_mal',
    'LOGBOOK LENDING': 'logbook_lending',
    'LOGBOOK MONEY': 'logbook_money',
    'LENDING STREAM': 'lending_stream',
    'LENDABLE': 'lendable',
    'LIFE STYLE LOANS': 'life_style_loans',
    'MY COMMUNITY FINANCE': 'my_community_finance',
    'MY KREDIT': 'my_kredit',
    'MY FINANCE CLUB': 'my_finance_club',
    'MONEY BOAT': 'money_boat',
    'MONEYBOAT': 'money_boat',
    'MR LENDER': 'mr_lender',
    'MONEY LINE': 'money_line',
    'MY COMMUNITY BANK': 'my_community_bank',
    'MONTHLY ADVANCE LOANS': 'monthly_advance_loans',
    'NOVUNA': 'novuna',
    'OPOLO': 'opolo',
    'PM LOANS': 'pm_loans',
    'POLAR FINANCE': 'polar_finance',
    'POST OFFICE': 'post_office_money',
    'POST OFFICE MONEY': 'post_office_money',
    'PROGRESSIVE MONEY': 'progressive_money',
    'PLATA FINANCE': 'plata_finance',
    'PLEND': 'plend',
    'QUID MARKET': 'quid_market',
    'QUICK LOANS': 'quick_loans',
    'SKYLINE DIRECT': 'skyline_direct',
    'SALAD MONEY': 'salad_money',
    'SAVVY LOANS': 'savvy_loans',
    'SALARY FINANCE (NEYBER)': 'salary_finance',
    'SNAP FINANCE': 'snap_finance',
    'SHAWBROOK': 'shawbrook',
    'THE ONE STOP MONEY SHOP': 'one_stop_money_shop',
    'TM ADVANCES': 'tm_advances',
    'TANDEM': 'tandem',
    'WAGESTREAM': 'wagestream',
    'CASH 4 U NOW': 'cash_4_u_now',
    'FUND OURSELVES': 'fund_ourselves',
    'LIVE LEND': 'live_lend',
    'ONDAL FINANCE': 'ondal_finance',
    'PML LOANS': 'pml_loans',
    'RATE SETTER': 'rate_setter',
    'REEVO': 'reevo',
    'TICK TOCK LOANS': 'tick_tock_loans',
    'UPDRAFT': 'updraft',

    // ─── CONSOLIDATION / OTHER LOANS ───
    'CONSOLIDATION LOAN': 'consolidation_loan',

    // ─── GUARANTOR LOANS ───
    'GUARANTOR MY LOAN': 'guarantor_my_loan',
    'HERO LOANS': 'hero_loans',
    'JUO LOANS': 'juo_loans',
    'SUCO': 'suco',
    'UK CREDIT': 'uk_credit',
    '1 PLUS 1': 'one_plus_one',

    // ─── LOGBOOK LOANS / PAWNBROKERS ───
    'CASH CONVERTERS': 'cash_converters',
    'H&T PAWNBROKERS': 'ht_pawnbrokers',

    // ─── CATALOGUES ───
    'FASHION WORLD': 'fashion_world',
    'JD WILLIAMS': 'jd_williams',
    'SIMPLY BE': 'simply_be',
    'VERY CATALOGUE': 'very_catalogue',

    // ─── CAR FINANCE ───
    'ADVANTAGE FINANCE': 'advantage_finance',
    'AUDI / VOLKSWAGEN FINANCE / SKODA': 'audi_vw_skoda',
    'BLUE MOTOR FINANCE': 'blue_motor_finance',
    'CLOSE BROTHERS': 'close_brothers',
    'HALIFAX / BANK OF SCOTLAND': 'halifax_bos',
    'MONEY WAY': 'money_way',
    'MOTONOVO': 'motonovo',
    'MONEY BARN': 'money_barn',
    'OODLE': 'oodle',
    'OODLE CAR FINANCE': 'oodle',
    'PSA FINANCE': 'psa_finance',
    'RCI FINANCIAL': 'rci_financial',
    'BLACKHORSE': 'blackhorse',
    'BMW / MINI / ALPHERA FINANCE': 'bmw_mini_alphera',
    'SANTANDER CONSUMER FINANCE': 'santander_consumer',
    'VAUXHALL FINANCE': 'vauxhall_finance',

    // ─── OVERDRAFTS ───
    'HALIFAX OVERDRAFT': 'halifax_overdraft',
    'BARCLAYS OVERDRAFT': 'barclays_overdraft',
    'CO-OP BANK OVERDRAFT': 'coop_overdraft',
    'LLOYDS OVERDRAFT': 'lloyds_overdraft',
    'TSB OVERDRAFT': 'tsb_overdraft',
    'NATWEST / RBS OVERDRAFT': 'natwest_rbs_overdraft',
    'HSBC OVERDRAFT': 'hsbc_overdraft',
    'SANTANDER OVERDRAFT': 'santander_overdraft',
};

/**
 * Generate IRL Multiple Lender Form PDF using DOCX template + createReport + OnlyOffice.
 *
 * Uses createReport (docx-templates) — same engine as LOA & Cover Letter — which:
 *   - Handles images natively (signature embedding)
 *   - Handles {{variables}} split across Word XML runs
 *
 * Template variables:
 *   {{aqua}}, {{capital_one}}, etc.  → ☑ or ☐
 *   {{had_ccj}}, {{victim_of_scam}}, {{problematic_gambling}} → ☑ or ☐
 *   {{betting_companies}} → text
 *   {{client_id}} → "Full Name - ID"
 *   {{claim.lender}} → intake lender name
 *   {{signatureImage}} → signature PNG image
 *   {{today}} → formatted date
 */
async function generateIrlMultipleLenderPdf({
    contactId, contact, selectedLenders, hadCCJ, victimOfScam,
    problematicGambling, bettingCompanies, signatureBase64, folderPath
}) {
    console.log(`[IRL PDF] Starting generation for contact ${contactId} with ${selectedLenders.length} lenders`);

    // 1. Find the IRL template DOCX in oo_templates
    let templateS3Key = null;
    try {
        const templateRes = await pool.query(
            `SELECT s3_key FROM oo_templates WHERE name ILIKE '%irl%multiple%lender%' AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1`
        );
        if (templateRes.rows.length > 0) {
            templateS3Key = templateRes.rows[0].s3_key;
        }
    } catch (e) {
        console.warn('[IRL PDF] Could not query oo_templates:', e.message);
    }

    if (!templateS3Key) {
        throw new Error('IRL Multiple Lender Form DOCX template not found in oo_templates.');
    }

    console.log(`[IRL PDF] Using template: ${templateS3Key}`);

    // 2. Download DOCX template from S3
    const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: templateS3Key });
    const s3Response = await s3Client.send(getCmd);
    const chunks = [];
    for await (const chunk of s3Response.Body) { chunks.push(chunk); }
    const templateBuffer = Buffer.concat(chunks);

    // 3. Build checkbox variables — ☑ for selected, ☐ for not selected
    const CHECKED = '☑';
    const UNCHECKED = '☐';

    const selectedSet = new Set(selectedLenders.map(l => l.toUpperCase().trim()));
    const lenderVars = {};
    for (const [lenderName, varName] of Object.entries(IRL_LENDER_VARIABLES)) {
        lenderVars[varName] = selectedSet.has(lenderName.toUpperCase()) ? CHECKED : UNCHECKED;
    }

    // 4. Build all template variables
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const templateVars = {
        // Lender checkboxes
        ...lenderVars,

        // Additional questions
        had_ccj: hadCCJ ? CHECKED : UNCHECKED,
        victim_of_scam: victimOfScam ? CHECKED : UNCHECKED,
        problematic_gambling: problematicGambling ? CHECKED : UNCHECKED,

        // Text fields
        client_id: `${fullName} - ${contactId}`,
        client_name: fullName,
        betting_companies: bettingCompanies || '',
        today: today,
        date: today,

        // Nested object for {{claim.lender}} in template
        claim: { lender: contact.intake_lender || '' },

    };

    // Convert signatureBase64 to a Buffer for docx-templates IMAGE command
    const signatureBuffer = signatureBase64
        ? Buffer.from(signatureBase64.split(',')[1], 'base64')
        : null;

    // 5. Pre-process: normalise signature image tag to function-call form
    // docx-templates v4 IMAGE command requires: {{IMAGE signatureImage()}}
    let processedTemplate = templateBuffer;
    try {
        const tZip = new PizZip(templateBuffer);
        const docXml = tZip.file('word/document.xml');
        if (docXml) {
            let xml = docXml.asText();
            // Normalise all variants to canonical function-call form
            xml = xml.replace(/\{\{IMAGE signatureImage\(\)\}\}/g, '{{IMAGE signatureImage()}}');
            xml = xml.replace(/\{\{IMAGE signatureImage\}\}/g, '{{IMAGE signatureImage()}}');
            xml = xml.replace(/\{\{signatureImage\}\}/g, '{{IMAGE signatureImage()}}');
            // Handle split runs (tag split across XML <w:r> elements)
            xml = xml.replace(/\{\{IMAGE signatureImage(?!\()/g, '{{IMAGE signatureImage(');
            xml = xml.replace(/\{\{signatureImage(?!\()/g, '{{IMAGE signatureImage(');
            tZip.file('word/document.xml', xml);
            processedTemplate = tZip.generate({ type: 'nodebuffer' });
            console.log('[IRL PDF] Pre-processed template: signature tag normalised to function-call form');
        }
    } catch (ppErr) {
        console.warn('[IRL PDF] Template pre-processing skipped:', ppErr.message);
    }

    // Remove signatureImage from data (provided via additionalJsContext as a function)
    const { signatureImage: _sigImg, ...templateDataWithoutSig } = templateVars;

    // 6. Fill DOCX template using createReport (same engine as LOA & Cover Letter)
    console.log('[IRL PDF] Filling DOCX template with createReport...');
    let docxBuffer;
    try {
        docxBuffer = await createReport({
            template: processedTemplate,
            data: templateDataWithoutSig,
            additionalJsContext: {
                // docx-templates v4: IMAGE expression must be callable; data must be a Buffer
                signatureImage: () => signatureBuffer ? {
                    width: 5,     // cm
                    height: 2.5,  // cm
                    data: signatureBuffer,
                    extension: '.png',
                } : null,
            },
            cmdDelimiter: ['{{', '}}'],
        });
        console.log('[IRL PDF] DOCX template filled successfully via createReport');
    } catch (crErr) {
        console.warn('[IRL PDF] createReport failed, falling back to Docxtemplater:', crErr.message);
        // Fallback: use Docxtemplater (won't handle images but at least fills text)
        try {
            const zip = new PizZip(templateBuffer);
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: '{{', end: '}}' },
            });
            // Flatten nested objects for Docxtemplater
            const flatVars = { ...templateVars };
            if (flatVars.claim) {
                flatVars['claim.lender'] = flatVars.claim.lender;
                delete flatVars.claim;
            }
            // Remove image objects (Docxtemplater can't handle them)
            if (flatVars.signatureImage && typeof flatVars.signatureImage === 'object') {
                flatVars.signatureImage = '[Signature]';
            }
            doc.render(flatVars);
            docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });
            console.log('[IRL PDF] Fallback: Docxtemplater filled successfully');
        } catch (dtErr) {
            console.error('[IRL PDF] Both createReport and Docxtemplater failed:', dtErr.message);
            throw new Error('Failed to fill IRL template: ' + crErr.message);
        }
    }

    // 6. Convert DOCX to PDF using OnlyOffice (same as LOA & Cover Letter)
    console.log('[IRL PDF] Converting DOCX to PDF via OnlyOffice...');
    let pdfBuffer;
    try {
        pdfBuffer = await convertDocxToPdf(docxBuffer, `IRL_Form_${contactId}.docx`);
        console.log('[IRL PDF] OnlyOffice conversion successful');
    } catch (ooErr) {
        console.warn('[IRL PDF] OnlyOffice failed, trying LibreOffice/Puppeteer fallback:', ooErr.message);
        const libreOfficePath = await findLibreOffice();
        if (libreOfficePath) {
            pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
        } else {
            pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
        }
    }

    // 7. Upload to S3
    const sanitizedFolder = folderPath.replace(/\s+/g, '_');
    const fileName = `IRL_Multiple_Lender_Form_${contactId}.pdf`;
    const s3Key = `${sanitizedFolder}Documents/Other/${fileName}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
    }));

    const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }), { expiresIn: 604800 });

    // 8. Insert document record
    await pool.query(
        `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            contactId,
            fileName,
            'pdf',
            'Multiple Lender Form',
            downloadUrl,
            `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
            ['Multiple Lender Form', 'Generated']
        ]
    );

    console.log(`[IRL PDF] ✅ Generated and uploaded: ${s3Key} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    return { s3Key, downloadUrl };
}

// --- OPENAI CLIENT ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Store chat sessions in memory (in production, use Redis or similar)
const chatSessions = new Map();
// Purge chat sessions older than 2 hours every 30 minutes
setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, session] of chatSessions) {
        if (session.lastAccessed && session.lastAccessed < cutoff) chatSessions.delete(key);
    }
}, 30 * 60 * 1000);

// ============================================================================
// ONLYOFFICE INTEGRATION - In-Memory Storage (Phase 1)
// Will be replaced with database tables in Phase 2
// ============================================================================
const ooTemplates = new Map();
const ooDocuments = new Map();
let ooTemplateIdCounter = 1;
let ooDocumentIdCounter = 1;

const OO_FIRM_DEFAULTS = {
    'firm.name': 'Rowan Rose Solicitors',
    'firm.tradingName': 'Fast Action Claims',
    'firm.address': '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
    'firm.phone': '0161 505 0150',
    'firm.sraNumber': '8000843',
    'firm.entity': 'Rowan Rose Ltd',
    'firm.companyNumber': '12916452',
};

const OO_MOCK_CASE_DATA = {
    // Client
    'client.fullName': 'John Smith',
    'client.firstName': 'John',
    'client.lastName': 'Smith',
    'client.email': 'john@example.com',
    'client.phone': '07700 900000',
    'client.address': '123 Test Street, Manchester M1 1AA',
    'client.dateOfBirth': '01/01/1980',
    // Claim
    'claim.lender': 'Vanquis Bank',
    'claim.clientId': 'RR-1',
    'claim.caseRef': 'RR-2024-0001',
    'claim.claimValue': '£2,500.00',
    // Lender
    'lender.companyName': 'Vanquis Banking Group plc',
    'lender.address': '1 Godwin Street, Bradford BD1 2SU',
    'lender.city': 'Bradford',
    'lender.postcode': 'BD1 2SU',
    'lender.email': '',
    // Firm
    ...OO_FIRM_DEFAULTS,
    // System
    'system.today': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    'system.year': String(new Date().getFullYear()),
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

// Initialise client workflow engine (DB-backed email queue + poller)
clientWorkflow.init(pool, emailTransporter);

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
    let pdfBuffer;
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
        pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
        });
    } finally {
        await browser.close();
    }

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
    let pdfBuffer;
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
        pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', bottom: '0', left: '0', right: '0' } // PDF CSS handles margins
        });
    } finally {
        await browser.close();
    }

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
                    const folderName = buildS3Folder(contact.first_name, contact.last_name, clientId).slice(0, -1);
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

        // Log email sent to action_logs (best effort — find contact by email)
        const contactRes = await pool.query('SELECT id FROM contacts WHERE email = $1', [to]).catch(() => ({ rows: [] }));
        if (contactRes.rows.length > 0) {
            logAction({
                clientId: contactRes.rows[0].id,
                actionType: 'email_sent',
                actionCategory: 'communication',
                description: `Email sent to ${to}: "${subject}"`,
                metadata: { recipient: to, subject, channel: 'nodemailer', messageId: info.messageId }
            });
        }

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

        // Update last login and last active (so they appear online immediately)
        await pool.query('UPDATE users SET last_login = NOW(), last_active_at = NOW() WHERE id = $1', [user.id]);

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
        const { rows } = await pool.query('SELECT id, email, full_name as "fullName", role, is_approved as "isApproved", COALESCE(last_active_at, last_login) as "lastLogin", last_active_at as "lastActiveAt", created_at as "createdAt" FROM users ORDER BY created_at DESC');
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

        // Determine correct content type from file extension so browser displays inline
        const ext = key.split('.').pop()?.toLowerCase();
        const mimeTypes = {
            pdf: 'application/pdf',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            txt: 'text/plain',
            csv: 'text/csv',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            ResponseContentDisposition: 'inline',
            ResponseContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3ClientPathStyle, command, { expiresIn: 3600 });
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

// Generate PDF from OnlyOffice template
app.post('/api/generate-pdf', async (req, res) => {
    const { caseId, documentType } = req.body;

    try {
        console.log(`[PDF API] Request received for case ${caseId}, type: ${documentType}`);

        if (!caseId || !documentType) {
            return res.status(400).json({
                success: false,
                message: 'caseId and documentType are required'
            });
        }

        // Fetch case and contact data
        const caseQuery = `
            SELECT c.*, ct.id as contact_id, ct.first_name, ct.last_name, ct.email, ct.phone,
                   ct.address_line_1, ct.address_line_2, ct.city, ct.state_county, ct.postal_code,
                   ct.previous_address_line_1, ct.previous_address_line_2, ct.previous_city,
                   ct.previous_county, ct.previous_postal_code, ct.previous_addresses,
                   ct.dob, ct.ip_address
            FROM cases c
            JOIN contacts ct ON c.contact_id = ct.id
            WHERE c.id = $1
        `;

        const result = await pool.query(caseQuery, [caseId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Case ${caseId} not found`
            });
        }

        const row = result.rows[0];
        const contact = {
            id: row.contact_id,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            address_line_1: row.address_line_1,
            address_line_2: row.address_line_2,
            city: row.city,
            state_county: row.state_county,
            postal_code: row.postal_code,
            previous_address_line_1: row.previous_address_line_1,
            previous_address_line_2: row.previous_address_line_2,
            previous_city: row.previous_city,
            previous_county: row.previous_county,
            previous_postal_code: row.previous_postal_code,
            previous_addresses: row.previous_addresses,
            dob: row.dob,
            ip_address: row.ip_address
        };

        const caseData = {
            id: row.id,
            contact_id: row.contact_id,
            lender: row.lender,
            claim_value: row.claim_value,
            status: row.status
        };

        // Generate PDF
        const pdfResult = await generatePdfFromCase(contact, caseData, documentType, pool);

        console.log(`[PDF API] PDF generated successfully: ${pdfResult.fileName}`);

        res.json({
            success: true,
            ...pdfResult
        });

    } catch (err) {
        console.error('[PDF API] Error:', err);
        res.status(500).json({
            success: false,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Generate Client Care Letter by contact ID (called by sales_crm worker)
app.post('/api/generate-client-care-letter', async (req, res) => {
    const { contactId } = req.body;

    try {
        if (!contactId) {
            return res.status(400).json({ success: false, message: 'contactId is required' });
        }

        // Fetch contact data
        const contactRes = await pool.query(
            `SELECT id, first_name, last_name, email, phone, address_line_1, address_line_2,
                    city, state_county, postal_code, dob
             FROM contacts WHERE id = $1`,
            [contactId]
        );

        if (contactRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: `Contact ${contactId} not found` });
        }

        const contact = contactRes.rows[0];
        const result = await generateClientCareLetter(contact, pool);

        if (result.skipped) {
            console.log(`[CCL API] Client Care Letter already generated for contact ${contactId}, skipped`);
            return res.json({ success: true, skipped: true, message: 'Already generated' });
        }

        console.log(`[CCL API] ✅ Client Care Letter generated for contact ${contactId}: ${result.fileName}`);
        res.json({ success: true, ...result });

    } catch (err) {
        console.error('[CCL API] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
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
        'MONTHLY ADVANCE LOANS', 'NOVUNA', 'OPOLO', 'PM LOANS', 'POLAR FINANCE', 'POST OFFICE', 'POST OFFICE MONEY',
        'PRA', 'PRA GROUP',
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
                .btn { display: inline-block; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); color: #ffffff !important; font-size: 20px; font-weight: 700; padding: 20px 52px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.35); letter-spacing: 0.3px; border: 3px solid #000000; }
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
                        <h1>Complete Your Lender Selection</h1>
                        <p class="subtitle">Expert Legal Support for Your Financial Claims</p>

                        <p class="greeting">Dear ${clientName},</p>
                        <p>Successful claims can pay out £1,000+. Take a look at the list of lenders we deal with in the link below. Click the button below and select any lenders you may have dealt with in the last 15 years.</p>

                        <div class="btn-container">
                            <a href="${loaLink}" class="btn">Click Here</a>
                            <span class="expiry-note">This secure link expires in 7 days</span>
                        </div>

                        <div class="highlight-box">
                            <span class="highlight-text">Action Required: Select Additional Lenders</span>
                            <p>To maximize your potential compensation, please tell us about any other lenders you have used in the last 15 years.</p>
                        </div>

                        <div class="info-box">
                            <p><strong>Did you know?</strong> Establishing a pattern of irresponsible lending across multiple lenders significantly strengthens your case and can increase your compensation.</p>
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
        const folderPath = buildS3Folder(first_name, last_name, contactId);

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

                // Update signature URL in DB
                await pool.query('UPDATE contacts SET signature_url = $1, signature_2_url = $1 WHERE id = $2', [signatureUrl, contactId]);

                // Insert Signature into documents table
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, 'Signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Signed']]
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

                    console.log(`[Server] Created claim ${claimId} for ${lender_type}. Triggering LOA generation.`);

                    // Trigger LOA generation (skipStatusUpdate=true to keep status as "Extra Lender Selection Form Sent")
                    triggerPdfGenerator(claimId, 'LOA', true).catch(err => {
                        console.error(`❌ LOA generation trigger failed for case ${claimId}:`, err.message);
                    });

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

                // Generate Client Care Letter (once per contact)
                try {
                    const cclContact = { id: contactId, first_name, last_name, email, phone, address_line_1: finalAddressLine1, address_line_2: finalAddressLine2, city: finalCity, state_county: finalState, postal_code };
                    const cclResult = await generateClientCareLetter(cclContact, pool);
                    if (cclResult.skipped) {
                        console.log(`[Background] Client Care Letter already generated for contact ${contactId}, skipped`);
                    } else {
                        console.log(`[Background] ✅ Client Care Letter generated for contact ${contactId}`);
                    }
                } catch (cclErr) {
                    console.error(`[Background] Client Care Letter generation failed for contact ${contactId}:`, cclErr.message);
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

                // Queue onboarding workflow emails (intake source — extra lender already sent above)
                clientWorkflow.queueOnboardingEmails(contactId, { skipIdUpload: false, source: 'intake' }).catch(e => console.error('[Workflow] Queue error:', e.message));

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
        const safeName = `${sanitizeNameForS3(first_name)}_${sanitizeNameForS3(last_name)}`;

        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        // Sanitize category for S3 path
        const sanitizedCategory = docCategory.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Check for existing file with same name in this category
        let s3FileName = `${baseName}${ext}`;
        const folderPath = `${safeName}_${contact_id}/Documents/${sanitizedCategory}`;

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

        crmEvents.emit('document.uploaded', { documentId: rows[0].id, contactId: parseInt(contact_id), data: rows[0] });
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
        const safeName = `${sanitizeNameForS3(first_name)}_${sanitizeNameForS3(last_name)}`;

        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        // Sanitize lender and category names for S3 path
        const sanitizedLender = lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const sanitizedCategory = category.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Reference spec for standard naming
        const refSpec = `${contact_id}${claim_id || ''}`;
        const clientName = `${(first_name || '').replace(/[\/\\]/g, '')} ${(last_name || '').replace(/[\/\\]/g, '')}`;

        let s3FileName;
        let folderPath;
        let key;

        // Special handling for LOA and Cover Letter - store directly in lender folder with DSAR-compatible naming
        if (category === 'Letter of Authority') {
            s3FileName = `${refSpec} - ${clientName} - ${sanitizedLender} - LOA${ext}`;
            folderPath = `${safeName}_${contact_id}/Lenders/${sanitizedLender}`;
            key = `${folderPath}/${s3FileName}`;
        } else if (category === 'Cover Letter') {
            s3FileName = `${refSpec} - ${clientName} - ${sanitizedLender} - COVER LETTER${ext}`;
            folderPath = `${safeName}_${contact_id}/Lenders/${sanitizedLender}`;
            key = `${folderPath}/${s3FileName}`;
        } else {
            // Standard category - store in subfolder
            s3FileName = `${baseName}${ext}`;
            folderPath = `${safeName}_${contact_id}/Lenders/${sanitizedLender}/${sanitizedCategory}`;

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
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags, claim_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [contact_id, s3FileName, docType, category, s3Url, `${(file.size / 1024).toFixed(1)} KB`, [lender, category, 'claim-document', `Original: ${originalName}`], claim_id || null]
        );

        console.log(`[Claim Doc Upload] "${originalName}" → "${key}" for contact ${contact_id}, lender ${lender}, category ${category}`);
        crmEvents.emit('document.uploaded', { documentId: rows[0].id, contactId: parseInt(contact_id), data: rows[0] });
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
        const docName = original_name || file.originalname;
        const key = `${buildS3Folder(contact.first_name, contact.last_name, contact_id)}Documents/${docName}`;

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
        const { contact_id, claim_id, lender } = req.query;
        const conditions = [];
        const params = [];

        if (contact_id) {
            params.push(parseInt(contact_id));
            conditions.push(`contact_id = $${params.length}`);
        }

        // claim_id → resolve lender name from cases table
        if (claim_id) {
            const claimRes = await pool.query('SELECT lender FROM cases WHERE id = $1', [parseInt(claim_id)]);
            if (claimRes.rows.length > 0 && claimRes.rows[0].lender) {
                params.push(claimRes.rows[0].lender);
                conditions.push(`tags @> ARRAY[$${params.length}]::text[]`);
            } else {
                return res.json([]); // claim not found or no lender
            }
        } else if (lender) {
            params.push(lender);
            conditions.push(`tags @> ARRAY[$${params.length}]::text[]`);
        }

        let query = 'SELECT * FROM documents';
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY created_at DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DOCUMENT STATUS COUNTS (lightweight dashboard endpoint) ---
app.get('/api/documents/status-counts', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { rows } = await pool.query(`
            SELECT
                COALESCE(document_status, 'Draft') AS status,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE created_at::date = $1 OR updated_at::date = $1)::int AS today
            FROM documents
            GROUP BY COALESCE(document_status, 'Draft')
        `, [today]);
        res.json(rows);
    } catch (err) {
        console.error('[Documents] Status counts error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- DOCUMENTS BY STATUS (paginated drill-down) ---
app.get('/api/documents/by-status', async (req, res) => {
    try {
        const { status, search, page = 1, limit = 200 } = req.query;
        const conditions = [];
        const params = [];

        if (status) {
            params.push(status);
            conditions.push(`COALESCE(d.document_status, 'Draft') = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(d.name ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`);
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { rows } = await pool.query(`
            SELECT d.*, c.full_name AS contact_name
            FROM documents d
            LEFT JOIN contacts c ON d.contact_id = c.id
            ${where}
            ORDER BY d.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, parseInt(limit), offset]);

        res.json(rows);
    } catch (err) {
        console.error('[Documents] By-status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Shared checklist computation helper ─────────────────────────────────────
function computeChecklist(docs, extraLenders) {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 weeks

    const identification = docs.some(d => {
        const n = (d.name || '').toLowerCase();
        const c = (d.category || '').toLowerCase();
        return c === 'id document' || n.includes('passport') || n.includes('driving licence') || n.includes('driving license') || n.includes('national id');
    });

    const extraLender =
        Boolean((extraLenders || '').trim()) ||
        docs.some(d => {
            const n = (d.name || '').toLowerCase();
            const c = (d.category || '').toLowerCase();
            return c.includes('extra lender') || c.includes('multiple lender') || n.includes('extra lender') || n.includes('multiple lender');
        });

    const questionnaire = docs.some(d => {
        const n = (d.name || '').toLowerCase();
        const c = (d.category || '').toLowerCase();
        return n.includes('questionnaire') || c.includes('questionnaire');
    });

    // POA: must be a bank statement, utility bill, or council tax bill dated within 12 weeks
    const poa = docs.some(d => {
        const n = (d.name || '').toLowerCase();
        const isRecent = d.created_at ? new Date(d.created_at) >= twelveWeeksAgo : false;
        const isValidType = n.includes('bank statement') || n.includes('bank_statement') ||
            n.includes('utility bill') || n.includes('utility_bill') ||
            n.includes('council tax') || n.includes('council_tax');
        return isValidType && isRecent;
    });

    return { identification, extraLender, questionnaire, poa };
}

// ── POST /api/contacts/:id/sync-checklist ── Derive & persist checklist from DB docs
app.post('/api/contacts/:id/sync-checklist', async (req, res) => {
    try {
        const contactId = parseInt(req.params.id);
        const [docsRes, contactRes] = await Promise.all([
            pool.query('SELECT name, category, created_at FROM documents WHERE contact_id = $1', [contactId]),
            pool.query('SELECT extra_lenders FROM contacts WHERE id = $1', [contactId])
        ]);
        if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        const checklist = computeChecklist(docsRes.rows, contactRes.rows[0].extra_lenders);
        await pool.query(
            `UPDATE contacts SET document_checklist = $1::jsonb WHERE id = $2`,
            [JSON.stringify(checklist), contactId]
        );
        res.json(checklist);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/contacts/:id/documents', async (req, res) => {
    try {
        const contactId = req.params.id;
        const { claim_id, lender: lenderParam } = req.query;

        // Resolve lender filter from claim_id if provided
        let lenderFilter = lenderParam || null;
        if (claim_id && !lenderFilter) {
            const claimRes = await pool.query('SELECT lender FROM cases WHERE id = $1 AND contact_id = $2', [parseInt(claim_id), parseInt(contactId)]);
            if (claimRes.rows.length === 0) return res.status(404).json({ error: 'Claim not found for this contact' });
            lenderFilter = claimRes.rows[0].lender || null;
        }

        // Get contact info for S3 folder path
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contactId]);
        if (contactRes.rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        const { first_name, last_name } = contactRes.rows[0];
        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

        // Dynamically find ALL S3 folders for this contact.
        // Special characters (like /) in names can create multiple folders.
        // Find all folders ending with _<contactId>/ to consolidate documents.
        const nameCandidates = new Set([
            `${first_name}_${last_name}`.replace(/\s+/g, '_'),
            `${first_name}_${last_name}`,
            `${first_name}_${last_name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        ]);

        const allBaseFolders = [];
        const seenFolders = new Set();
        for (const name of nameCandidates) {
            const testPrefix = `${name}_${contactId}/`;
            if (seenFolders.has(testPrefix)) continue;
            const probe = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: testPrefix, MaxKeys: 1 }));
            if (probe.Contents && probe.Contents.length > 0) {
                allBaseFolders.push(testPrefix);
                seenFolders.add(testPrefix);
            }
        }

        // Also scan top-level folders for anything ending with _<contactId>/
        // This catches folders created with different name sanitization
        let continuationTokenTop = undefined;
        do {
            const topLevel = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Delimiter: '/', MaxKeys: 1000, ContinuationToken: continuationTokenTop }));
            for (const p of (topLevel.CommonPrefixes || [])) {
                if (p.Prefix && p.Prefix.endsWith(`_${contactId}/`) && !seenFolders.has(p.Prefix)) {
                    allBaseFolders.push(p.Prefix);
                    seenFolders.add(p.Prefix);
                }
            }
            continuationTokenTop = topLevel.IsTruncated ? topLevel.NextContinuationToken : undefined;
        } while (continuationTokenTop);

        if (allBaseFolders.length === 0) {
            return res.json([]); // No S3 folder for this contact
        }

        console.log(`[Documents] S3 folders for contact ${contactId}: ${allBaseFolders.join(', ')}${lenderFilter ? ` (lender: ${lenderFilter})` : ''}`);

        // Scan S3 subfolders across ALL base folders
        let foldersToScan;
        if (lenderFilter) {
            const sanitizedLender = lenderFilter.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
            foldersToScan = allBaseFolders.map(bf => (
                { prefix: `${bf}Lenders/${sanitizedLender}/`, defaultCategory: 'LOA' }
            ));
        } else {
            foldersToScan = allBaseFolders.flatMap(bf => [
                { prefix: `${bf}Documents/`, defaultCategory: 'Client' },
                { prefix: `${bf}Lenders/`, defaultCategory: 'LOA' },
                { prefix: `${bf}LOA/`, defaultCategory: 'LOA' },
                { prefix: `${bf}Terms-and-Conditions/`, defaultCategory: 'Legal' }
            ]);
        }
        const documents = [];

        const extToType = {
            'pdf': 'pdf', 'doc': 'docx', 'docx': 'docx',
            'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image',
            'xls': 'spreadsheet', 'xlsx': 'spreadsheet',
            'txt': 'txt', 'html': 'html'
        };

        for (const folder of foldersToScan) {
            let continuationToken;
            do {
                const listCmd = new ListObjectsV2Command({
                    Bucket: BUCKET_NAME,
                    Prefix: folder.prefix,
                    ContinuationToken: continuationToken
                });
                const result = await s3Client.send(listCmd);
                continuationToken = result.NextContinuationToken;

                if (!result.Contents) continue;

                for (const obj of result.Contents) {
                    if (obj.Key.endsWith('/')) continue; // skip folder markers

                    const relativePath = obj.Key.substring(folder.prefix.length);
                    if (!relativePath) continue;

                    const pathParts = relativePath.split('/');
                    const baseName = pathParts[pathParts.length - 1];
                    const ext = baseName.split('.').pop()?.toLowerCase() || 'unknown';
                    const fileType = extToType[ext] || 'unknown';

                    // Auto-detect category from subfolder structure
                    let category = folder.defaultCategory;

                    // Map sanitized folder names back to proper category names
                    const CATEGORY_FOLDER_MAP = {
                        'id document': 'ID Document', 'proof of address': 'Proof of Address',
                        'bank statement': 'Bank Statement', 'dsar': 'DSAR',
                        'letter of authority': 'Letter of Authority', 'cover letter': 'Cover Letter',
                        'complaint letter': 'Complaint Letter', 'final response letter frl': 'Final Response Letter (FRL)',
                        'counter response': 'Counter Response', 'fos complaint form': 'FOS Complaint Form',
                        'fos decision': 'FOS Decision', 'offer letter': 'Offer Letter',
                        'acceptance form': 'Acceptance Form', 'settlement agreement': 'Settlement Agreement',
                        'invoice': 'Invoice', 'other': 'Other', 'client': 'Client', 'legal': 'Legal'
                    };

                    // Extract category from subfolder path
                    if (folder.prefix.includes('/Lenders/')) {
                        // Lenders/{Lender}/{Category}/file.pdf → pathParts: [Lender, Category, file]
                        if (pathParts.length > 2) {
                            const subfolderName = pathParts[1].replace(/_/g, ' ').toLowerCase();
                            if (CATEGORY_FOLDER_MAP[subfolderName]) {
                                category = CATEGORY_FOLDER_MAP[subfolderName];
                            }
                        }
                    } else if (folder.prefix.includes('/Documents/')) {
                        // Documents/{Category}/file.pdf → pathParts: [Category, file]
                        if (pathParts.length > 1) {
                            const subfolderName = pathParts[0].replace(/_/g, ' ').toLowerCase();
                            if (CATEGORY_FOLDER_MAP[subfolderName]) {
                                category = CATEGORY_FOLDER_MAP[subfolderName];
                            }
                        }
                    }

                    // Filename-based detection (overrides folder-based for LOA/Cover Letter)
                    if (baseName.includes('Cover_Letter') || baseName.includes('COVER LETTER')) category = 'Cover Letter';
                    else if (baseName.includes('_LOA') || baseName.includes(' - LOA.pdf') || baseName.includes(' - LOA ')) category = 'LOA';
                    if (folder.prefix.includes('Terms-and-Conditions')) category = 'Legal';

                    // Extract lender tag from path
                    const tags = [];
                    if (folder.prefix.includes('/Lenders/') && pathParts.length > 1) {
                        const lenderName = pathParts[0].replace(/_/g, ' ');
                        if (lenderName && lenderName !== baseName) tags.push(lenderName);
                        // Mark all documents under Lenders/ as claim documents
                        tags.push('claim-document');
                    }
                    if (category === 'LOA' || category === 'Cover Letter') {
                        const lenderMatch = baseName.match(/ - ([A-Z0-9_ ]+) - (LOA|COVER LETTER)/i);
                        if (lenderMatch && lenderMatch[1]) {
                            const lenderFromFile = lenderMatch[1].trim();
                            if (!tags.includes(lenderFromFile)) tags.push(lenderFromFile);
                        }
                    }

                    const sizeKB = obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : 'Unknown';

                    documents.push({
                        id: obj.Key,  // use S3 key as unique ID
                        contact_id: parseInt(contactId),
                        name: baseName,
                        type: fileType,
                        category,
                        lender: null,
                        url: obj.Key,  // store the S3 key; frontend uses secure-url endpoint to get signed URL
                        size: sizeKB,
                        tags,
                        created_at: obj.LastModified || new Date(),
                        s3_key: obj.Key
                    });
                }
            } while (continuationToken);
        }

        // Sort by date descending (newest first)
        documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Merge lender + category from the documents DB table (written by PATCH /api/crm/documents/update)
        try {
            const dbDocs = await pool.query(
                'SELECT name, lender, category, url FROM documents WHERE contact_id = $1 AND lender IS NOT NULL',
                [parseInt(contactId)]
            );
            if (dbDocs.rows.length > 0) {
                for (const doc of documents) {
                    // Match DB doc to S3 doc: by name OR by S3 key in the DB url
                    // DB urls have %20-encoded spaces; S3 SDK returns keys with literal spaces
                    const match = dbDocs.rows.find(r =>
                        r.name === doc.name ||
                        (r.url && doc.s3_key && (
                            r.url.includes(doc.s3_key) ||
                            decodeURIComponent(r.url).includes(doc.s3_key)
                        ))
                    );
                    if (match) {
                        if (match.lender) doc.lender = match.lender;
                        if (match.category) doc.category = match.category;
                    }
                }
                console.log(`[Documents] Merged lender from ${dbDocs.rows.length} DB docs for contact ${contactId}`);
            }
        } catch (e) {
            console.warn('[Documents] DB lender merge skipped:', e.message);
        }

        // Merge saved lender assignments from document_lender_map
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS document_lender_map (
                    s3_key TEXT PRIMARY KEY,
                    contact_id INTEGER NOT NULL,
                    lender TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            const lenderRes = await pool.query(
                'SELECT s3_key, lender FROM document_lender_map WHERE contact_id = $1',
                [parseInt(contactId)]
            );
            if (lenderRes.rows.length > 0) {
                const lenderMap = {};
                for (const row of lenderRes.rows) lenderMap[row.s3_key] = row.lender;
                const systemTagSet = new Set([
                    'Cover Letter', 'LOA', 'T&C', 'Signature', 'Uploaded', 'Previous Address', 'Signed', 'LOA Form',
                    'claim-document', 'Client', 'Legal', 'ID Document', 'Proof of Address', 'Bank Statement',
                    'DSAR', 'Letter of Authority', 'Complaint Letter', 'Final Response Letter (FRL)',
                    'Counter Response', 'FOS Complaint Form', 'FOS Decision', 'Offer Letter',
                    'Acceptance Form', 'Settlement Agreement', 'Invoice', 'Other'
                ]);
                for (const doc of documents) {
                    if (lenderMap[doc.id]) {
                        // Replace auto-detected lender tags with the saved one
                        const otherTags = (doc.tags || []).filter(t => systemTagSet.has(t) || t.startsWith('Original:'));
                        doc.tags = [lenderMap[doc.id], ...otherTags];
                    }
                }
            }
        } catch (e) {
            // Non-fatal — return documents without lender merge if table not ready
            console.warn('[Documents] lender merge skipped:', e.message);
        }

        // Merge saved category assignments from document_category_map
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS document_category_map (
                    s3_key TEXT PRIMARY KEY,
                    contact_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            const catRes = await pool.query(
                'SELECT s3_key, category FROM document_category_map WHERE contact_id = $1',
                [parseInt(contactId)]
            );
            if (catRes.rows.length > 0) {
                const catMap = {};
                for (const row of catRes.rows) catMap[row.s3_key] = row.category;
                for (const doc of documents) {
                    if (catMap[doc.id]) {
                        doc.category = catMap[doc.id];
                    }
                }
            }
        } catch (e) {
            console.warn('[Documents] category merge skipped:', e.message);
        }

        res.json(documents);
    } catch (err) {
        console.error('[Documents] S3 list error:', err);
        res.status(500).json({ error: err.message });
    }
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

        crmEvents.emit('document.status_changed', { documentId: parseInt(id), contactId: doc.contact_id, data: doc, newStatus: status, previousStatus: previous_status });
        res.json({ success: true, document: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- PATCH /api/crm/documents/reassign --- Reassign document to different contact/claim
// Accepts: { doc_id (numeric), s3_key (string), or doc_name (string) } + contact_id / claim_id
app.patch('/api/crm/documents/reassign', async (req, res) => {
    const { doc_id, s3_key, doc_name, contact_id, claim_id, userId, userName } = req.body;

    if (contact_id === undefined && claim_id === undefined) {
        return res.status(400).json({ error: 'No fields to update. Provide contact_id or claim_id.' });
    }
    if (!doc_id && !s3_key && !doc_name) {
        return res.status(400).json({ error: 'Provide doc_id, s3_key, or doc_name to identify the document.' });
    }

    try {
        // Look up document by numeric id, S3 key, or filename
        let existing;
        if (doc_id) {
            existing = await pool.query(`SELECT * FROM documents WHERE id = $1`, [parseInt(doc_id)]);
        } else if (s3_key) {
            // url column stores presigned S3 URLs with %20 for spaces — try both encoded and raw
            const encodedKey = s3_key.split('/').map(p => encodeURIComponent(p)).join('/');
            existing = await pool.query(
                `SELECT * FROM documents WHERE url LIKE '%' || $1 || '%' OR url LIKE '%' || $2 || '%' OR name = $3 LIMIT 1`,
                [s3_key, encodedKey, s3_key.split('/').pop()]
            );
        } else if (doc_name) {
            existing = await pool.query(`SELECT * FROM documents WHERE name = $1 LIMIT 1`, [doc_name]);
        } else {
            return res.status(400).json({ error: 'Provide doc_id, s3_key, or doc_name' });
        }
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const oldDoc = existing.rows[0];

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (contact_id !== undefined) {
            // Validate target contact exists
            const contactCheck = await pool.query(`SELECT id FROM contacts WHERE id = $1`, [contact_id]);
            if (contactCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Target contact not found' });
            }
            updates.push(`contact_id = $${paramCount++}`);
            values.push(contact_id);
        }

        if (claim_id !== undefined) {
            if (claim_id !== null) {
                const claimCheck = await pool.query(`SELECT id FROM cases WHERE id = $1`, [claim_id]);
                if (claimCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Target claim not found' });
                }
            }
            updates.push(`claim_id = $${paramCount++}`);
            values.push(claim_id);
        }

        const docId = oldDoc.id;
        values.push(docId);
        const query = `UPDATE documents SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;
        const { rows } = await pool.query(query, values);

        // Log the reassignment
        const changedParts = [];
        if (contact_id !== undefined) changedParts.push(`contact ${oldDoc.contact_id} -> ${contact_id}`);
        if (claim_id !== undefined) changedParts.push(`claim ${oldDoc.claim_id} -> ${claim_id}`);

        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                contact_id || oldDoc.contact_id, 'agent', userId || 'api', userName || 'API',
                'document_reassigned', 'documents',
                `Document "${oldDoc.name}" reassigned: ${changedParts.join(', ')}`,
                JSON.stringify({ document_id: docId, old_contact_id: oldDoc.contact_id, new_contact_id: contact_id, old_claim_id: oldDoc.claim_id, new_claim_id: claim_id })
            ]
        );

        console.log(`[API documents/reassign] doc ${docId} reassigned: ${changedParts.join(', ')}`);
        res.json(rows[0]);
    } catch (err) {
        console.error('[API documents/reassign] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- DOCUMENT DELETE (delete from DB and S3) ---
app.delete('/api/documents/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const bucketName = process.env.S3_BUCKET_NAME;

        // Check if id is an S3 key (contains '/') or a DB integer
        const isS3Key = id.includes('/') || id.includes('_');
        let s3Key, docName, contactId;

        if (isS3Key) {
            // New flow: id is the S3 key directly
            s3Key = decodeURIComponent(id);
            docName = s3Key.split('/').pop();
            // Extract contact_id from the key pattern: FirstName_LastName_ID/...
            const folderMatch = s3Key.match(/_(\d+)\//);
            contactId = folderMatch ? folderMatch[1] : null;
        } else {
            // Legacy flow: id is a DB integer
            const { rows } = await pool.query('SELECT id, name, url, contact_id FROM documents WHERE id = $1', [id]);
            if (rows.length === 0) return res.status(404).json({ success: false, message: 'Document not found' });
            const doc = rows[0];
            docName = doc.name;
            contactId = doc.contact_id;
            // Extract S3 key from URL
            s3Key = doc.url;
            if (s3Key && s3Key.startsWith('http')) {
                try {
                    const urlObj = new URL(s3Key);
                    s3Key = decodeURIComponent(urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname);
                    if (s3Key.startsWith(bucketName + '/')) s3Key = s3Key.substring(bucketName.length + 1);
                } catch (e) { /* use raw */ }
            }
            // Also clean from DB
            await pool.query('DELETE FROM documents WHERE id = $1', [id]);
        }

        // Delete from S3
        if (s3Key) {
            console.log(`🗑️  Deleting document from S3: ${s3Key}`);
            await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: s3Key }));
            console.log(`✅ Deleted from S3: ${s3Key}`);
        }

        // Log the deletion
        if (contactId) {
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, 'agent', 'system', 'document_deleted', 'documents', $2, $3)`,
                [contactId, `Document "${docName}" deleted`, JSON.stringify({ s3_key: s3Key, name: docName })]
            );
        }

        console.log(`✅ Document deleted: ${docName}`);
        res.json({ success: true, message: 'Document deleted successfully', deletedDocument: docName });
    } catch (err) {
        console.error('❌ Error deleting document:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- DOCUMENT LENDER UPDATE ---
// Documents in the contacts tab are fetched from S3 and use the S3 key as their ID.
// We store lender overrides in a dedicated table keyed by S3 key.
app.patch('/api/documents/lender', async (req, res) => {
    const { s3_key, contact_id, lender } = req.body;

    if (!s3_key || !contact_id) {
        return res.status(400).json({ error: 's3_key and contact_id are required' });
    }
    if (typeof lender !== 'string') {
        return res.status(400).json({ error: 'lender must be a string' });
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_lender_map (
                s3_key TEXT PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                lender TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        if (lender.trim()) {
            await pool.query(`
                INSERT INTO document_lender_map (s3_key, contact_id, lender, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (s3_key) DO UPDATE SET lender = EXCLUDED.lender, contact_id = EXCLUDED.contact_id, updated_at = NOW()
            `, [s3_key, contact_id, lender.trim()]);
        } else {
            await pool.query('DELETE FROM document_lender_map WHERE s3_key = $1', [s3_key]);
        }

        // Dual-write: also update documents.lender directly so DSAR worker can find it
        try {
            const fileName = s3_key.split('/').pop();
            const lenderVal = lender.trim() || null;
            await pool.query(
                `UPDATE documents SET lender = $1, updated_at = NOW()
                 WHERE contact_id = $2 AND (url LIKE $3 OR name = $4)`,
                [lenderVal, contact_id, `%${s3_key}%`, fileName]
            );
        } catch (dualErr) {
            console.warn('[PATCH /api/documents/lender] dual-write skipped:', dualErr.message);
        }

        res.json({ success: true, lender: lender.trim() });
    } catch (err) {
        console.error('[PATCH /api/documents/lender]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- PATCH /api/documents/category --- Update document category (S3-based docs)
app.patch('/api/documents/category', async (req, res) => {
    const { s3_key, contact_id, category } = req.body;

    if (!s3_key || !contact_id) {
        return res.status(400).json({ error: 's3_key and contact_id are required' });
    }
    if (typeof category !== 'string') {
        return res.status(400).json({ error: 'category must be a string' });
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS document_category_map (
                s3_key TEXT PRIMARY KEY,
                contact_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        if (category.trim()) {
            await pool.query(`
                INSERT INTO document_category_map (s3_key, contact_id, category, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (s3_key) DO UPDATE SET category = EXCLUDED.category, contact_id = EXCLUDED.contact_id, updated_at = NOW()
            `, [s3_key, contact_id, category.trim()]);
        } else {
            await pool.query('DELETE FROM document_category_map WHERE s3_key = $1', [s3_key]);
        }

        // Dual-write: also update documents.category directly so DSAR worker can find it
        try {
            const fileName = s3_key.split('/').pop();
            const catVal = category.trim() || null;
            await pool.query(
                `UPDATE documents SET category = $1, updated_at = NOW()
                 WHERE contact_id = $2 AND (url LIKE $3 OR name = $4)`,
                [catVal, contact_id, `%${s3_key}%`, fileName]
            );
        } catch (dualErr) {
            console.warn('[PATCH /api/documents/category] dual-write skipped:', dualErr.message);
        }

        res.json({ success: true, category: category.trim() });
    } catch (err) {
        console.error('[PATCH /api/documents/category]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- PATCH /api/crm/documents/update --- Update document lender and/or category
// Accepts: id (numeric, preferred), s3_key (clean S3 path or presigned URL), lender, category
app.patch('/api/crm/documents/update', async (req, res) => {
    const { id, s3_key, lender, category } = req.body;

    if (!id && !s3_key) {
        return res.status(400).json({ error: 'Either id or s3_key is required' });
    }
    if (lender === undefined && category === undefined) {
        return res.status(400).json({ error: 'At least one of lender or category must be provided' });
    }

    try {
        // Look up document — prefer numeric id, then exact url match, then partial S3 key match
        let docRes;
        if (id) {
            docRes = await pool.query('SELECT id, contact_id, url FROM documents WHERE id = $1', [id]);
        }
        if (!docRes || docRes.rows.length === 0) {
            // Try exact url match (works if caller passes the full presigned URL)
            if (s3_key) {
                docRes = await pool.query('SELECT id, contact_id, url FROM documents WHERE url = $1', [s3_key]);
            }
        }
        if (!docRes || docRes.rows.length === 0) {
            // Try partial match — the url column contains presigned URLs that include the S3 key as a path
            if (s3_key) {
                const cleanKey = s3_key.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
                docRes = await pool.query('SELECT id, contact_id, url FROM documents WHERE url LIKE $1 LIMIT 1', [`%${cleanKey}%`]);
            }
        }
        if (!docRes || docRes.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found. Pass numeric id or a valid s3_key.' });
        }
        const docId = docRes.rows[0].id;
        const contactId = docRes.rows[0].contact_id;

        // Build a single UPDATE with all provided fields
        const setClauses = [];
        const values = [];
        let paramIdx = 1;

        if (lender !== undefined) {
            const lenderVal = (typeof lender === 'string' && lender.trim()) ? lender.trim() : null;
            setClauses.push(`lender = $${paramIdx++}`);
            values.push(lenderVal);
        }
        if (category !== undefined) {
            const catVal = (typeof category === 'string' && category.trim()) ? category.trim() : null;
            setClauses.push(`category = $${paramIdx++}`);
            values.push(catVal);
        }

        setClauses.push('updated_at = NOW()');
        values.push(docId);

        const result = await pool.query(
            `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING id, lender, category`,
            values
        );

        console.log(`[PATCH /api/crm/documents/update] Updated doc ${docId}:`, result.rows[0]);
        res.json({ success: true, id: docId, lender: result.rows[0]?.lender, category: result.rows[0]?.category });
    } catch (err) {
        console.error('[PATCH /api/crm/documents/update]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- GET /api/crm/documents/dropdown/lenders --- All available lenders for dropdown
app.get('/api/crm/documents/dropdown/lenders', async (req, res) => {
    try {
        const { search } = req.query;
        const lendersPath = path.join(__dirname, 'all_lenders_details.json');
        const raw = fs.readFileSync(lendersPath, 'utf8');
        const allLenders = JSON.parse(raw);
        let lenderNames = allLenders.map(l => l.lender).filter(Boolean);

        // Deduplicate and sort
        lenderNames = [...new Set(lenderNames)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        // If search query provided, filter by partial match (case-insensitive)
        if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            lenderNames = lenderNames.filter(name => name.toLowerCase().includes(q));
        }

        res.json({ lenders: lenderNames, total: lenderNames.length });
    } catch (err) {
        console.error('[GET /api/crm/documents/dropdown/lenders]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- GET /api/crm/documents/dropdown/categories --- All document categories for dropdown
app.get('/api/crm/documents/dropdown/categories', async (req, res) => {
    const categories = [
        'ID Document',
        'Proof of Address',
        'Bank Statement',
        'DSAR',
        'DSAR Response',
        'Letter of Authority',
        'LOA',
        'Cover Letter',
        'Complaint Letter',
        'Client Care Letter',
        'Final Response Letter (FRL)',
        'Counter Response',
        'FOS Complaint Form',
        'FOS Decision',
        'Offer Letter',
        'Acceptance Form',
        'Settlement Agreement',
        'Invoice',
        'Extra Lender',
        'Questionnaire',
        'Client',
        'Legal',
        'Other'
    ];
    res.json({ categories });
});

// --- GET /api/crm/documents --- Bulk list all documents with pagination
app.get('/api/crm/documents', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit) || 1000));
        const offset = (page - 1) * limit;
        const { lender, category, contact_id } = req.query;

        const conditions = [];
        const params = [];

        if (contact_id) {
            params.push(parseInt(contact_id));
            conditions.push(`d.contact_id = $${params.length}`);
        }
        if (lender) {
            params.push(lender);
            conditions.push(`d.lender ILIKE $${params.length}`);
        }
        if (category) {
            params.push(category);
            conditions.push(`d.category ILIKE $${params.length}`);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get total count — read lender & category directly from documents table
        const countRes = await pool.query(`
            SELECT COUNT(*) FROM documents d
            ${whereClause}
        `, params);
        const total = parseInt(countRes.rows[0].count);

        // Fetch page
        const dataParams = [...params, limit, offset];
        const { rows } = await pool.query(`
            SELECT d.id, d.url AS s3_key, d.name, d.contact_id,
                   d.category,
                   d.lender,
                   d.created_at
            FROM documents d
            ${whereClause}
            ORDER BY d.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, dataParams);

        res.json({
            documents: rows,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error('[GET /api/crm/documents]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- DELETE /api/crm/documents/:id --- Delete a document by numeric ID (auth required)
app.delete('/api/crm/documents/:id', crmApiKeyAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Document id must be a numeric value' });
    }

    try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const bucketName = process.env.S3_BUCKET_NAME;

        // Fetch document record first
        const { rows } = await pool.query('SELECT id, name, url, contact_id FROM documents WHERE id = $1', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const doc = rows[0];

        // Extract S3 key from the presigned URL and delete from S3
        if (doc.url) {
            try {
                const urlObj = new URL(doc.url);
                let s3Key = decodeURIComponent(urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname);
                if (s3Key.startsWith(bucketName + '/')) s3Key = s3Key.substring(bucketName.length + 1);
                await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: s3Key }));
                console.log(`[DELETE /api/crm/documents/${id}] S3 object deleted: ${s3Key}`);
            } catch (s3Err) {
                // Non-fatal — log and continue to delete DB record regardless
                console.warn(`[DELETE /api/crm/documents/${id}] S3 delete skipped: ${s3Err.message}`);
            }
        }

        // Delete from DB
        await pool.query('DELETE FROM documents WHERE id = $1', [id]);
        console.log(`[DELETE /api/crm/documents/${id}] DB record deleted (contact_id: ${doc.contact_id}, name: ${doc.name})`);

        res.json({ success: true, message: 'Document deleted', id, name: doc.name });
    } catch (err) {
        console.error(`[DELETE /api/crm/documents/${id}]`, err);
        res.status(500).json({ error: err.message });
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

// --- DOCUMENT JOURNEY TRACKING (all sent documents with their journey) ---
app.get('/api/documents/journey', async (req, res) => {
    try {
        const { page = 1, limit = 100, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let where = "WHERE d.document_status != 'Draft'";
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            where += ` AND (d.name ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`;
        }

        const { rows } = await pool.query(`
            SELECT
                d.id, d.name, d.document_status, d.tracking_token,
                d.sent_at, d.created_at, d.updated_at,
                d.contact_id, d.category,
                c.full_name AS contact_name,
                c.email AS contact_email,
                (SELECT json_agg(json_build_object(
                    'event_type', dte.event_type,
                    'occurred_at', dte.occurred_at,
                    'ip_address', dte.ip_address
                ) ORDER BY dte.occurred_at ASC)
                FROM document_tracking_events dte WHERE dte.document_id = d.id
                ) AS tracking_events
            FROM documents d
            LEFT JOIN contacts c ON d.contact_id = c.id
            ${where}
            ORDER BY COALESCE(d.sent_at, d.updated_at, d.created_at) DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, parseInt(limit), offset]);

        // Also get total count
        const countRes = await pool.query(
            `SELECT COUNT(*)::int AS total FROM documents d LEFT JOIN contacts c ON d.contact_id = c.id ${where}`,
            params
        );

        res.json({ documents: rows, total: countRes.rows[0].total });
    } catch (err) {
        console.error('[Documents] Journey error:', err);
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
        const { ListObjectsV2Command: ListCmd } = await import('@aws-sdk/client-s3');

        // Find ALL S3 folders for this contact (handles special chars creating multiple folders)
        const nameCandidates = new Set([
            `${first_name}_${last_name}`.replace(/\s+/g, '_'),
            `${first_name}_${last_name}`,
            `${first_name}_${last_name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        ]);
        const allSyncFolders = [];
        const seenSync = new Set();
        for (const name of nameCandidates) {
            const testPrefix = `${name}_${contactId}/`;
            if (seenSync.has(testPrefix)) continue;
            const probe = await s3Client.send(new ListCmd({ Bucket: BUCKET_NAME, Prefix: testPrefix, MaxKeys: 1 }));
            if (probe.Contents && probe.Contents.length > 0) {
                allSyncFolders.push(testPrefix);
                seenSync.add(testPrefix);
            }
        }
        // Also scan top-level for any other folders ending with _<contactId>/
        let contTokenSync = undefined;
        do {
            const topLevel = await s3Client.send(new ListCmd({ Bucket: BUCKET_NAME, Delimiter: '/', MaxKeys: 1000, ContinuationToken: contTokenSync }));
            for (const p of (topLevel.CommonPrefixes || [])) {
                if (p.Prefix && p.Prefix.endsWith(`_${contactId}/`) && !seenSync.has(p.Prefix)) {
                    allSyncFolders.push(p.Prefix);
                    seenSync.add(p.Prefix);
                }
            }
            contTokenSync = topLevel.IsTruncated ? topLevel.NextContinuationToken : undefined;
        } while (contTokenSync);

        if (allSyncFolders.length === 0) {
            allSyncFolders.push(`${first_name}_${last_name}_${contactId}/`);
        }

        const baseFolder = allSyncFolders[0]; // Primary folder for logging
        // Scan Documents/, Lenders/ (new structure), and LOA/ (legacy) across ALL folders
        const foldersToScan = allSyncFolders.flatMap(bf => [
            { prefix: `${bf}Documents/`, defaultCategory: 'Client' },
            { prefix: `${bf}Lenders/`, defaultCategory: 'LOA' },
            { prefix: `${bf}LOA/`, defaultCategory: 'LOA' }  // Legacy fallback
        ]);

        console.log(`[Sync] Starting S3 sync for contact ${contactId}, base folder: ${baseFolder}${allSyncFolders.length > 1 ? ` (+${allSyncFolders.length - 1} additional folders)` : ''}`);

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

                // Auto-detect category from subfolder structure
                let category = folder.defaultCategory;

                // Map sanitized folder names back to proper category names
                const SYNC_CATEGORY_MAP = {
                    'id document': 'ID Document', 'proof of address': 'Proof of Address',
                    'bank statement': 'Bank Statement', 'dsar': 'DSAR',
                    'letter of authority': 'Letter of Authority', 'cover letter': 'Cover Letter',
                    'complaint letter': 'Complaint Letter', 'final response letter frl': 'Final Response Letter (FRL)',
                    'counter response': 'Counter Response', 'fos complaint form': 'FOS Complaint Form',
                    'fos decision': 'FOS Decision', 'offer letter': 'Offer Letter',
                    'acceptance form': 'Acceptance Form', 'settlement agreement': 'Settlement Agreement',
                    'invoice': 'Invoice', 'other': 'Other', 'client': 'Client', 'legal': 'Legal'
                };

                // Extract category from subfolder path
                if (folder.prefix.includes('/Lenders/')) {
                    if (pathParts.length > 2) {
                        const subfolderName = pathParts[1].replace(/_/g, ' ').toLowerCase();
                        if (SYNC_CATEGORY_MAP[subfolderName]) category = SYNC_CATEGORY_MAP[subfolderName];
                    }
                } else if (folder.prefix.includes('/Documents/')) {
                    if (pathParts.length > 1) {
                        const subfolderName = pathParts[0].replace(/_/g, ' ').toLowerCase();
                        if (SYNC_CATEGORY_MAP[subfolderName]) category = SYNC_CATEGORY_MAP[subfolderName];
                    }
                }

                // Filename-based detection (overrides folder-based for LOA/Cover Letter)
                if (fileName.includes('Cover_Letter') || fileName.includes('COVER LETTER')) category = 'Cover Letter';
                else if (fileName.includes('_LOA') || fileName.includes(' - LOA.pdf') || fileName.includes(' - LOA ')) category = 'LOA';

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

        // 4. Remove stale DB records — check if file still exists in S3
        const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
        const allDbDocs = await pool.query('SELECT id, name, url FROM documents WHERE contact_id = $1', [contactId]);
        let removedCount = 0;

        for (const doc of allDbDocs.rows) {
            // Extract the S3 key from the stored URL
            let docKey = null;
            try {
                if (doc.url && doc.url.startsWith('http')) {
                    const urlObj = new URL(doc.url);
                    let path = decodeURIComponent(urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname);
                    if (path.startsWith(BUCKET_NAME + '/')) path = path.substring(BUCKET_NAME.length + 1);
                    docKey = path;
                }
            } catch (e) { /* skip bad URLs */ }

            if (!docKey) continue;

            try {
                await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: docKey }));
                // File exists — keep the record
            } catch (headErr) {
                if (headErr.name === 'NotFound' || headErr.$metadata?.httpStatusCode === 404) {
                    await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]);
                    removedCount++;
                    console.log(`[Sync] Removed stale record: ${doc.name} (S3 key missing: ${docKey})`);
                }
            }
        }

        res.json({
            success: true,
            message: `Synced ${syncedCount} new documents, removed ${removedCount} stale records`,
            synced: syncedCount,
            removed: removedCount,
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
        const { page, limit, search, fields } = req.query;

        // If pagination params provided, return paginated response
        if (page || limit) {
            const pageNum = Math.max(1, parseInt(page) || 1);
            const pageSize = Math.min(1000, Math.max(1, parseInt(limit) || 500));
            const offset = (pageNum - 1) * pageSize;

            // Optional: select only specific fields (comma-separated) for lighter responses
            const selectFields = fields
                ? fields.split(',').map(f => `c.${f.trim()}`).join(', ')
                : 'c.*';

            const conditions = [];
            const params = [];

            if (search && search.trim()) {
                params.push(`%${search.trim()}%`);
                conditions.push(`(c.full_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
            }

            const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

            const [contactsResult, totalResult] = await Promise.all([
                pool.query(`
                    SELECT ${selectFields},
                           COALESCE(
                               (SELECT json_agg(pa.*) FROM previous_addresses pa WHERE pa.contact_id = c.id),
                               '[]'::json
                           ) as previous_addresses_list
                    FROM contacts c
                    ${whereClause}
                    ORDER BY c.updated_at DESC
                    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
                `, [...params, pageSize, offset]),
                pool.query(`SELECT COUNT(*) as total FROM contacts c ${whereClause}`, params)
            ]);

            const total = parseInt(totalResult.rows[0].total);
            return res.json({
                contacts: contactsResult.rows,
                pagination: {
                    page: pageNum,
                    limit: pageSize,
                    total,
                    total_pages: Math.ceil(total / pageSize),
                    has_more: pageNum < Math.ceil(total / pageSize)
                }
            });
        }

        // No pagination — return all (legacy behavior)
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
        const [contactsResult, totalResult] = await Promise.all([
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
            pool.query(`SELECT COUNT(*) as total FROM contacts`)
        ]);

        const total = parseInt(totalResult.rows[0].total);

        const payload = {
            contacts: contactsResult.rows,
            contactsPagination: {
                page: 1,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: 1 < Math.ceil(total / limit)
            },
            cases: [], // Lazy load per contact - fetched via /contacts/:id/cases
            actionLogs: [], // Lazy load per contact
            documents: []  // Lazy load per contact
        };
        res.json(payload);
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

// ── GET /api/search?q= ── Global search across contacts + claims (incl. claim reference)
// Returns every claim row for matching contacts so the dropdown shows all claims.
app.get('/api/search', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ error: 'q query parameter is required' });

        const pattern = `%${q}%`;
        // Strip RR- prefix for numeric ID matching (e.g. "RR-221174" → "221174")
        const numericQ = q.replace(/^RR-/i, '');
        const numericPattern = `%${numericQ}%`;

        const { rows } = await pool.query(
            `SELECT
                ct.id AS contact_id,
                ct.first_name, ct.last_name, ct.full_name,
                ct.email, ct.phone, ct.client_id, ct.postal_code,
                cs.id AS claim_id, cs.case_number, cs.lender,
                cs.status AS claim_status
             FROM contacts ct
             LEFT JOIN cases cs ON cs.contact_id = ct.id
             WHERE ct.full_name ILIKE $1
                OR ct.first_name ILIKE $1
                OR ct.last_name ILIKE $1
                OR ct.email ILIKE $1
                OR ct.phone ILIKE $1
                OR ct.client_id ILIKE $1
                OR ct.postal_code ILIKE $1
                OR CAST(ct.id AS TEXT) = $3
                OR cs.lender ILIKE $1
                OR cs.status ILIKE $1
                OR cs.case_number ILIKE $1
                OR cs.reference_specified ILIKE $2
                OR CAST(cs.id AS TEXT) ILIKE $2
                OR (CAST(ct.id AS TEXT) || CAST(cs.id AS TEXT)) ILIKE $2
             ORDER BY ct.updated_at DESC, cs.created_at DESC
             LIMIT 50`,
            [pattern, numericPattern, numericQ]
        );
        res.json(rows);
    } catch (err) {
        console.error('Search error:', err);
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
        crmEvents.emit('contact.created', { contactId: rows[0].id, data: rows[0] });

        // Queue onboarding workflow emails (fire-and-forget)
        const checklist = rows[0].document_checklist || {};
        clientWorkflow.queueOnboardingEmails(rows[0].id, { skipIdUpload: checklist.identification === true, source: 'intake' }).catch(e => console.error('[Workflow] Queue error:', e.message));

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
        crmEvents.emit('contact.updated', { contactId: rows[0].id, data: rows[0] });
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
        crmEvents.emit('case.created', { caseId: rows[0].id, contactId: parseInt(contactId), data: rows[0] });

        // Trigger LOA generation for these statuses
        if (status === 'New Lead' || status === 'Lender Selection Form Completed' || status === 'Extra Lender Selection Form Sent') {
            // For Extra Lender Selection Form Sent, skip status update so it stays unchanged
            const skipStatusUpdate = (status === 'Extra Lender Selection Form Sent');
            triggerPdfGenerator(rows[0].id, 'LOA', skipStatusUpdate).catch(err => {
                console.error(`❌ LOA generation trigger failed for new case ${rows[0].id}:`, err.message);
            });
        }

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
        crmEvents.emit('case.dsar_reset', { caseId: parseInt(req.params.id) });
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
        session.lastAccessed = Date.now();

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

        // Also log to action_logs (with metadata)
        logAction({
            clientId: client_id,
            actorType: 'agent',
            actorId: agent_id || 'system',
            actorName: agent_name || 'System',
            actionType: `${direction}_${channel}`,
            actionCategory: 'communication',
            description: `${direction === 'outbound' ? 'Sent' : 'Received'} ${channel} message${subject ? ': "' + subject + '"' : ''}`,
            metadata: { channel, direction, subject, content: (content || '').substring(0, 200) }
        });

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
        extra_lenders, had_ccj, victim_of_scam, problematic_gambling, betting_companies
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
        if (had_ccj !== undefined) { updates.push(`had_ccj = $${paramCount++}`); values.push(had_ccj); }
        if (victim_of_scam !== undefined) { updates.push(`victim_of_scam = $${paramCount++}`); values.push(victim_of_scam); }
        if (problematic_gambling !== undefined) { updates.push(`problematic_gambling = $${paramCount++}`); values.push(problematic_gambling); }
        if (betting_companies !== undefined) { updates.push(`betting_companies = $${paramCount++}`); values.push(betting_companies); }

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

        crmEvents.emit('contact.updated', { contactId: rows[0].id, data: rows[0] });
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
        dsar_review, complaint_paragraph, offer_made, fee_percent, late_payment_charges,
        billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
        total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
        our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
        our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan,
        account_number, start_date, end_date, value_of_loan, claim_value, product_type
    } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        // List of numeric (DECIMAL) fields that cannot accept empty strings
        const numericFields = [
            'apr', 'outstanding_balance', 'offer_made', 'fee_percent',
            'billed_finance_charges', 'credit_limit_increases',
            'total_refund', 'total_debt', 'client_fee', 'balance_due_to_client', 'our_fees_plus_vat',
            'our_fees_minus_vat', 'vat_amount', 'total_fee', 'outstanding_debt',
            'our_total_fee', 'fee_without_vat', 'vat', 'our_fee_net', 'number_of_loans',
            'claim_value', 'value_of_loan'
        ];

        const fields = {
            lender_other, finance_type, finance_type_other, finance_types, number_of_loans, loan_details,
            lender_reference, dates_timeline, apr, outstanding_balance,
            dsar_review, complaint_paragraph, offer_made, fee_percent, late_payment_charges,
            billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
            total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
            our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
            our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan,
            account_number, start_date, end_date, value_of_loan, claim_value, product_type
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

        crmEvents.emit('case.updated', { caseId: parseInt(id), contactId: rows[0].contact_id, data: rows[0] });
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

// ==================== LENDER DIRECTORY ====================

// Load lender directory data once
const _lendersData = (() => {
    try {
        const lendersPath = path.join(__dirname, 'all_lenders_details.json');
        const content = fs.readFileSync(lendersPath, 'utf-8');
        return JSON.parse(content.replace(/:\s*NaN/g, ': null'));
    } catch { return []; }
})();

// Get full lender directory
app.get('/api/lenders/directory', (req, res) => {
    const result = _lendersData.map(l => ({
        lender: l.lender || null,
        email: l.email || null,
        address: l.address ? {
            company_name: l.address.company_name && l.address.company_name !== 'NaN' ? l.address.company_name : null,
            first_line_address: l.address.first_line_address && l.address.first_line_address !== 'NaN' ? l.address.first_line_address : null,
            town_city: l.address.town_city && l.address.town_city !== 'NaN' ? l.address.town_city : null,
            postcode: l.address.postcode && l.address.postcode !== 'NaN' ? l.address.postcode : null,
        } : null
    }));
    res.json(result);
});

// Lookup single lender by name (exact or partial match)
app.get('/api/lenders/lookup', (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name query parameter required' });

    const normalised = name.toUpperCase().trim();
    let match = _lendersData.find(l => l.lender?.toUpperCase() === normalised);
    if (!match) {
        match = _lendersData.find(l => {
            const u = l.lender?.toUpperCase() || '';
            return u.includes(normalised) || normalised.includes(u);
        });
    }

    if (!match) return res.status(404).json({ error: 'Lender not found' });

    res.json({
        lender: match.lender || null,
        email: match.email || null,
        address: match.address ? {
            company_name: match.address.company_name && match.address.company_name !== 'NaN' ? match.address.company_name : null,
            first_line_address: match.address.first_line_address && match.address.first_line_address !== 'NaN' ? match.address.first_line_address : null,
            town_city: match.address.town_city && match.address.town_city !== 'NaN' ? match.address.town_city : null,
            postcode: match.address.postcode && match.address.postcode !== 'NaN' ? match.address.postcode : null,
        } : null
    });
});

// Get all cases (for Pipeline view)
app.get('/api/cases', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.contact_id, c.lender, c.status, c.claim_value, c.product_type, c.account_number, c.start_date, c.created_at,
                    c.lender_reference, c.reference_specified,
                    con.first_name AS contact_first_name, con.last_name AS contact_last_name, con.full_name AS contact_full_name
             FROM cases c
             LEFT JOIN contacts con ON c.contact_id = con.id
             ORDER BY c.created_at DESC`
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
        const folderPath = buildS3Folder(contact.first_name, contact.last_name, contact.id);

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

        crmEvents.emit('contact.deleted', { contactId: parseInt(id), data: { id: parseInt(id), first_name: contact.first_name, last_name: contact.last_name } });
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
    const { status, userId, userName } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Fetch old status before updating
        const oldStatusResult = await pool.query(`SELECT status, contact_id, lender FROM cases WHERE id = $1`, [id]);
        const oldStatus = oldStatusResult.rows.length > 0 ? oldStatusResult.rows[0].status : null;
        const contactId = oldStatusResult.rows.length > 0 ? oldStatusResult.rows[0].contact_id : null;

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

        // Trigger LOA generation for these statuses
        if (status === 'New Lead' || status === 'Lender Selection Form Completed' || status === 'Extra Lender Selection Form Sent') {
            // For Extra Lender Selection Form Sent, skip status update so it stays unchanged
            const skipStatusUpdate = (status === 'Extra Lender Selection Form Sent');
            triggerPdfGenerator(parseInt(id), 'LOA', skipStatusUpdate).catch(err => {
                console.error(`❌ LOA generation trigger failed for case ${id}:`, err.message);
            });
        }

        // If status = "LOA Uploaded", trigger cover letter generation via Lambda (async)
        if (status === 'LOA Uploaded') {
            triggerPdfGenerator(parseInt(id), 'COVER_LETTER').catch(err => {
                console.error(`❌ Cover letter generation trigger failed for case ${id}:`, err.message);
            });
        }

        // If status = "Resend LOA", generate resign token for worker to pick up and email
        if (status === 'Resend LOA') {
            try {
                const { randomUUID } = await import('crypto');
                const resignToken = randomUUID();
                await pool.query(
                    'UPDATE cases SET resign_token = $1, resign_email_sent = false WHERE id = $2',
                    [resignToken, id]
                );
                console.log(`🔄 Resend LOA: resign token generated for case ${id}, worker will send email`);
            } catch (resignErr) {
                console.error(`❌ Error generating resign token for case ${id}:`, resignErr);
            }
        }

        // Log status change to action_logs
        if (contactId && oldStatus !== status) {
            try {
                await pool.query(
                    `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                     VALUES ($1, $2, $3, $4, $5, 'status_changed', 'claims', $6, $7, NOW())`,
                    [
                        contactId,
                        parseInt(id),
                        userId ? 'agent' : 'system',
                        userId || 'system',
                        userName || 'System',
                        `Claim status changed from "${oldStatus || 'None'}" to "${status}" for ${updatedCase.lender}`,
                        JSON.stringify({ old_status: oldStatus, new_status: status, lender: updatedCase.lender, case_id: parseInt(id) })
                    ]
                );
            } catch (logErr) {
                console.error('Error logging status change:', logErr);
            }
        }

        console.log(`✅ Updated case ${id} status to: ${status}`);
        crmEvents.emit('case.status_changed', { caseId: parseInt(id), contactId: updatedCase.contact_id, data: updatedCase, newStatus: status });

        // Workflow: Queue questionnaire email when DSAR sent to lender (once per contact)
        if (status === 'DSAR Sent to Lender' && updatedCase.contact_id) {
            clientWorkflow.queueQuestionnaireEmail(updatedCase.contact_id).catch(e => console.error('[Workflow] Queue questionnaire error:', e.message));
        }

        res.json(updatedCase);
    } catch (error) {
        console.error('❌ Error updating case status:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- CREATE CLAIM via /api/contacts/:id/claims ---
app.post('/api/contacts/:id/claims', async (req, res) => {
    const { lender, status, claim_value, product_type, account_number, start_date, case_number } = req.body;
    const contactId = req.params.id;

    if (!lender) {
        return res.status(400).json({ error: 'Lender is required' });
    }

    try {
        const standardizedLender = standardizeLender(lender);

        // Check if this is a Category 3 lender requiring confirmation
        if (isCategory3Lender(standardizedLender)) {
            const contactRes = await pool.query(
                `SELECT first_name, last_name, email FROM contacts WHERE id = $1`,
                [contactId]
            );
            if (contactRes.rows.length === 0) {
                return res.status(404).json({ error: 'Contact not found' });
            }

            const confirmToken = generateConfirmationToken();
            const rejectToken = generateConfirmationToken();

            await pool.query(
                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                 VALUES ($1, $2, 'confirm', $3, false)`,
                [contactId, standardizedLender, confirmToken]
            );
            await pool.query(
                `INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent)
                 VALUES ($1, $2, 'reject', $3, true)`,
                [contactId, standardizedLender, rejectToken]
            );

            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                 VALUES ($1, 'staff', 'crm', 'category3_pending', 'claims', $2, $3)`,
                [contactId, `${standardizedLender} confirmation queued via API.`, JSON.stringify({ lender: standardizedLender })]
            );

            return res.json({
                success: true,
                category3: true,
                message: `${standardizedLender} is a Category 3 lender. Confirmation email will be sent. Claim created on confirmation.`,
                lender: standardizedLender
            });
        }

        // Normal claim creation
        const dsarSendAfter = standardizedLender.toUpperCase() !== 'GAMBLING' ? new Date() : null;
        const { rows } = await pool.query(
            `INSERT INTO cases (contact_id, case_number, lender, status, claim_value, product_type, account_number, start_date, loa_generated, dsar_send_after)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) RETURNING *`,
            [contactId, case_number || null, standardizedLender, status || 'New Lead', claim_value || null, product_type || null, account_number || null, start_date || null, dsarSendAfter]
        );
        await setReferenceSpecified(pool, contactId, rows[0].id);
        crmEvents.emit('case.created', { caseId: rows[0].id, contactId: parseInt(contactId), data: rows[0] });

        // Trigger LOA generation for applicable statuses
        const effectiveStatus = status || 'New Lead';
        if (effectiveStatus === 'New Lead' || effectiveStatus === 'Lender Selection Form Completed' || effectiveStatus === 'Extra Lender Selection Form Sent') {
            const skipStatusUpdate = (effectiveStatus === 'Extra Lender Selection Form Sent');
            triggerPdfGenerator(rows[0].id, 'LOA', skipStatusUpdate).catch(err => {
                console.error(`[API] LOA generation trigger failed for claim ${rows[0].id}:`, err.message);
            });
        }

        console.log(`[API POST /api/contacts/${contactId}/claims] Created claim ${rows[0].id} for lender ${standardizedLender}`);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[API POST /api/contacts/:id/claims] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- UPDATE CLAIM via /api/crm/claims/:id ---
app.patch('/api/crm/claims/:id', async (req, res) => {
    const { id } = req.params;
    const {
        contact_id, status, lender, claim_value, product_type, account_number, start_date, end_date,
        lender_other, finance_type, finance_type_other, finance_types, number_of_loans, loan_details,
        lender_reference, dates_timeline, apr, outstanding_balance,
        dsar_review, complaint_paragraph, offer_made, fee_percent, late_payment_charges,
        billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
        total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
        our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
        our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan,
        value_of_loan, userId, userName
    } = req.body;

    try {
        // Fetch current claim
        const existing = await pool.query(`SELECT * FROM cases WHERE id = $1`, [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }
        const oldClaim = existing.rows[0];

        const updates = [];
        const values = [];
        let paramCount = 1;

        const numericFields = [
            'apr', 'outstanding_balance', 'offer_made', 'fee_percent',
            'billed_finance_charges', 'credit_limit_increases',
            'total_refund', 'total_debt', 'client_fee', 'balance_due_to_client', 'our_fees_plus_vat',
            'our_fees_minus_vat', 'vat_amount', 'total_fee', 'outstanding_debt',
            'our_total_fee', 'fee_without_vat', 'vat', 'our_fee_net', 'number_of_loans',
            'claim_value', 'value_of_loan'
        ];

        const fields = {
            contact_id, status, lender, claim_value, product_type, account_number, start_date, end_date,
            lender_other, finance_type, finance_type_other, finance_types, number_of_loans, loan_details,
            lender_reference, dates_timeline, apr, outstanding_balance,
            dsar_review, complaint_paragraph, offer_made, fee_percent, late_payment_charges,
            billed_interest_charges, billed_finance_charges, overlimit_charges, credit_limit_increases,
            total_refund, total_debt, client_fee, balance_due_to_client, our_fees_plus_vat,
            our_fees_minus_vat, vat_amount, total_fee, outstanding_debt,
            our_total_fee, fee_without_vat, vat, our_fee_net, spec_status, payment_plan,
            value_of_loan
        };

        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) {
                // Standardize lender name if updating lender
                if (key === 'lender') {
                    updates.push(`${key} = $${paramCount++}`);
                    values.push(standardizeLender(value));
                } else if (numericFields.includes(key) && value === '') {
                    updates.push(`${key} = $${paramCount++}`);
                    values.push(null);
                } else {
                    updates.push(`${key} = $${paramCount++}`);
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Validate target contact exists when reassigning
        if (contact_id !== undefined) {
            const contactCheck = await pool.query(`SELECT id FROM contacts WHERE id = $1`, [contact_id]);
            if (contactCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Target contact not found' });
            }
        }

        // Handle DSAR Sent to Lender status
        if (status === 'DSAR Sent to Lender') {
            updates.push(`dsar_sent_at = NOW()`);
            updates.push(`dsar_overdue_notified = false`);
        }

        // Handle Sale status - generate token
        let salesSignatureToken = null;
        if (status === 'Sale') {
            const { randomUUID } = await import('crypto');
            salesSignatureToken = randomUUID();
            updates.push(`sales_signature_token = $${paramCount++}`);
            values.push(salesSignatureToken);
        }

        values.push(id);
        const query = `UPDATE cases SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        const updatedClaim = rows[0];

        // Log the update
        const changedFields = Object.keys(fields).filter(k => fields[k] !== undefined);
        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                updatedClaim.contact_id, id,
                'agent', userId || 'api', userName || 'API',
                status && status !== oldClaim.status ? 'status_changed' : 'claim_updated',
                'claims',
                status && status !== oldClaim.status
                    ? `Status changed from "${oldClaim.status}" to "${status}"`
                    : `Updated claim fields: ${changedFields.join(', ')}`,
                JSON.stringify({ changedFields, oldStatus: oldClaim.status, newStatus: status || oldClaim.status })
            ]
        );

        // Emit appropriate events
        if (status && status !== oldClaim.status) {
            crmEvents.emit('case.status_changed', { caseId: parseInt(id), contactId: updatedClaim.contact_id, data: updatedClaim, newStatus: status });
        }
        crmEvents.emit('case.updated', { caseId: parseInt(id), contactId: updatedClaim.contact_id, data: updatedClaim });

        // Trigger LOA generation for applicable statuses
        if (status === 'New Lead' || status === 'Lender Selection Form Completed' || status === 'Extra Lender Selection Form Sent') {
            const skipStatusUpdate = (status === 'Extra Lender Selection Form Sent');
            triggerPdfGenerator(parseInt(id), 'LOA', skipStatusUpdate).catch(err => {
                console.error(`[API] LOA generation trigger failed for claim ${id}:`, err.message);
            });
        }

        // If status = "LOA Uploaded", trigger cover letter generation
        if (status === 'LOA Uploaded') {
            triggerPdfGenerator(parseInt(id), 'COVER_LETTER').catch(err => {
                console.error(`[API] Cover letter trigger failed for claim ${id}:`, err.message);
            });
        }

        console.log(`[API PATCH /api/crm/claims/${id}] Updated claim. Fields: ${changedFields.join(', ')}`);
        res.json(updatedClaim);
    } catch (err) {
        console.error('[API PATCH /api/crm/claims/:id] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk Update Case Status (optimized for multiple claims)
app.patch('/api/cases/bulk/status', async (req, res) => {
    const { claimIds, status, userId, userName } = req.body;

    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ error: 'claimIds array is required' });
    }

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Fetch old statuses before updating
        const oldStatusResult = await pool.query(
            `SELECT id, status, contact_id, lender FROM cases WHERE id = ANY($1::int[])`,
            [claimIds]
        );
        const oldStatusMap = {};
        oldStatusResult.rows.forEach(row => {
            oldStatusMap[row.id] = { status: row.status, contact_id: row.contact_id, lender: row.lender };
        });

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

        // Log status changes to action_logs for each updated claim
        try {
            for (const updatedCase of result.rows) {
                const old = oldStatusMap[updatedCase.id];
                const oldStatus = old ? old.status : null;
                if (oldStatus !== status) {
                    await pool.query(
                        `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
                         VALUES ($1, $2, $3, $4, $5, 'status_changed', 'claims', $6, $7, NOW())`,
                        [
                            updatedCase.contact_id,
                            updatedCase.id,
                            userId ? 'agent' : 'system',
                            userId || 'system',
                            userName || 'System',
                            `Claim status changed from "${oldStatus || 'None'}" to "${status}" for ${updatedCase.lender}`,
                            JSON.stringify({ old_status: oldStatus, new_status: status, lender: updatedCase.lender, case_id: updatedCase.id })
                        ]
                    );
                }
            }
        } catch (logErr) {
            console.error('Error logging bulk status changes:', logErr);
        }

        // Trigger LOA generation for these statuses (queued + staggered to avoid overwhelming OnlyOffice)
        if (status === 'New Lead' || status === 'Lender Selection Form Completed' || status === 'Extra Lender Selection Form Sent') {
            const skipStatusUpdate = (status === 'Extra Lender Selection Form Sent');
            const casesToProcess = [...result.rows];
            pdfQueue.enqueue(async () => {
                console.log(`📋 [PDF Queue] Starting LOA generation for ${casesToProcess.length} cases`);
                const BATCH_SIZE = 5;
                const DELAY_BETWEEN_BATCHES_MS = 3000;
                for (let i = 0; i < casesToProcess.length; i += BATCH_SIZE) {
                    const batch = casesToProcess.slice(i, i + BATCH_SIZE);
                    await Promise.allSettled(
                        batch.map(updatedCase =>
                            triggerPdfGenerator(updatedCase.id, 'LOA', skipStatusUpdate).catch(err => {
                                console.error(`❌ LOA generation trigger failed for case ${updatedCase.id}:`, err.message);
                            })
                        )
                    );
                    if (i + BATCH_SIZE < casesToProcess.length) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
                    }
                }
                console.log(`✅ [PDF Queue] LOA generation completed for ${casesToProcess.length} cases`);
            });
        }

        // If status = "LOA Uploaded", trigger cover letter generation (queued + staggered)
        if (status === 'LOA Uploaded') {
            const casesToProcess = [...result.rows];
            pdfQueue.enqueue(async () => {
                console.log(`📋 [PDF Queue] Starting cover letter generation for ${casesToProcess.length} cases`);
                const BATCH_SIZE = 5;
                const DELAY_BETWEEN_BATCHES_MS = 3000;
                for (let i = 0; i < casesToProcess.length; i += BATCH_SIZE) {
                    const batch = casesToProcess.slice(i, i + BATCH_SIZE);
                    await Promise.allSettled(
                        batch.map(updatedCase =>
                            triggerPdfGenerator(updatedCase.id, 'COVER_LETTER').catch(err => {
                                console.error(`❌ Cover letter generation trigger failed for case ${updatedCase.id}:`, err.message);
                            })
                        )
                    );
                    if (i + BATCH_SIZE < casesToProcess.length) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
                    }
                }
                console.log(`✅ [PDF Queue] Cover letter generation completed for ${casesToProcess.length} cases`);
            });
        }

        console.log(`✅ Bulk updated ${result.rows.length} cases to status: ${status}`);
        crmEvents.emit('case.bulk_status', { caseIds: claimIds, newStatus: status, count: result.rows.length });
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
        const folderPath = buildS3Folder(claim.first_name, claim.last_name, claim.contact_id);
        const refSpec = `${claim.contact_id}${id}`;
        const sanitizedLender = claim.lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const safeFirstName = (claim.first_name || '').replace(/[\/\\]/g, '');
        const safeLastName = (claim.last_name || '').replace(/[\/\\]/g, '');

        // New structure paths (Lenders/{lenderName}/)
        const newLoaPath = `${folderPath}Lenders/${sanitizedLender}/${refSpec} - ${safeFirstName} ${safeLastName} - ${sanitizedLender} - LOA.pdf`;
        const newCoverPath = `${folderPath}Lenders/${sanitizedLender}/${refSpec} - ${safeFirstName} ${safeLastName} - ${sanitizedLender} - COVER LETTER.pdf`;
        // Old LOA/ folder paths (for backwards compatibility)
        const oldLoaPath = `${folderPath}LOA/${refSpec} - ${safeFirstName} ${safeLastName} - ${sanitizedLender} - LOA.pdf`;
        const oldCoverPath = `${folderPath}LOA/${refSpec} - ${safeFirstName} ${safeLastName} - ${sanitizedLender} - COVER LETTER.pdf`;
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

        crmEvents.emit('case.deleted', { caseId: parseInt(id), contactId: claim.contact_id, data: { id: parseInt(id), lender: claim.lender } });
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
app.get('/loa-form/:uniqueId', async (req, res) => {
    const { uniqueId } = req.params;

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
                return res.status(404).send(renderAlreadySubmittedPage('Invalid Link', 'This form link is not valid. Please contact Rowan Rose Solicitors for assistance.'));
            }

            const tokenData = tokenRes.rows[0];

            // Check if expired
            if (new Date() > new Date(tokenData.expires_at)) {
                return res.status(404).send(renderAlreadySubmittedPage('Link Expired', 'This form link has expired. Please contact Rowan Rose Solicitors for a new link.'));
            }

            // Check if already submitted
            if (tokenData.loa_submitted) {
                return res.status(400).send(renderAlreadySubmittedPage('Already Submitted', 'This form has already been submitted. Thank you for completing it — no further action is needed.'));
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

        // Return HTML form page - 2-column layout matching VanquisIntake design
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOA Form - ${contactName}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Inter"', '"Lato"', 'sans-serif'],
                        serif: ['"Playfair Display"', 'serif'],
                    },
                    colors: {
                        brand: { orange: '#F18F01' }
                    }
                }
            }
        }
    </script>
    <style>
        input[type="checkbox"] { width: 28px !important; height: 28px !important; accent-color: #F18F01; cursor: pointer; flex-shrink: 0; }
        .lender-row:hover { background: #fff7ed; }
        .lender-row.checked { background: #fff7ed; border-color: #F18F01; }
        .section-header { background: linear-gradient(135deg, #0f172a, #1e293b); }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">

        <!-- MOBILE HEADER -->
        <div class="md:hidden bg-[#0f172a] p-6 flex items-center gap-3 shrink-0">
            <img src="/rr-logo.png" alt="Logo" class="w-12 h-12 rounded-full shadow-lg" />
            <h1 class="font-serif text-2xl tracking-wide text-white">Rowan Rose Solicitors</h1>
        </div>

        <!-- LEFT PANEL -->
        <div class="order-3 md:order-1 md:w-5/12 lg:w-1/3 bg-[#0f172a] text-white flex flex-col justify-between shrink-0 shadow-2xl z-20 relative overflow-y-auto">
            <div class="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>
            <div class="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>

            <div class="relative z-10 h-full flex flex-col p-8 md:p-12">
                <div class="hidden md:flex items-center gap-3 mb-8 shrink-0">
                    <img src="/rr-logo.png" alt="Logo" class="w-16 h-16 rounded-full shadow-lg" />
                    <h1 class="font-serif text-3xl tracking-wide">Rowan Rose Solicitors</h1>
                </div>

                <div class="flex-1">
                    <h2 class="text-2xl font-serif font-light leading-tight mb-4 text-brand-orange">Multi Discipline Law Firm in the Heart of Manchester</h2>
                    <p class="text-slate-300 font-light leading-relaxed text-sm mb-8 border-l-2 border-slate-700 pl-4">Rowan Rose is a high-end boutique law firm committed to delivering the highest quality of service and advice.</p>

                    <h3 class="text-lg font-serif text-white mb-6 border-b border-slate-700 pb-2">Why Choose Us</h3>

                    <div class="space-y-4">
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-scale-balanced text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Expertise</h4><p class="text-slate-400 text-xs leading-relaxed">We have the expertise to handle a wide range of legal matters.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-bullseye text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Accuracy</h4><p class="text-slate-400 text-xs leading-relaxed">Accurate, comprehensive and detailed legal advice.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-shield-halved text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Reliability</h4><p class="text-slate-400 text-xs leading-relaxed">Well-versed in providing reliable legal advice.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-sterling-sign text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Cost Effective</h4><p class="text-slate-400 text-xs leading-relaxed">Best value services without compromising quality.</p></div>
                        </div>
                    </div>

                    <div class="mt-10 border-t border-slate-700 pt-7">
                        <div class="space-y-4">
                            <div class="flex items-center gap-4"><div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><i class="fas fa-envelope text-brand-orange text-lg"></i></div><a href="mailto:info@rowanrose.co.uk" class="text-white hover:text-brand-orange text-sm">info@rowanrose.co.uk</a></div>
                            <div class="flex items-center gap-4"><div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><i class="fas fa-phone text-brand-orange text-lg"></i></div><a href="tel:01615330444" class="text-white hover:text-brand-orange text-sm">0161 533 0444</a></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- RIGHT PANEL -->
        <div class="order-2 md:order-2 flex-1 bg-white relative overflow-y-auto">
            <div class="max-w-4xl mx-auto p-6 md:p-12 lg:p-16">
                <h1 class="text-3xl md:text-4xl font-serif text-slate-800 mb-2">Hi ${contactName},</h1>
                <p class="text-slate-600 text-lg mb-8">Please <span class="text-brand-orange font-semibold">tick any lenders you've used in the last 15 years</span>. This helps us maximise your potential refund!</p>

                <div id="errorMessage" class="hidden bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 mb-6 font-medium"></div>

                <form id="lenderForm">
                    <div id="lenderCategories" class="space-y-8"></div>

                    <div class="mt-10 p-6 bg-amber-50 rounded-xl border-2 border-amber-200">
                        <h3 class="text-lg font-semibold text-amber-800 mb-4">Additional Questions</h3>
                        <div class="space-y-3">
                            <label class="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 cursor-pointer"><input type="checkbox" id="ccj" name="ccj" class="shrink-0"><span class="text-amber-900 font-medium">Have you had a CCJ in the last 6 years?</span></label>
                            <label class="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 cursor-pointer"><input type="checkbox" id="scam" name="scam" class="shrink-0"><span class="text-amber-900 font-medium">Have you been a victim of a scam in the last 6 years?</span></label>
                            <label class="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 cursor-pointer"><input type="checkbox" id="gambling" name="gambling" class="shrink-0"><span class="text-amber-900 font-medium">Have you experienced problematic gambling in the last 10 years?</span></label>
                        </div>
                        <div id="bettingCompaniesSection" class="mt-4 p-3 rounded-lg bg-amber-100 border border-amber-300" style="display: ${contact.intake_lender && contact.intake_lender.toUpperCase() === 'GAMBLING' ? 'block' : 'none'};">
                            <label for="bettingCompanies" class="block text-amber-900 font-medium mb-2">Previous Betting Companies (please list all)</label>
                            <textarea id="bettingCompanies" name="bettingCompanies" rows="3" class="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white text-gray-900 resize-y" placeholder="e.g. Bet365, William Hill, Paddy Power..."></textarea>
                        </div>
                    </div>

                    <div class="mt-10 p-6 bg-slate-50 rounded-xl border-2 border-slate-300">
                        <div class="text-center p-4 bg-white rounded-lg border border-slate-200 mb-4">
                            <p class="text-slate-700">I, <span class="font-bold text-brand-orange">${contactName}</span>, authorise Rowan Rose Solicitors to investigate and pursue claims against the lenders I have selected.</p>
                        </div>
                        <h3 class="text-lg font-semibold text-slate-800 mb-1">Your Signature</h3>
                        <p class="text-slate-500 text-sm mb-4">Sign below to confirm your authorisation</p>
                        <div class="relative bg-white border-2 border-slate-300 rounded-xl overflow-hidden">
                            <canvas id="signatureCanvas" class="w-full cursor-crosshair" style="height:180px;touch-action:none;"></canvas>
                            <div id="signaturePlaceholder" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 text-2xl italic pointer-events-none">Sign here</div>
                        </div>
                        <div class="flex justify-between items-center mt-3">
                            <span class="text-slate-400 text-sm">Draw with finger or mouse</span>
                            <button type="button" onclick="clearSignature()" class="text-slate-500 hover:text-red-500 text-sm font-semibold uppercase">Clear</button>
                        </div>
                    </div>

                    <button type="submit" id="submitBtn" class="w-full mt-8 py-5 bg-brand-orange hover:bg-orange-600 text-white text-xl font-bold rounded-xl shadow-lg hover:shadow-xl transition-all uppercase tracking-wide">Submit Your Selection</button>
                </form>

                <div id="loading" class="hidden text-center py-16">
                    <div class="w-12 h-12 border-4 border-slate-200 border-t-brand-orange rounded-full mx-auto" style="animation:spin 1s linear infinite;"></div>
                    <p class="mt-4 text-slate-600">Submitting your form...</p>
                </div>

                <div id="success" class="hidden text-center py-16">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-check text-3xl text-green-600"></i></div>
                    <h2 class="text-2xl font-bold text-green-700 mb-2">Form Submitted Successfully!</h2>
                    <p class="text-slate-600">Thank you. We will process your information and be in touch shortly.</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const lenderCategories = ${JSON.stringify(filteredCategories)};
        const container = document.getElementById('lenderCategories');

        const categoryIcons = {
            'CREDIT CARDS': 'fa-credit-card',
            'PAYDAY LOANS / LOANS': 'fa-money-bill-wave',
            'GUARANTOR LOANS': 'fa-handshake',
            'LOGBOOK LOANS / PAWNBROKERS': 'fa-car',
            'CATALOGUES': 'fa-shopping-bag',
            'CAR FINANCE': 'fa-car-side',
            'OVERDRAFTS': 'fa-building-columns'
        };

        lenderCategories.forEach((category, catIndex) => {
            const section = document.createElement('div');
            section.className = 'mb-8';
            const title = category.title.replace('TICK THE ', '').replace(' WHICH APPLY TO YOU :', '');
            const iconClass = Object.entries(categoryIcons).find(([k]) => title.toUpperCase().includes(k))?.[1] || 'fa-list';

            const header = document.createElement('div');
            header.className = 'section-header text-white px-5 py-3 rounded-t-xl';
            header.innerHTML = '<h3 class="text-lg font-semibold tracking-wide"><i class="fas ' + iconClass + ' mr-2"></i>' + title + '</h3>';
            section.appendChild(header);

            const list = document.createElement('div');
            list.className = 'border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100';
            category.lenders.forEach((lender, lenderIndex) => {
                const id = 'lender_' + catIndex + '_' + lenderIndex;
                const row = document.createElement('label');
                row.className = 'lender-row flex items-center gap-4 p-4 cursor-pointer transition-all';
                row.innerHTML = '<input type="checkbox" id="' + id + '" name="lenders" value="' + lender + '"><span class="text-slate-700 font-medium">' + lender + '</span>';
                row.querySelector('input').addEventListener('change', function() { row.classList.toggle('checked', this.checked); });
                list.appendChild(row);
            });
            section.appendChild(list);
            container.appendChild(section);
        });

        const canvas = document.getElementById('signatureCanvas');
        const ctx = canvas.getContext('2d');
        const placeholder = document.getElementById('signaturePlaceholder');
        let isDrawing = false, hasSignature = false;

        function resizeCanvas() {
            const ratio = window.devicePixelRatio || 1;
            const width = canvas.parentElement.clientWidth;
            canvas.width = width * ratio; canvas.height = 180 * ratio;
            canvas.style.width = width + 'px'; canvas.style.height = '180px';
            ctx.scale(ratio, ratio); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        function hidePlaceholder() { placeholder.style.display = 'none'; hasSignature = true; }

        canvas.addEventListener('mousedown', e => { isDrawing = true; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); });
        canvas.addEventListener('mousemove', e => { if (!isDrawing) return; const r = canvas.getBoundingClientRect(); ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseout', () => isDrawing = false);
        canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0], r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); isDrawing = true; });
        canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!isDrawing) return; const t = e.touches[0], r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('touchend', e => { e.preventDefault(); isDrawing = false; });

        function clearSignature() {
            const ratio = window.devicePixelRatio || 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.scale(ratio, ratio); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            hasSignature = false; placeholder.style.display = 'block';
        }

        // Show/hide betting companies based on gambling checkbox
        const gamblingCheckbox = document.getElementById('gambling');
        const bettingSection = document.getElementById('bettingCompaniesSection');
        if (gamblingCheckbox && bettingSection) {
            gamblingCheckbox.addEventListener('change', function() {
                bettingSection.style.display = this.checked ? 'block' : bettingSection.dataset.initiallyShown === 'true' ? 'block' : 'none';
            });
            bettingSection.dataset.initiallyShown = bettingSection.style.display !== 'none' ? 'true' : 'false';
        }

        document.getElementById('lenderForm').addEventListener('submit', async e => {
            e.preventDefault();
            const selectedLenders = Array.from(document.querySelectorAll('input[name="lenders"]:checked')).map(cb => cb.value);
            if (selectedLenders.length === 0) { alert('Please select at least one lender.'); return; }
            if (!hasSignature) { alert('Please provide your signature.'); return; }

            document.getElementById('lenderForm').style.display = 'none';
            document.getElementById('loading').style.display = 'block';

            try {
                const response = await fetch('/api/submit-loa-form', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uniqueId: '${uniqueId}',
                        selectedLenders,
                        signature2Data: canvas.toDataURL('image/png'),
                        hadCCJ: document.getElementById('ccj').checked,
                        victimOfScam: document.getElementById('scam').checked,
                        problematicGambling: document.getElementById('gambling').checked,
                        bettingCompanies: document.getElementById('bettingCompanies') ? document.getElementById('bettingCompanies').value.trim() : ''
                    })
                });
                const result = await response.json();
                document.getElementById('loading').style.display = 'none';
                if (result.success) {
                    document.getElementById('success').style.display = 'block';
                } else {
                    document.getElementById('errorMessage').textContent = result.message;
                    document.getElementById('errorMessage').classList.remove('hidden');
                    document.getElementById('lenderForm').style.display = 'block';
                }
            } catch (error) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('errorMessage').textContent = 'Error submitting form. Please try again.';
                document.getElementById('errorMessage').classList.remove('hidden');
                document.getElementById('lenderForm').style.display = 'block';
            }
        });
    </script>
</body>
</html>`);
    } catch (error) {
        console.error('Error serving lender form:', error);
        res.status(500).send('Server error');
    }
});

// Submit LOA form
app.post('/api/submit-loa-form', async (req, res) => {
    const { uniqueId, selectedLenders, signature2Data, hadCCJ, victimOfScam, problematicGambling, bettingCompanies } = req.body;

    if (!uniqueId || !selectedLenders || !signature2Data) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Find contact by unique link and fetch complete data
        const contactRes = await pool.query(
            `SELECT id, first_name, last_name, email, phone, address_line_1, address_line_2,
                                                                        city, state_county, postal_code, dob, loa_submitted, intake_lender
                                                                        FROM contacts WHERE unique_form_link = $1`,
            [uniqueId]
        );

        let contact;
        if (contactRes.rows.length === 0) {
            // Check submission_tokens table if not found in contacts
            const tokenRes = await pool.query(
                `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.address_line_1, c.address_line_2,
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
        const folderPath = buildS3Folder(contact.first_name, contact.last_name, contactId);

        // --- UPDATE DB IMMEDIATELY ---
        await pool.query(
            `UPDATE contacts SET loa_submitted = true, extra_lenders = $2,
             had_ccj = $3, victim_of_scam = $4, problematic_gambling = $5, betting_companies = $6
             WHERE id = $1`,
            [contactId, selectedLenders.join(', '), hadCCJ || false, victimOfScam || false, problematicGambling || false, bettingCompanies || null]
        );

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
                            // Case exists - update status based on current status
                            const existingCase = existingCaseRes.rows[0];
                            console.log(`[Background LOA] Case already exists for ${lender} with status ${existingCase.status}. Updating status if needed.`);

                            // If case was "Extra Lender Selection Form Sent", change to "Extra Lender Selection Form Completed"
                            if (existingCase.status === 'Extra Lender Selection Form Sent') {
                                await pool.query(
                                    `UPDATE cases SET status = 'Extra Lender Selection Form Completed', dsar_send_after = COALESCE(dsar_send_after, $2) WHERE id = $1`,
                                    [existingCase.id, dsarSendAfterLender]
                                );
                            } else if (initialStatus === 'Lender Selection Form Completed') {
                                await pool.query(
                                    `UPDATE cases SET status = $1, dsar_send_after = COALESCE(dsar_send_after, $3) WHERE id = $2`,
                                    [initialStatus, existingCase.id, dsarSendAfterLender]
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
                            const newCaseId = newCaseRes.rows[0].id;
                            await setReferenceSpecified(pool, contactId, newCaseId);

                            console.log(`[Background LOA] Created Case ${newCaseId} for ${lender} with status ${initialStatus}`);

                            // Trigger PDF generation for newly created case
                            // For "New Lead" status, allow status to change (LOA Uploaded → LOA Signed)
                            // For other statuses (like Extra Lender Selection Form Sent), skip status update
                            const skipUpdate = (initialStatus !== 'New Lead');
                            triggerPdfGenerator(newCaseId, 'LOA', skipUpdate).catch(err => {
                                console.error(`❌ LOA generation trigger failed for new case ${newCaseId}:`, err.message);
                            });

                            return { lender, success: true, status: 'created', caseId: newCaseId };
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
                        // Update existing case if it exists
                        const intakeDsarSendAfter = stdIntakeLender.toUpperCase() !== 'GAMBLING' ? new Date() : null;

                        // For "Extra Lender Selection Form Sent" -> "Extra Lender Selection Form Completed"
                        // For others -> "Lender Selection Form Completed"
                        const updateResult = await pool.query(
                            `UPDATE cases SET
                                status = CASE
                                    WHEN status = 'Extra Lender Selection Form Sent' THEN 'Extra Lender Selection Form Completed'
                                    ELSE 'Lender Selection Form Completed'
                                END,
                                dsar_send_after = COALESCE(dsar_send_after, $3)
                             WHERE contact_id = $1 AND lower(lender) = lower($2)`,
                            [contactId, stdIntakeLender, intakeDsarSendAfter]
                        );

                        if (updateResult.rowCount === 0) {
                            // If not exists, create it
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

                // Trigger Lambda LOA generation for all cases with status "Lender Selection Form Completed" or "Extra Lender Selection Form Sent"
                const casesToGenerate = await pool.query(
                    `SELECT id, status FROM cases WHERE contact_id = $1 AND status IN ('Lender Selection Form Completed', 'Extra Lender Selection Form Sent') AND loa_generated = false`,
                    [contactId]
                );
                for (const c of casesToGenerate.rows) {
                    // For Extra Lender Selection Form Sent, don't change status after generating PDFs
                    const skipStatusUpdate = (c.status === 'Extra Lender Selection Form Sent');
                    triggerPdfGenerator(c.id, 'LOA', skipStatusUpdate).catch(err => {
                        console.error(`❌ LOA generation trigger failed for case ${c.id}:`, err.message);
                    });
                }
                console.log(`[Background LOA] Triggered Lambda LOA generation for ${casesToGenerate.rows.length} cases`);

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

                // Generate IRL Multiple Lender Form PDF
                try {
                    await generateIrlMultipleLenderPdf({
                        contactId,
                        contact,
                        selectedLenders,
                        hadCCJ: hadCCJ || false,
                        victimOfScam: victimOfScam || false,
                        problematicGambling: problematicGambling || false,
                        bettingCompanies: bettingCompanies || '',
                        signatureBase64,
                        folderPath
                    });
                    console.log(`[Background LOA] IRL Multiple Lender Form PDF generated for contact ${contactId}`);
                } catch (pdfErr) {
                    console.error(`[Background LOA] IRL Multiple Lender Form PDF generation failed:`, pdfErr.message);
                }

                // Generate Client Care Letter (once per contact)
                try {
                    const cclResult = await generateClientCareLetter(contact, pool);
                    if (cclResult.skipped) {
                        console.log(`[Background LOA] Client Care Letter already generated for contact ${contactId}, skipped`);
                    } else {
                        console.log(`[Background LOA] ✅ Client Care Letter generated for contact ${contactId}`);
                    }
                } catch (cclErr) {
                    console.error(`[Background LOA] Client Care Letter generation failed for contact ${contactId}:`, cclErr.message);
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

// ============================================
// Combined Questionnaire Form (GET + POST)
// ============================================

// Serve Combined Questionnaire form page (DISABLED - Commented out as requested)
/*
app.get('/questionnaire/:contactId', async (req, res) => {
    const { contactId } = req.params;

    try {
        const contactRes = await pool.query(
            'SELECT id, first_name, last_name, full_name, client_id, questionnaire_submitted FROM contacts WHERE id = $1',
            [contactId]
        );

        if (contactRes.rows.length === 0) {
            return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;}h1{color:#EF4444;}</style></head><body><h1>Contact Not Found</h1><p>This questionnaire link is not valid. Please contact Rowan Rose Solicitors for assistance.</p></body></html>`);
        }

        const contact = contactRes.rows[0];
        const contactName = contact.full_name || `${contact.first_name} ${contact.last_name}`;
        const clientRef = contact.client_id || `RR-${contact.id}`;

        if (contact.questionnaire_submitted) {
            return res.status(400).send(renderAlreadySubmittedPage('Already Submitted', 'This questionnaire has already been submitted. Thank you for completing it — no further action is needed.'));
        }

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Questionnaire - ${contactName}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Inter"', '"Lato"', 'sans-serif'],
                        serif: ['"Playfair Display"', 'serif'],
                    },
                    colors: {
                        brand: { orange: '#F18F01' }
                    }
                }
            }
        }
    <\/script>
    <style>
        input[type="checkbox"] { width: 28px !important; height: 28px !important; accent-color: #F18F01; cursor: pointer; flex-shrink: 0; }
        .q-row:hover { background: #fff7ed; }
        .q-row.checked { background: #fff7ed; border-color: #F18F01; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .section-header { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
</head>
<body>
    <div class="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">

        <!-- MOBILE HEADER -->
        <div class="md:hidden bg-[#0f172a] p-6 flex items-center gap-3 shrink-0">
            <img src="/rr-logo.png" alt="Logo" class="w-12 h-12 rounded-full shadow-lg" />
            <h1 class="font-serif text-2xl tracking-wide text-white">Rowan Rose Solicitors</h1>
        </div>

        <!-- LEFT PANEL -->
        <div class="order-3 md:order-1 md:w-5/12 lg:w-1/3 bg-[#0f172a] text-white flex flex-col justify-between shrink-0 shadow-2xl z-20 relative overflow-y-auto">
            <div class="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>
            <div class="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>

            <div class="relative z-10 h-full flex flex-col p-8 md:p-12">
                <div class="hidden md:flex items-center gap-3 mb-8 shrink-0">
                    <img src="/rr-logo.png" alt="Logo" class="w-16 h-16 rounded-full shadow-lg" />
                    <h1 class="font-serif text-3xl tracking-wide">Rowan Rose Solicitors</h1>
                </div>

                <div class="flex-1">
                    <h2 class="text-2xl font-serif font-light leading-tight mb-4 text-brand-orange">Multi Discipline Law Firm in the Heart of Manchester</h2>
                    <p class="text-slate-300 font-light leading-relaxed text-sm mb-8 border-l-2 border-slate-700 pl-4">Rowan Rose is a high-end boutique law firm committed to delivering the highest quality of service and advice.</p>

                    <h3 class="text-lg font-serif text-white mb-6 border-b border-slate-700 pb-2">Why Choose Us</h3>

                    <div class="space-y-4">
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-scale-balanced text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Expertise</h4><p class="text-slate-400 text-xs leading-relaxed">We have the expertise to handle a wide range of legal matters.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-bullseye text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Accuracy</h4><p class="text-slate-400 text-xs leading-relaxed">Accurate, comprehensive and detailed legal advice.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-shield-halved text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Reliability</h4><p class="text-slate-400 text-xs leading-relaxed">Well-versed in providing reliable legal advice.</p></div>
                        </div>
                        <div class="flex gap-4 items-start">
                            <div class="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700"><i class="fas fa-sterling-sign text-brand-orange text-lg"></i></div>
                            <div><h4 class="text-brand-orange font-medium text-base mb-1">Cost Effective</h4><p class="text-slate-400 text-xs leading-relaxed">Best value services without compromising quality.</p></div>
                        </div>
                    </div>

                    <div class="mt-10 border-t border-slate-700 pt-7">
                        <div class="space-y-4">
                            <div class="flex items-center gap-4"><div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><i class="fas fa-envelope text-brand-orange text-lg"></i></div><a href="mailto:info@rowanrose.co.uk" class="text-white hover:text-brand-orange text-sm">info@rowanrose.co.uk</a></div>
                            <div class="flex items-center gap-4"><div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><i class="fas fa-phone text-brand-orange text-lg"></i></div><a href="tel:01615330444" class="text-white hover:text-brand-orange text-sm">0161 533 0444</a></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- RIGHT PANEL -->
        <div class="order-2 md:order-2 flex-1 bg-white relative overflow-y-auto">
            <div class="max-w-4xl mx-auto p-6 md:p-12 lg:p-16">
                <h1 class="text-3xl md:text-4xl font-serif text-slate-800 mb-2">Client Questionnaire</h1>
                <p class="text-slate-600 text-lg mb-2">Please answer the following questions honestly and to the best of your knowledge.</p>

                <div class="mb-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div class="flex gap-8">
                        <div><span class="text-slate-500 text-sm">Client Reference:</span> <span class="font-semibold text-slate-800">${clientRef}</span></div>
                        <div><span class="text-slate-500 text-sm">Client Name:</span> <span class="font-semibold text-slate-800">${contactName}</span></div>
                    </div>
                </div>

                <div id="errorMessage" class="hidden bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 mb-6 font-medium"></div>

                <form id="questionnaireForm">

                    <!-- ==================== GAMBLING TOGGLE ==================== -->
                    <div class="mb-8 p-5 bg-amber-50 rounded-xl border-2 border-amber-300">
                        <label class="flex items-center gap-4 cursor-pointer">
                            <input type="checkbox" id="gamblerToggle" name="gamblerToggle">
                            <span class="text-amber-900 font-bold text-lg">I am or have been a gambler</span>
                        </label>
                        <p class="text-amber-700 text-sm mt-2 ml-12">Tick this box if the gambling section below applies to you.</p>
                    </div>

                    <!-- ==================== GAMBLING SECTION (hidden by default) ==================== -->
                    <div id="gamblingSection" style="display:none;">

                        <!-- Previous Betting Companies & Losses -->
                        <div class="mb-8 p-5 bg-amber-50 rounded-xl border border-amber-200">
                            <div class="mb-4">
                                <label for="previousBettingCompanies" class="block text-amber-900 font-semibold mb-2">Previous Betting Companies (please list all)</label>
                                <textarea id="previousBettingCompanies" name="previousBettingCompanies" rows="3" class="w-full px-4 py-3 border border-amber-300 rounded-lg text-sm bg-white text-gray-900 resize-y" placeholder="e.g. Bet365, William Hill, Paddy Power..."></textarea>
                            </div>
                            <div>
                                <label for="estimatedGamblingLosses" class="block text-amber-900 font-semibold mb-2">Estimated Gambling Losses (&pound;)</label>
                                <input type="text" id="estimatedGamblingLosses" name="estimatedGamblingLosses" class="w-full px-4 py-3 border border-amber-300 rounded-lg text-sm bg-white text-gray-900" placeholder="e.g. 5000">
                            </div>
                        </div>

                        <!-- SELF-EXCLUSION & PROBLEM GAMBLING -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-ban mr-2"></i>SELF-EXCLUSION & PROBLEM GAMBLING</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q41"><span class="text-slate-700">Did you ever self-exclude from any gambling platform?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q42"><span class="text-slate-700">Were you able to create a new account or use someone else's account after self-exclusion?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q43"><span class="text-slate-700">Did the gambling company fail to provide support after signs of problem gambling?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q44"><span class="text-slate-700">Were you contacted with promotions while self-excluded?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q45"><span class="text-slate-700">Did you continue to receive marketing materials after self-excluding?</span></label>
                            </div>
                        </div>

                        <!-- VIP STATUS & AFFORDABILITY -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-crown mr-2"></i>VIP STATUS & AFFORDABILITY</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q46"><span class="text-slate-700">Were you offered VIP status without the gambling company asking for proof of source of funds?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q47"><span class="text-slate-700">Did the operator carry out affordability checks on your account?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q48"><span class="text-slate-700">Were you given access to VIP events without verifying affordability?</span></label>
                            </div>
                        </div>

                        <!-- TERMS & CONDITIONS -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-file-contract mr-2"></i>TERMS & CONDITIONS</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q49"><span class="text-slate-700">Did the gambling company make changes to T&amp;Cs without notifying you clearly?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q50"><span class="text-slate-700">Were the terms and conditions clearly presented to you?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q51"><span class="text-slate-700">Do you believe the company unfairly withheld your winnings?</span></label>
                            </div>
                        </div>

                        <!-- IDENTITY & SOURCE OF FUNDS -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-id-card mr-2"></i>IDENTITY & SOURCE OF FUNDS</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q52"><span class="text-slate-700">Were you asked to verify your identity when opening your account?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q53"><span class="text-slate-700">Were you asked about your source of funds?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q54"><span class="text-slate-700">Have you used borrowed money/overdrafts to gamble, and the company failed to intervene?</span></label>
                            </div>
                        </div>

                        <!-- DEPOSITS & WITHDRAWALS -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-money-bill-transfer mr-2"></i>DEPOSITS & WITHDRAWALS</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q55"><span class="text-slate-700">Have you had issues withdrawing winnings, such as delays or refusals?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q56"><span class="text-slate-700">Did you experience delays or issues when trying to withdraw funds?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q57"><span class="text-slate-700">Did you reverse withdrawals to continue gambling?</span></label>
                            </div>
                        </div>

                        <!-- GAMBLING LOSSES & INTERVENTION -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-chart-line mr-2"></i>GAMBLING LOSSES & INTERVENTION</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q58"><span class="text-slate-700">Did you chase your losses by gambling more?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q59"><span class="text-slate-700">Did anyone (family, friends) intervene or express concern about your gambling?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q60"><span class="text-slate-700">Have you ever tried to seek compensation for gambling losses and been told the company was not at fault?</span></label>
                            </div>
                        </div>

                        <!-- BONUSES & PROMOTIONS -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-gift mr-2"></i>BONUSES & PROMOTIONS</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q61"><span class="text-slate-700">Have you been misled about the terms of bonus bets?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q62"><span class="text-slate-700">Did these offers encourage you to gamble more than you intended?</span></label>
                            </div>
                        </div>

                        <!-- TECHNICAL ISSUES -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-laptop-code mr-2"></i>TECHNICAL ISSUES</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q63"><span class="text-slate-700">Did you experience any technical issues (glitches, errors) while gambling?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q64"><span class="text-slate-700">Did technical issues result in financial loss?</span></label>
                            </div>
                        </div>

                        <!-- COMPLAINTS & DISPUTES -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-gavel mr-2"></i>COMPLAINTS & DISPUTES</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q65"><span class="text-slate-700">Have you previously made a complaint to the gambling operator?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q66"><span class="text-slate-700">Was your complaint resolved to your satisfaction?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q67"><span class="text-slate-700">Were you ever asked to sign an NDA or gagging clause?</span></label>
                            </div>
                        </div>

                        <!-- REGULATORY COMPLIANCE -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-clipboard-check mr-2"></i>REGULATORY COMPLIANCE</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q68"><span class="text-slate-700">Do you believe the operator failed to comply with gambling regulations?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q69"><span class="text-slate-700">Did the company fail to protect you as a vulnerable customer?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q70"><span class="text-slate-700">Do you believe the company acted irresponsibly by not following social responsibility obligations?</span></label>
                            </div>
                        </div>

                        <!-- BANK RESPONSIBILITY -->
                        <div class="mb-8">
                            <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-building-columns mr-2"></i>BANK RESPONSIBILITY</h3></div>
                            <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q71"><span class="text-slate-700">Did your bank allow gambling transactions despite signs of financial difficulty?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q72"><span class="text-slate-700">I was never contacted by my bank about my gambling transactions and was not offered any support.</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q73"><span class="text-slate-700">Did your bank offer support or signpost you to gambling support services?</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q74"><span class="text-slate-700">I informed my bank about my gambling addiction or financial difficulties.</span></label>
                                <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q75"><span class="text-slate-700">I was never offered any support or services by the bank?</span></label>
                            </div>
                        </div>

                    </div>
                    <!-- END GAMBLING SECTION -->

                    <!-- ==================== IRL SECTION ==================== -->

                    <!-- INCOME & FINANCIAL BACKGROUND -->
                    <div class="mb-8">
                        <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-sterling-sign mr-2"></i>INCOME & FINANCIAL BACKGROUND</h3></div>
                        <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q1"><span class="text-slate-700">Were you employed at the time you took out the loan / credit?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q2"><span class="text-slate-700">Were you self-employed at the time you took out the loan / credit?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q3"><span class="text-slate-700">Have you had or do you have a poor credit history?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q4"><span class="text-slate-700">Was your income less than &pound;20,000 per annum at the time?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q5"><span class="text-slate-700">Have you previously had a CCJ implemented against you?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q6"><span class="text-slate-700">Did you struggle to repay the borrowing on time?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q7"><span class="text-slate-700">Have you had or do you have an insufficient credit history?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q8"><span class="text-slate-700">Do you have a lack of financial literacy?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q9"><span class="text-slate-700">Were you of a young age when taking the credit?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q10"><span class="text-slate-700">Did you or do you have any legal issues at the time?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q11"><span class="text-slate-700">Were you of an older age (70+) when taking any sort of credit?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q12"><span class="text-slate-700">Have you or do you have a history of defaulting on loans?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q13"><span class="text-slate-700">Were you ever homeless or without stable housing?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q14"><span class="text-slate-700">Were you relying on credit to get through the month?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q15"><span class="text-slate-700">Did you miss any repayments?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q16"><span class="text-slate-700">Have you had any recent major life events in the last 10 years?</span></label>
                        </div>
                    </div>

                    <!-- CURRENT & PREVIOUS HEALTH CONDITIONS -->
                    <div class="mb-8">
                        <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-heart-pulse mr-2"></i>CURRENT & PREVIOUS HEALTH CONDITIONS</h3></div>
                        <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q17"><span class="text-slate-700">Did you suffer a traumatic brain injury (TBI) in the last 10 years?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q18"><span class="text-slate-700">Did you suffer any head injuries in the last 10 years?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q19"><span class="text-slate-700">Do you have any vision impairments affecting your financial decision-making?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q20"><span class="text-slate-700">Do you have any hearing loss or deafness affecting your financial decision-making?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q21"><span class="text-slate-700">Do you have any neurological injuries or disorders?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q22"><span class="text-slate-700">Do you have any musculoskeletal injuries?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q23"><span class="text-slate-700">Did you suffer from PTSD affecting your financial decision-making?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q24"><span class="text-slate-700">Do you have any speech and language disorders affecting your financial decision-making?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q25"><span class="text-slate-700">Do you have any learning difficulties: Dyslexia, ADHD, Dyscalculia, Dysgraphia?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q26"><span class="text-slate-700">Did you inform the lender about your health condition?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q27"><span class="text-slate-700">Did the lender offer any support or adjustments?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q28"><span class="text-slate-700">Were you receiving any form of care or support at the time?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q29"><span class="text-slate-700">Are you suffering from any memory impairments?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q30"><span class="text-slate-700">Are you affected by Autism Spectrum Disorder (ASD)?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q31"><span class="text-slate-700">Are you affected by intellectual disabilities?</span></label>
                        </div>
                    </div>

                    <!-- PERSONAL & LIFESTYLE -->
                    <div class="mb-8">
                        <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-user mr-2"></i>PERSONAL & LIFESTYLE</h3></div>
                        <div class="border border-t-0 border-slate-200 rounded-b-xl divide-y divide-slate-100">
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q32"><span class="text-slate-700">Were you a single parent at the time?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q33"><span class="text-slate-700">At any point whilst having the credit, would you have considered yourself a gambler?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q34"><span class="text-slate-700">At any point of using the credit, would you consider yourself an alcoholic?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q35"><span class="text-slate-700">Have you become depressed about keeping up with your monthly payments?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q36"><span class="text-slate-700">Have you ever sought medical support regarding the impact of debt on your mental health?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q37"><span class="text-slate-700">Have you ever contacted your lender(s) to inform them of difficulties making payments?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q38"><span class="text-slate-700">Have you ever felt that the finance should not have been provided to you?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q39"><span class="text-slate-700">Did you ever have to borrow more money to cover existing debts?</span></label>
                            <label class="q-row flex items-center gap-4 p-4 cursor-pointer"><input type="checkbox" name="q40"><span class="text-slate-700">Have you ever had to rely on overdrafts, payday loans, or credit cards for everyday living?</span></label>
                        </div>
                    </div>

                    <!-- ADDITIONAL INFORMATION -->
                    <div class="mb-8">
                        <div class="section-header text-white px-5 py-3 rounded-t-xl"><h3 class="text-lg font-semibold tracking-wide"><i class="fas fa-comment-dots mr-2"></i>ADDITIONAL INFORMATION</h3></div>
                        <div class="border border-t-0 border-slate-200 rounded-b-xl p-5">
                            <p class="text-slate-500 text-sm mb-3">Please provide any additional information that may be relevant to your claim.</p>
                            <textarea id="additionalInformation" name="additionalInformation" rows="5" class="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white text-gray-900 resize-y" placeholder="Type any additional details here..."></textarea>
                        </div>
                    </div>

                    <!-- DECLARATION & SIGNATURE -->
                    <div class="mt-10 p-6 bg-slate-50 rounded-xl border-2 border-slate-300">
                        <h3 class="text-lg font-semibold text-slate-800 mb-3">Declaration</h3>
                        <div class="text-center p-4 bg-white rounded-lg border border-slate-200 mb-4">
                            <p class="text-slate-700 text-sm leading-relaxed">I, <span class="font-bold text-brand-orange">${contactName}</span>, confirm that the information provided in this questionnaire is true and accurate to the best of my knowledge. I authorise Rowan Rose Solicitors to use this information in connection with my claim.</p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label for="printName" class="block text-slate-600 text-sm font-medium mb-1">Print Name</label>
                                <input type="text" id="printName" name="printName" value="${contactName}" class="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-slate-100 text-gray-900" readonly>
                            </div>
                            <div>
                                <label for="signDate" class="block text-slate-600 text-sm font-medium mb-1">Date</label>
                                <input type="text" id="signDate" name="signDate" value="${new Date().toLocaleDateString('en-GB')}" class="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-slate-100 text-gray-900" readonly>
                            </div>
                        </div>

                        <h3 class="text-lg font-semibold text-slate-800 mb-1">Your Signature</h3>
                        <p class="text-slate-500 text-sm mb-4">Sign below to confirm your declaration</p>
                        <div class="relative bg-white border-2 border-slate-300 rounded-xl overflow-hidden">
                            <canvas id="signatureCanvas" class="w-full cursor-crosshair" style="height:180px;touch-action:none;"></canvas>
                            <div id="signaturePlaceholder" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 text-2xl italic pointer-events-none">Sign here</div>
                        </div>
                        <div class="flex justify-between items-center mt-3">
                            <span class="text-slate-400 text-sm">Draw with finger or mouse</span>
                            <button type="button" onclick="clearSignature()" class="text-slate-500 hover:text-red-500 text-sm font-semibold uppercase">Clear</button>
                        </div>
                    </div>

                    <button type="submit" id="submitBtn" class="w-full mt-8 py-5 bg-brand-orange hover:bg-orange-600 text-white text-xl font-bold rounded-xl shadow-lg hover:shadow-xl transition-all uppercase tracking-wide">Submit Questionnaire</button>
                </form>

                <div id="loading" class="hidden text-center py-16">
                    <div class="w-12 h-12 border-4 border-slate-200 border-t-brand-orange rounded-full mx-auto" style="animation:spin 1s linear infinite;"></div>
                    <p class="mt-4 text-slate-600">Submitting your questionnaire...</p>
                </div>

                <div id="success" class="hidden text-center py-16">
                    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-check text-3xl text-green-600"></i></div>
                    <h2 class="text-2xl font-bold text-green-700 mb-2">Questionnaire Submitted Successfully!</h2>
                    <p class="text-slate-600">Thank you. We will review your information and be in touch shortly.</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Toggle gambling section
        const gamblerToggle = document.getElementById('gamblerToggle');
        const gamblingSection = document.getElementById('gamblingSection');
        gamblerToggle.addEventListener('change', function() {
            gamblingSection.style.display = this.checked ? 'block' : 'none';
        });

        // Checked row styling
        document.querySelectorAll('.q-row input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', function() {
                this.closest('.q-row').classList.toggle('checked', this.checked);
            });
        });

        // Signature canvas
        const canvas = document.getElementById('signatureCanvas');
        const ctx = canvas.getContext('2d');
        const placeholder = document.getElementById('signaturePlaceholder');
        let isDrawing = false, hasSignature = false;

        function resizeCanvas() {
            const ratio = window.devicePixelRatio || 1;
            const width = canvas.parentElement.clientWidth;
            canvas.width = width * ratio; canvas.height = 180 * ratio;
            canvas.style.width = width + 'px'; canvas.style.height = '180px';
            ctx.scale(ratio, ratio); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        function hidePlaceholder() { placeholder.style.display = 'none'; hasSignature = true; }

        canvas.addEventListener('mousedown', e => { isDrawing = true; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); });
        canvas.addEventListener('mousemove', e => { if (!isDrawing) return; const r = canvas.getBoundingClientRect(); ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseout', () => isDrawing = false);
        canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0], r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); isDrawing = true; });
        canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!isDrawing) return; const t = e.touches[0], r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); hidePlaceholder(); });
        canvas.addEventListener('touchend', e => { e.preventDefault(); isDrawing = false; });

        function clearSignature() {
            const ratio = window.devicePixelRatio || 1;
            ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.scale(ratio, ratio); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            hasSignature = false; placeholder.style.display = 'block';
        }

        // Form submission
        document.getElementById('questionnaireForm').addEventListener('submit', async e => {
            e.preventDefault();

            if (!hasSignature) { alert('Please provide your signature.'); return; }

            // Collect all question answers
            const questions = {};
            for (let i = 1; i <= 75; i++) {
                const cb = document.querySelector('input[name="q' + i + '"]');
                questions['q' + i] = cb ? cb.checked : false;
            }

            const payload = {
                contactId: ${contact.id},
                questions: questions,
                isGambler: gamblerToggle.checked,
                previousBettingCompanies: document.getElementById('previousBettingCompanies') ? document.getElementById('previousBettingCompanies').value.trim() : '',
                estimatedGamblingLosses: document.getElementById('estimatedGamblingLosses') ? document.getElementById('estimatedGamblingLosses').value.trim() : '',
                additionalInformation: document.getElementById('additionalInformation').value.trim(),
                signatureData: canvas.toDataURL('image/png')
            };

            document.getElementById('questionnaireForm').style.display = 'none';
            document.getElementById('loading').style.display = 'block';

            try {
                const response = await fetch('/api/submit-questionnaire', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                document.getElementById('loading').style.display = 'none';
                if (result.success) {
                    document.getElementById('success').style.display = 'block';
                } else {
                    document.getElementById('errorMessage').textContent = result.message || 'Error submitting questionnaire.';
                    document.getElementById('errorMessage').classList.remove('hidden');
                    document.getElementById('questionnaireForm').style.display = 'block';
                }
            } catch (error) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('errorMessage').textContent = 'Error submitting questionnaire. Please try again.';
                document.getElementById('errorMessage').classList.remove('hidden');
                document.getElementById('questionnaireForm').style.display = 'block';
            }
        });
    <\/script>
</body>
</html>`);
    } catch (error) {
        console.error('Error serving questionnaire form:', error);
        res.status(500).send('Server error');
    }
});
*/

// Static Questionnaire Routes (preview only - no contact data injected)
app.get(['/questionnaire1', '/questionnaire/1'], (req, res) => {
    res.sendFile(path.join(__dirname, 'questionnaire1.html'));
});

app.get(['/questionnaire2', '/questionnaire/2'], (req, res) => {
    res.sendFile(path.join(__dirname, 'questionnaire2.html'));
});

// Generate questionnaire token for a contact
// POST /api/generate-questionnaire-token  { contactId, type: 1|2 }
app.post('/api/generate-questionnaire-token', async (req, res) => {
    const { contactId, type } = req.body;
    if (!contactId || ![1, 2].includes(Number(type))) {
        return res.status(400).json({ success: false, message: 'contactId and type (1 or 2) required' });
    }
    try {
        // Upsert: delete old unused token for this contact+type, create fresh one
        await pool.query(
            'DELETE FROM questionnaire_tokens WHERE contact_id = $1 AND questionnaire_type = $2 AND submitted = false',
            [contactId, type]
        );
        const tokenRes = await pool.query(
            `INSERT INTO questionnaire_tokens (contact_id, questionnaire_type)
             VALUES ($1, $2) RETURNING token`,
            [contactId, type]
        );
        const token = tokenRes.rows[0].token;
        const label = Number(type) === 1 ? 'Gambling Questionnaire' : 'IRL Questionnaire';
        res.json({ success: true, token, label, url: `/questionnaire/token/${token}` });
    } catch (error) {
        console.error('Generate questionnaire token error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve questionnaire via secure token
// GET /questionnaire/token/:token
app.get('/questionnaire/token/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenRes = await pool.query(
            `SELECT qt.*, c.id as cid, c.first_name, c.last_name, c.full_name, c.client_id, c.q1_submitted, c.q2_submitted
             FROM questionnaire_tokens qt
             JOIN contacts c ON c.id = qt.contact_id
             WHERE qt.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).send(`<!DOCTYPE html><html><head><title>Invalid Link</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;}h1{color:#EF4444;}</style></head><body><h1>Invalid Link</h1><p>This questionnaire link is not valid. Please contact Rowan Rose Solicitors.</p></body></html>`);
        }
        const row = tokenRes.rows[0];
        const qType = row.questionnaire_type;
        const alreadySubmitted = qType === 1 ? row.q1_submitted : row.q2_submitted;
        if (row.submitted || alreadySubmitted) {
            return res.status(400).send(renderAlreadySubmittedPage('Already Submitted', 'This questionnaire has already been submitted. Thank you for completing it — no further action is needed.'));
        }
        const templateFile = qType === 1 ? 'questionnaire1.html' : 'questionnaire2.html';
        const contactName = row.full_name || `${row.first_name} ${row.last_name}`.trim();
        const clientRef = row.client_id || `RR-${row.cid}`;
        const today = new Date().toLocaleDateString('en-GB');

        let html = fs.readFileSync(path.join(__dirname, templateFile), 'utf8');
        html = html.replace(/\$\{contactName\}/g, contactName);
        html = html.replace(/\$\{clientRef\}/g, clientRef);
        html = html.replace(/\$\{new Date\(\)\.toLocaleDateString\('en-GB'\)\}/g, today);
        // inject token and questionnaire type into payload (must be before ${contact.id} is replaced)
        html = html.replace("contactId: '${contact.id}'", `contactId: '${token}', questionnaireType: ${qType}`);
        html = html.replace(/\$\{contact\.id\}/g, token);

        res.send(html);
    } catch (error) {
        console.error('Error serving questionnaire token:', error);
        res.status(500).send('Server error');
    }
});

app.get('/iddocument/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'iddocument.html'));
});

// Submit Combined Questionnaire
app.post('/api/submit-questionnaire', async (req, res) => {
    const { contactId: token, questionnaireType, questions, isGambler, previousBettingCompanies, estimatedGamblingLosses, additionalInformation, signatureData } = req.body;

    if (!token || !questions || !signatureData) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Look up contact via token
        const tokenRes = await pool.query(
            `SELECT qt.*, c.id as cid, c.first_name, c.last_name, c.q1_submitted, c.q2_submitted
             FROM questionnaire_tokens qt
             JOIN contacts c ON c.id = qt.contact_id
             WHERE qt.token = $1`,
            [token]
        );

        if (tokenRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired questionnaire link' });
        }

        const row = tokenRes.rows[0];
        const contactId = row.cid;
        const qType = questionnaireType || row.questionnaire_type;
        const alreadySubmitted = qType === 1 ? row.q1_submitted : row.q2_submitted;
        const contact = { id: contactId, first_name: row.first_name, last_name: row.last_name };

        if (row.submitted || alreadySubmitted) {
            return res.status(400).json({ success: false, message: 'Questionnaire has already been submitted.', alreadySubmitted: true });
        }

        // Build JSONB data
        const questionnaireData = {
            questions,
            questionnaireType: qType,
            isGambler: isGambler || false,
            previousBettingCompanies: previousBettingCompanies || '',
            estimatedGamblingLosses: estimatedGamblingLosses || '',
            additionalInformation: additionalInformation || '',
            submittedAt: new Date().toISOString()
        };

        const qTypeCol = qType === 1 ? 'q1_submitted' : 'q2_submitted';
        const qLabel = qType === 1 ? 'GAMBLING' : 'IRL';

        // --- UPDATE DB IMMEDIATELY ---
        await pool.query(
            `UPDATE contacts SET questionnaire_data = $1, questionnaire_submitted = true, ${qTypeCol} = true WHERE id = $2`,
            [JSON.stringify(questionnaireData), contactId]
        );
        await pool.query('UPDATE questionnaire_tokens SET submitted = true WHERE token = $1', [token]);

        // --- IMMEDIATE RESPONSE ---
        res.json({ success: true, message: 'Questionnaire submitted successfully' });

        // --- BACKGROUND PROCESSING ---
        (async () => {
            try {
                console.log(`[Background Questionnaire] Starting processing for contact ${contactId}...`);

                const folderPath = buildS3Folder(contact.first_name, contact.last_name, contactId);

                // 1. Upload Signature to S3
                const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
                const signatureBuffer = Buffer.from(base64Data, 'base64');
                const signatureKey = `${folderPath}Signatures/signature_questionnaire.png`;

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: signatureKey,
                    Body: signatureBuffer,
                    ContentType: 'image/png'
                }));

                // Generate presigned URL
                const signatureUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: signatureKey }), { expiresIn: 604800 });

                // 2. Update contact with signature URL
                await pool.query('UPDATE contacts SET signature_questionnaire_url = $1 WHERE id = $2', [signatureUrl, contactId]);

                // 3. Save signature to documents table
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, `Signature_${qLabel}_Questionnaire.png`, 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Questionnaire']]
                );

                // 4. Log action
                await pool.query(
                    `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description, metadata)
                     VALUES ($1, 'client', $2, 'questionnaire_submitted', 'forms', $3, $4)`,
                    [
                        contactId,
                        String(contactId),
                        `Client submitted ${qLabel} questionnaire`,
                        JSON.stringify({ questionnaireType: qType, isGambler: isGambler || false, questionsAnswered: Object.values(questions).filter(v => v === true).length })
                    ]
                );

                // 5. Generate Questionnaire PDF from template
                const templateSearchName = qType === 1 ? 'gambling_questionnaire' : 'irl_questionnaire';
                try {
                    console.log(`[Background Questionnaire] Generating PDF from ${templateSearchName} template...`);

                    // Find template in oo_templates
                    const templateRes = await pool.query(
                        `SELECT s3_key FROM oo_templates WHERE name ILIKE $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1`,
                        [`%${templateSearchName}%`]
                    );

                    if (templateRes.rows.length === 0) {
                        console.warn(`[Background Questionnaire] ${templateSearchName} template not found in oo_templates, skipping PDF generation`);
                    } else {
                        const templateS3Key = templateRes.rows[0].s3_key;
                        console.log(`[Background Questionnaire] Using template: ${templateS3Key}`);

                        // Download template from S3
                        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: templateS3Key });
                        const s3Resp = await s3Client.send(getCmd);
                        const chunks = [];
                        for await (const chunk of s3Resp.Body) { chunks.push(chunk); }
                        const templateBuffer = Buffer.concat(chunks);

                        // Build template variables
                        const CHECKED = '☑';
                        const UNCHECKED = '☐';
                        const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
                        const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

                        const templateVars = {
                            // All 83 question checkboxes: q1...q83
                            ...Object.fromEntries(
                                Array.from({ length: 83 }, (_, i) => {
                                    const key = `q${i + 1}`;
                                    return [key, questions[key] ? CHECKED : UNCHECKED];
                                })
                            ),

                            // Gambler toggle
                            isGambler: isGambler ? CHECKED : UNCHECKED,

                            // Text fields
                            previousBettingCompanies: previousBettingCompanies || '',
                            estimatedGamblingLosses: estimatedGamblingLosses || '',
                            additionalInformation: additionalInformation || '',

                            // Client details
                            client_id: contact.client_id || `RR-${contactId}`,
                            client_name: fullName,
                            print_name: fullName,
                            today: today,
                            date: today,

                            // Signature image
                            signatureImage: signatureBuffer ? {
                                _type: 'image',
                                data: signatureBuffer.toString('base64'),
                                extension: '.png',
                                width: 5,
                                height: 2.5,
                            } : null,
                        };

                        // Pre-process: normalise signature image tag to function-call form
                        // docx-templates v4 IMAGE command requires: {{IMAGE signatureImage()}}
                        let processedTemplate = templateBuffer;
                        try {
                            const tZip = new PizZip(templateBuffer);
                            const docXml = tZip.file('word/document.xml');
                            if (docXml) {
                                let xml = docXml.asText();
                                // Replace all variants (with or without IMAGE keyword, with or without parens)
                                // to the canonical function-call form {{IMAGE signatureImage()}}
                                xml = xml.replace(/\{\{IMAGE signatureImage\(\)\}\}/g, '{{IMAGE signatureImage()}}'); // already correct — no-op
                                xml = xml.replace(/\{\{IMAGE signatureImage\}\}/g, '{{IMAGE signatureImage()}}');
                                xml = xml.replace(/\{\{signatureImage\}\}/g, '{{IMAGE signatureImage()}}');
                                // Handle split runs (tag split across XML <w:r> elements)
                                xml = xml.replace(/\{\{IMAGE signatureImage(?!\()/g, '{{IMAGE signatureImage(');
                                xml = xml.replace(/\{\{signatureImage(?!\()/g, '{{IMAGE signatureImage(');
                                tZip.file('word/document.xml', xml);
                                processedTemplate = tZip.generate({ type: 'nodebuffer' });
                                console.log('[Background Questionnaire] Template pre-processed: signature tag normalised');
                            }
                        } catch (ppErr) {
                            console.warn('[Background Questionnaire] Template pre-processing skipped:', ppErr.message);
                        }

                        // Remove signatureImage from data (will be provided via additionalJsContext as a function)
                        const { signatureImage: _sigImg, ...templateDataWithoutSig } = templateVars;

                        // Fill template with createReport
                        let docxBuffer;
                        try {
                            docxBuffer = await createReport({
                                template: processedTemplate,
                                data: templateDataWithoutSig,
                                additionalJsContext: {
                                    // docx-templates v4: IMAGE expression must be callable
                                    // data must be a Buffer (not base64 string)
                                    signatureImage: () => signatureBuffer ? {
                                        width: 5,     // cm
                                        height: 2.5,  // cm
                                        data: signatureBuffer,
                                        extension: '.png',
                                    } : null,
                                },
                                cmdDelimiter: ['{{', '}}'],
                            });
                            console.log('[Background Questionnaire] DOCX template filled via createReport');
                        } catch (crErr) {
                            console.warn('[Background Questionnaire] createReport failed, trying Docxtemplater:', crErr.message);
                            const zip = new PizZip(templateBuffer);
                            const doc = new Docxtemplater(zip, {
                                paragraphLoop: true,
                                linebreaks: true,
                                delimiters: { start: '{{', end: '}}' },
                            });
                            const flatVars = { ...templateVars };
                            if (flatVars.signatureImage && typeof flatVars.signatureImage === 'object') {
                                flatVars.signatureImage = '[Signature]';
                            }
                            doc.render(flatVars);
                            docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });
                        }

                        // Convert DOCX to PDF via OnlyOffice
                        let pdfBuffer;
                        try {
                            pdfBuffer = await convertDocxToPdf(docxBuffer, `${qLabel}_Questionnaire_${contactId}.docx`);
                            console.log('[Background Questionnaire] OnlyOffice conversion successful');
                        } catch (ooErr) {
                            console.warn('[Background Questionnaire] OnlyOffice failed, trying fallback:', ooErr.message);
                            const libreOfficePath = await findLibreOffice();
                            if (libreOfficePath) {
                                pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
                            } else {
                                pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
                            }
                        }

                        // Upload PDF to S3
                        const sanitizedFolder = folderPath.replace(/\s+/g, '_');
                        const pdfFileName = `${qLabel}_Questionnaire_${contactId}.pdf`;
                        const pdfS3Key = `${sanitizedFolder}Documents/Other/${pdfFileName}`;

                        await s3Client.send(new PutObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: pdfS3Key,
                            Body: pdfBuffer,
                            ContentType: 'application/pdf',
                        }));

                        const pdfDownloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: pdfS3Key }), { expiresIn: 604800 });

                        // Save PDF document record
                        await pool.query(
                            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [
                                contactId,
                                pdfFileName,
                                'pdf',
                                'Questionnaire',
                                pdfDownloadUrl,
                                `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
                                ['Questionnaire', 'Generated']
                            ]
                        );

                        console.log(`[Background Questionnaire] PDF generated and uploaded: ${pdfS3Key}`);
                    }
                } catch (pdfErr) {
                    console.error('[Background Questionnaire] PDF generation failed:', pdfErr.message);
                }

                console.log(`[Background Questionnaire] All tasks completed for contact ${contactId}`);

            } catch (err) {
                console.error('[Background Questionnaire] Background Processing Error:', err);
            }
        })();

    } catch (error) {
        console.error('Submit Questionnaire Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// =============================================
// ID UPLOAD TOKEN SYSTEM (Secure tokenised links)
// =============================================

// Generate ID upload token for a contact
// POST /api/generate-id-upload-token  { contactId }
app.post('/api/generate-id-upload-token', async (req, res) => {
    const { contactId } = req.body;
    if (!contactId) {
        return res.status(400).json({ success: false, message: 'contactId required' });
    }
    try {
        // Delete old unused tokens for this contact, then create fresh one
        await pool.query(
            'DELETE FROM id_upload_tokens WHERE contact_id = $1 AND submitted = false',
            [contactId]
        );
        const tokenRes = await pool.query(
            `INSERT INTO id_upload_tokens (contact_id) VALUES ($1) RETURNING token`,
            [contactId]
        );
        const token = tokenRes.rows[0].token;
        res.json({ success: true, token, url: `/id-upload/${token}` });
    } catch (error) {
        console.error('Generate ID upload token error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve ID upload page via secure token
// GET /id-upload/:token
app.get('/id-upload/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenRes = await pool.query(
            `SELECT it.*, c.id as cid, c.first_name, c.last_name
             FROM id_upload_tokens it
             JOIN contacts c ON c.id = it.contact_id
             WHERE it.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).send('<h1>Invalid or expired link</h1><p>This ID upload link is not valid. Please contact Rowan Rose Solicitors for a new link.</p>');
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.send(renderAlreadySubmittedPage('ID Already Uploaded', 'Your identification has already been uploaded using this link. If you need to upload again, please contact Rowan Rose Solicitors.'));
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).send('<h1>Link Expired</h1><p>This ID upload link has expired. Please contact Rowan Rose Solicitors for a new link.</p>');
        }
        // Serve the iddocument.html page
        res.sendFile(path.join(__dirname, 'iddocument.html'));
    } catch (error) {
        console.error('Serve ID upload page error:', error);
        res.status(500).send('Server error');
    }
});

// Validate ID upload token (called by iddocument.html to get contact info)
// GET /api/id-upload-token/:token/validate
app.get('/api/id-upload-token/:token/validate', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenRes = await pool.query(
            `SELECT it.*, c.id as cid, c.first_name, c.last_name
             FROM id_upload_tokens it
             JOIN contacts c ON c.id = it.contact_id
             WHERE it.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid token' });
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.status(400).json({ success: false, message: 'Already submitted' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Token expired' });
        }
        res.json({ success: true, first_name: row.first_name, last_name: row.last_name, contact_id: row.cid });
    } catch (error) {
        console.error('Validate ID upload token error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Handle ID upload via secure token
// POST /api/id-upload/:token
app.post('/api/id-upload/:token', upload.single('document'), async (req, res) => {
    const { token } = req.params;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        // Validate token
        const tokenRes = await pool.query(
            `SELECT it.*, c.id as cid, c.first_name, c.last_name
             FROM id_upload_tokens it
             JOIN contacts c ON c.id = it.contact_id
             WHERE it.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid token' });
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.status(400).json({ success: false, message: 'ID already uploaded with this link' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Token expired' });
        }

        const contactId = row.cid;
        const safeName = `${sanitizeNameForS3(row.first_name)}_${sanitizeNameForS3(row.last_name)}`;
        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);

        // Build S3 path — same structure as intake form ID uploads
        const folderPath = `${safeName}_${contactId}/Documents/ID_Document`;

        // Check for existing file with same name
        let s3FileName = `${baseName}${ext}`;
        const nameCheck = await pool.query(
            `SELECT name FROM documents WHERE contact_id = $1 AND name LIKE $2 AND category = $3`,
            [contactId, `${baseName}%${ext}`, 'ID Document']
        );
        if (nameCheck.rows.length > 0) {
            let maxVersion = 0;
            const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((\\d+)\\))?\\${ext}$`);
            nameCheck.rows.forEach(r => {
                const match = r.name.match(regex);
                if (match) {
                    const ver = match[1] ? parseInt(match[1]) : 0;
                    if (ver >= maxVersion) maxVersion = ver;
                }
            });
            s3FileName = `${baseName} (${maxVersion + 1})${ext}`;
        }

        const key = `${folderPath}/${s3FileName}`;

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

        // Determine document type
        const extLower = ext.toLowerCase().replace('.', '');
        let docType = 'unknown';
        if (['pdf'].includes(extLower)) docType = 'pdf';
        else if (['doc', 'docx'].includes(extLower)) docType = 'docx';
        else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic'].includes(extLower)) docType = 'image';

        // Save document record
        const { rows } = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags, document_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Completed') RETURNING *`,
            [contactId, s3FileName, docType, 'ID Document', s3Url, `${(file.size / 1024).toFixed(1)} KB`, ['ID Document', 'Uploaded', `Original: ${originalName}`]]
        );

        // Tick IDENTIFICATION checkbox in document_checklist
        await pool.query(
            `UPDATE contacts
             SET document_checklist = COALESCE(document_checklist, '{}')::jsonb || '{"identification": true}'::jsonb
             WHERE id = $1`,
            [contactId]
        );

        // Mark token as submitted
        await pool.query('UPDATE id_upload_tokens SET submitted = true WHERE token = $1', [token]);

        // Log action
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, 'client', $2, 'Client', 'document_completed', 'documents', $3, $4, NOW())`,
            [contactId, String(contactId), `Client uploaded ID document via secure link: "${s3FileName}"`, JSON.stringify({ document_id: rows[0].id, category: 'ID Document', via: 'id_upload_token' })]
        );

        console.log(`[ID Upload Token] "${originalName}" → "${key}" for contact ${contactId}, identification set to true`);
        res.json({ success: true, message: 'ID uploaded successfully' });
    } catch (error) {
        console.error('ID Upload Token Error:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

// ============================================
// Previous Address Token-Based Form
// ============================================

// POST /api/generate-previous-address-token  { contactId }
app.post('/api/generate-previous-address-token', async (req, res) => {
    const { contactId } = req.body;
    if (!contactId) {
        return res.status(400).json({ success: false, message: 'contactId required' });
    }
    try {
        // Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS previous_address_tokens (
                id SERIAL PRIMARY KEY,
                token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
                contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
                submitted BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
            );
        `);
        // Delete old unused tokens for this contact, then create fresh one
        await pool.query(
            'DELETE FROM previous_address_tokens WHERE contact_id = $1 AND submitted = false',
            [contactId]
        );
        const tokenRes = await pool.query(
            `INSERT INTO previous_address_tokens (contact_id) VALUES ($1) RETURNING token`,
            [contactId]
        );
        const token = tokenRes.rows[0].token;
        res.json({ success: true, token, url: `/previous-address/${token}` });
    } catch (error) {
        console.error('Generate previous address token error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve Previous Address page via secure token
// GET /previous-address/:token
app.get('/previous-address/:token', async (req, res) => {
    const { token } = req.params;
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS previous_address_tokens (
            id SERIAL PRIMARY KEY, token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
            contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
            submitted BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'
        );`);
        const tokenRes = await pool.query(
            `SELECT pat.*, c.id as cid, c.first_name, c.last_name
             FROM previous_address_tokens pat
             JOIN contacts c ON c.id = pat.contact_id
             WHERE pat.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).send('<h1>Invalid or expired link</h1><p>This link is not valid. Please contact Rowan Rose Solicitors for a new link.</p>');
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.send(renderAlreadySubmittedPage('Already Submitted', 'This form has already been submitted. If you need to make changes, please contact Rowan Rose Solicitors.'));
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).send('<h1>Link Expired</h1><p>This link has expired. Please contact Rowan Rose Solicitors for a new link.</p>');
        }
        res.sendFile(path.join(__dirname, 'previous-address.html'));
    } catch (error) {
        console.error('Serve previous address page error:', error);
        res.status(500).send('Server error');
    }
});

// Validate previous address token (called by previous-address.html to get contact info)
// GET /api/previous-address-token/:token/validate
app.get('/api/previous-address-token/:token/validate', async (req, res) => {
    const { token } = req.params;
    try {
        const tokenRes = await pool.query(
            `SELECT pat.*, c.id as cid, c.first_name, c.last_name,
                    c.address_line_1, c.address_line_2, c.city, c.state_county, c.postal_code,
                    c.previous_addresses
             FROM previous_address_tokens pat
             JOIN contacts c ON c.id = pat.contact_id
             WHERE pat.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid token' });
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.status(400).json({ success: false, message: 'Already submitted' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Token expired' });
        }

        // Fetch from previous_addresses table (authoritative source)
        const prevRes = await pool.query(
            'SELECT address_line_1, address_line_2, city, county, postal_code FROM previous_addresses WHERE contact_id = $1 ORDER BY id',
            [row.cid]
        );

        // Use table rows if available, otherwise fall back to JSONB
        let allPrev = [];
        if (prevRes.rows.length > 0) {
            allPrev = prevRes.rows;
        } else if (row.previous_addresses && Array.isArray(row.previous_addresses)) {
            allPrev = row.previous_addresses;
        }

        res.json({
            success: true,
            first_name: row.first_name,
            last_name: row.last_name,
            address_line_1: row.address_line_1,
            address_line_2: row.address_line_2,
            city: row.city,
            state_county: row.state_county,
            postal_code: row.postal_code,
            previous_addresses: allPrev
        });
    } catch (error) {
        console.error('Validate previous address token error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Submit previous address form
// POST /api/previous-address/:token
app.post('/api/previous-address/:token', async (req, res) => {
    const { token } = req.params;
    const { hasPreviousAddress, addresses } = req.body;

    try {
        const tokenRes = await pool.query(
            `SELECT pat.*, c.id as cid, c.first_name, c.last_name
             FROM previous_address_tokens pat
             JOIN contacts c ON c.id = pat.contact_id
             WHERE pat.token = $1`,
            [token]
        );
        if (tokenRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid token' });
        }
        const row = tokenRes.rows[0];
        if (row.submitted) {
            return res.status(400).json({ success: false, message: 'Already submitted' });
        }
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Token expired' });
        }

        const contactId = row.cid;

        if (hasPreviousAddress && addresses && addresses.length > 0) {
            // Insert each address into previous_addresses table
            for (const addr of addresses) {
                await pool.query(
                    `INSERT INTO previous_addresses (contact_id, address_line_1, address_line_2, city, county, postal_code)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [contactId, addr.address_line_1, addr.address_line_2 || null, addr.city, addr.county || null, addr.postal_code]
                );
            }

            // Also append to JSONB previous_addresses on contacts
            const contactRes = await pool.query('SELECT previous_addresses FROM contacts WHERE id = $1', [contactId]);
            let existing = contactRes.rows[0]?.previous_addresses || [];
            if (!Array.isArray(existing)) existing = [];
            const merged = existing.concat(addresses);
            await pool.query('UPDATE contacts SET previous_addresses = $1 WHERE id = $2', [JSON.stringify(merged), contactId]);
        }

        // Mark token as submitted
        await pool.query('UPDATE previous_address_tokens SET submitted = true WHERE token = $1', [token]);

        // Log action
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
             VALUES ($1, 'client', $2, 'Client', 'previous_address_submitted', 'contact', $3, $4, NOW())`,
            [
                contactId,
                String(contactId),
                hasPreviousAddress
                    ? `Client submitted ${addresses.length} previous address(es) via secure link`
                    : 'Client confirmed no additional previous addresses via secure link',
                JSON.stringify({ hasPreviousAddress, addresses: addresses || [] })
            ]
        );

        console.log(`[Previous Address] Contact ${contactId}: ${hasPreviousAddress ? addresses.length + ' address(es) added' : 'No previous addresses'}`);
        res.json({ success: true, message: 'Previous address submitted successfully' });
    } catch (error) {
        console.error('Previous Address Submit Error:', error);
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
            WHERE (n.user_id = $1 OR (n.user_id IS NULL AND n.type = 'action_error'))
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
            'SELECT COUNT(*) as count FROM persistent_notifications WHERE (user_id = $1 OR (user_id IS NULL AND type = \'action_error\')) AND is_read = FALSE',
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

        await pool.query('UPDATE persistent_notifications SET is_read = TRUE WHERE user_id = $1 OR (user_id IS NULL AND type = \'action_error\')', [userId]);

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
    background: linear - gradient(180deg, #0D1B2A 0 %, #1B263B 100 %);
    padding: 50px 40px;
    display: flex;
    flex - direction: column;
    position: fixed;
    height: 100vh;
    left: 0;
    top: 0;
}
                    .logo - container {
    margin - bottom: 40px;
}
                    .logo - container img {
    max - width: 200px;
    height: auto;
}
                    .sidebar - title {
    font - family: 'Playfair Display', serif;
    font - size: 28px;
    font - weight: 600;
    color: #ffffff;
    margin - bottom: 20px;
    line - height: 1.3;
}
                    .sidebar - text {
    color: #94a3b8;
    font - size: 15px;
    line - height: 1.7;
    margin - bottom: 30px;
}
                    .contact - details {
    margin - top: auto;
    padding - top: 30px;
    border - top: 1px solid rgba(255, 255, 255, 0.1);
}
                    .contact - item {
    color: #cbd5e1;
    font - size: 14px;
    margin - bottom: 12px;
    display: flex;
    align - items: center;
    gap: 10px;
}
                    .contact - item span { color: #F18F01; }
                    /* Right Content Area */
                    .main - content {
    flex: 1;
    margin - left: 380px;
    padding: 40px 60px;
    min - height: 100vh;
    background: #ffffff;
}
                    .form - header {
    margin - bottom: 30px;
}
                    .lender - badge {
    display: inline - block;
    background: linear - gradient(135deg, #1E3A5F, #0D1B2A);
    color: #F18F01;
    padding: 10px 20px;
    border - radius: 25px;
    font - weight: 700;
    font - size: 14px;
    margin - bottom: 20px;
    letter - spacing: 0.5px;
}
                    .form - title {
    font - family: 'Playfair Display', serif;
    font - size: 32px;
    font - weight: 600;
    color: #0D1B2A;
    margin - bottom: 10px;
}
                    .form - subtitle {
    color: #64748b;
    font - size: 16px;
}
                    /* Contact Info Grid */
                    .contact - info {
    background: #f8fafc;
    border - radius: 12px;
    padding: 25px;
    margin - bottom: 30px;
    border: 1px solid #e2e8f0;
}
                    .info - grid {
    display: grid;
    grid - template - columns: 1fr 1fr;
    gap: 20px;
}
                    .info - item {
    background: white;
    padding: 15px 18px;
    border - radius: 8px;
    border: 1px solid #e2e8f0;
}
                    .info - label {
    font - size: 11px;
    color: #64748b;
    text - transform: uppercase;
    letter - spacing: 0.5px;
    margin - bottom: 5px;
}
                    .info - value {
    font - size: 16px;
    color: #0D1B2A;
    font - weight: 600;
}
                    .full - width { grid - column: 1 / -1; }
                    /* Signature Section */
                    .signature - section {
    margin: 30px 0;
}
                    .signature - label {
    font - size: 16px;
    font - weight: 700;
    color: #0D1B2A;
    margin - bottom: 12px;
}
                    .signature - box {
    border: 2px dashed #1E3A5F;
    border - radius: 12px;
    background: #fafafa;
    position: relative;
    height: 180px;
    cursor: crosshair;
    transition: all 0.2s;
}
                    .signature - box:hover {
    border - color: #F18F01;
    background: #fffbf5;
}
#signatureCanvas {
    width: 100 %;
    height: 100 %;
    border - radius: 10px;
}
                    .clear - btn {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #ef4444;
    color: white;
    border: none;
    padding: 8px 14px;
    border - radius: 6px;
    cursor: pointer;
    font - size: 12px;
    font - weight: 600;
}
                    .signature - hint {
    text - align: center;
    color: #94a3b8;
    font - size: 13px;
    margin - top: 10px;
}
                    /* Consent */
                    .consent - text {
    font - size: 13px;
    color: #475569;
    line - height: 1.8;
    margin: 25px 0;
    padding: 20px;
    background: #f8fafc;
    border - radius: 10px;
    border - left: 4px solid #1E3A5F;
}
                    /* Links */
                    .doc - links {
    display: flex;
    gap: 20px;
    margin: 20px 0;
    justify - content: center;
}
                    .doc - link {
    color: #1E3A5F;
    text - decoration: none;
    font - size: 14px;
    font - weight: 600;
    padding: 10px 20px;
    border: 2px solid #1E3A5F;
    border - radius: 8px;
    transition: all 0.2s;
}
                    .doc - link:hover {
    background: #1E3A5F;
    color: white;
}
                    /* Submit Button */
                    .submit - btn {
    width: 100 %;
    background: linear - gradient(135deg, #F18F01, #d97706);
    color: white;
    border: none;
    padding: 18px;
    border - radius: 12px;
    font - size: 18px;
    font - weight: 700;
    cursor: pointer;
    margin - top: 25px;
    transition: all 0.3s ease;
    text - transform: uppercase;
    letter - spacing: 1px;
}
                    .submit - btn:hover {
    transform: translateY(-2px);
    box - shadow: 0 10px 25px rgba(241, 143, 1, 0.35);
}
                    /* States */
                    .loading, .success - message { display: none; text - align: center; padding: 60px 40px; }
                    .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e2e8f0;
    border - top - color: #F18F01;
    border - radius: 50 %;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }
                    .success - icon { font - size: 70px; margin - bottom: 20px; }
                    .success - title { font - family: 'Playfair Display', serif; font - size: 28px; color: #059669; margin - bottom: 10px; }
                    .success - text { color: #64748b; font - size: 16px; }
                    .error - message {
    background: #fef2f2;
    color: #dc2626;
    padding: 15px;
    border - radius: 8px;
    margin - top: 15px;
    display: none;
    text - align: center;
    font - weight: 500;
}
/* Mobile */
@media(max - width: 900px) {
                        .sidebar { display: none; }
                        .main - content { margin - left: 0; padding: 30px 20px; }
                        .info - grid { grid - template - columns: 1fr; }
                        .doc - links { flex - direction: column; align - items: center; }
}
                </style >
            </head >
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

            function stopDrawing() {isDrawing = false; }

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
            headers: {'Content-Type': 'application/json' },
            body: JSON.stringify({token: '${token}', caseId: '${caseId}', signatureData })
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
            </html >
    `);
    } catch (error) {
        console.error('Error serving sales signature page:', error);
        res.status(500).send('Server error');
    }
});

// ============================================================================
// RESIGN SIGNATURE PAGE - Simple page with message + signature canvas
// ============================================================================
app.get('/resign/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const result = await pool.query(
            `SELECT c.id as case_id, c.lender, c.resign_token,
                    cnt.id as contact_id, cnt.first_name, cnt.last_name,
                    cnt.email, cnt.phone, cnt.dob
             FROM cases c
             JOIN contacts cnt ON c.contact_id = cnt.id
             WHERE c.resign_token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.send(renderAlreadySubmittedPage(
                'Link Expired or Invalid',
                'This signature link is no longer valid. It may have already been used or has expired. Please contact us if you need assistance.'
            ));
        }

        const record = result.rows[0];
        const clientName = `${record.first_name} ${record.last_name}`;
        const clientEmail = record.email || '—';
        const clientPhone = record.phone || '—';
        const clientDob = record.dob ? new Date(record.dob).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
        const lenderName = record.lender || '—';

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Update Your Signature - Rowan Rose Solicitors</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: #fff; border-radius: 20px; box-shadow: 0 4px 24px rgba(15,23,42,0.08); border: 1px solid #e2e8f0; max-width: 620px; width: 100%; overflow: hidden; }
        .header { background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); padding: 35px 40px; text-align: center; }
        .header h1 { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 1.5px; text-transform: uppercase; }
        .content { padding: 40px; }
        .greeting { font-size: 18px; color: #1e293b; margin-bottom: 16px; }
        .message-box { background: linear-gradient(135deg, #fef9e7 0%, #fef3c7 100%); border-left: 5px solid #f59e0b; padding: 22px 26px; border-radius: 0 14px 14px 0; margin-bottom: 28px; }
        .message-box p { color: #92400e; font-size: 16px; line-height: 1.65; margin: 0; }
        .details-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 24px 28px; margin-bottom: 28px; }
        .details-card h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; }
        .detail-item { display: flex; flex-direction: column; }
        .detail-label { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
        .detail-value { font-size: 15px; font-weight: 600; color: #1e293b; word-break: break-word; }
        .detail-lender { grid-column: 1 / -1; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-top: 4px; }
        .detail-lender .detail-label { color: #3b82f6; }
        .detail-lender .detail-value { font-size: 18px; color: #1e40af; }
        .sig-label { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 10px; }
        .canvas-wrapper { border: 2px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; position: relative; margin-bottom: 12px; }
        canvas { display: block; width: 100%; cursor: crosshair; touch-action: none; }
        .btn-row { display: flex; gap: 12px; margin-bottom: 24px; }
        .btn-clear { flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px; background: #fff; color: #64748b; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn-clear:hover { background: #f1f5f9; }
        .btn-submit { width: 100%; padding: 18px; border: 3px solid #000; border-radius: 12px; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); color: #fff; font-size: 18px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(249,115,22,0.35); }
        .btn-submit:hover { opacity: 0.95; }
        .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .footer { background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%); padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { font-size: 13px; color: #64748b; margin: 4px 0; }
        .footer-brand { font-size: 15px; font-weight: 700; color: #0f172a; }
        .success-msg { display: none; text-align: center; padding: 60px 40px; }
        .success-msg h2 { color: #059669; font-size: 24px; margin-bottom: 12px; }
        .success-msg p { color: #475569; font-size: 16px; }
        .error-text { color: #ef4444; font-size: 14px; margin-top: 8px; display: none; }
        .spinner { display: none; }
        .spinner::after { content: ''; display: inline-block; width: 18px; height: 18px; border: 3px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; margin-left: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
            .details-grid { grid-template-columns: 1fr; gap: 12px; }
            .content { padding: 28px 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Rowan Rose Solicitors</h1>
        </div>

        <div id="formContent" class="content">
            <p class="greeting">Dear ${clientName},</p>
            <div class="message-box">
                <p>We are continuing to investigate your claim, however we need an updated document signing as the lender has said the signature does not exactly match. Please try to draw your next signature as close to the original.</p>
            </div>

            <div class="details-card">
                <h3>Your Details</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Full Name</span>
                        <span class="detail-value">${clientName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Date of Birth</span>
                        <span class="detail-value">${clientDob}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${clientEmail}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Phone</span>
                        <span class="detail-value">${clientPhone}</span>
                    </div>
                    <div class="detail-item detail-lender">
                        <span class="detail-label">Claim Against</span>
                        <span class="detail-value">${lenderName}</span>
                    </div>
                </div>
            </div>

            <p class="sig-label">Please draw your signature below:</p>
            <div class="canvas-wrapper">
                <canvas id="signatureCanvas" width="556" height="200"></canvas>
            </div>
            <div class="btn-row">
                <button class="btn-clear" onclick="clearSignature()">Clear Signature</button>
            </div>
            <p id="errorText" class="error-text"></p>
            <button id="submitBtn" class="btn-submit" onclick="submitSignature()">
                <span id="submitText">Submit Signature</span>
                <span id="submitSpinner" class="spinner"></span>
            </button>
        </div>

        <div id="successMessage" class="success-msg">
            <h2>Thank You!</h2>
            <p>Your updated signature has been submitted successfully. You can close this page now.</p>
        </div>

        <div class="footer">
            <p class="footer-brand">Rowan Rose Solicitors</p>
            <p>1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
            <p>0161 533 1706 | irl@rowanrose.co.uk</p>
        </div>
    </div>

    <script>
        const canvas = document.getElementById('signatureCanvas');
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let hasDrawn = false;

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            if (e.touches) {
                return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
            }
            return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
        }

        function startDraw(e) { e.preventDefault(); isDrawing = true; hasDrawn = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
        function draw(e) { if (!isDrawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        function stopDraw() { isDrawing = false; }

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDraw);
        canvas.addEventListener('mouseleave', stopDraw);
        canvas.addEventListener('touchstart', startDraw);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDraw);

        function clearSignature() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawn = false;
        }

        async function submitSignature() {
            if (!hasDrawn) {
                document.getElementById('errorText').textContent = 'Please draw your signature before submitting.';
                document.getElementById('errorText').style.display = 'block';
                return;
            }
            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            document.getElementById('submitText').textContent = 'Submitting...';
            document.getElementById('submitSpinner').style.display = 'inline-block';
            document.getElementById('errorText').style.display = 'none';

            try {
                const signatureData = canvas.toDataURL('image/png');
                const resp = await fetch('/api/submit-resign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: '${token}', signatureData })
                });
                const data = await resp.json();
                if (data.success) {
                    document.getElementById('formContent').style.display = 'none';
                    document.getElementById('successMessage').style.display = 'block';
                } else {
                    throw new Error(data.message || 'Failed to submit');
                }
            } catch (err) {
                document.getElementById('errorText').textContent = err.message;
                document.getElementById('errorText').style.display = 'block';
                btn.disabled = false;
                document.getElementById('submitText').textContent = 'Submit Signature';
                document.getElementById('submitSpinner').style.display = 'none';
            }
        }
    </script>
</body>
</html>`);
    } catch (err) {
        console.error('[Resign] Error loading resign page:', err);
        res.status(500).send('Server error');
    }
});

// ============================================================================
// SUBMIT RESIGN SIGNATURE - Save signature.png to S3 (same path as intake)
// ============================================================================
app.post('/api/submit-resign', async (req, res) => {
    const { token, signatureData } = req.body;

    if (!token || !signatureData) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    try {
        // Find case by resign token
        const caseRes = await pool.query(
            `SELECT c.id as case_id, c.lender, cnt.id as contact_id, cnt.first_name, cnt.last_name
             FROM cases c
             JOIN contacts cnt ON c.contact_id = cnt.id
             WHERE c.resign_token = $1`,
            [token]
        );

        if (caseRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired token' });
        }

        const record = caseRes.rows[0];
        const contactId = record.contact_id;
        const actualCaseId = record.case_id;
        const folderPath = buildS3Folder(record.first_name, record.last_name, contactId);

        // Add timestamp to signature
        const signatureBufferWithTimestamp = await addTimestampToSignature(signatureData);

        // Upload to S3 as signature.png (same location as intake — overwrites existing)
        const signatureKey = `${folderPath}Signatures/signature.png`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: signatureKey,
            Body: signatureBufferWithTimestamp,
            ContentType: 'image/png'
        }));

        console.log(`[Resign] Uploaded signature for contact ${contactId} (case ${actualCaseId}) to ${signatureKey}`);

        // Generate presigned URL
        const signatureUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: signatureKey }), { expiresIn: 604800 });

        // Update contact with signature URL
        await pool.query(
            'UPDATE contacts SET signature_url = $1 WHERE id = $2',
            [signatureUrl, contactId]
        );

        // Keep resign token active — allow re-signing if needed
        // await pool.query(
        //     'UPDATE cases SET resign_token = NULL WHERE id = $1',
        //     [actualCaseId]
        // );

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
                [contactId, 'signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Resign']]
            );
        }

        // Log the action
        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [contactId, actualCaseId, 'client', contactId, `${record.first_name} ${record.last_name}`, 'signature_resign', 'Document', `Updated signature captured via resign form for ${record.lender} claim`]
        );

        res.json({ success: true, message: 'Signature submitted successfully' });

    } catch (error) {
        console.error('[Resign] Error submitting signature:', error);
        res.status(500).json({ success: false, message: error.message });
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
        const folderPath = buildS3Folder(record.first_name, record.last_name, contactId);

        // Add timestamp to signature
        const signatureBufferWithTimestamp = await addTimestampToSignature(signatureData);

        // Upload to S3 as signature.png (will replace existing)
        const signatureKey = `${folderPath} Signatures / signature.png`;

        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: signatureKey,
            Body: signatureBufferWithTimestamp,
            ContentType: 'image/png'
        }));

        console.log(`[Sales Signature] Uploaded signature for contact ${contactId}(case ${actualCaseId}) to ${signatureKey} `);

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
                `INSERT INTO documents(contact_id, name, type, category, url, size, tags)
VALUES($1, $2, $3, $4, $5, $6, $7)`,
                [contactId, 'signature.png', 'image', 'Legal', signatureUrl, 'Auto-generated', ['Signature', 'Sales']]
            );
        }

        // Log the action
        await pool.query(
            `INSERT INTO action_logs(client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, timestamp)
VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [contactId, actualCaseId, 'client', contactId, `${record.first_name} ${record.last_name} `, 'signature_captured', 'Document', `Signature captured via sales form for ${record.lender} claim`]
        );

        // Auto-complete: Mark acceptance/signature documents as Completed
        const sigCompleted = await pool.query(
            `UPDATE documents SET document_status = 'Completed', updated_at = NOW()
             WHERE contact_id = $1
               AND document_status IN('Sent', 'Viewed')
AND(name ILIKE '%signature%' OR name ILIKE '%acceptance%' OR tags @> ARRAY['Signature']:: text[])
             RETURNING id, name`,
            [contactId]
        );
        for (const sd of sigCompleted.rows) {
            await pool.query(
                `INSERT INTO action_logs(client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata, timestamp)
VALUES($1, 'client', $1, 'Client', 'document_completed', 'documents', $2, $3, NOW())`,
                [contactId, `Signature captured - document "${sd.name}" marked Completed`, JSON.stringify({ document_id: sd.id, trigger: 'sales_signature' })]
            );
            await pool.query(
                `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW()
                 WHERE workflow_type = 'document_chase' AND metadata ->> 'document_id' = $1 AND status = 'active'`,
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
    // Some Graph endpoints (sendMail, reply, forward, send) return 202 with no body
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 202 || res.status === 204 || !contentType.includes('application/json')) {
        const text = await res.text();
        if (text) {
            try { return JSON.parse(text); } catch { return { success: true }; }
        }
        return { success: true };
    }
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

        const topLevelFolders = (data.value || []).map(folder => ({
            id: `${accountId}-${folder.id}`,
            accountId,
            name: folder.id,
            displayName: folder.displayName,
            unreadCount: folder.unreadItemCount || 0,
            totalCount: folder.totalItemCount || 0,
            hasChildren: folder.childFolderCount > 0,
            parentId: null,
            _graphId: folder.id,
            _childFolderCount: folder.childFolderCount || 0,
        }));

        // Fetch all child folders in parallel
        const foldersWithChildren = topLevelFolders.filter(f => f._childFolderCount > 0);
        const childResults = await Promise.allSettled(
            foldersWithChildren.map(parent =>
                graphRequest(`/users/${config.email}/mailFolders/${parent._graphId}/childFolders?$top=50&$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount`)
                    .then(childData => ({ parent, children: childData.value || [] }))
            )
        );

        const folders = topLevelFolders.map(({ _graphId, _childFolderCount, ...f }) => f);
        for (const result of childResults) {
            if (result.status !== 'fulfilled') continue;
            const { parent, children } = result.value;
            for (const child of children) {
                folders.push({
                    id: `${accountId}-${child.id}`,
                    accountId,
                    name: child.id,
                    displayName: child.displayName,
                    unreadCount: child.unreadItemCount || 0,
                    totalCount: child.totalItemCount || 0,
                    hasChildren: child.childFolderCount > 0,
                    parentId: parent._graphId || parent.name,
                    parentDisplayName: parent.displayName,
                });
            }
        }

        res.json({ success: true, folders });
    } catch (err) {
        console.error(`Graph folder fetch failed for ${config.email}:`, err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch folders: ' + err.message });
    }
});

// --- GET EMAILS IN A FOLDER (with pagination) ---
app.get('/api/email/accounts/:accountId/folders/:folderName/messages', async (req, res) => {
    const { accountId, folderName } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    // Support both old hardcoded folder names and new Graph folder IDs
    const graphFolder = GRAPH_FOLDER_MAP[folderName] || folderName;

    try {
        const data = await graphRequest(
            `/users/${config.email}/mailFolders/${graphFolder}/messages` +
            `?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc` +
            `&$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,isRead,flag,isDraft,hasAttachments,conversationId` +
            `&$count=true`
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

        const hasMore = !!data['@odata.nextLink'] || (skip + emails.length) < (data['@odata.count'] || Infinity);
        res.json({ success: true, emails, hasMore, totalCount: data['@odata.count'] || null });
    } catch (err) {
        console.error(`Graph message fetch failed for ${config.email}/${folderName}:`, err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch messages: ' + err.message });
    }
});

// --- SEARCH EMAILS ACROSS ALL FOLDERS ---
app.get('/api/email/accounts/:accountId/search', async (req, res) => {
    const { accountId } = req.params;
    const { q, limit = 50 } = req.query;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });
    if (!q) return res.json({ success: true, emails: [], hasMore: false, totalCount: 0 });

    try {
        const data = await graphRequest(
            `/users/${config.email}/messages` +
            `?$search="${encodeURIComponent(q)}"` +
            `&$top=${limit}` +
            `&$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,isRead,flag,isDraft,hasAttachments,conversationId,parentFolderId`,
            { headers: { 'ConsistencyLevel': 'eventual' } }
        );

        // Resolve folder IDs to display names
        const folderIds = [...new Set((data.value || []).map(m => m.parentFolderId).filter(Boolean))];
        const folderNameMap = {};
        // Well-known folder name mapping
        const wellKnownMap = { 'inbox': 'Inbox', 'sentitems': 'Sent', 'drafts': 'Drafts', 'deleteditems': 'Deleted', 'archive': 'Archive', 'junkemail': 'Junk', 'outbox': 'Outbox' };
        try {
            const foldersData = await graphRequest(`/users/${config.email}/mailFolders?$top=100&$select=id,displayName`);
            for (const f of (foldersData.value || [])) {
                folderNameMap[f.id] = f.displayName;
            }
        } catch (e) { /* folder name resolution is optional */ }

        const emails = (data.value || []).map(msg => ({
            id: msg.id,
            accountId,
            folderId: msg.parentFolderId || `${accountId}-search`,
            folderName: folderNameMap[msg.parentFolderId] || '',
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

        const hasMore = !!data['@odata.nextLink'];
        res.json({ success: true, emails, hasMore, totalCount: emails.length });
    } catch (err) {
        console.error(`Graph search failed for ${config.email}:`, err.message);
        res.status(500).json({ success: false, error: 'Search failed: ' + err.message });
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

// --- GET ALL ATTACHMENTS AS BASE64 JSON (for draft editing) ---
app.get('/api/email/accounts/:accountId/messages/:messageId/attachments-base64', async (req, res) => {
    const { accountId, messageId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const data = await graphRequest(
            `/users/${config.email}/messages/${messageId}/attachments`
        );
        const attachments = (data.value || [])
            .filter(att => att['@odata.type'] === '#microsoft.graph.fileAttachment')
            .map(att => ({
                name: att.name,
                contentType: att.contentType || 'application/octet-stream',
                contentBytes: att.contentBytes,
                size: att.size,
            }));
        res.json({ success: true, attachments });
    } catch (err) {
        console.error('Fetch attachments base64 failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch attachments: ' + err.message });
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
        // 404 means the message was already deleted (e.g. thread cascade) – treat as success
        if (err.message && err.message.includes('404')) {
            return res.json({ success: true });
        }
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

// --- SEND EMAIL (new compose) ---
app.post('/api/email/accounts/:accountId/send', async (req, res) => {
    const { accountId } = req.params;
    const { to, cc, bcc, subject, bodyHtml, bodyText, attachments } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const message = {
            subject: subject || '',
            body: {
                contentType: bodyHtml ? 'HTML' : 'Text',
                content: bodyHtml || bodyText || '',
            },
            toRecipients: (to || []).map(addr => ({ emailAddress: { address: addr } })),
            ccRecipients: (cc || []).map(addr => ({ emailAddress: { address: addr } })),
            bccRecipients: (bcc || []).map(addr => ({ emailAddress: { address: addr } })),
        };

        if (attachments && attachments.length > 0) {
            message.attachments = attachments.map(att => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: att.name,
                contentType: att.contentType,
                contentBytes: att.contentBytes,
            }));
        }

        await graphRequest(`/users/${config.email}/sendMail`, {
            method: 'POST',
            body: JSON.stringify({ message, saveToSentItems: true }),
        });

        // Log to action_logs (best effort — find contact by recipient email)
        const recipients = to || [];
        if (recipients.length > 0) {
            const contactRes = await pool.query('SELECT id FROM contacts WHERE email = ANY($1)', [recipients]).catch(() => ({ rows: [] }));
            for (const row of contactRes.rows) {
                logAction({
                    clientId: row.id,
                    actionType: 'email_sent',
                    actionCategory: 'communication',
                    description: `Email sent via ${config.email}: "${subject || '(no subject)'}"`,
                    metadata: { recipients, subject, channel: 'graph_api', from: config.email }
                });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Graph sendMail failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to send email: ' + err.message });
    }
});

// --- SAVE AS DRAFT ---
app.post('/api/email/accounts/:accountId/drafts', async (req, res) => {
    const { accountId } = req.params;
    const { to, cc, bcc, subject, bodyHtml, bodyText, attachments } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const message = {
            subject: subject || '',
            body: {
                contentType: bodyHtml ? 'HTML' : 'Text',
                content: bodyHtml || bodyText || '',
            },
            toRecipients: (to || []).map(addr => ({ emailAddress: { address: addr } })),
            ccRecipients: (cc || []).map(addr => ({ emailAddress: { address: addr } })),
            bccRecipients: (bcc || []).map(addr => ({ emailAddress: { address: addr } })),
        };

        if (attachments && attachments.length > 0) {
            message.attachments = attachments.map(att => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: att.name,
                contentType: att.contentType,
                contentBytes: att.contentBytes,
            }));
        }

        const draft = await graphRequest(`/users/${config.email}/messages`, {
            method: 'POST',
            body: JSON.stringify(message),
        });
        res.json({ success: true, draftId: draft.id });
    } catch (err) {
        console.error('Graph createDraft failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to save draft: ' + err.message });
    }
});

// --- SEND DRAFT EMAIL ---
app.post('/api/email/accounts/:accountId/messages/:messageId/send', async (req, res) => {
    const { accountId, messageId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}/send`, {
            method: 'POST',
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph send draft failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to send draft: ' + err.message });
    }
});

// --- REPLY TO EMAIL ---
app.post('/api/email/accounts/:accountId/messages/:messageId/reply', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { comment, to, cc } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const body = { comment: comment || '' };
        // If custom recipients provided, use createReply + update + send pattern
        if (to && to.length > 0) {
            // Create a draft reply
            const draft = await graphRequest(`/users/${config.email}/messages/${messageId}/createReply`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            // Update the draft with our content and recipients
            const updateBody = {
                body: { contentType: 'HTML', content: comment || '' },
                toRecipients: to.map(addr => ({ emailAddress: { address: addr } })),
            };
            if (cc && cc.length > 0) {
                updateBody.ccRecipients = cc.map(addr => ({ emailAddress: { address: addr } }));
            }
            await graphRequest(`/users/${config.email}/messages/${draft.id}`, {
                method: 'PATCH',
                body: JSON.stringify(updateBody),
            });
            // Send the draft
            await graphRequest(`/users/${config.email}/messages/${draft.id}/send`, {
                method: 'POST',
            });
        } else {
            await graphRequest(`/users/${config.email}/messages/${messageId}/reply`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }
        // Log reply
        const replyTo = to || [];
        if (replyTo.length > 0) {
            const contactRes = await pool.query('SELECT id FROM contacts WHERE email = ANY($1)', [replyTo]).catch(() => ({ rows: [] }));
            for (const row of contactRes.rows) {
                logAction({ clientId: row.id, actionType: 'email_sent', actionCategory: 'communication', description: `Email reply sent via ${config.email}`, metadata: { recipients: replyTo, channel: 'graph_api', type: 'reply' } });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Graph reply failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to reply: ' + err.message });
    }
});

// --- REPLY ALL TO EMAIL ---
app.post('/api/email/accounts/:accountId/messages/:messageId/replyAll', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { comment } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}/replyAll`, {
            method: 'POST',
            body: JSON.stringify({ comment: comment || '' }),
        });
        // Log reply-all (no specific recipients available, log generically)
        logAction({ actionType: 'email_sent', actionCategory: 'communication', description: `Reply-all sent via ${config.email}`, metadata: { channel: 'graph_api', type: 'reply_all', messageId } });

        res.json({ success: true });
    } catch (err) {
        console.error('Graph replyAll failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to reply all: ' + err.message });
    }
});

// --- FORWARD EMAIL ---
app.post('/api/email/accounts/:accountId/messages/:messageId/forward', async (req, res) => {
    const { accountId, messageId } = req.params;
    const { to, comment } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/messages/${messageId}/forward`, {
            method: 'POST',
            body: JSON.stringify({
                comment: comment || '',
                toRecipients: (to || []).map(addr => ({ emailAddress: { address: addr } })),
            }),
        });
        // Log forward
        const fwdTo = to || [];
        if (fwdTo.length > 0) {
            const contactRes = await pool.query('SELECT id FROM contacts WHERE email = ANY($1)', [fwdTo]).catch(() => ({ rows: [] }));
            for (const row of contactRes.rows) {
                logAction({ clientId: row.id, actionType: 'email_sent', actionCategory: 'communication', description: `Email forwarded via ${config.email}`, metadata: { recipients: fwdTo, channel: 'graph_api', type: 'forward' } });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Graph forward failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to forward: ' + err.message });
    }
});

// --- CREATE FOLDER ---
app.post('/api/email/accounts/:accountId/folders', async (req, res) => {
    const { accountId } = req.params;
    const { displayName, parentFolderId } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        const endpoint = parentFolderId
            ? `/users/${config.email}/mailFolders/${parentFolderId}/childFolders`
            : `/users/${config.email}/mailFolders`;
        const result = await graphRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify({ displayName }),
        });
        res.json({ success: true, folder: { id: result.id, displayName: result.displayName } });
    } catch (err) {
        console.error('Graph create folder failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create folder: ' + err.message });
    }
});

// --- RENAME FOLDER ---
app.patch('/api/email/accounts/:accountId/folders/:folderId', async (req, res) => {
    const { accountId, folderId } = req.params;
    const { displayName } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/mailFolders/${folderId}`, {
            method: 'PATCH',
            body: JSON.stringify({ displayName }),
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph rename folder failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to rename folder: ' + err.message });
    }
});

// --- DELETE FOLDER ---
app.delete('/api/email/accounts/:accountId/folders/:folderId', async (req, res) => {
    const { accountId, folderId } = req.params;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        await graphRequest(`/users/${config.email}/mailFolders/${folderId}`, {
            method: 'DELETE',
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph delete folder failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to delete folder: ' + err.message });
    }
});

// --- MOVE FOLDER (change parent) ---
app.post('/api/email/accounts/:accountId/folders/:folderId/move', async (req, res) => {
    const { accountId, folderId } = req.params;
    const { destinationParentId } = req.body;
    const config = EMAIL_ACCOUNTS_CONFIG.find(a => a.id === accountId);
    if (!config) return res.status(404).json({ success: false, error: 'Account not found' });

    try {
        // Graph API: copy to new parent then delete original (Graph doesn't support folder move directly)
        // Actually Graph supports PATCH with parentFolderId — but only for moving between parents
        await graphRequest(`/users/${config.email}/mailFolders/${folderId}`, {
            method: 'PATCH',
            body: JSON.stringify({ parentFolderId: destinationParentId || 'msgfolderroot' }),
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Graph move folder failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to move folder: ' + err.message });
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

// PUT /api/templates/:id - Update (or upsert) a template
app.put('/api/templates/:id', (req, res) => {
    try {
        const templates = readTemplatesStore();
        const idx = templates.findIndex(t => t.id === req.params.id);
        const now = new Date().toISOString().split('T')[0];

        if (idx === -1) {
            // Upsert: template not in store yet (e.g. was only in-memory), create it
            const newTpl = {
                id: req.params.id,
                name: req.body.name || 'Untitled Template',
                category: req.body.category || 'General',
                description: req.body.description || '',
                content: req.body.content || '',
                lastModified: now,
                customVariables: req.body.customVariables || [],
            };
            templates.push(newTpl);
            writeTemplatesStore(templates);
            console.log(`[Templates] Upserted new template ${req.params.id}`);
            return res.json({ success: true, template: newTpl });
        }

        templates[idx] = {
            ...templates[idx],
            name: req.body.name ?? templates[idx].name,
            category: req.body.category ?? templates[idx].category,
            description: req.body.description ?? templates[idx].description,
            content: req.body.content ?? templates[idx].content,
            lastModified: now,
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

// --- MASTER TEMPLATES (LOA and Cover Letter stored in S3) ---
const MASTER_TEMPLATE_KEYS = {
    'LOA': 'templates/loa-master-template.json',
    'COVER_LETTER': 'templates/cover-letter-master-template.json'
};

// GET /api/master-templates - List master templates (LOA and Cover Letter)
app.get('/api/master-templates', async (req, res) => {
    try {
        const templates = [];
        for (const [type, s3Key] of Object.entries(MASTER_TEMPLATE_KEYS)) {
            try {
                const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
                const response = await s3Client.send(command);
                const chunks = [];
                for await (const chunk of response.Body) {
                    chunks.push(chunk);
                }
                const content = Buffer.concat(chunks).toString('utf-8');
                const template = JSON.parse(content);
                templates.push({ ...template, type, s3Key });
            } catch (err) {
                console.warn(`Master template not found: ${s3Key}`);
            }
        }
        res.json({ success: true, templates });
    } catch (err) {
        console.error('Error listing master templates:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/master-templates/:type - Get a specific master template (LOA or COVER_LETTER)
app.get('/api/master-templates/:type', async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        const s3Key = MASTER_TEMPLATE_KEYS[type];
        if (!s3Key) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        const response = await s3Client.send(command);
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const content = Buffer.concat(chunks).toString('utf-8');
        const template = JSON.parse(content);
        res.json({ success: true, template: { ...template, type, s3Key } });
    } catch (err) {
        console.error(`Error fetching master template ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/master-templates/:type - Update a master template
app.put('/api/master-templates/:type', async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        const s3Key = MASTER_TEMPLATE_KEYS[type];
        if (!s3Key) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        const { name, category, description, content } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: 'content is required' });
        }

        const template = {
            id: type === 'LOA' ? 'loa-master-template' : 'cover-letter-master-template',
            name: name || (type === 'LOA' ? 'Letter of Authority (LOA)' : 'Cover Letter'),
            category: category || type.replace('_', ' '),
            description: description || `Master ${type} template`,
            content: typeof content === 'string' ? JSON.parse(content) : content,
            updatedAt: new Date().toISOString()
        };

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: JSON.stringify(template, null, 2),
            ContentType: 'application/json'
        });
        await s3Client.send(command);

        console.log(`✅ Master template ${type} updated in S3`);
        res.json({ success: true, template: { ...template, type, s3Key } });
    } catch (err) {
        console.error(`Error updating master template ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- DOCX TEMPLATES (Word documents for LOA and Cover Letter) ---
const DOCX_TEMPLATE_KEYS = {
    'LOA': 'templates/loa-template.docx',
    'COVER_LETTER': 'templates/cover-letter-template.docx'
};

// GET /api/docx-templates - List DOCX templates with download URLs
app.get('/api/docx-templates', async (req, res) => {
    try {
        const templates = [];
        for (const [type, s3Key] of Object.entries(DOCX_TEMPLATE_KEYS)) {
            try {
                // Check if template exists
                await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));

                // Generate presigned download URL
                const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key
                }), { expiresIn: 3600 }); // 1 hour

                templates.push({
                    type,
                    s3Key,
                    fileName: s3Key.split('/').pop(),
                    downloadUrl,
                    exists: true
                });
            } catch (err) {
                templates.push({
                    type,
                    s3Key,
                    fileName: s3Key.split('/').pop(),
                    downloadUrl: null,
                    exists: false
                });
            }
        }
        res.json({ success: true, templates });
    } catch (err) {
        console.error('Error listing DOCX templates:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/docx-templates/:type/download - Get presigned URL to download DOCX template
app.get('/api/docx-templates/:type/download', async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        const s3Key = DOCX_TEMPLATE_KEYS[type];
        if (!s3Key) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        // Check if template exists
        try {
            await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
        } catch (err) {
            return res.status(404).json({ success: false, message: `DOCX template not found: ${s3Key}` });
        }

        // Generate presigned download URL
        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
        }), { expiresIn: 3600 }); // 1 hour

        res.json({ success: true, downloadUrl, fileName: s3Key.split('/').pop() });
    } catch (err) {
        console.error(`Error getting DOCX template download URL ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/docx-templates/:type - Upload new DOCX template (accepts multipart/form-data)
app.put('/api/docx-templates/:type', upload.single('file'), async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        const s3Key = DOCX_TEMPLATE_KEYS[type];
        if (!s3Key) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Verify it's a DOCX file
        if (!req.file.originalname.endsWith('.docx')) {
            return res.status(400).json({ success: false, message: 'Only .docx files are allowed' });
        }

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }));

        console.log(`✅ DOCX template ${type} uploaded to S3: ${s3Key}`);
        res.json({ success: true, message: `${type} template uploaded successfully`, s3Key });
    } catch (err) {
        console.error(`Error uploading DOCX template ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- HTML TEMPLATES (LOA and Cover Letter stored in database) ---

// GET /api/html-templates - List all HTML templates
app.get('/api/html-templates', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT template_type, name, html_content, variables, updated_at, updated_by FROM html_templates ORDER BY template_type`
        );
        res.json({ success: true, templates: result.rows });
    } catch (err) {
        console.error('Error listing HTML templates:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/html-templates/:type - Get specific HTML template
app.get('/api/html-templates/:type', async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        if (!['LOA', 'COVER_LETTER'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        const result = await pool.query(
            `SELECT template_type, name, html_content, variables, updated_at, updated_by FROM html_templates WHERE template_type = $1`,
            [type]
        );

        if (result.rows.length === 0) {
            // Return default template from file
            const fs = await import('fs');
            const path = await import('path');
            const templatePath = type === 'LOA'
                ? path.join(process.cwd(), 'templates', 'loa-template.html')
                : path.join(process.cwd(), 'templates', 'cover-letter-template.html');

            try {
                const htmlContent = fs.readFileSync(templatePath, 'utf-8');
                return res.json({
                    success: true,
                    template: {
                        template_type: type,
                        name: type === 'LOA' ? 'Letter of Authority' : 'Cover Letter',
                        html_content: htmlContent,
                        variables: '{{clientFullName}}, {{clientAddress}}, {{clientPostcode}}, {{clientDOB}}, {{clientPreviousAddress}}, {{clientEmail}}, {{lenderName}}, {{lenderCompanyName}}, {{lenderAddress}}, {{lenderCity}}, {{lenderPostcode}}, {{signatureImage}}, {{today}}, {{refSpec}}, {{documentHash}}',
                        updated_at: null,
                        updated_by: 'system',
                        isDefault: true
                    }
                });
            } catch (fileErr) {
                return res.status(404).json({ success: false, message: `Template ${type} not found` });
            }
        }

        res.json({ success: true, template: result.rows[0] });
    } catch (err) {
        console.error(`Error fetching HTML template ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/html-templates/:type - Create or update HTML template
app.put('/api/html-templates/:type', async (req, res) => {
    try {
        const type = req.params.type.toUpperCase();
        if (!['LOA', 'COVER_LETTER'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid template type. Use LOA or COVER_LETTER' });
        }

        const { name, html_content, variables } = req.body;
        if (!html_content) {
            return res.status(400).json({ success: false, message: 'html_content is required' });
        }

        const templateName = name || (type === 'LOA' ? 'Letter of Authority' : 'Cover Letter');

        // Upsert the template
        const result = await pool.query(
            `INSERT INTO html_templates (template_type, name, html_content, variables, updated_at, updated_by)
             VALUES ($1, $2, $3, $4, NOW(), $5)
             ON CONFLICT (template_type) DO UPDATE SET
                name = EXCLUDED.name,
                html_content = EXCLUDED.html_content,
                variables = EXCLUDED.variables,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
             RETURNING *`,
            [type, templateName, html_content, variables || '', req.body.updated_by || 'admin']
        );

        console.log(`✅ HTML template ${type} saved to database`);
        res.json({ success: true, template: result.rows[0] });
    } catch (err) {
        console.error(`Error saving HTML template ${req.params.type}:`, err);
        res.status(500).json({ success: false, message: err.message });
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
        convertImage: mammoth.images.imgElement(function (image) {
            return image.read("base64").then(function (imageBuffer) {
                return {
                    src: "data:" + image.contentType + ";base64," + imageBuffer,
                };
            });
        }),
        transformDocument: function (document) {
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
// ONLYOFFICE INTEGRATION API ROUTES (Phase 2 - Database Persistent Storage)
// ============================================================================

// --- OO Template CRUD ---

// GET /api/oo/merge-fields - Get all merge fields (built-in + custom) for the template editor UI
app.get('/api/oo/merge-fields', async (req, res) => {
    try {
        const { rows: customFields } = await pool.query(
            'SELECT id, field_key, label, group_name, default_value, description FROM custom_merge_fields WHERE is_active = TRUE ORDER BY group_name, label'
        );
        const customGroups = {};
        for (const f of customFields) {
            if (!customGroups[f.group_name]) customGroups[f.group_name] = [];
            customGroups[f.group_name].push({
                id: f.id,
                key: f.field_key,
                label: f.label,
                defaultValue: f.default_value || '',
                description: f.description || '',
            });
        }
        res.json({
            success: true,
            customFields: Object.entries(customGroups).map(([group, fields]) => ({ group, fields })),
        });
    } catch (err) {
        console.error('[OO Merge Fields] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/oo/merge-fields - Create a custom merge field (internal UI)
app.post('/api/oo/merge-fields', async (req, res) => {
    const { key, label, group, defaultValue, description } = req.body;
    if (!key || !label) return res.status(400).json({ success: false, message: 'key and label are required' });
    if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(key)) {
        return res.status(400).json({ success: false, message: 'key must start with a letter and contain only letters, numbers, dots, and underscores' });
    }
    try {
        const { rows } = await pool.query(
            `INSERT INTO custom_merge_fields (field_key, label, group_name, default_value, description, created_by)
             VALUES ($1, $2, $3, $4, $5, 'ui')
             ON CONFLICT (field_key) DO UPDATE SET label = EXCLUDED.label, group_name = EXCLUDED.group_name,
                default_value = EXCLUDED.default_value, description = EXCLUDED.description, is_active = TRUE, updated_at = NOW()
             RETURNING *`,
            [key, label, group || 'Custom', defaultValue || null, description || null]
        );
        res.json({ success: true, field: rows[0] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/oo/merge-fields/:id - Remove a custom merge field (internal UI)
app.delete('/api/oo/merge-fields/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'UPDATE custom_merge_fields SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, field_key',
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Field not found' });
        res.json({ success: true, deleted: rows[0] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/oo/templates - List all templates, optional ?category filter
app.get('/api/oo/templates', async (req, res) => {
    try {
        let query = 'SELECT * FROM oo_templates WHERE is_active = TRUE';
        const params = [];
        if (req.query.category) {
            query += ' AND category = $1';
            params.push(req.query.category);
        }
        query += ' ORDER BY updated_at DESC';
        const result = await pool.query(query, params);
        // Map DB columns to expected frontend format
        const templates = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            category: row.category || 'General',
            s3Key: row.s3_key,
            mergeFields: row.variable_fields || [],
            useForLoa: row.use_for_loa,
            useForCoverLetter: row.use_for_cover_letter,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
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
        const { name, description, category, useForLoa, useForCoverLetter } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'name is required' });

        const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
        const s3Key = `oo-templates/${Date.now()}-${sanitizedName}.docx`;
        await uploadS3Buffer(s3Key, req.file.buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        // Cache locally so proxy can serve it (workaround for S3 GetObject deny)
        ooSaveLocal(s3Key, req.file.buffer);

        const mergeFields = extractMergeFields(req.file.buffer);

        // Insert into database
        const result = await pool.query(`
            INSERT INTO oo_templates (name, description, category, s3_key, file_name, file_size, variable_fields, use_for_loa, use_for_cover_letter)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            name,
            description || '',
            category || 'General',
            s3Key,
            req.file.originalname,
            req.file.size,
            JSON.stringify(mergeFields),
            useForLoa === 'true' || useForLoa === true,
            useForCoverLetter === 'true' || useForCoverLetter === true
        ]);

        const row = result.rows[0];
        const template = {
            id: row.id,
            name: row.name,
            description: row.description || '',
            category: row.category || 'General',
            s3Key: row.s3_key,
            mergeFields: row.variable_fields || [],
            useForLoa: row.use_for_loa,
            useForCoverLetter: row.use_for_cover_letter,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };

        console.log(`[OO Templates] Created #${template.id}: "${name}" (${mergeFields.length} merge fields)`);
        res.json({ success: true, template });
    } catch (err) {
        console.error('[OO Templates] Create error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/oo/templates/:id - Get template metadata + presigned download URL
app.get('/api/oo/templates/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM oo_templates WHERE id = $1 AND is_active = TRUE', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

        const row = result.rows[0];
        const template = {
            id: row.id,
            name: row.name,
            description: row.description || '',
            category: row.category || 'General',
            s3Key: row.s3_key,
            mergeFields: row.variable_fields || [],
            useForLoa: row.use_for_loa,
            useForCoverLetter: row.use_for_cover_letter,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };

        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: template.s3Key
        }), { expiresIn: 604800 });
        res.json({ success: true, template, downloadUrl });
    } catch (err) {
        console.error('[OO Templates] Get error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/oo/templates/:id - Update template metadata, mergeFields, and/or replace DOCX file
app.put('/api/oo/templates/:id', upload.single('file'), async (req, res) => {
    try {
        const { name, description, category, useForLoa, useForCoverLetter, mergeFields } = req.body;
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(name); }
        if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description); }
        if (category !== undefined) { updates.push(`category = $${paramIndex++}`); params.push(category); }
        if (useForLoa !== undefined) { updates.push(`use_for_loa = $${paramIndex++}`); params.push(useForLoa === 'true' || useForLoa === true); }
        if (useForCoverLetter !== undefined) { updates.push(`use_for_cover_letter = $${paramIndex++}`); params.push(useForCoverLetter === 'true' || useForCoverLetter === true); }

        // Allow setting mergeFields (variable_fields) directly
        if (mergeFields !== undefined) {
            updates.push(`variable_fields = $${paramIndex++}`);
            params.push(typeof mergeFields === 'string' ? mergeFields : JSON.stringify(mergeFields));
        }

        // Handle file replacement — upload new DOCX and re-extract merge fields
        if (req.file) {
            // Get the existing template to find its S3 key
            const existing = await pool.query('SELECT s3_key FROM oo_templates WHERE id = $1 AND is_active = TRUE', [req.params.id]);
            if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

            const s3Key = existing.rows[0].s3_key;
            await uploadS3Buffer(s3Key, req.file.buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            if (typeof ooSaveLocal === 'function') ooSaveLocal(s3Key, req.file.buffer);

            // Re-extract merge fields from the new file (unless mergeFields was explicitly set)
            if (mergeFields === undefined) {
                const extracted = extractMergeFields(req.file.buffer);
                updates.push(`variable_fields = $${paramIndex++}`);
                params.push(JSON.stringify(extracted));
            }

            // Update file metadata
            updates.push(`file_name = $${paramIndex++}`);
            params.push(req.file.originalname);
            updates.push(`file_size = $${paramIndex++}`);
            params.push(req.file.size);

            console.log(`[OO Templates] File replaced for template #${req.params.id}: ${req.file.originalname}`);
        }

        if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

        updates.push(`updated_at = NOW()`);
        params.push(req.params.id);

        const result = await pool.query(
            `UPDATE oo_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_active = TRUE RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

        const row = result.rows[0];
        const template = {
            id: row.id,
            name: row.name,
            description: row.description || '',
            category: row.category || 'General',
            s3Key: row.s3_key,
            mergeFields: row.variable_fields || [],
            useForLoa: row.use_for_loa,
            useForCoverLetter: row.use_for_cover_letter,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };

        res.json({ success: true, template });
    } catch (err) {
        console.error('[OO Templates] Update error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/oo/templates/:id - Soft delete (set is_active = false)
app.delete('/api/oo/templates/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await pool.query(
            'UPDATE oo_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

        console.log(`[OO Templates] Deleted #${id}`);
        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        console.error('[OO Templates] Delete error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- OO Editor Config ---

// Local file cache for OO templates/docs (workaround for S3 GetObject deny)
const OO_CACHE_DIR = path.join(os.tmpdir(), 'oo-file-cache');
if (!fs.existsSync(OO_CACHE_DIR)) fs.mkdirSync(OO_CACHE_DIR, { recursive: true });

function ooLocalPath(s3Key) {
    // Convert s3 key to flat filename: oo-templates/123-file.docx → oo-templates__123-file.docx
    return path.join(OO_CACHE_DIR, s3Key.replace(/\//g, '__'));
}

function ooSaveLocal(s3Key, buffer) {
    const filePath = ooLocalPath(s3Key);
    fs.writeFileSync(filePath, buffer);
    console.log(`[OO Cache] Saved ${s3Key} → ${filePath} (${buffer.length} bytes)`);
}

// GET /api/oo/proxy/template/:id - Serve DOCX for OnlyOffice from local cache
app.get('/api/oo/proxy/template/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT s3_key, name FROM oo_templates WHERE id = $1 AND is_active = TRUE', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).send('Not found');

        const localFile = ooLocalPath(result.rows[0].s3_key);

        // Try local cache first, fall back to S3
        let buffer;
        if (fs.existsSync(localFile)) {
            buffer = fs.readFileSync(localFile);
            console.log(`[OO Proxy] Serving template #${req.params.id} from local cache`);
        } else {
            // Try S3 as fallback (will work once IAM is fixed)
            try {
                buffer = await downloadS3Buffer(result.rows[0].s3_key);
                ooSaveLocal(result.rows[0].s3_key, buffer);
            } catch (s3Err) {
                console.error(`[OO Proxy] S3 download failed for ${result.rows[0].s3_key}:`, s3Err.message);
                return res.status(503).send('File not in cache and S3 read denied. Re-upload the template.');
            }
        }

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `inline; filename="${encodeURIComponent(result.rows[0].name)}.docx"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (err) {
        console.error('[OO Proxy] Template proxy error:', err);
        res.status(500).send('Download failed');
    }
});

// GET /api/oo/proxy/document/:id - Serve generated doc DOCX from local cache
app.get('/api/oo/proxy/document/:id', async (req, res) => {
    try {
        const doc = ooDocuments.get(Number(req.params.id));
        if (!doc) return res.status(404).send('Not found');

        const localFile = ooLocalPath(doc.s3KeyDocx);

        let buffer;
        if (fs.existsSync(localFile)) {
            buffer = fs.readFileSync(localFile);
            console.log(`[OO Proxy] Serving document #${req.params.id} from local cache`);
        } else {
            try {
                buffer = await downloadS3Buffer(doc.s3KeyDocx);
                ooSaveLocal(doc.s3KeyDocx, buffer);
            } catch (s3Err) {
                console.error(`[OO Proxy] S3 download failed for ${doc.s3KeyDocx}:`, s3Err.message);
                return res.status(503).send('File not in cache and S3 read denied.');
            }
        }

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `inline; filename="${encodeURIComponent(doc.name)}.docx"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    } catch (err) {
        console.error('[OO Proxy] Document proxy error:', err);
        res.status(500).send('Download failed');
    }
});

// GET /api/oo/debug - Quick test endpoint to verify OO config
app.get('/api/oo/debug', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, s3_key FROM oo_templates WHERE is_active = TRUE LIMIT 1');
        if (result.rows.length === 0) return res.json({ error: 'No templates found in DB' });

        const row = result.rows[0];
        const fileUrl = await getSignedUrl(s3ClientPathStyle, new GetObjectCommand({
            Bucket: BUCKET_NAME, Key: row.s3_key
        }), { expiresIn: 3600 });

        // Test if the URL is actually reachable
        let urlReachable = false;
        try {
            const testRes = await fetch(fileUrl, { method: 'HEAD' });
            urlReachable = testRes.ok;
        } catch (e) {
            urlReachable = false;
        }

        res.json({
            template: { id: row.id, name: row.name, s3Key: row.s3_key },
            signedUrl: fileUrl,
            urlReachable,
            bucket: BUCKET_NAME,
            onlyOfficeUrl: process.env.ONLYOFFICE_URL || '(not set)',
            jwtSecretConfigured: !!process.env.ONLYOFFICE_JWT_SECRET,
            callbackBase: process.env.ONLYOFFICE_CALLBACK_BASE_URL || '(not set, defaults to localhost)',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/oo/templates/:id/editor-config
app.get('/api/oo/templates/:id/editor-config', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM oo_templates WHERE id = $1 AND is_active = TRUE', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Template not found' });

        const row = result.rows[0];
        const template = {
            id: row.id,
            name: row.name,
            s3Key: row.s3_key,
        };

        // Proxy the file through our server so OnlyOffice fetches from us, not S3 directly.
        // This avoids S3 signed-URL / IAM / path-style SSL issues.
        const callbackBase = process.env.ONLYOFFICE_CALLBACK_BASE_URL || 'http://localhost:5000';
        const fileUrl = `${callbackBase}/api/oo/proxy/template/${template.id}`;
        const callbackUrl = `${callbackBase}/api/oo/callback`;
        const callbackReachable = !callbackBase.includes('localhost') && !callbackBase.includes('127.0.0.1');

        console.log(`[OO] Template #${template.id} proxy URL: ${fileUrl}`);
        console.log(`[OO] Callback: ${callbackUrl} (reachable=${callbackReachable})`);

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
            console.log(`[OO] JWT token generated (length=${config.token.length})`);
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

        // Proxy the file through our server (same approach as templates)
        const callbackBase = process.env.ONLYOFFICE_CALLBACK_BASE_URL || 'http://localhost:5000';
        const fileUrl = `${callbackBase}/api/oo/proxy/document/${doc.id}`;
        const callbackUrl = `${callbackBase}/api/oo/callback`;
        const callbackReachable = !callbackBase.includes('localhost') && !callbackBase.includes('127.0.0.1');

        console.log(`[OO] Document #${doc.id} proxy URL: ${fileUrl}`);

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

            // Check documents (still in-memory for generated docs)
            for (const [id, doc] of ooDocuments) {
                if (doc.ooDocKey === key) {
                    await uploadS3Buffer(doc.s3KeyDocx, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    // Update local cache so reopening shows latest version
                    ooSaveLocal(doc.s3KeyDocx, buffer);
                    doc.ooDocKey = `doc_${id}_v${Date.now()}`;
                    doc.updatedAt = new Date().toISOString();
                    console.log(`[OO Callback] Updated document #${id}`);
                    break;
                }
            }

            // Check templates - key format is tpl_{id}_v{timestamp}
            const templateMatch = key.match(/^tpl_(\d+)_v/);
            if (templateMatch) {
                const templateId = parseInt(templateMatch[1], 10);
                const result = await pool.query('SELECT * FROM oo_templates WHERE id = $1 AND is_active = TRUE', [templateId]);
                if (result.rows.length > 0) {
                    const template = result.rows[0];
                    // Upload updated DOCX back to S3
                    await uploadS3Buffer(template.s3_key, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                    // Update local cache so reopening shows latest version
                    ooSaveLocal(template.s3_key, buffer);
                    // Extract merge fields from updated document
                    const mergeFields = extractMergeFields(buffer);
                    // Update database
                    await pool.query(
                        'UPDATE oo_templates SET variable_fields = $1, updated_at = NOW() WHERE id = $2',
                        [JSON.stringify(mergeFields), templateId]
                    );
                    console.log(`[OO Callback] Updated template #${templateId} in S3 and database`);
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
            'claim.caseRef': `RR-2024-${String(caseId || 1).padStart(4, '0')}`,
            'system.today': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
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

            // Trigger LOA generation for the new case
            triggerPdfGenerator(newCaseRes.rows[0].id, 'LOA').catch(err => {
                console.error(`❌ LOA generation trigger failed for case ${newCaseRes.rows[0].id}:`, err.message);
            });

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

            // Trigger Lambda LOA generation for the new case
            triggerPdfGenerator(newCaseRes.rows[0].id, 'LOA').catch(err => {
                console.error(`❌ LOA generation trigger failed for case ${newCaseRes.rows[0].id}:`, err.message);
            });

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

// ============================================================================
// AUTOMATION / WINDMILL ROUTES
// ============================================================================
import WindmillService from './services/windmill.js';

// ---------- AUTOMATION CRUD ----------

// Get available CRM events (for UI dropdown) — must be before :id routes
app.get('/api/automations/events', async (req, res) => {
    res.json(crmEvents.listEvents());
});

// List all automations (with optional filters)
app.get('/api/automations', async (req, res) => {
    const { module, status, trigger_type } = req.query;
    try {
        let query = `
            SELECT a.*,
                   (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id) AS total_runs,
                   (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id AND r.status = 'completed') AS successful_runs,
                   (SELECT MAX(r.started_at) FROM automation_runs r WHERE r.automation_id = a.id) AS last_run_at,
                   (SELECT r.status FROM automation_runs r WHERE r.automation_id = a.id ORDER BY r.started_at DESC LIMIT 1) AS last_run_status
            FROM automations a WHERE 1=1
        `;
        const values = [];
        let p = 1;

        if (module) { query += ` AND a.module = $${p++}`; values.push(module); }
        if (status === 'active') { query += ` AND a.is_active = true`; }
        else if (status === 'inactive') { query += ` AND a.is_active = false`; }
        if (trigger_type) { query += ` AND a.trigger_type = $${p++}`; values.push(trigger_type); }

        query += ' ORDER BY a.updated_at DESC';
        const { rows } = await pool.query(query, values);
        res.json(rows);
    } catch (err) {
        console.error('Error listing automations:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get single automation with triggers and recent runs
app.get('/api/automations/:id', async (req, res) => {
    try {
        const { rows: [automation] } = await pool.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        const { rows: triggers } = await pool.query(
            'SELECT * FROM automation_triggers WHERE automation_id = $1 ORDER BY created_at', [req.params.id]
        );
        const { rows: runs } = await pool.query(
            'SELECT * FROM automation_runs WHERE automation_id = $1 ORDER BY started_at DESC LIMIT 50', [req.params.id]
        );
        const { rows: webhooks } = await pool.query(
            'SELECT * FROM automation_webhooks WHERE automation_id = $1', [req.params.id]
        );

        res.json({ ...automation, triggers, runs, webhooks });
    } catch (err) {
        console.error('Error getting automation:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create automation
app.post('/api/automations', async (req, res) => {
    const { name, description, module: mod, trigger_type, trigger_config, windmill_flow_path, events, conditions } = req.body;

    if (!name || !mod || !trigger_type) {
        return res.status(400).json({ error: 'name, module, and trigger_type are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: [automation] } = await client.query(
            `INSERT INTO automations (name, description, module, trigger_type, trigger_config, windmill_flow_path)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, description || null, mod, trigger_type, JSON.stringify(trigger_config || {}), windmill_flow_path || null]
        );

        // Create trigger entries if event-based
        if (trigger_type === 'event' && events && Array.isArray(events)) {
            for (const evt of events) {
                await client.query(
                    `INSERT INTO automation_triggers (automation_id, event_name, conditions)
                     VALUES ($1, $2, $3)`,
                    [automation.id, evt.event_name || evt, JSON.stringify(evt.conditions || conditions || {})]
                );
            }
        }

        // Create webhook entry if webhook-based
        if (trigger_type === 'webhook') {
            const { randomUUID } = await import('crypto');
            const secret = randomUUID().replace(/-/g, '');
            const webhookPath = windmill_flow_path || `crm/webhook_${automation.id}`;
            const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/windmill/${secret}`;

            await client.query(
                `INSERT INTO automation_webhooks (automation_id, webhook_path, webhook_url, secret)
                 VALUES ($1, $2, $3, $4)`,
                [automation.id, webhookPath, webhookUrl, secret]
            );
        }

        await client.query('COMMIT');

        // Fetch full automation with triggers
        const { rows: triggers } = await pool.query(
            'SELECT * FROM automation_triggers WHERE automation_id = $1', [automation.id]
        );
        const { rows: webhooks } = await pool.query(
            'SELECT * FROM automation_webhooks WHERE automation_id = $1', [automation.id]
        );

        res.json({ ...automation, triggers, webhooks });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating automation:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Update automation
app.put('/api/automations/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, module: mod, trigger_type, trigger_config, windmill_flow_path, events } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updates = [];
        const values = [];
        let p = 1;

        if (name !== undefined) { updates.push(`name = $${p++}`); values.push(name); }
        if (description !== undefined) { updates.push(`description = $${p++}`); values.push(description); }
        if (mod !== undefined) { updates.push(`module = $${p++}`); values.push(mod); }
        if (trigger_type !== undefined) { updates.push(`trigger_type = $${p++}`); values.push(trigger_type); }
        if (trigger_config !== undefined) { updates.push(`trigger_config = $${p++}`); values.push(JSON.stringify(trigger_config)); }
        if (windmill_flow_path !== undefined) { updates.push(`windmill_flow_path = $${p++}`); values.push(windmill_flow_path); }

        if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            values.push(id);
            await client.query(
                `UPDATE automations SET ${updates.join(', ')} WHERE id = $${p}`, values
            );
        }

        // Replace triggers if provided
        if (events && Array.isArray(events)) {
            await client.query('DELETE FROM automation_triggers WHERE automation_id = $1', [id]);
            for (const evt of events) {
                await client.query(
                    `INSERT INTO automation_triggers (automation_id, event_name, conditions)
                     VALUES ($1, $2, $3)`,
                    [id, evt.event_name || evt, JSON.stringify(evt.conditions || {})]
                );
            }
        }

        await client.query('COMMIT');

        // Return updated automation
        const { rows: [automation] } = await pool.query('SELECT * FROM automations WHERE id = $1', [id]);
        const { rows: triggers } = await pool.query('SELECT * FROM automation_triggers WHERE automation_id = $1', [id]);
        res.json({ ...automation, triggers });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating automation:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Delete automation
app.delete('/api/automations/:id', async (req, res) => {
    try {
        const { rows: [automation] } = await pool.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        // Try to delete from Windmill too (non-blocking)
        if (automation.windmill_flow_path) {
            WindmillService.deleteFlow(automation.windmill_flow_path).catch(err => {
                console.warn('[Automation] Could not delete Windmill flow:', err.message);
            });
        }

        await pool.query('DELETE FROM automations WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Automation deleted' });
    } catch (err) {
        console.error('Error deleting automation:', err);
        res.status(500).json({ error: err.message });
    }
});

// Toggle automation active/inactive
app.post('/api/automations/:id/toggle', async (req, res) => {
    try {
        const { rows: [automation] } = await pool.query(
            `UPDATE automations SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        if (!automation) return res.status(404).json({ error: 'Automation not found' });

        // Toggle linked triggers too
        await pool.query(
            'UPDATE automation_triggers SET is_active = $1 WHERE automation_id = $2',
            [automation.is_active, req.params.id]
        );

        res.json(automation);
    } catch (err) {
        console.error('Error toggling automation:', err);
        res.status(500).json({ error: err.message });
    }
});

// Manually trigger an automation
app.post('/api/automations/:id/run', async (req, res) => {
    try {
        const { rows: [automation] } = await pool.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
        if (!automation) return res.status(404).json({ error: 'Automation not found' });
        if (!automation.windmill_flow_path) return res.status(400).json({ error: 'No Windmill flow linked' });

        // Create run record
        const { rows: [run] } = await pool.query(
            `INSERT INTO automation_runs (automation_id, trigger_type, trigger_data, status, started_at)
             VALUES ($1, 'manual', $2, 'running', NOW()) RETURNING *`,
            [automation.id, JSON.stringify(req.body.args || {})]
        );

        // Fire Windmill flow
        const startMs = Date.now();
        try {
            const jobId = await WindmillService.runFlow(automation.windmill_flow_path, req.body.args || {});
            await pool.query(
                'UPDATE automation_runs SET windmill_job_id = $1 WHERE id = $2',
                [typeof jobId === 'string' ? jobId : JSON.stringify(jobId), run.id]
            );
            res.json({ success: true, runId: run.id, jobId });
        } catch (flowErr) {
            const durationMs = Date.now() - startMs;
            await pool.query(
                `UPDATE automation_runs SET status = 'failed', error = $1, duration_ms = $2, completed_at = NOW() WHERE id = $3`,
                [flowErr.message, durationMs, run.id]
            );
            res.status(500).json({ error: flowErr.message, runId: run.id });
        }
    } catch (err) {
        console.error('Error running automation:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get run history for an automation
app.get('/api/automations/:id/runs', async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    try {
        const { rows } = await pool.query(
            `SELECT * FROM automation_runs WHERE automation_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
            [req.params.id, parseInt(limit), parseInt(offset)]
        );
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*) FROM automation_runs WHERE automation_id = $1', [req.params.id]
        );
        res.json({ runs: rows, total: parseInt(count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific run details with Windmill job result
app.get('/api/automations/:id/runs/:runId', async (req, res) => {
    try {
        const { rows: [run] } = await pool.query(
            'SELECT * FROM automation_runs WHERE id = $1 AND automation_id = $2',
            [req.params.runId, req.params.id]
        );
        if (!run) return res.status(404).json({ error: 'Run not found' });

        // Fetch fresh result from Windmill if still running
        if (run.status === 'running' && run.windmill_job_id) {
            try {
                const job = await WindmillService.getJob(run.windmill_job_id);
                if (job && (job.type === 'CompletedJob' || job.success !== undefined)) {
                    const status = job.success === false ? 'failed' : 'completed';
                    await pool.query(
                        `UPDATE automation_runs SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
                        [status, JSON.stringify(job.result || {}), run.id]
                    );
                    run.status = status;
                    run.result = job.result || {};
                }
            } catch { /* Windmill unreachable, return what we have */ }
        }

        res.json(run);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// (Moved to before :id routes — see above)

// ---------- WINDMILL PROXY ROUTES ----------
// Frontend calls these; the Windmill token stays server-side.

app.get('/api/windmill/scripts', async (req, res) => {
    try {
        const scripts = await WindmillService.listScripts(req.query);
        res.json(scripts);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/windmill/flows', async (req, res) => {
    try {
        const flows = await WindmillService.listFlows(req.query);
        res.json(flows);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

// Flow path contains slashes (e.g. f/crm/my_flow) — use query param
app.get('/api/windmill/flow', async (req, res) => {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'path query parameter required' });
    try {
        const flow = await WindmillService.getFlow(path);
        res.json(flow);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.post('/api/windmill/flows', async (req, res) => {
    try {
        const result = await WindmillService.createFlow(req.body);
        res.json(result);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/windmill/jobs/:id', async (req, res) => {
    try {
        const job = await WindmillService.getJob(req.params.id);
        res.json(job);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/windmill/schedules', async (req, res) => {
    try {
        const schedules = await WindmillService.listSchedules(req.query);
        res.json(schedules);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.post('/api/windmill/test-connection', async (req, res) => {
    try {
        const result = await WindmillService.testConnection();
        res.json(result);
    } catch (err) { res.status(502).json({ error: err.message }); }
});

// ---------- WINDMILL IFRAME URL ----------
// Returns an authenticated URL for embedding Windmill in an iframe.
// The token is injected server-side so it's never stored in frontend code.

app.get('/api/windmill/iframe-url', async (req, res) => {
    try {
        const baseUrl = process.env.WINDMILL_BASE_URL || 'https://flowmill.fastactionclaims.com';
        const token = process.env.WINDMILL_TOKEN || '';
        const workspace = process.env.WINDMILL_WORKSPACE || 'admins';

        if (!token) {
            return res.status(500).json({ error: 'Windmill token not configured' });
        }

        // The ?token= parameter lets Windmill authenticate without cookies
        // Optional path parameter to navigate directly to a specific page
        const path = req.query.path || '';
        const url = `${baseUrl}${path}?token=${token}&workspace=${workspace}`;

        res.json({ url });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- WEBHOOK RECEIVER ----------
// Windmill flows (or external services) call back into the CRM via this endpoint.

app.post('/api/webhooks/windmill/:secret', async (req, res) => {
    try {
        // Look up the webhook by secret
        const { rows: [webhook] } = await pool.query(
            `SELECT w.*, a.id AS automation_id, a.name AS automation_name, a.windmill_flow_path
             FROM automation_webhooks w
             JOIN automations a ON a.id = w.automation_id
             WHERE w.secret = $1 AND a.is_active = true`,
            [req.params.secret]
        );

        if (!webhook) {
            return res.status(404).json({ error: 'Webhook not found or automation inactive' });
        }

        // Log the run
        const { rows: [run] } = await pool.query(
            `INSERT INTO automation_runs (automation_id, trigger_type, trigger_data, status, started_at)
             VALUES ($1, 'webhook', $2, 'running', NOW()) RETURNING *`,
            [webhook.automation_id, JSON.stringify(req.body)]
        );

        // If there's a linked Windmill flow, trigger it
        if (webhook.windmill_flow_path) {
            const startMs = Date.now();
            try {
                const jobId = await WindmillService.runFlow(webhook.windmill_flow_path, req.body);
                await pool.query(
                    'UPDATE automation_runs SET windmill_job_id = $1 WHERE id = $2',
                    [typeof jobId === 'string' ? jobId : JSON.stringify(jobId), run.id]
                );
            } catch (flowErr) {
                const durationMs = Date.now() - startMs;
                await pool.query(
                    `UPDATE automation_runs SET status = 'failed', error = $1, duration_ms = $2, completed_at = NOW() WHERE id = $3`,
                    [flowErr.message, durationMs, run.id]
                );
            }
        } else {
            // No flow linked — just log as completed
            await pool.query(
                `UPDATE automation_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [run.id]
            );
        }

        res.json({ success: true, runId: run.id, automationName: webhook.automation_name });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- INTERNAL API (for Windmill flows to call back into CRM) ----------
// Secured with WINDMILL_TOKEN as shared secret in Authorization header.

function windmillInternalAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token || token !== process.env.WINDMILL_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.post('/api/internal/contacts/:id/update', windmillInternalAuth, async (req, res) => {
    try {
        const fields = req.body;
        const updates = [];
        const values = [];
        let p = 1;
        for (const [key, value] of Object.entries(fields)) {
            updates.push(`${key} = $${p++}`);
            values.push(value);
        }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
        values.push(req.params.id);
        const { rows } = await pool.query(
            `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`, values
        );
        res.json(rows[0] || { error: 'Not found' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/internal/cases/:id/update', windmillInternalAuth, async (req, res) => {
    try {
        const fields = req.body;
        const updates = [];
        const values = [];
        let p = 1;
        for (const [key, value] of Object.entries(fields)) {
            updates.push(`${key} = $${p++}`);
            values.push(value);
        }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
        values.push(req.params.id);
        const { rows } = await pool.query(
            `UPDATE cases SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`, values
        );
        res.json(rows[0] || { error: 'Not found' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/internal/cases/:id/add-note', windmillInternalAuth, async (req, res) => {
    try {
        const { content } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO notes (client_id, content, pinned, created_by_name)
             VALUES ((SELECT contact_id FROM cases WHERE id = $1), $2, false, 'Windmill Automation') RETURNING *`,
            [req.params.id, content]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/internal/notifications/send', windmillInternalAuth, async (req, res) => {
    try {
        const { user_id, type, title, message, link } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO persistent_notifications (user_id, type, title, message, link) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [user_id || null, type || 'automation', title, message, link || null]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- AUTOMATION SETUP ----------
// One-time setup: tests connection, creates Windmill folder, etc.

app.post('/api/automations/setup', async (req, res) => {
    const results = { steps: [] };
    try {
        // 1. Test Windmill connection
        const conn = await WindmillService.testConnection();
        results.steps.push({ step: 'Test Windmill connection', ...conn });

        if (!conn.connected) {
            return res.json({ success: false, message: 'Cannot connect to Windmill', ...results });
        }

        // 2. Create CRM folder in Windmill
        try {
            await WindmillService.createFolder('crm');
            results.steps.push({ step: 'Create f/crm/ folder', success: true });
        } catch (err) {
            results.steps.push({ step: 'Create f/crm/ folder', success: false, note: err.message });
        }

        // 3. Create CRM API resource in Windmill
        try {
            const baseUrl = `${req.protocol}://${req.get('host')}/api/internal`;
            await WindmillService.createResource({
                path: 'f/crm/crm_connection',
                resource_type: 'app',
                value: { base_url: baseUrl, api_key: process.env.WINDMILL_TOKEN },
                description: 'FastAction Claims CRM internal API'
            });
            results.steps.push({ step: 'Create CRM API resource', success: true });
        } catch (err) {
            results.steps.push({ step: 'Create CRM API resource', success: false, note: err.message });
        }

        results.success = true;
        res.json(results);
    } catch (err) {
        console.error('Setup error:', err);
        res.status(500).json({ success: false, error: err.message, ...results });
    }
});

// ============================================================================
// CRM EXTERNAL API - Secured with CRM_API_KEY (for OpenClaw / external use)
// All routes mounted at /api/crm/*
// MUST be registered BEFORE the Windmill catch-all proxy below.
// ============================================================================

function crmApiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key']
        || (req.headers.authorization || '').replace('Bearer ', '');
    if (!apiKey || apiKey !== process.env.CRM_API_KEY) {
        return res.status(401).json({ error: 'Invalid or missing API key' });
    }
    next();
}

const crmRouter = express.Router();
crmRouter.use(crmApiKeyAuth);

// ── GET /contacts/:id ── Get contact details
crmRouter.get('/contacts/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/claims ── Get contact's claims
crmRouter.get('/contacts/:id/claims', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM cases WHERE contact_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/documents ── Get contact's documents from S3 + DB
// Supports: ?claim_id=<id>  or  ?lender=<name>  to filter to a single lender/claim
crmRouter.get('/contacts/:id/documents', async (req, res) => {
    try {
        const contactId = req.params.id;
        const { claim_id, lender: lenderParam } = req.query;

        // Resolve lender filter
        let lenderFilter = lenderParam || null;
        if (claim_id && !lenderFilter) {
            const claimRes = await pool.query(
                'SELECT lender FROM cases WHERE id = $1 AND contact_id = $2',
                [parseInt(claim_id), parseInt(contactId)]
            );
            if (claimRes.rows.length === 0) return res.status(404).json({ error: 'Claim not found for this contact' });
            lenderFilter = claimRes.rows[0].lender || null;
        }

        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contactId]);
        if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        const { first_name, last_name } = contactRes.rows[0];

        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

        // Resolve ALL S3 folders for this contact (handles special chars creating multiple folders)
        const nameCandidates = new Set([
            `${first_name}_${last_name}`.replace(/\s+/g, '_'),
            `${first_name}_${last_name}`,
            `${first_name}_${last_name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        ]);
        const allBaseFolders = [];
        const seenFolders = new Set();
        for (const name of nameCandidates) {
            const testPrefix = `${name}_${contactId}/`;
            if (seenFolders.has(testPrefix)) continue;
            const probe = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: testPrefix, MaxKeys: 1 }));
            if (probe.Contents && probe.Contents.length > 0) { allBaseFolders.push(testPrefix); seenFolders.add(testPrefix); }
        }
        let contToken = undefined;
        do {
            const topLevel = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Delimiter: '/', MaxKeys: 1000, ContinuationToken: contToken }));
            for (const p of (topLevel.CommonPrefixes || [])) {
                if (p.Prefix && p.Prefix.endsWith(`_${contactId}/`) && !seenFolders.has(p.Prefix)) { allBaseFolders.push(p.Prefix); seenFolders.add(p.Prefix); }
            }
            contToken = topLevel.IsTruncated ? topLevel.NextContinuationToken : undefined;
        } while (contToken);
        if (allBaseFolders.length === 0) return res.json([]);

        // Build folder list — narrow to lender subfolder when filter is active
        let foldersToScan;
        if (lenderFilter) {
            const sanitizedLender = lenderFilter.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
            foldersToScan = allBaseFolders.map(bf => ({ prefix: `${bf}Lenders/${sanitizedLender}/`, defaultCategory: 'LOA' }));
        } else {
            foldersToScan = allBaseFolders.flatMap(bf => [
                { prefix: `${bf}Documents/`, defaultCategory: 'Client' },
                { prefix: `${bf}Lenders/`, defaultCategory: 'LOA' },
                { prefix: `${bf}LOA/`, defaultCategory: 'LOA' },
                { prefix: `${bf}Terms-and-Conditions/`, defaultCategory: 'Legal' }
            ]);
        }

        const extToType = { pdf: 'pdf', doc: 'docx', docx: 'docx', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', xls: 'spreadsheet', xlsx: 'spreadsheet', txt: 'txt', html: 'html' };
        const documents = [];

        for (const folder of foldersToScan) {
            let continuationToken;
            do {
                const result = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: folder.prefix, ContinuationToken: continuationToken }));
                continuationToken = result.NextContinuationToken;
                if (!result.Contents) continue;
                for (const obj of result.Contents) {
                    if (obj.Key.endsWith('/')) continue;
                    const relativePath = obj.Key.substring(folder.prefix.length);
                    if (!relativePath) continue;
                    const pathParts = relativePath.split('/');
                    const baseName = pathParts[pathParts.length - 1];
                    const ext = baseName.split('.').pop()?.toLowerCase() || 'unknown';

                    // Auto-detect category from subfolder structure
                    let category = folder.defaultCategory;
                    const CRM_CATEGORY_MAP = {
                        'id document': 'ID Document', 'proof of address': 'Proof of Address',
                        'bank statement': 'Bank Statement', 'dsar': 'DSAR',
                        'letter of authority': 'Letter of Authority', 'cover letter': 'Cover Letter',
                        'complaint letter': 'Complaint Letter', 'final response letter frl': 'Final Response Letter (FRL)',
                        'counter response': 'Counter Response', 'fos complaint form': 'FOS Complaint Form',
                        'fos decision': 'FOS Decision', 'offer letter': 'Offer Letter',
                        'acceptance form': 'Acceptance Form', 'settlement agreement': 'Settlement Agreement',
                        'invoice': 'Invoice', 'other': 'Other', 'client': 'Client', 'legal': 'Legal'
                    };
                    if (folder.prefix.includes('/Lenders/')) {
                        if (pathParts.length > 2) {
                            const subfolderName = pathParts[1].replace(/_/g, ' ').toLowerCase();
                            if (CRM_CATEGORY_MAP[subfolderName]) category = CRM_CATEGORY_MAP[subfolderName];
                        }
                    } else if (folder.prefix.includes('/Documents/')) {
                        if (pathParts.length > 1) {
                            const subfolderName = pathParts[0].replace(/_/g, ' ').toLowerCase();
                            if (CRM_CATEGORY_MAP[subfolderName]) category = CRM_CATEGORY_MAP[subfolderName];
                        }
                    }
                    if (baseName.includes('Cover_Letter') || baseName.includes('COVER LETTER')) category = 'Cover Letter';
                    else if (baseName.includes('_LOA') || baseName.includes(' - LOA.pdf') || baseName.includes(' - LOA ')) category = 'LOA';
                    if (folder.prefix.includes('Terms-and-Conditions')) category = 'Legal';

                    const tags = [];
                    if (folder.prefix.includes('/Lenders/') && pathParts.length > 1) {
                        const lenderName = pathParts[0].replace(/_/g, ' ');
                        if (lenderName && lenderName !== baseName) tags.push(lenderName);
                        tags.push('claim-document');
                    }

                    documents.push({
                        id: obj.Key,
                        contact_id: parseInt(contactId),
                        name: baseName,
                        type: extToType[ext] || 'unknown',
                        category,
                        s3_key: obj.Key,
                        size: obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : 'Unknown',
                        tags,
                        created_at: obj.LastModified || new Date()
                    });
                }
            } while (continuationToken);
        }

        documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        res.json(documents);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/claims/:claimId/documents ── Documents for a specific claim/lender
crmRouter.get('/contacts/:id/claims/:claimId/documents', async (req, res) => {
    try {
        const contactId = req.params.id;
        const claimId = req.params.claimId;

        // Fetch claim — verify it belongs to this contact
        const claimRes = await pool.query(
            `SELECT id, lender, loa_generated, loa_file_url, cover_letter_file_url, dsar_sent, status, reference_specified
             FROM cases WHERE id = $1 AND contact_id = $2`,
            [parseInt(claimId), parseInt(contactId)]
        );
        if (claimRes.rows.length === 0) return res.status(404).json({ error: 'Claim not found for this contact' });
        const claim = claimRes.rows[0];
        const lender = claim.lender;

        if (!lender) return res.json({ claim, documents: [] });

        const sanitizedLender = lender.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        // Resolve contact S3 base folder
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contactId]);
        if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        const { first_name, last_name } = contactRes.rows[0];

        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        const nameCandidates = new Set([
            `${first_name}_${last_name}`.replace(/\s+/g, '_'),
            `${first_name}_${last_name}`,
            `${first_name}_${last_name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        ]);
        const allBaseFolders = [];
        const seenFolders = new Set();
        for (const name of nameCandidates) {
            const testPrefix = `${name}_${contactId}/`;
            if (seenFolders.has(testPrefix)) continue;
            const probe = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: testPrefix, MaxKeys: 1 }));
            if (probe.Contents && probe.Contents.length > 0) { allBaseFolders.push(testPrefix); seenFolders.add(testPrefix); }
        }
        let contToken = undefined;
        do {
            const topLevel = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Delimiter: '/', MaxKeys: 1000, ContinuationToken: contToken }));
            for (const p of (topLevel.CommonPrefixes || [])) {
                if (p.Prefix && p.Prefix.endsWith(`_${contactId}/`) && !seenFolders.has(p.Prefix)) { allBaseFolders.push(p.Prefix); seenFolders.add(p.Prefix); }
            }
            contToken = topLevel.IsTruncated ? topLevel.NextContinuationToken : undefined;
        } while (contToken);

        const documents = [];
        const extToType = { pdf: 'pdf', doc: 'docx', docx: 'docx', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', xls: 'spreadsheet', xlsx: 'spreadsheet', txt: 'txt', html: 'html' };

        for (const baseFolder of (allBaseFolders.length > 0 ? allBaseFolders : [])) {
            const lenderPrefix = `${baseFolder}Lenders/${sanitizedLender}/`;
            let continuationToken;
            do {
                const result = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: lenderPrefix, ContinuationToken: continuationToken }));
                continuationToken = result.NextContinuationToken;
                if (!result.Contents) break;
                for (const obj of result.Contents) {
                    if (obj.Key.endsWith('/')) continue;
                    const relativePath = obj.Key.substring(lenderPrefix.length);
                    if (!relativePath) continue;
                    const pathParts = relativePath.split('/');
                    const baseName = pathParts[pathParts.length - 1];
                    const ext = baseName.split('.').pop()?.toLowerCase() || 'unknown';

                    // Auto-detect category from subfolder structure
                    const CLAIM_CATEGORY_MAP = {
                        'id document': 'ID Document', 'proof of address': 'Proof of Address',
                        'bank statement': 'Bank Statement', 'dsar': 'DSAR',
                        'letter of authority': 'Letter of Authority', 'cover letter': 'Cover Letter',
                        'complaint letter': 'Complaint Letter', 'final response letter frl': 'Final Response Letter (FRL)',
                        'counter response': 'Counter Response', 'fos complaint form': 'FOS Complaint Form',
                        'fos decision': 'FOS Decision', 'offer letter': 'Offer Letter',
                        'acceptance form': 'Acceptance Form', 'settlement agreement': 'Settlement Agreement',
                        'invoice': 'Invoice', 'other': 'Other'
                    };
                    let category = 'LOA';
                    // Extract category from subfolder: {Category}/file.pdf → pathParts[0] = Category
                    if (pathParts.length > 1) {
                        const subfolderName = pathParts[0].replace(/_/g, ' ').toLowerCase();
                        if (CLAIM_CATEGORY_MAP[subfolderName]) category = CLAIM_CATEGORY_MAP[subfolderName];
                    }
                    // Filename-based overrides
                    if (baseName.includes('Cover_Letter') || baseName.toUpperCase().includes('COVER LETTER')) category = 'Cover Letter';
                    else if (baseName.toUpperCase().includes(' - LOA') || baseName.toUpperCase().includes('_LOA')) category = 'LOA';

                    documents.push({
                        id: obj.Key,
                        contact_id: parseInt(contactId),
                        claim_id: parseInt(claimId),
                        lender,
                        name: baseName,
                        type: extToType[ext] || 'unknown',
                        category,
                        s3_key: obj.Key,
                        size: obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : 'Unknown',
                        tags: [lender, 'claim-document'],
                        created_at: obj.LastModified || new Date()
                    });
                }
            } while (continuationToken);
        }

        documents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json({
            claim: {
                id: claim.id,
                lender: claim.lender,
                status: claim.status,
                reference_number: claim.reference_specified,
                loa_generated: claim.loa_generated,
                dsar_sent: claim.dsar_sent
            },
            documents,
            total: documents.length
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/dsars ── Get DSAR history for contact's cases
crmRouter.get('/contacts/:id/dsars', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, lender, loa_generated, dsar_sent, dsar_sent_at, dsar_send_after, status, created_at
             FROM cases WHERE contact_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json({ cases: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/ref/:ref ── Look up contact + claims by CSV claim ref (client_id)
crmRouter.get('/contacts/ref/:ref', async (req, res) => {
    try {
        const ref = req.params.ref.trim();
        const { rows } = await pool.query(
            `SELECT id, first_name, last_name, full_name, email, phone, client_id, created_at
             FROM contacts WHERE client_id = $1 LIMIT 1`,
            [ref]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'No contact found for that claim ref' });
        const contact = rows[0];
        const { rows: claims } = await pool.query(
            'SELECT * FROM cases WHERE contact_id = $1 ORDER BY created_at DESC',
            [contact.id]
        );
        res.json({ contact, claims });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /search?q= ── Search contacts + claims (incl. claim reference)
crmRouter.get('/search', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ error: 'q query parameter is required' });

        const pattern = `%${q}%`;
        const numericQ = q.replace(/^RR-/i, '');
        const numericPattern = `%${numericQ}%`;

        const { rows } = await pool.query(
            `SELECT
                ct.id AS contact_id,
                ct.first_name, ct.last_name, ct.full_name,
                ct.email, ct.phone, ct.client_id, ct.postal_code,
                cs.id AS claim_id, cs.case_number, cs.lender,
                cs.status AS claim_status
             FROM contacts ct
             LEFT JOIN cases cs ON cs.contact_id = ct.id
             WHERE ct.full_name ILIKE $1
                OR ct.first_name ILIKE $1
                OR ct.last_name ILIKE $1
                OR ct.email ILIKE $1
                OR ct.phone ILIKE $1
                OR ct.client_id ILIKE $1
                OR ct.postal_code ILIKE $1
                OR CAST(ct.id AS TEXT) = $3
                OR cs.lender ILIKE $1
                OR cs.status ILIKE $1
                OR cs.case_number ILIKE $1
                OR cs.reference_specified ILIKE $2
                OR CAST(cs.id AS TEXT) ILIKE $2
                OR (CAST(ct.id AS TEXT) || CAST(cs.id AS TEXT)) ILIKE $2
             ORDER BY ct.updated_at DESC, cs.created_at DESC
             LIMIT 50`,
            [pattern, numericPattern, numericQ]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /pipelines ── List all claims with contact info (for pipeline view)
crmRouter.get('/pipelines', async (req, res) => {
    try {
        const statusFilter = req.query.status;
        let query = `
            SELECT c.*, con.first_name AS contact_first_name, con.last_name AS contact_last_name,
                   con.full_name AS contact_full_name, con.email AS contact_email
            FROM cases c
            LEFT JOIN contacts con ON c.contact_id = con.id
        `;
        const params = [];
        if (statusFilter) {
            query += ' WHERE c.status = $1';
            params.push(statusFilter);
        }
        query += ' ORDER BY c.created_at DESC';
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /cases/:id ── Get claim details
crmRouter.get('/cases/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM cases WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /templates/docx ── List document templates (OO templates + DOCX templates)
crmRouter.get('/templates/docx', async (req, res) => {
    try {
        // Get OO templates from DB
        const ooResult = await pool.query(
            "SELECT id, name, description, category, s3_key, variable_fields, use_for_loa, use_for_cover_letter, created_at FROM oo_templates WHERE is_active = TRUE ORDER BY updated_at DESC"
        );
        const ooTemplates = ooResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            category: row.category || 'General',
            s3Key: row.s3_key,
            mergeFields: row.variable_fields || [],
            useForLoa: row.use_for_loa,
            useForCoverLetter: row.use_for_cover_letter,
            source: 'oo_templates',
        }));

        // Get static DOCX templates from S3
        const docxTemplates = [];
        if (typeof DOCX_TEMPLATE_KEYS !== 'undefined') {
            for (const [type, s3Key] of Object.entries(DOCX_TEMPLATE_KEYS)) {
                try {
                    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
                    docxTemplates.push({ type, s3Key, exists: true, source: 'docx_templates' });
                } catch { docxTemplates.push({ type, s3Key, exists: false, source: 'docx_templates' }); }
            }
        }

        res.json({ success: true, templates: [...ooTemplates, ...docxTemplates] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /cases ── Create claim (with duplicate check)
crmRouter.post('/cases', async (req, res) => {
    const { contact_id, lender, case_number, status, claim_value, product_type, account_number, start_date } = req.body;

    if (!contact_id || !lender) {
        return res.status(400).json({ error: 'contact_id and lender are required' });
    }

    try {
        const standardizedLender = standardizeLender(lender);

        // Duplicate claims allowed - no duplicate check

        // Check Category 3 lender
        if (isCategory3Lender(standardizedLender)) {
            const contactRes = await pool.query('SELECT first_name, last_name, email FROM contacts WHERE id = $1', [contact_id]);
            if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

            const confirmToken = generateConfirmationToken();
            const rejectToken = generateConfirmationToken();
            await pool.query(
                'INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent) VALUES ($1, $2, $3, $4, false)',
                [contact_id, standardizedLender, 'confirm', confirmToken]
            );
            await pool.query(
                'INSERT INTO pending_lender_confirmations (contact_id, lender, action, token, email_sent) VALUES ($1, $2, $3, $4, true)',
                [contact_id, standardizedLender, 'reject', rejectToken]
            );

            return res.json({
                success: true,
                category3: true,
                message: `${standardizedLender} is a Category 3 lender. Confirmation required.`,
                lender: standardizedLender,
            });
        }

        // Normal creation
        const dsarSendAfter = lender.toUpperCase() !== 'GAMBLING' ? new Date() : null;
        const { rows } = await pool.query(
            `INSERT INTO cases (contact_id, case_number, lender, status, claim_value, product_type, account_number, start_date, loa_generated, dsar_send_after)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9) RETURNING *`,
            [contact_id, case_number || null, standardizedLender, status || 'New Lead', claim_value || null, product_type || null, account_number || null, start_date || null, dsarSendAfter]
        );
        await setReferenceSpecified(pool, contact_id, rows[0].id);
        crmEvents.emit('case.created', { caseId: rows[0].id, contactId: parseInt(contact_id), data: rows[0] });
        res.json({ success: true, case: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /contacts/:id/notes ── Add note to contact
crmRouter.post('/contacts/:id/notes', async (req, res) => {
    const { content, pinned, created_by, created_by_name } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    try {
        const { rows } = await pool.query(
            'INSERT INTO notes (client_id, content, pinned, created_by, created_by_name) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.params.id, content, pinned || false, created_by || 'openclaw', created_by_name || 'OpenClaw']
        );
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, 'agent', created_by || 'openclaw', created_by_name || 'OpenClaw', 'note_added', 'notes',
            `Added note: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`]
        );
        crmEvents.emit('note.created', { contactId: parseInt(req.params.id), data: rows[0] });
        res.json({ success: true, note: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /email/send ── Send email
crmRouter.post('/email/send', async (req, res) => {
    const { to, subject, html, text } = req.body;
    if (!to || !subject || (!html && !text)) {
        return res.status(400).json({ error: 'to, subject, and html or text are required' });
    }

    const mailOptions = {
        from: '"Rowan Rose Solicitors" <info@fastactionclaims.co.uk>',
        to, subject,
        text: text || 'Please view this email in a client that supports HTML.',
        html: html || undefined,
    };

    if (EMAIL_DRAFT_MODE) {
        return res.json({ success: true, draft: true, message: 'Email in DRAFT mode - not sent' });
    }

    try {
        const info = await transporter.sendMail(mailOptions);

        // Log to action_logs
        const contactRes = await pool.query('SELECT id FROM contacts WHERE email = $1', [to]).catch(() => ({ rows: [] }));
        if (contactRes.rows.length > 0) {
            logAction({
                clientId: contactRes.rows[0].id,
                actionType: 'email_sent',
                actionCategory: 'communication',
                description: `Email sent to ${to}: "${subject}"`,
                metadata: { recipient: to, subject, channel: 'crm_api', messageId: info.messageId }
            });
        }

        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('[CRM API] Email error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── GET /contacts/:id/communications ── Get communications for a contact
crmRouter.get('/contacts/:id/communications', async (req, res) => {
    const { id } = req.params;
    const { channel, type, direction, limit: queryLimit, offset: queryOffset } = req.query;

    try {
        const limitVal = Math.min(parseInt(queryLimit) || 50, 200);
        const offsetVal = parseInt(queryOffset) || 0;
        const params = [id];
        let paramIdx = 2;

        let query = `SELECT id, client_id as contact_id, COALESCE(type, channel) as type, direction, content,
                      "from", "to", media_url, media_type, twilio_sid, status, template_name, sent_by,
                      timestamp as created_at
                      FROM communications WHERE client_id = $1`;

        if (channel || type) {
            query += ` AND (channel = $${paramIdx} OR type = $${paramIdx})`;
            params.push(type || channel);
            paramIdx++;
        }
        if (direction) {
            query += ` AND direction = $${paramIdx++}`;
            params.push(direction);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(limitVal, offsetVal);

        const { rows } = await pool.query(query, params);

        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM communications WHERE client_id = $1`,
            [id]
        );

        res.json({
            communications: rows,
            total: parseInt(countResult.rows[0].total),
            limit: limitVal,
            offset: offsetVal
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /communications ── Log communication
crmRouter.post('/communications', async (req, res) => {
    const {
        client_id, contact_id, channel, type, direction, subject, content,
        call_duration_seconds, call_notes, agent_id, agent_name,
        from: fromAddr, to: toAddr, media_url, media_type,
        twilio_sid, status, template_name, sent_by
    } = req.body;
    const contactId = client_id || contact_id;
    const commType = type || channel;
    if (!contactId || !commType || !direction) {
        return res.status(400).json({ error: 'client_id/contact_id, channel/type, and direction are required' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO communications (client_id, channel, type, direction, subject, content,
                call_duration_seconds, call_notes, agent_id, agent_name,
                "from", "to", media_url, media_type, twilio_sid, status, template_name, sent_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
            [contactId, commType, commType, direction, subject || null, content || null,
                call_duration_seconds || null, call_notes || null, agent_id || null, agent_name || null,
                fromAddr || null, toAddr || null, media_url || null, media_type || null,
                twilio_sid || null, status || 'sent', template_name || null, sent_by || 'system']
        );
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contactId, 'agent', agent_id || 'openclaw', agent_name || 'OpenClaw',
                `${direction}_${commType}`, 'communication',
                `${direction === 'outbound' ? 'Sent' : 'Received'} ${commType} message`]
        );
        crmEvents.emit('communication.created', { contactId: parseInt(contactId), data: rows[0] });
        res.json({ success: true, communication: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /action-logs ── Log action timeline entry
crmRouter.post('/action-logs', async (req, res) => {
    const { client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata } = req.body;
    if (!client_id || !action_type) {
        return res.status(400).json({ error: 'client_id and action_type are required' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [client_id, claim_id || null, actor_type || 'agent', actor_id || 'openclaw',
                actor_name || 'OpenClaw', action_type, action_category || 'general',
                description || '', metadata ? JSON.stringify(metadata) : null]
        );
        res.json({ success: true, actionLog: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /workflows/trigger ── Trigger workflow
crmRouter.post('/workflows/trigger', async (req, res) => {
    const { client_id, workflow_type, workflow_name, triggered_by, total_steps } = req.body;
    if (!client_id || !workflow_type) {
        return res.status(400).json({ error: 'client_id and workflow_type are required' });
    }

    try {
        const nextActionAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
        const { rows } = await pool.query(
            `INSERT INTO workflow_triggers (client_id, workflow_type, workflow_name, triggered_by, status, total_steps, next_action_at, next_action_description)
             VALUES ($1, $2, $3, $4, 'active', $5, $6, 'Send follow-up SMS') RETURNING *`,
            [client_id, workflow_type, workflow_name || workflow_type, triggered_by || 'openclaw', total_steps || 4, nextActionAt]
        );
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [client_id, 'agent', 'openclaw', 'OpenClaw', 'workflow_triggered', 'workflow', `Triggered workflow: ${workflow_type}`]
        );
        res.json({ success: true, workflow: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /contacts/:id ── Update contact
crmRouter.patch('/contacts/:id', async (req, res) => {
    const { id } = req.params;
    const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'dob',
        'address_line_1', 'address_line_2', 'city', 'state_county', 'postal_code',
        'id_chase_active', 'id_chase_stage', 'id_chase_started_at',
        'id_chase_last_action_at', 'id_chase_last_client_at', 'id_chase_channel', 'bot_paused'];

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${paramCount++}`);
                values.push(req.body[field]);
            }
        }
        if (req.body.first_name !== undefined || req.body.last_name !== undefined) {
            updates.push(`full_name = $${paramCount++}`);
            values.push(`${req.body.first_name || ''} ${req.body.last_name || ''}`.trim());
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const { rows } = await pool.query(
            `UPDATE contacts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        crmEvents.emit('contact.updated', { contactId: rows[0].id, data: rows[0] });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /cases/:id ── Update claim (status etc)
crmRouter.patch('/cases/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    try {
        const isDSARSent = status === 'DSAR Sent to Lender';
        const result = await pool.query(
            `UPDATE cases
             SET status = $1,
                 dsar_sent_at = CASE WHEN $3::boolean THEN NOW() ELSE dsar_sent_at END,
                 dsar_overdue_notified = CASE WHEN $3::boolean THEN false ELSE dsar_overdue_notified END
             WHERE id = $2 RETURNING *`,
            [status, id, isDSARSent]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Case not found' });

        crmEvents.emit('case.status_changed', { caseId: parseInt(id), contactId: result.rows[0].contact_id, data: result.rows[0], newStatus: status });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /cases/bulk/status ── Bulk status update
crmRouter.patch('/cases/bulk/status', async (req, res) => {
    const { claimIds, status } = req.body;
    if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
        return res.status(400).json({ error: 'claimIds array is required' });
    }
    if (!status) return res.status(400).json({ error: 'status is required' });

    try {
        let result;
        if (status === 'DSAR Sent to Lender') {
            result = await pool.query(
                'UPDATE cases SET status = $1, dsar_sent_at = NOW(), dsar_overdue_notified = false WHERE id = ANY($2::int[]) RETURNING *',
                [status, claimIds]
            );
        } else {
            result = await pool.query(
                'UPDATE cases SET status = $1 WHERE id = ANY($2::int[]) RETURNING *',
                [status, claimIds]
            );
        }
        crmEvents.emit('case.bulk_status', { caseIds: claimIds, newStatus: status, count: result.rows.length });
        res.json({ success: true, updatedCount: result.rows.length, updatedClaims: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /contacts/:id/checklist ── Update document checklist
crmRouter.patch('/contacts/:id/checklist', async (req, res) => {
    const { id } = req.params;
    const { document_checklist, checklist_change } = req.body;

    if (!document_checklist) return res.status(400).json({ error: 'document_checklist object is required' });

    try {
        const { rows } = await pool.query(
            `UPDATE contacts SET document_checklist = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [JSON.stringify(document_checklist), id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

        if (checklist_change) {
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [id, 'agent', 'openclaw', 'OpenClaw', 'checklist_updated', 'documents',
                    `Updated checklist: ${checklist_change.field} = ${checklist_change.value}`,
                    JSON.stringify(checklist_change)]
            );
        }

        crmEvents.emit('contact.updated', { contactId: parseInt(id), data: rows[0] });
        res.json({ success: true, contact: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /contacts/:id/extended ── Update contact extended details (bank, address, checklist, etc.)
crmRouter.patch('/contacts/:id/extended', async (req, res) => {
    const { id } = req.params;

    const allowedFields = [
        'bank_name', 'account_name', 'sort_code', 'bank_account_number',
        'address_line_1', 'address_line_2', 'city', 'state_county', 'postal_code',
        'previous_address_line_1', 'previous_address_line_2', 'previous_city',
        'previous_county', 'previous_postal_code', 'extra_lenders',
        'had_ccj', 'victim_of_scam', 'problematic_gambling', 'betting_companies'
    ];

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${paramCount++}`);
                values.push(req.body[field]);
            }
        }

        // Handle JSONB fields separately
        if (req.body.previous_addresses !== undefined) {
            updates.push(`previous_addresses = $${paramCount++}`);
            const val = typeof req.body.previous_addresses === 'string' ? req.body.previous_addresses : JSON.stringify(req.body.previous_addresses);
            values.push(val);
        }
        if (req.body.document_checklist !== undefined) {
            updates.push(`document_checklist = $${paramCount++}`);
            const val = typeof req.body.document_checklist === 'string' ? req.body.document_checklist : JSON.stringify(req.body.document_checklist);
            values.push(val);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const { rows } = await pool.query(
            `UPDATE contacts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

        // Sync previous addresses to the previous_addresses table
        if (req.body.previous_addresses && Array.isArray(req.body.previous_addresses) && req.body.previous_addresses.length > 0) {
            await pool.query('DELETE FROM previous_addresses WHERE contact_id = $1', [id]);
            for (const addr of req.body.previous_addresses) {
                await pool.query(
                    `INSERT INTO previous_addresses (contact_id, address_line_1, address_line_2, city, county, postal_code)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [id, addr.line1 || addr.address_line_1 || '', addr.line2 || addr.address_line_2 || '', addr.city || '', addr.county || '', addr.postalCode || addr.postal_code || '']
                );
            }
        }

        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, 'agent', 'openclaw', 'OpenClaw', 'details_updated', 'account', 'Updated contact extended details via CRM API']
        );

        crmEvents.emit('contact.updated', { contactId: parseInt(id), data: rows[0] });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /documents/generate ── Generate merged DOCX from template + convert to PDF
crmRouter.post('/documents/generate', async (req, res) => {
    try {
        const { s3Key, templateId, contact_id, claim_id, lender, docType } = req.body;
        // Allow caller to pass explicit variables that override auto-resolved ones
        const callerVariables = req.body.variables || {};

        // Template category → document type mapping for filenames & S3 tags
        const CATEGORY_TO_DOCTYPE = {
            'Complaint': 'COMPLAINT LETTER',
            'Outcome': 'ACCEPTANCE LETTER',
            'Onboarding': 'CLIENT CARE LETTER',
            'Fee Recovery': 'DEBT COLLECTION NOTICE',
            'FOS': 'FOS RETAINER',
            'Client': 'UNABLE TO LOCATE',
            'LOA': 'LOA',
            'DSAR': 'DSAR COVER LETTER',
            'Intake': 'QUESTIONNAIRE',
        };

        // Resolve the S3 key (and category) from template ID or direct key
        let templateS3Key = s3Key;
        let templateCategory = null;
        if (!templateS3Key && templateId) {
            const tplResult = await pool.query('SELECT s3_key, category FROM oo_templates WHERE id = $1', [templateId]);
            if (tplResult.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
            templateS3Key = tplResult.rows[0].s3_key;
            templateCategory = tplResult.rows[0].category;
        }
        if (!templateS3Key) return res.status(400).json({ error: 's3Key or templateId is required' });

        // Resolve document type: caller override > template category mapping > fallback
        const resolvedDocType = docType || CATEGORY_TO_DOCTYPE[templateCategory] || templateCategory || 'LOA';

        console.log(`[CRM API] Generating document from template: ${templateS3Key}`);
        console.log(`[CRM API] contact_id=${contact_id}, claim_id=${claim_id}, caller variables:`, Object.keys(callerVariables));

        // ── 0. Auto-resolve variables from contact + claim DB records ──────────
        const _fmtDate = (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
            catch { return ''; }
        };
        const _initials = (name) => {
            if (!name) return '';
            return name.split(' ').map(w => w[0]).join('').toUpperCase();
        };
        const _s = (v) => (v == null || v === undefined) ? '' : String(v);

        let autoVariables = {};

        // Fetch contact data
        let contact = null;
        if (contact_id) {
            try {
                const { rows } = await pool.query('SELECT * FROM contacts WHERE id = $1', [contact_id]);
                if (rows.length > 0) contact = rows[0];
            } catch (e) { console.warn('[CRM API] Contact fetch failed:', e.message); }
        }

        // Fetch claim data
        let claim = null;
        if (claim_id) {
            try {
                const { rows } = await pool.query('SELECT * FROM cases WHERE id = $1', [claim_id]);
                if (rows.length > 0) claim = rows[0];
            } catch (e) { console.warn('[CRM API] Claim fetch failed:', e.message); }
        }

        // Build the full variable map
        if (contact) {
            Object.assign(autoVariables, {
                'client.fullName': _s(contact.full_name),
                'client.firstName': _s(contact.first_name),
                'client.lastName': _s(contact.last_name),
                'client.email': _s(contact.email),
                'client.phone': _s(contact.phone),
                'client.address': [contact.address_line_1, contact.address_line_2, contact.city, contact.state_county, contact.postal_code].filter(Boolean).join(', '),
                'client.addressLine1': _s(contact.address_line_1),
                'client.addressLine2': _s(contact.address_line_2),
                'client.city': _s(contact.city),
                'client.county': _s(contact.state_county),
                'client.postcode': _s(contact.postal_code),
                'client.previousAddress': [contact.previous_address_line_1, contact.previous_address_line_2, contact.previous_city, contact.previous_county, contact.previous_postal_code].filter(Boolean).join(', '),
                'client.dateOfBirth': _fmtDate(contact.dob),
                'client.id': _s(contact.id),
                'client.leadSource': _s(contact.source),
                'client.createdAt': _fmtDate(contact.created_at),
                'client.ipAddress': _s(contact.ip_address),
                'client.initials': _initials(contact.full_name),
                'client.reference': _s(contact.reference),
                // Legacy flat keys
                'clientId': _s(contact.id),
                'client_id': _s(contact.id),
                'client_name': _s(contact.full_name),
            });
        }

        if (claim) {
            Object.assign(autoVariables, {
                'claim.lender': _s(claim.lender),
                'claim.caseRef': _s(claim.reference_specified),
                'claim.accountNumber': _s(claim.account_number),
                'claim.accountType': _s(claim.product_type),
                'claim.accountStatus': _s(claim.status),
                'claim.amount': _s(claim.claim_value),
                'claim.claimValue': _s(claim.claim_value),
                'claim.totalRefund': _s(claim.total_refund),
                'claim.outstandingBalance': _s(claim.outstanding_balance),
                'claim.interestRate': _s(claim.apr),
                'claim.financeType': _s(claim.finance_type),
                'claim.loanTerm': _s(claim.loan_term),
                'claim.monthlyPayment': _s(claim.monthly_payment),
                'claim.vehicleDetails': _s(claim.vehicle_details),
                'claim.balloonPayment': _s(claim.balloon_payment),
                'claim.agreementDate': _fmtDate(claim.start_date),
                'claim.endDate': _fmtDate(claim.end_date),
                'claim.valueOfLoan': _s(claim.value_of_loan),
                'claim.numberOfLoans': _s(claim.number_of_loans),
                'claim.feePercentage': _s(claim.fee_percent),
                'claim.feeAmount': _s(claim.our_total_fee),
                'claim.feeVat': _s(claim.vat_amount),
                'claim.feePlusVat': _s(claim.our_fees_plus_vat),
                'claim.clientReceives': _s(claim.balance_due_to_client),
                'claim.outstandingDebt': _s(claim.outstanding_debt),
                'claim.billedFinanceCharges': _s(claim.billed_finance_charges),
                'claim.latePaymentCharges': _s(claim.late_payment_charges),
                'claim.overlimitCharges': _s(claim.overlimit_charges),
                'claim.billedInterestCharges': _s(claim.billed_interest_charges),
                'claim.creditLimitSchedule': _s(claim.credit_limit_increases),
                'claim.complaintParagraph': _s(claim.complaint_paragraph),
                'claim.clientId': _s(claim.contact_id),
                'claim.id': String(claim.id || ''),
            });
        }

        // Lender details — look up from all_lenders_details.json if available
        if (claim && claim.lender) {
            try {
                const { default: allLenders } = await import('./all_lenders_details.json', { assert: { type: 'json' } });
                const lenderEntry = allLenders.find(l => l.lender && l.lender.toLowerCase() === claim.lender.toLowerCase());
                if (lenderEntry && lenderEntry.address) {
                    Object.assign(autoVariables, {
                        'lender.companyName': _s(lenderEntry.address.company_name || claim.lender),
                        'lender.address': _s(lenderEntry.address.first_line_address),
                        'lender.city': _s(lenderEntry.address.town_city),
                        'lender.postcode': _s(lenderEntry.address.postcode),
                        'lender.email': _s(lenderEntry.email || ''),
                    });
                }
            } catch { /* lender lookup is best-effort */ }
        }

        // Firm defaults
        Object.assign(autoVariables, {
            'firm.name': 'Rowan Rose Solicitors',
            'firm.tradingName': 'Fast Action Claims',
            'firm.address': '1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ',
            'firm.phone': '0161 505 0150',
            'firm.sraNumber': '8000843',
            'firm.entity': 'Rowan Rose Ltd',
            'firm.companyNumber': '12916452',
        });

        // System fields
        Object.assign(autoVariables, {
            'system.today': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            'system.year': String(new Date().getFullYear()),
            'system.timestamp': new Date().toISOString(),
            'system.today+14': new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            'system.solicitorName': 'Brad Forbes',
            'system.firmPhone': '0161 533 1706',
            'system.firmEmail': 'irl@fastactionclaims.co.uk',
            'system.dsarEmail': 'dsar@fastactionclaims.co.uk',
        });

        // Merge custom field defaults from DB
        try {
            const { rows: customDefaults } = await pool.query(
                'SELECT field_key, default_value FROM custom_merge_fields WHERE is_active = TRUE AND default_value IS NOT NULL'
            );
            for (const { field_key, default_value } of customDefaults) {
                if (!autoVariables[field_key]) autoVariables[field_key] = default_value;
            }
            if (customDefaults.length > 0) console.log(`[CRM API] Applied ${customDefaults.length} custom field defaults`);
        } catch (cfErr) {
            console.warn('[CRM API] Could not fetch custom merge field defaults:', cfErr.message);
        }

        // Caller-provided variables override auto-resolved ones
        const variables = { ...autoVariables, ...callerVariables };

        console.log(`[CRM API] Total variables resolved: ${Object.keys(variables).length} (${Object.keys(autoVariables).length} auto + ${Object.keys(callerVariables).length} caller)`);

        // 1. Download template DOCX from S3
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: templateS3Key });
        const s3Response = await s3Client.send(getCmd);
        const chunks = [];
        for await (const chunk of s3Response.Body) { chunks.push(chunk); }
        const templateBuffer = Buffer.concat(chunks);

        // 2. Replace variables using Docxtemplater (handles Word XML tag splitting)
        let docxBuffer = templateBuffer;
        if (variables && Object.keys(variables).length > 0) {
            // Flatten dot-notation keys for Docxtemplater
            // e.g. { 'client.fullName': 'John' } → { client: { fullName: 'John' } }
            // But also keep flat keys so both {client.fullName} and {fullName} work
            const flatData = {};
            const nestedData = {};
            for (const [key, value] of Object.entries(variables)) {
                const cleanKey = key.replace(/^\{\{/, '').replace(/\}\}$/, '');
                flatData[cleanKey] = String(value || '');
                // Build nested object for dot notation
                const parts = cleanKey.split('.');
                if (parts.length === 2) {
                    if (!nestedData[parts[0]]) nestedData[parts[0]] = {};
                    nestedData[parts[0]][parts[1]] = String(value || '');
                }
            }
            const mergeData = { ...flatData, ...nestedData };

            try {
                // Protect {{IMAGE ...}} tags from Docxtemplater by temporarily replacing them
                const JSZipPre = (await import('jszip')).default;
                const preZip = await JSZipPre.loadAsync(templateBuffer);
                const preXml = await preZip.file('word/document.xml')?.async('string');
                if (preXml) {
                    const protectedXml = preXml.replace(/\{\{IMAGE ([^}]+)\}\}/g, '__IMAGE_PLACEHOLDER_$1__');
                    preZip.file('word/document.xml', protectedXml);
                }
                const preBuffer = Buffer.from(await preZip.generateAsync({ type: 'nodebuffer' }));

                const zip = new PizZip(preBuffer);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{{', end: '}}' },
                });
                doc.render(mergeData);
                const postBuffer = doc.getZip().generate({ type: 'nodebuffer' });

                // Restore {{IMAGE ...}} tags after Docxtemplater
                const postZip = await JSZipPre.loadAsync(postBuffer);
                const postXml = await postZip.file('word/document.xml')?.async('string');
                if (postXml) {
                    const restoredXml = postXml.replace(/__IMAGE_PLACEHOLDER_([^_]+)__/g, '{{IMAGE $1}}');
                    postZip.file('word/document.xml', restoredXml);
                }
                docxBuffer = Buffer.from(await postZip.generateAsync({ type: 'nodebuffer' }));
                console.log(`[CRM API] Docxtemplater merge successful`);
            } catch (dtErr) {
                // If Docxtemplater fails (e.g. malformed tags), fall back to manual replacement
                console.warn(`[CRM API] Docxtemplater failed, falling back to manual replacement:`, dtErr.message);
                const JSZip = (await import('jszip')).default;
                const zip = await JSZip.loadAsync(templateBuffer);

                const xmlFiles = ['word/document.xml'];
                zip.folder('word').forEach((relativePath) => {
                    if (/^(header|footer)\d*\.xml$/.test(relativePath)) {
                        xmlFiles.push(`word/${relativePath}`);
                    }
                });

                for (const xmlFile of xmlFiles) {
                    const fileContent = await zip.file(xmlFile)?.async('string');
                    if (!fileContent) continue;
                    let modified = fileContent;

                    // Strip XML tags from inside {{ }} so replacement can match
                    modified = modified.replace(
                        /\{\{(?:[^}]|\}(?!\}))*\}\}/g,
                        (match) => match.replace(/<[^>]*>/g, '')
                    );

                    for (const [key, value] of Object.entries(flatData)) {
                        modified = modified.split(`{{${key}}}`).join(String(value || ''));
                        modified = modified.split(`{{ ${key} }}`).join(String(value || ''));
                    }
                    zip.file(xmlFile, modified);
                }
                docxBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
            }
        }

        // 2b. Handle {{IMAGE signatureImage}} — inject signature PNG into DOCX
        if (contact_id) {
            try {
                const JSZipImg = (await import('jszip')).default;
                const zipForImg = await JSZipImg.loadAsync(docxBuffer);
                const docXml = await zipForImg.file('word/document.xml')?.async('string');

                if (docXml && docXml.includes('{{IMAGE signatureImage}}')) {
                    // Fetch signature from contact's S3 folder
                    const sigContact = await pool.query('SELECT first_name, last_name, signature_url FROM contacts WHERE id = $1', [contact_id]);
                    let signatureBuffer = null;

                    if (sigContact.rows.length > 0) {
                        const { first_name: fn, last_name: ln, signature_url } = sigContact.rows[0];
                        // Try direct S3 key first
                        const sigKey = `${fn}_${ln}_${contact_id}/Signatures/signature.png`;
                        try {
                            const sigResp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: sigKey }));
                            const sigChunks = [];
                            for await (const chunk of sigResp.Body) sigChunks.push(chunk);
                            signatureBuffer = Buffer.concat(sigChunks);
                            console.log(`[CRM API] Signature loaded from S3: ${sigKey} (${signatureBuffer.length} bytes)`);
                        } catch (sigErr) {
                            console.warn(`[CRM API] Signature not found at ${sigKey}`);
                        }
                    }

                    if (signatureBuffer) {
                        // Add image to DOCX zip
                        zipForImg.file('word/media/signature.png', signatureBuffer);

                        // Add relationship for the image
                        const relsPath = 'word/_rels/document.xml.rels';
                        let relsXml = await zipForImg.file(relsPath)?.async('string') || '';
                        const rId = 'rIdSignature1';
                        if (!relsXml.includes(rId)) {
                            relsXml = relsXml.replace(
                                '</Relationships>',
                                `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature.png"/></Relationships>`
                            );
                            zipForImg.file(relsPath, relsXml);
                        }

                        // Replace {{IMAGE signatureImage}} text with inline drawing XML
                        // Image size: 200x80 px → EMU (1px = 9525 EMU)
                        const widthEmu = 200 * 9525;
                        const heightEmu = 80 * 9525;
                        const drawingXml = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="100" name="Signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="100" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;

                        const modifiedXml = docXml.replace(
                            /(<w:r[^>]*>)((?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t[^>]*>\{\{IMAGE signatureImage\}\}<\/w:t>(<\/w:r>)/,
                            `$1$2${drawingXml}$3`
                        );
                        zipForImg.file('word/document.xml', modifiedXml);
                        docxBuffer = Buffer.from(await zipForImg.generateAsync({ type: 'nodebuffer' }));
                        console.log(`[CRM API] Signature image injected into DOCX`);
                    } else {
                        // No signature found — replace tag with "Signed Electronically"
                        const modifiedXml = docXml.split('{{IMAGE signatureImage}}').join('Signed Electronically');
                        zipForImg.file('word/document.xml', modifiedXml);
                        docxBuffer = Buffer.from(await zipForImg.generateAsync({ type: 'nodebuffer' }));
                        console.log(`[CRM API] No signature found, using text fallback`);
                    }
                }
            } catch (imgErr) {
                console.warn(`[CRM API] Signature injection failed (non-fatal):`, imgErr.message);
            }
        }

        // 3. Convert DOCX → PDF using LibreOffice (preferred) or Puppeteer fallback
        let pdfBuffer;
        let conversionMethod;
        const libreOfficePath = await findLibreOffice();

        if (libreOfficePath) {
            console.log(`[CRM API] Using LibreOffice at: ${libreOfficePath}`);
            pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
            conversionMethod = 'libreoffice';
        } else {
            console.log('[CRM API] LibreOffice not found, using Puppeteer fallback');
            pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
            conversionMethod = 'puppeteer';
        }

        // 4. Build S3 output path: {firstName}_{lastName}_{contactId}/{lender}/{reference} - {fullName} - {lender} - {docType}.pdf
        const timestamp = Date.now();
        let outputKey;
        let outputDocxKey;
        let displayName;

        if (contact_id) {
            const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contact_id]);
            if (contactRes.rows.length > 0) {
                const { first_name, last_name } = contactRes.rows[0];
                const sanitize = (s) => (s || '').replace(/[<>:"/\\|?*]/g, '').trim();
                const folderName = buildS3Folder(first_name, last_name, contact_id).slice(0, -1);
                const fullName = `${(first_name || '').replace(/[\/\\]/g, '')} ${(last_name || '').replace(/[\/\\]/g, '')}`.trim();
                const lenderName = sanitize(lender || variables?.['claim.lender'] || variables?.['{{claim.lender}}'] || 'General');
                const documentType = sanitize(resolvedDocType);

                // Build reference: {contactId}{claimId} e.g. 22909067676
                // Look up reference_specified from case if claim_id provided
                let reference = String(contact_id);
                if (claim_id) {
                    const caseRes = await pool.query('SELECT reference_specified FROM cases WHERE id = $1', [claim_id]);
                    if (caseRes.rows.length > 0 && caseRes.rows[0].reference_specified) {
                        reference = caseRes.rows[0].reference_specified;
                    } else {
                        reference = `${contact_id}${claim_id}`;
                    }
                }

                displayName = `${reference} - ${fullName} - ${lenderName} - ${documentType}.pdf`;
                outputKey = `${folderName}/Lenders/${lenderName}/${displayName}`;
                outputDocxKey = `${folderName}/Lenders/${lenderName}/${reference} - ${fullName} - ${lenderName} - ${documentType}.docx`;
            }
        }

        // Fallback to generic path if no contact info
        if (!outputKey) {
            displayName = `crm-generated-${timestamp}.pdf`;
            outputKey = `documents/generated/${displayName}`;
            outputDocxKey = `documents/generated/crm-generated-${timestamp}.docx`;
        }

        console.log(`[CRM API] Output path: ${outputKey}`);

        // 5. Upload generated PDF to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: outputKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
        }));

        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: outputKey }), { expiresIn: 604800 });

        // 6. Optionally attach to contact's documents
        let document = null;
        if (contact_id) {
            const docResult = await pool.query(
                `INSERT INTO documents (contact_id, claim_id, name, type, category, url, size, tags)
                 VALUES ($1, $2, $3, 'pdf', $4, $5, $6, $7) RETURNING *`,
                [contact_id, claim_id || null, displayName, resolvedDocType, downloadUrl,
                    `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
                    [resolvedDocType, 'Generated', lender || variables?.['claim.lender'] || 'Template'].filter(Boolean)]
            );
            document = docResult.rows[0];
            crmEvents.emit('document.uploaded', { documentId: document.id, contactId: parseInt(contact_id), data: document });
        }

        console.log(`[CRM API] Document generated: ${outputKey} (${(pdfBuffer.length / 1024).toFixed(1)} KB) via ${conversionMethod}`);

        res.json({
            success: true,
            pdf: { s3Key: outputKey, downloadUrl, size: pdfBuffer.length },
            conversionMethod,
            document,
        });
    } catch (err) {
        console.error('[CRM API] Document generation error:', err);
        res.status(500).json({ error: 'Failed to generate document: ' + err.message });
    }
});

// ── POST /documents/generate-pdf ── Convert DOCX → PDF (standalone conversion)
crmRouter.post('/documents/generate-pdf', upload.single('file'), async (req, res) => {
    try {
        let docxBuffer;

        // Accept either file upload or S3 key
        if (req.file) {
            docxBuffer = req.file.buffer;
        } else if (req.body.s3Key) {
            const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: req.body.s3Key });
            const s3Response = await s3Client.send(getCmd);
            const chunks = [];
            for await (const chunk of s3Response.Body) { chunks.push(chunk); }
            docxBuffer = Buffer.concat(chunks);
        } else {
            return res.status(400).json({ error: 'Provide a file upload or s3Key' });
        }

        console.log(`[CRM API] Converting DOCX to PDF (${(docxBuffer.length / 1024).toFixed(1)} KB)`);

        const libreOfficePath = await findLibreOffice();
        let pdfBuffer;
        let conversionMethod;

        if (libreOfficePath) {
            pdfBuffer = await convertWithLibreOffice(docxBuffer, 'pdf', libreOfficePath);
            conversionMethod = 'libreoffice';
        } else {
            pdfBuffer = await convertDocxToPdfWithPuppeteer(docxBuffer);
            conversionMethod = 'puppeteer';
        }

        // Upload PDF to S3
        const outputKey = `documents/generated/converted-${Date.now()}.pdf`;
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: outputKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
        }));

        const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: outputKey }), { expiresIn: 604800 });

        console.log(`[CRM API] PDF converted: ${outputKey} (${(pdfBuffer.length / 1024).toFixed(1)} KB) via ${conversionMethod}`);

        res.json({
            success: true,
            s3Key: outputKey,
            downloadUrl,
            size: pdfBuffer.length,
            conversionMethod,
        });
    } catch (err) {
        console.error('[CRM API] PDF conversion error:', err);
        res.status(500).json({ error: 'Failed to convert to PDF: ' + err.message });
    }
});

// ── POST /documents/upload ── Upload document to contact's S3 folder
crmRouter.post('/documents/upload', upload.single('file'), async (req, res) => {
    try {
        const { contact_id, category, name } = req.body;
        let fileBuffer, fileName, fileMimetype;

        // Accept file upload or base64-encoded content
        if (req.file) {
            fileBuffer = req.file.buffer;
            fileName = name || req.file.originalname;
            fileMimetype = req.file.mimetype;
        } else if (req.body.base64 && req.body.fileName) {
            fileBuffer = Buffer.from(req.body.base64, 'base64');
            fileName = req.body.fileName;
            fileMimetype = req.body.contentType || 'application/octet-stream';
        } else if (req.body.s3Key && req.body.fileName) {
            // Copy from existing S3 key
            const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: req.body.s3Key });
            const s3Response = await s3Client.send(getCmd);
            const chunks = [];
            for await (const chunk of s3Response.Body) { chunks.push(chunk); }
            fileBuffer = Buffer.concat(chunks);
            fileName = req.body.fileName;
            fileMimetype = s3Response.ContentType || 'application/octet-stream';
        } else {
            return res.status(400).json({ error: 'Provide file upload, base64+fileName, or s3Key+fileName' });
        }

        if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

        // Get contact name for folder
        const contactRes = await pool.query('SELECT first_name, last_name FROM contacts WHERE id = $1', [contact_id]);
        if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
        const { first_name, last_name } = contactRes.rows[0];

        const safeName = `${sanitizeNameForS3(first_name)}_${sanitizeNameForS3(last_name)}`;
        const docCategory = category || 'Other';
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);
        const sanitizedCategory = docCategory.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const folderPath = `${safeName}_${contact_id}/Documents/${sanitizedCategory}`;

        // Version check
        let s3FileName = `${baseName}${ext}`;
        const nameCheck = await pool.query(
            'SELECT name FROM documents WHERE contact_id = $1 AND name LIKE $2 AND category = $3',
            [contact_id, `${baseName}%${ext}`, docCategory]
        );
        if (nameCheck.rows.length > 0) {
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
            Body: fileBuffer,
            ContentType: fileMimetype,
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

        // Determine document type
        const extLower = ext.toLowerCase().replace('.', '');
        let docType = 'unknown';
        if (['pdf'].includes(extLower)) docType = 'pdf';
        else if (['doc', 'docx'].includes(extLower)) docType = 'docx';
        else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extLower)) docType = 'image';
        else if (['xls', 'xlsx', 'csv'].includes(extLower)) docType = 'spreadsheet';
        else if (['txt'].includes(extLower)) docType = 'txt';

        const { rows } = await pool.query(
            `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [contact_id, s3FileName, docType, docCategory, s3Url,
                `${(fileBuffer.length / 1024).toFixed(1)} KB`,
                [docCategory, 'Uploaded', `Original: ${fileName}`]]
        );

        crmEvents.emit('document.uploaded', { documentId: rows[0].id, contactId: parseInt(contact_id), data: rows[0] });
        console.log(`[CRM API] Uploaded "${s3FileName}" → "${key}" for contact ${contact_id}`);
        res.json({ success: true, document: rows[0], s3Key: key });
    } catch (err) {
        console.error('[CRM API] Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── PATCH /cases/:id/extended ── Update detailed claim fields (loan details, APR, charges, etc.)
crmRouter.patch('/cases/:id/extended', async (req, res) => {
    const { id } = req.params;

    const numericFields = [
        'apr', 'outstanding_balance', 'offer_made', 'fee_percent',
        'billed_finance_charges', 'credit_limit_increases',
        'total_refund', 'total_debt', 'client_fee', 'balance_due_to_client', 'our_fees_plus_vat',
        'our_fees_minus_vat', 'vat_amount', 'total_fee', 'outstanding_debt',
        'our_total_fee', 'fee_without_vat', 'vat', 'our_fee_net', 'number_of_loans',
        'claim_value', 'value_of_loan'
    ];

    const allowedFields = [
        'lender_other', 'finance_type', 'finance_type_other', 'finance_types', 'number_of_loans', 'loan_details',
        'lender_reference', 'dates_timeline', 'apr', 'outstanding_balance',
        'dsar_review', 'complaint_paragraph', 'offer_made', 'fee_percent', 'late_payment_charges',
        'billed_interest_charges', 'billed_finance_charges', 'overlimit_charges', 'credit_limit_increases',
        'total_refund', 'total_debt', 'client_fee', 'balance_due_to_client', 'our_fees_plus_vat',
        'our_fees_minus_vat', 'vat_amount', 'total_fee', 'outstanding_debt',
        'our_total_fee', 'fee_without_vat', 'vat', 'our_fee_net', 'spec_status', 'payment_plan',
        'account_number', 'start_date', 'end_date', 'value_of_loan', 'claim_value', 'product_type'
    ];

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${paramCount++}`);
                if (numericFields.includes(field) && req.body[field] === '') {
                    values.push(null);
                } else {
                    values.push(req.body[field]);
                }
            }
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const { rows } = await pool.query(
            `UPDATE cases SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Claim not found' });

        await pool.query(
            `INSERT INTO action_logs (client_id, claim_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [rows[0].contact_id, id, 'agent', 'openclaw', 'OpenClaw', 'claim_updated', 'claims', 'Updated claim extended details via CRM API']
        );

        crmEvents.emit('case.updated', { caseId: parseInt(id), contactId: rows[0].contact_id, data: rows[0] });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/notifications ── Get notifications for a contact
crmRouter.get('/contacts/:id/notifications', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM persistent_notifications
             WHERE contact_id = $1
             ORDER BY created_at DESC LIMIT 50`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /notifications ── Create notification
crmRouter.post('/notifications', async (req, res) => {
    const { type, title, message, link, contact_id, contact_name, user_id } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title are required' });

    try {
        const { rows } = await pool.query(
            `INSERT INTO persistent_notifications (user_id, type, title, message, link, contact_id, contact_name, is_read, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW()) RETURNING *`,
            [user_id || null, type, title, message || null, link || null, contact_id || null, contact_name || null]
        );
        res.json({ success: true, notification: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/active-workflow ── Get active workflow for a contact
crmRouter.get('/contacts/:id/active-workflow', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM workflow_triggers
             WHERE client_id = $1 AND status = 'active'
             ORDER BY triggered_at DESC LIMIT 1`,
            [req.params.id]
        );
        res.json({
            has_active_workflow: rows.length > 0,
            active_workflow: rows[0] || null
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /contacts/:id/active-workflow ── Update or cancel active workflow
crmRouter.patch('/contacts/:id/active-workflow', async (req, res) => {
    const { id } = req.params;
    const { status, current_step, next_action_at, next_action_description, cancelled_by, metadata } = req.body;

    try {
        // Find the active workflow for this contact
        const active = await pool.query(
            `SELECT * FROM workflow_triggers WHERE client_id = $1 AND status = 'active' ORDER BY triggered_at DESC LIMIT 1`,
            [id]
        );
        if (active.rows.length === 0) return res.status(404).json({ error: 'No active workflow found for this contact' });

        const workflowId = active.rows[0].id;
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
            if (status === 'cancelled') {
                updates.push(`cancelled_at = NOW()`);
                updates.push(`cancelled_by = $${paramCount++}`);
                values.push(cancelled_by || 'openclaw');
            }
            if (status === 'completed') {
                updates.push(`completed_at = NOW()`);
            }
        }
        if (current_step !== undefined) { updates.push(`current_step = $${paramCount++}`); values.push(current_step); }
        if (next_action_at !== undefined) { updates.push(`next_action_at = $${paramCount++}`); values.push(next_action_at); }
        if (next_action_description !== undefined) { updates.push(`next_action_description = $${paramCount++}`); values.push(next_action_description); }
        if (metadata !== undefined) {
            updates.push(`metadata = $${paramCount++}`);
            values.push(typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(workflowId);
        const { rows } = await pool.query(
            `UPDATE workflow_triggers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, 'agent', 'openclaw', 'OpenClaw', 'workflow_updated', 'workflow',
                `Updated active workflow: ${rows[0].workflow_name || rows[0].workflow_type} → ${status || 'step ' + current_step}`]
        );

        crmEvents.emit('contact.updated', { contactId: parseInt(id), data: rows[0] });
        res.json({ success: true, workflow: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/workflow-queue ── Get queued (pending) workflows for a contact
crmRouter.get('/contacts/:id/workflow-queue', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM workflow_triggers
             WHERE client_id = $1
             ORDER BY
                CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 WHEN 'cancelled' THEN 3 END,
                triggered_at DESC`,
            [req.params.id]
        );
        const active = rows.find(r => r.status === 'active') || null;
        const queued = rows.filter(r => r.status === 'pending');
        const history = rows.filter(r => r.status === 'completed' || r.status === 'cancelled');
        res.json({ active_workflow: active, queued_workflows: queued, workflow_history: history, total: rows.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /contacts/:id/workflow-queue ── Add, reorder, or remove queued workflows
crmRouter.patch('/contacts/:id/workflow-queue', async (req, res) => {
    const { id } = req.params;
    const { action, workflow_id, workflow_type, workflow_name, triggered_by, total_steps, metadata } = req.body;

    try {
        if (action === 'add' || action === 'queue') {
            // Queue a new workflow as 'pending'
            if (!workflow_type) return res.status(400).json({ error: 'workflow_type is required' });
            const { rows } = await pool.query(
                `INSERT INTO workflow_triggers (client_id, workflow_type, workflow_name, triggered_by, status, total_steps, metadata)
                 VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
                [id, workflow_type, workflow_name || workflow_type, triggered_by || 'openclaw', total_steps || 4,
                    metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null]
            );
            await pool.query(
                `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, 'agent', 'openclaw', 'OpenClaw', 'workflow_queued', 'workflow', `Queued workflow: ${workflow_type}`]
            );
            return res.json({ success: true, action: 'queued', workflow: rows[0] });
        }

        if (action === 'promote') {
            // Promote a pending workflow to active (cancel current active first)
            if (!workflow_id) return res.status(400).json({ error: 'workflow_id is required for promote' });
            await pool.query(
                `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'openclaw'
                 WHERE client_id = $1 AND status = 'active'`, [id]
            );
            const nextActionAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
            const { rows } = await pool.query(
                `UPDATE workflow_triggers SET status = 'active', triggered_at = NOW(), next_action_at = $1
                 WHERE id = $2 AND client_id = $3 RETURNING *`,
                [nextActionAt, workflow_id, id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Workflow not found' });
            return res.json({ success: true, action: 'promoted', workflow: rows[0] });
        }

        if (action === 'remove' || action === 'cancel') {
            if (!workflow_id) return res.status(400).json({ error: 'workflow_id is required for remove' });
            const { rows } = await pool.query(
                `UPDATE workflow_triggers SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1
                 WHERE id = $2 AND client_id = $3 RETURNING *`,
                [triggered_by || 'openclaw', workflow_id, id]
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Workflow not found' });
            return res.json({ success: true, action: 'removed', workflow: rows[0] });
        }

        res.status(400).json({ error: 'Invalid action. Use: add, queue, promote, remove, cancel' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts/:id/conversation-history ── Get conversation history (communications + notes)
crmRouter.get('/contacts/:id/conversation-history', async (req, res) => {
    const { id } = req.params;
    const { channel, limit: queryLimit, offset: queryOffset } = req.query;

    try {
        const limitVal = Math.min(parseInt(queryLimit) || 50, 200);
        const offsetVal = parseInt(queryOffset) || 0;

        // Build communications subquery — $1 is always contact id
        let commQuery = `SELECT id, channel, direction, subject, content, agent_id, agent_name, timestamp, 'communication' as source
                         FROM communications WHERE client_id = $1`;
        const params = [id];
        let paramIdx = 2;

        if (channel) {
            commQuery += ` AND channel = $${paramIdx++}`;
            params.push(channel);
        }

        // Notes subquery reuses $1 for the same contact id
        const notesQuery = `SELECT id, 'note' as channel, 'internal' as direction, NULL as subject, content, created_by as agent_id, created_by_name as agent_name, created_at as timestamp, 'note' as source
                            FROM notes WHERE client_id = $1`;

        const limitParam = paramIdx++;
        const offsetParam = paramIdx++;
        params.push(limitVal, offsetVal);

        const combinedQuery = `
            SELECT * FROM (
                (${commQuery})
                UNION ALL
                (${notesQuery})
            ) combined
            ORDER BY timestamp DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}`;

        const { rows } = await pool.query(combinedQuery, params);

        // Get total count
        const countResult = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM communications WHERE client_id = $1) +
                (SELECT COUNT(*) FROM notes WHERE client_id = $1) as total`,
            [id]
        );

        res.json({
            conversation_history: rows,
            total: parseInt(countResult.rows[0].total),
            limit: limitVal,
            offset: offsetVal
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /contacts/:id/address-lookup ── Lookup UK address by postcode
crmRouter.post('/contacts/:id/address-lookup', async (req, res) => {
    const { postcode } = req.body;
    if (!postcode) return res.status(400).json({ error: 'postcode is required' });

    try {
        // Use free postcodes.io API (no API key needed)
        const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
        const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`);
        const data = await response.json();

        if (data.status !== 200 || !data.result) {
            return res.status(404).json({ error: 'Postcode not found', postcode: cleanPostcode });
        }

        const result = data.result;
        const address = {
            postcode: result.postcode,
            city: result.admin_district || result.parish || '',
            county: result.admin_county || result.region || '',
            country: result.country,
            latitude: result.latitude,
            longitude: result.longitude,
            ward: result.admin_ward || '',
            district: result.admin_district || ''
        };

        res.json({ success: true, address });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /templates/email ── List all available email templates
crmRouter.get('/templates/email', async (req, res) => {
    try {
        // Get DB templates
        const { rows } = await pool.query(
            `SELECT template_type, name, variables, updated_at, updated_by FROM html_templates ORDER BY template_type`
        );

        // Get file-based templates
        const path = await import('path');
        const fs = await import('fs');
        const fileTemplates = [
            { type: 'LOA', name: 'Letter of Authority', file: 'loa-template.html' },
            { type: 'COVER_LETTER', name: 'Cover Letter', file: 'cover-letter-template.html' },
        ];
        const available = [];

        // Add DB templates
        for (const row of rows) {
            available.push({ template_type: row.template_type, name: row.name, source: 'database', updated_at: row.updated_at });
        }

        // Add file templates (if not already in DB)
        const dbTypes = rows.map(r => r.template_type);
        for (const ft of fileTemplates) {
            if (!dbTypes.includes(ft.type)) {
                const templatePath = path.join(process.cwd(), 'templates', ft.file);
                try { fs.accessSync(templatePath); available.push({ template_type: ft.type, name: ft.name, source: 'file', updated_at: null }); } catch { }
            }
        }

        res.json({ success: true, templates: available });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /templates/email/:type ── Get email template by type
crmRouter.get('/templates/email/:type', async (req, res) => {
    const rawType = req.params.type.toUpperCase();

    // Alias map: normalise common alternative names to canonical types
    const aliasMap = {
        'LOA': 'LOA',
        'LETTER_OF_AUTHORITY': 'LOA',
        'LOA_COVER': 'LOA',
        'COVER_LETTER': 'COVER_LETTER',
        'COVER': 'COVER_LETTER',
        'COVERLETTER': 'COVER_LETTER',
        'DSAR': 'DSAR',
        'DSAR_REQUEST': 'DSAR',
        'FOLLOW_UP': 'FOLLOW_UP',
        'FOLLOWUP': 'FOLLOW_UP',
        'WELCOME': 'WELCOME',
        'ONBOARDING': 'WELCOME',
        'COMPLAINT': 'COMPLAINT',
        'FOS_COMPLAINT': 'COMPLAINT',
    };

    const type = aliasMap[rawType] || rawType;

    try {
        // First check html_templates table in DB
        const { rows } = await pool.query(
            `SELECT template_type, name, html_content, variables, updated_at, updated_by
             FROM html_templates WHERE template_type = $1`,
            [type]
        );

        if (rows.length > 0) {
            return res.json({ success: true, template: rows[0] });
        }

        // Fallback: check for file-based templates
        const path = await import('path');
        const fs = await import('fs');
        const templateMap = {
            'LOA': 'loa-template.html',
            'COVER_LETTER': 'cover-letter-template.html',
        };

        const fileName = templateMap[type];
        if (fileName) {
            const templatePath = path.join(process.cwd(), 'templates', fileName);
            try {
                const htmlContent = fs.readFileSync(templatePath, 'utf-8');
                return res.json({
                    success: true,
                    template: {
                        template_type: type,
                        name: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        html_content: htmlContent,
                        variables: '{{clientFullName}}, {{clientAddress}}, {{clientPostcode}}, {{clientDOB}}, {{clientEmail}}, {{lenderName}}, {{lenderAddress}}, {{signatureImage}}, {{today}}',
                        updated_at: null,
                        updated_by: 'system',
                        isDefault: true
                    }
                });
            } catch (fileErr) { /* file not found, fall through */ }
        }

        // List what IS available so the caller knows
        const allDB = await pool.query(`SELECT template_type FROM html_templates`);
        const availableTypes = [...new Set([...allDB.rows.map(r => r.template_type), 'LOA', 'COVER_LETTER'])];
        res.status(404).json({
            error: `Email template '${rawType}' not found (resolved to '${type}')`,
            available_types: availableTypes
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /cases/:id/extended ── Get case with all extended fields
crmRouter.get('/cases/:id/extended', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT c.*,
                    ct.first_name as contact_first_name, ct.last_name as contact_last_name,
                    ct.full_name as contact_full_name, ct.email as contact_email,
                    ct.phone as contact_phone, ct.client_id as contact_client_id
             FROM cases c
             LEFT JOIN contacts ct ON c.contact_id = ct.id
             WHERE c.id = $1`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Claim not found' });

        const caseData = rows[0];

        // Also fetch related documents
        const docs = await pool.query(
            `SELECT id, name, type, category, url, document_status, created_at
             FROM documents WHERE contact_id = $1
             ORDER BY created_at DESC`,
            [caseData.contact_id]
        );

        // Fetch DSAR info
        const dsarInfo = {
            loa_generated: caseData.loa_generated || false,
            dsar_sent: caseData.dsar_sent || false,
            dsar_sent_at: caseData.dsar_sent_at || null,
            dsar_send_after: caseData.dsar_send_after || null,
            dsar_overdue_notified: caseData.dsar_overdue_notified || false
        };

        res.json({
            ...caseData,
            dsar_info: dsarInfo,
            documents: docs.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /documents/extract-text ── Extract readable text from a document in S3
// Query params: s3_key=<encoded S3 object key>
// Supports: PDF (pdfjs), DOCX/DOC (mammoth), TXT, HTML
// Designed for AI / bot consumption (OpenClaw etc.)
crmRouter.get('/documents/extract-text', async (req, res) => {
    try {
        const s3Key = req.query.s3_key;
        if (!s3Key) return res.status(400).json({ error: 'Missing s3_key query parameter' });

        // Fetch raw bytes from S3
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
        let s3Obj;
        try {
            s3Obj = await s3Client.send(getCmd);
        } catch (e) {
            return res.status(404).json({ error: 'Document not found in S3', s3_key: s3Key });
        }

        // Stream → Buffer
        const chunks = [];
        for await (const chunk of s3Obj.Body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const fileName = s3Key.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const MAX_CHARS = 100000; // ~100KB of text is plenty for an AI

        let text = '';
        let pageCount = null;
        let method = '';

        if (ext === 'pdf') {
            // PDF text extraction via pdfjs-dist
            const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const loadingTask = getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
            const pdfDoc = await loadingTask.promise;
            pageCount = pdfDoc.numPages;
            const pageTexts = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
                pageTexts.push(`[Page ${i}]\n${pageText}`);
            }
            text = pageTexts.join('\n\n');
            method = 'pdfjs';

        } else if (ext === 'docx' || ext === 'doc') {
            // DOCX text extraction via mammoth
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
            method = 'mammoth';

        } else if (ext === 'txt') {
            text = buffer.toString('utf8');
            method = 'raw';

        } else if (ext === 'html' || ext === 'htm') {
            // Strip HTML tags for plain text
            text = buffer.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            method = 'html-strip';

        } else {
            return res.status(415).json({
                error: `Unsupported file type: .${ext}`,
                supported: ['pdf', 'docx', 'doc', 'txt', 'html']
            });
        }

        const truncated = text.length > MAX_CHARS;
        if (truncated) text = text.slice(0, MAX_CHARS);

        res.json({
            file_name: fileName,
            s3_key: s3Key,
            file_type: ext,
            method,
            pages: pageCount,
            char_count: text.length,
            word_count: text.split(/\s+/).filter(Boolean).length,
            truncated,
            text
        });
    } catch (err) {
        console.error('[extract-text] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /audit/documents?page=1&page_size=100 ──────────────────────────────────
// Batch audit endpoint for OpenClaw. Returns one page of contacts with their
// document counts (DB) + S3 folder existence — without downloading anything.
// Replaces 2,581 individual /contacts/:id/documents calls with ~26 paginated ones.
// Query params:
//   page       – 1-based page number (default 1)
//   page_size  – contacts per page (default 100, max 200)
// ────────────────────────────────────────────────────────────────────────────────
crmRouter.get('/audit/documents', async (req, res) => {
    try {
        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(req.query.page_size) || 100));
        const offset = (page - 1) * pageSize;

        // 1. Get total count + current page of contacts
        const countRes = await pool.query('SELECT COUNT(*) FROM contacts');
        const total = parseInt(countRes.rows[0].count);

        const contactsRes = await pool.query(
            `SELECT id, first_name, last_name, full_name, email, client_id
             FROM contacts ORDER BY id ASC LIMIT $1 OFFSET $2`,
            [pageSize, offset]
        );
        const contacts = contactsRes.rows;
        if (contacts.length === 0) return res.json({ page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), results: [] });

        // 2. DB document counts in one query
        const ids = contacts.map(c => c.id);
        const docCountRes = await pool.query(
            `SELECT contact_id, COUNT(*) AS count FROM documents WHERE contact_id = ANY($1) GROUP BY contact_id`,
            [ids]
        );
        const dbDocCounts = {};
        for (const row of docCountRes.rows) dbDocCounts[row.contact_id] = parseInt(row.count);

        // 3. S3 existence check — run in parallel with concurrency cap of 20
        async function checkS3Folder(contact) {
            const candidates = [
                `${contact.first_name}_${contact.last_name}_${contact.id}/`,
                `${(contact.full_name || '').replace(/\s+/g, '_')}_${contact.id}/`,
            ].filter(Boolean);
            for (const prefix of candidates) {
                try {
                    const probe = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix, MaxKeys: 1 }));
                    if (probe.Contents && probe.Contents.length > 0) return { has_s3_folder: true, s3_prefix: prefix };
                } catch (_) { /* timeout — treat as unknown */ }
            }
            return { has_s3_folder: false, s3_prefix: null };
        }

        const CONCURRENCY = 20;
        const s3Results = new Array(contacts.length);
        for (let i = 0; i < contacts.length; i += CONCURRENCY) {
            const batch = contacts.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(batch.map(c => checkS3Folder(c)));
            settled.forEach((r, j) => {
                s3Results[i + j] = r.status === 'fulfilled' ? r.value : { has_s3_folder: false, s3_prefix: null };
            });
        }

        const results = contacts.map((c, i) => ({
            contact_id: c.id,
            client_id: c.client_id,
            name: c.full_name || `${c.first_name} ${c.last_name}`,
            email: c.email,
            db_doc_count: dbDocCounts[c.id] || 0,
            has_s3_folder: s3Results[i].has_s3_folder,
            s3_prefix: s3Results[i].s3_prefix,
        }));

        res.json({
            page,
            page_size: pageSize,
            total,
            total_pages: Math.ceil(total / pageSize),
            results,
        });
    } catch (err) {
        console.error('[audit/documents]', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /admin/sync-all-checklists ── Bulk recompute checklist for ALL contacts from DB docs
// Uses a single UPDATE…FROM (VALUES …) statement — no per-row round-trips to RDS.
crmRouter.post('/admin/sync-all-checklists', async (req, res) => {
    try {
        const contactsRes = await pool.query('SELECT id, extra_lenders FROM contacts');
        const contacts = contactsRes.rows;
        const docsRes = await pool.query('SELECT contact_id, name, category, created_at FROM documents');

        // Group docs by contact in JS
        const docsByContact = {};
        for (const d of docsRes.rows) {
            if (!docsByContact[d.contact_id]) docsByContact[d.contact_id] = [];
            docsByContact[d.contact_id].push(d);
        }

        // Compute all checklists in memory, then batch-update with a single SQL call
        const ids = [], checklists = [];
        for (const c of contacts) {
            ids.push(c.id);
            checklists.push(JSON.stringify(computeChecklist(docsByContact[c.id] || [], c.extra_lenders)));
        }

        if (ids.length > 0) {
            // Build: UPDATE contacts SET document_checklist = v.cl::jsonb
            //        FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS cl) v
            //        WHERE contacts.id = v.id
            await pool.query(
                `UPDATE contacts SET document_checklist = v.cl::jsonb
                 FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS cl) v
                 WHERE contacts.id = v.id`,
                [ids, checklists]
            );
        }

        res.json({ message: `Synced checklists for ${ids.length} contacts` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /merge-fields ── List all merge fields (built-in + custom)
crmRouter.get('/merge-fields', async (req, res) => {
    try {
        // Built-in fields from OO_MERGE_FIELDS constant
        const builtInGroups = [
            {
                group: 'Client',
                fields: [
                    { key: 'client.fullName', label: 'Full Name' },
                    { key: 'client.firstName', label: 'First Name' },
                    { key: 'client.lastName', label: 'Last Name' },
                    { key: 'client.email', label: 'Email' },
                    { key: 'client.phone', label: 'Phone' },
                    { key: 'client.address', label: 'Address' },
                    { key: 'client.dateOfBirth', label: 'Date of Birth' },
                ],
            },
            {
                group: 'Claim',
                fields: [
                    { key: 'claim.lender', label: 'Lender' },
                    { key: 'claim.clientId', label: 'Client ID' },
                    { key: 'claim.caseRef', label: 'Case Reference' },
                    { key: 'claim.claimValue', label: 'Claim Value' },
                ],
            },
            {
                group: 'Lender',
                fields: [
                    { key: 'lender.companyName', label: 'Lender Company Name' },
                    { key: 'lender.address', label: 'Lender Address' },
                    { key: 'lender.city', label: 'Lender City' },
                    { key: 'lender.postcode', label: 'Lender Postcode' },
                    { key: 'lender.email', label: 'Lender Email' },
                ],
            },
            {
                group: 'Firm',
                fields: [
                    { key: 'firm.name', label: 'Firm Name' },
                    { key: 'firm.tradingName', label: 'Trading Name' },
                    { key: 'firm.address', label: 'Firm Address' },
                    { key: 'firm.phone', label: 'Firm Phone' },
                    { key: 'firm.sraNumber', label: 'SRA Number' },
                    { key: 'firm.entity', label: 'Firm Entity' },
                    { key: 'firm.companyNumber', label: 'Company Number' },
                ],
            },
            {
                group: 'System',
                fields: [
                    { key: 'system.today', label: "Today's Date" },
                    { key: 'system.year', label: 'Current Year' },
                ],
            },
        ];

        // Fetch custom fields from DB
        const { rows: customFields } = await pool.query(
            'SELECT id, field_key, label, group_name, default_value, description FROM custom_merge_fields WHERE is_active = TRUE ORDER BY group_name, label'
        );

        // Group custom fields by group_name
        const customGroupMap = {};
        for (const f of customFields) {
            if (!customGroupMap[f.group_name]) customGroupMap[f.group_name] = [];
            customGroupMap[f.group_name].push({
                id: f.id,
                key: f.field_key,
                label: f.label,
                defaultValue: f.default_value || '',
                description: f.description || '',
                custom: true,
            });
        }
        const customGroups = Object.entries(customGroupMap).map(([group, fields]) => ({
            group,
            fields,
            custom: true,
        }));

        res.json({
            success: true,
            builtIn: builtInGroups,
            custom: customGroups,
            all: [...builtInGroups, ...customGroups],
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /merge-fields ── Create a new custom merge field
crmRouter.post('/merge-fields', async (req, res) => {
    const { key, label, group, defaultValue, description } = req.body;
    if (!key || !label) return res.status(400).json({ error: 'key and label are required' });

    // Validate key format (alphanumeric with dots, no spaces)
    if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(key)) {
        return res.status(400).json({ error: 'key must start with a letter and contain only letters, numbers, dots, and underscores' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO custom_merge_fields (field_key, label, group_name, default_value, description, created_by)
             VALUES ($1, $2, $3, $4, $5, 'openclaw')
             ON CONFLICT (field_key) DO UPDATE SET
                label = EXCLUDED.label,
                group_name = EXCLUDED.group_name,
                default_value = EXCLUDED.default_value,
                description = EXCLUDED.description,
                is_active = TRUE,
                updated_at = NOW()
             RETURNING *`,
            [key, label, group || 'Custom', defaultValue || null, description || null]
        );
        res.json({ success: true, field: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /merge-fields/bulk ── Create multiple custom merge fields at once
crmRouter.post('/merge-fields/bulk', async (req, res) => {
    const { fields } = req.body;
    if (!Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({ error: 'fields array is required' });
    }

    try {
        const created = [];
        for (const f of fields) {
            if (!f.key || !f.label) continue;
            if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(f.key)) continue;
            const { rows } = await pool.query(
                `INSERT INTO custom_merge_fields (field_key, label, group_name, default_value, description, created_by)
                 VALUES ($1, $2, $3, $4, $5, 'openclaw')
                 ON CONFLICT (field_key) DO UPDATE SET
                    label = EXCLUDED.label,
                    group_name = EXCLUDED.group_name,
                    default_value = EXCLUDED.default_value,
                    description = EXCLUDED.description,
                    is_active = TRUE,
                    updated_at = NOW()
                 RETURNING *`,
                [f.key, f.label, f.group || 'Custom', f.defaultValue || null, f.description || null]
            );
            created.push(rows[0]);
        }
        res.json({ success: true, fields: created, count: created.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NOTE: Delete endpoints for merge fields are intentionally NOT exposed to the external CRM API (OpenClaw/Nova).
// Only the internal UI at /api/oo/merge-fields/:id can delete custom fields.

// ── POST /templates/:id/insert-variable ── Insert a {{variable}} into a template DOCX
// Appends or inserts the variable placeholder into the template's Word document
crmRouter.post('/templates/:id/insert-variable', async (req, res) => {
    const { variable, position, afterText } = req.body;
    // variable: the field key e.g. "client.fullName" (will be wrapped in {{ }})
    // position: "end" (default) | "start" | "after"
    // afterText: if position="after", insert after this text occurrence

    if (!variable) return res.status(400).json({ error: 'variable is required' });

    try {
        // Get the template
        const tplResult = await pool.query(
            'SELECT id, s3_key, variable_fields FROM oo_templates WHERE id = $1 AND is_active = TRUE',
            [req.params.id]
        );
        if (tplResult.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
        const template = tplResult.rows[0];

        // Download template DOCX from S3
        const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: template.s3_key });
        const s3Response = await s3Client.send(getCmd);
        const chunks = [];
        for await (const chunk of s3Response.Body) { chunks.push(chunk); }
        const templateBuffer = Buffer.concat(chunks);

        // Parse DOCX and insert the variable placeholder
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(templateBuffer);
        const docXml = await zip.file('word/document.xml')?.async('string');
        if (!docXml) return res.status(500).json({ error: 'Could not read document.xml from template' });

        const variableTag = `{{${variable}}}`;
        let modifiedXml = docXml;

        if (position === 'start') {
            // Insert after the first <w:body> opening tag
            modifiedXml = docXml.replace(
                /(<w:body>)/,
                `$1<w:p><w:r><w:t>${variableTag}</w:t></w:r></w:p>`
            );
        } else if (position === 'after' && afterText) {
            // Find the text and insert a new paragraph with the variable after it
            // We search for the text in <w:t> elements
            const escapedText = afterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(<w:t[^>]*>${escapedText}</w:t></w:r></w:p>)`);
            if (regex.test(modifiedXml)) {
                modifiedXml = modifiedXml.replace(
                    regex,
                    `$1<w:p><w:r><w:t>${variableTag}</w:t></w:r></w:p>`
                );
            } else {
                // Fallback: try simpler text match across split XML tags
                const textInXml = afterText.replace(/[<>&]/g, '');
                if (modifiedXml.includes(textInXml)) {
                    const idx = modifiedXml.indexOf(textInXml);
                    // Find the next </w:p> after the text
                    const pClose = modifiedXml.indexOf('</w:p>', idx);
                    if (pClose !== -1) {
                        const insertPoint = pClose + '</w:p>'.length;
                        modifiedXml = modifiedXml.slice(0, insertPoint) +
                            `<w:p><w:r><w:t>${variableTag}</w:t></w:r></w:p>` +
                            modifiedXml.slice(insertPoint);
                    }
                }
            }
        } else {
            // Default: insert at end (before </w:body>)
            modifiedXml = docXml.replace(
                /(<\/w:body>)/,
                `<w:p><w:r><w:t>${variableTag}</w:t></w:r></w:p>$1`
            );
        }

        // Save the modified DOCX
        zip.file('word/document.xml', modifiedXml);
        const newBuffer = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

        // Upload back to S3
        await uploadS3Buffer(template.s3_key, newBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        // Update local cache
        if (typeof ooSaveLocal === 'function') ooSaveLocal(template.s3_key, newBuffer);

        // Re-extract merge fields and update DB
        const mergeFields = extractMergeFields(newBuffer);
        await pool.query(
            'UPDATE oo_templates SET variable_fields = $1, updated_at = NOW() WHERE id = $2',
            [JSON.stringify(mergeFields), req.params.id]
        );

        console.log(`[CRM API] Inserted variable {{${variable}}} into template ${template.s3_key} at position=${position || 'end'}`);

        res.json({
            success: true,
            variable: variableTag,
            position: position || 'end',
            templateId: parseInt(req.params.id),
            mergeFields,
        });
    } catch (err) {
        console.error('[CRM API] Insert variable error:', err);
        res.status(500).json({ error: 'Failed to insert variable: ' + err.message });
    }
});

// ── GET /templates/:id/merge-fields ── Get merge fields for a specific template
crmRouter.get('/templates/:id/merge-fields', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, variable_fields FROM oo_templates WHERE id = $1 AND is_active = TRUE',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
        const row = result.rows[0];

        // Also fetch custom fields
        const { rows: customFields } = await pool.query(
            'SELECT field_key, label, group_name, default_value FROM custom_merge_fields WHERE is_active = TRUE ORDER BY group_name, label'
        );

        res.json({
            success: true,
            templateId: row.id,
            templateName: row.name,
            templateFields: row.variable_fields || [],
            customFields: customFields.map(f => ({
                key: f.field_key,
                label: f.label,
                group: f.group_name,
                defaultValue: f.default_value,
            })),
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /contacts ── List/filter contacts (for Nova chase timer)
crmRouter.get('/contacts', async (req, res) => {
    const { id_chase_active, id_chase_stage, id_chase_channel, bot_paused,
            limit: queryLimit, offset: queryOffset } = req.query;

    try {
        const limitVal = Math.min(parseInt(queryLimit) || 100, 500);
        const offsetVal = parseInt(queryOffset) || 0;
        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (id_chase_active !== undefined) {
            conditions.push(`id_chase_active = $${paramIdx++}`);
            params.push(id_chase_active === 'true');
        }
        if (id_chase_stage) {
            conditions.push(`id_chase_stage = $${paramIdx++}`);
            params.push(id_chase_stage);
        }
        if (id_chase_channel) {
            conditions.push(`id_chase_channel = $${paramIdx++}`);
            params.push(id_chase_channel);
        }
        if (bot_paused !== undefined) {
            conditions.push(`bot_paused = $${paramIdx++}`);
            params.push(bot_paused === 'true');
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [contactsResult, countResult] = await Promise.all([
            pool.query(
                `SELECT * FROM contacts ${whereClause} ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
                [...params, limitVal, offsetVal]
            ),
            pool.query(
                `SELECT COUNT(*) as total FROM contacts ${whereClause}`,
                params
            )
        ]);

        res.json({
            contacts: contactsResult.rows,
            total: parseInt(countResult.rows[0].total),
            limit: limitVal,
            offset: offsetVal
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /workflows/id-chase/trigger ── Proxy trigger to Windmill
crmRouter.post('/workflows/id-chase/trigger', async (req, res) => {
    const { contact_id } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    try {
        const windmillUrl = 'https://flowmill.fastactionclaims.com/api/w/admins/jobs/run/p/f/crm/sw1_id_chase_trigger';
        const response = await fetch(windmillUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer HT6hP5T8dDOIS2HF0pvDCtzoJHs05iUQ'
            },
            body: JSON.stringify({ contact_id })
        });
        const result = await response.text();
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contact_id, 'agent', 'crm', 'CRM System', 'id_chase_triggered', 'workflow', 'ID chase workflow triggered']
        );
        res.json({ success: true, job_id: result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/nova/trigger-chase ── Internal endpoint for frontend to trigger Nova ID chase
app.post('/api/nova/trigger-chase', async (req, res) => {
    const { contact_id } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    try {
        const windmillUrl = 'https://flowmill.fastactionclaims.com/api/w/admins/jobs/run/p/f/crm/sw1_id_chase_trigger';
        const response = await fetch(windmillUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer HT6hP5T8dDOIS2HF0pvDCtzoJHs05iUQ'
            },
            body: JSON.stringify({ contact_id })
        });
        const result = await response.text();

        // Update contact chase state
        await pool.query(
            `UPDATE contacts SET id_chase_active = true, id_chase_stage = 'initial_sent',
             id_chase_started_at = NOW(), id_chase_last_action_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [contact_id]
        );

        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, actor_name, action_type, action_category, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [contact_id, 'agent', 'crm', 'CRM System', 'id_chase_triggered', 'workflow', 'ID chase workflow triggered via Nova']
        );

        res.json({ success: true, job_id: result });
    } catch (err) {
        console.error('[Nova Trigger] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// Twilio Webhook Endpoints (NO API key auth — Twilio can't send one)
// Mounted OUTSIDE crmRouter but still under /api/crm path via separate route
// ============================================================================

// ── POST /api/crm-webhooks/twilio/inbound ── Receive inbound Twilio messages
app.post('/api/crm-webhooks/twilio/inbound', async (req, res) => {
    try {
        const { From, To, Body, MessageSid, NumMedia, MediaUrl0, MediaContentType0, SmsStatus } = req.body;

        // Look up contact by phone number (strip whatsapp: prefix)
        const phoneNumber = (From || '').replace('whatsapp:', '').trim();
        let contactId = null;
        if (phoneNumber) {
            const contactRes = await pool.query(
                `SELECT id FROM contacts WHERE phone LIKE $1 OR phone LIKE $2 LIMIT 1`,
                [`%${phoneNumber.slice(-10)}%`, `%${phoneNumber}%`]
            );
            if (contactRes.rows.length > 0) contactId = contactRes.rows[0].id;
        }

        // Determine channel type
        const isWhatsApp = (From || '').startsWith('whatsapp:') || (To || '').startsWith('whatsapp:');
        const commType = isWhatsApp ? 'whatsapp' : 'sms';

        // Log to communications table
        if (contactId) {
            await pool.query(
                `INSERT INTO communications (client_id, channel, type, direction, content,
                    "from", "to", media_url, media_type, twilio_sid, status, sent_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [contactId, commType, commType, 'inbound', Body || null,
                    From || null, To || null,
                    parseInt(NumMedia) > 0 ? MediaUrl0 : null,
                    parseInt(NumMedia) > 0 ? MediaContentType0 : null,
                    MessageSid || null, SmsStatus || 'received', 'bot']
            );

            // Log to action_logs
            logAction({
                clientId: contactId,
                actionType: `inbound_${commType}`,
                actionCategory: 'communication',
                description: `Inbound ${commType} received from ${phoneNumber}`,
                metadata: { from: From, to: To, body: (Body || '').substring(0, 200), twilio_sid: MessageSid, channel: commType }
            });

            // Update chase last_client_at timestamp
            await pool.query(
                `UPDATE contacts SET id_chase_last_client_at = NOW(), updated_at = NOW()
                 WHERE id = $1 AND id_chase_active = true`,
                [contactId]
            );
        }

        // Forward to Windmill for Nova processing
        const windmillUrl = 'https://flowmill.fastactionclaims.com/api/w/admins/jobs/run_wait_result/p/f/crm/sw1_id_chase_webhook';
        fetch(windmillUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer HT6hP5T8dDOIS2HF0pvDCtzoJHs05iUQ'
            },
            body: JSON.stringify({
                From, To, Body, MessageSid, NumMedia,
                MediaUrl0: parseInt(NumMedia) > 0 ? MediaUrl0 : null,
                MediaContentType0: parseInt(NumMedia) > 0 ? MediaContentType0 : null,
                contact_id: contactId
            })
        }).catch(err => console.error('[Twilio Webhook] Windmill forward error:', err.message));

        // Return empty TwiML response to Twilio
        res.type('text/xml').send('<Response></Response>');
    } catch (err) {
        console.error('[Twilio Webhook] Inbound error:', err);
        res.type('text/xml').send('<Response></Response>');
    }
});

// ── POST /api/crm-webhooks/twilio/status ── Delivery status callbacks
app.post('/api/crm-webhooks/twilio/status', async (req, res) => {
    try {
        const { MessageSid, MessageStatus } = req.body;
        if (MessageSid && MessageStatus) {
            await pool.query(
                `UPDATE communications SET status = $1 WHERE twilio_sid = $2`,
                [MessageStatus, MessageSid]
            );
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('[Twilio Status] Error:', err);
        res.sendStatus(200);
    }
});

// Mount the CRM API router BEFORE the Windmill catch-all proxy
app.use('/api/crm', crmRouter);
console.log('CRM External API mounted at /api/crm/* (secured with CRM_API_KEY)');

// Mount Marketing module routes
app.use('/api/marketing', marketingRouter);
console.log('Marketing module mounted at /api/marketing/*');

// ============================================
// TASK WORK MODULE (Management only) - Claims-based
// ============================================

// Helper: date filter for task work queries
function twDateFilter(period, alias = 'al') {
    switch (period) {
        case 'day': return `AND ${alias}.timestamp >= CURRENT_DATE`;
        case 'week': return `AND ${alias}.timestamp >= date_trunc('week', CURRENT_DATE)`;
        case 'month': return `AND ${alias}.timestamp >= date_trunc('month', CURRENT_DATE)`;
        case 'year': return `AND ${alias}.timestamp >= date_trunc('year', CURRENT_DATE)`;
        default: return `AND ${alias}.timestamp >= date_trunc('week', CURRENT_DATE)`;
    }
}

// ============================================
// USER ACTIVITY HEARTBEAT
// ============================================
// Called by the frontend every 30 seconds when user has mouse/keyboard activity
app.post('/api/heartbeat', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        // Check if user was offline (last_active_at > 3 minutes ago) — record the offline period
        const { rows } = await pool.query(
            `SELECT last_active_at, last_login FROM users WHERE id = $1`, [userId]
        );
        if (rows.length > 0) {
            const lastActive = rows[0].last_active_at || rows[0].last_login;
            if (lastActive) {
                const gapMs = Date.now() - new Date(lastActive).getTime();
                const gapMinutes = gapMs / 60000;
                // If offline for more than 3 minutes, record the offline period
                if (gapMinutes > 3) {
                    await pool.query(
                        `INSERT INTO offline_periods (user_id, offline_start, online_at, duration_minutes)
                         VALUES ($1, $2, NOW(), $3)`,
                        [userId, lastActive, Math.round(gapMinutes * 100) / 100]
                    );
                }
            }
        }

        await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Heartbeat error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// TIME WASTAGE TRACKING
// ============================================
// Working hours IST: 13:30-18:30 (shift 1) + 19:15-22:30 (shift 2)
// Break: 18:30-19:15 IST (45 min dinner) — NOT counted as wastage
// Includes LIVE ongoing wastage for currently-offline agents

// Shared SQL CTEs for wastage calculation (used by both time-wastage and agent-status endpoints)
// NOTE: offline_start, online_at, last_active_at are TIMESTAMP (stored in UTC).
// Must use "col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'" to correctly convert UTC→IST.
// NOW() is TIMESTAMPTZ so "NOW() AT TIME ZONE 'Asia/Kolkata'" works directly.
function buildWastageCTEs() {
    return `
    -- Recorded offline periods from this month with shift overlap
    recorded_offline AS (
        SELECT
            op.user_id,
            (op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as offline_date,
            GREATEST(0,
                EXTRACT(EPOCH FROM LEAST(
                    op.online_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') + INTERVAL '18 hours 30 minutes'
                )) -
                EXTRACT(EPOCH FROM GREATEST(
                    op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') + INTERVAL '13 hours 30 minutes'
                ))
            ) / 60.0 as shift1_offline,
            GREATEST(0,
                EXTRACT(EPOCH FROM LEAST(
                    op.online_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') + INTERVAL '22 hours 30 minutes'
                )) -
                EXTRACT(EPOCH FROM GREATEST(
                    op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') + INTERVAL '19 hours 15 minutes'
                ))
            ) / 60.0 as shift2_offline
        FROM offline_periods op
        WHERE op.offline_start >= date_trunc('month', NOW())
          AND EXTRACT(ISODOW FROM op.offline_start AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= 5
    ),
    -- LIVE ongoing wastage for agents currently offline (>3 min inactive)
    live_ongoing AS (
        SELECT
            u.id as user_id,
            (NOW() AT TIME ZONE 'Asia/Kolkata')::date as offline_date,
            GREATEST(0,
                EXTRACT(EPOCH FROM LEAST(
                    NOW() AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '18 hours 30 minutes'
                )) -
                EXTRACT(EPOCH FROM GREATEST(
                    COALESCE(u.last_active_at, u.last_login) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '13 hours 30 minutes'
                ))
            ) / 60.0 as shift1_offline,
            GREATEST(0,
                EXTRACT(EPOCH FROM LEAST(
                    NOW() AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '22 hours 30 minutes'
                )) -
                EXTRACT(EPOCH FROM GREATEST(
                    COALESCE(u.last_active_at, u.last_login) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata',
                    date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') + INTERVAL '19 hours 15 minutes'
                ))
            ) / 60.0 as shift2_offline
        FROM users u
        WHERE u.is_approved = true
          AND u.role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales')
          AND COALESCE(u.last_active_at, u.last_login) IS NOT NULL
          AND COALESCE(u.last_active_at, u.last_login) < NOW() - INTERVAL '3 minutes'
          AND EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'Asia/Kolkata') <= 5
    ),
    -- Combine recorded + live ongoing
    all_offline AS (
        SELECT user_id, offline_date, shift1_offline, shift2_offline FROM recorded_offline
        UNION ALL
        SELECT user_id, offline_date, shift1_offline, shift2_offline FROM live_ongoing
    ),
    daily_wastage AS (
        SELECT
            user_id,
            offline_date,
            SUM(shift1_offline + shift2_offline) as wastage_minutes,
            SUM(shift1_offline) as shift1_total,
            SUM(shift2_offline) as shift2_total
        FROM all_offline
        GROUP BY user_id, offline_date
    ),
    user_wastage AS (
        SELECT
            user_id,
            COALESCE(SUM(CASE WHEN offline_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                              THEN wastage_minutes ELSE 0 END), 0) as today_wastage,
            COALESCE(SUM(CASE WHEN offline_date >= date_trunc('week', (NOW() AT TIME ZONE 'Asia/Kolkata')::date)
                              THEN wastage_minutes ELSE 0 END), 0) as week_wastage,
            COALESCE(SUM(wastage_minutes), 0) as month_wastage
        FROM daily_wastage
        GROUP BY user_id
    )`;
}

app.get('/api/task-work/time-wastage', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH ${buildWastageCTEs()}
            SELECT
                u.id as user_id,
                u.full_name as name,
                COALESCE(uw.today_wastage, 0) as today_wastage_minutes,
                COALESCE(uw.week_wastage, 0) as week_wastage_minutes,
                COALESCE(uw.month_wastage, 0) as month_wastage_minutes,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'date', dw.offline_date,
                            'wastage_minutes', ROUND(dw.wastage_minutes::numeric, 0),
                            'shift1_offline', ROUND(dw.shift1_total::numeric, 0),
                            'shift2_offline', ROUND(dw.shift2_total::numeric, 0)
                        ) ORDER BY dw.offline_date
                    ) FILTER (WHERE dw.offline_date IS NOT NULL),
                    '[]'::json
                ) as daily_breakdown
            FROM users u
            LEFT JOIN user_wastage uw ON uw.user_id = u.id
            LEFT JOIN daily_wastage dw ON dw.user_id = u.id
            WHERE u.is_approved = true
              AND u.role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales')
            GROUP BY u.id, u.full_name, uw.today_wastage, uw.week_wastage, uw.month_wastage
            ORDER BY u.full_name
        `);

        res.json({ wastage: rows });
    } catch (err) {
        console.error('Error fetching time wastage:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get offline agents (inactive > 3 minutes) - for Management notifications across CRM
app.get('/api/task-work/offline-agents', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT u.id, u.full_name as name, u.role,
                   COALESCE(u.last_active_at, u.last_login) as last_active_at,
                   EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_active_at, u.last_login))) / 60 as minutes_offline
            FROM users u
            WHERE u.is_approved = true
              AND u.role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales')
              AND COALESCE(u.last_active_at, u.last_login) IS NOT NULL
              AND COALESCE(u.last_active_at, u.last_login) < NOW() - INTERVAL '3 minutes'
            ORDER BY minutes_offline DESC
        `);
        res.json({ offlineAgents: rows });
    } catch (err) {
        console.error('Error fetching offline agents:', err);
        res.status(500).json({ error: err.message });
    }
});

// List CLAIMS for Task Work with pagination, filters (status, lender, assigned_to, date range)
app.get('/api/task-work/claims', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const statusFilter = req.query.status || '';
        const lenderFilter = req.query.lender || '';
        const assignedTo = req.query.assignedTo || '';
        const dateFrom = req.query.dateFrom || '';
        const dateTo = req.query.dateTo || '';
        const flagFilter = req.query.flagFilter || '';

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (search) {
            conditions.push(`(ct.full_name ILIKE $${paramIdx} OR ct.email ILIKE $${paramIdx} OR ct.phone ILIKE $${paramIdx} OR cs.lender ILIKE $${paramIdx})`);
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (statusFilter) {
            conditions.push(`cs.status = $${paramIdx}`);
            params.push(statusFilter);
            paramIdx++;
        }

        if (lenderFilter) {
            conditions.push(`cs.lender ILIKE $${paramIdx}`);
            params.push(`%${lenderFilter}%`);
            paramIdx++;
        }

        if (assignedTo === 'unassigned') {
            conditions.push(`cs.tw_assigned_to IS NULL`);
        } else if (assignedTo) {
            conditions.push(`cs.tw_assigned_to = $${paramIdx}`);
            params.push(parseInt(assignedTo));
            paramIdx++;
        }

        if (dateFrom) {
            conditions.push(`cs.created_at >= $${paramIdx}`);
            params.push(dateFrom);
            paramIdx++;
        }
        if (dateTo) {
            conditions.push(`cs.created_at <= $${paramIdx}`);
            params.push(dateTo);
            paramIdx++;
        }

        if (flagFilter === 'completed') {
            conditions.push(`cs.tw_completed = true`);
        } else if (flagFilter === 'red_flagged') {
            conditions.push(`cs.tw_red_flag = true AND cs.tw_completed = false`);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [claimsResult, totalResult] = await Promise.all([
            pool.query(`
                SELECT cs.id, cs.contact_id, cs.lender, cs.status, cs.claim_value, cs.created_at,
                       cs.tw_assigned_to, cs.tw_assigned_at,
                       cs.tw_completed, cs.tw_completed_at, cs.tw_completed_by,
                       cs.tw_red_flag, cs.tw_red_flag_at, cs.tw_red_flag_by,
                       cs.tw_originally_assigned_to,
                       ct.full_name as contact_name, ct.first_name, ct.last_name, ct.email, ct.phone,
                       u.full_name as assigned_to_name,
                       uc.full_name as completed_by_name,
                       uf.full_name as flagged_by_name,
                       uo.full_name as originally_assigned_to_name
                FROM cases cs
                JOIN contacts ct ON cs.contact_id = ct.id
                LEFT JOIN users u ON cs.tw_assigned_to = u.id
                LEFT JOIN users uc ON cs.tw_completed_by = uc.id
                LEFT JOIN users uf ON cs.tw_red_flag_by = uf.id
                LEFT JOIN users uo ON cs.tw_originally_assigned_to = uo.id
                ${whereClause}
                ORDER BY cs.tw_assigned_to IS NOT NULL ASC, cs.updated_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `, params),
            pool.query(`SELECT COUNT(*) as total FROM cases cs JOIN contacts ct ON cs.contact_id = ct.id ${whereClause}`, params)
        ]);

        const total = parseInt(totalResult.rows[0].total);

        res.json({
            claims: claimsResult.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page < Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Error fetching task work claims:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all distinct lenders for filter dropdown
app.get('/api/task-work/lenders', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT DISTINCT lender FROM cases WHERE lender IS NOT NULL AND lender != '' ORDER BY lender`);
        res.json({ lenders: rows.map(r => r.lender) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all distinct statuses for filter dropdown
app.get('/api/task-work/statuses', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT DISTINCT status FROM cases WHERE status IS NOT NULL AND status != '' ORDER BY status`);
        res.json({ statuses: rows.map(r => r.status) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get admin users for assignment dropdown
app.get('/api/task-work/admins', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, full_name as "fullName", role FROM users WHERE role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales') AND is_approved = true ORDER BY full_name`);
        res.json({ admins: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign claims to an admin (bulk)
app.post('/api/task-work/assign', async (req, res) => {
    try {
        const { claimIds, adminId } = req.body;
        if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0 || !adminId) {
            return res.status(400).json({ error: 'claimIds (array) and adminId are required' });
        }

        const placeholders = claimIds.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(
            `UPDATE cases SET tw_assigned_to = $${claimIds.length + 1}, tw_assigned_at = NOW() WHERE id IN (${placeholders})`,
            [...claimIds, adminId]
        );

        console.log(`Task Work: Assigned ${claimIds.length} claims to admin ${adminId}`);
        res.json({ success: true, assigned: claimIds.length });
    } catch (err) {
        console.error('Error assigning task work:', err);
        res.status(500).json({ error: err.message });
    }
});

// Unassign claims (bulk)
app.post('/api/task-work/unassign', async (req, res) => {
    try {
        const { claimIds } = req.body;
        if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
            return res.status(400).json({ error: 'claimIds (array) is required' });
        }

        const placeholders = claimIds.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(
            `UPDATE cases SET tw_assigned_to = NULL, tw_assigned_at = NULL WHERE id IN (${placeholders})`,
            claimIds
        );

        console.log(`Task Work: Unassigned ${claimIds.length} claims`);
        res.json({ success: true, unassigned: claimIds.length });
    } catch (err) {
        console.error('Error unassigning task work:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark claim task as completed
app.post('/api/task-work/complete', async (req, res) => {
    try {
        const { claimId, userId } = req.body;
        if (!claimId || !userId) {
            return res.status(400).json({ error: 'claimId and userId are required' });
        }
        await pool.query(
            `UPDATE cases SET tw_completed = true, tw_completed_at = NOW(), tw_completed_by = $1, tw_red_flag = false, tw_red_flag_at = NULL, tw_red_flag_by = NULL WHERE id = $2`,
            [userId, claimId]
        );
        // Log the action
        const user = (await pool.query('SELECT full_name FROM users WHERE id = $1', [userId])).rows[0];
        await pool.query(
            `INSERT INTO action_logs (action_type, action_category, actor_type, actor_id, actor_name, client_id, description, metadata, timestamp)
             VALUES ('task_completed', 'claims', 'agent', $1, $2, (SELECT contact_id FROM cases WHERE id = $3), 'Task marked as completed', $4, NOW())`,
            [String(userId), user?.full_name || 'Unknown', claimId, JSON.stringify({ case_id: claimId })]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error completing task:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark claim task as red flagged and auto-reassign to Priyanshu Srivastava (Management)
app.post('/api/task-work/red-flag', async (req, res) => {
    try {
        const { claimId, userId } = req.body;
        if (!claimId || !userId) {
            return res.status(400).json({ error: 'claimId and userId are required' });
        }

        // Look up Priyanshu Srivastava's ID for auto-reassignment
        const priyanshu = (await pool.query(
            "SELECT id FROM users WHERE full_name = 'Priyanshu Srivastava' AND role = 'Management' LIMIT 1"
        )).rows[0];

        if (priyanshu) {
            // Store original assignee, flag, and reassign to Priyanshu
            await pool.query(
                `UPDATE cases SET tw_red_flag = true, tw_red_flag_at = NOW(), tw_red_flag_by = $1,
                 tw_originally_assigned_to = tw_assigned_to,
                 tw_assigned_to = $3, tw_assigned_at = NOW()
                 WHERE id = $2`,
                [userId, claimId, priyanshu.id]
            );
        } else {
            // Priyanshu not found — flag but skip reassignment
            console.warn('Priyanshu Srivastava (Management) not found in users table, skipping auto-reassignment');
            await pool.query(
                `UPDATE cases SET tw_red_flag = true, tw_red_flag_at = NOW(), tw_red_flag_by = $1 WHERE id = $2`,
                [userId, claimId]
            );
        }

        const user = (await pool.query('SELECT full_name FROM users WHERE id = $1', [userId])).rows[0];
        await pool.query(
            `INSERT INTO action_logs (action_type, action_category, actor_type, actor_id, actor_name, client_id, description, metadata, timestamp)
             VALUES ('task_red_flagged', 'claims', 'agent', $1, $2, (SELECT contact_id FROM cases WHERE id = $3), $4, $5, NOW())`,
            [String(userId), user?.full_name || 'Unknown', claimId,
             priyanshu ? 'Task red flagged and reassigned to Priyanshu Srivastava' : 'Task red flagged',
             JSON.stringify({ case_id: claimId, reassigned_to: priyanshu?.id || null })]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error red flagging task:', err);
        res.status(500).json({ error: err.message });
    }
});

// Unflag red-flagged task(s) (Management only) — supports single claimId or bulk claimIds
app.post('/api/task-work/unflag', async (req, res) => {
    try {
        const { claimId, claimIds, userId } = req.body;
        const ids = claimIds || (claimId ? [claimId] : []);
        if (ids.length === 0 || !userId) {
            return res.status(400).json({ error: 'claimId(s) and userId are required' });
        }
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(
            `UPDATE cases SET tw_red_flag = false, tw_red_flag_at = NULL, tw_red_flag_by = NULL WHERE id IN (${placeholders})`,
            ids
        );
        const user = (await pool.query('SELECT full_name FROM users WHERE id = $1', [userId])).rows[0];
        for (const id of ids) {
            await pool.query(
                `INSERT INTO action_logs (action_type, action_category, actor_type, actor_id, actor_name, client_id, description, metadata, timestamp)
                 VALUES ('task_unflagged', 'claims', 'agent', $1, $2, (SELECT contact_id FROM cases WHERE id = $3), 'Task unflagged', $4, NOW())`,
                [String(userId), user?.full_name || 'Unknown', id, JSON.stringify({ case_id: id })]
            );
        }
        res.json({ success: true, unflagged: ids.length });
    } catch (err) {
        console.error('Error unflagging task:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get task work status for a specific claim
app.get('/api/task-work/claim/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT cs.tw_assigned_to, cs.tw_assigned_at, cs.tw_completed, cs.tw_completed_at, cs.tw_completed_by,
                    cs.tw_red_flag, cs.tw_red_flag_at, cs.tw_red_flag_by,
                    u.full_name as assigned_to_name
             FROM cases cs LEFT JOIN users u ON cs.tw_assigned_to = u.id WHERE cs.id = $1`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Claim not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all claims assigned to a specific user (for My Tasks page)
app.get('/api/task-work/my-tasks', async (req, res) => {
    try {
        const userId = parseInt(req.query.userId);
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : '';
        const statusFilter = req.query.status || '';

        // Build WHERE conditions
        let conditions = 'cs.tw_assigned_to = $1';
        const params = [userId];
        let paramIdx = 2;

        if (search) {
            params.push(`%${search}%`);
            conditions += ` AND (ct.full_name ILIKE $${paramIdx} OR ct.email ILIKE $${paramIdx} OR ct.phone ILIKE $${paramIdx} OR cs.lender ILIKE $${paramIdx})`;
            paramIdx++;
        }
        if (statusFilter) {
            params.push(statusFilter);
            conditions += ` AND cs.status = $${paramIdx}`;
            paramIdx++;
        }

        // Get summary counts in a single efficient query (no subqueries per row)
        const summaryQuery = pool.query(`
            SELECT
                COUNT(*) as total_tasks,
                COUNT(*) FILTER (WHERE cs.tw_completed = true) as completed_count,
                COUNT(*) FILTER (WHERE cs.tw_completed = false AND cs.tw_red_flag = false) as awaiting_count,
                COUNT(*) FILTER (WHERE cs.tw_red_flag = true) as flagged_count,
                COUNT(*) FILTER (WHERE cs.status IN ('DSAR Sent to Lender', 'Complaint Submitted')) as documents_count
            FROM cases cs
            WHERE cs.tw_assigned_to = $1
        `, [userId]);

        // Get paginated claims with LEFT JOIN LATERAL instead of correlated subqueries
        const claimsQuery = pool.query(`
            SELECT cs.id, cs.contact_id, cs.lender, cs.status, cs.claim_value, cs.created_at,
                   cs.tw_assigned_at, cs.tw_completed, cs.tw_completed_at,
                   cs.tw_red_flag, cs.tw_red_flag_at,
                   ct.full_name as contact_name, ct.first_name, ct.last_name, ct.email, ct.phone,
                   ln.content as last_note,
                   COALESCE(dc.doc_count, 0) as documents_count
            FROM cases cs
            JOIN contacts ct ON cs.contact_id = ct.id
            LEFT JOIN LATERAL (
                SELECT n.content FROM notes n WHERE n.client_id = ct.id ORDER BY n.created_at DESC LIMIT 1
            ) ln ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) as doc_count FROM documents d WHERE d.contact_id = ct.id
            ) dc ON true
            WHERE ${conditions}
            ORDER BY cs.tw_completed ASC, cs.tw_red_flag ASC, cs.tw_assigned_at DESC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `, [...params, limit, offset]);

        // Count total for pagination (with filters applied)
        const countQuery = pool.query(`
            SELECT COUNT(*) as total
            FROM cases cs
            JOIN contacts ct ON cs.contact_id = ct.id
            WHERE ${conditions}
        `, params);

        const [summaryResult, claimsResult, countResult] = await Promise.all([summaryQuery, claimsQuery, countQuery]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        const sr = summaryResult.rows[0];

        res.json({
            claims: claimsResult.rows,
            summary: {
                totalTasks: parseInt(sr.total_tasks),
                completedCount: parseInt(sr.completed_count),
                awaitingCount: parseInt(sr.awaiting_count),
                flaggedCount: parseInt(sr.flagged_count),
                documentsCount: parseInt(sr.documents_count)
            },
            pagination: { page, limit, total, totalPages, hasMore: page < totalPages }
        });
    } catch (err) {
        console.error('Error fetching my tasks:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// TASK WORK DASHBOARD API
// ============================================

// Dashboard KPIs: status counts for DSAR/Complaint/Counters, logged-in users, active agents
app.get('/api/task-work/dashboard/kpis', async (req, res) => {
    try {
        const period = req.query.period || 'week';
        const dateFilter = twDateFilter(period);

        const [dsarResult, complaintResult, counterResult, agentsResult, loggedInResult] = await Promise.all([
            pool.query(`SELECT COUNT(*) as count FROM action_logs al WHERE al.action_type = 'status_changed' AND al.action_category = 'claims' AND al.metadata->>'new_status' = 'DSAR Sent to Lender' ${dateFilter}`),
            pool.query(`SELECT COUNT(*) as count FROM action_logs al WHERE al.action_type = 'status_changed' AND al.action_category = 'claims' AND al.metadata->>'new_status' = 'Complaint Submitted' ${dateFilter}`),
            pool.query(`SELECT COUNT(*) as count FROM action_logs al WHERE al.action_type = 'status_changed' AND al.action_category = 'claims' AND al.metadata->>'new_status' = 'Counter Response sent' ${dateFilter}`),
            pool.query(`SELECT COUNT(*) as total FROM users WHERE is_approved = true AND role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales')`),
            // Users active in the last 3 minutes = logged in (using heartbeat last_active_at, fallback to last_login)
            pool.query(`SELECT COUNT(*) as logged_in FROM users WHERE is_approved = true AND COALESCE(last_active_at, last_login) >= NOW() - INTERVAL '3 minutes'`)
        ]);

        res.json({
            dsarSentToLender: parseInt(dsarResult.rows[0].count),
            complaintSentToLender: parseInt(complaintResult.rows[0].count),
            countersSentToLender: parseInt(counterResult.rows[0].count),
            loggedInUsers: parseInt(loggedInResult.rows[0].logged_in),
            totalAgents: parseInt(agentsResult.rows[0].total)
        });
    } catch (err) {
        console.error('Error fetching task work KPIs:', err);
        res.status(500).json({ error: err.message });
    }
});

// Tasks completed leaderboard: agents ranked by tw_completed tasks
app.get('/api/task-work/dashboard/leaderboard', async (req, res) => {
    try {
        const period = req.query.period || 'week';
        const dateFilter = twDateFilter(period);

        // Daily stats
        const dailyResult = await pool.query(`
            SELECT al.actor_name as name, al.actor_id, COUNT(*) as tasks_completed
            FROM action_logs al
            WHERE al.actor_type = 'agent'
              AND al.action_type = 'task_completed'
              AND al.action_category = 'claims'
              AND al.timestamp >= CURRENT_DATE
            GROUP BY al.actor_name, al.actor_id
            ORDER BY tasks_completed DESC
            LIMIT 20
        `);

        // Period stats (weekly by default)
        const periodResult = await pool.query(`
            SELECT al.actor_name as name, al.actor_id, COUNT(*) as tasks_completed
            FROM action_logs al
            WHERE al.actor_type = 'agent'
              AND al.action_type = 'task_completed'
              AND al.action_category = 'claims'
              ${dateFilter}
            GROUP BY al.actor_name, al.actor_id
            ORDER BY tasks_completed DESC
            LIMIT 20
        `);

        res.json({ daily: dailyResult.rows, weekly: periodResult.rows });
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        res.status(500).json({ error: err.message });
    }
});

// Status changes: from_status -> to_status with count
app.get('/api/task-work/dashboard/status-actions', async (req, res) => {
    try {
        const period = req.query.period || 'week';
        const dateFilter = twDateFilter(period);

        const { rows } = await pool.query(`
            SELECT al.metadata->>'old_status' as from_status,
                   al.metadata->>'new_status' as to_status,
                   COUNT(*) as total
            FROM action_logs al
            WHERE al.action_type = 'status_changed'
              AND al.action_category = 'claims'
              ${dateFilter}
            GROUP BY al.metadata->>'old_status', al.metadata->>'new_status'
            ORDER BY total DESC
            LIMIT 50
        `);

        res.json({ statusActions: rows });
    } catch (err) {
        console.error('Error fetching status actions:', err);
        res.status(500).json({ error: err.message });
    }
});

// Agent status: each agent with allocated/completed/flagged counts, online status, and time wastage
// Uses shared buildWastageCTEs() with live ongoing wastage + weekly/monthly tracking
app.get('/api/task-work/dashboard/agent-status', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH ${buildWastageCTEs()}
            SELECT u.id, u.full_name as name, u.role,
                   (SELECT COUNT(*) FROM cases c2 WHERE c2.tw_assigned_to = u.id) as tasks_allocated,
                   (SELECT COUNT(*) FROM cases c3 WHERE c3.tw_assigned_to = u.id AND c3.tw_completed = true) as tasks_completed,
                   (SELECT COUNT(*) FROM cases c4 WHERE c4.tw_red_flag = true AND (c4.tw_originally_assigned_to = u.id OR (c4.tw_assigned_to = u.id AND c4.tw_originally_assigned_to IS NULL))) as tasks_flagged,
                   CASE WHEN COALESCE(u.last_active_at, u.last_login) >= NOW() - INTERVAL '3 minutes'
                        THEN true ELSE false END as is_online,
                   COALESCE(u.last_active_at, u.last_login) as last_active_at,
                   COALESCE(uw.today_wastage, 0) as today_wastage_minutes,
                   COALESCE(uw.week_wastage, 0) as week_wastage_minutes,
                   COALESCE(uw.month_wastage, 0) as month_wastage_minutes
            FROM users u
            LEFT JOIN user_wastage uw ON uw.user_id = u.id
            WHERE u.is_approved = true AND u.role IN ('Admin', 'Management', 'IT', 'Payments', 'Sales')
            ORDER BY u.full_name
        `);

        res.json({ agents: rows });
    } catch (err) {
        console.error('Error fetching agent status:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get tasks assigned to a specific agent (for dashboard drill-down modal)
app.get('/api/task-work/agent-tasks/:agentId', async (req, res) => {
    try {
        const agentId = parseInt(req.params.agentId);
        if (!agentId) return res.status(400).json({ error: 'agentId is required' });

        const flagFilter = req.query.flagFilter || '';
        let flagCondition = '';
        if (flagFilter === 'completed') flagCondition = 'AND cs.tw_completed = true';
        else if (flagFilter === 'red_flagged') flagCondition = 'AND cs.tw_red_flag = true AND cs.tw_completed = false';

        const { rows } = await pool.query(`
            SELECT cs.id, cs.contact_id, cs.lender, cs.status, cs.claim_value,
                   cs.tw_completed, cs.tw_completed_at, cs.tw_completed_by,
                   cs.tw_red_flag, cs.tw_red_flag_at, cs.tw_red_flag_by,
                   cs.tw_assigned_to, cs.tw_originally_assigned_to,
                   ct.full_name as contact_name, ct.email, ct.phone,
                   u.full_name as assigned_to_name,
                   uf.full_name as flagged_by_name,
                   uc.full_name as completed_by_name,
                   uo.full_name as originally_assigned_to_name
            FROM cases cs
            JOIN contacts ct ON cs.contact_id = ct.id
            LEFT JOIN users u ON cs.tw_assigned_to = u.id
            LEFT JOIN users uf ON cs.tw_red_flag_by = uf.id
            LEFT JOIN users uc ON cs.tw_completed_by = uc.id
            LEFT JOIN users uo ON cs.tw_originally_assigned_to = uo.id
            WHERE (cs.tw_assigned_to = $1 OR cs.tw_originally_assigned_to = $1)
            ${flagCondition}
            ORDER BY cs.tw_red_flag DESC, cs.tw_completed DESC, cs.updated_at DESC
        `, [agentId]);

        res.json({ tasks: rows });
    } catch (err) {
        console.error('Error fetching agent tasks:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// WINDMILL REVERSE-PROXY CATCH-ALL
// Must be AFTER all CRM routes so CRM routes match first.
// Any /api/* request that didn't match a CRM route is forwarded to Windmill.
// This lets the embedded Windmill SPA call /api/login, /api/users/whoami, etc.
// ============================================================================

// Serve the Windmill SPA with a URL fix for iframe embedding.
// SvelteKit reads window.location.pathname to route; the iframe is at /wm
// but Windmill has no /wm route → 404. We inject a history.replaceState('/')
// before any SvelteKit JS runs, so the router sees '/' and loads the dashboard.
app.get('/wm', async (req, res) => {
    const wmBaseUrl = process.env.WINDMILL_BASE_URL || 'https://flowmill.fastactionclaims.com';
    const wmToken = process.env.WINDMILL_TOKEN || '';
    try {
        const wmRes = await fetch(wmBaseUrl + '/', {
            headers: { 'Accept': 'text/html' },
        });
        let html = await wmRes.text();
        // Inject a synchronous script that runs BEFORE SvelteKit initialises:
        // 1) Fix pathname so SvelteKit routes to '/' (not '/wm')
        // 2) Set auth token in localStorage + cookie (Windmill checks both)
        const boot = [
            `history.replaceState(null,'','/')`,
            `try{localStorage.setItem('token','${wmToken}');document.cookie='token=${wmToken};path=/;SameSite=Lax'}catch(e){}`,
        ].join(';');
        html = html.replace('<head>', `<head><script>${boot}</script>`);
        res.type('html').send(html);
    } catch (err) {
        res.status(502).send(`<h1>Windmill Unavailable</h1><p>${err.message}</p>`);
    }
});

// Endpoint to set the Windmill auth cookie (called by the frontend before loading the iframe)
app.get('/api/windmill/auth-cookie', (req, res) => {
    const token = process.env.WINDMILL_TOKEN;
    if (!token) return res.status(500).json({ error: 'Windmill token not configured' });
    // Set the cookie that Windmill's SPA reads for authentication
    res.cookie('token', token, {
        path: '/',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.json({ ok: true });
});

// Catch-all proxy for Windmill API calls that didn't match any CRM route
app.use('/api', async (req, res, next) => {
    // Skip if this looks like it was already handled (safety check)
    if (res.headersSent) return;

    const wmBaseUrl = process.env.WINDMILL_BASE_URL || 'https://flowmill.fastactionclaims.com';
    const wmToken = process.env.WINDMILL_TOKEN || '';
    const targetUrl = `${wmBaseUrl}${req.originalUrl}`;

    try {
        const fetchOpts = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${wmToken}`,
                'Content-Type': req.headers['content-type'] || 'application/json',
            },
        };

        // Forward body for non-GET/HEAD methods
        if (!['GET', 'HEAD'].includes(req.method) && req.body) {
            fetchOpts.body = JSON.stringify(req.body);
        }

        const wmRes = await fetch(targetUrl, fetchOpts);

        // Copy status
        res.status(wmRes.status);

        // Copy relevant headers (skip hop-by-hop headers)
        const skipHeaders = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-encoding']);
        for (const [key, value] of wmRes.headers.entries()) {
            if (!skipHeaders.has(key.toLowerCase())) {
                // Rewrite Set-Cookie domain so cookies work on localhost
                if (key.toLowerCase() === 'set-cookie') {
                    const rewritten = value.replace(/Domain=[^;]+;?\s*/gi, '');
                    res.setHeader(key, rewritten);
                } else {
                    res.setHeader(key, value);
                }
            }
        }

        // Stream body
        const body = Buffer.from(await wmRes.arrayBuffer());
        res.end(body);
    } catch (err) {
        // If Windmill is unreachable, return 502
        if (!res.headersSent) {
            res.status(502).json({ error: 'Windmill proxy error', detail: err.message });
        }
    }
});

// Listen on 0.0.0.0 for cloud deployment (EC2, Docker, etc.)
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Consolidated Server running on port ${port} (listening on all interfaces)`);
});
server.requestTimeout = 300000;  // 5 min — prevents Cloudflare tunnel from killing long audit requests
server.headersTimeout = 310000;
server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
});

// ── Periodic sync: watch action_logs for new DSAR errors and create notifications ──
// This runs every 30 seconds so that even if the EC2-deployed worker (old code)
// processes claims, the server will pick up the resulting action_log errors and
// create persistent_notifications for the frontend to display.
async function syncActionLogErrors() {
    try {
        const client = await pool.connect();
        try {
            const { rows: newErrors } = await client.query(`
                SELECT al.client_id, al.description, al.timestamp,
                       c.first_name, c.last_name
                FROM action_logs al
                LEFT JOIN contacts c ON al.client_id = c.id
                WHERE al.action_type IN ('dsar_blocked', 'dsar_failed')
                AND al.actor_type = 'system'
                AND al.timestamp > NOW() - INTERVAL '24 hours'
                AND NOT EXISTS (
                    SELECT 1 FROM persistent_notifications pn
                    WHERE pn.type = 'action_error'
                    AND pn.contact_id = al.client_id
                    AND pn.message = al.description
                )
            `);
            if (newErrors.length > 0) {
                for (const err of newErrors) {
                    const contactName = err.first_name && err.last_name
                        ? `${err.first_name} ${err.last_name}` : 'Unknown';
                    await client.query(
                        `INSERT INTO persistent_notifications (type, title, message, contact_id, contact_name, link, is_read, created_at)
                         VALUES ('action_error', $1, $2, $3, $4, $5, false, $6)`,
                        [
                            `Error: ${contactName}`,
                            err.description,
                            err.client_id,
                            contactName,
                            `/contacts/${err.client_id}`,
                            err.timestamp || new Date()
                        ]
                    );
                }
                console.log(`🔔 Synced ${newErrors.length} new error notification(s) from action_logs`);
            }
        } finally {
            client.release();
        }
    } catch (err) {
        // Silently ignore sync errors to avoid spamming logs
    }
}

// Run sync every 30 seconds
setInterval(syncActionLogErrors, 30000);
console.log('🔔 Action-log error sync started (every 30s)');
