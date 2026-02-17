
export enum ClaimStatus {
  // Category 1: Lead Generation & SALES
  NEW_LEAD = "New Lead",
  CONTACT_ATTEMPTED = "Contact Attempted",
  NOT_QUALIFIED = "Not Qualified",
  SALE = "SALE",
  LOA_SENT = "LOA Sent",

  // Category 2: Client Onboarding
  LOA_UPLOADED = "LOA Uploaded",
  LOA_SIGNED = "LOA Signed",
  ID_REQUEST_SENT = "ID Request Sent",
  ID_VERIFICATION_PENDING = "ID Verification Pending",
  POA_REQUIRED = "POA Required",
  EXTRA_LENDER_FORM_SENT = "Extra Lender Selection Form Sent",
  EXTRA_LENDER_FORM_COMPLETED = "Extra Lender Selection Form Completed",
  QUESTIONNAIRE_SENT = "Questionnaire Sent",
  QUESTIONNAIRE_COMPLETED = "Questionnaire Completed",
  BANK_STATEMENTS_REQUESTED = "Bank Statements Requested",
  BANK_STATEMENTS_RECEIVED = "Bank Statements Received",
  ONBOARDING_COMPLETE = "Onboarding Complete",

  // Category 3: DSAR Process
  DSAR_PREPARED = "DSAR Prepared",
  DSAR_PREPARED_AWAITING_ID = "DSAR Prepared Awaiting I.D",
  DSAR_SENT = "DSAR Sent to Lender",
  UNABLE_TO_LOCATE = "Unable to Locate",
  UNABLE_TO_LOCATE_ACCOUNT_NUMBER = "Unable to Locate Account Number",
  DSAR_OVERDUE = "DSAR Overdue",
  DSAR_RESPONSE_RECEIVED = "DSAR Response Received",
  DSAR_ESCALATED = "DSAR Escalated (ICO)",
  DSAR_REVIEW_COMPLETED = "Dsar Review Completed",
  WEAK_CASE_CANNOT_CONTINUE = "Weak Case Cannot Continue",
  MISSING_DATA_FROM_DSAR = "Missing Data From Dsar",

  // Category 4: Complaint Submission & Processing
  COMPLAINT_DRAFTED = "Complaint Drafted",
  COMPLAINT_DRAFTED_AWAITING_QUESTIONNAIRE = "Complaint Drafted Awaiting Questionnaire",
  COMPLAINT_SUBMITTED = "Complaint Submitted",
  COMPLAINT_OVERDUE = "Complaint Overdue",
  UPHELD = "Upheld",
  PARTIAL_UPHELD = "Partial Upheld",
  NOT_UPHELD = "Not upheld",
  COUNTER_TEAM = "Counter team",
  COUNTER_RESPONSE_SENT = "Counter Response sent",

  // Category 5: FOS Escalation
  FOS_REFERRAL_PREPARED = "FOS Referral Prepared",
  FOS_SUBMITTED = "FOS Submitted",
  FOS_CASE_NUMBER_RECEIVED = "FOS Case Number Received",
  FOS_INVESTIGATION = "FOS Investigation",
  FOS_PROVISIONAL_DECISION = "FOS Provisional Decision",
  FOS_FINAL_DECISION = "FOS Final Decision",
  FOS_APPEAL = "FOS Appeal",

  // Category 6: Payments
  OFFER_RECEIVED = "Offer Received",
  OFFER_UNDER_NEGOTIATION = "Offer Under Negotiation",
  OFFER_ACCEPTED = "Offer Accepted",
  AWAITING_PAYMENT = "Awaiting Payment",
  PAYMENT_RECEIVED = "Payment Received",
  FEE_DEDUCTED = "Fee Deducted",
  CLIENT_PAID = "Client Paid",
  CLAIM_SUCCESSFUL = "Claim Successful",
  CLAIM_UNSUCCESSFUL = "Claim Unsuccessful",
  CLAIM_WITHDRAWN = "Claim Withdrawn",

  // Category 7: Debt Recovery
  DEBT_RECOVERY_INITIATED = "Debt Recovery Initiated",
  PAYMENT_PLAN_AGREED = "Payment Plan Agreed",
  DEBT_COLLECTION_STARTED = "Debt Collection Started",
  PARTIAL_PAYMENT_RECEIVED = "Partial Payment Received",
  DEBT_SETTLED = "Debt Settled",
  DEBT_WRITTEN_OFF = "Debt Written Off"
}

export type PipelineCategory = "Lead Generation" | "Onboarding" | "DSAR Process" | "Complaint" | "FOS Escalation" | "Payments" | "Debt Recovery";

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

export interface PreviousAddressEntry {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  county?: string;
  postalCode: string;
  movedInDate?: string;
  movedOutDate?: string;
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
  previousAddresses?: PreviousAddressEntry[]; // Multiple previous addresses
  livedLessThan3Years?: boolean;

  // Bank Details (Rowan Rose Specification)
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    sortCode?: string;  // XX-XX-XX format
    accountNumber?: string;  // 8 digits
  };

  // Document Checklist Flags
  documentChecklist?: {
    identification?: boolean;
    extraLender?: boolean;
    questionnaire?: boolean;
    poa?: boolean;
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

  // Extra Lenders (free text)
  extraLenders?: string;
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
  lender_type?: string;
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
  CALENDAR = 'CALENDAR',
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
  CLIENT_INTAKE = 'CLIENT_INTAKE',
  MATTERMOST = 'MATTERMOST'
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

export interface CustomVariable {
  id: string;
  name: string;        // Display name, e.g. "Policy Number"
  key: string;         // Template key, e.g. "{{custom_policyNumber}}"
  defaultValue?: string;
  description?: string;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string; // The text with {{variables}}
  lastModified: string;
  customVariables?: CustomVariable[];
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
  accountNumber?: string;
  valueOfLoan?: string;
  startDate?: string;
  endDate?: string;
  apr?: string;
  billedInterestCharges?: string;
  latePaymentCharges?: string;
  overlimitCharges?: string;
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
  monthlyPaymentAgreed?: string;
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
  totalAmountOfDebt?: string;
  claimValue?: string;
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

// ============================================
// Email Module Types (Outlook-style interface)
// ============================================

export interface EmailAccount {
  id: string;
  email: string;
  displayName: string;
  provider: 'office365' | 'gmail' | 'imap';
  isConnected: boolean;
  lastSyncAt?: string;
  unreadCount: number;
  color?: string;
}

export interface EmailFolder {
  id: string;
  accountId: string;
  name: string; // Graph folder ID or legacy folder name
  displayName: string;
  unreadCount: number;
  totalCount: number;
  hasChildren?: boolean;
  parentId?: string | null;
  parentDisplayName?: string;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  isInline?: boolean;
  contentId?: string | null;
}

export interface Email {
  id: string;
  uid?: number;
  accountId: string;
  folderId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  sentAt?: string;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  attachments?: EmailAttachmentItem[];
  threadId?: string;
  replyTo?: string;
  inReplyTo?: string;
  contactId?: string;
}

// ============================================
// TASKS, REMINDERS & NOTIFICATIONS
// ============================================

export type TaskType = 'appointment' | 'call' | 'meeting' | 'deadline' | 'reminder' | 'follow_up';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';

export interface TaskReminder {
  id: string;
  taskId: string;
  reminderTime: string;
  reminderType: 'in_app';
  isSent: boolean;
  sentAt?: string;
}

export interface LinkedContact {
  id: string;
  name: string;
}

export interface LinkedClaim {
  id: string;
  lender: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;

  // Scheduling
  date: string;
  startTime?: string;
  endTime?: string;

  // Assignment
  assignedTo?: string;
  assignedToName?: string;
  assignedBy?: string;
  assignedByName?: string;
  assignedAt?: string;

  // Recurrence
  isRecurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  recurrenceEndDate?: string;
  parentTaskId?: string;

  // Entity Linking
  contactIds: string[];
  linkedContacts?: LinkedContact[];
  claimIds?: string[];
  linkedClaims?: LinkedClaim[];

  // Reminders
  reminders: TaskReminder[];

  // Audit
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  completedBy?: string;
}

export type NotificationType = 'task_assigned' | 'meeting_scheduled' | 'follow_up_due' | 'task_completed' | 'ticket_raised' | 'ticket_resolved';

export type TicketStatus = 'open' | 'resolved';

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description: string;
  screenshotUrl?: string;
  screenshotKey?: string;
  status: TicketStatus;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface PersistentNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  relatedTaskId?: string;
  taskTitle?: string;
  taskDate?: string;
  isRead: boolean;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  type: string;
  itemType: 'task' | 'action' | 'communication';
  timestamp: string;
  status?: TaskStatus;
  direction?: 'inbound' | 'outbound';
  actionCategory?: string;
}
