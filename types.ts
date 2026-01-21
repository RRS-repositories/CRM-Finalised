
export enum ClaimStatus {
  // Category 1: Lead Generation & Initial Contact
  NEW_LEAD = "New Lead",
  CONTACT_ATTEMPTED = "Contact Attempted",
  IN_CONVERSATION = "In Conversation",
  QUALIFICATION_CALL = "Qualification Call",
  QUALIFIED_LEAD = "Qualified Lead",
  NOT_QUALIFIED = "Not Qualified",

  // Category 2: Client Onboarding
  ONBOARDING_STARTED = "Onboarding Started",
  ID_VERIFICATION_PENDING = "ID Verification Pending",
  ID_VERIFIED = "ID Verification Complete",
  QUESTIONNAIRE_SENT = "Questionnaire Sent",
  QUESTIONNAIRE_COMPLETE = "Questionnaire Complete",
  LOA_SENT = "LOA Sent",
  LOA_SIGNED = "LOA Signed",
  BANK_STATEMENTS_REQUESTED = "Bank Statements Requested",
  BANK_STATEMENTS_RECEIVED = "Bank Statements Received",
  ONBOARDING_COMPLETE = "Onboarding Complete",

  // Category 3: DSAR Process
  DSAR_PREPARED = "DSAR Prepared",
  DSAR_SENT = "DSAR Sent to Lender",
  DSAR_ACKNOWLEDGED = "DSAR Acknowledged",
  DSAR_FOLLOW_UP = "DSAR Follow-up Sent",
  DSAR_RECEIVED = "DSAR Response Received",
  DSAR_ESCALATED = "DSAR Escalated (ICO)",
  DATA_ANALYSIS = "Data Analysis",

  // Category 4: Complaint Submission & Processing
  COMPLAINT_DRAFTED = "Complaint Drafted",
  CLIENT_REVIEW = "Client Review",
  COMPLAINT_APPROVED = "Complaint Approved",
  COMPLAINT_SUBMITTED = "Complaint Submitted",
  COMPLAINT_ACKNOWLEDGED = "Complaint Acknowledged",
  AWAITING_RESPONSE = "Awaiting Response",
  RESPONSE_RECEIVED = "Response Received",
  RESPONSE_UNDER_REVIEW = "Response Under Review",

  // Category 5: FOS Escalation
  FOS_REFERRAL_PREPARED = "FOS Referral Prepared",
  FOS_SUBMITTED = "FOS Submitted",
  FOS_CASE_NUMBER = "FOS Case Number Received",
  FOS_INVESTIGATION = "FOS Investigation",
  FOS_PROVISIONAL_DECISION = "FOS Provisional Decision",
  FOS_FINAL_DECISION = "FOS Final Decision",
  FOS_APPEAL = "FOS Appeal",

  // Category 6: Resolution & Payment
  OFFER_RECEIVED = "Offer Received",
  OFFER_NEGOTIATION = "Offer Under Negotiation",
  OFFER_ACCEPTED = "Offer Accepted",
  AWAITING_PAYMENT = "Awaiting Payment",
  PAYMENT_RECEIVED = "Payment Received",
  FEE_DEDUCTED = "Fee Deducted",
  CLIENT_PAID = "Client Paid",
  CLAIM_SUCCESSFUL = "Claim Successful",
  CLAIM_UNSUCCESSFUL = "Claim Unsuccessful",
  CLAIM_WITHDRAWN = "Claim Withdrawn"
}

export type PipelineCategory = "Lead Generation" | "Onboarding" | "DSAR Process" | "Complaint" | "FOS Escalation" | "Resolution";

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state_county?: string;
  postalCode: string;
}

export interface Claim {
  id: string;
  contactId: string;
  lender: string;
  status: ClaimStatus;
  claimValue: number;
  productType?: string;
  accountNumber?: string;
  startDate?: string;
  daysInStage?: number;
}

export interface Contact {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  address?: Address;
  previousAddress?: string | Address; // Can be string (legacy) or full Address object
  previousAddressObj?: Address; // Explicit Address object for previous address
  livedLessThan3Years?: boolean;

  // Bank Details (Rowan Rose Specification)
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    sortCode?: string;  // XX-XX-XX format
    accountNumber?: string;  // 8 digits
  };

  status: ClaimStatus;
  lender?: string;
  claimValue?: number;
  lastActivity: string;
  daysInStage?: number;

  avatar?: string;
  source?: 'Client Filled' | 'Manual Input' | 'Website' | 'Referral' | 'AI Import' | 'Bulk Import';
  customFields?: Record<string, string>; // Flexible field mapping

  // Client ID format: RR-YYMMDD-XXXX
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  street_address?: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_county: string;
  postal_code: string;
  signature_data: string;
}

export interface Page1Response {
  success: boolean;
  message: string;
  contact_id: string;
  folder_path: string;
}

export interface Page2Response {
  success: boolean;
  url: string;
}

export interface KPI {
  label: string;
  value: string | number;
  change: number; // percentage
  trend: 'up' | 'down' | 'neutral';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isThinking?: boolean;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  CONTACTS = 'CONTACTS',
  PIPELINE = 'PIPELINE',
  // Conversation Sub-modules
  CONVERSATIONS_ALL = 'CONVERSATIONS_ALL',
  CONVERSATIONS_FACEBOOK = 'CONVERSATIONS_FACEBOOK',
  CONVERSATIONS_WHATSAPP = 'CONVERSATIONS_WHATSAPP',
  CONVERSATIONS_SMS = 'CONVERSATIONS_SMS',
  CONVERSATIONS_EMAIL = 'CONVERSATIONS_EMAIL',
  CONVERSATIONS = 'CONVERSATIONS', // Kept for legacy compatibility if needed

  MARKETING = 'MARKETING',
  LENDERS = 'LENDERS',
  DOCUMENTS = 'DOCUMENTS',
  FORMS = 'FORMS',
  WORKFLOW = 'WORKFLOW',
  SETTINGS = 'SETTINGS',
  MANAGEMENT = 'MANAGEMENT',
  CLIENT_INTAKE = 'CLIENT_INTAKE'
}

// Auth Types
// Priority: Management (1) > IT (2) > Payments (3) > Admin (4) > Sales (5)
export type Role = 'Management' | 'IT' | 'Payments' | 'Admin' | 'Sales';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  lastLogin?: Date;
  password?: string; // Stored for mock auth purposes only
  isApproved: boolean; // Replaces isDeactivated. If false, user cannot login.
}

// Conversations Module Types
export type Platform = 'whatsapp' | 'email' | 'sms' | 'facebook';

export interface MessageAttachment {
  type: 'image' | 'doc' | 'audio' | 'video';
  url: string;
  name: string;
  size?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  platform: Platform;
  attachments?: MessageAttachment[];
  status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  avatar?: string;
  platform: Platform;
  unreadCount: number;
  lastMessage: Message;
  messages: Message[];
  mediaGallery: {
    images: MessageAttachment[];
    documents: MessageAttachment[];
    audio: MessageAttachment[];
    video: MessageAttachment[];
  };
}

// Documents & Templates Types
export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'image' | 'spreadsheet' | 'txt' | 'html';
  category: 'Client' | 'Correspondence' | 'Legal' | 'Other' | 'Templates';
  dateModified: string;
  size: string;
  tags: string[];
  associatedContactId?: string;
  version: number;
  content?: string; // HTML content for generated docs
  url?: string; // Base64 Data URL or blob URL for uploaded files
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string; // The text with {{variables}}
  lastModified: string;
}

export interface TemplateFolder {
  id: string;
  name: string;
  count: number;
}

// Forms Module Types
export type FormElementType = 'text' | 'textarea' | 'number' | 'email' | 'date' | 'select' | 'radio' | 'checkbox' | 'signature' | 'file' | 'terms';

export interface FormElement {
  id: string;
  type: FormElementType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select, radio, checkbox
  mappingKey?: string; // e.g., 'fullName', 'email', 'custom_field'
}

export interface Form {
  id: string;
  name: string;
  description: string;
  elements: FormElement[];
  createdAt: string;
  responseCount: number;
  status: 'Draft' | 'Published' | 'Archived';
}

// Activity Log for Timeline
export interface ActivityLog {
  id: string;
  contactId: string;
  claimId?: string;
  title: string;
  description: string;
  date: string; // ISO String
  type: 'status_change' | 'creation' | 'communication' | 'note' | 'claim_update' | 'system';
}

// Global Notification System
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  isExiting?: boolean;
}

// ============================================
// Rowan Rose Solicitors CRM Specification Types
// ============================================

// Bank Details for Client
export interface BankDetails {
  bankName: string;
  accountName: string;
  sortCode: string;  // XX-XX-XX format
  accountNumber: string;  // 8 digits
}

// Communication Record (SMS, Email, WhatsApp, Call)
export interface CRMCommunication {
  id: string;
  clientId: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'call';
  direction: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  callDurationSeconds?: number;
  callNotes?: string;
  agentId: string;
  agentName?: string;
  timestamp: string;
  read: boolean;
  attachments?: MessageAttachment[];
}

// Workflow Trigger for Chase Sequences
export interface WorkflowTrigger {
  id: string;
  clientId: string;
  workflowType: string;
  workflowName?: string;
  triggeredBy: string;
  triggeredAt: string;
  status: 'active' | 'completed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  nextActionAt?: string;
  nextActionDescription?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

// Enhanced Note with pinning and audit
export interface CRMNote {
  id: string;
  clientId: string;
  content: string;
  pinned: boolean;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

// Specification's 13 Claim Statuses (for claim-level display)
export enum ClaimStatusSpec {
  NEW_CLAIM = 'New Claim',
  LOA_SENT = 'LOA Sent',
  AWAITING_DSAR = 'Awaiting DSAR',
  DSAR_RECEIVED = 'DSAR Received',
  COMPLAINT_SUBMITTED = 'Complaint Submitted',
  FRL_RECEIVED = 'FRL Received',
  COUNTER_SUBMITTED = 'Counter Submitted',
  FOS_REFERRED = 'FOS Referred',
  OFFER_MADE = 'Offer Made',
  ACCEPTED = 'Accepted',
  PAYMENT_RECEIVED = 'Payment Received',
  CLOSED_WON = 'Closed - Won',
  CLOSED_LOST = 'Closed - Lost'
}

// Loan Details for dynamic EF fields (per loan)
export interface LoanDetails {
  loanNumber: number;
  valueOfLoan?: string;
  startDate?: string;
  endDate?: string;
  apr?: string;
}

// Finance Type Entry for multi-select with account number
export interface FinanceTypeEntry {
  financeType: string;
  accountNumber?: string;
}

// Payment Plan details
export interface PaymentPlan {
  clientOutstandingFees?: string;
  planStatus?: 'Plan Set Up' | 'Missed Payment' | 'Not Set Up' | 'Settled' | '';
  planDate?: string;
  termOfPlan?: string;
  startDate?: string;
  remainingBalance?: string;
}

// Extended Claim fields from specification (updated per crm-claim-spec.md)
export interface ClaimExtended extends Claim {
  lenderOther?: string;
  // Multi-select finance types with account numbers (EF fields)
  financeTypes?: FinanceTypeEntry[];
  financeType?: string; // Legacy single select - kept for backwards compatibility
  financeTypeOther?: string;
  // Number of loans (1-50) - triggers EF duplication
  numberOfLoans?: number;
  // Dynamic loan details array (EF fields)
  loanDetails?: LoanDetails[];
  lenderReference?: string;
  datesTimeline?: string;
  apr?: number;
  outstandingBalance?: number;
  // Section 1 additional fields
  billedInterestCharges?: string;
  latePaymentCharges?: number;
  overlimitCharges?: string;
  creditLimitIncreases?: string;
  dsarReview?: string;
  complaintParagraph?: string;
  // Section 2: Payment Section
  offerMade?: number;
  totalRefund?: number;
  totalDebt?: number;
  balanceDueToClient?: string;
  ourFeesPlusVat?: string;
  ourFeesMinusVat?: string;
  vatAmount?: string;
  totalFee?: string;
  outstandingDebt?: string;
  billedFinanceCharges?: number;
  // Legacy fee fields (kept for backwards compatibility)
  clientFee?: number;
  ourTotalFee?: number;
  feeWithoutVat?: number;
  vat?: number;
  ourFeeNet?: number;
  // Section 3: Payment Plan
  paymentPlan?: PaymentPlan;
  specStatus?: ClaimStatusSpec;
  documents?: Document[];
}

// Action Log Entry for Timeline
export interface ActionLogEntry {
  id: string;
  clientId: string;
  claimId?: string;
  actorType: 'agent' | 'client' | 'system';
  actorId: string;
  actorName?: string;
  actionType: string;
  actionCategory: 'account' | 'claims' | 'communication' | 'documents' | 'notes' | 'workflows' | 'system';
  description: string;
  metadata?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

// Lender Selection Form Types
export interface LenderFormSubmission {
  uniqueId: string;
  selectedLenders: string[];
  signature2Data: string;
  hadCCJ: boolean;
  victimOfScam: boolean;
  problematicGambling: boolean;
}

export interface ActionTimelineEntry {
  id: string;
  timestamp: string;
  actorType: 'system' | 'user' | 'client';
  actorName: string;
  actionType: string;
  description: string;
  metadata?: Record<string, any>;
}
