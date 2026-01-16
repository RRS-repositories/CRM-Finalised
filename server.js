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
import Anthropic from '@anthropic-ai/sdk';

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

// --- CLAUDE AI CLIENT ---
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store chat sessions in memory (in production, use Redis or similar)
const chatSessions = new Map();

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
                phase: { type: "string", enum: ["Lead Generation", "Onboarding", "DSAR", "Complaint", "FOS", "Resolution"], description: "Filter by pipeline phase" },
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

app.listen(port, () => {
    console.log(`Consolidated Server running on port ${port}`);
});
