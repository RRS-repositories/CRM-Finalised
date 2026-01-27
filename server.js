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
import termsHtmlPkg from './termsHtml.cjs';
import Anthropic from '@anthropic-ai/sdk';
import { createCanvas, loadImage } from 'canvas';
import puppeteer from 'puppeteer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { tcText } = termsPkg;
const { tcHtml } = termsHtmlPkg;

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
                END $$;
            `);
            console.log('✅ Cases table schema synchronized');
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

// --- CLAUDE AI CLIENT ---
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store chat sessions in memory (in production, use Redis or similar)
const chatSessions = new Map();

// --- EMAIL CONFIGURATION ---
const emailTransporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
        user: 'irl@rowanrose.co.uk',
        pass: 'H(415260368035om'
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

const CLAUDE_SYSTEM_INSTRUCTION = `
You are 'FastAction AI', the intelligent Legal Operations Manager for FastAction Claims, a UK firm specializing in Irresponsible Lending claims.
You are an INTEGRATED COMPONENT of the CRM system with full READ/WRITE database access. You understand every feature, regulation, and workflow.

═══════════════════════════════════════════════════════════════════════════════
                           CORE KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════════════════════

## FCA CONC REGULATIONS (Your Legal Foundation)

**CONC 5.2A - Creditworthiness Assessment (Primary Breach Category)**
- CONC 5.2A.4R: Lender MUST assess if borrower can repay sustainably without undue difficulty
- CONC 5.2A.12R: Must verify income claims and not rely solely on self-declaration
- CONC 5.2A.15G: Must consider borrower's committed regular expenditure
- CONC 5.2A.17G: Must check for signs of financial difficulty (missed payments, arrears, defaults)
- CONC 5.2A.20R: Must consider pattern of multiple loans indicating credit cycling

**CONC 5.3 - Open-End Agreements (Credit Cards, Overdrafts)**
- Must conduct affordability check at drawdown AND periodic reviews
- Persistent debt triggers additional checks

**CONC 6 - Post-Contract Matters**
- CONC 6.7.2R: Must treat customers in financial difficulty with forbearance
- CONC 6.7.3AR: Must provide information about free debt advice

**Consumer Credit Act 1974**
- Section 140A-C: Unfair relationship provisions - courts can reopen credit agreements
- Section 75: Joint liability for misrepresentation

## 13-PHASE CLAIM LIFECYCLE (48 Statuses)

**PHASE 1: LEAD GENERATION** (6 statuses)
- New Lead → Contact Attempted → In Conversation → Qualification Call → Qualified Lead → Not Qualified

**PHASE 2: CLIENT ONBOARDING** (10 statuses)
- Onboarding Started → ID Verification Pending → ID Verification Complete → Questionnaire Sent → Questionnaire Complete → LOA Sent → LOA Signed → Bank Statements Requested → Bank Statements Received → Onboarding Complete

**PHASE 3: DSAR PROCESS** (7 statuses)
- DSAR Prepared → DSAR Sent to Lender → DSAR Acknowledged → DSAR Follow-up Sent → DSAR Response Received → DSAR Escalated (ICO) → Data Analysis

**PHASE 4: COMPLAINT SUBMISSION** (8 statuses)
- Complaint Drafted → Client Review → Complaint Approved → Complaint Submitted → Complaint Acknowledged → Awaiting Response → Response Received → Response Under Review

**PHASE 5: FOS ESCALATION** (7 statuses)
- FOS Referral Prepared → FOS Submitted → FOS Case Number Received → FOS Investigation → FOS Provisional Decision → FOS Final Decision → FOS Appeal

**PHASE 6: RESOLUTION & PAYMENT** (10 statuses)
- Offer Received → Offer Under Negotiation → Offer Accepted → Awaiting Payment → Payment Received → Fee Deducted → Client Paid → Claim Successful → Claim Unsuccessful → Claim Withdrawn

## LENDER KNOWLEDGE BASE

**High-Cost Short-Term Credit (HCSTC)**
- Vanquis, 118 118 Money, Amigo Loans, Guarantor My Loan, Buddy Loans
- Common breaches: Repeat lending without income verification, ignoring gambling transactions

**Credit Cards**
- NewDay (Aqua, Marbles, Amazon), Capital One, Barclaycard
- Common breaches: Automatic limit increases without affordability checks

**Motor Finance (PCP/HP)**
- Black Horse, MotoNovo, Close Brothers
- Common breaches: Commission non-disclosure (Discretionary Commission Arrangements)

**Catalogue/BNPL**
- Very, Littlewoods, JD Williams, Klarna, Clearpay
- Common breaches: Inadequate creditworthiness assessment

## AFFORDABILITY METRICS & CALCULATIONS

**Disposable Income Calculation:**
Monthly Disposable = Net Income - (Housing + Utilities + Council Tax + Insurance + Food + Transport + Childcare + Existing Debt Payments + Other Essential Costs)

**Debt-to-Income Ratio (DTI):**
DTI = (Total Monthly Debt Payments / Gross Monthly Income) × 100
- Below 30%: Generally acceptable
- 30-40%: Borderline, requires scrutiny
- Above 40%: Clear unaffordability indicator

**Case Qualification Score (0-100):**
- Gambling evidence during loan period: +25 points
- DTI above 40% at time of lending: +20 points
- Multiple loans within 30 days: +15 points
- Existing arrears/defaults at application: +15 points
- Income verification missing: +10 points
- Repeat borrowing pattern: +10 points
- Credit file checks inadequate: +5 points

Score Interpretation:
- 70-100: Strong case - proceed to formal complaint
- 50-69: Moderate case - gather additional evidence
- 30-49: Weak case - requires review
- 0-29: Case unlikely to succeed

## FOS COMPLAINT PROCESS

**8-Week Rule:** Lenders have 8 weeks to respond to formal complaint
**6-Month Rule:** Client has 6 months from Final Response to escalate to FOS
**FOS Powers:** Can award up to £430,000 (from April 2024)
**Standard Remedy:** Interest/charges refund + 8% simple interest from payment date

═══════════════════════════════════════════════════════════════════════════════
                           YOUR CAPABILITIES
═══════════════════════════════════════════════════════════════════════════════

1. **CRM Data Operations**
   - Create, update, search Contacts
   - Create and manage Claims/Opportunities
   - Change case statuses with validation
   - Execute bulk operations

2. **Document Analysis**
   - Extract data from DSAR documents (loan amounts, dates, APR, fees, T&Cs)
   - Analyze bank statements (income patterns, expenditure, gambling markers, debt payments)
   - Calculate affordability metrics automatically
   - Generate qualification scores

3. **Legal Content Generation**
   - Draft personalized complaint letters citing specific CONC breaches
   - Create FOS submission summaries
   - Generate client communications
   - Produce settlement analysis documents

4. **Communication & Automation**
   - Send emails, SMS, WhatsApp messages
   - Trigger workflows
   - Schedule appointments and reminders
   - Generate reports and analytics

═══════════════════════════════════════════════════════════════════════════════
                           BEHAVIORAL DIRECTIVES
═══════════════════════════════════════════════════════════════════════════════

**Context Intelligence:**
- Always use the provided "Current Context" implicitly
- "Update his status" = the contact/claim in context
- "Draft a complaint" without specifying = use context client/lender

**Search First Policy:**
- Before any data modification, verify entity exists via searchCRM
- Never hallucinate contact names, IDs, or claim details

**Legal Precision:**
- Always cite specific CONC rules when drafting
- Reference s.140A CCA 1974 for unfair relationship claims
- Include specific breach indicators found in evidence

**Bulk Operations:**
- For "Move all X claims..." use bulkClaimOperation
- For "Send to all contacts in..." use appropriate bulk tool

**Destructive Actions:**
- Require explicit confirmation before deleting data
- Warn about irreversible operations

**Professional Tone:**
- Be concise and action-oriented
- Provide status confirmations
- Offer next-step suggestions when appropriate
`;

const CLAUDE_TOOLS = [
    // ═══════════════════════════════════════════════════════════════════════════
    //                          CRM DATA OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: "searchCRM",
        description: "Searches the CRM database for contacts, claims, or documents. ALWAYS use this first before performing operations on records to verify they exist.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Name, email, phone, ID, or keyword to search for." },
                entityType: { type: "string", enum: ["contact", "claim", "document", "all"], description: "Type of entity to search. Use 'all' for comprehensive search." },
                filters: {
                    type: "object",
                    description: "Optional filters to narrow results",
                    properties: {
                        status: { type: "string", description: "Filter by specific status" },
                        lender: { type: "string", description: "Filter by lender name" },
                        dateFrom: { type: "string", description: "Filter records from this date (ISO format)" },
                        dateTo: { type: "string", description: "Filter records until this date (ISO format)" }
                    }
                }
            },
            required: ["query"]
        }
    },
    {
        name: "createContact",
        description: "Creates a new contact record in the CRM with full details.",
        input_schema: {
            type: "object",
            properties: {
                firstName: { type: "string", description: "First name of the contact" },
                lastName: { type: "string", description: "Last name of the contact" },
                fullName: { type: "string", description: "Full name (if firstName/lastName not provided)" },
                phone: { type: "string", description: "Phone number" },
                email: { type: "string", description: "Email address" },
                dateOfBirth: { type: "string", description: "Date of birth - accepts DD/MM/YYYY (UK format) or YYYY-MM-DD (ISO format)" },
                address: {
                    oneOf: [
                        { type: "string", description: "Full address as a single string" },
                        {
                            type: "object",
                            properties: {
                                line1: { type: "string", description: "Street address" },
                                line2: { type: "string", description: "Additional address line" },
                                city: { type: "string", description: "City/Town" },
                                state_county: { type: "string", description: "County or region" },
                                postalCode: { type: "string", description: "Postal code" }
                            }
                        }
                    ],
                    description: "Address - can be a string or an object with line1, line2, city, state_county, postalCode"
                },
                source: { type: "string", enum: ["Manual Input", "Website", "Referral", "AI Import"], description: "Lead source" }
            },
            required: ["fullName"]
        }
    },
    {
        name: "updateContact",
        description: "Updates an existing contact's information. Use searchCRM first to get the contact ID.",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string", description: "The ID of the contact to update" },
                updates: {
                    type: "object",
                    description: "Fields to update",
                    properties: {
                        firstName: { type: "string" },
                        lastName: { type: "string" },
                        phone: { type: "string" },
                        email: { type: "string" },
                        dateOfBirth: { type: "string", description: "Date of birth - accepts DD/MM/YYYY (UK format) or YYYY-MM-DD" },
                        address: {
                            oneOf: [
                                { type: "string", description: "Full address as a single string" },
                                {
                                    type: "object",
                                    properties: {
                                        line1: { type: "string" },
                                        line2: { type: "string" },
                                        city: { type: "string" },
                                        state_county: { type: "string" },
                                        postalCode: { type: "string" }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            required: ["contactId", "updates"]
        }
    },
    {
        name: "manageClaim",
        description: "Creates a new claim/opportunity or updates an existing claim's details (lender, value, product type).",
        input_schema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["create", "update"], description: "Create new or update existing" },
                contactId: { type: "string", description: "Required for creating a new claim" },
                claimId: { type: "string", description: "Required for updating an existing claim" },
                lender: { type: "string", description: "Lender name (e.g., Vanquis, Amigo, NewDay)" },
                claimValue: { type: "number", description: "Estimated claim value in GBP" },
                status: { type: "string", description: "Initial status (defaults to 'New Lead')" },
                productType: { type: "string", enum: ["HCSTC", "Credit Card", "Motor Finance", "Catalogue", "Overdraft", "Personal Loan"], description: "Type of credit product" },
                accountNumber: { type: "string", description: "Account/agreement number if known" },
                loanDate: { type: "string", description: "Original loan/credit date" }
            },
            required: ["action"]
        }
    },
    {
        name: "updateClaimStatus",
        description: "Moves a claim through the 48-stage pipeline. Use exact status names from the lifecycle phases.",
        input_schema: {
            type: "object",
            properties: {
                claimId: { type: "string", description: "The ID of the claim to update" },
                newStatus: { type: "string", description: "The exact status name from the pipeline (e.g., 'DSAR Sent to Lender', 'Complaint Drafted')" },
                notes: { type: "string", description: "Optional notes explaining the status change" }
            },
            required: ["claimId", "newStatus"]
        }
    },
    {
        name: "bulkClaimOperation",
        description: "Performs bulk actions on multiple claims matching criteria. Use for 'Move all Vanquis claims to FOS' type requests.",
        input_schema: {
            type: "object",
            properties: {
                lender: { type: "string", description: "Filter by lender name" },
                currentStatus: { type: "string", description: "Filter by current status" },
                phase: { type: "string", enum: ["Lead Generation", "Onboarding", "DSAR", "Complaint", "FOS", "Payments"], description: "Filter by pipeline phase" },
                minDaysInStage: { type: "number", description: "Filter claims stuck for X+ days" },
                action: { type: "string", enum: ["updateStatus", "assignUser", "addTag"], description: "Action to perform" },
                newValue: { type: "string", description: "New status/user/tag to apply" }
            },
            required: ["action", "newValue"]
        }
    },
    {
        name: "getPipelineStats",
        description: "Retrieves comprehensive dashboard statistics: KPIs, pipeline value by phase, claim counts, conversion rates.",
        input_schema: {
            type: "object",
            properties: {
                breakdown: { type: "string", enum: ["phase", "lender", "status", "user", "date"], description: "How to break down the statistics" },
                dateRange: {
                    type: "object",
                    properties: {
                        from: { type: "string", description: "Start date (ISO)" },
                        to: { type: "string", description: "End date (ISO)" }
                    }
                }
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          DOCUMENT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: "analyzeDSAR",
        description: "Analyzes DSAR (Data Subject Access Request) response documents to extract loan details, payment history, terms, and identify potential breaches.",
        input_schema: {
            type: "object",
            properties: {
                textData: { type: "string", description: "Raw text content from the DSAR document" },
                contactId: { type: "string", description: "Contact ID to associate analysis with" },
                extractFields: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific fields to extract: loanAmount, apr, fees, dates, paymentHistory, termsViolations"
                }
            },
            required: ["textData"]
        }
    },
    {
        name: "analyzeBankStatement",
        description: "Analyzes bank statement data to calculate income, expenses, identify gambling transactions, and assess affordability at time of lending.",
        input_schema: {
            type: "object",
            properties: {
                textData: { type: "string", description: "Raw text/CSV content from bank statement" },
                contactId: { type: "string", description: "Contact ID to associate analysis with" },
                loanDate: { type: "string", description: "Date of the loan to focus analysis around (YYYY-MM-DD)" },
                analysisType: {
                    type: "string",
                    enum: ["full", "gambling_focus", "income_verification", "affordability"],
                    description: "Type of analysis to perform"
                }
            },
            required: ["textData"]
        }
    },
    {
        name: "calculateAffordability",
        description: "Calculates affordability metrics including Disposable Income, DTI Ratio, and generates a Case Qualification Score (0-100).",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string", description: "Contact ID for the assessment" },
                income: {
                    type: "object",
                    properties: {
                        netMonthly: { type: "number", description: "Net monthly income" },
                        grossMonthly: { type: "number", description: "Gross monthly income" },
                        source: { type: "string", description: "Income source (employment, benefits, etc.)" }
                    },
                    required: ["netMonthly"]
                },
                expenses: {
                    type: "object",
                    properties: {
                        housing: { type: "number", description: "Rent/mortgage" },
                        utilities: { type: "number", description: "Gas, electric, water" },
                        councilTax: { type: "number" },
                        food: { type: "number" },
                        transport: { type: "number" },
                        insurance: { type: "number" },
                        childcare: { type: "number" },
                        debtPayments: { type: "number", description: "Existing debt repayments" },
                        other: { type: "number" }
                    }
                },
                loanAmount: { type: "number", description: "The loan amount being assessed" },
                monthlyRepayment: { type: "number", description: "Monthly repayment for the loan" },
                evidenceFactors: {
                    type: "object",
                    description: "Additional factors affecting qualification score",
                    properties: {
                        gamblingDetected: { type: "boolean" },
                        gamblingAmount: { type: "number" },
                        existingArrears: { type: "boolean" },
                        multipleLoansInPeriod: { type: "boolean" },
                        incomeNotVerified: { type: "boolean" },
                        repeatBorrower: { type: "boolean" }
                    }
                }
            },
            required: ["income"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          LEGAL CONTENT GENERATION
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: "draftComplaintLetter",
        description: "Generates a formal complaint letter to a lender citing specific FCA CONC breaches and requesting redress.",
        input_schema: {
            type: "object",
            properties: {
                clientName: { type: "string", description: "Full name of the client" },
                clientAddress: { type: "string", description: "Client's address for the letter" },
                lenderName: { type: "string", description: "Name of the lender" },
                accountNumber: { type: "string", description: "Loan/credit account number" },
                loanDate: { type: "string", description: "Date the loan was taken" },
                loanAmount: { type: "number", description: "Original loan amount" },
                breaches: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["CONC_5.2A.4R", "CONC_5.2A.12R", "CONC_5.2A.15G", "CONC_5.2A.17G", "CONC_5.2A.20R", "s140A_CCA", "CONC_6.7"] },
                            description: { type: "string", description: "Specific details of the breach" },
                            evidence: { type: "string", description: "Evidence supporting this breach" }
                        }
                    },
                    description: "List of FCA CONC breaches to cite"
                },
                financialHarm: { type: "string", description: "Description of financial harm suffered" },
                requestedRemedy: { type: "string", description: "Specific remedy requested (refund of interest/charges + 8% interest)" }
            },
            required: ["clientName", "lenderName", "breaches"]
        }
    },
    {
        name: "draftFOSSubmission",
        description: "Generates a Financial Ombudsman Service submission summary package for escalating a rejected complaint.",
        input_schema: {
            type: "object",
            properties: {
                clientName: { type: "string" },
                lenderName: { type: "string" },
                caseReference: { type: "string", description: "Internal case reference" },
                originalComplaintDate: { type: "string", description: "Date original complaint was submitted" },
                finalResponseDate: { type: "string", description: "Date of lender's final response" },
                finalResponseSummary: { type: "string", description: "Summary of lender's rejection reasons" },
                breachSummary: { type: "string", description: "Summary of CONC breaches alleged" },
                evidenceList: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of evidence documents being submitted"
                },
                reliefSought: { type: "string", description: "Specific financial remedy being sought" },
                additionalArguments: { type: "string", description: "Any additional arguments for FOS consideration" }
            },
            required: ["clientName", "lenderName", "breachSummary"]
        }
    },
    {
        name: "draftClientCommunication",
        description: "Drafts professional client communications (status updates, document requests, offer discussions).",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string", description: "Contact ID for personalization" },
                communicationType: {
                    type: "string",
                    enum: ["status_update", "document_request", "offer_discussion", "fos_update", "general_query", "welcome"],
                    description: "Type of communication"
                },
                subject: { type: "string", description: "Subject line for email" },
                keyPoints: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key points to include in the message"
                },
                tone: { type: "string", enum: ["formal", "friendly", "urgent"], description: "Tone of the communication" },
                includeNextSteps: { type: "boolean", description: "Whether to include next steps section" }
            },
            required: ["communicationType"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          COMMUNICATION & AUTOMATION
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: "sendCommunication",
        description: "Sends a message to a client via their preferred platform (Email, SMS, WhatsApp).",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string", description: "ID of the contact to message" },
                platform: { type: "string", enum: ["email", "sms", "whatsapp"], description: "Communication platform" },
                subject: { type: "string", description: "Subject line (for email)" },
                message: { type: "string", description: "The message content to send" },
                templateId: { type: "string", description: "Optional template ID to use" },
                attachments: {
                    type: "array",
                    items: { type: "string" },
                    description: "Document IDs to attach"
                }
            },
            required: ["contactId", "platform", "message"]
        }
    },
    {
        name: "triggerWorkflow",
        description: "Triggers an automated workflow sequence in n8n.",
        input_schema: {
            type: "object",
            properties: {
                workflowName: {
                    type: "string",
                    enum: ["New Lead Sequence", "DSAR Follow-up", "8 Week Reminder", "FOS Deadline Alert", "Document Chase", "Payment Received"],
                    description: "Name of the workflow to trigger"
                },
                contactId: { type: "string", description: "Contact to run workflow for" },
                parameters: {
                    type: "object",
                    description: "Additional parameters for the workflow"
                }
            },
            required: ["workflowName"]
        }
    },
    {
        name: "calendarAction",
        description: "Manages calendar appointments, reminders, and deadlines.",
        input_schema: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["schedule", "reschedule", "cancel", "list"], description: "Calendar action" },
                title: { type: "string", description: "Appointment/reminder title" },
                date: { type: "string", description: "Date and time (ISO format or natural language)" },
                duration: { type: "number", description: "Duration in minutes" },
                contactId: { type: "string", description: "Contact to associate with" },
                claimId: { type: "string", description: "Claim to associate with" },
                reminderType: {
                    type: "string",
                    enum: ["call_back", "document_deadline", "fos_deadline", "8_week_check", "payment_due"],
                    description: "Type of reminder"
                },
                description: { type: "string" }
            },
            required: ["action"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          REPORTS & ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        name: "generateReport",
        description: "Generates various reports and analytics summaries.",
        input_schema: {
            type: "object",
            properties: {
                reportType: {
                    type: "string",
                    enum: ["pipeline_summary", "lender_performance", "conversion_funnel", "aging_report", "user_productivity", "financial_summary"],
                    description: "Type of report to generate"
                },
                dateRange: {
                    type: "object",
                    properties: {
                        from: { type: "string" },
                        to: { type: "string" }
                    }
                },
                filters: {
                    type: "object",
                    properties: {
                        lender: { type: "string" },
                        status: { type: "string" },
                        user: { type: "string" }
                    }
                },
                format: { type: "string", enum: ["summary", "detailed", "csv"], description: "Output format" }
            },
            required: ["reportType"]
        }
    },
    {
        name: "createTemplate",
        description: "Creates a new reusable document template with variable placeholders.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Template name" },
                category: { type: "string", enum: ["Client", "Legal", "General", "Corporate"], description: "Template category" },
                content: { type: "string", description: "Template content with {{variable}} placeholders" },
                description: { type: "string", description: "Template description" },
                variables: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of variables used in the template"
                }
            },
            required: ["name", "content"]
        }
    }
];

// --- HELPER FUNCTION: Add Timestamp to Signature ---
async function addTimestampToSignature(base64Data) {
    if (!base64Data) return null;
    try {
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const originalImage = await loadImage(imageBuffer);

        // Calculate new canvas dimensions
        // We add a small amount of padding and space for the timestamp if desired
        // But the user wants the main date in HTML. We'll keep a small certified timestamp at the bottom.
        const padding = 10;
        const timestampHeight = 35; // Increased for larger font
        const width = originalImage.width;
        const height = originalImage.height + timestampHeight;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, width, height);

        // Draw original signature
        ctx.drawImage(originalImage, 0, 0);

        // Add small, professional certified timestamp at the very bottom
        const now = new Date();
        const timestamp = now.toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });

        ctx.fillStyle = '#000000'; // Black color for visibility
        ctx.font = 'bold 14px Arial'; // Bold
        ctx.textAlign = 'left';
        ctx.fillText(`Signed At: ${timestamp}`, 10, height - 10);

        return canvas.toBuffer('image/png');
    } catch (error) {
        console.error("Error adding timestamp to signature:", error);
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
        dob
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
                <td></td>
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
        <table class="sign-table">
            <tr>
                <td style="width: 40%; font-weight: bold; font-size: 13px; height: 80px; vertical-align: middle;">
                    <strong>SIGNATURE</strong>
                </td>
                <td style="width: 60%; text-align: center; vertical-align: middle;">
                    ${signatureBase64 ? `<img src="${signatureBase64}" class="signature-img" />` : '<span style="font-size: 12px;">Signed Electronically</span>'}
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
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
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
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
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
        pass: 'R!508682892731uj' // Note: In production this should be in .env
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

// Helper function to send LOA email
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
                body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #fce7cf; color: #333333; }
                .wrapper { width: 100%; table-layout: fixed; background-color: #fce7cf; padding-bottom: 40px; }
                .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .header { background-color: #1e3a5f; padding: 30px 40px; text-align: center; }
                .logo-text { color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
                .content { padding: 40px; }
                h1 { color: #1e3a5f; font-size: 24px; margin-top: 0; margin-bottom: 20px; font-weight: 700; }
                p { font-size: 16px; line-height: 1.6; margin-bottom: 20px; color: #4b5563; }
                .highlight-box { background-color: #f3f4f6; border-left: 4px solid #ff6b35; padding: 20px; margin: 25px 0; border-radius: 0 4px 4px 0; }
                .highlight-text { font-weight: 600; color: #1f2937; margin: 0; display: block; }
                .btn-container { text-align: center; margin: 35px 0; }
                .btn { display: inline-block; background-color: #ff6b35; color: #ffffff; font-size: 18px; font-weight: bold; padding: 16px 36px; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 6px rgba(255, 107, 53, 0.25); transition: background-color 0.3s ease; }
                .btn:hover { background-color: #e85a2d; }
                .footer { background-color: #f9fafb; padding: 30px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
                .footer p { margin: 5px 0; font-size: 12px; color: #6b7280; }
                .expiry-note { font-size: 14px; color: #ef4444; font-style: italic; margin-top: 10px; display: block; }
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="main">
                    <div class="header">
                        <div class="logo-text">ROWAN ROSE SOLICITORS</div>
                    </div>
                    <div class="content">
                        <h1>Expert Legal Support</h1>
                        <p>Hi ${clientName},</p>
                        <p>Thank you for starting your claim with us. We are currently processing your initial information.</p>
                        
                        <div class="highlight-box">
                            <span class="highlight-text">Action Required: Select Additional Lenders</span>
                            <p style="margin-bottom: 0; margin-top: 8px;">To maximize your potential compensation, please tell us about any other lenders you have used in the last 15 years.</p>
                        </div>
        
                        <p><strong>Did you know?</strong> Establishing a pattern of irresponsible lending across multiple lenders significantly strengthens your case.</p>
        
                        <div class="btn-container">
                            <a href="${loaLink}" class="btn">Complete Lender Selection</a>
                            <span class="expiry-note">Link expires in 7 days</span>
                        </div>
                        
                        <p>If you have any questions, our dedicated team is here to help.</p>
                        <p>Best regards,<br><strong>The Rowan Rose Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>Rowan Rose Solicitors | 1.03 The Boat Shed, 12 Exchange Quay, Salford, M5 3EQ</p>
                        <p>Authorized and Regulated by the Solicitors Regulation Authority (SRA No. 8000843)</p>
                        <p>0161 533 0444 | info@rowanrose.co.uk</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `
    };
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
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
        const insertQuery = `
                                INSERT INTO contacts
                                (first_name, last_name, full_name, phone, email, dob, address_line_1, address_line_2, city, state_county, postal_code, source, intake_lender)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Client Filled', $12)
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
            lender_type || null // Add lender type
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
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

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
                await pool.query(
                    `INSERT INTO documents (contact_id, name, type, category, url, size, tags)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [contactId, 'Terms and Conditions.pdf', 'pdf', 'Legal', tcUrl, 'Auto-generated', ['T&C', 'Signed']]
                );

                // 5. NEW: If lender_type is provided, create a claim and generate LOA
                if (lender_type) {
                    const finalLender = standardizeLender(lender_type);
                    // Create claim for this lender - status is 'LOA Sent' until mail form is submitted
                    const claimRes = await pool.query(
                        `INSERT INTO cases (contact_id, lender, status, loa_generated)
                                        VALUES ($1, $2, $3, $4) RETURNING id`,
                        [contactId, finalLender, 'LOA Sent', false]
                    );
                    const claimId = claimRes.rows[0].id;

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
            ContentType: file.mimetype
        }));

        const s3Url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }), { expiresIn: 604800 });

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
        const { rows } = await pool.query('SELECT * FROM documents WHERE contact_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CONTACTS & CASES API ---

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
            ORDER BY c.created_at DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contacts', async (req, res) => {
    const { first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source } = req.body;

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
    console.log('[Server POST /api/contacts] Parsed values:', { finalFirstName, finalLastName, finalFullName, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source });

    if (!finalFullName && !finalFirstName) {
        return res.status(400).json({ error: 'Name is required (provide full_name or first_name)' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [finalFirstName || null, finalLastName || null, finalFullName, email || null, phone || null, dob || null, address_line_1 || null, address_line_2 || null, city || null, state_county || null, postal_code || null, source || 'Manual Input']
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
    try {
        const { rows } = await pool.query(
            `INSERT INTO cases (contact_id, case_number, lender, status, claim_value, product_type, account_number, start_date)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.params.id, case_number, lender, status, claim_value, product_type, account_number, start_date]
        );
        res.json(rows[0]);
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

    const results = {
        created: 0,
        failed: 0,
        errors: []
    };

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        try {
            const fullName = contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();

            if (!fullName) {
                results.failed++;
                results.errors.push({ row: i + 1, error: 'Name is required' });
                continue;
            }

            const { rows } = await pool.query(
                `INSERT INTO contacts (first_name, last_name, full_name, email, phone, dob, address_line_1, address_line_2, city, state_county, postal_code, source)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
                [
                    contact.firstName || null,
                    contact.lastName || null,
                    fullName,
                    contact.email || null,
                    contact.phone || null,
                    contact.dateOfBirth || null,
                    contact.addressLine1 || null,
                    contact.addressLine2 || null,
                    contact.city || null,
                    contact.stateCounty || null,
                    contact.postalCode || null,
                    'Bulk Import'
                ]
            );

            results.created++;

        } catch (error) {
            results.failed++;
            results.errors.push({ row: i + 1, error: error.message });
        }
    }

    res.json({
        success: true,
        ...results,
        total: contacts.length
    });
});

// --- CLAUDE AI CHAT ENDPOINT ---

app.post('/api/ai/chat', async (req, res) => {
    const { sessionId, message, context, toolResults } = req.body;

    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    try {
        // Get or create session
        if (!chatSessions.has(sessionId)) {
            chatSessions.set(sessionId, { messages: [] });
        }
        const session = chatSessions.get(sessionId);

        // If tool results are provided, add them to the conversation
        if (toolResults && toolResults.length > 0) {
            const toolResultContent = toolResults.map(tr => ({
                type: "tool_result",
                tool_use_id: tr.toolUseId,
                content: tr.result
            }));
            session.messages.push({
                role: "user",
                content: toolResultContent
            });
        } else if (message) {
            // Add user message with optional context
            const fullMessage = context
                ? `Current Context:\n${context}\n\nUser Request: ${message}`
                : message;

            session.messages.push({
                role: "user",
                content: fullMessage
            });
        }

        // Call Claude API
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: CLAUDE_SYSTEM_INSTRUCTION,
            tools: CLAUDE_TOOLS,
            messages: session.messages
        });

        // Extract text and tool calls
        const textBlocks = response.content.filter(block => block.type === "text");
        const toolCalls = response.content.filter(block => block.type === "tool_use");

        const responseText = textBlocks.map(b => b.text).join("\n");

        // Store assistant response
        session.messages.push({
            role: "assistant",
            content: response.content
        });

        res.json({
            success: true,
            text: responseText,
            toolCalls: toolCalls.map(tc => ({
                id: tc.id,
                name: tc.name,
                input: tc.input
            }))
        });

    } catch (error) {
        console.error('Claude API Error:', error);
        res.status(500).json({ success: false, error: error.message });
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
        previous_address_line_1, previous_address_line_2, previous_city,
        previous_county, previous_postal_code
    } = req.body;

    try {
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (bank_name !== undefined) { updates.push(`bank_name = $${paramCount++}`); values.push(bank_name); }
        if (account_name !== undefined) { updates.push(`account_name = $${paramCount++}`); values.push(account_name); }
        if (sort_code !== undefined) { updates.push(`sort_code = $${paramCount++}`); values.push(sort_code); }
        if (bank_account_number !== undefined) { updates.push(`bank_account_number = $${paramCount++}`); values.push(bank_account_number); }
        if (previous_address_line_1 !== undefined) { updates.push(`previous_address_line_1 = $${paramCount++}`); values.push(previous_address_line_1); }
        if (previous_address_line_2 !== undefined) { updates.push(`previous_address_line_2 = $${paramCount++}`); values.push(previous_address_line_2); }
        if (previous_city !== undefined) { updates.push(`previous_city = $${paramCount++}`); values.push(previous_city); }
        if (previous_county !== undefined) { updates.push(`previous_county = $${paramCount++}`); values.push(previous_county); }
        if (previous_postal_code !== undefined) { updates.push(`previous_postal_code = $${paramCount++}`); values.push(previous_postal_code); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const query = `UPDATE contacts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Log to action_logs
        await pool.query(
            `INSERT INTO action_logs (client_id, actor_type, actor_id, action_type, action_category, description)
                                VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, 'agent', 'system', 'details_updated', 'account', 'Updated contact extended details (bank/previous address)']
        );

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
                values.push(value);
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
        const loaPath = `${folderPath}LOA/${claim.lender}_LOA.pdf`;

        console.log(`🗑️  Deleting claim ${id} for lender: ${claim.lender}`);

        // 2. Delete claim-specific LOA from S3
        try {
            const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

            await s3Client.send(new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: loaPath
            }));

            console.log(`✅ Deleted LOA file from S3: ${loaPath}`);
        } catch (s3Error) {
            console.error('⚠️  S3 deletion error (LOA may not exist):', s3Error.message);
            // Continue with database deletion even if S3 fails
        }

        // 3. Delete claim-specific documents from documents table
        await client.query(
            "DELETE FROM documents WHERE contact_id = $1 AND name LIKE $2",
            [claim.contact_id, `%${claim.lender}%LOA%`]
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
            deletedLender: claim.lender,
            deletedLoaPath: loaPath
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

        // Use BASE_URL from env if set, otherwise auto-detect from request
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const uniqueLink = `${baseUrl}/loa-form/${uniqueId}`;

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

        // Return HTML form page
        res.send(`
                                <!DOCTYPE html>
                                <html lang="en">
                                    <head>
                                        <meta charset="UTF-8">
                                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                <title>LOA Form - ${contactName}</title>
                                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                                                    <style>
                                                        * {margin: 0; padding: 0; box-sizing: border-box; }
                                                        body {
                                                            font - family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                                                        background: #f8f9fa;
                                                        padding: 20px;
                                                        line-height: 1.8;
                                                        font-size: 18px;
        }
                                                        .container {
                                                            max - width: 900px;
                                                        margin: 0 auto;
                                                        background: white;
                                                        padding: 40px 50px;
                                                        border-radius: 12px;
                                                        box-shadow: 0 4px 20px rgba(0,0,0,0.08); 
        }
                                                        .header {
                                                            text - align: center;
                                                        margin-bottom: 40px;
                                                        padding-bottom: 30px;
                                                        border-bottom: 3px solid #e5e7eb; 
        }
                                                        .logo-container {
                                                            margin - bottom: 20px;
        }
                                                        .logo {
                                                            max - width: 280px;
                                                        height: auto;
                                                        display: block;
                                                        margin: 0 auto;
        }
                                                        .contact-info {
                                                            font - size: 16px;
                                                        color: #4b5563;
                                                        margin: 20px 0;
                                                        line-height: 2;
                                                        text-align: center;
                                                        font-weight: 500;
        }
                                                        .contact-info a {
                                                            color: #2563eb;
                                                        text-decoration: none;
                                                        font-weight: 600;
        }
                                                        .contact-info a:hover {
                                                            text - decoration: underline;
        }
                                                        .greeting {
                                                            font - size: 32px;
                                                        font-weight: 700;
                                                        color: #111827;
                                                        margin: 30px 0 20px 0;
                                                        text-align: left;
        }
                                                        .intro {
                                                            font - size: 19px;
                                                        color: #1f2937;
                                                        line-height: 2;
                                                        margin-bottom: 35px;
                                                        text-align: left;
        }
                                                        .intro strong {
                                                            font - weight: 700;
                                                        color: #111827;
        }
                                                        .category {
                                                            margin: 40px 0;
                                                        padding: 25px;
                                                        border-radius: 10px;
        }
                                                        .category:nth-child(odd) {
                                                            background: #ffffff;
        }
                                                        .category:nth-child(even) {
                                                            background: #f3f4f6;
        }
                                                        .category-title {
                                                            font - size: 18px;
                                                        font-weight: 700;
                                                        color: #111827;
                                                        margin-bottom: 20px;
                                                        text-transform: uppercase;
                                                        letter-spacing: 0.5px;
                                                        font-style: italic;
        }
                                                        .lender-item {
                                                            display: flex;
                                                        align-items: center;
                                                        padding: 16px 18px;
                                                        margin: 8px 0;
                                                        border-radius: 8px;
                                                        transition: background 0.2s;
                                                        min-height: 56px;
        }
                                                        .lender-item:hover {background: #e5e7eb; }
                                                        .lender-item input[type="checkbox"] {
                                                            width: 32px;
                                                        height: 32px;
                                                        margin-right: 18px;
                                                        cursor: pointer;
                                                        accent-color: #2563eb;
                                                        flex-shrink: 0;
        }
                                                        .lender-item label {
                                                            font - size: 18px;
                                                        color: #1f2937;
                                                        cursor: pointer;
                                                        user-select: none;
                                                        font-weight: 600;
                                                        line-height: 1.6;
        }
                                                        .questions {
                                                            margin: 45px 0;
                                                        padding: 30px;
                                                        background: #fef3c7;
                                                        border-radius: 12px;
                                                        border: 3px solid #fbbf24;
        }
                                                        .question-item {
                                                            display: flex;
                                                        align-items: center;
                                                        margin: 22px 0;
                                                        min-height: 56px;
        }
                                                        .question-item input[type="checkbox"] {
                                                            width: 32px;
                                                        height: 32px;
                                                        margin-right: 18px;
                                                        cursor: pointer;
                                                        accent-color: #f59e0b;
                                                        flex-shrink: 0;
        }
                                                        .question-item label {
                                                            font - size: 18px;
                                                        font-weight: 700;
                                                        color: #78350f;
                                                        cursor: pointer;
                                                        line-height: 1.6;
        }
                                                        .signature-section {margin: 45px 0; }
                                                        .signature-title {
                                                            font - size: 22px;
                                                        font-weight: 700;
                                                        color: #111827;
                                                        margin-bottom: 18px; 
        }
                                                        .signature-canvas {
                                                            border: 3px solid #9ca3af;
                                                        border-radius: 12px;
                                                        cursor: crosshair;
                                                        display: block;
                                                        margin: 18px 0;
                                                        background: white;
                                                        width: 100%;
                                                        max-width: 700px;
                                                        height: 200px;
        }
                                                        .signature-buttons {
                                                            display: flex;
                                                        gap: 15px;
                                                        margin: 18px 0; 
        }
                                                        .btn {
                                                            padding: 16px 28px;
                                                        border: none;
                                                        border-radius: 10px;
                                                        font-size: 18px;
                                                        font-weight: 700;
                                                        cursor: pointer;
                                                        transition: all 0.2s;
                                                        font-family: 'Inter', sans-serif;
                                                        min-height: 56px;
        }
                                                        .btn-clear {
                                                            background: #ef4444;
                                                        color: white; 
        }
                                                        .btn-clear:hover {
                                                            background: #dc2626;
                                                        transform: translateY(-1px);
        }
                                                        .btn-submit {
                                                            background: #2563eb;
                                                        color: white;
                                                        padding: 22px 60px;
                                                        font-size: 22px;
                                                        font-weight: 700;
                                                        width: 100%;
                                                        margin-top: 40px;
                                                        min-height: 64px;
        }
                                                        .btn-submit:hover {
                                                            background: #1d4ed8;
                                                        transform: translateY(-2px);
                                                        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        }
                                                        .btn-submit:disabled {
                                                            background: #9ca3af;
                                                        cursor: not-allowed;
                                                        transform: none;
        }
                                                        .disclaimer {
                                                            font - size: 14px;
                                                        color: #4b5563;
                                                        margin-top: 25px;
                                                        padding: 20px;
                                                        background: #f9fafb;
                                                        border-radius: 10px;
                                                        line-height: 1.8; 
        }
                                                        .loading {
                                                            display: none;
                                                        text-align: center;
                                                        padding: 40px;
                                                        font-size: 20px;
        }
                                                        .success-message {
                                                            display: none;
                                                        text-align: center;
                                                        padding: 60px; 
        }
                                                        .success-message h2 {
                                                            color: #10b981;
                                                        margin-bottom: 20px;
                                                        font-size: 32px;
        }
                                                        .success-message p {
                                                            font - size: 20px;
                                                        color: #1f2937;
        }
                                                        .error-message {
                                                            display: none;
                                                        background: #fee2e2;
                                                        color: #991b1b;
                                                        padding: 20px;
                                                        margin: 20px 0;
                                                        border-radius: 8px;
                                                        border: 1px solid #fca5a5;
                                                        font-size: 18px;
                                                        font-weight: 500;
                                                        text-align: center;
        }

                                                        /* Mobile Responsiveness */
                                                        @media (max-width: 768px) {
                                                            body {
                                                            padding: 10px;
                                                        font-size: 18px;
            }
                                                        .container {
                                                            padding: 30px 20px;
            }
                                                        .greeting {
                                                            font - size: 28px;
            }
                                                        .intro {
                                                            font - size: 18px;
            }
                                                        .category {
                                                            padding: 20px 15px;
                                                        margin: 30px 0;
            }
                                                        .category-title {
                                                            font - size: 17px;
            }
                                                        .lender-item {
                                                            padding: 14px 12px;
                                                        min-height: 60px;
            }
                                                        .lender-item label {
                                                            font - size: 17px;
            }
                                                        .question-item {
                                                            min - height: 60px;
            }
                                                        .question-item label {
                                                            font - size: 17px;
            }
                                                        .signature-canvas {
                                                            height: 180px;
            }
                                                        .btn {
                                                            font - size: 17px;
                                                        padding: 14px 24px;
            }
                                                        .btn-submit {
                                                            font - size: 20px;
                                                        padding: 20px 40px;
            }
        }

                                                        @media (max-width: 480px) {
            .container {
                                                            padding: 25px 15px;
            }
                                                        .greeting {
                                                            font - size: 24px;
            }
                                                        .intro {
                                                            font - size: 17px;
            }
                                                        .category-title {
                                                            font - size: 16px;
            }
                                                        .lender-item label,
                                                        .question-item label {
                                                            font - size: 16px;
            }
                                                        .signature-title {
                                                            font - size: 20px;
            }
        }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="container">
                                                        <div class="header">
                                                            <div class="logo-container">
                                                                <img src="${baseUrl}/fac.png" alt="Fast Action Claims" class="logo" onerror="this.style.display='none'">
                                                            </div>
                                                            <div class="contact-info">
                                                                Email: <a href="mailto:info@fastactionclaims.co.uk">info@fastactionclaims.co.uk</a><br>
                                                                    Tel: <a href="tel:01615331706">0161 533 1706</a><br>
                                                                        Web: <a href="https://fastactionclaims.co.uk/" target="_blank">https://fastactionclaims.co.uk/</a>
                                                                    </div>
                                                            </div>

                                                            <div class="greeting">Hi ${contactName},</div>
                                                            <div class="intro">
                                                                Great news — your claim is progressing smoothly!<br><br>
                                                                    We wanted to get in touch to share a list of lenders we're currently pursuing. <strong>Millions of pounds have already been repaid to consumers.</strong><br><br>
                                                                        <strong>Please take a moment to review the list below and tick any lenders you've used in the last 15 years.</strong><br><br>
                                                                            Millions has been claimed from lenders for irresponsible lending so it's well worth taking a careful look!<br><br>
                                                                                If you need any help or have questions, don't hesitate to get in touch.
                                                                            </div>
                                                                                <div id="errorMessage" class="error-message"></div>
                                                                                <form id="lenderForm">
                                                                                    <div id="lenderCategories"></div>
                                                                                    <div class="questions">
                                                                                        <div class="question-item"><input type="checkbox" id="ccj" name="ccj"><label for="ccj">HAVE YOU EVER HAD A CCJ IN THE LAST 6 YEARS?</label></div>
                                                                                        <div class="question-item"><input type="checkbox" id="scam" name="scam"><label for="scam">HAVE YOU BEEN A VICTIM OF A SCAM IN THE LAST 6 YEARS?</label></div>
                                                                                        <div class="question-item"><input type="checkbox" id="gambling" name="gambling"><label for="gambling">HAVE YOU EXPERIENCED PERIODS OF EXCESSIVE OR PROBLEMATIC GAMBLING WITHIN THE LAST 10 YEARS?</label></div>
                                                                                    </div>
                                                                                    <div class="signature-section">
                                                                                        <div class="signature-title">Please sign in the box below</div>
                                                                                        <canvas id="signatureCanvas" class="signature-canvas" width="700" height="200"></canvas>
                                                                                        <div class="signature-buttons"><button type="button" class="btn btn-clear" onclick="clearSignature()">Clear Signature</button></div>
                                                                                        <div class="disclaimer">Fast Action Claims (Rowan Rose Solicitors) is a trading name of Rowan Rose Solicitors Limited, a limited company registered in England and Wales. Company number: 12345678. Registered office: [Address]. Rowan Rose Solicitors Limited is authorised and regulated by the Solicitors Regulation Authority. SRA number: 123456.</div>
                                                                                    </div>
                                                                                    <button type="submit" class="btn btn-submit" id="submitBtn">Submit</button>
                                                                                </form>
                                                                                <div class="loading" id="loading"><p>Submitting your form...</p></div>
                                                                                <div class="success-message" id="success"><h2>✓ Form Submitted Successfully!</h2><p>Thank you for completing the lender selection form. We will process your information shortly.</p></div>
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
                                                                                let isDrawing = false;
                                                                                let hasSignature = false;
                                                                                ctx.strokeStyle = '#000';
                                                                                ctx.lineWidth = 2;
                                                                                ctx.lineCap = 'round';
        canvas.addEventListener('mousedown', (e) => {isDrawing = true; const rect = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); });
        canvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; const rect = canvas.getBoundingClientRect(); ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke(); hasSignature = true; });
        canvas.addEventListener('mouseup', () => {isDrawing = false; });
        canvas.addEventListener('mouseout', () => {isDrawing = false; });
        canvas.addEventListener('touchstart', (e) => {e.preventDefault(); const touch = e.touches[0]; const rect = canvas.getBoundingClientRect(); const x = touch.clientX - rect.left; const y = touch.clientY - rect.top; ctx.beginPath(); ctx.moveTo(x, y); isDrawing = true; });
        canvas.addEventListener('touchmove', (e) => {e.preventDefault(); if (!isDrawing) return; const touch = e.touches[0]; const rect = canvas.getBoundingClientRect(); const x = touch.clientX - rect.left; const y = touch.clientY - rect.top; ctx.lineTo(x, y); ctx.stroke(); hasSignature = true; });
        canvas.addEventListener('touchend', (e) => {e.preventDefault(); isDrawing = false; });
                                                                                function clearSignature() {ctx.clearRect(0, 0, canvas.width, canvas.height); hasSignature = false; }
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
                const caseCreationPromises = selectedLenders.map(async (lender) => {
                    try {
                        const standardizedLenderName = standardizeLender(lender);

                        // Condition: Only the Intake Lender gets 'LENDER SELECTION FORM COMPLETED' initially
                        // Others get 'New Lead'
                        let initialStatus = 'New Lead';
                        if (contact.intake_lender && standardizeLender(contact.intake_lender) === standardizedLenderName) {
                            initialStatus = 'LENDER SELECTION FORM COMPLETED';
                        }

                        // CHECK FOR EXISTING CASE FIRST
                        const existingCaseRes = await pool.query(
                            `SELECT id, status FROM cases WHERE contact_id = $1 AND lower(lender) = lower($2)`,
                            [contactId, standardizedLenderName]
                        );

                        if (existingCaseRes.rows.length > 0) {
                            // Case exists - update status if it's the intake lender, otherwise leave as is (or update if needed)
                            console.log(`[Background LOA] Case already exists for ${lender}. Updating status if needed.`);

                            if (initialStatus === 'LENDER SELECTION FORM COMPLETED') {
                                await pool.query(
                                    `UPDATE cases SET status = $1 WHERE id = $2`,
                                    [initialStatus, existingCaseRes.rows[0].id]
                                );
                            }
                            return { lender, success: true, status: 'updated' };
                        } else {
                            // Case does not exist - create new
                            await pool.query(
                                `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated)
                                 VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP, false)`,
                                [contactId, standardizedLenderName, initialStatus]
                            );

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
                if (contact.intake_lender) {
                    console.log(`[Background LOA] Ensuring Intake Lender Case: ${contact.intake_lender}`);
                    const stdIntakeLender = standardizeLender(contact.intake_lender);

                    // Update existing case if it exists (e.g. created created above or previously)
                    const updateResult = await pool.query(
                        `UPDATE cases SET status = 'LENDER SELECTION FORM COMPLETED' 
                         WHERE contact_id = $1 AND lower(lender) = lower($2)`,
                        [contactId, stdIntakeLender]
                    );

                    if (updateResult.rowCount === 0) {
                        // If not exists (meaning user didn't select it? or it wasn't in list?), create it
                        await pool.query(
                            `INSERT INTO cases (contact_id, lender, status, claim_value, created_at, loa_generated)
                             VALUES ($1, $2, 'LENDER SELECTION FORM COMPLETED', 0, CURRENT_TIMESTAMP, false)`,
                            [contactId, stdIntakeLender]
                        );
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


// --- BACKGROUND WORKER: PROCESS PENDING LOAs ---
app.listen(port, () => {
    console.log(`Consolidated Server running on port ${port}`);
});
