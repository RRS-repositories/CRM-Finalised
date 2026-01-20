import { Conversation, Contact, Document, Template, Form, KPI, ClaimStatus } from './types';

// Pipeline Categories for Kanban board
export const PIPELINE_CATEGORIES = [
  {
    id: 'lead-generation',
    title: 'Lead Generation',
    color: 'border-l-blue-500',
    statuses: [
      ClaimStatus.NEW_LEAD,
      ClaimStatus.CONTACT_ATTEMPTED,
      ClaimStatus.IN_CONVERSATION,
      ClaimStatus.QUALIFICATION_CALL,
      ClaimStatus.QUALIFIED_LEAD,
      ClaimStatus.NOT_QUALIFIED,
    ],
  },
  {
    id: 'onboarding',
    title: 'Onboarding',
    color: 'border-l-purple-500',
    statuses: [
      ClaimStatus.ONBOARDING_STARTED,
      ClaimStatus.ID_VERIFICATION_PENDING,
      ClaimStatus.ID_VERIFIED,
      ClaimStatus.QUESTIONNAIRE_SENT,
      ClaimStatus.QUESTIONNAIRE_COMPLETE,
      ClaimStatus.LOA_SENT,
      ClaimStatus.LOA_SIGNED,
      ClaimStatus.BANK_STATEMENTS_REQUESTED,
      ClaimStatus.BANK_STATEMENTS_RECEIVED,
      ClaimStatus.ONBOARDING_COMPLETE,
    ],
  },
  {
    id: 'dsar-process',
    title: 'DSAR Process',
    color: 'border-l-yellow-500',
    statuses: [
      ClaimStatus.DSAR_PREPARED,
      ClaimStatus.DSAR_SENT,
      ClaimStatus.DSAR_ACKNOWLEDGED,
      ClaimStatus.DSAR_FOLLOW_UP,
      ClaimStatus.DSAR_RECEIVED,
      ClaimStatus.DSAR_ESCALATED,
      ClaimStatus.DATA_ANALYSIS,
    ],
  },
  {
    id: 'complaint',
    title: 'Complaint',
    color: 'border-l-orange-500',
    statuses: [
      ClaimStatus.COMPLAINT_DRAFTED,
      ClaimStatus.CLIENT_REVIEW,
      ClaimStatus.COMPLAINT_APPROVED,
      ClaimStatus.COMPLAINT_SUBMITTED,
      ClaimStatus.COMPLAINT_ACKNOWLEDGED,
      ClaimStatus.AWAITING_RESPONSE,
      ClaimStatus.RESPONSE_RECEIVED,
      ClaimStatus.RESPONSE_UNDER_REVIEW,
    ],
  },
  {
    id: 'fos-escalation',
    title: 'FOS Escalation',
    color: 'border-l-red-500',
    statuses: [
      ClaimStatus.FOS_REFERRAL_PREPARED,
      ClaimStatus.FOS_SUBMITTED,
      ClaimStatus.FOS_CASE_NUMBER,
      ClaimStatus.FOS_INVESTIGATION,
      ClaimStatus.FOS_PROVISIONAL_DECISION,
      ClaimStatus.FOS_FINAL_DECISION,
      ClaimStatus.FOS_APPEAL,
    ],
  },
  {
    id: 'resolution',
    title: 'Resolution',
    color: 'border-l-green-500',
    statuses: [
      ClaimStatus.OFFER_RECEIVED,
      ClaimStatus.OFFER_NEGOTIATION,
      ClaimStatus.OFFER_ACCEPTED,
      ClaimStatus.AWAITING_PAYMENT,
      ClaimStatus.PAYMENT_RECEIVED,
      ClaimStatus.FEE_DEDUCTED,
      ClaimStatus.CLIENT_PAID,
      ClaimStatus.CLAIM_SUCCESSFUL,
      ClaimStatus.CLAIM_UNSUCCESSFUL,
      ClaimStatus.CLAIM_WITHDRAWN,
    ],
  },
];

// Empty arrays - data is now fetched from the database
export const MOCK_CONTACTS: Contact[] = [];
export const MOCK_DOCUMENTS: Document[] = [];
export const MOCK_TEMPLATES: Template[] = [];
export const MOCK_FORMS: Form[] = [];

// Dashboard chart data
export const FUNNEL_DATA = [
  { name: 'New Leads', value: 45 },
  { name: 'In Progress', value: 30 },
  { name: 'Under Review', value: 15 },
  { name: 'Completed', value: 10 },
];

export const TREND_DATA = [
  { name: 'Jan', claims: 12 },
  { name: 'Feb', claims: 19 },
  { name: 'Mar', claims: 15 },
  { name: 'Apr', claims: 25 },
  { name: 'May', claims: 22 },
  { name: 'Jun', claims: 30 },
];

export const MOCK_KPIS: KPI[] = [
  { label: 'Total Contacts', value: 0, change: 12.5, trend: 'up' },
  { label: 'Pipeline Value', value: '£0', change: 15.3, trend: 'up' },
  { label: 'Active Claims', value: 0, change: 8.2, trend: 'up' },
  { label: 'Conversion Rate', value: '24%', change: -2.1, trend: 'down' },
];

// Template folders for document templates
export const MOCK_TEMPLATE_FOLDERS = [
  { id: 'general', name: 'General', count: 0 },
  { id: 'legal', name: 'Legal', count: 0 },
  { id: 'correspondence', name: 'Correspondence', count: 0 },
  { id: 'complaints', name: 'Complaints', count: 0 },
  { id: 'fos', name: 'FOS', count: 0 },
];

// Template variables for mail merge
export const TEMPLATE_VARIABLES = [
  { key: '{{fullName}}', label: 'Full Name' },
  { key: '{{firstName}}', label: 'First Name' },
  { key: '{{lastName}}', label: 'Last Name' },
  { key: '{{email}}', label: 'Email' },
  { key: '{{phone}}', label: 'Phone' },
  { key: '{{address}}', label: 'Address' },
  { key: '{{lender}}', label: 'Lender' },
  { key: '{{claimValue}}', label: 'Claim Value' },
  { key: '{{today}}', label: 'Today\'s Date' },
  { key: '{{caseRef}}', label: 'Case Reference' },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    contactId: "1",
    contactName: "John Doe",
    platform: "whatsapp",
    unreadCount: 2,
    lastMessage: {
      id: "m1",
      sender: "user",
      text: "Hello, I have a question about my claim.",
      timestamp: "10:30 AM",
      platform: "whatsapp",
      status: "delivered"
    },
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Hello, I have a question about my claim.",
        timestamp: "10:30 AM",
        platform: "whatsapp",
        status: "delivered"
      }
    ],
    mediaGallery: {
      images: [],
      documents: [],
      audio: [],
      video: []
    }
  },
  {
    id: "2",
    contactId: "2",
    contactName: "Initial User",
    platform: "email",
    unreadCount: 0,
    lastMessage: {
      id: "m2",
      sender: "agent",
      text: "We have received your documents.",
      timestamp: "Yesterday",
      platform: "email",
      status: "read"
    },
    messages: [
      {
        id: "m2",
        sender: "agent",
        text: "We have received your documents.",
        timestamp: "Yesterday",
        platform: "email",
        status: "read"
      }
    ],
    mediaGallery: {
      images: [],
      documents: [],
      audio: [],
      video: []
    }
  }
];

// ============================================
// Rowan Rose Solicitors CRM Specification Constants
// ============================================

// Color Palette from Specification
export const CRM_COLORS = {
  primary: '#1E3A5F',      // Headers, primary buttons
  secondary: '#2563EB',    // Links, active states
  accent: '#10B981',       // Success states, positive actions
  warning: '#F59E0B',      // Pending items, alerts
  danger: '#EF4444',       // Required fields, deletions
  background: '#F8FAFC',   // Page background
  cardBackground: '#FFFFFF', // Content cards
  textPrimary: '#1F2937',  // Main text
  textSecondary: '#6B7280' // Supporting text
};

// Claim Status Colors (13 specification statuses)
export const SPEC_STATUS_COLORS: Record<string, string> = {
  'New Claim': '#6B7280',        // Grey
  'LOA Sent': '#3B82F6',         // Blue
  'Awaiting DSAR': '#8B5CF6',    // Purple
  'DSAR Received': '#06B6D4',    // Cyan
  'Complaint Submitted': '#F59E0B', // Amber
  'FRL Received': '#EF4444',     // Red
  'Counter Submitted': '#EC4899', // Pink
  'FOS Referred': '#7C3AED',     // Violet
  'Offer Made': '#10B981',       // Green
  'Accepted': '#059669',         // Dark Green
  'Payment Received': '#047857', // Emerald
  'Closed - Won': '#065F46',     // Forest
  'Closed - Lost': '#991B1B'     // Dark Red
};

// Get status color with fallback for existing 48 statuses
export const getSpecStatusColor = (status: string): string => {
  // Check spec statuses first
  if (SPEC_STATUS_COLORS[status]) {
    return SPEC_STATUS_COLORS[status];
  }

  // Fallback colors based on status keywords
  if (status.includes('New') || status.includes('Lead')) return '#6B7280';
  if (status.includes('LOA')) return '#3B82F6';
  if (status.includes('DSAR') && !status.includes('Received')) return '#8B5CF6';
  if (status.includes('DSAR') && status.includes('Received')) return '#06B6D4';
  if (status.includes('Complaint')) return '#F59E0B';
  if (status.includes('FRL') || status.includes('Response')) return '#EF4444';
  if (status.includes('Counter')) return '#EC4899';
  if (status.includes('FOS')) return '#7C3AED';
  if (status.includes('Offer')) return '#10B981';
  if (status.includes('Accept')) return '#059669';
  if (status.includes('Payment') || status.includes('Paid')) return '#047857';
  if (status.includes('Successful') || status.includes('Won')) return '#065F46';
  if (status.includes('Unsuccessful') || status.includes('Lost') || status.includes('Withdrawn')) return '#991B1B';

  return '#6B7280'; // Default grey
};

// Lenders from Specification
export const SPEC_LENDERS = [
  '118 118 Money',
  'Amigo Loans',
  'CashEuroNet (QuickQuid)',
  'Everyday Loans',
  'Lending Stream',
  'Likely Loans',
  'Loans 2 Go',
  'Morses Club',
  'NewDay (Aqua, Marbles, Amazon Credit)',
  'PiggyBank',
  'Provident',
  'Quidie',
  'SafetyNet Credit',
  'Shelby Finance',
  'Sunny',
  'The Money Shop',
  'Vanquis Bank',
  'Wage Day Advance',
  'Other (specify)'
];

// Finance Types from Specification
export const FINANCE_TYPES = [
  'Credit Card',
  'Catalogue Credit',
  'Guarantor Loan',
  'High-Cost Short-Term Credit (Payday)',
  'Home Collected Credit',
  'Instalment Loan',
  'Line of Credit / Running Account',
  'Logbook Loan',
  'Overdraft',
  'Personal Loan',
  'Rent to Own',
  'Other (specify)'
];

// Document Categories from Specification
export const DOCUMENT_CATEGORIES = [
  'ID Document',
  'Proof of Address',
  'Bank Statement',
  'DSAR Request',
  'DSAR Response',
  'Letter of Authority',
  'Complaint Letter',
  'Final Response Letter (FRL)',
  'Counter Response',
  'FOS Complaint Form',
  'FOS Decision',
  'Offer Letter',
  'Acceptance Form',
  'Settlement Agreement',
  'Invoice',
  'Other'
];

// Workflow Types for Chase Sequences
export const WORKFLOW_TYPES = [
  {
    id: 'id_chase',
    name: 'ID Chase',
    description: 'Request identification documents',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 4) → Call (Day 7)',
    totalSteps: 4
  },
  {
    id: 'poa_chase',
    name: 'Proof of Address Chase',
    description: 'Request proof of address',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 4) → Call (Day 7)',
    totalSteps: 4
  },
  {
    id: 'extra_lender_chase',
    name: 'Extra Lender Chase',
    description: 'Request additional lender information',
    sequence: 'Email → SMS (Day 3) → WhatsApp (Day 5)',
    totalSteps: 3
  },
  {
    id: 'questionnaire_chase',
    name: 'Questionnaire Chase',
    description: 'Chase incomplete questionnaire',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 3) → Call (Day 5)',
    totalSteps: 4
  },
  {
    id: 'previous_address_chase',
    name: 'Previous Address Chase',
    description: 'Request previous address details',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 4)',
    totalSteps: 3
  },
  {
    id: 'unable_to_locate_chase',
    name: 'Unable to Locate Chase',
    description: 'Client uncontactable sequence',
    sequence: 'SMS → WhatsApp → Email → Call → Letter',
    totalSteps: 5
  },
  {
    id: 'bank_statement_chase',
    name: 'Bank Statement Chase',
    description: 'Request bank statements',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 4) → Call (Day 7)',
    totalSteps: 4
  },
  {
    id: 'fos_form_chase',
    name: 'FOS Form Chase',
    description: 'Chase FOS complaint form signature',
    sequence: 'Email → SMS (Day 1) → WhatsApp (Day 2) → Call (Day 3)',
    totalSteps: 4
  },
  {
    id: 'acceptance_form_chase',
    name: 'Acceptance Form Chase',
    description: 'Chase offer acceptance form',
    sequence: 'Email → SMS (Day 1) → WhatsApp (Day 2) → Call (Day 3)',
    totalSteps: 4
  },
  {
    id: 'bank_details_chase',
    name: 'Bank Details Chase',
    description: 'Request/verify bank details',
    sequence: 'Email → SMS (Day 2) → WhatsApp (Day 3)',
    totalSteps: 3
  },
  {
    id: 'outstanding_fees_chase',
    name: 'Outstanding Fees Chase',
    description: 'Chase outstanding fee payment',
    sequence: 'Email → SMS (Day 3) → WhatsApp (Day 5) → Call (Day 7) → Letter (Day 14)',
    totalSteps: 5
  }
];

// Communication Filter Options
export const COMMUNICATION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email Only' },
  { id: 'sms', label: 'SMS Only' },
  { id: 'whatsapp', label: 'WhatsApp Only' },
  { id: 'call', label: 'Calls Only' },
  { id: 'inbound', label: 'Inbound Only' },
  { id: 'outbound', label: 'Outbound Only' }
];

// Action Timeline Filter Options
export const TIMELINE_FILTERS = [
  { id: 'all', label: 'All Actions' },
  { id: 'agent', label: 'By Agent' },
  { id: 'account', label: 'Account Actions' },
  { id: 'claims', label: 'Claims' },
  { id: 'communication', label: 'Communication' },
  { id: 'documents', label: 'Documents' },
  { id: 'notes', label: 'Notes' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'system', label: 'System' }
];

// Helper to generate Client ID in format RR-YYMMDD-XXXX
export const generateClientId = (sequenceNumber: number): string => {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const seq = sequenceNumber.toString().padStart(4, '0');
  return `RR-${yy}${mm}${dd}-${seq}`;
};

// SMS Templates
export const SMS_TEMPLATES = [
  {
    id: 'reminder',
    name: 'Appointment Reminder',
    content: 'Rowan Rose Solicitors: Reminder - you have an appointment scheduled. Please reply to confirm.'
  },
  {
    id: 'document_request',
    name: 'Document Request',
    content: 'Rowan Rose Solicitors: We require additional documents for your claim. Please check your email for details.'
  },
  {
    id: 'status_update',
    name: 'Status Update',
    content: 'Rowan Rose Solicitors: Your claim status has been updated. Log in to your portal or contact us for details.'
  },
  {
    id: 'callback_request',
    name: 'Callback Request',
    content: 'Rowan Rose Solicitors: We tried to reach you. Please call us back at your earliest convenience.'
  }
];

// Email Templates
export const EMAIL_TEMPLATES = [
  {
    id: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to Rowan Rose Solicitors',
    content: 'Dear {{firstName}},\n\nThank you for choosing Rowan Rose Solicitors...'
  },
  {
    id: 'dsar_update',
    name: 'DSAR Update',
    subject: 'Update on Your DSAR Request',
    content: 'Dear {{firstName}},\n\nWe are writing to update you on your DSAR request...'
  },
  {
    id: 'offer_notification',
    name: 'Offer Notification',
    subject: 'Offer Received for Your Claim',
    content: 'Dear {{firstName}},\n\nWe are pleased to inform you that an offer has been received...'
  }
];

// Call Outcome Options
export const CALL_OUTCOMES = [
  'Connected - Information Gathered',
  'Connected - Callback Requested',
  'Connected - Documents Promised',
  'Connected - Issue Resolved',
  'Voicemail Left',
  'No Answer',
  'Wrong Number',
  'Number Disconnected',
  'Busy - Will Retry'
];

// WhatsApp Templates
export const WHATSAPP_TEMPLATES = [
  {
    id: 'greeting',
    name: 'Greeting',
    content: 'Hello {{firstName}}, thank you for contacting Rowan Rose Solicitors. How can we help you today?'
  },
  {
    id: 'document_reminder',
    name: 'Document Reminder',
    content: 'Hi {{firstName}}, this is a friendly reminder that we are still waiting for your documents. Please upload them at your earliest convenience or reply to this message if you need assistance.'
  },
  {
    id: 'status_update',
    name: 'Status Update',
    content: 'Hi {{firstName}}, we have an update on your claim with {{lender}}. Please check your email or contact us for more details.'
  },
  {
    id: 'callback_request',
    name: 'Callback Request',
    content: 'Hi {{firstName}}, we tried to reach you earlier. Please call us back at your earliest convenience or let us know a suitable time to call you.'
  },
  {
    id: 'appointment_confirmation',
    name: 'Appointment Confirmation',
    content: 'Hi {{firstName}}, this is to confirm your appointment with Rowan Rose Solicitors. Please reply YES to confirm or contact us to reschedule.'
  },
  {
    id: 'offer_received',
    name: 'Offer Received',
    content: 'Great news {{firstName}}! We have received an offer on your claim. Please check your email for full details or call us to discuss.'
  }
];

// ============================================
// Lender Selection Form Constants
// ============================================

export interface LenderCategory {
  title: string;
  lenders: string[];
}

export const LENDER_CATEGORIES: LenderCategory[] = [
  {
    title: 'TICK THE CREDIT CARDS WHICH APPLY TO YOU :',
    lenders: [
      'AQUA',
      'BIP CREDIT CARD',
      'FLUID',
      'VANQUIS',
      'LUMA',
      'MARBLES',
      'MBNA',
      'OCEAN',
      'REVOLUT CREDIT CARD',
      'WAVE',
      'ZABLE',
      'ZILCH',
      '118 118 MONEY'
    ]
  },
  {
    title: 'TICK THE PAYDAY LOANS / LOANS WHICH APPLY TO YOU :',
    lenders: [
      'ADMIRAL LOANS',
      'ANICO FINANCE',
      'AVANT CREDIT',
      'BAMBOO',
      'BETTER BORROW',
      'CREDIT SPRING',
      'CASH ASAP',
      'CASH FLOAT',
      'CAR CASH POINT',
      'CREATION FINANCE',
      'CASTLE COMMUNITY BANK',
      'DRAFTY LOANS',
      'EVOLUTION MONEY',
      'EVERY DAY LENDING',
      'FERNOVO',
      'FAIR FINANCE',
      'FINIO LOANS',
      'FINTERN',
      'FLURO',
      'KOYO LOANS',
      'LIKELY LOANS',
      'LOANS2GO',
      'LOANS BY MAL',
      'LOGBOOK LENDING',
      'LOGBOOK MONEY',
      'LENDING STREAM',
      'LENDABLE',
      'LIFE STYLE LOANS',
      'MY COMMUNITY FINANCE',
      'MY KREDIT',
      'MY FINANCE CLUB',
      'MONEY BOAT',
      'MR LENDER',
      'MONEY LINE',
      'MY COMMUNITY BANK',
      'MONTHLY ADVANCE LOANS',
      'NOVUNA',
      'OPOLO',
      'PM LOANS',
      'POLAR FINANCE',
      'POST OFFICE MONEY',
      'PROGRESSIVE MONEY',
      'PLATA FINANCE',
      'PLEND',
      'QUID MARKET',
      'QUICK LOANS',
      'SKYLINE DIRECT',
      'SALAD MONEY',
      'SAVVY LOANS',
      'SALARY FINANCE (NEYBER)',
      'SNAP FINANCE',
      'SHAWBROOK',
      'THE ONE STOP MONEY SHOP',
      'TM ADVANCES',
      'TANDEM',
      '118 LOANS',
      'WAGESTREAM',
      'CONSOLADATION LOAN'
    ]
  },
  {
    title: 'TICK THE GUARANTOR LOANS WHICH APPLY TO YOU :',
    lenders: [
      'GUARANTOR MY LOAN',
      'HERO LOANS',
      'JUO LOANS',
      'SUCO',
      'UK CREDIT',
      '1 PLUS 1'
    ]
  },
  {
    title: 'TICK THE LOGBOOK LOANS / PAWNBROKERS WHICH APPLY TO YOU :',
    lenders: [
      'CASH CONVERTERS',
      'H&T PAWNBROKERS'
    ]
  },
  {
    title: 'TICK THE CATALOGUES WHICH APPLY TO YOU :',
    lenders: [
      'FASHION WORLD',
      'JD WILLIAMS',
      'SIMPLY BE',
      'VERY CATALOGUE'
    ]
  },
  {
    title: 'TICK THE CAR FINANCE WHICH APPLY TO YOU :',
    lenders: [
      'ADVANTAGE FINANCE',
      'AUDI / VOLKSWAGEN FINANCE / SKODA',
      'BLUE MOTOR FINANCE',
      'CLOSE BROTHERS',
      'HALIFAX / BANK OF SCOTLAND',
      'MONEY WAY',
      'MOTONOVO',
      'MONEY BARN',
      'OODLE',
      'PSA FINANCE',
      'RCI FINANCIAL'
    ]
  },
  {
    title: 'TICK THE OVERDRAFTS WHICH APPLY TO YOU :',
    lenders: [
      'HALIFAX OVERDRAFT',
      'BARCLAYS OVERDRAFT',
      'CO-OP BANK OVERDRAFT',
      'LLOYDS OVERDRAFT',
      'TSB OVERDRAFT OVERDRAFT',
      'NATWEST / RBS OVERDRAFT',
      'HSBC OVERDRAFT',
      'SANTANDER OVERDRAFT'
    ]
  }
];

// Flatten all lenders for easy access
export const ALL_LENDERS = LENDER_CATEGORIES.flatMap(category => category.lenders);

