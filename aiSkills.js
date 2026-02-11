/**
 * FastAction AI Skills Configuration
 *
 * This file defines all skills, tools, and knowledge for the AI Assistant.
 * Add new skills by adding entries to the SKILLS object and corresponding tools to TOOLS array.
 *
 * Structure:
 * - SKILLS: Defines skill categories with descriptions and capabilities
 * - TOOLS: OpenAI function definitions for each tool
 * - SYSTEM_PROMPT: Dynamic system prompt builder
 * - KNOWLEDGE_BASE: Domain knowledge organized by topic
 */

// ═══════════════════════════════════════════════════════════════════════════════
//                              KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════════

export const KNOWLEDGE_BASE = {
    regulations: {
        name: "FCA CONC Regulations",
        content: `
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
- Section 75: Joint liability for misrepresentation`
    },

    pipeline: {
        name: "48-Stage Pipeline",
        content: `
**CATEGORY 1: LEAD GENERATION & SALES** (5 statuses)
- New Lead
- Contact Attempted
- Not Qualified
- SALE
- LOA Sent

**CATEGORY 2: CLIENT ONBOARDING** (12 statuses)
- LOA Uploaded
- LOA Signed
- ID Request Sent
- ID Verification Pending
- POA Required
- Extra Lender Selection Form Sent
- Extra Lender Selection Form Completed
- Questionnaire Sent
- Questionnaire Completed
- Bank Statements Requested
- Bank Statements Received
- Onboarding Complete

**CATEGORY 3: DSAR PROCESS** (11 statuses)
- DSAR Prepared
- DSAR Prepared Awaiting I.D
- DSAR Sent to Lender
- Unable to Locate
- Unable to Locate Account Number
- DSAR Overdue
- DSAR Response Received
- DSAR Escalated (ICO)
- Dsar Review Completed
- Weak Case Cannot Continue
- Missing Data From Dsar

**CATEGORY 4: COMPLAINT SUBMISSION** (9 statuses)
- Complaint Drafted
- Complaint Drafted Awaiting Questionnaire
- Complaint Submitted
- Complaint Overdue
- Upheld
- Partial Upheld
- Not upheld
- Counter team
- Counter Response sent

**CATEGORY 5: FOS ESCALATION** (7 statuses)
- FOS Referral Prepared
- FOS Submitted
- FOS Case Number Received
- FOS Investigation
- FOS Provisional Decision
- FOS Final Decision
- FOS Appeal

**CATEGORY 6: PAYMENTS** (10 statuses)
- Offer Received
- Offer Under Negotiation
- Offer Accepted
- Awaiting Payment
- Payment Received
- Fee Deducted
- Client Paid
- Claim Successful
- Claim Unsuccessful
- Claim Withdrawn

**CATEGORY 7: DEBT RECOVERY** (6 statuses)
- Debt Recovery Initiated
- Payment Plan Agreed
- Debt Collection Started
- Partial Payment Received
- Debt Settled
- Debt Written Off`
    },

    lenders: {
        name: "Lender Knowledge",
        content: `
**High-Cost Short-Term Credit (HCSTC)**
Vanquis, 118 118 Money, Amigo Loans, Guarantor My Loan, Buddy Loans
Common breaches: Repeat lending without income verification, ignoring gambling transactions

**Credit Cards**
NewDay (Aqua, Marbles, Amazon), Capital One, Barclaycard
Common breaches: Automatic limit increases without affordability checks

**Motor Finance (PCP/HP)**
Black Horse, MotoNovo, Close Brothers
Common breaches: Commission non-disclosure (Discretionary Commission Arrangements)

**Catalogue/BNPL**
Very, Littlewoods, JD Williams, Klarna, Clearpay
Common breaches: Inadequate creditworthiness assessment`
    },

    affordability: {
        name: "Affordability Metrics",
        content: `
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
- 0-29: Case unlikely to succeed`
    },

    fos: {
        name: "FOS Process",
        content: `
**8-Week Rule:** Lenders have 8 weeks to respond to formal complaint
**6-Month Rule:** Client has 6 months from Final Response to escalate to FOS
**FOS Powers:** Can award up to £430,000 (from April 2024)
**Standard Remedy:** Interest/charges refund + 8% simple interest from payment date`
    },

    dataFields: {
        name: "CRM Data Fields Reference",
        content: `
**CONTACT FIELDS:**
- Identity: id, clientId (RR-YYMMDD-XXXX), fullName, firstName, lastName
- Contact: email, phone, dateOfBirth
- Address: address (line1, line2, city, state_county, postalCode)
- Previous Addresses: previousAddresses array, livedLessThan3Years
- Bank Details: bankName, accountName, sortCode (XX-XX-XX), accountNumber (8 digits)
- Document Checklist: identification, extraLender, questionnaire, poa (Power of Attorney)
- Status: status, lastActivity, daysInStage, source
- LOA: loaSubmitted, salesSignatureToken

**CLAIM FIELDS:**
- Core: id, contactId, lender, status, claimValue, productType, accountNumber
- Multi-Loan: numberOfLoans (1-50), loanDetails array (per loan: loanNumber, accountNumber, valueOfLoan, startDate, endDate, apr, charges)
- Finance: financeType, financeTypes (multi-select with account numbers)
- Charges: billedInterestCharges, latePaymentCharges, overlimitCharges, creditLimitIncreases, totalAmountOfDebt
- Payment: offerMade, totalRefund, totalDebt, balanceDueToClient, ourFeesPlusVat, vatAmount, totalFee
- Payment Plan: planStatus (Plan Set Up, Missed Payment, Not Set Up, Settled), planDate, termOfPlan, monthlyPaymentAgreed
- Documents: dsarReview, complaintParagraph, loaGenerated

**PRODUCT TYPES:** HCSTC, Credit Card, Motor Finance, Catalogue, Overdraft, Personal Loan

**SOURCES:** Client Filled, Manual Input, Website, Referral, AI Import, Bulk Import`
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              SKILL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const SKILLS = {
    crm_operations: {
        id: "crm_operations",
        name: "CRM Data Operations",
        description: "Create, update, search contacts and claims. Get detailed client/claim info. Manage the 48-stage pipeline.",
        enabled: true,
        tools: ["searchCRM", "getContactDetails", "getClaimDetails", "getClientClaims", "createContact", "updateContact", "manageClaim", "updateClaimStatus", "bulkClaimOperation", "getPipelineStats"]
    },
    file_operations: {
        id: "file_operations",
        name: "File & Bulk Operations",
        description: "Process uploaded CSV/Excel files. Bulk import contacts, add claims for existing clients, bulk updates.",
        enabled: true,
        tools: ["getUploadedFileData", "bulkImportContacts", "bulkAddClaimsForClients", "bulkUpdateFromFile", "uploadDocumentByName"]
    },
    document_analysis: {
        id: "document_analysis",
        name: "Document Analysis",
        description: "Analyze DSARs, bank statements, calculate affordability metrics.",
        enabled: true,
        tools: ["analyzeDSAR", "analyzeBankStatement", "calculateAffordability"]
    },
    legal_drafting: {
        id: "legal_drafting",
        name: "Legal Content Generation",
        description: "Draft complaint letters, FOS submissions, and client communications.",
        enabled: true,
        tools: ["draftComplaintLetter", "draftFOSSubmission", "draftClientCommunication"]
    },
    communication: {
        id: "communication",
        name: "Communication & Automation",
        description: "Send emails, SMS, WhatsApp. Trigger workflows and manage calendar.",
        enabled: true,
        tools: ["sendCommunication", "triggerWorkflow", "calendarAction"]
    },
    analytics: {
        id: "analytics",
        name: "Reports & Analytics",
        description: "Generate reports, pipeline stats, and create templates.",
        enabled: true,
        tools: ["generateReport", "createTemplate"]
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              TOOL DEFINITIONS (OpenAI Format)
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS = [
    // ═══════════════════════════════════════════════════════════════════════════
    //                          CRM DATA OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "searchCRM",
            description: "Search contacts, claims, or documents. Use FIRST before any operations.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Name, email, phone, ID, or keyword" },
                    entityType: { type: "string", enum: ["contact", "claim", "document", "all"], description: "Type to search" },
                    filters: {
                        type: "object",
                        properties: {
                            status: { type: "string" },
                            lender: { type: "string" },
                            dateFrom: { type: "string" },
                            dateTo: { type: "string" }
                        }
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getContactDetails",
            description: "Get COMPLETE details about a client including address, bank details, document checklist, all claims, and status. Use this when user asks for detailed information about a specific contact.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string", description: "Contact ID" },
                    contactName: { type: "string", description: "Contact full name (if ID not known)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getClaimDetails",
            description: "Get COMPLETE details about a specific claim including loan details, charges, payment plan, offer status, and all financial information.",
            parameters: {
                type: "object",
                properties: {
                    claimId: { type: "string", description: "Claim ID" },
                    lender: { type: "string", description: "Lender name (with contactName)" },
                    contactName: { type: "string", description: "Contact name (with lender)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getClientClaims",
            description: "Get ALL claims for a specific client with summary statistics. Use when asking how many claims a contact has or listing their claims.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string", description: "Contact ID" },
                    contactName: { type: "string", description: "Contact full name" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "createContact",
            description: "Create a new contact in the CRM.",
            parameters: {
                type: "object",
                properties: {
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    fullName: { type: "string", description: "Full name if first/last not provided" },
                    phone: { type: "string" },
                    email: { type: "string" },
                    dateOfBirth: { type: "string", description: "DD/MM/YYYY or YYYY-MM-DD" },
                    address: { type: "string", description: "Full address as string" },
                    source: { type: "string", enum: ["Manual Input", "Website", "Referral", "AI Import"] }
                },
                required: ["fullName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "updateContact",
            description: "Update an existing contact. Use searchCRM first to get the ID. IMPORTANT: Use 'address' for the current/main address. Use 'previousAddresses' to add/update previous addresses - do NOT put previous addresses in the 'address' field.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string", description: "Contact ID to update" },
                    updates: {
                        type: "object",
                        properties: {
                            firstName: { type: "string" },
                            lastName: { type: "string" },
                            phone: { type: "string" },
                            email: { type: "string" },
                            dateOfBirth: { type: "string" },
                            address: { type: "string", description: "Current/main address only. Do NOT put previous addresses here." },
                            previousAddresses: {
                                type: "array",
                                description: "Array of ALL previous addresses for this client. Include any existing previous addresses to keep them. Each entry is a separate past address.",
                                items: {
                                    type: "object",
                                    properties: {
                                        line1: { type: "string", description: "Street address" },
                                        line2: { type: "string", description: "Address line 2 (optional)" },
                                        city: { type: "string", description: "City or town" },
                                        county: { type: "string", description: "County or region" },
                                        postalCode: { type: "string", description: "UK postcode" }
                                    },
                                    required: ["line1", "city", "postalCode"]
                                }
                            }
                        }
                    }
                },
                required: ["contactId", "updates"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "manageClaim",
            description: "Create or update a claim/opportunity.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["create", "update"] },
                    contactId: { type: "string", description: "Required for create" },
                    claimId: { type: "string", description: "Required for update" },
                    lender: { type: "string" },
                    claimValue: { type: "number" },
                    status: { type: "string" },
                    productType: { type: "string", enum: ["HCSTC", "Credit Card", "Motor Finance", "Catalogue", "Overdraft", "Personal Loan"] },
                    accountNumber: { type: "string" },
                    loanDate: { type: "string" }
                },
                required: ["action"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "updateClaimStatus",
            description: "Move a claim through the 48-stage pipeline.",
            parameters: {
                type: "object",
                properties: {
                    claimId: { type: "string" },
                    newStatus: { type: "string", description: "Exact status name from pipeline" },
                    notes: { type: "string" }
                },
                required: ["claimId", "newStatus"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bulkClaimOperation",
            description: "Perform bulk actions on multiple claims matching criteria.",
            parameters: {
                type: "object",
                properties: {
                    lender: { type: "string" },
                    currentStatus: { type: "string" },
                    phase: { type: "string", enum: ["Lead Generation", "Onboarding", "DSAR", "Complaint", "FOS", "Payments"] },
                    minDaysInStage: { type: "number" },
                    action: { type: "string", enum: ["updateStatus", "assignUser", "addTag"] },
                    newValue: { type: "string" }
                },
                required: ["action", "newValue"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getPipelineStats",
            description: "Get dashboard statistics: KPIs, pipeline value, claim counts.",
            parameters: {
                type: "object",
                properties: {
                    breakdown: { type: "string", enum: ["phase", "lender", "status", "user", "date"] },
                    dateRange: {
                        type: "object",
                        properties: {
                            from: { type: "string" },
                            to: { type: "string" }
                        }
                    }
                }
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          FILE & BULK OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "getUploadedFileData",
            description: "Get the parsed data from a user-uploaded CSV or Excel file. Returns array of rows as objects with column headers as keys.",
            parameters: {
                type: "object",
                properties: {
                    preview: { type: "boolean", description: "If true, returns only first 5 rows for preview" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bulkImportContacts",
            description: "Import contacts from uploaded file. Auto-detects common column names like 'Name', 'Full Name', 'First Name'+'Last Name', 'Email', 'Phone', 'DOB', 'Address'. Just call this - it will handle mapping automatically.",
            parameters: {
                type: "object",
                properties: {
                    columnMapping: {
                        type: "object",
                        description: "Optional: Override auto-detection by specifying column names. Keys: fullName, firstName, lastName, email, phone, dateOfBirth, address. Values: actual column names from file.",
                        additionalProperties: { type: "string" }
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bulkAddClaimsForClients",
            description: "Add claims for existing clients from uploaded file. Auto-detects columns: 'Client'/'Name' for client matching, 'Lender' for lender. Matches clients by name and creates claims. Just call this - it handles mapping automatically.",
            parameters: {
                type: "object",
                properties: {
                    clientIdentifierColumn: { type: "string", description: "Optional: Override column name for client identification" },
                    lenderColumn: { type: "string", description: "Optional: Override column name for lender" },
                    additionalColumns: {
                        type: "object",
                        description: "Optional: Map columns to claim fields (claimValue, productType, accountNumber)",
                        additionalProperties: { type: "string" }
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "bulkUpdateFromFile",
            description: "Bulk update existing contacts or claims from uploaded file. Matches by name/ID and updates specified field.",
            parameters: {
                type: "object",
                properties: {
                    entityType: { type: "string", enum: ["contact", "claim"], description: "What to update: contact or claim" },
                    identifierColumn: { type: "string", description: "Column name to match records (e.g., 'Name', 'Client')" },
                    updateField: { type: "string", description: "Field to update (e.g., 'status', 'phone', 'email')" },
                    valueColumn: { type: "string", description: "Column containing new values" }
                },
                required: ["entityType", "updateField"]
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          DOCUMENT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "analyzeDSAR",
            description: "Analyze DSAR documents to extract loan details and identify breaches.",
            parameters: {
                type: "object",
                properties: {
                    textData: { type: "string", description: "Raw text from DSAR" },
                    contactId: { type: "string" },
                    extractFields: { type: "array", items: { type: "string" } }
                },
                required: ["textData"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyzeBankStatement",
            description: "Analyze bank statements for income, expenses, gambling, and affordability.",
            parameters: {
                type: "object",
                properties: {
                    textData: { type: "string" },
                    contactId: { type: "string" },
                    loanDate: { type: "string" },
                    analysisType: { type: "string", enum: ["full", "gambling_focus", "income_verification", "affordability"] }
                },
                required: ["textData"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculateAffordability",
            description: "Calculate DTI ratio, disposable income, and case qualification score.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string" },
                    income: {
                        type: "object",
                        properties: {
                            netMonthly: { type: "number" },
                            grossMonthly: { type: "number" },
                            source: { type: "string" }
                        },
                        required: ["netMonthly"]
                    },
                    expenses: {
                        type: "object",
                        properties: {
                            housing: { type: "number" },
                            utilities: { type: "number" },
                            councilTax: { type: "number" },
                            food: { type: "number" },
                            transport: { type: "number" },
                            insurance: { type: "number" },
                            childcare: { type: "number" },
                            debtPayments: { type: "number" },
                            other: { type: "number" }
                        }
                    },
                    loanAmount: { type: "number" },
                    monthlyRepayment: { type: "number" },
                    evidenceFactors: {
                        type: "object",
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
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          LEGAL CONTENT GENERATION
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "draftComplaintLetter",
            description: "Generate a formal complaint letter citing FCA CONC breaches.",
            parameters: {
                type: "object",
                properties: {
                    clientName: { type: "string" },
                    clientAddress: { type: "string" },
                    lenderName: { type: "string" },
                    accountNumber: { type: "string" },
                    loanDate: { type: "string" },
                    loanAmount: { type: "number" },
                    breaches: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                type: { type: "string" },
                                description: { type: "string" },
                                evidence: { type: "string" }
                            }
                        }
                    },
                    financialHarm: { type: "string" },
                    requestedRemedy: { type: "string" }
                },
                required: ["clientName", "lenderName", "breaches"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "draftFOSSubmission",
            description: "Generate a Financial Ombudsman Service submission.",
            parameters: {
                type: "object",
                properties: {
                    clientName: { type: "string" },
                    lenderName: { type: "string" },
                    caseReference: { type: "string" },
                    originalComplaintDate: { type: "string" },
                    finalResponseDate: { type: "string" },
                    finalResponseSummary: { type: "string" },
                    breachSummary: { type: "string" },
                    evidenceList: { type: "array", items: { type: "string" } },
                    reliefSought: { type: "string" },
                    additionalArguments: { type: "string" }
                },
                required: ["clientName", "lenderName", "breachSummary"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "draftClientCommunication",
            description: "Draft professional client communications.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string" },
                    communicationType: { type: "string", enum: ["status_update", "document_request", "offer_discussion", "fos_update", "general_query", "welcome"] },
                    subject: { type: "string" },
                    keyPoints: { type: "array", items: { type: "string" } },
                    tone: { type: "string", enum: ["formal", "friendly", "urgent"] },
                    includeNextSteps: { type: "boolean" }
                },
                required: ["communicationType"]
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          COMMUNICATION & AUTOMATION
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "sendCommunication",
            description: "Send message via Email, SMS, or WhatsApp.",
            parameters: {
                type: "object",
                properties: {
                    contactId: { type: "string" },
                    platform: { type: "string", enum: ["email", "sms", "whatsapp"] },
                    subject: { type: "string" },
                    message: { type: "string" },
                    templateId: { type: "string" },
                    attachments: { type: "array", items: { type: "string" } }
                },
                required: ["contactId", "platform", "message"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "triggerWorkflow",
            description: "Trigger an automated workflow in n8n.",
            parameters: {
                type: "object",
                properties: {
                    workflowName: { type: "string", enum: ["New Lead Sequence", "DSAR Follow-up", "8 Week Reminder", "FOS Deadline Alert", "Document Chase", "Payment Received"] },
                    contactId: { type: "string" },
                    parameters: { type: "object" }
                },
                required: ["workflowName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calendarAction",
            description: "Manage calendar appointments and reminders.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["schedule", "reschedule", "cancel", "list"] },
                    title: { type: "string" },
                    date: { type: "string" },
                    duration: { type: "number" },
                    contactId: { type: "string" },
                    claimId: { type: "string" },
                    reminderType: { type: "string", enum: ["call_back", "document_deadline", "fos_deadline", "8_week_check", "payment_due"] },
                    description: { type: "string" }
                },
                required: ["action"]
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    //                          REPORTS & ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: "function",
        function: {
            name: "generateReport",
            description: "Generate reports and analytics summaries.",
            parameters: {
                type: "object",
                properties: {
                    reportType: { type: "string", enum: ["pipeline_summary", "lender_performance", "conversion_funnel", "aging_report", "user_productivity", "financial_summary"] },
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
                    format: { type: "string", enum: ["summary", "detailed", "csv"] }
                },
                required: ["reportType"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "uploadDocumentByName",
            description: "Upload a pending PDF document to a contact's record under a specific lender. The filename format is 'Full Name - Lender Name.pdf'. Searches the contact by full name, finds or creates the claim for the specified lender, then uploads the document. Use this tool when the user confirms a PDF document upload.",
            parameters: {
                type: "object",
                properties: {
                    fullName: { type: "string", description: "The contact's full name extracted from the PDF filename" },
                    lenderName: { type: "string", description: "The lender name extracted from the PDF filename" },
                    fileName: { type: "string", description: "The original PDF filename" }
                },
                required: ["fullName", "lenderName", "fileName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "createTemplate",
            description: "Create a reusable document template.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    category: { type: "string", enum: ["Client", "Legal", "General", "Corporate"] },
                    content: { type: "string" },
                    description: { type: "string" },
                    variables: { type: "array", items: { type: "string" } }
                },
                required: ["name", "content"]
            }
        }
    }
];

// ═══════════════════════════════════════════════════════════════════════════════
//                              SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the system prompt based on enabled skills and context
 * @param {Object} options - Configuration options
 * @param {Array} options.enabledSkills - List of skill IDs to enable
 * @param {Object} options.context - Current context (contact/claim being viewed)
 * @param {boolean} options.compact - Use compact prompt to save tokens
 * @returns {string} The system prompt
 */
export function buildSystemPrompt(options = {}) {
    const { enabledSkills = Object.keys(SKILLS), context = null, compact = false } = options;

    // Core identity - always included
    let prompt = `You are FastAction AI, the intelligent CRM assistant for FastAction Claims, a UK firm specializing in Irresponsible Lending claims.

You have FULL CRM access to create, update, search contacts and claims. You understand every feature, regulation, and workflow.

`;

    // Add only relevant knowledge based on context
    if (!compact) {
        // Add regulations knowledge
        prompt += `## FCA Regulations (Key Points)
${KNOWLEDGE_BASE.regulations.content}

## Pipeline Stages
${KNOWLEDGE_BASE.pipeline.content}

## Lender Knowledge
${KNOWLEDGE_BASE.lenders.content}

## Affordability Metrics
${KNOWLEDGE_BASE.affordability.content}

`;
    } else {
        // Compact version - just key references
        prompt += `## Quick Reference
- CONC 5.2A: Creditworthiness assessment requirements
- 48-stage pipeline from Lead to Payment
- DTI >40% = unaffordability indicator
- FOS 8-week rule for complaints
- Calculate qualification score (0-100) for case strength

`;
    }

    // Add current context if available
    if (context) {
        prompt += `## CURRENT CONTEXT
You are viewing: ${context.type} - ${context.name || 'N/A'} (ID: ${context.id || 'N/A'})
When user says "this contact", "this claim", "update status", etc., they refer to the above entity.

`;
    }

    // Behavioral directives - always included
    prompt += `## DIRECTIVES
1. Use context implicitly - "Update his status" = current contact
2. **For questions about a specific client/claim, use getContactDetails, getClaimDetails, or getClientClaims to get COMPLETE information**
3. When asked "how many claims does X have" - use getClientClaims tool
4. When asked for client details - use getContactDetails to get full info including address, bank details, document checklist
5. When asked about a specific claim - use getClaimDetails to get complete claim info including loan details, charges, payment plan
6. Search first before modifications - verify entities exist
7. Be concise and action-oriented - provide specific numbers and details
8. Cite specific CONC rules when drafting legal content
9. For bulk operations, confirm the scope before executing
10. Provide status confirmations and suggest next steps
11. **CRITICAL - Previous Addresses vs Current Address:** When asked to add/update PREVIOUS addresses, use the 'previousAddresses' array field - NEVER modify the 'address' field. Previous addresses are separate from the current address. Always include ALL existing previous addresses in the array along with new ones, as this replaces the full list. Use getContactDetails first to see existing previous addresses before adding new ones.`;

    return prompt;
}

/**
 * Get tools for enabled skills only
 * @param {Array} enabledSkills - List of skill IDs to enable
 * @returns {Array} Filtered tools array
 */
export function getEnabledTools(enabledSkills = Object.keys(SKILLS)) {
    const enabledToolNames = new Set();

    enabledSkills.forEach(skillId => {
        const skill = SKILLS[skillId];
        if (skill && skill.enabled) {
            skill.tools.forEach(tool => enabledToolNames.add(tool));
        }
    });

    return TOOLS.filter(tool => enabledToolNames.has(tool.function.name));
}

/**
 * Get a concise context summary for token optimization
 * @param {Object} context - Full context object
 * @returns {string} Compact context string
 */
export function getCompactContext(context) {
    if (!context) return null;

    const { type, id, name, data } = context;
    let summary = `[${type.toUpperCase()}] ${name || 'Unknown'}`;

    if (data) {
        if (type === 'contact') {
            summary += ` | Status: ${data.status || 'N/A'} | Claims: ${data.claimsCount || 0}`;
        } else if (type === 'claim') {
            summary += ` | Lender: ${data.lender || 'N/A'} | Status: ${data.status || 'N/A'} | Value: £${data.claimValue || 0}`;
        }
    }

    return summary;
}

// Default export for easy importing
export default {
    KNOWLEDGE_BASE,
    SKILLS,
    TOOLS,
    buildSystemPrompt,
    getEnabledTools,
    getCompactContext
};
