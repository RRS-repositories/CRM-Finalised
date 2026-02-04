
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Loader2, ChevronRight, FileText, BarChart2, Calendar, CheckCircle, Upload, X, FileSpreadsheet } from 'lucide-react';
import { ChatMessage } from '../types';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';
import * as XLSX from 'xlsx';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

const API_BASE = API_ENDPOINTS.base;

// Smart column matching - handles various naming conventions
const COLUMN_PATTERNS: Record<string, { keywords: string[]; priority: string[] }> = {
  fullName: {
    keywords: ['fullname', 'full_name', 'name', 'client', 'contact', 'customername', 'customer_name', 'clientname', 'client_name', 'contactname', 'contact_name', 'person'],
    priority: ['full name', 'fullname', 'name', 'client name', 'contact name']
  },
  firstName: {
    keywords: ['firstname', 'first_name', 'fname', 'first', 'given', 'givenname', 'given_name', 'forename'],
    priority: ['first name', 'firstname', 'first', 'fname']
  },
  lastName: {
    keywords: ['lastname', 'last_name', 'lname', 'last', 'surname', 'familyname', 'family_name', 'family'],
    priority: ['last name', 'lastname', 'surname', 'last', 'lname']
  },
  email: {
    keywords: ['email', 'e-mail', 'emailaddress', 'email_address', 'mail', 'emailid', 'email_id'],
    priority: ['email', 'e-mail', 'email address']
  },
  phone: {
    keywords: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'cellphone', 'phonenumber', 'phone_number', 'contact_number', 'contactnumber', 'mob', 'landline'],
    priority: ['phone', 'mobile', 'telephone', 'tel', 'phone number']
  },
  dateOfBirth: {
    keywords: ['dob', 'dateofbirth', 'date_of_birth', 'birthdate', 'birth_date', 'birthday', 'born', 'birth'],
    priority: ['date of birth', 'dob', 'birthdate', 'birthday']
  },
  address: {
    keywords: ['address', 'fulladdress', 'full_address', 'streetaddress', 'street_address', 'location', 'addr', 'street'],
    priority: ['address', 'full address', 'street address']
  },
  lender: {
    keywords: ['lender', 'company', 'creditor', 'provider', 'bank', 'lendername', 'lender_name', 'financeprovider', 'finance_provider', 'institution'],
    priority: ['lender', 'company', 'creditor', 'provider']
  },
  claimValue: {
    keywords: ['claimvalue', 'claim_value', 'value', 'amount', 'debt', 'balance', 'total', 'sum', 'outstanding'],
    priority: ['claim value', 'value', 'amount', 'debt', 'balance']
  },
  productType: {
    keywords: ['producttype', 'product_type', 'product', 'type', 'loantype', 'loan_type', 'credittype', 'credit_type', 'category'],
    priority: ['product type', 'product', 'type', 'loan type']
  },
  accountNumber: {
    keywords: ['accountnumber', 'account_number', 'account', 'accno', 'acc_no', 'accountno', 'account_no', 'reference', 'ref', 'acct'],
    priority: ['account number', 'account', 'acc no', 'reference']
  },
  status: {
    keywords: ['status', 'state', 'stage', 'newstatus', 'new_status', 'currentstatus', 'current_status'],
    priority: ['status', 'new status', 'stage', 'state']
  }
};

// Normalize a string for matching: lowercase, remove special chars, trim
const normalizeStr = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

// Find the best matching column in a row for a given field type
const findSmartColumn = (row: Record<string, any>, fieldType: keyof typeof COLUMN_PATTERNS, overrideName?: string): string => {
  // If override provided and exists, use it
  if (overrideName) {
    const exactKey = Object.keys(row).find(k => k === overrideName);
    if (exactKey && row[exactKey] !== undefined && row[exactKey] !== '') {
      return String(row[exactKey]).trim();
    }
    // Try case-insensitive
    const caseKey = Object.keys(row).find(k => k.toLowerCase() === overrideName.toLowerCase());
    if (caseKey && row[caseKey] !== undefined && row[caseKey] !== '') {
      return String(row[caseKey]).trim();
    }
  }

  const pattern = COLUMN_PATTERNS[fieldType];
  if (!pattern) return '';

  const rowKeys = Object.keys(row);

  // Try priority matches first (exact, case-insensitive)
  for (const pName of pattern.priority) {
    const key = rowKeys.find(k => k.toLowerCase().trim() === pName.toLowerCase());
    if (key && row[key] !== undefined && row[key] !== '') {
      return String(row[key]).trim();
    }
  }

  // Try normalized keyword matching
  for (const keyword of pattern.keywords) {
    const key = rowKeys.find(k => normalizeStr(k) === keyword || normalizeStr(k).includes(keyword) || keyword.includes(normalizeStr(k)));
    if (key && row[key] !== undefined && row[key] !== '') {
      return String(row[key]).trim();
    }
  }

  // Try partial/contains matching
  for (const keyword of pattern.keywords) {
    const key = rowKeys.find(k => {
      const normK = normalizeStr(k);
      return normK.includes(keyword.slice(0, 4)) || keyword.includes(normK.slice(0, 4));
    });
    if (key && row[key] !== undefined && row[key] !== '') {
      return String(row[key]).trim();
    }
  }

  return '';
};

// Get full name from row - prioritizes First Name + Last Name over generic "Name" column
const getFullNameFromRow = (row: Record<string, any>, mapping?: any): string => {
  const rowKeys = Object.keys(row);
  const normalizedKeys = rowKeys.map(k => k.toLowerCase().replace(/[^a-z]/g, ''));

  // Check if there are separate first/last name columns
  const hasFirstNameCol = normalizedKeys.some(k =>
    k.includes('first') || k === 'fname' || k === 'givenname' || k === 'forename'
  );
  const hasLastNameCol = normalizedKeys.some(k =>
    k.includes('last') || k === 'lname' || k === 'surname' || k === 'familyname'
  );

  // If we have separate first/last name columns, use them (even if there's also a "Name" column)
  if (hasFirstNameCol || hasLastNameCol) {
    const firstName = findSmartColumn(row, 'firstName', mapping?.firstName);
    const lastName = findSmartColumn(row, 'lastName', mapping?.lastName);
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
  }

  // Otherwise try to find a full name column
  let fullName = findSmartColumn(row, 'fullName', mapping?.fullName || mapping?.name);
  if (fullName) {
    return fullName;
  }

  // Last resort: look for any column with "name" in it and use its value
  for (const key of rowKeys) {
    const normKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (normKey.includes('name') && row[key]) {
      return String(row[key]).trim();
    }
  }

  return '';
};

// Parse date from various formats and convert to YYYY-MM-DD for PostgreSQL
const parseDate = (dateStr: string): string | undefined => {
  if (!dateStr || dateStr.trim() === '') return undefined;

  const cleaned = dateStr.trim();

  // Already in ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Try DD-MM-YYYY or DD/MM/YYYY (UK format - most common in UK CSV files)
  const ukMatch = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    // Validate: if day > 12, it's definitely DD-MM-YYYY
    // If both are <= 12, assume UK format (DD-MM-YYYY) since this is UK CRM
    return `${year}-${month}-${day}`;
  }

  // Try YYYY/MM/DD
  const isoSlash = cleaned.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (isoSlash) {
    const year = isoSlash[1];
    const month = isoSlash[2].padStart(2, '0');
    const day = isoSlash[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Try natural date formats like "19 Jan 1993" or "January 19, 1993"
  const months: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06',
    jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12'
  };

  // "19 Jan 1993" or "19-Jan-1993"
  const naturalMatch1 = cleaned.match(/^(\d{1,2})[\s\-]+([a-zA-Z]+)[\s\-,]+(\d{4})$/);
  if (naturalMatch1) {
    const day = naturalMatch1[1].padStart(2, '0');
    const monthName = naturalMatch1[2].toLowerCase();
    const month = months[monthName] || months[monthName.slice(0, 3)];
    const year = naturalMatch1[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // "Jan 19, 1993" or "January 19 1993"
  const naturalMatch2 = cleaned.match(/^([a-zA-Z]+)[\s\-]+(\d{1,2})[\s\-,]+(\d{4})$/);
  if (naturalMatch2) {
    const monthName = naturalMatch2[1].toLowerCase();
    const month = months[monthName] || months[monthName.slice(0, 3)];
    const day = naturalMatch2[2].padStart(2, '0');
    const year = naturalMatch2[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // Try DD.MM.YYYY (European format)
  const euroMatch = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (euroMatch) {
    const day = euroMatch[1].padStart(2, '0');
    const month = euroMatch[2].padStart(2, '0');
    const year = euroMatch[3];
    return `${year}-${month}-${day}`;
  }

  // If nothing matches, return undefined
  console.warn(`Could not parse date: "${dateStr}"`);
  return undefined;
};

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
  const {
    updateContactStatus,
    updateContact,
    updateContactExtended,
    addContact,
    addClaim,
    updateClaim,
    getPipelineStats,
    addTemplate,
    addDocument,
    claims,
    contacts,
    appointments,
    activeContext,
    bulkUpdateClaims,
    addAppointment
  } = useCRM();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "👋 Welcome! I'm FastAction AI, your intelligent CRM assistant.\n\n**What I can do:**\n\n📋 **CRM Operations**\n• Create & update contacts and claims\n• Move claims through the 48-stage pipeline\n• Bulk operations (e.g., 'Move all Vanquis claims to FOS')\n\n📊 **Analysis**\n• Analyze DSARs and bank statements\n• Calculate affordability & qualification scores\n• Generate reports and pipeline stats\n\n📝 **Legal Drafting**\n• Draft complaint letters citing FCA CONC\n• Generate FOS submissions\n• Create client communications\n\n⚡ **Automation**\n• Trigger workflows\n• Schedule appointments & reminders\n• Send emails, SMS, WhatsApp\n\n📁 **File Upload**\n• Upload CSV/Excel files for bulk import\n• Add multiple claims for existing clients\n• Bulk update records from spreadsheet\n• Upload PDF documents (named \"Client Name - Lender.pdf\")\n\n**Try asking:**\n• \"Create a contact named John Smith\"\n• \"Show me pipeline statistics\"\n• Upload a file and say \"Import these contacts\"\n• Upload a PDF named \"John Smith - Vanquis.pdf\" to attach it to the client\n\nHow can I help you today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; data: any[] } | null>(null);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Parse CSV line handling quoted fields with commas
  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Handle escaped quotes (two consecutive quotes)
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip the next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Don't forget the last value
    values.push(current.trim());

    return values;
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isPDF = fileName.endsWith('.pdf');

    if (!isCSV && !isExcel && !isPDF) {
      alert('Please upload a CSV, Excel, or PDF file (.csv, .xlsx, .xls, .pdf)');
      return;
    }

    // Handle PDF document upload (format: "Full Name - Lender Name.pdf")
    if (isPDF) {
      const nameWithoutExt = file.name.replace(/\.pdf$/i, '');
      const parts = nameWithoutExt.split(' - ');

      if (parts.length < 2) {
        alert('PDF filename must be in format: "Full Name - Lender Name.pdf"\n\nExample: John Smith - Vanquis.pdf');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const fullName = parts[0].trim();
      const lenderName = parts.slice(1).join(' - ').trim();

      setPendingPdfFile(file);

      const fileMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: `📄 Uploaded document: **${file.name}**\n\n*Detected client:* **${fullName}**\n*Detected lender:* **${lenderName}**`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, fileMsg]);

      const ackMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `I've detected a document upload for:\n\n• **Client:** ${fullName}\n• **Lender:** ${lenderName}\n\nI'll search for this contact and upload the document under the correct lender. Say **"upload"** to proceed or **"skip"** to cancel.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, ackMsg]);

      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      let parsedData: any[] = [];

      if (isCSV) {
        // Parse CSV with proper handling of quoted fields
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) return;

        const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
        parsedData = lines.slice(1).map(line => {
          const values = parseCSVLine(line).map(v => v.replace(/^"|"$/g, '').trim());
          const row: Record<string, string> = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });
          return row;
        }).filter(row => Object.values(row).some(v => v)); // Filter out empty rows
      } else {
        // Parse Excel
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet);
      }

      setUploadedFile({ name: file.name, data: parsedData });

      // Add a message showing file was uploaded
      const fileMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: `📁 Uploaded file: **${file.name}**\n\n*${parsedData.length} rows detected*\n\nColumns: ${Object.keys(parsedData[0] || {}).join(', ')}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, fileMsg]);

      // AI acknowledges the file
      const ackMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `I've received your file **${file.name}** with ${parsedData.length} rows.\n\n**What would you like me to do with this data?**\n\n• "Import these as new contacts"\n• "Add these as claims for existing clients"\n• "Bulk update statuses based on this file"\n• "Show me a preview of the data"`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, ackMsg]);

    } catch (error) {
      console.error('File parsing error:', error);
      alert('Error parsing file. Please check the format and try again.');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
  };

  // Execute tool calls and return results
  const executeToolCall = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    console.log("AI calling tool:", name, args);

    try {
      // ═══════════════════════════════════════════════════════════════════════════
      //                          CRM DATA OPERATIONS
      // ═══════════════════════════════════════════════════════════════════════════

      if (name === 'searchCRM') {
        const { query, entityType, filters } = args as { query: string; entityType?: string; filters?: any };
        const qLower = query.toLowerCase();

        let foundContacts: any[] = [];
        let foundClaims: any[] = [];

        // First, find matching contacts
        if (entityType === 'contact' || entityType === 'all' || !entityType) {
          foundContacts = contacts.filter(c => {
            const matches = c.fullName?.toLowerCase().includes(qLower) ||
              c.email?.toLowerCase().includes(qLower) ||
              c.phone?.includes(query) ||
              String(c.id) === query;

            // Apply filters if provided
            if (filters?.status && c.status !== filters.status) return false;
            if (filters?.lender && c.lender !== filters.lender) return false;

            return matches;
          });
        }

        // Get IDs of matching contacts to find their claims
        const matchingContactIds = foundContacts.map(c => c.id);

        if (entityType === 'claim' || entityType === 'all' || !entityType) {
          foundClaims = claims.filter(c => {
            // Match by claim properties
            const directMatch = String(c.id) === query ||
              c.lender?.toLowerCase().includes(qLower) ||
              c.accountNumber?.toLowerCase().includes(qLower);

            // Also match claims belonging to contacts that match the query
            const contactMatch = matchingContactIds.includes(c.contactId);

            // Find the contact for this claim to check contact name
            const claimContact = contacts.find(con => con.id === c.contactId);
            const contactNameMatch = claimContact?.fullName?.toLowerCase().includes(qLower);

            const matches = directMatch || contactMatch || contactNameMatch;

            // Apply filters if provided
            if (filters?.status && c.status !== filters.status) return false;
            if (filters?.lender && c.lender !== filters.lender) return false;

            return matches;
          });
        }

        // Enrich claims with contact names
        const enrichedClaims = foundClaims.map(c => {
          const contact = contacts.find(con => con.id === c.contactId);
          return { ...c, contactName: contact?.fullName };
        });

        return {
          contacts: foundContacts.map(c => ({
            id: c.id,
            name: c.fullName,
            email: c.email,
            phone: c.phone,
            status: c.status,
            lender: c.lender,
            claimsCount: claims.filter(cl => cl.contactId === c.id).length
          })),
          claims: enrichedClaims,
          totalFound: foundContacts.length + foundClaims.length
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                     DETAILED DATA RETRIEVAL TOOLS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'getContactDetails') {
        const { contactId, contactName } = args as { contactId?: string; contactName?: string };

        let contact: any = null;
        if (contactId) {
          contact = contacts.find(c => String(c.id) === String(contactId));
        } else if (contactName) {
          contact = contacts.find(c => c.fullName?.toLowerCase().includes(contactName.toLowerCase()));
        }

        if (!contact) {
          return { success: false, message: `Contact not found with ${contactId ? 'ID: ' + contactId : 'name: ' + contactName}` };
        }

        // Get all claims for this contact
        const contactClaims = claims.filter(cl => cl.contactId === contact.id);

        return {
          success: true,
          contact: {
            // Core Identity
            id: contact.id,
            clientId: contact.clientId,
            fullName: contact.fullName,
            firstName: contact.firstName,
            lastName: contact.lastName,

            // Contact Info
            email: contact.email,
            phone: contact.phone,
            dateOfBirth: contact.dateOfBirth,

            // Address
            address: contact.address,
            previousAddresses: contact.previousAddresses,
            livedLessThan3Years: contact.livedLessThan3Years,

            // Bank Details
            bankDetails: contact.bankDetails,

            // Document Status
            documentChecklist: contact.documentChecklist || {
              identification: false,
              extraLender: false,
              questionnaire: false,
              poa: false
            },

            // Status & Source
            status: contact.status,
            source: contact.source,
            lastActivity: contact.lastActivity,
            daysInStage: contact.daysInStage,

            // LOA Status
            loaSubmitted: contact.loa_submitted,

            // Timestamps
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt
          },
          claims: contactClaims.map(cl => ({
            id: cl.id,
            lender: cl.lender,
            status: cl.status,
            claimValue: cl.claimValue,
            productType: cl.productType,
            accountNumber: cl.accountNumber,
            daysInStage: cl.daysInStage
          })),
          summary: {
            totalClaims: contactClaims.length,
            totalClaimValue: contactClaims.reduce((sum, cl) => sum + (cl.claimValue || 0), 0),
            claimStatuses: contactClaims.map(cl => cl.status)
          }
        };
      }

      else if (name === 'getClaimDetails') {
        const { claimId, lender, contactName } = args as { claimId?: string; lender?: string; contactName?: string };

        let claim: any = null;
        if (claimId) {
          claim = claims.find(c => String(c.id) === String(claimId));
        } else if (lender && contactName) {
          const contact = contacts.find(c => c.fullName?.toLowerCase().includes(contactName.toLowerCase()));
          if (contact) {
            claim = claims.find(c => c.contactId === contact.id && c.lender?.toLowerCase().includes(lender.toLowerCase()));
          }
        }

        if (!claim) {
          return { success: false, message: 'Claim not found' };
        }

        const contact = contacts.find(c => c.id === claim.contactId);

        return {
          success: true,
          claim: {
            // Core Info
            id: claim.id,
            contactId: claim.contactId,
            contactName: contact?.fullName,

            // Lender & Product
            lender: claim.lender,
            lenderOther: claim.lenderOther,
            productType: claim.productType,
            financeType: claim.financeType,
            financeTypes: claim.financeTypes,
            accountNumber: claim.accountNumber,

            // Status & Pipeline
            status: claim.status,
            specStatus: claim.specStatus,
            daysInStage: claim.daysInStage,

            // Loan Details
            numberOfLoans: claim.numberOfLoans,
            loanDetails: claim.loanDetails,
            claimValue: claim.claimValue,
            apr: claim.apr,
            outstandingBalance: claim.outstandingBalance,

            // Charges
            billedInterestCharges: claim.billedInterestCharges,
            latePaymentCharges: claim.latePaymentCharges,
            overlimitCharges: claim.overlimitCharges,
            creditLimitIncreases: claim.creditLimitIncreases,
            totalAmountOfDebt: claim.totalAmountOfDebt,

            // Payment Section
            offerMade: claim.offerMade,
            totalRefund: claim.totalRefund,
            totalDebt: claim.totalDebt,
            balanceDueToClient: claim.balanceDueToClient,
            ourFeesPlusVat: claim.ourFeesPlusVat,
            ourFeesMinusVat: claim.ourFeesMinusVat,
            vatAmount: claim.vatAmount,
            totalFee: claim.totalFee,
            outstandingDebt: claim.outstandingDebt,

            // Payment Plan
            paymentPlan: claim.paymentPlan,

            // Documents & Notes
            dsarReview: claim.dsarReview,
            complaintParagraph: claim.complaintParagraph,
            loaGenerated: claim.loa_generated,

            // Dates
            startDate: claim.startDate,
            createdAt: claim.createdAt,
            updatedAt: claim.updatedAt
          }
        };
      }

      else if (name === 'getClientClaims') {
        const { contactId, contactName } = args as { contactId?: string; contactName?: string };

        let contact: any = null;
        if (contactId) {
          contact = contacts.find(c => String(c.id) === String(contactId));
        } else if (contactName) {
          contact = contacts.find(c => c.fullName?.toLowerCase().includes(contactName.toLowerCase()));
        }

        if (!contact) {
          return { success: false, message: `Contact not found`, contactsFound: 0 };
        }

        const clientClaims = claims.filter(cl => cl.contactId === contact.id);

        return {
          success: true,
          contact: {
            id: contact.id,
            name: contact.fullName,
            email: contact.email,
            phone: contact.phone
          },
          totalClaims: clientClaims.length,
          totalValue: clientClaims.reduce((sum, cl) => sum + (cl.claimValue || 0), 0),
          claims: clientClaims.map(cl => ({
            id: cl.id,
            lender: cl.lender,
            status: cl.status,
            claimValue: cl.claimValue,
            productType: cl.productType,
            accountNumber: cl.accountNumber,
            numberOfLoans: cl.numberOfLoans,
            daysInStage: cl.daysInStage,
            offerMade: cl.offerMade,
            loaGenerated: cl.loa_generated
          }))
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                     FILE PROCESSING & BULK OPERATIONS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'getUploadedFileData') {
        if (!uploadedFile) {
          return { success: false, message: 'No file has been uploaded. Please upload a CSV or Excel file first.' };
        }
        return {
          success: true,
          fileName: uploadedFile.name,
          rowCount: uploadedFile.data.length,
          columns: Object.keys(uploadedFile.data[0] || {}),
          preview: uploadedFile.data.slice(0, 5), // First 5 rows as preview
          allData: uploadedFile.data
        };
      }

      else if (name === 'bulkImportContacts') {
        if (!uploadedFile) {
          return { success: false, message: 'No file uploaded. Please upload a CSV/Excel file first.' };
        }

        const { columnMapping } = args as any;
        const totalRows = uploadedFile.data.length;
        const CHUNK_SIZE = 1000; // Send 1000 contacts per API call

        // Log detected columns
        const sampleRow = uploadedFile.data[0] || {};
        const detectedColumns = Object.keys(sampleRow);
        console.log(`Bulk Import - Starting import of ${totalRows} rows`);
        console.log('Detected columns:', detectedColumns);

        // Step 1: Parse all rows using smart column matching
        const parsedContacts: any[] = [];
        const parseErrors: string[] = [];
        let skippedDuplicates = 0;

        // Build a set of existing emails/names for faster duplicate checking
        const existingEmails = new Set(contacts.map(c => c.email?.toLowerCase()).filter(Boolean));
        const existingNames = new Set(contacts.map(c => c.fullName?.toLowerCase()).filter(Boolean));

        for (let i = 0; i < totalRows; i++) {
          const row = uploadedFile.data[i];

          // Extract fields using smart column matching
          const fullName = getFullNameFromRow(row, columnMapping);
          const email = findSmartColumn(row, 'email', columnMapping?.email);
          const phone = findSmartColumn(row, 'phone', columnMapping?.phone);
          const dob = findSmartColumn(row, 'dateOfBirth', columnMapping?.dateOfBirth);
          const address = findSmartColumn(row, 'address', columnMapping?.address);

          if (!fullName) {
            parseErrors.push(`Row ${i + 1}: No name found`);
            continue;
          }

          // Check for duplicates against existing contacts
          if (existingNames.has(fullName.toLowerCase()) || (email && existingEmails.has(email.toLowerCase()))) {
            skippedDuplicates++;
            continue;
          }

          // Also check for duplicates within the file itself
          existingNames.add(fullName.toLowerCase());
          if (email) existingEmails.add(email.toLowerCase());

          parsedContacts.push({
            fullName,
            email: email || null,
            phone: phone || null,
            dateOfBirth: parseDate(dob) || null,
            addressLine1: address || null
          });
        }

        console.log(`Parsed ${parsedContacts.length} valid contacts, ${skippedDuplicates} duplicates, ${parseErrors.length} errors`);

        if (parsedContacts.length === 0) {
          clearUploadedFile();
          return {
            success: false,
            message: `No valid contacts to import. ${skippedDuplicates} duplicates skipped, ${parseErrors.length} rows had errors.`,
            totalRows,
            skipped: skippedDuplicates,
            failed: parseErrors.length,
            errors: parseErrors.slice(0, 10) // Only show first 10 errors
          };
        }

        // Step 2: Send to bulk API in chunks
        let totalCreated = 0;
        let totalFailed = 0;
        const apiErrors: string[] = [];

        for (let chunkStart = 0; chunkStart < parsedContacts.length; chunkStart += CHUNK_SIZE) {
          const chunk = parsedContacts.slice(chunkStart, chunkStart + CHUNK_SIZE);
          const chunkNum = Math.floor(chunkStart / CHUNK_SIZE) + 1;
          const totalChunks = Math.ceil(parsedContacts.length / CHUNK_SIZE);

          console.log(`Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} contacts)`);

          try {
            const response = await fetch(`${API_BASE}/api/contacts/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contacts: chunk })
            });

            const result = await response.json();

            if (result.success) {
              totalCreated += result.created || 0;
              totalFailed += result.failed || 0;
              if (result.errors) {
                apiErrors.push(...result.errors.slice(0, 5).map((e: any) => `${e.error}`));
              }
            } else {
              totalFailed += chunk.length;
              apiErrors.push(`Chunk ${chunkNum} failed: ${result.message || 'Unknown error'}`);
            }
          } catch (err: any) {
            totalFailed += chunk.length;
            apiErrors.push(`Chunk ${chunkNum} network error: ${err.message}`);
          }
        }

        console.log(`Bulk Import Complete: ${totalCreated} created, ${totalFailed} failed`);
        clearUploadedFile();

        // Refresh contacts list
        try {
          const refreshResponse = await fetch(`${API_BASE}/api/contacts`);
          if (refreshResponse.ok) {
            // The CRM context will handle this via its own refresh mechanism
          }
        } catch (e) { /* ignore refresh error */ }

        return {
          success: totalCreated > 0,
          message: `Bulk import complete: ${totalCreated.toLocaleString()} contacts created` +
                   (skippedDuplicates > 0 ? `, ${skippedDuplicates.toLocaleString()} duplicates skipped` : '') +
                   (totalFailed > 0 ? `, ${totalFailed.toLocaleString()} failed` : ''),
          totalRows,
          detectedColumns,
          created: totalCreated,
          skipped: skippedDuplicates,
          failed: totalFailed + parseErrors.length,
          errors: [...parseErrors.slice(0, 5), ...apiErrors.slice(0, 5)]
        };
      }

      else if (name === 'bulkAddClaimsForClients') {
        if (!uploadedFile) {
          return { success: false, message: 'No file uploaded. Please upload a CSV/Excel file first.' };
        }

        const { clientIdentifierColumn, lenderColumn, additionalColumns } = args as any;
        const totalRows = uploadedFile.data.length;
        const CHUNK_SIZE = 1000;

        // Log first row to understand structure
        console.log(`Bulk Claims Import - Starting with ${totalRows} rows`);
        console.log('Sample row:', uploadedFile.data[0]);
        console.log('Columns:', Object.keys(uploadedFile.data[0] || {}));

        // Build lookup maps for faster matching - by name AND by email
        const contactsByName = new Map<string, any>();
        const contactsByEmail = new Map<string, any>();
        const contactsById = new Map<number, any>();
        for (const c of contacts) {
          if (c.fullName) contactsByName.set(c.fullName.toLowerCase().trim(), c);
          if (c.email) contactsByEmail.set(c.email.toLowerCase().trim(), c);
          contactsById.set(c.id, c);
        }

        console.log(`Contacts lookup: ${contactsByName.size} by name, ${contactsByEmail.size} by email`);

        // Build existing claims set for duplicate detection
        const existingClaimsSet = new Set(
          claims.map(cl => `${cl.contactId}-${cl.lender?.toLowerCase()}`)
        );

        // Parse all rows
        const validClaims: any[] = [];
        const notFoundClients: string[] = [];
        const parseErrors: string[] = [];
        let skippedDuplicates = 0;
        let matchedByEmail = 0;
        let matchedByName = 0;

        for (let i = 0; i < totalRows; i++) {
          const row = uploadedFile.data[i];

          // Get lender (required)
          const lender = findSmartColumn(row, 'lender', lenderColumn);
          if (!lender) {
            parseErrors.push(`Row ${i + 1}: Missing lender`);
            continue;
          }

          // Try to get client identifier - could be name or email
          const clientName = getFullNameFromRow(row, { fullName: clientIdentifierColumn });
          const clientEmail = findSmartColumn(row, 'email', clientIdentifierColumn);
          const claimValueStr = findSmartColumn(row, 'claimValue', additionalColumns?.claimValue);
          const claimValue = parseFloat(claimValueStr.replace(/[£$,]/g, '')) || 0;
          const productType = findSmartColumn(row, 'productType', additionalColumns?.productType);
          const accountNumber = findSmartColumn(row, 'accountNumber', additionalColumns?.accountNumber);

          // Find contact - try email first, then name
          let contact: any = null;
          let identifier = '';

          // Try matching by email first (most reliable)
          if (clientEmail) {
            contact = contactsByEmail.get(clientEmail.toLowerCase().trim());
            if (contact) {
              matchedByEmail++;
              identifier = clientEmail;
            }
          }

          // If no email match, try by name
          if (!contact && clientName) {
            contact = contactsByName.get(clientName.toLowerCase().trim());
            if (!contact) {
              // Try fuzzy match
              for (const [name, c] of contactsByName) {
                if (name.includes(clientName.toLowerCase()) || clientName.toLowerCase().includes(name)) {
                  contact = c;
                  break;
                }
              }
            }
            if (contact) {
              matchedByName++;
              identifier = clientName;
            }
          }

          if (!contact) {
            notFoundClients.push(clientEmail || clientName || `Row ${i + 1}`);
            continue;
          }

          // Check for duplicates
          const claimKey = `${contact.id}-${lender.toLowerCase()}`;
          if (existingClaimsSet.has(claimKey)) {
            skippedDuplicates++;
            continue;
          }
          existingClaimsSet.add(claimKey); // Prevent duplicates within file

          validClaims.push({
            contactId: contact.id,
            lender,
            claimValue,
            productType: productType || null,
            accountNumber: accountNumber || null,
            status: 'New Lead'
          });
        }

        console.log(`Matching results: ${matchedByEmail} by email, ${matchedByName} by name, ${notFoundClients.length} not found`);

        console.log(`Parsed ${validClaims.length} valid claims, ${notFoundClients.length} not found, ${skippedDuplicates} duplicates`);

        if (validClaims.length === 0) {
          clearUploadedFile();

          // Show more debug info
          const sampleEmails = [...new Set(notFoundClients)].slice(0, 10);
          const dbSampleEmails = Array.from(contactsByEmail.keys()).slice(0, 5);

          return {
            success: false,
            message: `No valid claims to create. ${notFoundClients.length} clients not found in CRM. Check that emails/names in your file match existing contacts.`,
            debug: {
              totalRowsInFile: totalRows,
              contactsInCRM: contacts.length,
              contactsWithEmail: contactsByEmail.size,
              sampleEmailsFromFile: sampleEmails,
              sampleEmailsInCRM: dbSampleEmails,
              columns: Object.keys(uploadedFile.data[0] || {})
            },
            notFoundClients: sampleEmails,
            skipped: skippedDuplicates,
            failed: parseErrors.length + notFoundClients.length
          };
        }

        // Send to bulk API in chunks
        let totalCreated = 0;
        let totalFailed = 0;
        const apiErrors: string[] = [];

        for (let chunkStart = 0; chunkStart < validClaims.length; chunkStart += CHUNK_SIZE) {
          const chunk = validClaims.slice(chunkStart, chunkStart + CHUNK_SIZE);
          console.log(`Processing claims chunk ${Math.floor(chunkStart / CHUNK_SIZE) + 1}`);

          try {
            const response = await fetch(`${API_BASE}/api/cases/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ claims: chunk })
            });

            const result = await response.json();

            if (result.success) {
              totalCreated += result.created || 0;
              totalFailed += result.failed || 0;
            } else {
              totalFailed += chunk.length;
              apiErrors.push(result.message || 'Unknown error');
            }
          } catch (err: any) {
            totalFailed += chunk.length;
            apiErrors.push(err.message);
          }
        }

        clearUploadedFile();
        return {
          success: totalCreated > 0,
          message: `Bulk claims: ${totalCreated.toLocaleString()} created` +
                   (skippedDuplicates > 0 ? `, ${skippedDuplicates.toLocaleString()} duplicates skipped` : '') +
                   (notFoundClients.length > 0 ? `, ${notFoundClients.length.toLocaleString()} clients not found` : ''),
          created: totalCreated,
          skipped: skippedDuplicates,
          failed: totalFailed + notFoundClients.length,
          notFoundClients: [...new Set(notFoundClients)].slice(0, 20),
          errors: apiErrors.slice(0, 5)
        };
      }

      else if (name === 'bulkUpdateFromFile') {
        if (!uploadedFile) {
          return { success: false, message: 'No file uploaded. Please upload a CSV/Excel file first.' };
        }

        const { entityType, identifierColumn, updateField, valueColumn } = args as any;
        const results = { updated: 0, failed: 0, notFound: [] as string[], errors: [] as string[] };

        for (const row of uploadedFile.data) {
          try {
            // Use smart column matching for identifier
            const identifier = getFullNameFromRow(row, { fullName: identifierColumn }) ||
                              findSmartColumn(row, 'fullName', identifierColumn);

            // Get the new value - try the updateField name or common status columns
            const newValue = findSmartColumn(row, 'status', valueColumn) ||
                            (valueColumn ? String(row[valueColumn] || '').trim() : '') ||
                            (updateField ? String(row[updateField] || '').trim() : '');

            if (!identifier || !newValue) {
              results.failed++;
              continue;
            }

            if (entityType === 'contact') {
              const contact = contacts.find(c =>
                c.fullName?.toLowerCase() === identifier.toLowerCase() ||
                c.fullName?.toLowerCase().includes(identifier.toLowerCase()) ||
                String(c.id) === String(identifier)
              );

              if (!contact) {
                results.notFound.push(identifier);
                results.failed++;
                continue;
              }

              await updateContact(contact.id, { [updateField]: newValue });
              results.updated++;
            } else if (entityType === 'claim') {
              // Find claim by client name + lender or by ID
              const lenderCol = findSmartColumn(row, 'lender');
              let claim: any = null;

              if (lenderCol) {
                const contact = contacts.find(c =>
                  c.fullName?.toLowerCase() === identifier.toLowerCase() ||
                  c.fullName?.toLowerCase().includes(identifier.toLowerCase())
                );
                if (contact) {
                  claim = claims.find(cl =>
                    cl.contactId === contact.id &&
                    cl.lender?.toLowerCase() === lenderCol.toLowerCase()
                  );
                }
              } else {
                claim = claims.find(cl => String(cl.id) === String(identifier));
              }

              if (!claim) {
                results.notFound.push(`${identifier}${lenderCol ? ' - ' + lenderCol : ''}`);
                results.failed++;
                continue;
              }

              await updateClaim(claim.id, { [updateField]: newValue });
              results.updated++;
            }
          } catch (err: any) {
            results.failed++;
            results.errors.push(err.message);
          }
        }

        clearUploadedFile();
        return {
          success: true,
          message: `Bulk update complete: ${results.updated} updated, ${results.failed} failed`,
          ...results
        };
      }

      else if (name === 'createContact') {
        const { firstName, lastName, fullName, phone, email, dateOfBirth, address, source } = args as any;

        console.log('[AI Create Contact] Raw args:', { firstName, lastName, fullName, phone, email, dateOfBirth, address, source });

        // Parse address if it's a string
        let addressObj = address;
        if (typeof address === 'string') {
          // Try to parse address string like "14 Windsor Gardens, London, W9 3RA, United Kingdom"
          const parts = address.split(',').map((p: string) => p.trim());
          addressObj = {
            line1: parts[0] || '',
            city: parts[1] || '',
            postalCode: parts[2] || '',
            state_county: parts[3] || 'United Kingdom'
          };
          console.log('[AI Create Contact] Parsed address string to object:', addressObj);
        } else if (address && typeof address === 'object') {
          // Ensure consistent field naming - AI might send 'county' instead of 'state_county'
          addressObj = {
            line1: address.line1 || '',
            line2: address.line2 || '',
            city: address.city || '',
            postalCode: address.postalCode || '',
            state_county: address.state_county || address.county || ''
          };
          console.log('[AI Create Contact] Normalized address object:', addressObj);
        }

        // Convert DD/MM/YYYY to YYYY-MM-DD for database
        let formattedDob = dateOfBirth;
        if (dateOfBirth && dateOfBirth.includes('/')) {
          const [day, month, year] = dateOfBirth.split('/');
          formattedDob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          console.log('[AI Create Contact] Converted DOB from', dateOfBirth, 'to', formattedDob);
        }

        const contactData = {
          firstName: firstName || fullName?.split(' ')[0],
          lastName: lastName || fullName?.split(' ').slice(1).join(' '),
          fullName: fullName || `${firstName} ${lastName}`,
          phone,
          email,
          dateOfBirth: formattedDob,
          address: addressObj,
          source: source || 'AI Import'
        };

        console.log('[AI Create Contact] Final contactData being sent to addContact:', contactData);

        return addContact(contactData);
      }

      else if (name === 'updateContact') {
        const { contactId, updates } = args as { contactId: string; updates: any };
        const existing = contacts.find(c => c.id === contactId);
        if (!existing) return { success: false, message: `Contact with ID ${contactId} not found` };

        // Handle previous addresses separately via extended endpoint
        if (updates.previousAddresses && Array.isArray(updates.previousAddresses)) {
          const previousAddresses = updates.previousAddresses.map((addr: any, idx: number) => ({
            id: `prev_addr_ai_${Date.now()}_${idx}`,
            line1: addr.line1 || '',
            line2: addr.line2 || '',
            city: addr.city || '',
            county: addr.county || '',
            postalCode: addr.postalCode || ''
          }));

          const extResult = await updateContactExtended(contactId, { previousAddresses });

          // If only previousAddresses was updated (no other fields), return the result
          const otherUpdates = { ...updates };
          delete otherUpdates.previousAddresses;
          const hasOtherUpdates = Object.keys(otherUpdates).length > 0;

          if (!hasOtherUpdates) {
            return extResult;
          }

          // Continue with other updates below
          updates.previousAddresses = undefined;
        }

        // Handle date format conversion for DOB
        let formattedUpdates = { ...updates };
        delete formattedUpdates.previousAddresses;
        if (updates.dateOfBirth && updates.dateOfBirth.includes('/')) {
          const [day, month, year] = updates.dateOfBirth.split('/');
          formattedUpdates.dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        // Handle address parsing if string
        if (typeof updates.address === 'string') {
          const parts = updates.address.split(',').map((p: string) => p.trim());
          formattedUpdates.address = {
            line1: parts[0] || existing.address?.line1 || '',
            city: parts[1] || existing.address?.city || '',
            postalCode: parts[2] || existing.address?.postalCode || '',
            state_county: parts[3] || existing.address?.state_county || ''
          };
        } else if (updates.address) {
          formattedUpdates.address = { ...existing.address, ...updates.address };
        }

        // Merge updates with existing contact
        const updatedContact = {
          ...existing,
          ...formattedUpdates,
          fullName: formattedUpdates.firstName && formattedUpdates.lastName
            ? `${formattedUpdates.firstName} ${formattedUpdates.lastName}`
            : formattedUpdates.fullName || existing.fullName
        };

        return await updateContact(updatedContact);
      }

      else if (name === 'manageClaim') {
        const { action, contactId, claimId, ...data } = args as any;
        if (action === 'create') {
          return addClaim({ contactId, ...data });
        } else if (action === 'update') {
          const existing = claims.find(c => c.id === claimId);
          if (!existing) return { success: false, message: 'Claim not found' };
          return updateClaim({ ...existing, ...data });
        }
        return { success: false, message: 'Invalid action' };
      }

      else if (name === 'updateClaimStatus') {
        const { claimId, newStatus, notes } = args as { claimId: string; newStatus: string; notes?: string };
        console.log('Updating claim status:', claimId, 'to', newStatus, notes ? `(${notes})` : '');
        return updateContactStatus(claimId, newStatus);
      }

      else if (name === 'bulkClaimOperation') {
        const { lender, currentStatus, phase, minDaysInStage, action, newValue } = args as any;
        if (action === 'updateStatus') {
          return bulkUpdateClaims({
            lender,
            status: currentStatus,
            minDaysInStage
          }, newValue);
        }
        return { success: false, message: 'Unsupported bulk action' };
      }

      else if (name === 'getPipelineStats') {
        const { breakdown } = args as { breakdown?: string };
        const stats = getPipelineStats();

        // Enhanced stats with phase breakdown
        const phaseBreakdown = {
          'Lead Generation': claims.filter(c => ['New Lead', 'Contact Attempted', 'In Conversation', 'Qualification Call', 'Qualified Lead', 'Not Qualified'].includes(c.status)).length,
          'Onboarding': claims.filter(c => c.status.includes('Onboarding') || c.status.includes('LOA') || c.status.includes('Bank Statements') || c.status.includes('ID ') || c.status.includes('Questionnaire')).length,
          'DSAR': claims.filter(c => c.status.includes('DSAR') || c.status === 'Data Analysis').length,
          'Complaint': claims.filter(c => c.status.includes('Complaint') || c.status.includes('Response') || c.status === 'Client Review').length,
          'FOS': claims.filter(c => c.status.includes('FOS')).length,
          'Payments': claims.filter(c => c.status.includes('Offer') || c.status.includes('Payment') || c.status.includes('Fee') || c.status.includes('Client Paid') || c.status.includes('Claim ')).length
        };

        return {
          ...stats,
          totalClaims: claims.length,
          totalContacts: contacts.length,
          phaseBreakdown,
          breakdown
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          DOCUMENT ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'analyzeDSAR') {
        const { textData, contactId, extractFields } = args as { textData: string; contactId?: string; extractFields?: string[] };

        // Extract key information from DSAR text
        const loanAmountMatch = textData.match(/(?:loan|credit|amount|principal)[:\s]*£?([\d,]+(?:\.\d{2})?)/i);
        const aprMatch = textData.match(/(?:APR|annual percentage rate)[:\s]*([\d.]+)%?/i);
        const dateMatch = textData.match(/(?:date|agreement date|loan date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

        return {
          success: true,
          contactId,
          extractedData: {
            loanAmount: loanAmountMatch ? parseFloat(loanAmountMatch[1].replace(',', '')) : null,
            apr: aprMatch ? parseFloat(aprMatch[1]) : null,
            loanDate: dateMatch ? dateMatch[1] : null,
            rawTextLength: textData.length
          },
          potentialBreaches: textData.toLowerCase().includes('afford') ? ['CONC 5.2A.4R - Affordability not properly assessed'] : [],
          recommendation: 'Manual review recommended to verify extracted data'
        };
      }

      else if (name === 'analyzeBankStatement') {
        const { textData, contactId, loanDate, analysisType } = args as any;
        const textLower = textData.toLowerCase();

        // Gambling detection
        const gamblingKeywords = ['bet365', 'paddy power', 'william hill', 'betfair', 'sky bet', 'coral', 'ladbrokes', 'casino', 'gambling', 'betway', 'pokerstars'];
        const gamblingDetected = gamblingKeywords.some(kw => textLower.includes(kw));

        // Income pattern detection
        const salaryMatch = textData.match(/(?:salary|wages|income|pay)[:\s]*£?([\d,]+(?:\.\d{2})?)/gi);

        // Basic expense categories
        const hasRentMortgage = textLower.includes('rent') || textLower.includes('mortgage');
        const hasUtilities = textLower.includes('gas') || textLower.includes('electric') || textLower.includes('water');

        return {
          success: true,
          contactId,
          analysisType,
          loanDate,
          findings: {
            gamblingDetected,
            gamblingIndicators: gamblingKeywords.filter(kw => textLower.includes(kw)),
            incomePatternDetected: salaryMatch ? salaryMatch.length : 0,
            essentialExpenses: { rent: hasRentMortgage, utilities: hasUtilities },
            redFlags: gamblingDetected ? ['Gambling transactions detected during loan period'] : []
          },
          qualificationImpact: gamblingDetected ? '+25 points (gambling evidence)' : 'No gambling markers found'
        };
      }

      else if (name === 'calculateAffordability') {
        const { contactId, income, expenses, loanAmount, monthlyRepayment, evidenceFactors } = args as any;

        const totalExpenses = Object.values(expenses || {}).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
        const disposableIncome = (income?.netMonthly || 0) - totalExpenses;
        const dtiRatio = income?.grossMonthly ? ((expenses?.debtPayments || 0) / income.grossMonthly) * 100 : 0;

        // Calculate qualification score (0-100)
        let score = 0;
        if (evidenceFactors?.gamblingDetected) score += 25;
        if (dtiRatio > 40) score += 20;
        if (evidenceFactors?.multipleLoansInPeriod) score += 15;
        if (evidenceFactors?.existingArrears) score += 15;
        if (evidenceFactors?.incomeNotVerified) score += 10;
        if (evidenceFactors?.repeatBorrower) score += 10;
        if (disposableIncome < (monthlyRepayment || 0)) score += 5;

        const scoreInterpretation = score >= 70 ? 'Strong case - proceed to complaint' :
          score >= 50 ? 'Moderate case - gather additional evidence' :
            score >= 30 ? 'Weak case - requires review' : 'Case unlikely to succeed';

        return {
          success: true,
          contactId,
          affordabilityMetrics: {
            netMonthlyIncome: income?.netMonthly || 0,
            totalMonthlyExpenses: totalExpenses,
            disposableIncome,
            dtiRatio: Math.round(dtiRatio * 100) / 100,
            loanAffordable: disposableIncome >= (monthlyRepayment || 0)
          },
          qualificationScore: Math.min(score, 100),
          scoreBreakdown: evidenceFactors,
          interpretation: scoreInterpretation,
          recommendation: score >= 50 ? 'Proceed with complaint drafting' : 'Review case viability'
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          LEGAL CONTENT GENERATION
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'draftComplaintLetter') {
        const { clientName, clientAddress, lenderName, accountNumber, loanDate, loanAmount, breaches, financialHarm, requestedRemedy } = args as any;

        const breachText = (breaches || []).map((b: any) => {
          const ruleDescriptions: Record<string, string> = {
            'CONC_5.2A.4R': 'Failed to assess whether the borrower could repay sustainably without undue difficulty',
            'CONC_5.2A.12R': 'Failed to verify income claims and relied solely on self-declaration',
            'CONC_5.2A.15G': 'Failed to consider committed regular expenditure',
            'CONC_5.2A.17G': 'Failed to check for signs of financial difficulty',
            'CONC_5.2A.20R': 'Failed to consider pattern of multiple loans indicating credit cycling',
            's140A_CCA': 'Created an unfair relationship under s.140A Consumer Credit Act 1974',
            'CONC_6.7': 'Failed to treat customer in financial difficulty with forbearance'
          };
          return `- ${b.type}: ${ruleDescriptions[b.type] || b.type}\n  ${b.description || ''}\n  Evidence: ${b.evidence || 'To be detailed'}`;
        }).join('\n\n');

        const letterContent = `FORMAL COMPLAINT - IRRESPONSIBLE LENDING

To: Complaints Department, ${lenderName}
From: ${clientName}
${clientAddress ? `Address: ${clientAddress}` : ''}
${accountNumber ? `Account Reference: ${accountNumber}` : ''}
${loanDate ? `Loan Date: ${loanDate}` : ''}
${loanAmount ? `Loan Amount: £${loanAmount}` : ''}

Dear Sir/Madam,

We write to formally complain about the lending provided to our client. We submit that this lending was irresponsible and in breach of the FCA's Consumer Credit Sourcebook (CONC).

REGULATORY BREACHES IDENTIFIED:

${breachText || 'Specific breaches to be detailed based on DSAR analysis.'}

FINANCIAL HARM:
${financialHarm || 'The client has suffered financial harm as a result of this irresponsible lending, including but not limited to accrued interest, charges, and associated financial distress.'}

REMEDY SOUGHT:
${requestedRemedy || 'We request a full refund of all interest and charges paid, plus 8% simple interest from the date of each payment, in line with FOS guidelines.'}

We expect a final response within 8 weeks. If we do not receive a satisfactory response, we will escalate this matter to the Financial Ombudsman Service.

Yours faithfully,
FastAction Claims
Acting on behalf of ${clientName}`;

        const docResult = await addDocument({
          name: `Complaint Letter - ${clientName} v ${lenderName}.docx`,
          category: 'Legal',
          type: 'docx'
        });

        return {
          success: true,
          documentId: docResult.id,
          preview: letterContent,
          breachCount: (breaches || []).length,
          nextSteps: ['Send to lender', 'Set 8-week reminder', 'Update claim status to Complaint Submitted']
        };
      }

      else if (name === 'draftFOSSubmission') {
        const { clientName, lenderName, caseReference, originalComplaintDate, finalResponseDate, finalResponseSummary, breachSummary, evidenceList, reliefSought, additionalArguments } = args as any;

        const submissionContent = `FINANCIAL OMBUDSMAN SERVICE - COMPLAINT SUBMISSION

Case Reference: ${caseReference || 'TBC'}
Complainant: ${clientName}
Respondent: ${lenderName}

TIMELINE:
- Original Complaint Date: ${originalComplaintDate || 'TBC'}
- Final Response Date: ${finalResponseDate || 'TBC'}

LENDER'S POSITION:
${finalResponseSummary || 'The lender rejected our complaint. Full details in attached Final Response Letter.'}

OUR SUBMISSION:

1. BREACH SUMMARY:
${breachSummary}

2. WHY THE LENDER'S RESPONSE IS INADEQUATE:
${additionalArguments || 'The lender has failed to properly address the regulatory breaches identified. Their affordability assessment at the time of lending was inadequate and did not comply with CONC 5.2A requirements.'}

3. EVIDENCE ENCLOSED:
${(evidenceList || ['Complaint Letter', 'Final Response Letter', 'Bank Statements', 'DSAR Response']).map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}

4. REMEDY SOUGHT:
${reliefSought || 'Refund of all interest and charges paid, plus 8% simple interest from the date of each payment.'}

We respectfully request that the Ombudsman upholds this complaint and directs the lender to provide appropriate redress.

Submitted by FastAction Claims on behalf of ${clientName}`;

        const docResult = await addDocument({
          name: `FOS Submission - ${clientName} v ${lenderName}.docx`,
          category: 'Legal',
          type: 'docx'
        });

        return {
          success: true,
          documentId: docResult.id,
          preview: submissionContent,
          nextSteps: ['Submit to FOS portal', 'Update claim status to FOS Submitted', 'Set reminder for FOS acknowledgement']
        };
      }

      else if (name === 'draftClientCommunication') {
        const { contactId, communicationType, subject, keyPoints, tone, includeNextSteps } = args as any;

        const contact = contactId ? contacts.find(c => c.id === contactId) : null;
        const clientName = contact?.fullName || 'Valued Client';

        const toneGreeting = tone === 'formal' ? 'Dear' : tone === 'urgent' ? 'URGENT:' : 'Hi';
        const toneSign = tone === 'formal' ? 'Yours faithfully,' : 'Best regards,';

        const templates: Record<string, string> = {
          status_update: `${toneGreeting} ${clientName},\n\nWe wanted to update you on the progress of your claim.\n\n${(keyPoints || ['Your case is progressing well']).map((p: string) => `• ${p}`).join('\n')}\n\n${includeNextSteps ? 'Next Steps:\n• We will be in touch with further updates\n• Please let us know if you have any questions\n' : ''}${toneSign}\nFastAction Claims Team`,
          document_request: `${toneGreeting} ${clientName},\n\nTo progress your claim, we require the following documents:\n\n${(keyPoints || ['Bank statements', 'ID verification']).map((p: string) => `• ${p}`).join('\n')}\n\nPlease upload these at your earliest convenience.\n\n${toneSign}\nFastAction Claims Team`,
          offer_discussion: `${toneGreeting} ${clientName},\n\nWe have received an offer from the lender regarding your claim.\n\n${(keyPoints || ['Offer details to be discussed']).map((p: string) => `• ${p}`).join('\n')}\n\nPlease contact us to discuss this offer and your options.\n\n${toneSign}\nFastAction Claims Team`,
          fos_update: `${toneGreeting} ${clientName},\n\nUpdate on your Financial Ombudsman Service case:\n\n${(keyPoints || ['FOS is reviewing your case']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`,
          welcome: `${toneGreeting} ${clientName},\n\nWelcome to FastAction Claims! We're pleased to be assisting you with your irresponsible lending claim.\n\n${(keyPoints || ['We will guide you through the process', 'Our team is here to help']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`,
          general_query: `${toneGreeting} ${clientName},\n\nThank you for your enquiry.\n\n${(keyPoints || ['Response to your query']).map((p: string) => `• ${p}`).join('\n')}\n\n${toneSign}\nFastAction Claims Team`
        };

        return {
          success: true,
          subject: subject || `Update on your claim - ${communicationType.replace('_', ' ')}`,
          content: templates[communicationType] || templates.general_query,
          contactId,
          communicationType
        };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          COMMUNICATION & AUTOMATION
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'sendCommunication') {
        const { contactId, platform, subject, message, templateId, attachments } = args as any;
        const contact = contacts.find(c => c.id === contactId);

        return {
          success: true,
          message: `${platform.toUpperCase()} sent to ${contact?.fullName || contactId}`,
          platform,
          recipient: contact?.email || contact?.phone || contactId,
          subject,
          preview: message.substring(0, 100) + '...'
        };
      }

      else if (name === 'triggerWorkflow') {
        const { workflowName, contactId, parameters } = args as any;
        return {
          success: true,
          message: `Workflow '${workflowName}' triggered successfully`,
          workflowName,
          contactId,
          parameters,
          triggeredAt: new Date().toISOString()
        };
      }

      else if (name === 'calendarAction') {
        const { action, title, date, duration, contactId, claimId, reminderType, description } = args as any;

        if (action === 'schedule') {
          const result = addAppointment({ title, date, contactId, description });
          return { ...result, reminderType, duration };
        } else if (action === 'list') {
          return {
            success: true,
            appointments: appointments.slice(0, 10),
            message: `Found ${appointments.length} appointments`
          };
        }
        return { success: false, message: 'Unsupported calendar action' };
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          REPORTS & ANALYTICS
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'generateReport') {
        const { reportType, dateRange, filters, format } = args as any;

        const reportData: Record<string, any> = {
          pipeline_summary: {
            totalClaims: claims.length,
            totalContacts: contacts.length,
            totalValue: claims.reduce((sum, c) => sum + (c.claimValue || 0), 0),
            byPhase: {
              'Lead Generation': claims.filter(c => ['New Lead', 'Contact Attempted', 'Qualified Lead'].includes(c.status)).length,
              'Onboarding': claims.filter(c => c.status.includes('Onboarding') || c.status.includes('LOA')).length,
              'DSAR': claims.filter(c => c.status.includes('DSAR')).length,
              'Complaint': claims.filter(c => c.status.includes('Complaint')).length,
              'FOS': claims.filter(c => c.status.includes('FOS')).length,
              'Payments': claims.filter(c => c.status.includes('Offer') || c.status.includes('Payment')).length
            }
          },
          lender_performance: {
            lenders: [...new Set(claims.map(c => c.lender))].map(lender => ({
              name: lender,
              totalClaims: claims.filter(c => c.lender === lender).length,
              totalValue: claims.filter(c => c.lender === lender).reduce((sum, c) => sum + (c.claimValue || 0), 0)
            }))
          },
          aging_report: {
            claimsOver30Days: claims.filter(c => (c.daysInStage || 0) > 30).length,
            claimsOver60Days: claims.filter(c => (c.daysInStage || 0) > 60).length,
            claimsOver90Days: claims.filter(c => (c.daysInStage || 0) > 90).length
          }
        };

        return {
          success: true,
          reportType,
          generatedAt: new Date().toISOString(),
          data: reportData[reportType] || reportData.pipeline_summary,
          format
        };
      }

      else if (name === 'createTemplate') {
        const { name: templateName, category, content, description, variables } = args as any;
        return addTemplate({ name: templateName, category, content, description });
      }

      // ═══════════════════════════════════════════════════════════════════════════
      //                          DOCUMENT UPLOAD BY NAME
      // ═══════════════════════════════════════════════════════════════════════════

      else if (name === 'uploadDocumentByName') {
        const { fullName, lenderName, fileName } = args as { fullName: string; lenderName: string; fileName: string };

        if (!pendingPdfFile) {
          return { error: "no_pending_file", message: "No PDF file is pending upload. Please upload a PDF file first." };
        }

        // Search contacts for matching fullName (case-insensitive)
        const normalizedName = (fullName || '').toLowerCase().trim();
        const matchedContact = contacts.find(c =>
          c.fullName?.toLowerCase().trim() === normalizedName
        );

        if (!matchedContact) {
          setPendingPdfFile(null);
          return {
            error: "contact_not_found",
            message: `Contact "${fullName}" was not found in the CRM. The document upload has been skipped.`,
            searchedName: fullName,
            suggestion: "Would you like me to create this contact first, or skip this upload?"
          };
        }

        // Upload via backend API
        try {
          const formData = new FormData();
          formData.append('document', pendingPdfFile);
          formData.append('contact_id', String(matchedContact.id));
          formData.append('lender_name', lenderName);
          formData.append('original_name', fileName);

          const response = await fetch(`${API_BASE}/api/upload-document-by-name`, {
            method: 'POST',
            body: formData
          });

          const result = await response.json();
          setPendingPdfFile(null);

          if (result.success) {
            return {
              success: true,
              message: `Document "${fileName}" uploaded successfully for ${result.contactName} under lender ${result.lender}.${result.claimCreated ? ' A new claim was automatically created for this lender.' : ''}`,
              contactName: result.contactName,
              lender: result.lender,
              claimCreated: result.claimCreated,
              claimId: result.claim?.id,
              documentId: result.document?.id
            };
          } else {
            return { error: "upload_failed", message: result.message || "Failed to upload document." };
          }
        } catch (uploadErr: any) {
          setPendingPdfFile(null);
          return { error: "upload_error", message: `Upload failed: ${uploadErr.message}` };
        }
      }

      return { error: "Unknown tool", toolName: name };
    } catch (err: any) {
      console.error('Tool execution error:', name, err);
      return { error: err.message, toolName: name };
    }
  };

  const callAIAPI = async (
    message?: string,
    context?: string,
    toolResults?: { toolUseId: string; result: string }[]
  ): Promise<{ text: string; toolCalls: ToolCall[] }> => {
    const response = await fetch(`${API_BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        message,
        context,
        toolResults
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'API request failed');
    }

    const data = await response.json();
    return {
      text: data.text || '',
      toolCalls: data.toolCalls || []
    };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Inject Context if available
    let contextString = "";
    if (activeContext) {
      contextString = `Viewing ${activeContext.type} ID: ${activeContext.id || 'N/A'} Name: ${activeContext.name || 'N/A'}`;
    }

    // Add file context if a file is uploaded
    if (uploadedFile) {
      const fileContext = `\n\nUPLOADED FILE: "${uploadedFile.name}" with ${uploadedFile.data.length} total rows ready for import.\nColumns: ${Object.keys(uploadedFile.data[0] || {}).join(', ')}\nPreview (first 3 of ${uploadedFile.data.length} rows): ${JSON.stringify(uploadedFile.data.slice(0, 3))}\n\nIMPORTANT: Use the bulkImportContacts tool to import ALL ${uploadedFile.data.length} rows from the file, not just the preview.`;
      contextString += fileContext;
    }

    // Add pending PDF document context
    if (pendingPdfFile) {
      const nameWithoutExt = pendingPdfFile.name.replace(/\.pdf$/i, '');
      const parts = nameWithoutExt.split(' - ');
      const pdfFullName = parts[0]?.trim() || '';
      const pdfLenderName = parts.slice(1).join(' - ')?.trim() || '';
      const pdfContext = `\n\nPENDING PDF UPLOAD: "${pendingPdfFile.name}" — Client: "${pdfFullName}", Lender: "${pdfLenderName}". If the user confirms (says upload, yes, proceed, confirm, etc.), use the uploadDocumentByName tool with fullName="${pdfFullName}", lenderName="${pdfLenderName}", fileName="${pendingPdfFile.name}". If the user says skip or cancel, acknowledge and do NOT upload.`;
      contextString += pdfContext;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // 1. Send message to AI via API
      let response = await callAIAPI(input, contextString || undefined);

      // 2. Loop to handle potentially multiple function calls
      while (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: { toolUseId: string; result: string }[] = [];

        // Execute each requested tool
        for (const toolCall of response.toolCalls) {
          const result = await executeToolCall(toolCall.name, toolCall.input);
          toolResults.push({
            toolUseId: toolCall.id,
            result: JSON.stringify(result)
          });
        }

        // 3. Send tool results back to AI
        response = await callAIAPI(undefined, undefined, toolResults);
      }

      // 4. Final Text Response
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "Task executed successfully.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);

    } catch (error: any) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `I encountered an error: ${error.message || 'Please check your connection.'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-out Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 bg-navy-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-orange rounded-lg text-white">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">FastAction AI</h2>
              <p className="text-[10px] text-gray-300 uppercase tracking-wider font-medium">Powered by GPT-4o</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 h-[calc(100%-140px)] bg-slate-50">
          {activeContext && (
            <div className="flex justify-center">
              <div className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full border border-blue-100 flex items-center gap-2">
                <Sparkles size={10} /> Context: Viewing {activeContext.name || activeContext.type}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-gray-200' : 'bg-navy-900 text-white shadow-md'}`}>
                {msg.role === 'user' ? <span className="text-xs font-bold text-gray-600">You</span> : <Sparkles size={14} />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                    ? 'bg-white text-gray-800 border border-gray-100 rounded-tr-none'
                    : 'bg-white text-navy-900 border-l-4 border-brand-orange rounded-tl-none'
                  }`}
              >
                <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                {/* Visual Cards for AI Actions */}
                {msg.role === 'model' && msg.id !== 'welcome' && (
                  <div className="mt-3 pt-3 border-t border-gray-100/20 flex flex-wrap gap-2">
                    {(msg.text.toLowerCase().includes("score") || msg.text.includes("qualification")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-100 font-bold">
                        <BarChart2 size={12} /> Analysis Complete
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("appointment") || msg.text.toLowerCase().includes("scheduled") || msg.text.toLowerCase().includes("reminder")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-100 font-bold">
                        <Calendar size={12} /> Calendar Updated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("updated") || msg.text.toLowerCase().includes("moved") || msg.text.toLowerCase().includes("status")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-bold">
                        <CheckCircle size={12} /> CRM Updated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("complaint") || msg.text.toLowerCase().includes("draft") || msg.text.toLowerCase().includes("letter") || msg.text.toLowerCase().includes("fos submission")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded border border-amber-100 font-bold">
                        <FileText size={12} /> Document Generated
                      </span>
                    )}
                    {(msg.text.toLowerCase().includes("conc") || msg.text.toLowerCase().includes("fca") || msg.text.toLowerCase().includes("breach")) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded border border-red-100 font-bold">
                        <FileText size={12} /> Compliance Analysis
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={18} />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-brand-orange" />
                <span className="text-xs text-gray-500 font-medium">Processing operations...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {/* Uploaded File Indicator */}
          {uploadedFile && (
            <div className="mb-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-blue-600" />
                <span className="text-xs text-blue-800 font-medium">{uploadedFile.name}</span>
                <span className="text-xs text-blue-600">({uploadedFile.data.length} rows)</span>
              </div>
              <button
                onClick={clearUploadedFile}
                className="text-blue-600 hover:text-blue-800 p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Pending PDF Document Indicator */}
          {pendingPdfFile && (
            <div className="mb-2 flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-orange-600" />
                <span className="text-xs text-orange-800 font-medium">{pendingPdfFile.name}</span>
                <span className="text-xs text-orange-600">(pending upload)</span>
              </div>
              <button
                onClick={() => setPendingPdfFile(null)}
                className="text-orange-600 hover:text-orange-800 p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,.xlsx,.xls,.pdf"
              className="hidden"
            />

            {/* Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-3 rounded-xl transition-all border border-gray-200"
              title="Upload CSV/Excel/PDF file"
            >
              <Upload size={20} />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={uploadedFile ? "What should I do with this file?" : (activeContext ? `Ask about ${activeContext.name}...` : "e.g. 'Move all Vanquis claims to FOS'")}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-navy-900 transition-shadow placeholder:text-gray-400"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-navy-900 hover:bg-navy-800 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-md"
            >
              <Send size={20} />
            </button>
          </div>
          <div className="text-center mt-2 flex justify-center flex-wrap gap-3">
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <BarChart2 size={10} /> Analytics
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <FileText size={10} /> Legal Drafting
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <Upload size={10} /> Bulk Import
            </span>
            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
              <Calendar size={10} /> Automation
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIAssistant;
