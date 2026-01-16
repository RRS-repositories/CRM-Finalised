
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
  previousAddress?: string;
  livedLessThan3Years?: boolean;

  status: ClaimStatus;
  lender?: string;
  claimValue?: number;
  lastActivity: string;
  daysInStage?: number;

  avatar?: string;
  source?: 'Client Filled' | 'Manual Input' | 'Website' | 'Referral' | 'AI Import' | 'Bulk Import';
  customFields?: Record<string, string>; // Flexible field mapping
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
