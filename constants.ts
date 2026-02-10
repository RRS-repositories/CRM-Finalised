import { Conversation, Contact, Document, Template, Form, KPI, ClaimStatus, EmailAccount, EmailFolder, Email } from './types';

// Pipeline Categories for Kanban board
export const PIPELINE_CATEGORIES = [
  {
    id: 'lead-generation',
    title: 'Lead Generation & SALES',
    color: 'border-l-blue-500',
    statuses: [
      ClaimStatus.NEW_LEAD,
      ClaimStatus.CONTACT_ATTEMPTED,
      ClaimStatus.NOT_QUALIFIED,
      ClaimStatus.SALE,
      ClaimStatus.LOA_SENT,
    ],
  },
  {
    id: 'onboarding',
    title: 'Client Onboarding',
    color: 'border-l-purple-500',
    statuses: [
      ClaimStatus.LOA_SIGNED,
      ClaimStatus.LOA_UPLOADED,
      ClaimStatus.ID_REQUEST_SENT,
      ClaimStatus.ID_VERIFICATION_PENDING,
      ClaimStatus.POA_REQUIRED,
      ClaimStatus.EXTRA_LENDER_FORM_SENT,
      ClaimStatus.EXTRA_LENDER_FORM_COMPLETED,
      ClaimStatus.QUESTIONNAIRE_SENT,
      ClaimStatus.QUESTIONNAIRE_COMPLETED,
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
      ClaimStatus.DSAR_PREPARED_AWAITING_ID,
      ClaimStatus.DSAR_SENT,
      ClaimStatus.UNABLE_TO_LOCATE,
      ClaimStatus.UNABLE_TO_LOCATE_ACCOUNT_NUMBER,
      ClaimStatus.DSAR_OVERDUE,
      ClaimStatus.DSAR_RESPONSE_RECEIVED,
      ClaimStatus.DSAR_ESCALATED,
      ClaimStatus.DSAR_REVIEW_COMPLETED,
      ClaimStatus.WEAK_CASE_CANNOT_CONTINUE,
      ClaimStatus.MISSING_DATA_FROM_DSAR,
    ],
  },
  {
    id: 'complaint',
    title: 'Complaint Submission & Processing',
    color: 'border-l-orange-500',
    statuses: [
      ClaimStatus.COMPLAINT_DRAFTED,
      ClaimStatus.COMPLAINT_DRAFTED_AWAITING_QUESTIONNAIRE,
      ClaimStatus.COMPLAINT_SUBMITTED,
      ClaimStatus.COMPLAINT_OVERDUE,
      ClaimStatus.UPHELD,
      ClaimStatus.PARTIAL_UPHELD,
      ClaimStatus.NOT_UPHELD,
      ClaimStatus.COUNTER_TEAM,
      ClaimStatus.COUNTER_RESPONSE_SENT,
    ],
  },
  {
    id: 'fos-escalation',
    title: 'FOS Escalation',
    color: 'border-l-red-500',
    statuses: [
      ClaimStatus.FOS_REFERRAL_PREPARED,
      ClaimStatus.FOS_SUBMITTED,
      ClaimStatus.FOS_CASE_NUMBER_RECEIVED,
      ClaimStatus.FOS_INVESTIGATION,
      ClaimStatus.FOS_PROVISIONAL_DECISION,
      ClaimStatus.FOS_FINAL_DECISION,
      ClaimStatus.FOS_APPEAL,
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    color: 'border-l-green-500',
    statuses: [
      ClaimStatus.OFFER_RECEIVED,
      ClaimStatus.OFFER_UNDER_NEGOTIATION,
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
  {
    id: 'debt-recovery',
    title: 'Debt Recovery',
    color: 'border-l-cyan-500',
    statuses: [
      ClaimStatus.DEBT_RECOVERY_INITIATED,
      ClaimStatus.PAYMENT_PLAN_AGREED,
      ClaimStatus.DEBT_COLLECTION_STARTED,
      ClaimStatus.PARTIAL_PAYMENT_RECEIVED,
      ClaimStatus.DEBT_SETTLED,
      ClaimStatus.DEBT_WRITTEN_OFF,
    ],
  },
];

// Empty arrays - data is now fetched from the database
export const MOCK_CONTACTS: Contact[] = [];
export const MOCK_DOCUMENTS: Document[] = [];
export const MOCK_TEMPLATES: Template[] = [
  {
    id: 'tpl-001',
    name: 'Letter of Authority FAC',
    category: 'Legal',
    description: 'Standard Letter of Authority template for Fast Action Claims',
    content: '<p>Dear Sir/Madam,</p><p>I hereby authorize Fast Action Claims to act on my behalf...</p>',
    lastModified: '2025-01-15'
  },
  {
    id: 'tpl-002',
    name: 'Email - Initial Contact',
    category: 'Correspondence',
    description: 'First contact email template for new leads',
    content: '<p>Dear {{client.name}},</p><p>Thank you for contacting Fast Action Claims...</p>',
    lastModified: '2025-01-20'
  },
  {
    id: 'tpl-003',
    name: 'SMS - Appointment Reminder',
    category: 'General',
    description: 'SMS template for appointment reminders',
    content: 'Hi {{client.name}}, reminder: your appointment is scheduled for {{date}}. Reply YES to confirm.',
    lastModified: '2025-01-18'
  },
  {
    id: 'tpl-004',
    name: 'Letter - DSAR Request',
    category: 'Legal',
    description: 'Data Subject Access Request letter template',
    content: '<p>To whom it may concern,</p><p>Under the Data Protection Act 2018...</p>',
    lastModified: '2025-01-22'
  },
  {
    id: 'tpl-005',
    name: 'Email - Claim Update',
    category: 'Correspondence',
    description: 'Email template for updating clients on claim progress',
    content: '<p>Dear {{client.name}},</p><p>We wanted to update you on the progress of your claim...</p>',
    lastModified: '2025-01-25'
  }
];
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
  { id: 'irl-claims', name: 'IRL Claims', count: 3 },
];

// Template variables for mail merge (grouped by category)
export const TEMPLATE_VARIABLES = [
  {
    category: 'Client Details',
    vars: [
      { key: '{{fullName}}', label: 'Full Name' },
      { key: '{{firstName}}', label: 'First Name' },
      { key: '{{lastName}}', label: 'Last Name' },
      { key: '{{email}}', label: 'Email' },
      { key: '{{phone}}', label: 'Phone' },
      { key: '{{address}}', label: 'Address' },
    ]
  },
  {
    category: 'Claim Details',
    vars: [
      { key: '{{lender}}', label: 'Lender' },
      { key: '{{claimValue}}', label: 'Claim Value' },
      { key: '{{caseRef}}', label: 'Case Reference' },
    ]
  },
  {
    category: 'General',
    vars: [
      { key: '{{today}}', label: 'Today\'s Date' },
      { key: '{{companyName}}', label: 'Company Name' },
    ]
  }
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

// Get status color with fallback for all statuses
// Colors match the pipeline stage header colors
export const getSpecStatusColor = (status: string): string => {
  // Category 1: Lead Generation & SALES - Blue (#3B82F6)
  if (status === 'New Lead' || status === 'Contact Attempted' || status === 'SALE' || status === 'LOA Sent') {
    return '#3B82F6';
  }
  if (status === 'Not Qualified') {
    return '#78909C'; // Muted blue-grey for disqualified
  }

  // Category 2: Client Onboarding - Purple (#9C27B0)
  if (status === 'LOA Signed' || status === 'ID Request Sent' || status === 'ID Verification Pending' ||
    status === 'POA Required' ||
    status === 'Extra Lender Selection Form Sent' || status === 'Extra Lender Selection Form Completed' ||
    status === 'Questionnaire Sent' || status === 'Questionnaire Completed' ||
    status === 'Bank Statements Requested' || status === 'Bank Statements Received' ||
    status === 'Onboarding Complete') {
    return '#9C27B0';
  }

  // Category 3: DSAR Process - Orange (#FF9800)
  if (status === 'DSAR Prepared' || status === 'DSAR Prepared Awaiting I.D' || status === 'DSAR Sent to Lender' ||
    status === 'Unable to Locate' || status === 'Unable to Locate Account Number' ||
    status === 'DSAR Overdue' || status === 'DSAR Response Received' || status === 'DSAR Escalated (ICO)' ||
    status === 'Dsar Review Completed') {
    return '#FF9800';
  }
  // Weak case / Missing data - Amber/Warning
  if (status === 'Weak Case Cannot Continue' || status === 'Missing Data From Dsar') {
    return '#F59E0B';
  }

  // Category 4: Complaint Submission & Processing - Coral/Pink (#F06292)
  if (status === 'Complaint Drafted' || status === 'Complaint Drafted Awaiting Questionnaire' ||
    status === 'Complaint Submitted' || status === 'Complaint Overdue' ||
    status === 'Counter team' || status === 'Counter Response sent') {
    return '#F06292';
  }
  // Complaint outcomes
  if (status === 'Upheld') {
    return '#10B981'; // Green for upheld
  }
  if (status === 'Partial Upheld') {
    return '#06B6D4'; // Cyan for partial
  }
  if (status === 'Not upheld') {
    return '#EF4444'; // Red for not upheld
  }

  // Category 5: FOS Escalation - Red (#EF5350)
  if (status === 'FOS Referral Prepared' || status === 'FOS Submitted' || status === 'FOS Case Number Received' ||
    status === 'FOS Investigation' || status === 'FOS Provisional Decision' || status === 'FOS Final Decision' ||
    status === 'FOS Appeal') {
    return '#EF5350';
  }

  // Category 6: Payments - Green (#4CAF50)
  if (status === 'Offer Received' || status === 'Offer Under Negotiation' || status === 'Offer Accepted' ||
    status === 'Awaiting Payment' || status === 'Payment Received' || status === 'Fee Deducted' ||
    status === 'Client Paid' || status === 'Claim Successful') {
    return '#4CAF50';
  }

  // Unsuccessful/Withdrawn - Dark red
  if (status === 'Claim Unsuccessful' || status === 'Claim Withdrawn') {
    return '#B71C1C';
  }

  // Category 7: Debt Recovery - Cyan (#0891B2)
  if (status === 'Debt Recovery Initiated' || status === 'Payment Plan Agreed' ||
    status === 'Debt Collection Started' || status === 'Partial Payment Received' ||
    status === 'Debt Settled' || status === 'Debt Written Off') {
    return '#0891B2';
  }

  // Check spec statuses for legacy support
  if (SPEC_STATUS_COLORS[status]) {
    return SPEC_STATUS_COLORS[status];
  }

  // Default - Blue for unmatched
  return '#3B82F6';
};

// Lenders from Specification (all separate entries, no grouped "/" format)
export const SPEC_LENDERS = [
  '118 LOANS',
  '118 MONEY',
  '1PLUS1LOANS',
  '247 MONEYBOX',
  'ABOUND',
  'ADMIRAL LOAN',
  'ADVANTAGE FINANCE',
  'ALPHERA',
  'ALPHERA FINANCE',
  'AMBROSE WILSON',
  'AMERICAN EXPRESS',
  'AMIGO LOANS',
  'ANICO FINANCE',
  'AQUA',
  'ARGOS',
  'ARROW',
  'ASDA',
  'AUDI',
  'AUDI FINANCE',
  'AVANT',
  'BAMBOO',
  'BAMBOO LOANS',
  'BANK OF SCOTLAND',
  'BARCLAYCARD',
  'BARCLAYS',
  'BARCLAYS CREDIT CARD',
  'BARCLAYS OVERDRAFT',
  'BETTER BORROW',
  'BIP CREDIT',
  'BIP CREDIT CARD',
  'BLACKHORSE',
  'BLUE MOTOR FINANCE',
  'BMW',
  'BMW FINANCIAL SERVICES',
  'BRIGHTHOUSE',
  'BURTONS',
  'CABOT',
  'CABOT FINANCIAL',
  'CAPITAL ONE',
  'CAPQUEST',
  'CAR CASH POINT',
  'CASH 4 U',
  'CASH ASAP',
  'CASHASAP',
  'CASH CONVERTERS',
  'CASH FLOAT',
  'CASH PLUS',
  'CASHFLOAT',
  'CASHPLUS',
  'CASTLE COMMUNITY BANK',
  'CATALOGUE CLAIM',
  'CITI BANK',
  'CLC FINANCE',
  'CLOSE BROTHERS',
  'CLYDESDALE',
  'CO-OP BANK OVERDRAFT',
  'CO-OPERATIVE BANK',
  'CONSOLADATION LOAN',
  'CREATION FINANCE',
  'CREDIT SPRING',
  'DANSKE BANK',
  'DEBENHAMS',
  'DOROTHY PERKINS',
  'DOT DOT LOANS',
  'DRAFTY',
  'DRAFTY LOANS',
  'EQUIFAX',
  'EVANS CATALOGUE',
  'EVERYDAY LENDING',
  'EVERYDAY LOANS',
  'EVOLUTION FUNDING',
  'EVOLUTION LENDING',
  'EVOLUTION MONEY',
  'EXPERIAN',
  'FAIR FINANCE',
  'FASHION WORLD',
  'FERNOVO',
  'FINIO',
  'FINIO LOANS',
  'FINTERN',
  'FIRST DIRECT',
  'FIRST RESPONSE FINANCE',
  'FLUID',
  'FLURO',
  'FREEMANS',
  'FREEMANS CATALOUGE',
  'FUND OURSELVES',
  'G UNIVERSAL',
  'G.L.M. FINANCE',
  'GAMBLING',
  'GE CAPITAL',
  'GEORGE BANCO',
  'GLASGOW CREDIT UNION',
  'GOLDFISH',
  'GRATTAN',
  'GREAT UNIVERSAL',
  'GUARANTOR MY LOAN',
  'H&T PAWN BROKERS',
  'H&T PAWNBROKERS',
  'HALIFAX',
  'HERO LOANS',
  'HITACHI CAPITAL FINANCE',
  'HSBC',
  'HSBC BANK',
  'ICO',
  'INDIGO MICHAEL LTD',
  'INTRUM',
  'INTRUM UK',
  'IRRESPONSIBLE LENDING',
  'JACAMO',
  'JAJA FINANCE',
  'JD WILLIAMS',
  'JOHN LEWIS',
  'JUO LOANS',
  'KAYS',
  'KLARNA',
  'KOYO',
  'KOYO LOANS',
  'LANTERN',
  'LENDABLE',
  'LENDING STREAM',
  'LENDING WORKS',
  'LIFE STYLE LOANS',
  'LIKELY LOANS',
  'LINK',
  'LINK FINANCIAL',
  'LITTLE LOANS',
  'LITTLEWOODS',
  'LIVELEND',
  'LLOYDS BANK',
  'LLOYDS FINANCE',
  'LLOYDS OVERDRAFT',
  'LLOYDS TSB',
  'LOAN4YOU',
  'LOANS 2 GO',
  'LOANS2GO',
  'LOANS AT HOME',
  'LOANS BY MAL',
  'LOGBOOK LENDING',
  'LOGBOOK LENDING LOAN',
  'LOGBOOK MONEY',
  'LOLLY LOANS',
  'LOWELL',
  'LUMA',
  'M&S BANK',
  'MARBLES',
  'MARKS & SPENCERS',
  'MBNA',
  'METRO BANK',
  'MINI',
  'MONEY BARN',
  'MONEY BOAT',
  'MONEY LINE',
  'MONEY SHOP',
  'MONEY STREAM',
  'MONEY WAY',
  'MONEYBOAT',
  'MONTHLY ADVANCE LOANS',
  'MONUMENT',
  'MONZO',
  'MORSES CLUB',
  'MOTONOVO',
  'MR LENDER',
  'MUIRHEAD FINANCE',
  'MUTUAL FINANCE',
  'MY COMMUNITY BANK',
  'MY COMMUNITY FINANCE',
  'MY FINANCE CLUB',
  'MY KREDIT',
  'NATIONWIDE',
  'NATWEST',
  'NATWEST BANK',
  'NATWEST FINANCE',
  'NAYLORS FINANCE',
  'NEWDAY',
  'NEWDAY FINANCE',
  'NEXT',
  'NORWICH TRUST',
  'NOVUNA',
  'NOVUNA FINANCE',
  'OCEAN FINANCE',
  'ONDAL',
  'ONDAL FINANCE',
  'ONE PLUS ONE LOANS',
  'ONMO',
  'OODLE',
  'OODLE CAR FINANCE',
  'OPLO',
  'OPOLO',
  'OPUS',
  'OVERDRAFT CLAIM',
  'PACKAGE BANK ACCOUNT',
  'PAYDAY LOAN',
  'PAYDAY LOAN CLAIM',
  'PAYDAY UK',
  'PAYPAL',
  'PEACHY LOANS',
  'PERCH GROUP',
  'PIGGYBANK',
  'PLATA FINANCE',
  'PLEND',
  'PM LOANS',
  'POLAR CREDIT',
  'POLAR FINANCE',
  'POST',
  'POST OFFICE',
  'POST OFFICE MONEY',
  'POUNDS2POCKET',
  'PRA',
  'PRA GROUP',
  'PROGRESSIVE MONEY',
  'PROVIDENT',
  'PSA FINANCE',
  'PSA GROUP',
  'QUICK LOANS',
  'QUICKQUID',
  'QUID MARKET',
  'RATE SETTER',
  'RBS',
  'RBS OVERDRAFT',
  'RCI FINANCIAL',
  'REEVO',
  'RENAULT',
  'REVOLUT',
  'ROYAL BANK',
  'ROYAL BANK OF SCOTLAND',
  'SAFETYNET',
  'SAFETY NET LOANS',
  'SAINSBURY\'S BANK',
  'SALAD MONEY',
  'SALARY FINANCE',
  'SANTANDER',
  'SATSUMA LOANS',
  'SAVVY LOANS',
  'SHAWBROOK BANK',
  'SHAWBROOK FINANCE',
  'SHOP DIRECT',
  'SHORT TERM FINANCE',
  'SIMPLY BE',
  'SKODA',
  'SKYLINE DIRECT',
  'SNAP FINANCE',
  'STARTLINE',
  'STEP CHANGE',
  'STERLING FINANCE',
  'STUDIO',
  'STUDIO CATALOGUE',
  'SUCO',
  'SUNNY LOANS',
  'SWIFT LOANS',
  'TANDEM',
  'TAPPILY',
  'TESCO BANK',
  'THE CO-OPERATIVE BANK',
  'THE ONE STOP MONEY SHOP',
  'THINKMONEY',
  'TICK TOCK LOANS',
  'TM ADVANCES',
  'TRANSUNION',
  'TSB',
  'UK CREDIT',
  'ULSTER BANK',
  'UPDRAFT',
  'VANQUIS',
  'VAUXHALL',
  'VAUXHALL FINANCE',
  'VERY',
  'VERY CATALOGUE',
  'VIRGIN',
  'VOLKSWAGEN FINANCE',
  'WAGE DAY ADVANCES',
  'WAGEDAY ADVANCE',
  'WAGESTREAM',
  'WAVE',
  'WELCOME FINANCE',
  'WONGA',
  'YORKSHIRE BANK',
  'ZABLE',
  'ZEMPLER BANK',
  'ZILCH',
  'ZOPA',
  'Other (specify)'
];

// Finance Types from Specification
export const FINANCE_TYPES = [
  'Car Finance Claim',
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
  'DSAR',
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
      'Aqua',
      'Bip Credit Card',
      'Fluid',
      'Vanquis',
      'Luma',
      'Marbles',
      'MBNA',
      'Ocean',
      'Revolut Credit Card',
      'Wave',
      'Zable',
      'ZilCH',
      '118 118 Money'
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
      'Loans 2 Go',
      'LOANS BY MAL',
      'LOGBOOK LENDING',
      'LOGBOOK MONEY',
      'Lending Stream',
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

// ============================================
// Email Module Mock Data (Outlook-style interface)
// ============================================

export const MOCK_EMAIL_ACCOUNTS: EmailAccount[] = [
  {
    id: 'acc-1',
    email: 'info@fastactionclaims.co.uk',
    displayName: 'Fast Action Claims',
    provider: 'office365',
    isConnected: true,
    unreadCount: 8,
    color: '#1E3A5F'
  },
  {
    id: 'acc-2',
    email: 'irl@rowanrose.co.uk',
    displayName: 'Rowan Rose IRL',
    provider: 'office365',
    isConnected: true,
    unreadCount: 3,
    color: '#9C27B0'
  },
  {
    id: 'acc-3',
    email: 'DSAR@fastactionclaims.co.uk',
    displayName: 'DSAR Requests',
    provider: 'office365',
    isConnected: true,
    unreadCount: 12,
    color: '#FF9800'
  }
];

export const MOCK_EMAIL_FOLDERS: EmailFolder[] = [
  // Fast Action Claims folders
  { id: 'inbox-acc-1', accountId: 'acc-1', name: 'inbox', displayName: 'Inbox', unreadCount: 8, totalCount: 156 },
  { id: 'drafts-acc-1', accountId: 'acc-1', name: 'drafts', displayName: 'Drafts', unreadCount: 0, totalCount: 3 },
  { id: 'sent-acc-1', accountId: 'acc-1', name: 'sent', displayName: 'Sent', unreadCount: 0, totalCount: 89 },
  // Rowan Rose IRL folders
  { id: 'inbox-acc-2', accountId: 'acc-2', name: 'inbox', displayName: 'Inbox', unreadCount: 3, totalCount: 45 },
  { id: 'drafts-acc-2', accountId: 'acc-2', name: 'drafts', displayName: 'Drafts', unreadCount: 0, totalCount: 1 },
  { id: 'sent-acc-2', accountId: 'acc-2', name: 'sent', displayName: 'Sent', unreadCount: 0, totalCount: 32 },
  // DSAR Requests folders
  { id: 'inbox-acc-3', accountId: 'acc-3', name: 'inbox', displayName: 'Inbox', unreadCount: 12, totalCount: 234 },
  { id: 'drafts-acc-3', accountId: 'acc-3', name: 'drafts', displayName: 'Drafts', unreadCount: 0, totalCount: 5 },
  { id: 'sent-acc-3', accountId: 'acc-3', name: 'sent', displayName: 'Sent', unreadCount: 0, totalCount: 198 },
];

export const MOCK_EMAILS: Email[] = [
  // Fast Action Claims Inbox emails
  {
    id: 'email-1',
    accountId: 'acc-1',
    folderId: 'inbox-acc-1',
    from: { email: 'john.smith@gmail.com', name: 'John Smith' },
    to: [{ email: 'info@fastactionclaims.co.uk', name: 'Fast Action Claims' }],
    subject: 'Re: Claim Reference FAC-2025-001234 - Bank Statements Attached',
    bodyText: 'Dear Fast Action Claims Team,\n\nThank you for the update on my claim. Please find attached my bank statements for the last 6 months as requested.\n\nI have also included a copy of my ID as verification.\n\nPlease let me know if you need any additional documentation.\n\nKind regards,\nJohn Smith',
    bodyHtml: '<p>Dear Fast Action Claims Team,</p><p>Thank you for the update on my claim. Please find attached my bank statements for the last 6 months as requested.</p><p>I have also included a copy of my ID as verification.</p><p>Please let me know if you need any additional documentation.</p><p>Kind regards,<br/>John Smith</p>',
    receivedAt: '2026-01-28T10:30:00Z',
    isRead: false,
    isStarred: true,
    isDraft: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-1', filename: 'bank_statement_jan.pdf', mimeType: 'application/pdf', size: 245000 },
      { id: 'att-2', filename: 'bank_statement_feb.pdf', mimeType: 'application/pdf', size: 238000 },
      { id: 'att-3', filename: 'id_document.jpg', mimeType: 'image/jpeg', size: 1200000 }
    ]
  },
  {
    id: 'email-2',
    accountId: 'acc-1',
    folderId: 'inbox-acc-1',
    from: { email: 'sarah.jones@outlook.com', name: 'Sarah Jones' },
    to: [{ email: 'info@fastactionclaims.co.uk', name: 'Fast Action Claims' }],
    subject: 'Query about my Vanquis claim progress',
    bodyText: 'Hello,\n\nI submitted my claim against Vanquis about 3 weeks ago and wanted to check on the progress. My reference number is FAC-2025-000987.\n\nCould you please provide an update?\n\nThank you,\nSarah Jones',
    bodyHtml: '<p>Hello,</p><p>I submitted my claim against Vanquis about 3 weeks ago and wanted to check on the progress. My reference number is FAC-2025-000987.</p><p>Could you please provide an update?</p><p>Thank you,<br/>Sarah Jones</p>',
    receivedAt: '2026-01-28T09:15:00Z',
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false
  },
  {
    id: 'email-3',
    accountId: 'acc-1',
    folderId: 'inbox-acc-1',
    from: { email: 'mike.wilson@yahoo.co.uk', name: 'Mike Wilson' },
    to: [{ email: 'info@fastactionclaims.co.uk', name: 'Fast Action Claims' }],
    subject: 'New claim enquiry - Multiple lenders',
    bodyText: 'Hi there,\n\nI am interested in making claims against several lenders. I have had issues with Aqua, Vanquis, and Lending Stream.\n\nCould someone call me to discuss? My number is 07700 900123.\n\nBest regards,\nMike Wilson',
    bodyHtml: '<p>Hi there,</p><p>I am interested in making claims against several lenders. I have had issues with Aqua, Vanquis, and Lending Stream.</p><p>Could someone call me to discuss? My number is 07700 900123.</p><p>Best regards,<br/>Mike Wilson</p>',
    receivedAt: '2026-01-28T08:45:00Z',
    isRead: true,
    isStarred: false,
    isDraft: false,
    hasAttachments: false
  },
  {
    id: 'email-4',
    accountId: 'acc-1',
    folderId: 'inbox-acc-1',
    from: { email: 'compliance@vanquis.co.uk', name: 'Vanquis Compliance Team' },
    to: [{ email: 'info@fastactionclaims.co.uk', name: 'Fast Action Claims' }],
    subject: 'RE: DSAR Request - Client: Emma Thompson - Ref: VQ-DSAR-2026-4521',
    bodyText: 'Dear Sir/Madam,\n\nWe acknowledge receipt of your Data Subject Access Request on behalf of Ms Emma Thompson.\n\nWe are processing this request and will respond within the statutory timeframe of 30 days.\n\nYour reference: FAC-2025-001156\nOur reference: VQ-DSAR-2026-4521\n\nRegards,\nVanquis Compliance Team',
    bodyHtml: '<p>Dear Sir/Madam,</p><p>We acknowledge receipt of your Data Subject Access Request on behalf of Ms Emma Thompson.</p><p>We are processing this request and will respond within the statutory timeframe of 30 days.</p><p>Your reference: FAC-2025-001156<br/>Our reference: VQ-DSAR-2026-4521</p><p>Regards,<br/>Vanquis Compliance Team</p>',
    receivedAt: '2026-01-27T16:30:00Z',
    isRead: true,
    isStarred: true,
    isDraft: false,
    hasAttachments: false
  },
  {
    id: 'email-5',
    accountId: 'acc-1',
    folderId: 'inbox-acc-1',
    from: { email: 'noreply@lendingstream.co.uk', name: 'Lending Stream' },
    to: [{ email: 'info@fastactionclaims.co.uk', name: 'Fast Action Claims' }],
    subject: 'Final Response Letter - Complaint Reference LS-2026-78432',
    bodyText: 'Dear Fast Action Claims,\n\nPlease find attached our Final Response Letter regarding the complaint submitted on behalf of Mr David Brown.\n\nWe have upheld the complaint and have calculated a refund of £2,340.56.\n\nPlease confirm acceptance of this offer within 14 days.\n\nRegards,\nLending Stream Complaints Team',
    bodyHtml: '<p>Dear Fast Action Claims,</p><p>Please find attached our Final Response Letter regarding the complaint submitted on behalf of Mr David Brown.</p><p>We have upheld the complaint and have calculated a refund of <strong>£2,340.56</strong>.</p><p>Please confirm acceptance of this offer within 14 days.</p><p>Regards,<br/>Lending Stream Complaints Team</p>',
    receivedAt: '2026-01-27T14:22:00Z',
    isRead: false,
    isStarred: true,
    isDraft: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-4', filename: 'Final_Response_Letter_LS-2026-78432.pdf', mimeType: 'application/pdf', size: 156000 }
    ]
  },
  // Rowan Rose IRL Inbox emails
  {
    id: 'email-6',
    accountId: 'acc-2',
    folderId: 'inbox-acc-2',
    from: { email: 'client.services@hsbc.co.uk', name: 'HSBC Client Services' },
    to: [{ email: 'irl@rowanrose.co.uk', name: 'Rowan Rose IRL' }],
    subject: 'LOA Confirmation - Account Holder: James Taylor',
    bodyText: 'Dear Rowan Rose Solicitors,\n\nWe confirm receipt of your Letter of Authority for the account holder James Taylor.\n\nWe will now process your request and respond accordingly.\n\nRegards,\nHSBC Client Services',
    bodyHtml: '<p>Dear Rowan Rose Solicitors,</p><p>We confirm receipt of your Letter of Authority for the account holder James Taylor.</p><p>We will now process your request and respond accordingly.</p><p>Regards,<br/>HSBC Client Services</p>',
    receivedAt: '2026-01-28T11:00:00Z',
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false
  },
  {
    id: 'email-7',
    accountId: 'acc-2',
    folderId: 'inbox-acc-2',
    from: { email: 'lisa.brown@gmail.com', name: 'Lisa Brown' },
    to: [{ email: 'irl@rowanrose.co.uk', name: 'Rowan Rose IRL' }],
    subject: 'Signed LOA documents attached',
    bodyText: 'Hi,\n\nPlease find attached my signed Letter of Authority documents as requested.\n\nLet me know if you need anything else.\n\nThanks,\nLisa',
    bodyHtml: '<p>Hi,</p><p>Please find attached my signed Letter of Authority documents as requested.</p><p>Let me know if you need anything else.</p><p>Thanks,<br/>Lisa</p>',
    receivedAt: '2026-01-28T09:30:00Z',
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-5', filename: 'Signed_LOA_Lisa_Brown.pdf', mimeType: 'application/pdf', size: 89000 }
    ]
  },
  // DSAR Requests Inbox emails
  {
    id: 'email-8',
    accountId: 'acc-3',
    folderId: 'inbox-acc-3',
    from: { email: 'dsar.response@aqua.co.uk', name: 'Aqua DSAR Team' },
    to: [{ email: 'DSAR@fastactionclaims.co.uk', name: 'DSAR Requests' }],
    subject: 'DSAR Response - Reference: AQ-DSAR-2026-1234 - Client: Robert Green',
    bodyText: 'Dear Fast Action Claims,\n\nPlease find attached the DSAR response for your client Robert Green.\n\nThe attached documents include:\n- Account statements (2018-2025)\n- Credit agreement\n- Payment history\n- Communication records\n\nRegards,\nAqua DSAR Team',
    bodyHtml: '<p>Dear Fast Action Claims,</p><p>Please find attached the DSAR response for your client Robert Green.</p><p>The attached documents include:</p><ul><li>Account statements (2018-2025)</li><li>Credit agreement</li><li>Payment history</li><li>Communication records</li></ul><p>Regards,<br/>Aqua DSAR Team</p>',
    receivedAt: '2026-01-28T10:45:00Z',
    isRead: false,
    isStarred: true,
    isDraft: false,
    hasAttachments: true,
    attachments: [
      { id: 'att-6', filename: 'DSAR_Response_Robert_Green.zip', mimeType: 'application/zip', size: 4500000 }
    ]
  },
  {
    id: 'email-9',
    accountId: 'acc-3',
    folderId: 'inbox-acc-3',
    from: { email: 'data.protection@mbna.co.uk', name: 'MBNA Data Protection' },
    to: [{ email: 'DSAR@fastactionclaims.co.uk', name: 'DSAR Requests' }],
    subject: 'DSAR Acknowledgement - Ref: MBNA-DSAR-2026-5678',
    bodyText: 'Dear Sir/Madam,\n\nThis email confirms receipt of your DSAR request dated 15th January 2026.\n\nWe will respond within 30 calendar days.\n\nMBNA Data Protection Team',
    bodyHtml: '<p>Dear Sir/Madam,</p><p>This email confirms receipt of your DSAR request dated 15th January 2026.</p><p>We will respond within 30 calendar days.</p><p>MBNA Data Protection Team</p>',
    receivedAt: '2026-01-27T15:00:00Z',
    isRead: true,
    isStarred: false,
    isDraft: false,
    hasAttachments: false
  },
  {
    id: 'email-10',
    accountId: 'acc-3',
    folderId: 'inbox-acc-3',
    from: { email: 'complaints@moneyboat.co.uk', name: 'Money Boat Complaints' },
    to: [{ email: 'DSAR@fastactionclaims.co.uk', name: 'DSAR Requests' }],
    subject: 'DSAR Extension Request - Client: Amy Williams',
    bodyText: 'Dear Fast Action Claims,\n\nDue to the volume of data requested, we require an extension of 30 days to complete the DSAR for your client Amy Williams.\n\nThis is permitted under GDPR Article 12(3).\n\nWe will provide the complete response by 28th February 2026.\n\nRegards,\nMoney Boat Complaints Team',
    bodyHtml: '<p>Dear Fast Action Claims,</p><p>Due to the volume of data requested, we require an extension of 30 days to complete the DSAR for your client Amy Williams.</p><p>This is permitted under GDPR Article 12(3).</p><p>We will provide the complete response by 28th February 2026.</p><p>Regards,<br/>Money Boat Complaints Team</p>',
    receivedAt: '2026-01-27T11:30:00Z',
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false
  }
];

