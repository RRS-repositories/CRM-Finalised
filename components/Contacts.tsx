
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
   Search, Filter, Upload, Download, MoreHorizontal,
   Trash2, X, UserPlus, ArrowLeft, Clock as ClockIcon,
   FileText as FileIcon, Paperclip, StickyNote,
   ChevronDown, ChevronUp, Plus, Check, Mail as MailIcon,
   Phone as PhoneIcon, Calendar as CalendarIcon,
   MapPin, CreditCard, Sparkles, MessageSquare as MessageIcon,
   Eye, File as GenericFileIcon, AlertTriangle, Edit, FileUp,
   User, Briefcase, Workflow, History, Send, XCircle,
   Pin, Building2, Hash, DollarSign, FileCheck, AlertCircle, RotateCcw,
   Loader2, Lock
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Contact, ClaimStatus, Claim, Document, CRMCommunication, WorkflowTrigger, CRMNote, ActionLogEntry, ClaimStatusSpec, BankDetails, LoanDetails, FinanceTypeEntry, PaymentPlan, PreviousAddressEntry } from '../types';
import { SPEC_LENDERS, FINANCE_TYPES, WORKFLOW_TYPES, SPEC_STATUS_COLORS, DOCUMENT_CATEGORIES, getSpecStatusColor, SMS_TEMPLATES, EMAIL_TEMPLATES, WHATSAPP_TEMPLATES, CALL_OUTCOMES, PIPELINE_CATEGORIES } from '../constants';
import { API_BASE_URL } from '../src/config';
import BulkImport from './BulkImport';

// Tab definitions for the 7-tab structure
type ContactTab = 'personal' | 'claims' | 'communication' | 'subworkflow' | 'notes' | 'documents' | 'timeline';

const CONTACT_TABS: { id: ContactTab; label: string; icon: React.ElementType }[] = [
   { id: 'personal', label: 'Personal Details', icon: User },
   { id: 'claims', label: 'Claims', icon: Briefcase },
   { id: 'communication', label: 'Communication', icon: MessageIcon },
   { id: 'subworkflow', label: 'Sub Workflow', icon: Workflow },
   { id: 'notes', label: 'Notes', icon: StickyNote },
   { id: 'documents', label: 'Documents', icon: FileIcon },
   { id: 'timeline', label: 'Action Timeline', icon: History }
];

// Helper function to format date of birth for display
const formatDateOfBirth = (dob: string | undefined): string => {
   if (!dob) return 'DOB Not Set';

   try {
      // Handle ISO date strings (e.g., "1978-02-04T18:30:00.000Z")
      const date = new Date(dob);
      if (isNaN(date.getTime())) return dob; // Return as-is if invalid

      // Format as DD/MM/YYYY (UK format)
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();

      return `${day}/${month}/${year}`;
   } catch {
      return dob; // Return original if parsing fails
   }
};

// Use SPEC_LENDERS from constants for the full lenders list
const COMMON_LENDERS = SPEC_LENDERS;

interface FormData {
   firstName: string;
   lastName: string;
   email: string;
   phone: string;
   dob: string;
   addressLine1: string;
   addressLine2: string;
   city: string;
   postalCode: string;
   livedLessThan3Years: boolean;
   previousAddress: string;
   claimValue: string;
   status: ClaimStatus;
}

const INITIAL_FORM_STATE: FormData = {
   firstName: '',
   lastName: '',
   email: '',
   phone: '',
   dob: '',
   addressLine1: '',
   addressLine2: '',
   city: '',
   postalCode: '',
   livedLessThan3Years: false,
   previousAddress: '',
   claimValue: '',
   status: ClaimStatus.NEW_LEAD
};

// --- Helper for Status Colors (matches pipeline stage colors) ---
const getStatusColor = (status: string) => {
   // Category 1: Lead Generation - Pink/Magenta (matches pipeline header)
   if (status === 'New Lead' || status === 'Contact Attempted' || status === 'In Conversation' ||
      status === 'Qualification Call' || status === 'Qualified Lead') {
      return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800';
   }
   if (status === 'Not Qualified') {
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600';
   }

   // Category 2: Onboarding - Purple
   if (status.includes('Onboarding') || status.includes('ID Verification') || status.includes('Questionnaire') ||
      status === 'LOA Sent' || status === 'LOA Uploaded' || status === 'LOA Signed' || status.includes('Bank Statements')) {
      return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
   }

   // Category 3: DSAR Process - Orange
   if (status.includes('DSAR') || status === 'Data Analysis') {
      return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
   }

   // Category 4: Complaint - Pink/Coral
   if (status.includes('Complaint') || status === 'Client Review' || status.includes('Response') || status === 'Awaiting Response') {
      return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 dark:border-fuchsia-800';
   }

   // Category 5: FOS Escalation - Red
   if (status.includes('FOS')) {
      return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
   }

   // Category 6: Payments - Green (Offers, Payments, Success)
   if (status.includes('Offer') || status.includes('Payment') || status === 'Fee Deducted' ||
      status === 'Client Paid' || status === 'Claim Successful' || status === 'Awaiting Payment') {
      return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
   }

   // Unsuccessful/Withdrawn - Dark red
   if (status === 'Claim Unsuccessful' || status === 'Claim Withdrawn') {
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700';
   }

   // Default fallback - Pink for Lead Generation
   return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800';
};

// Simple date formatter for timeline
const formatTimeAgo = (dateString: string | undefined | null) => {
   if (!dateString) return 'Unknown';

   try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';

      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString();
   } catch {
      return 'Unknown';
   }
};

// Format date for Action Timeline (e.g., "Yesterday 15:06" or "21st Jan 2026 13:46")
const formatActionDate = (dateString: string | undefined | null): string => {
   if (!dateString) return 'Unknown';

   try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      if (dateOnly.getTime() === today.getTime()) {
         return `Today ${timeStr}`;
      }
      if (dateOnly.getTime() === yesterday.getTime()) {
         return `Yesterday ${timeStr}`;
      }

      // Format as "21st Jan 2026 13:46"
      const day = date.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' :
         day === 2 || day === 22 ? 'nd' :
            day === 3 || day === 23 ? 'rd' : 'th';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();

      return `${day}${suffix} ${month} ${year} ${timeStr}`;
   } catch {
      return 'Unknown';
   }
};

// Consistent lender color mapping - same lender always gets same color
const LENDER_COLORS = [
   { bg: 'bg-purple-200', text: 'text-purple-900', dark: 'dark:bg-purple-800 dark:text-purple-100', rowBg: 'bg-purple-50 dark:bg-purple-900/20' },
   { bg: 'bg-cyan-200', text: 'text-cyan-900', dark: 'dark:bg-cyan-800 dark:text-cyan-100', rowBg: 'bg-cyan-50 dark:bg-cyan-900/20' },
   { bg: 'bg-blue-200', text: 'text-blue-900', dark: 'dark:bg-blue-800 dark:text-blue-100', rowBg: 'bg-blue-50 dark:bg-blue-900/20' },
   { bg: 'bg-green-200', text: 'text-green-900', dark: 'dark:bg-green-800 dark:text-green-100', rowBg: 'bg-green-50 dark:bg-green-900/20' },
   { bg: 'bg-yellow-200', text: 'text-yellow-900', dark: 'dark:bg-yellow-800 dark:text-yellow-100', rowBg: 'bg-yellow-50 dark:bg-yellow-900/20' },
   { bg: 'bg-pink-200', text: 'text-pink-900', dark: 'dark:bg-pink-800 dark:text-pink-100', rowBg: 'bg-pink-50 dark:bg-pink-900/20' },
   { bg: 'bg-orange-200', text: 'text-orange-900', dark: 'dark:bg-orange-800 dark:text-orange-100', rowBg: 'bg-orange-50 dark:bg-orange-900/20' },
   { bg: 'bg-teal-200', text: 'text-teal-900', dark: 'dark:bg-teal-800 dark:text-teal-100', rowBg: 'bg-teal-50 dark:bg-teal-900/20' },
   { bg: 'bg-indigo-200', text: 'text-indigo-900', dark: 'dark:bg-indigo-800 dark:text-indigo-100', rowBg: 'bg-indigo-50 dark:bg-indigo-900/20' },
   { bg: 'bg-rose-200', text: 'text-rose-900', dark: 'dark:bg-rose-800 dark:text-rose-100', rowBg: 'bg-rose-50 dark:bg-rose-900/20' },
   { bg: 'bg-lime-200', text: 'text-lime-900', dark: 'dark:bg-lime-800 dark:text-lime-100', rowBg: 'bg-lime-50 dark:bg-lime-900/20' },
   { bg: 'bg-amber-200', text: 'text-amber-900', dark: 'dark:bg-amber-800 dark:text-amber-100', rowBg: 'bg-amber-50 dark:bg-amber-900/20' },
   { bg: 'bg-violet-200', text: 'text-violet-900', dark: 'dark:bg-violet-800 dark:text-violet-100', rowBg: 'bg-violet-50 dark:bg-violet-900/20' },
   { bg: 'bg-fuchsia-200', text: 'text-fuchsia-900', dark: 'dark:bg-fuchsia-800 dark:text-fuchsia-100', rowBg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20' },
   { bg: 'bg-emerald-200', text: 'text-emerald-900', dark: 'dark:bg-emerald-800 dark:text-emerald-100', rowBg: 'bg-emerald-50 dark:bg-emerald-900/20' },
   { bg: 'bg-sky-200', text: 'text-sky-900', dark: 'dark:bg-sky-800 dark:text-sky-100', rowBg: 'bg-sky-50 dark:bg-sky-900/20' },
];

const getLenderColorIndex = (lender: string): number => {
   let hash = 0;
   for (let i = 0; i < lender.length; i++) {
      hash = lender.charCodeAt(i) + ((hash << 5) - hash);
   }
   return Math.abs(hash) % LENDER_COLORS.length;
};

const getLenderColor = (lender: string) => LENDER_COLORS[getLenderColorIndex(lender)];

// Parse lender from note content (format: {{lender:NAME}} at start)
const parseLenderFromNote = (content: string): { lender: string; noteContent: string } => {
   const match = content.match(/^\{\{lender:(.+?)\}\}/);
   if (match) {
      return { lender: match[1], noteContent: content.replace(/^\{\{lender:.+?\}\}/, '').trim() };
   }
   return { lender: '', noteContent: content };
};

// --- Sub-Component: Contact Detail View (7-Tab Structure) ---
const ContactDetailView = ({ contactId, onBack, initialTab = 'personal', initialClaimId, onBackToPipeline }: { contactId: string, onBack: () => void, initialTab?: ContactTab, initialClaimId?: string, onBackToPipeline?: () => void }) => {
   const {
      contacts, documents, claims, activityLogs: legacyActivityLogs, addClaim, updateClaim, deleteClaim, updateContact, setActiveContext, addNote, addDocument,
      // CRM Specification Methods
      communications, fetchCommunications, addCommunication,
      workflowTriggers, fetchWorkflows, triggerWorkflow, cancelWorkflow,
      crmNotes, notesLoading, fetchNotes, addCRMNote, updateCRMNote, deleteCRMNote,
      actionLogs, fetchActionLogs, fetchAllActionLogs,
      updateContactExtended, updateClaimExtended, fetchFullClaim, currentUser,
      refreshAllData, addNotification, fetchCasesForContact, updateClaimStatus
   } = useCRM();

   const inMemoryContact = contacts.find(c => c.id === contactId);

   // If contact not in memory (e.g. page refresh with paginated data), fetch from API
   const [fetchedContact, setFetchedContact] = useState<Contact | null>(null);
   const [isLoadingContact, setIsLoadingContact] = useState(false);

   useEffect(() => {
      if (!inMemoryContact && contactId && !fetchedContact && !isLoadingContact) {
         setIsLoadingContact(true);
         fetch(`${API_BASE_URL}/api/contacts/${contactId}/full`)
            .then(res => res.ok ? res.json() : Promise.reject('Not found'))
            .then((c: any) => {
               setFetchedContact({
                  id: c.id.toString(),
                  firstName: c.first_name,
                  lastName: c.last_name,
                  fullName: c.full_name,
                  email: c.email,
                  phone: c.phone,
                  status: ClaimStatus.NEW_LEAD,
                  lastActivity: 'Active',
                  source: c.source,
                  dateOfBirth: c.dob,
                  createdAt: c.created_at,
                  address: {
                     line1: c.address_line_1,
                     line2: c.address_line_2,
                     city: c.city,
                     state_county: c.state_county,
                     postalCode: c.postal_code
                  },
                  previousAddresses: (() => {
                     let prevAddrs = c.previous_addresses;
                     if (typeof prevAddrs === 'string') {
                        try { prevAddrs = JSON.parse(prevAddrs); } catch { prevAddrs = null; }
                     }
                     if (prevAddrs && Array.isArray(prevAddrs) && prevAddrs.length > 0) {
                        return prevAddrs.map((pa: any, idx: number) => ({
                           id: pa.id || `prev_addr_${idx}`,
                           line1: pa.line1 || pa.address_line_1 || '',
                           line2: pa.line2 || pa.address_line_2 || '',
                           city: pa.city || '',
                           county: pa.county || pa.state_county || '',
                           postalCode: pa.postalCode || pa.postal_code || ''
                        }));
                     }
                     return [];
                  })(),
                  documentChecklist: c.document_checklist ? (
                     typeof c.document_checklist === 'string'
                        ? JSON.parse(c.document_checklist)
                        : c.document_checklist
                  ) : { identification: false, extraLender: false, questionnaire: false, poa: false },
                  bankDetails: {
                     bankName: c.bank_name || '',
                     accountName: c.account_name || '',
                     sortCode: c.sort_code || '',
                     accountNumber: c.bank_account_number || ''
                  },
                  extraLenders: c.extra_lenders,
                  clientId: c.client_id
               });
            })
            .catch(() => setFetchedContact(null))
            .finally(() => setIsLoadingContact(false));
      }
   }, [inMemoryContact, contactId, fetchedContact, isLoadingContact]);

   const contact = inMemoryContact || fetchedContact;

   // When contact was fetched from API (not in memory), also load its cases
   useEffect(() => {
      if (fetchedContact && contactId) {
         fetchCasesForContact(contactId);
      }
   }, [fetchedContact, contactId, fetchCasesForContact]);

   const contactClaims = claims.filter(c => c.contactId === contactId);

   // Main 7-Tab Navigation
   const [activeTab, setActiveTab] = useState<ContactTab>(initialTab);
   const [expandedClaimId, setExpandedClaimId] = useState<string | null>(initialClaimId || contactClaims[0]?.id || null);

   // Modals & Forms
   const [showAddClaim, setShowAddClaim] = useState(false);
   const [showStatusUpdate, setShowStatusUpdate] = useState<string | null>(null);
   const [showUploadModal, setShowUploadModal] = useState(false);
   const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

   const [newClaimData, setNewClaimData] = useState<Partial<Claim>>({ claimValue: 0, status: ClaimStatus.NEW_LEAD });

   // Note State (Legacy)
   const [newNote, setNewNote] = useState('');

   // Upload State
   const [uploadFile, setUploadFile] = useState<File | null>(null);
   const [uploadCategory, setUploadCategory] = useState<string>('Other');
   const [isUploadingDocument, setIsUploadingDocument] = useState(false);
   const [docUploadProgress, setDocUploadProgress] = useState(0);

   // Multi-Lender Selection State for Add Claim
   const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
   const [isLenderDropdownOpen, setIsLenderDropdownOpen] = useState(false);
   const [isCreatingClaim, setIsCreatingClaim] = useState(false);
   const [claimProgress, setClaimProgress] = useState(0);
   const [claimProgressTotal, setClaimProgressTotal] = useState(0);
   const [isDeletingClaim, setIsDeletingClaim] = useState(false);
   const [deleteProgress, setDeleteProgress] = useState(0);
   const [lenderSearchQuery, setLenderSearchQuery] = useState('');
   const dropdownRef = useRef<HTMLDivElement>(null);
   const lenderSearchRef = useRef<HTMLInputElement>(null);
   const handleOpenClaimFileRef = useRef<((claimId: string) => void) | null>(null);

   // LOA Link Generation State
   const [loaLink, setLoaLink] = useState<string | null>(null);
   const [generatingLoaLink, setGeneratingLoaLink] = useState(false);
   const [showLoaLinkModal, setShowLoaLinkModal] = useState(false);

   // ============================================
   // CRM Specification State (Phase 4 & 5)
   // ============================================

   // Communication Modals
   const [showSMSModal, setShowSMSModal] = useState(false);
   const [showCallModal, setShowCallModal] = useState(false);
   const [showEmailModal, setShowEmailModal] = useState(false);
   const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
   const [communicationFilter, setCommunicationFilter] = useState<string>('all');

   // Communication Form Data
   const [smsContent, setSmsContent] = useState('');
   const [emailSubject, setEmailSubject] = useState('');
   const [emailContent, setEmailContent] = useState('');
   const [whatsappContent, setWhatsappContent] = useState('');
   const [callDuration, setCallDuration] = useState('');
   const [callOutcome, setCallOutcome] = useState('');
   const [callNotes, setCallNotes] = useState('');

   // Sub Workflow State
   const [selectedWorkflowType, setSelectedWorkflowType] = useState<string>('');

   // Notes (Enhanced CRM)
   const [showAddNoteModal, setShowAddNoteModal] = useState(false);
   const [newNoteContent, setNewNoteContent] = useState('');
   const [newNotePinned, setNewNotePinned] = useState(false);
   const [editingNote, setEditingNote] = useState<CRMNote | null>(null);
   const [showClaimNoteModal, setShowClaimNoteModal] = useState(false);
   const [claimNoteContent, setClaimNoteContent] = useState('');
   const [claimNoteLender, setClaimNoteLender] = useState('');
   const [previewNote, setPreviewNote] = useState<CRMNote | null>(null);
   const [noteFilter, setNoteFilter] = useState<string>('all');

   // Personal Details Extended (Bank Details & Previous Address)
   const [bankDetails, setBankDetails] = useState<BankDetails>({
      bankName: '',
      accountName: '',
      sortCode: '',
      accountNumber: ''
   });
   const [previousAddresses, setPreviousAddresses] = useState<PreviousAddressEntry[]>([]);

   // Document Checklist Flags
   const [documentChecklist, setDocumentChecklist] = useState({
      identification: false,
      extraLender: false,
      questionnaire: false,
      poa: false
   });

   // Previous address lookup state (per address ID)
   const [prevAddrSuggestions, setPrevAddrSuggestions] = useState<Record<string, any[]>>({});
   const [prevAddrQuery, setPrevAddrQuery] = useState<Record<string, string>>({});
   const [prevAddrLoading, setPrevAddrLoading] = useState<Record<string, boolean>>({});
   const [showPrevAddrSuggestions, setShowPrevAddrSuggestions] = useState<Record<string, boolean>>({});

   // Google Maps services refs
   const autocompleteServiceRef = useRef<any>(null);
   const placesServiceRef = useRef<any>(null);
   const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

   // Initialize Google Maps services
   useEffect(() => {
      const initGoogleMaps = () => {
         if (window.google && window.google.maps && window.google.maps.places) {
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
            // Create a dummy div for PlacesService
            const dummyDiv = document.createElement('div');
            placesServiceRef.current = new window.google.maps.places.PlacesService(dummyDiv);
         }
      };

      if (window.google) {
         initGoogleMaps();
      } else {
         // Wait for Google Maps to load
         const checkGoogle = setInterval(() => {
            if (window.google) {
               initGoogleMaps();
               clearInterval(checkGoogle);
            }
         }, 100);
         return () => clearInterval(checkGoogle);
      }
   }, []);

   // Edit modes for each section
   const [editingPersonalInfo, setEditingPersonalInfo] = useState(false);
   const [editingCurrentAddress, setEditingCurrentAddress] = useState(false);
   const [editingBankDetails, setEditingBankDetails] = useState(false);
   const [editingPreviousAddresses, setEditingPreviousAddresses] = useState(false);
   const [editingExtraLenders, setEditingExtraLenders] = useState(false);

   // Extra Lenders (free text)
   const [extraLenders, setExtraLenders] = useState('');

   // Personal info edit form
   const [personalInfoForm, setPersonalInfoForm] = useState({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phone: '',
      email: ''
   });

   // Current address edit form
   const [currentAddressForm, setCurrentAddressForm] = useState({
      line1: '',
      line2: '',
      city: '',
      state_county: '',
      postalCode: ''
   });

   // Timeline Filter
   const [timelineFilter, setTimelineFilter] = useState<string>('all');

   // Claims Pagination State
   const [claimsPerPage, setClaimsPerPage] = useState(20);
   const [currentClaimsPage, setCurrentClaimsPage] = useState(1);

   // Claim File View (detailed view for individual claim)
   const [viewingClaimId, setViewingClaimId] = useState<string | null>(null);
   const [claimFileData, setClaimFileData] = useState<any>(null);
   // Accordion state for claim sections (null = all collapsed, 'details' | 'payment' | 'paymentPlan')
   const [expandedClaimSection, setExpandedClaimSection] = useState<'details' | 'payment' | 'paymentPlan' | null>(null);
   const [claimFileForm, setClaimFileForm] = useState({
      // Section 1: Claim Details
      lender: '',
      lenderOther: '',
      financeTypes: [] as FinanceTypeEntry[], // Multi-select finance types with account numbers
      financeType: '', // Legacy single select
      financeTypeOther: '',
      numberOfLoans: '1',
      loanDetails: [{ loanNumber: 1, accountNumber: '', valueOfLoan: '', startDate: '', endDate: '', apr: '', billedInterestCharges: '', latePaymentCharges: '', overlimitCharges: '' }] as LoanDetails[],
      billedInterestCharges: '',
      latePaymentCharges: '',
      overlimitCharges: '',
      totalAmountOfDebt: '',
      claimValue: '',
      creditLimitIncreases: '',
      dsarReview: '',
      complaintParagraph: '',
      // Section 2: Payment Section
      offerMade: '',
      feePercent: '',
      totalRefund: '',
      totalDebt: '',
      balanceDueToClient: '',
      ourFeesPlusVat: '',
      ourFeesMinusVat: '',
      vatAmount: '',
      totalFee: '',
      outstandingDebt: '',
      // Section 3: Payment Plan
      paymentPlan: {
         clientOutstandingFees: '',
         planStatus: '' as PaymentPlan['planStatus'],
         planDate: '',
         termOfPlan: '',
         startDate: '',
         remainingBalance: '',
         monthlyPaymentAgreed: ''
      } as PaymentPlan,
      // Legacy fields (kept for backwards compatibility)
      accountNumber: '',
      lenderReference: '',
      datesTimeline: '',
      apr: '',
      outstandingBalance: '',
      billedFinanceCharges: '',
      clientFee: '',
      ourTotalFee: '',
      feeWithoutVat: '',
      vat: '',
      ourFeeNet: '',
      specStatus: 'New Claim'
   });
   const [claimFileSaving, setClaimFileSaving] = useState(false);
   const [claimAutoSaveStatus, setClaimAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
   const [showDeleteClaimConfirm, setShowDeleteClaimConfirm] = useState(false);
   const [showClaimDocUpload, setShowClaimDocUpload] = useState(false);
   const [claimDocFile, setClaimDocFile] = useState<File | null>(null);
   const [claimDocCategory, setClaimDocCategory] = useState('Other');
   const [isUploadingClaimDoc, setIsUploadingClaimDoc] = useState(false);
   const [claimDocUploadProgress, setClaimDocUploadProgress] = useState(0);

   // Document delete state
   const [showDeleteDocConfirm, setShowDeleteDocConfirm] = useState(false);
   const [docToDelete, setDocToDelete] = useState<{ id: string | number; name: string } | null>(null);
   const [isDeletingDoc, setIsDeletingDoc] = useState(false);
   const [deleteDocProgress, setDeleteDocProgress] = useState(0);
   const [deleteDocConfirmText, setDeleteDocConfirmText] = useState('');

   // Set Context for AI on Mount
   useEffect(() => {
      if (contact) {
         setActiveContext({ type: 'contact', id: contact.id, name: contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed', data: contact });
      }
      return () => setActiveContext(null);
   }, [contact]);

   // Lazy-load cases when contact detail view opens
   useEffect(() => {
      if (contactId) {
         fetchCasesForContact(contactId);
      }
   }, [contactId]);

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsLenderDropdownOpen(false);
            setLenderSearchQuery(''); // Clear search when closing
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, []);

   // Fetch data when switching to specific tabs
   useEffect(() => {
      if (!contact) return;

      if (activeTab === 'communication') {
         fetchCommunications(contact.id);
      } else if (activeTab === 'subworkflow') {
         fetchWorkflows(contact.id);
      } else if (activeTab === 'notes') {
         fetchNotes(contact.id);
      } else if (activeTab === 'timeline') {
         fetchActionLogs(contact.id);
      }
   }, [activeTab, contact?.id]);

   // Auto-open claim file when navigating from Pipeline with initialClaimId
   useEffect(() => {
      if (initialClaimId && activeTab === 'claims' && handleOpenClaimFileRef.current) {
         handleOpenClaimFileRef.current(initialClaimId);
      }
   }, [initialClaimId, activeTab]);

   // Autosave claim form to localStorage when changes are made
   useEffect(() => {
      if (!viewingClaimId) return;

      // Debounce the autosave to avoid too many writes
      const timeoutId = setTimeout(() => {
         const autosaveKey = `claim_autosave_${viewingClaimId}`;
         const dataToSave = {
            claimFileForm,
            timestamp: Date.now()
         };
         localStorage.setItem(autosaveKey, JSON.stringify(dataToSave));
         setClaimAutoSaveStatus('saving');
         // Show "saved" status briefly
         setTimeout(() => setClaimAutoSaveStatus('saved'), 300);
         // Reset to idle after showing saved
         setTimeout(() => setClaimAutoSaveStatus('idle'), 2000);
      }, 1000); // 1 second debounce

      return () => clearTimeout(timeoutId);
   }, [claimFileForm, viewingClaimId]);

   // Initialize bank details, addresses from contact
   useEffect(() => {
      if (contact) {
         // Initialize personal info form
         setPersonalInfoForm({
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            dateOfBirth: contact.dateOfBirth || '',
            phone: contact.phone || '',
            email: contact.email || ''
         });
         if (contact.bankDetails) {
            setBankDetails(contact.bankDetails);
         }
         // Initialize current address form
         if (contact.address) {
            setCurrentAddressForm({
               line1: contact.address.line1 || '',
               line2: contact.address.line2 || '',
               city: contact.address.city || '',
               state_county: contact.address.state_county || '',
               postalCode: contact.address.postalCode || ''
            });
         }
         // Initialize previous addresses (new multiple addresses)
         if (contact.previousAddresses && contact.previousAddresses.length > 0) {
            setPreviousAddresses(contact.previousAddresses);
         } else if (contact.previousAddressObj) {
            // Migrate legacy single previous address to new format
            setPreviousAddresses([{
               id: `prev_addr_${Date.now()}`,
               line1: contact.previousAddressObj.line1 || '',
               line2: contact.previousAddressObj.line2 || '',
               city: contact.previousAddressObj.city || '',
               county: contact.previousAddressObj.state_county || '',
               postalCode: contact.previousAddressObj.postalCode || ''
            }]);
         }
         // Initialize document checklist
         if (contact.documentChecklist) {
            setDocumentChecklist({
               identification: contact.documentChecklist.identification || false,
               extraLender: contact.documentChecklist.extraLender || false,
               questionnaire: contact.documentChecklist.questionnaire || false,
               poa: contact.documentChecklist.poa || false
            });
         }
         // Initialize extra lenders
         if (contact.extraLenders) {
            setExtraLenders(contact.extraLenders);
         }
      }
   }, [contact]);

   const toggleLender = (lender: string) => {
      setSelectedLenders(prev =>
         prev.includes(lender) ? prev.filter(l => l !== lender) : [...prev, lender]
      );
   };

   // Preview loading state (must be before early return for hooks rules)
   const [previewLoading, setPreviewLoading] = useState(false);

   // S3 Sync state (must be before early return for hooks rules)
   const [syncingDocs, setSyncingDocs] = useState(false);
   const [syncMessage, setSyncMessage] = useState<string | null>(null);

   // Per-contact document fetching (fixes documents not showing)
   const [localContactDocs, setLocalContactDocs] = useState<Document[]>([]);
   const [docsLoading, setDocsLoading] = useState(false);

   // Document pagination - show 10 at a time for faster loading
   const [docsPage, setDocsPage] = useState(1);
   const docsPerPage = 10;

   const fetchContactDocuments = useCallback(async () => {
      if (!contactId) return;
      setDocsLoading(true);
      try {
         const res = await fetch(`${API_BASE_URL}/api/contacts/${contactId}/documents`);
         if (!res.ok) throw new Error('Failed to fetch documents');
         const data = await res.json();
         const mapped: Document[] = data.map((d: any) => ({
            id: d.id.toString(),
            name: d.name,
            type: d.type,
            category: d.category,
            url: d.url,
            size: d.size,
            version: d.version,
            tags: d.tags || [],
            associatedContactId: d.contact_id?.toString(),
            dateModified: d.created_at?.split('T')[0],
            createdAt: d.created_at
         }));
         setLocalContactDocs(mapped);
         setDocsPage(1); // Reset pagination when documents are refreshed
      } catch (err) {
         console.error('Error fetching contact documents:', err);
      } finally {
         setDocsLoading(false);
      }
   }, [contactId]);

   // Fetch documents when component mounts or tab changes to documents
   useEffect(() => {
      if (activeTab === 'documents') {
         fetchContactDocuments();
      }
   }, [activeTab, fetchContactDocuments]);

   // Note: Loading/not-found early returns moved to just before JSX to preserve hook call order

   // Filter documents for this contact, only hiding signature.png and signature2.png
   // Uses per-contact fetched docs (localContactDocs) instead of global documents state
   const contactDocs = localContactDocs.filter(d => {
      const lowerName = d.name.toLowerCase();
      if (lowerName === 'signature.png' || lowerName === 'signature_2.png') return false;
      return true;
   });

   // Paginated documents for Documents tab - show 10 at a time for faster loading
   const totalDocsPages = Math.ceil(contactDocs.length / docsPerPage);
   const paginatedDocs = contactDocs.slice((docsPage - 1) * docsPerPage, docsPage * docsPerPage);

   // Helper to extract lender from document tags or name
   const getLenderFromDoc = (doc: Document) => {
      const docTypeTags = ['Cover Letter', 'LOA', 'T&C', 'Signature', 'Uploaded', 'Previous Address', 'Signed', 'LOA Form'];
      const lenderTag = doc.tags.find(tag => !docTypeTags.includes(tag));
      if (lenderTag) return lenderTag;
      const nameParts = doc.name.split('_');
      if (nameParts.length > 1) {
         return nameParts[0].replace(/_/g, ' ');
      }
      return '';
   };

   // Helper to format date from yyyy-mm-dd to dd-mm-yyyy
   const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
         return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
   };

   // Handle document preview - fetches fresh signed URL before displaying
   const handleDocumentPreview = async (doc: Document) => {
      if (!doc.url) {
         setPreviewDoc(doc);
         return;
      }

      setPreviewLoading(true);
      try {
         const res = await fetch(`${API_BASE_URL}/api/documents/secure-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: doc.url })
         });

         const data = await res.json();
         if (data.success && data.signedUrl) {
            // Update the document with fresh URL and show preview
            setPreviewDoc({ ...doc, url: data.signedUrl });
         } else {
            // Show error in preview modal
            setPreviewDoc({ ...doc, url: '', content: `Error: ${data.message || 'Could not load document'}` });
         }
      } catch (err) {
         console.error('Preview error:', err);
         setPreviewDoc({ ...doc, url: '', content: 'Error: Failed to load document from storage' });
      } finally {
         setPreviewLoading(false);
      }
   };

   // Force download file via server proxy (avoids CORS issues with S3)
   const handleDownload = async (doc: Document) => {
      if (!doc.url) return;

      try {
         // Use server-side download proxy to stream file
         const res = await fetch(`${API_BASE_URL}/api/documents/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: doc.url, filename: doc.name })
         });

         if (!res.ok) {
            addNotification('error', 'Failed to download file');
            return;
         }

         // Get blob from response and trigger download
         const blob = await res.blob();
         const blobUrl = window.URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = blobUrl;
         link.download = doc.name || 'download';
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         window.URL.revokeObjectURL(blobUrl);
      } catch (err) {
         console.error('Download error:', err);
         addNotification('error', 'Failed to download file');
      }
   };

   // Handle document delete - removes from DB and S3
   const handleDeleteDocument = async () => {
      if (!docToDelete || deleteDocConfirmText !== 'DELETE') return;

      setIsDeletingDoc(true);
      setDeleteDocProgress(0);

      // Simulate progress
      const progressInterval = setInterval(() => {
         setDeleteDocProgress(prev => {
            if (prev >= 90) return prev;
            return prev + Math.random() * 15;
         });
      }, 200);

      try {
         const res = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(docToDelete.id)}`, {
            method: 'DELETE'
         });

         clearInterval(progressInterval);

         if (!res.ok) {
            let errorMsg = 'Failed to delete document';
            try {
               const data = await res.json();
               errorMsg = data.error || errorMsg;
            } catch { /* response body not valid JSON */ }
            throw new Error(errorMsg);
         }

         setDeleteDocProgress(100);
         await new Promise(resolve => setTimeout(resolve, 500));

         addNotification('success', `Document "${docToDelete.name}" deleted successfully`);

         // Refresh documents list
         await fetchContactDocuments();

         // Close modal
         setShowDeleteDocConfirm(false);
         setDocToDelete(null);
         setDeleteDocConfirmText('');
      } catch (err: unknown) {
         clearInterval(progressInterval);
         const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
         console.error('Delete document error:', err);
         addNotification('error', errorMessage);
      } finally {
         setIsDeletingDoc(false);
         setDeleteDocProgress(0);
      }
   };

   // Handle S3 document sync - discovers and imports files from S3 that aren't in the database
   const handleSyncDocuments = async () => {
      setSyncingDocs(true);
      setSyncMessage(null);
      try {
         const res = await fetch(`${API_BASE_URL}/api/contacts/${contactId}/sync-documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
         });

         const data = await res.json();
         if (data.success) {
            if (data.synced > 0) {
               addNotification('success', `Synced ${data.synced} new document(s) from storage`);
               // Refresh per-contact documents
               await fetchContactDocuments();
            } else {
               addNotification('info', 'No new documents found in storage');
            }
            setSyncMessage(`${data.synced} new, ${data.total} total in S3`);
         } else {
            addNotification('error', data.message || 'Sync failed');
         }
      } catch (err) {
         console.error('Sync error:', err);
         addNotification('error', 'Failed to sync documents from storage');
      } finally {
         setSyncingDocs(false);
      }
   };

   // Filter logs for this contact (legacy activity logs)
   const legacyTimeline = legacyActivityLogs
      .filter(log => log.contactId === contactId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

   const notesList = legacyActivityLogs
      .filter(log => log.contactId === contactId && log.type === 'note')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

   // Filter communications based on selected filter
   const filteredCommunications = communications.filter(comm => {
      if (communicationFilter === 'all') return true;
      if (communicationFilter === 'email') return comm.channel === 'email';
      if (communicationFilter === 'sms') return comm.channel === 'sms';
      if (communicationFilter === 'whatsapp') return comm.channel === 'whatsapp';
      if (communicationFilter === 'call') return comm.channel === 'call';
      if (communicationFilter === 'inbound') return comm.direction === 'inbound';
      if (communicationFilter === 'outbound') return comm.direction === 'outbound';
      return true;
   });

   // Filter action logs based on timeline filter and current contact
   const filteredActionLogs = actionLogs.filter(log => {
      // Only show logs for the current contact
      if (String(log.clientId) !== String(contactId)) return false;

      if (timelineFilter === 'all') return true;
      if (timelineFilter === 'claims') return log.actionCategory === 'claims';
      if (timelineFilter === 'communication') return log.actionCategory === 'communication';
      if (timelineFilter === 'documents') return log.actionCategory === 'documents';
      if (timelineFilter === 'notes') return log.actionCategory === 'notes';
      if (timelineFilter === 'workflows') return log.actionCategory === 'workflows';
      return true;
   });

   // Sort & filter CRM notes (pinned first, then by date)
   const sortedNotes = [...crmNotes]
      .filter((note) => {
         if (noteFilter === 'all') return true;
         const { lender } = parseLenderFromNote(note.content);
         if (noteFilter === 'note') return !lender;
         return lender === noteFilter;
      })
      .sort((a, b) => {
         if (a.pinned && !b.pinned) return -1;
         if (!a.pinned && b.pinned) return 1;
         return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

   // Unique lenders from notes for filter options
   const noteLenders = [...new Set(crmNotes.map(n => parseLenderFromNote(n.content).lender).filter(Boolean))];

   // Active workflows for this client
   const activeWorkflows = workflowTriggers.filter(w => w.status === 'active');

   const handleAddClaim = async () => {
      if (selectedLenders.length === 0) {
         alert("Please select at least one lender.");
         return;
      }
      if (isCreatingClaim) return; // Prevent double-click

      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      setIsCreatingClaim(true);
      setClaimProgress(0);
      setClaimProgressTotal(selectedLenders.length);
      let createdCount = 0;
      let confirmationSentCount = 0;
      const confirmationLenders: string[] = [];

      try {
         const failedLenders: { lender: string; error: string }[] = [];

         for (let i = 0; i < selectedLenders.length; i++) {
            // Show partial progress before API call (smooth fill)
            setClaimProgress(i + 0.3);
            await delay(400);
            const result = await addClaim({
               contactId: contact.id,
               lender: selectedLenders[i],
               claimValue: Number(newClaimData.claimValue),
               status: newClaimData.status,
               productType: newClaimData.productType || 'Credit Card'
            });
            // Track Category 3 vs normal claims vs failures
            if (result.category3) {
               confirmationSentCount++;
               confirmationLenders.push(result.lender || selectedLenders[i]);
            } else if (result.success) {
               createdCount++;
            } else {
               // Track failed claims (e.g., duplicates)
               failedLenders.push({ lender: selectedLenders[i], error: result.message || 'Unknown error' });
            }
            // Complete this step
            setClaimProgress(i + 1);
            await delay(300);
         }
         // Brief pause at 100% so user sees completion
         await delay(600);

         // Build appropriate notification message
         const messages: string[] = [];
         if (createdCount > 0) {
            messages.push(`${createdCount} claim${createdCount > 1 ? 's' : ''} created`);
         }
         if (confirmationSentCount > 0) {
            messages.push(`${confirmationSentCount} lender${confirmationSentCount > 1 ? 's' : ''} require${confirmationSentCount === 1 ? 's' : ''} client confirmation (${confirmationLenders.join(', ')})`);
         }

         if (messages.length > 0) {
            addNotification(confirmationSentCount > 0 && createdCount === 0 ? 'info' : 'success', messages.join('. '));
         }

         // Show errors for failed claims
         if (failedLenders.length > 0) {
            for (const failed of failedLenders) {
               addNotification('error', `${failed.lender}: ${failed.error}`);
            }
         }

         // Only close modal if at least one claim succeeded or was queued
         if (createdCount > 0 || confirmationSentCount > 0) {
            setShowAddClaim(false);
            setNewClaimData({ claimValue: 0, status: ClaimStatus.NEW_LEAD });
            setSelectedLenders([]);
            setLenderSearchQuery('');
         }
      } finally {
         setIsCreatingClaim(false);
         setClaimProgress(0);
         setClaimProgressTotal(0);
      }
   };

   const handleUpdateStatus = (claimId: string, newStatus: ClaimStatus) => {
      updateClaimStatus(claimId, newStatus);
      setShowStatusUpdate(null);
   };

   const scrollToDocuments = () => {
      const element = document.getElementById('documents-section');
      if (element) element.scrollIntoView({ behavior: 'smooth' });
      setActiveTab('documents');
   };

   const handleAddNote = () => {
      if (!newNote.trim()) return;
      addNote(contact.id, newNote);
      setNewNote('');
   };

   const handleUploadDocument = async () => {
      if (!uploadFile) return;
      if (isUploadingDocument) return; // Prevent double-click

      setIsUploadingDocument(true);
      setDocUploadProgress(0);

      try {
         const formData = new FormData();
         formData.append('document', uploadFile);
         formData.append('contact_id', contact.id);
         formData.append('category', uploadCategory);

         // Use XMLHttpRequest for progress tracking
         await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE_URL}/api/upload-document`);

            xhr.upload.onprogress = (event) => {
               if (event.lengthComputable) {
                  const percent = Math.round((event.loaded / event.total) * 100);
                  setDocUploadProgress(percent);
               }
            };

            xhr.onload = () => {
               if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
               } else {
                  reject(new Error('Upload failed'));
               }
            };

            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.send(formData);
         });

         setShowUploadModal(false);
         setUploadFile(null);
         setUploadCategory('Other');
         // Refresh per-contact documents after upload
         await fetchContactDocuments();
      } finally {
         setIsUploadingDocument(false);
         setDocUploadProgress(0);
      }
   };

   // ============================================
   // CRM Specification Handlers
   // ============================================

   // Communication Handlers
   const handleLogSMS = async () => {
      if (!smsContent.trim()) return;
      await addCommunication({
         clientId: contact.id,
         channel: 'sms',
         direction: 'outbound',
         content: smsContent
      });
      setSmsContent('');
      setShowSMSModal(false);
   };

   const handleLogEmail = async () => {
      if (!emailContent.trim()) return;
      await addCommunication({
         clientId: contact.id,
         channel: 'email',
         direction: 'outbound',
         subject: emailSubject,
         content: emailContent
      });
      setEmailSubject('');
      setEmailContent('');
      setShowEmailModal(false);
   };

   const handleLogWhatsApp = async () => {
      if (!whatsappContent.trim()) return;
      await addCommunication({
         clientId: contact.id,
         channel: 'whatsapp',
         direction: 'outbound',
         content: whatsappContent
      });
      setWhatsappContent('');
      setShowWhatsAppModal(false);
   };

   const handleLogCall = async () => {
      await addCommunication({
         clientId: contact.id,
         channel: 'call',
         direction: 'outbound',
         content: callOutcome,
         callDurationSeconds: parseInt(callDuration) || 0,
         callNotes: callNotes
      });
      setCallDuration('');
      setCallOutcome('');
      setCallNotes('');
      setShowCallModal(false);
   };

   // Workflow Handlers
   const handleTriggerWorkflow = async () => {
      if (!selectedWorkflowType) return;
      await triggerWorkflow(contact.id, selectedWorkflowType);
      setSelectedWorkflowType('');
   };

   const handleCancelWorkflow = async (triggerId: string) => {
      await cancelWorkflow(triggerId);
   };

   // CRM Note Handlers
   const handleAddCRMNote = async () => {
      if (!newNoteContent.trim()) return;
      const noteContent = newNoteContent;
      const notePinned = newNotePinned;
      // Close modal and reset state immediately for better UX
      setShowAddNoteModal(false);
      setNewNoteContent('');
      setNewNotePinned(false);
      // Then save the note
      await addCRMNote(contact.id, noteContent, notePinned);
   };

   const handleUpdateNote = async () => {
      if (!editingNote || !newNoteContent.trim()) return;
      const noteId = editingNote.id;
      const noteContent = newNoteContent;
      const notePinned = newNotePinned;
      // Close modal and reset state immediately for better UX
      setShowAddNoteModal(false);
      setEditingNote(null);
      setNewNoteContent('');
      setNewNotePinned(false);
      // Then update the note
      await updateCRMNote(noteId, noteContent, notePinned);
   };

   const handleDeleteNote = async (noteId: string) => {
      if (confirm('Are you sure you want to delete this note?')) {
         await deleteCRMNote(noteId);
      }
   };

   const openEditNote = (note: CRMNote) => {
      setEditingNote(note);
      setNewNoteContent(note.content);
      setNewNotePinned(note.pinned);
      setShowAddNoteModal(true);
   };

   // Claim Note Handler - creates a note tagged with the lender
   const handleAddClaimNote = async () => {
      if (!claimNoteContent.trim() || !claimNoteLender) return;
      const taggedContent = `{{lender:${claimNoteLender}}}${claimNoteContent}`;
      setShowClaimNoteModal(false);
      setClaimNoteContent('');
      setClaimNoteLender('');
      await addCRMNote(contact.id, taggedContent, false);
   };

   // Edit note from preview (management only) - preserves lender tag
   const handleEditNoteFromPreview = (note: CRMNote) => {
      const { lender, noteContent } = parseLenderFromNote(note.content);
      setEditingNote(note);
      setNewNoteContent(lender ? `{{lender:${lender}}}${noteContent}` : noteContent);
      setNewNotePinned(note.pinned);
      setPreviewNote(null);
      setShowAddNoteModal(true);
   };

   // Delete note from preview (management only)
   const handleDeleteNoteFromPreview = async (noteId: string) => {
      if (confirm('Are you sure you want to delete this note?')) {
         setPreviewNote(null);
         await deleteCRMNote(noteId);
      }
   };

   // Extended Details Handlers
   const handleSavePersonalInfo = () => {
      updateContact({
         ...contact,
         firstName: personalInfoForm.firstName,
         lastName: personalInfoForm.lastName,
         fullName: `${personalInfoForm.firstName} ${personalInfoForm.lastName}`,
         dateOfBirth: personalInfoForm.dateOfBirth,
         phone: personalInfoForm.phone,
         email: personalInfoForm.email
      });
      setEditingPersonalInfo(false);
   };

   const handleSaveBankDetails = async () => {
      await updateContactExtended(contact.id, { bankDetails });
      setEditingBankDetails(false);
   };

   const handleDeleteBankDetails = async () => {
      if (!window.confirm('Are you sure you want to delete the bank details? This action cannot be undone.')) {
         return;
      }
      const emptyBankDetails = {
         bankName: '',
         accountName: '',
         sortCode: '',
         accountNumber: ''
      };
      await updateContactExtended(contact.id, { bankDetails: emptyBankDetails });
      setBankDetails(emptyBankDetails);
      setEditingBankDetails(false);
      addNotification('success', 'Bank details deleted');
   };

   const handleSaveCurrentAddress = async () => {
      await updateContactExtended(contact.id, {
         address: {
            line1: currentAddressForm.line1,
            line2: currentAddressForm.line2,
            city: currentAddressForm.city,
            state_county: currentAddressForm.state_county,
            postalCode: currentAddressForm.postalCode
         }
      });
      setEditingCurrentAddress(false);
   };

   const handleSavePreviousAddresses = async () => {
      await updateContactExtended(contact.id, { previousAddresses });
      setEditingPreviousAddresses(false);
   };

   const handleSaveExtraLenders = async () => {
      await updateContactExtended(contact.id, { extraLenders });
      setEditingExtraLenders(false);
   };

   // Handle document checklist checkbox change with action logging
   const handleDocumentChecklistChange = async (field: keyof typeof documentChecklist, value: boolean) => {
      console.log('[Checklist Change] Field:', field, 'Value:', value);
      const updatedChecklist = { ...documentChecklist, [field]: value };
      setDocumentChecklist(updatedChecklist);

      try {
         const result = await updateContactExtended(contact.id, {
            documentChecklist: updatedChecklist,
            checklistChange: { field, value }
         });
         console.log('[Checklist Change] Update result:', result);

         // Small delay to ensure database commit is complete
         await new Promise(resolve => setTimeout(resolve, 100));

         // Refresh action logs to show the new entry
         await fetchAllActionLogs();
         console.log('[Checklist Change] Logs refreshed');
      } catch (error) {
         console.error('[Checklist Change] Error:', error);
      }
   };

   const handleAddPreviousAddress = () => {
      const newAddress: PreviousAddressEntry = {
         id: `prev_addr_${Date.now()}`,
         line1: '',
         line2: '',
         city: '',
         county: '',
         postalCode: ''
      };
      setPreviousAddresses([...previousAddresses, newAddress]);
   };

   const handleRemovePreviousAddress = (id: string) => {
      setPreviousAddresses(previousAddresses.filter(addr => addr.id !== id));
   };

   const handleUpdatePreviousAddress = (id: string, field: keyof PreviousAddressEntry, value: string) => {
      setPreviousAddresses(previousAddresses.map(addr =>
         addr.id === id ? { ...addr, [field]: value } : addr
      ));
   };

   // Previous address lookup functions
   const handlePrevAddrSearch = (addrId: string, query: string) => {
      setPrevAddrQuery(prev => ({ ...prev, [addrId]: query }));
      setShowPrevAddrSuggestions(prev => ({ ...prev, [addrId]: true }));

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      if (query.length > 2) {
         setPrevAddrLoading(prev => ({ ...prev, [addrId]: true }));
         searchTimeoutRef.current = setTimeout(() => {
            if (!autocompleteServiceRef.current) {
               setPrevAddrLoading(prev => ({ ...prev, [addrId]: false }));
               return;
            }

            const request = {
               input: query,
               componentRestrictions: { country: 'gb' }
            };

            autocompleteServiceRef.current.getPlacePredictions(request, (predictions: any[], status: any) => {
               setPrevAddrLoading(prev => ({ ...prev, [addrId]: false }));
               if (status === window.google?.maps?.places?.PlacesServiceStatus?.OK && predictions) {
                  setPrevAddrSuggestions(prev => ({ ...prev, [addrId]: predictions.slice(0, 4) }));
               } else {
                  setPrevAddrSuggestions(prev => ({ ...prev, [addrId]: [] }));
               }
            });
         }, 300);
      } else {
         setPrevAddrSuggestions(prev => ({ ...prev, [addrId]: [] }));
         setPrevAddrLoading(prev => ({ ...prev, [addrId]: false }));
      }
   };

   const handleSelectPrevAddr = (addrId: string, suggestion: any) => {
      setPrevAddrQuery(prev => ({ ...prev, [addrId]: suggestion.description }));
      setShowPrevAddrSuggestions(prev => ({ ...prev, [addrId]: false }));
      setPrevAddrLoading(prev => ({ ...prev, [addrId]: true }));

      if (!placesServiceRef.current) {
         setPrevAddrLoading(prev => ({ ...prev, [addrId]: false }));
         return;
      }

      const request = {
         placeId: suggestion.place_id,
         fields: ['address_components']
      };

      placesServiceRef.current.getDetails(request, (place: any, status: any) => {
         setPrevAddrLoading(prev => ({ ...prev, [addrId]: false }));
         if (status === window.google?.maps?.places?.PlacesServiceStatus?.OK && place) {
            let streetNumber = '';
            let route = '';
            let postalTown = '';
            let locality = '';
            let subpremise = '';
            let county = '';
            let postalCode = '';

            place.address_components.forEach((component: any) => {
               const types = component.types;
               if (types.includes('subpremise')) subpremise = component.long_name;
               if (types.includes('street_number')) streetNumber = component.long_name;
               if (types.includes('route')) route = component.long_name;
               if (types.includes('postal_town')) postalTown = component.long_name;
               if (types.includes('locality')) locality = component.long_name;
               if (types.includes('administrative_area_level_2')) county = component.long_name;
               if (types.includes('administrative_area_level_1') && !county) county = component.long_name;
               if (types.includes('postal_code')) postalCode = component.long_name;
            });

            const fullStreet = [subpremise, streetNumber, route].filter(Boolean).join(' ');
            const city = postalTown || locality;

            setPreviousAddresses(prev => prev.map(addr =>
               addr.id === addrId ? {
                  ...addr,
                  line1: fullStreet,
                  city: city,
                  county: county,
                  postalCode: postalCode
               } : addr
            ));
         }
      });
   };

   // Open claim file view
   const handleOpenClaimFile = async (claimId: string) => {
      setViewingClaimId(claimId);

      // Fetch documents so they show in claim file view
      fetchContactDocuments();

      // Check for autosaved data first
      const autosaveKey = `claim_autosave_${claimId}`;
      const autosaveData = localStorage.getItem(autosaveKey);

      if (autosaveData) {
         try {
            const parsed = JSON.parse(autosaveData);
            // Restore autosaved form data
            setClaimFileForm(parsed.claimFileForm);
            // Still fetch the full claim for claimFileData but don't overwrite form
            const fullClaim = await fetchFullClaim(claimId);
            setClaimFileData(fullClaim);
            return; // Exit early, autosaved data restored
         } catch (e) {
            console.error('Error restoring autosaved data:', e);
            // If parsing fails, continue with normal flow
            localStorage.removeItem(autosaveKey);
         }
      }

      const fullClaim = await fetchFullClaim(claimId);
      setClaimFileData(fullClaim);

      // Also get the basic claim data from local state
      const basicClaim = claims.find(c => c.id === claimId);

      // Parse JSON fields safely
      let parsedFinanceTypes: FinanceTypeEntry[] = [];
      let parsedLoanDetails: LoanDetails[] = [{ loanNumber: 1, valueOfLoan: '', startDate: '', endDate: '', apr: '', billedInterestCharges: '', latePaymentCharges: '', overlimitCharges: '' }];
      let parsedPaymentPlan: PaymentPlan = { clientOutstandingFees: '', planStatus: '', planDate: '', termOfPlan: '', startDate: '', remainingBalance: '', monthlyPaymentAgreed: '' };

      try {
         if (fullClaim?.finance_types) {
            parsedFinanceTypes = typeof fullClaim.finance_types === 'string'
               ? JSON.parse(fullClaim.finance_types)
               : fullClaim.finance_types;
         }
      } catch (e) { console.error('Error parsing finance_types:', e); }

      try {
         if (fullClaim?.loan_details) {
            const rawLoans = typeof fullClaim.loan_details === 'string'
               ? JSON.parse(fullClaim.loan_details)
               : fullClaim.loan_details;
            // Map snake_case DB keys to camelCase frontend keys (handles both formats)
            parsedLoanDetails = rawLoans.map((loan: any, idx: number) => ({
               loanNumber: loan.loanNumber ?? loan.loan_number ?? idx + 1,
               accountNumber: loan.accountNumber ?? loan.account_number ?? '',
               valueOfLoan: loan.valueOfLoan ?? loan.value_of_loan ?? '',
               startDate: loan.startDate ?? loan.start_date ?? '',
               endDate: loan.endDate ?? loan.end_date ?? '',
               apr: loan.apr ?? '',
               billedInterestCharges: loan.billedInterestCharges ?? loan.billed_interest_charges ?? '',
               latePaymentCharges: loan.latePaymentCharges ?? loan.late_payment_charges ?? '',
               overlimitCharges: loan.overlimitCharges ?? loan.overlimit_charges ?? '',
            }));
         }
      } catch (e) { console.error('Error parsing loan_details:', e); }

      try {
         if (fullClaim?.payment_plan) {
            parsedPaymentPlan = typeof fullClaim.payment_plan === 'string'
               ? JSON.parse(fullClaim.payment_plan)
               : fullClaim.payment_plan;
         }
      } catch (e) { console.error('Error parsing payment_plan:', e); }

      // Ensure loanDetails array matches numberOfLoans
      const numLoans = parseInt(fullClaim?.number_of_loans?.toString() || '1') || 1;
      if (parsedLoanDetails.length < numLoans) {
         for (let i = parsedLoanDetails.length + 1; i <= numLoans; i++) {
            parsedLoanDetails.push({ loanNumber: i, valueOfLoan: '', startDate: '', endDate: '', apr: '', billedInterestCharges: '', latePaymentCharges: '', overlimitCharges: '' });
         }
      }

      // Populate form with fetched data
      if (fullClaim || basicClaim) {
         const rawLender = fullClaim?.lender || basicClaim?.lender || '';
         const mappedLender = SPEC_LENDERS.find(l => l.toLowerCase() === rawLender.toLowerCase()) || rawLender;

         setClaimFileForm({
            // Section 1: Claim Details
            lender: mappedLender,
            lenderOther: fullClaim?.lender_other || '',
            financeTypes: parsedFinanceTypes,
            financeType: fullClaim?.finance_type || '',
            financeTypeOther: fullClaim?.finance_type_other || '',
            numberOfLoans: fullClaim?.number_of_loans?.toString() || '1',
            loanDetails: parsedLoanDetails,
            billedInterestCharges: fullClaim?.billed_interest_charges || '',
            latePaymentCharges: fullClaim?.late_payment_charges?.toString() || '',
            overlimitCharges: fullClaim?.overlimit_charges || '',
            totalAmountOfDebt: fullClaim?.total_debt?.toString() || fullClaim?.total_amount_of_debt?.toString() || '',
            claimValue: fullClaim?.claim_value || '',
            creditLimitIncreases: fullClaim?.credit_limit_increases || '',
            dsarReview: fullClaim?.dsar_review || '',
            complaintParagraph: fullClaim?.complaint_paragraph || '',
            // Section 2: Payment Section
            offerMade: fullClaim?.offer_made?.toString() || '',
            feePercent: fullClaim?.fee_percent?.toString() || '',
            totalRefund: fullClaim?.total_refund?.toString() || '',
            totalDebt: fullClaim?.total_debt?.toString() || '',
            balanceDueToClient: fullClaim?.balance_due_to_client || '',
            ourFeesPlusVat: fullClaim?.our_fees_plus_vat || '',
            ourFeesMinusVat: fullClaim?.our_fees_minus_vat || '',
            vatAmount: fullClaim?.vat_amount || '',
            totalFee: fullClaim?.total_fee || '',
            outstandingDebt: fullClaim?.outstanding_debt || '',
            // Section 3: Payment Plan
            paymentPlan: parsedPaymentPlan,
            // Legacy fields
            accountNumber: fullClaim?.account_number || basicClaim?.accountNumber || '',
            lenderReference: fullClaim?.lender_reference || '',
            datesTimeline: fullClaim?.dates_timeline || '',
            apr: fullClaim?.apr?.toString() || '',
            outstandingBalance: fullClaim?.outstanding_balance?.toString() || '',
            billedFinanceCharges: fullClaim?.billed_finance_charges?.toString() || '',
            clientFee: fullClaim?.client_fee?.toString() || '',
            ourTotalFee: fullClaim?.our_total_fee?.toString() || '',
            feeWithoutVat: fullClaim?.fee_without_vat?.toString() || '',
            vat: fullClaim?.vat?.toString() || '',
            ourFeeNet: fullClaim?.our_fee_net?.toString() || '',
            specStatus: fullClaim?.spec_status || fullClaim?.status || basicClaim?.status || 'New Lead'
         });
      }
   };
   handleOpenClaimFileRef.current = handleOpenClaimFile;

   // Close claim file view and go back to list (or Pipeline if came from there)
   const handleCloseClaimFile = () => {
      // If we came from Pipeline (initialClaimId was set), navigate back to Pipeline
      if (initialClaimId && onBackToPipeline) {
         onBackToPipeline();
         return;
      }
      setViewingClaimId(null);
      setClaimFileData(null);
      setClaimFileForm({
         // Section 1: Claim Details
         lender: '',
         lenderOther: '',
         financeTypes: [],
         financeType: '',
         financeTypeOther: '',
         numberOfLoans: '1',
         loanDetails: [{ loanNumber: 1, accountNumber: '', valueOfLoan: '', startDate: '', endDate: '', apr: '', billedInterestCharges: '', latePaymentCharges: '', overlimitCharges: '' }],
         billedInterestCharges: '',
         latePaymentCharges: '',
         overlimitCharges: '',
         totalAmountOfDebt: '',
         claimValue: '',
         creditLimitIncreases: '',
         dsarReview: '',
         complaintParagraph: '',
         // Section 2: Payment Section
         offerMade: '',
         feePercent: '',
         totalRefund: '',
         totalDebt: '',
         balanceDueToClient: '',
         ourFeesPlusVat: '',
         ourFeesMinusVat: '',
         vatAmount: '',
         totalFee: '',
         outstandingDebt: '',
         // Section 3: Payment Plan
         paymentPlan: {
            clientOutstandingFees: '',
            planStatus: '',
            planDate: '',
            termOfPlan: '',
            startDate: '',
            remainingBalance: '',
            monthlyPaymentAgreed: ''
         },
         // Legacy fields
         accountNumber: '',
         lenderReference: '',
         datesTimeline: '',
         apr: '',
         outstandingBalance: '',
         billedFinanceCharges: '',
         clientFee: '',
         ourTotalFee: '',
         feeWithoutVat: '',
         vat: '',
         ourFeeNet: '',
         specStatus: 'New Claim'
      });
   };

   // Save claim file data
   const handleSaveClaimFile = async () => {
      if (!viewingClaimId) return;

      setClaimFileSaving(true);
      try {
         const dataToSave: Record<string, any> = {
            // Section 1: Claim Details
            lender: claimFileForm.lender,
            lender_other: claimFileForm.lenderOther,
            // Multi-select finance types (stored as JSON)
            finance_types: JSON.stringify(claimFileForm.financeTypes),
            finance_type: claimFileForm.financeType, // Legacy
            finance_type_other: claimFileForm.financeTypeOther,
            account_number: claimFileForm.accountNumber, // Legacy
            number_of_loans: claimFileForm.numberOfLoans ? parseInt(claimFileForm.numberOfLoans) : 1,
            // Dynamic loan details (stored as JSON)
            loan_details: JSON.stringify(claimFileForm.loanDetails),
            // Charges fields
            billed_interest_charges: claimFileForm.billedInterestCharges,
            late_payment_charges: claimFileForm.latePaymentCharges,
            overlimit_charges: claimFileForm.overlimitCharges,
            claim_value: claimFileForm.claimValue,
            credit_limit_increases: claimFileForm.creditLimitIncreases,
            dsar_review: claimFileForm.dsarReview,
            complaint_paragraph: claimFileForm.complaintParagraph,

            // Section 2: Payment Section
            offer_made: claimFileForm.offerMade,
            fee_percent: claimFileForm.feePercent,
            total_refund: claimFileForm.totalRefund,
            total_debt: claimFileForm.totalAmountOfDebt || claimFileForm.totalDebt,
            balance_due_to_client: claimFileForm.balanceDueToClient,
            our_fees_plus_vat: claimFileForm.ourFeesPlusVat,
            our_fees_minus_vat: claimFileForm.ourFeesMinusVat,
            vat_amount: claimFileForm.vatAmount,
            total_fee: claimFileForm.totalFee,
            outstanding_debt: claimFileForm.outstandingDebt,

            // Section 3: Payment Plan (stored as JSON)
            payment_plan: JSON.stringify(claimFileForm.paymentPlan),

            // Legacy fields (kept for backwards compatibility)
            lender_reference: claimFileForm.lenderReference,
            dates_timeline: claimFileForm.datesTimeline,
            apr: claimFileForm.apr ? parseFloat(claimFileForm.apr) : null,
            outstanding_balance: claimFileForm.outstandingBalance ? parseFloat(claimFileForm.outstandingBalance) : null,
            billed_finance_charges: claimFileForm.billedFinanceCharges ? parseFloat(claimFileForm.billedFinanceCharges) : null,
            client_fee: claimFileForm.clientFee ? parseFloat(claimFileForm.clientFee) : null,
            our_total_fee: claimFileForm.ourTotalFee ? parseFloat(claimFileForm.ourTotalFee) : null,
            fee_without_vat: claimFileForm.feeWithoutVat ? parseFloat(claimFileForm.feeWithoutVat) : null,
            vat: claimFileForm.vat ? parseFloat(claimFileForm.vat) : null,
            our_fee_net: claimFileForm.ourFeeNet ? parseFloat(claimFileForm.ourFeeNet) : null,
            spec_status: claimFileForm.specStatus
         };

         await updateClaimExtended(viewingClaimId, dataToSave);

         // Clear autosaved data after successful save
         const autosaveKey = `claim_autosave_${viewingClaimId}`;
         localStorage.removeItem(autosaveKey);

         // Also update the basic claim status if changed (persist to DB)
         const basicClaim = claims.find(c => c.id === viewingClaimId);
         if (basicClaim && basicClaim.status !== claimFileForm.specStatus) {
            updateClaimStatus(viewingClaimId, claimFileForm.specStatus);
         }
      } finally {
         setClaimFileSaving(false);
      }
   };

   // Delete claim handler with progressive %
   const handleDeleteClaim = async () => {
      if (!viewingClaimId) return;
      setIsDeletingClaim(true);
      setDeleteProgress(0);

      // Simulate smooth progress while waiting for server
      const progressInterval = setInterval(() => {
         setDeleteProgress(prev => {
            if (prev >= 85) { clearInterval(progressInterval); return 85; }
            return prev + 8;
         });
      }, 200);

      try {
         await deleteClaim(viewingClaimId);
         clearInterval(progressInterval);
         setDeleteProgress(100);
         // Brief pause at 100% so user sees completion
         await new Promise(r => setTimeout(r, 600));
         setShowDeleteClaimConfirm(false);
         handleCloseClaimFile();
      } catch {
         clearInterval(progressInterval);
      } finally {
         setIsDeletingClaim(false);
         setDeleteProgress(0);
      }
   };

   // Upload document for claim - stores in Lenders/{Lender}/{Category}/ folder
   const handleClaimDocUpload = async () => {
      if (!claimDocFile || !viewingClaimId || !contact || !claimFileForm.lender) return;
      if (isUploadingClaimDoc) return;

      setIsUploadingClaimDoc(true);
      setClaimDocUploadProgress(0);

      try {
         const formData = new FormData();
         formData.append('document', claimDocFile);
         formData.append('contact_id', contact.id);
         formData.append('claim_id', viewingClaimId);
         formData.append('lender', claimFileForm.lender);
         formData.append('category', claimDocCategory);

         // Use XMLHttpRequest for progress tracking
         await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE_URL}/api/upload-claim-document`);

            xhr.upload.onprogress = (event) => {
               if (event.lengthComputable) {
                  const percent = Math.round((event.loaded / event.total) * 100);
                  setClaimDocUploadProgress(percent);
               }
            };

            xhr.onload = () => {
               if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
               } else {
                  reject(new Error('Upload failed'));
               }
            };

            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.send(formData);
         });

         // Refresh documents list
         await fetchContactDocuments();

         setShowClaimDocUpload(false);
         setClaimDocFile(null);
         setClaimDocCategory('Other');
      } catch (error) {
         console.error('Error uploading claim document:', error);
      } finally {
         setIsUploadingClaimDoc(false);
         setClaimDocUploadProgress(0);
      }
   };

   // Generate Client ID (RR-contactId format) - unused, kept for compatibility
   const generateClientIdRandom = () => {
      const xxxx = Math.floor(1000 + Math.random() * 9000).toString();
      return `RR-${xxxx}`;
   };

   // Generate LOA Link
   const handleGenerateLoaLink = async () => {
      if (!contact || !currentUser) return;

      console.log('🔗 Generating LOA link for contact:', contact.id);
      console.log('Current user:', currentUser);

      setGeneratingLoaLink(true);
      try {
         // Use dynamic API base URL - works both locally and on EC2
         const apiUrl = `${API_BASE_URL}/api/contacts/${contact.id}/generate-loa-link`;
         console.log('Calling API:', apiUrl);

         const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               userId: currentUser.id,
               userName: currentUser.fullName
            })
         });

         console.log('Response status:', response.status);
         const data = await response.json();
         console.log('Response data:', data);

         if (data.success) {
            setLoaLink(data.uniqueLink);
            setShowLoaLinkModal(true);
         } else {
            console.error('API returned error:', data.message);
            alert('Error generating LOA link: ' + data.message);
         }
      } catch (error) {
         console.error('Error generating LOA link:', error);
         alert('Failed to generate LOA link. Please try again.');
      } finally {
         setGeneratingLoaLink(false);
      }
   };

   // Copy LOA Link to Clipboard
   const copyLoaLinkToClipboard = () => {
      if (loaLink) {
         navigator.clipboard.writeText(loaLink);
         // Change button color to green for visual feedback
         const copyBtn = document.querySelector('.loa-copy-btn') as HTMLButtonElement;
         if (copyBtn) {
            copyBtn.style.background = '#10b981';
            copyBtn.style.color = 'white';
            copyBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => {
               copyBtn.style.background = '';
               copyBtn.style.color = '';
               copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            }, 2000);
         }
      }
   };

   if (isLoadingContact) return <div className="p-6 flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading contact...</div>;
   if (!contact) return <div className="p-6">Contact not found. <button onClick={onBack} className="text-blue-600 underline ml-2">Back</button></div>;

   return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 animate-in fade-in duration-200 relative transition-colors">
         {/* CRM Specification Header - Client ID (left) + Name (center) + Quick Actions (right) */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 shadow-sm sticky top-0 z-20">
            <div className="flex justify-between items-center">
               {/* Left Section: Back Button + Client ID */}
               <div className="flex items-center gap-3 min-w-[200px]">
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                     <ArrowLeft size={20} />
                  </button>
                  {/* Client ID Display - Bordered box, subtle highlight */}
                  <div className="px-3 py-1.5 bg-navy-50 dark:bg-navy-900/30 border-2 border-navy-200 dark:border-navy-700 rounded-lg">
                     <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Client ID</span>
                     <p className="text-sm font-bold font-mono text-navy-700 dark:text-navy-300">
                        RR-{contact.id}
                     </p>
                  </div>
               </div>

               {/* Center Section: Client Name - Large, bold typography */}
               <div className="flex-1 text-center">
                  <h1 className="text-2xl font-bold text-navy-900 dark:text-white tracking-tight">
                     {contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                     {contact.email} {contact.phone ? `• ${contact.phone}` : ''}
                  </p>
               </div>

               {/* Right Section: Quick Action Buttons (2x2 Grid) */}
               <div className="grid grid-cols-2 gap-2 min-w-[140px]">
                  <button
                     onClick={() => setShowSMSModal(true)}
                     className="flex flex-col items-center justify-center p-2.5 bg-transparent hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-600 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400 rounded-lg transition-all border border-gray-200 dark:border-slate-600 hover:border-green-300 dark:hover:border-green-700 group"
                     title="Send SMS"
                  >
                     <MessageIcon size={18} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[10px] font-semibold mt-1">SMS</span>
                  </button>
                  <button
                     onClick={() => setShowCallModal(true)}
                     className="flex flex-col items-center justify-center p-2.5 bg-transparent hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-600 dark:text-gray-400 hover:text-purple-700 dark:hover:text-purple-400 rounded-lg transition-all border border-gray-200 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-700 group"
                     title="Log Call"
                  >
                     <PhoneIcon size={18} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[10px] font-semibold mt-1">Call</span>
                  </button>
                  <button
                     onClick={() => setShowEmailModal(true)}
                     className="flex flex-col items-center justify-center p-2.5 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400 rounded-lg transition-all border border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700 group"
                     title="Send Email"
                  >
                     <MailIcon size={18} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[10px] font-semibold mt-1">Email</span>
                  </button>
                  <button
                     onClick={() => setShowWhatsAppModal(true)}
                     className="flex flex-col items-center justify-center p-2.5 bg-transparent hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg transition-all border border-gray-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-700 group"
                     title="WhatsApp"
                  >
                     <MessageIcon size={18} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[10px] font-semibold mt-1">WhatsApp</span>
                  </button>
               </div>
            </div>

            {/* 7-Tab Navigation */}
            <div className="flex mt-4 border-b border-gray-200 dark:border-slate-700 -mb-4 overflow-x-auto">
               {CONTACT_TABS.map(tab => (
                  <button
                     key={tab.id}
                     onClick={() => {
                        setActiveTab(tab.id);
                        // If clicking Claims tab while viewing a claim file, go back to claims list
                        if (tab.id === 'claims') {
                           setViewingClaimId(null);
                        }
                     }}
                     className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                        ? 'border-navy-600 text-navy-900 dark:text-white'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-300'
                        }`}
                  >
                     <tab.icon size={16} />
                     {tab.label}
                  </button>
               ))}
            </div>
         </div>

         {/* Tab Content Area */}
         <div className="flex-1 overflow-y-auto p-6">

            {/* ==================== PERSONAL DETAILS TAB ==================== */}
            {activeTab === 'personal' && (
               <>
                  <div className="grid grid-cols-12 gap-6">
                     {/* Personal Information */}
                     <div className="col-span-12 lg:col-span-6">
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-navy-700 dark:border-slate-700 overflow-hidden">
                           <div className="p-4 border-b border-navy-700 dark:border-slate-700 bg-navy-800 flex justify-between items-center rounded-t-xl">
                              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <User size={14} /> Personal information
                              </h3>
                              <button
                                 onClick={() => setEditingPersonalInfo(!editingPersonalInfo)}
                                 className="text-xs text-white hover:bg-orange-600 px-3 py-1 rounded bg-orange-500 transition-colors shadow-sm"
                              >
                                 {editingPersonalInfo ? 'Cancel' : 'Edit'}
                              </button>
                           </div>
                           <div className="p-4">
                              {editingPersonalInfo ? (
                                 <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                                             <Lock className="w-3 h-3" />
                                             First Name
                                          </label>
                                          <input
                                             type="text"
                                             value={personalInfoForm.firstName}
                                             disabled
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                                             <Lock className="w-3 h-3" />
                                             Last Name
                                          </label>
                                          <input
                                             type="text"
                                             value={personalInfoForm.lastName}
                                             disabled
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date of Birth</label>
                                          <input
                                             type="date"
                                             value={personalInfoForm.dateOfBirth ? personalInfoForm.dateOfBirth.split('T')[0] : ''}
                                             onChange={(e) => setPersonalInfoForm({ ...personalInfoForm, dateOfBirth: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                                          <input
                                             type="tel"
                                             value={personalInfoForm.phone}
                                             onChange={(e) => setPersonalInfoForm({ ...personalInfoForm, phone: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div className="col-span-2">
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
                                          <input
                                             type="email"
                                             value={personalInfoForm.email}
                                             onChange={(e) => setPersonalInfoForm({ ...personalInfoForm, email: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                    </div>
                                    <div className="flex justify-end pt-2">
                                       <button
                                          onClick={handleSavePersonalInfo}
                                          className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                       >
                                          Save
                                       </button>
                                    </div>
                                 </div>
                              ) : (
                                 <div className="grid grid-cols-2 gap-4">
                                    <div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">First Name</p>
                                       <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.firstName || '-'}</p>
                                    </div>
                                    <div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Last Name</p>
                                       <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.lastName || '-'}</p>
                                    </div>
                                    <div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Date of Birth</p>
                                       <p className="text-sm font-medium text-gray-900 dark:text-white">{formatDateOfBirth(contact.dateOfBirth)}</p>
                                    </div>
                                    <div>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Phone</p>
                                       <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.phone || '-'}</p>
                                    </div>
                                    <div className="col-span-2">
                                       <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Email</p>
                                       <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.email || '-'}</p>
                                    </div>
                                 </div>
                              )}
                           </div>
                        </div>

                        {/* Current Address */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-navy-700 dark:border-slate-700 overflow-hidden mt-6">
                           <div className="p-4 border-b border-navy-700 dark:border-slate-700 bg-navy-800 flex justify-between items-center rounded-t-xl">
                              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <MapPin size={14} /> Current Address
                              </h3>
                              <button
                                 onClick={() => setEditingCurrentAddress(!editingCurrentAddress)}
                                 className="text-xs text-white hover:bg-white/30 px-3 py-1 rounded border border-white/40 bg-white/10 transition-colors"
                              >
                                 {editingCurrentAddress ? 'Cancel' : 'Edit'}
                              </button>
                           </div>
                           <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                              {editingCurrentAddress ? (
                                 <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                       <div className="col-span-2">
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 1</label>
                                          <input
                                             type="text"
                                             value={currentAddressForm.line1}
                                             onChange={(e) => setCurrentAddressForm({ ...currentAddressForm, line1: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div className="col-span-2">
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 2</label>
                                          <input
                                             type="text"
                                             value={currentAddressForm.line2}
                                             onChange={(e) => setCurrentAddressForm({ ...currentAddressForm, line2: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">City</label>
                                          <input
                                             type="text"
                                             value={currentAddressForm.city}
                                             onChange={(e) => setCurrentAddressForm({ ...currentAddressForm, city: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">County</label>
                                          <input
                                             type="text"
                                             value={currentAddressForm.state_county}
                                             onChange={(e) => setCurrentAddressForm({ ...currentAddressForm, state_county: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Postcode</label>
                                          <input
                                             type="text"
                                             value={currentAddressForm.postalCode}
                                             onChange={(e) => setCurrentAddressForm({ ...currentAddressForm, postalCode: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div className="flex items-end">
                                          <button
                                             onClick={handleSaveCurrentAddress}
                                             className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                          >
                                             Save
                                          </button>
                                       </div>
                                    </div>
                                 </div>
                              ) : (
                                 contact.address && (contact.address.line1 || contact.address.city || contact.address.postalCode) ? (
                                    <div className="space-y-1">
                                       <p className="font-medium text-gray-900 dark:text-white">{contact.address.line1}</p>
                                       {contact.address.line2 && <p className="text-gray-600 dark:text-gray-300">{contact.address.line2}</p>}
                                       <p className="text-gray-600 dark:text-gray-300">{contact.address.city}</p>
                                       {contact.address.state_county && <p className="text-gray-600 dark:text-gray-300">{contact.address.state_county}</p>}
                                       <p className="font-mono text-gray-700 dark:text-gray-200 font-medium">{contact.address.postalCode}</p>
                                    </div>
                                 ) : <p className="text-gray-400 italic text-center py-4">No address provided</p>
                              )}
                           </div>
                        </div>
                     </div>

                     {/* Previous Address & Bank Details */}
                     <div className="col-span-12 lg:col-span-6 space-y-6">
                        {/* Previous Addresses (Multiple) */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-navy-700 dark:border-slate-700 overflow-hidden">
                           <div className="p-4 border-b border-navy-700 dark:border-slate-700 bg-navy-800 flex justify-between items-center rounded-t-xl">
                              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <History size={14} /> Previous Address{previousAddresses.length > 1 ? 'es' : ''}
                                 {previousAddresses.length > 0 && (
                                    <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                                       {previousAddresses.length}
                                    </span>
                                 )}
                              </h3>
                              <button
                                 onClick={() => {
                                    if (!editingPreviousAddresses) {
                                       if (previousAddresses.length === 0) {
                                          const newAddress: PreviousAddressEntry = {
                                             id: `prev_addr_${Date.now()}`,
                                             line1: '',
                                             line2: '',
                                             city: '',
                                             county: '',
                                             postalCode: ''
                                          };
                                          setPreviousAddresses([newAddress]);
                                       }
                                    }
                                    setEditingPreviousAddresses(!editingPreviousAddresses);
                                 }}
                                 className="text-xs text-white hover:bg-white/30 px-3 py-1 rounded border border-white/40 bg-white/10 transition-colors"
                              >
                                 {editingPreviousAddresses ? 'Cancel' : 'Edit'}
                              </button>
                           </div>
                           <div className="p-4 space-y-4">
                              {editingPreviousAddresses ? (
                                 <>
                                    {previousAddresses.map((addr, index) => (
                                       <div key={addr.id} className="border border-gray-200 dark:border-slate-600 rounded-lg p-3 relative">
                                          <div className="flex justify-between items-center mb-3">
                                             <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                                                Previous Address {index + 1}
                                             </span>
                                             {previousAddresses.length > 1 && (
                                                <button
                                                   onClick={() => handleRemovePreviousAddress(addr.id)}
                                                   className="text-red-500 hover:text-red-700 p-1"
                                                   title="Remove this address"
                                                >
                                                   <Trash2 size={14} />
                                                </button>
                                             )}
                                          </div>
                                          <div className="grid grid-cols-2 gap-3">
                                             {/* Address Lookup */}
                                             <div className="col-span-2 relative">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                   <MapPin size={12} className="inline mr-1" /> Search Address
                                                </label>
                                                <input
                                                   type="text"
                                                   placeholder="Start typing to search..."
                                                   value={prevAddrQuery[addr.id] || ''}
                                                   onChange={(e) => handlePrevAddrSearch(addr.id, e.target.value)}
                                                   onFocus={() => setShowPrevAddrSuggestions(prev => ({ ...prev, [addr.id]: true }))}
                                                   className="w-full px-3 py-2 border border-blue-300 dark:border-blue-500 rounded-lg text-sm bg-blue-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                                />
                                                {prevAddrLoading[addr.id] && (
                                                   <div className="absolute right-3 top-8 text-blue-500">
                                                      <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                                   </div>
                                                )}
                                                {showPrevAddrSuggestions[addr.id] && prevAddrSuggestions[addr.id]?.length > 0 && (
                                                   <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                                      {prevAddrSuggestions[addr.id].map((suggestion: any, idx: number) => (
                                                         <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => handleSelectPrevAddr(addr.id, suggestion)}
                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-700 border-b border-gray-100 dark:border-slate-700 last:border-b-0"
                                                         >
                                                            {suggestion.description}
                                                         </button>
                                                      ))}
                                                   </div>
                                                )}
                                             </div>
                                             <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 1</label>
                                                <input
                                                   type="text"
                                                   value={addr.line1}
                                                   onChange={(e) => handleUpdatePreviousAddress(addr.id, 'line1', e.target.value)}
                                                   className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                />
                                             </div>
                                             <div className="col-span-2">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 2</label>
                                                <input
                                                   type="text"
                                                   value={addr.line2 || ''}
                                                   onChange={(e) => handleUpdatePreviousAddress(addr.id, 'line2', e.target.value)}
                                                   className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                />
                                             </div>
                                             <div>
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">City</label>
                                                <input
                                                   type="text"
                                                   value={addr.city}
                                                   onChange={(e) => handleUpdatePreviousAddress(addr.id, 'city', e.target.value)}
                                                   className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                />
                                             </div>
                                             <div>
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">County</label>
                                                <input
                                                   type="text"
                                                   value={addr.county || ''}
                                                   onChange={(e) => handleUpdatePreviousAddress(addr.id, 'county', e.target.value)}
                                                   className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                />
                                             </div>
                                             <div>
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Postcode</label>
                                                <input
                                                   type="text"
                                                   value={addr.postalCode}
                                                   onChange={(e) => handleUpdatePreviousAddress(addr.id, 'postalCode', e.target.value)}
                                                   className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                />
                                             </div>
                                          </div>
                                       </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-2">
                                       <button
                                          onClick={handleAddPreviousAddress}
                                          className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                                       >
                                          <Plus size={16} /> Add Another Address
                                       </button>
                                       <button
                                          onClick={handleSavePreviousAddresses}
                                          className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                       >
                                          Save All
                                       </button>
                                    </div>
                                 </>
                              ) : (
                                 previousAddresses.length > 0 ? (
                                    <div className="space-y-3">
                                       {previousAddresses.map((addr, index) => (
                                          <div key={addr.id} className="border border-gray-200 dark:border-slate-600 rounded-lg p-3">
                                             {previousAddresses.length > 1 && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 font-medium">Address {index + 1}</p>
                                             )}
                                             <div className="space-y-0.5">
                                                <p className="font-medium text-gray-900 dark:text-white text-sm">{addr.line1}</p>
                                                {addr.line2 && <p className="text-sm text-gray-600 dark:text-gray-300">{addr.line2}</p>}
                                                <p className="text-sm text-gray-600 dark:text-gray-300">{addr.city}</p>
                                                {addr.county && <p className="text-sm text-gray-600 dark:text-gray-300">{addr.county}</p>}
                                                <p className="text-sm font-mono text-gray-700 dark:text-gray-200 font-medium">{addr.postalCode}</p>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 ) : (
                                    <p className="text-gray-400 italic text-sm text-center py-4">No previous addresses</p>
                                 )
                              )}
                           </div>
                        </div>

                        {/* Bank Details */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-navy-700 dark:border-slate-700 overflow-hidden">
                           <div className="p-4 border-b border-navy-700 dark:border-slate-700 bg-navy-800 flex justify-between items-center rounded-t-xl">
                              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <Building2 size={14} /> Bank Details
                              </h3>
                              <button
                                 onClick={() => setEditingBankDetails(!editingBankDetails)}
                                 className="text-xs text-white hover:bg-white/30 px-3 py-1 rounded border border-white/40 bg-white/10 transition-colors"
                              >
                                 {editingBankDetails ? 'Cancel' : 'Edit'}
                              </button>
                           </div>
                           <div className="p-4 space-y-3">
                              {editingBankDetails ? (
                                 <>
                                    <div className="grid grid-cols-2 gap-3">
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Bank Name</label>
                                          <input
                                             type="text"
                                             value={bankDetails.bankName}
                                             onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Account Name</label>
                                          <input
                                             type="text"
                                             value={bankDetails.accountName}
                                             onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sort Code (XX-XX-XX)</label>
                                          <input
                                             type="text"
                                             value={bankDetails.sortCode}
                                             onChange={(e) => setBankDetails({ ...bankDetails, sortCode: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono"
                                             placeholder="XX-XX-XX"
                                             maxLength={8}
                                          />
                                       </div>
                                       <div>
                                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Account Number (8 digits)</label>
                                          <input
                                             type="text"
                                             value={bankDetails.accountNumber}
                                             onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono"
                                             maxLength={8}
                                          />
                                       </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-3">
                                       <button
                                          onClick={handleDeleteBankDetails}
                                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium"
                                       >
                                          Delete
                                       </button>
                                       <button
                                          onClick={handleSaveBankDetails}
                                          className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                       >
                                          Save Bank Details
                                       </button>
                                    </div>
                                 </>
                              ) : (
                                 (bankDetails.bankName || bankDetails.accountNumber) ? (
                                    <div className="grid grid-cols-2 gap-4">
                                       <div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Bank Name</p>
                                          <p className="text-sm font-medium text-gray-900 dark:text-white">{bankDetails.bankName || '-'}</p>
                                       </div>
                                       <div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Account Name</p>
                                          <p className="text-sm font-medium text-gray-900 dark:text-white">{bankDetails.accountName || '-'}</p>
                                       </div>
                                       <div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Sort Code</p>
                                          <p className="text-sm font-medium font-mono text-gray-900 dark:text-white">{bankDetails.sortCode || '-'}</p>
                                       </div>
                                       <div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Account Number</p>
                                          <p className="text-sm font-medium font-mono text-gray-900 dark:text-white">{bankDetails.accountNumber || '-'}</p>
                                       </div>
                                    </div>
                                 ) : (
                                    <p className="text-gray-400 italic text-sm text-center py-4">No bank details provided</p>
                                 )
                              )}
                           </div>
                        </div>

                        {/* Extra Lenders */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-navy-700 dark:border-slate-700 overflow-hidden mt-6">
                           <div className="p-4 border-b border-navy-700 dark:border-slate-700 bg-navy-800 flex justify-between items-center rounded-t-xl">
                              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                 <Briefcase size={14} /> Extra Lenders
                              </h3>
                              <button
                                 onClick={() => setEditingExtraLenders(!editingExtraLenders)}
                                 className="text-xs text-white hover:bg-white/30 px-3 py-1 rounded border border-white/40 bg-white/10 transition-colors"
                              >
                                 {editingExtraLenders ? 'Cancel' : 'Edit'}
                              </button>
                           </div>
                           <div className="p-4">
                              {editingExtraLenders ? (
                                 <div className="space-y-3">
                                    <div>
                                       <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Enter extra lenders (one per line or comma-separated)</label>
                                       <textarea
                                          value={extraLenders}
                                          onChange={(e) => setExtraLenders(e.target.value)}
                                          rows={6}
                                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-y min-h-[150px]"
                                          placeholder="Enter lender names here..."
                                       />
                                    </div>
                                    <div className="flex justify-end">
                                       <button
                                          onClick={handleSaveExtraLenders}
                                          className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                       >
                                          Save
                                       </button>
                                    </div>
                                 </div>
                              ) : (
                                 extraLenders ? (
                                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                       {extraLenders}
                                    </div>
                                 ) : (
                                    <p className="text-gray-400 italic text-sm text-center py-4">No extra lenders specified</p>
                                 )
                              )}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Document Checklist */}
                  <div className="mt-6 bg-slate-800 dark:bg-slate-900 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                     <div className="p-6">
                        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 lg:gap-16">
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <span className="text-sm font-bold text-white uppercase tracking-wider">IDENTIFICATION</span>
                              <input
                                 type="checkbox"
                                 checked={documentChecklist.identification}
                                 onChange={(e) => handleDocumentChecklistChange('identification', e.target.checked)}
                                 className="w-5 h-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                           </label>
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <span className="text-sm font-bold text-white uppercase tracking-wider">EXTRA LENDER</span>
                              <input
                                 type="checkbox"
                                 checked={documentChecklist.extraLender}
                                 onChange={(e) => handleDocumentChecklistChange('extraLender', e.target.checked)}
                                 className="w-5 h-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                           </label>
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <span className="text-sm font-bold text-white uppercase tracking-wider">QUESTIONNAIRE</span>
                              <input
                                 type="checkbox"
                                 checked={documentChecklist.questionnaire}
                                 onChange={(e) => handleDocumentChecklistChange('questionnaire', e.target.checked)}
                                 className="w-5 h-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                           </label>
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <span className="text-sm font-bold text-white uppercase tracking-wider">POA</span>
                              <input
                                 type="checkbox"
                                 checked={documentChecklist.poa}
                                 onChange={(e) => handleDocumentChecklistChange('poa', e.target.checked)}
                                 className="w-5 h-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                              />
                           </label>
                        </div>
                     </div>
                  </div>
               </>
            )}

            {/* ==================== CLAIMS TAB ==================== */}
            {activeTab === 'claims' && (
               <div className="space-y-4">
                  {/* CLAIMS LIST VIEW (when not viewing a specific claim) */}
                  {!viewingClaimId && (
                     (() => {
                        // Claims Pagination calculations
                        const totalClaimsPages = Math.ceil(contactClaims.length / claimsPerPage);
                        const startClaimIndex = (currentClaimsPage - 1) * claimsPerPage;
                        const endClaimIndex = startClaimIndex + claimsPerPage;
                        const paginatedClaims = contactClaims.slice(startClaimIndex, endClaimIndex);

                        return (
                           <>
                              {/* Clean Header */}
                              <div className="flex justify-between items-center">
                                 <div className="flex items-center gap-3">
                                    <h2 className="text-lg font-bold text-navy-900 dark:text-white">Active Claims</h2>
                                    <span className="px-2.5 py-1 bg-navy-100 dark:bg-navy-900/50 text-navy-700 dark:text-navy-300 text-xs font-semibold rounded-full">
                                       {contactClaims.length}
                                    </span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <button
                                       onClick={() => setShowAddClaim(true)}
                                       className="text-sm font-medium bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                                    >
                                       <Plus size={16} /> New Claim
                                    </button>
                                 </div>
                              </div>

                              {/* Claims Table */}
                              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                                 {/* Table Header */}
                                 <div className="grid grid-cols-12 gap-4 px-5 py-4 bg-gradient-to-r from-navy-700 to-navy-800 dark:from-navy-800 dark:to-navy-900 text-sm font-bold text-white uppercase tracking-wider">
                                    <div className="col-span-4">Lender</div>
                                    <div className="col-span-2">Reference</div>
                                    <div className="col-span-2">Created</div>
                                    <div className="col-span-2 text-center">Status</div>
                                    <div className="col-span-2 text-right">Action</div>
                                 </div>

                                 {/* Table Body */}
                                 {paginatedClaims.map((claim, index) => (
                                    <div
                                       key={claim.id}
                                       className={`grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors items-center ${index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/80 dark:bg-slate-700/40'}`}
                                    >
                                       <div className="col-span-4">
                                          <button
                                             onClick={() => handleOpenClaimFile(claim.id)}
                                             className="font-semibold text-navy-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 underline cursor-pointer transition-colors text-left"
                                          >
                                             {claim.lender}
                                          </button>
                                       </div>
                                       <div className="col-span-2">
                                          <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                                             {claim.caseNumber || claim.id}
                                          </span>
                                       </div>
                                       <div className="col-span-2">
                                          <span className="text-sm text-gray-500 dark:text-gray-400">
                                             {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                          </span>
                                       </div>
                                       <div className="col-span-2 flex justify-center">
                                          <span
                                             className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                                             style={{ backgroundColor: `${getSpecStatusColor(claim.status)}15`, color: getSpecStatusColor(claim.status) }}
                                          >
                                             <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: getSpecStatusColor(claim.status) }}></span>
                                             {claim.status}
                                          </span>
                                       </div>
                                       <div className="col-span-2 flex justify-end">
                                          <button
                                             onClick={() => handleOpenClaimFile(claim.id)}
                                             className="px-4 py-1.5 text-sm font-medium bg-navy-600 hover:bg-navy-700 text-white rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 dark:bg-navy-500 dark:hover:bg-navy-600"
                                          >
                                             Open File <ArrowLeft size={14} className="rotate-180" />
                                          </button>
                                       </div>
                                    </div>
                                 ))}

                                 {contactClaims.length === 0 && (
                                    <div className="text-center py-12">
                                       <Briefcase size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                       <p className="text-gray-500 dark:text-gray-400 mb-3">No claims yet</p>
                                       <button
                                          onClick={() => setShowAddClaim(true)}
                                          className="text-sm font-medium text-navy-600 hover:text-navy-800 dark:text-navy-400"
                                       >
                                          + Add first claim
                                       </button>
                                    </div>
                                 )}

                                 {/* Claims Pagination Controls */}
                                 {contactClaims.length > 0 && (
                                    <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                                       <div className="flex items-center gap-3">
                                          <span className="text-xs text-gray-500 dark:text-gray-400">
                                             Showing {startClaimIndex + 1}-{Math.min(endClaimIndex, contactClaims.length)} of {contactClaims.length}
                                          </span>
                                          <span className="text-gray-300 dark:text-gray-600">|</span>
                                          <div className="flex items-center gap-1.5">
                                             <span className="text-xs text-gray-500 dark:text-gray-400">Show:</span>
                                             <select
                                                value={claimsPerPage}
                                                onChange={(e) => {
                                                   setClaimsPerPage(Number(e.target.value));
                                                   setCurrentClaimsPage(1);
                                                }}
                                                className="px-1.5 py-0.5 border border-gray-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                             >
                                                <option value={20}>20</option>
                                                <option value={30}>30</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                             </select>
                                          </div>
                                       </div>
                                       <div className="flex items-center">
                                          <button
                                             onClick={() => setCurrentClaimsPage(prev => Math.max(prev - 1, 1))}
                                             disabled={currentClaimsPage === 1}
                                             className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                          >
                                             Previous
                                          </button>
                                          <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                                             {currentClaimsPage} / {totalClaimsPages || 1}
                                          </span>
                                          <button
                                             onClick={() => setCurrentClaimsPage(prev => Math.min(prev + 1, totalClaimsPages))}
                                             disabled={currentClaimsPage === totalClaimsPages || totalClaimsPages === 0}
                                             className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                          >
                                             Next
                                          </button>
                                       </div>
                                    </div>
                                 )}
                              </div>
                           </>
                        );
                     })()
                  )}

                  {/* INDIVIDUAL CLAIM FILE VIEW - Following crm-claim-spec.md */}
                  {viewingClaimId && (
                     <div className="space-y-6">
                        {/* Header with Back, Save, Delete */}
                        <div className="flex items-center justify-between border-b border-gray-300 dark:border-slate-700 pb-4">
                           <button
                              onClick={handleCloseClaimFile}
                              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-navy-700 dark:hover:text-white transition-colors"
                           >
                              <ArrowLeft size={16} /> Back to Claims
                           </button>
                           <div className="flex items-center gap-3">
                              {/* Autosave indicator */}
                              {claimAutoSaveStatus === 'saved' && (
                                 <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Check size={12} /> Auto-saved
                                 </span>
                              )}
                              {claimAutoSaveStatus === 'saving' && (
                                 <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <RotateCcw size={12} className="animate-spin" /> Saving...
                                 </span>
                              )}
                              <button
                                 onClick={handleSaveClaimFile}
                                 disabled={claimFileSaving}
                                 className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                              >
                                 {claimFileSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                 onClick={() => setShowDeleteClaimConfirm(true)}
                                 className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium dark:bg-red-900/20 dark:hover:bg-red-900/30"
                              >
                                 Delete Claim
                              </button>
                           </div>
                        </div>

                        {/* ==================== CLAIM STAGE PIPELINE INDICATOR (Arrow Shape - Read Only) ==================== */}
                        {(() => {
                           // Get the actual claim status from the claims list (this is what's shown in the Pipeline)
                           const currentClaim = claims.find(c => c.id === viewingClaimId);
                           const actualClaimStatus = currentClaim?.status || '';

                           // Complete 48-status pipeline organized by category (matching the status dropdown)
                           const claimStages = [
                              {
                                 id: 'lead-generation',
                                 label: 'Lead Generation',
                                 color: '#22c55e', // green
                                 statuses: ['New Lead', 'Contact Attempted', 'In Conversation', 'Qualification Call', 'Qualified Lead', 'Not Qualified']
                              },
                              {
                                 id: 'onboarding',
                                 label: 'Onboarding',
                                 color: '#a855f7', // purple
                                 statuses: ['Onboarding Started', 'ID Verification Pending', 'ID Verification Complete', 'POA Required', 'Questionnaire Sent', 'Questionnaire Complete', 'LOA Sent', 'LOA Uploaded', 'LOA Signed', 'Bank Statements Requested', 'Lender Selection Form Completed', 'Bank Statements Received', 'Onboarding Complete']
                              },
                              {
                                 id: 'dsar-process',
                                 label: 'DSAR Process',
                                 color: '#ec4899', // pink
                                 statuses: ['DSAR Prepared', 'DSAR Sent to Lender', 'DSAR Acknowledged', 'DSAR Follow-up Sent', 'DSAR Response Received', 'DSAR Escalated (ICO)', 'Data Analysis']
                              },
                              {
                                 id: 'complaint',
                                 label: 'Complaint',
                                 color: '#f97316', // orange
                                 statuses: ['Complaint Drafted', 'Client Review', 'Complaint Approved', 'Complaint Submitted', 'Complaint Acknowledged', 'Awaiting Response', 'Response Received', 'Response Under Review']
                              },
                              {
                                 id: 'fos-escalation',
                                 label: 'FOS Escalation',
                                 color: '#14b8a6', // teal
                                 statuses: ['FOS Referral Prepared', 'FOS Submitted', 'FOS Case Number Received', 'FOS Investigation', 'FOS Provisional Decision', 'FOS Final Decision', 'FOS Appeal']
                              },
                              {
                                 id: 'payments',
                                 label: 'Payments',
                                 color: '#10b981', // emerald green
                                 statuses: ['Offer Received', 'Offer Under Negotiation', 'Offer Accepted', 'Awaiting Payment', 'Payment Received', 'Fee Deducted', 'Client Paid', 'Claim Successful', 'Claim Unsuccessful', 'Claim Withdrawn']
                              }
                           ];

                           // Find which stage the current claim status belongs to
                           const currentStageIndex = claimStages.findIndex(stage =>
                              stage.statuses.includes(actualClaimStatus)
                           );

                           return (
                              <div className="flex items-center select-none bg-gradient-to-r from-slate-100 via-white to-slate-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 rounded-xl p-3 shadow-inner border border-slate-200 dark:border-slate-600">
                                 {claimStages.map((stage, index) => {
                                    const isActive = index === currentStageIndex;
                                    const isPast = index < currentStageIndex;
                                    const isFirst = index === 0;
                                    const isLast = index === claimStages.length - 1;

                                    return (
                                       <div
                                          key={stage.id}
                                          className="relative flex-1"
                                          style={{
                                             marginLeft: index > 0 ? '-8px' : '0',
                                             zIndex: isActive ? 10 : claimStages.length - index
                                          }}
                                       >
                                          {/* Arrow shape */}
                                          <div
                                             className="relative transition-all duration-300"
                                             style={{
                                                height: isActive ? '58px' : '46px',
                                                marginTop: isActive ? '0' : '6px',
                                                marginBottom: isActive ? '0' : '6px',
                                                filter: isActive ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))' : 'none',
                                                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                             }}
                                          >
                                             {/* Main arrow body with gradient */}
                                             <div
                                                className="absolute inset-0 transition-all duration-300"
                                                style={{
                                                   background: isActive
                                                      ? `linear-gradient(180deg, ${stage.color} 0%, ${stage.color}ee 100%)`
                                                      : `linear-gradient(180deg, ${stage.color}90 0%, ${stage.color}70 100%)`,
                                                   clipPath: isFirst
                                                      ? 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)'
                                                      : isLast
                                                         ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 16px 50%)'
                                                         : 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)',
                                                   filter: isActive ? 'saturate(1.2) brightness(1.05)' : 'saturate(0.7)',
                                                }}
                                             />
                                             {/* Label */}
                                             <div
                                                className="absolute inset-0 flex flex-col items-center justify-center px-2"
                                                style={{ paddingLeft: isFirst ? '8px' : '20px', paddingRight: isLast ? '8px' : '20px' }}
                                             >
                                                <span
                                                   className={`font-bold truncate text-center transition-all duration-300 text-white ${isActive ? 'text-[13px]' : 'text-[11px]'}`}
                                                   style={{
                                                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                                      maxWidth: '100%'
                                                   }}
                                                >
                                                   {stage.label}
                                                </span>
                                                {isActive && (
                                                   <span
                                                      className="text-[10px] text-white/95 mt-1 truncate text-center font-semibold bg-black/25 px-2 py-0.5 rounded-full backdrop-blur-sm"
                                                      style={{ maxWidth: '100%' }}
                                                   >
                                                      {actualClaimStatus}
                                                   </span>
                                                )}
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           );
                        })()}

                        {/* Lender and Status - Above Sections */}
                        <div className="grid grid-cols-2 gap-4 mt-4">
                           {/* Lender Box */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
                              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Lender</label>
                              <div className="w-full px-3 py-2.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-semibold bg-gray-50 dark:bg-slate-600 text-gray-900 dark:text-white flex items-center justify-between">
                                 <span>{claimFileForm.lender || 'No Lender'}</span>
                                 <Lock size={14} className="text-gray-400" />
                              </div>
                           </div>

                           {/* Status Box */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
                              {(() => {
                                 const currentClaim = claims.find(c => c.id === viewingClaimId);
                                 // Use claimFileData (fetched full claim) as fallback when claim not in local state
                                 const actualClaimStatus = currentClaim?.status || claimFileData?.status || '';
                                 const categoryColors: Record<string, string> = {
                                    'lead-generation': '#3B82F6',
                                    'onboarding': '#9C27B0',
                                    'dsar-process': '#FF9800',
                                    'complaint': '#F06292',
                                    'fos-escalation': '#EF5350',
                                    'payments': '#4CAF50'
                                 };
                                 const pipelineStages = PIPELINE_CATEGORIES.map(cat => ({
                                    id: cat.id,
                                    label: cat.title,
                                    color: categoryColors[cat.id] || '#6b7280',
                                    statuses: cat.statuses as string[]
                                 }));
                                 const currentStage = pipelineStages.find(stage =>
                                    stage.statuses.includes(actualClaimStatus)
                                 );
                                 const stageColor = currentStage ? currentStage.color : '#6b7280';

                                 return (
                                    <>
                                       <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                                          Status
                                          {currentStage && (
                                             <span
                                                className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                                                style={{ backgroundColor: stageColor }}
                                             >
                                                {currentStage.label.split(' ')[0]}
                                             </span>
                                          )}
                                       </label>
                                       <select
                                          value={actualClaimStatus}
                                          onChange={(e) => {
                                             const newStatus = e.target.value;
                                             // Update local state immediately (optimistic update)
                                             if (claimFileData) {
                                                setClaimFileData({ ...claimFileData, status: newStatus });
                                             }
                                             // Update claims array immediately
                                             if (currentClaim) {
                                                updateClaim({ ...currentClaim, status: newStatus as any });
                                             }
                                             // Save to database in background
                                             if (viewingClaimId) {
                                                fetch(`/api/cases/${viewingClaimId}`, {
                                                   method: 'PATCH',
                                                   headers: { 'Content-Type': 'application/json' },
                                                   body: JSON.stringify({ status: newStatus })
                                                }).catch(err => console.error('Failed to save status:', err));
                                             }
                                          }}
                                          className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-slate-500 rounded-lg text-sm font-semibold bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                          style={{ borderLeftWidth: '4px', borderLeftColor: stageColor }}
                                       >
                                          {/* Show current status if not in pipeline stages */}
                                          {actualClaimStatus && !pipelineStages.some(s => s.statuses.includes(actualClaimStatus)) && (
                                             <option value={actualClaimStatus}>{actualClaimStatus}</option>
                                          )}
                                          {pipelineStages.map(stage => (
                                             <optgroup key={stage.id} label={stage.label}>
                                                {stage.statuses.map(status => (
                                                   <option key={status} value={status}>{status}</option>
                                                ))}
                                             </optgroup>
                                          ))}
                                       </select>
                                       <p className="text-[10px] text-gray-400 mt-1">
                                          Showing all {pipelineStages.reduce((sum, stage) => sum + stage.statuses.length, 0)} statuses
                                       </p>
                                    </>
                                 );
                              })()}
                           </div>
                        </div>

                        {/* Sections Container with darker background for depth */}
                        <div className="bg-slate-200 dark:bg-slate-950 rounded-xl p-5 space-y-5 mt-4">

                           {/* ==================== SECTION 1: CLAIM DETAILS ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-blue-200 dark:border-blue-900 overflow-hidden">
                              <button
                                 onClick={() => setExpandedClaimSection(expandedClaimSection === 'details' ? null : 'details')}
                                 className={`w-full p-4 flex justify-between items-center transition-all duration-200 ${expandedClaimSection === 'details'
                                       ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                                       : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600'
                                    }`}
                              >
                                 <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
                                    <span className="w-2 h-2 bg-white rounded-full"></span>
                                    Claim Details
                                 </h3>
                                 <ChevronDown size={22} className={`text-white transition-transform duration-300 ${expandedClaimSection === 'details' ? 'rotate-180' : ''}`} />
                              </button>

                              {expandedClaimSection === 'details' && (
                                 <div className="p-5 border-t-2 border-blue-200 dark:border-blue-900">
                                    {/* Custom styles for claim form - shorter inputs, bolder fonts, darker placeholders, bigger labels */}
                                    <style>{`
                              .claim-input {
                                 max-width: 280px !important;
                                 font-weight: 600 !important;
                              }
                              .claim-input::placeholder {
                                 color: #6b7280 !important;
                                 font-weight: 500 !important;
                              }
                              .claim-label {
                                 font-size: 0.875rem !important;
                                 font-weight: 700 !important;
                                 color: #1f2937 !important;
                                 margin-bottom: 0.5rem !important;
                              }
                              .dark .claim-label {
                                 color: #f3f4f6 !important;
                              }
                              .dark .claim-input::placeholder {
                                 color: #9ca3af !important;
                              }
                           `}</style>

                                    {/* All fields in SINGLE COLUMN layout as per spec */}
                                    <div className="space-y-4">
                                       {/* Type of Finance - Multi-Select Dropdown */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 text-center">Type of Finance (Multi-Select)</label>
                                          <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-700">
                                             <div className="flex flex-wrap gap-2 mb-2">
                                                {claimFileForm.financeTypes.map((ft, idx) => (
                                                   <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                                      {ft.financeType}
                                                      <button
                                                         onClick={() => {
                                                            const updated = claimFileForm.financeTypes.filter((_, i) => i !== idx);
                                                            setClaimFileForm({ ...claimFileForm, financeTypes: updated });
                                                         }}
                                                         className="hover:text-red-500"
                                                      >
                                                         <X size={12} />
                                                      </button>
                                                   </span>
                                                ))}
                                                {claimFileForm.financeTypes.length === 0 && (
                                                   <span className="text-xs text-gray-400">No finance types selected</span>
                                                )}
                                             </div>
                                             <select
                                                value=""
                                                onChange={(e) => {
                                                   if (e.target.value && !claimFileForm.financeTypes.find(ft => ft.financeType === e.target.value)) {
                                                      setClaimFileForm({
                                                         ...claimFileForm,
                                                         financeTypes: [...claimFileForm.financeTypes, { financeType: e.target.value, accountNumber: '' }]
                                                      });
                                                   }
                                                }}
                                                className="w-full px-2 py-1 border border-gray-200 dark:border-slate-600 rounded text-sm bg-gray-50 dark:bg-slate-600 text-gray-900 dark:text-white"
                                             >
                                                <option value="">+ Add Finance Type...</option>
                                                {FINANCE_TYPES.filter(type => !claimFileForm.financeTypes.find(ft => ft.financeType === type)).map(type => (
                                                   <option key={type} value={type}>{type}</option>
                                                ))}
                                             </select>
                                          </div>
                                          <p className="text-xs text-gray-400 mt-1">Select multiple finance types.</p>
                                       </div>

                                       {/* Selected Finance Types Display */}
                                       {claimFileForm.financeTypes.length > 0 && (
                                          <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-800 space-y-2">
                                             <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Selected Finance Types</p>
                                             {claimFileForm.financeTypes.map((ft, idx) => (
                                                <div key={idx} className="py-2">
                                                   <span className="text-lg font-bold text-gray-900 dark:text-white">{ft.financeType}</span>
                                                </div>
                                             ))}
                                          </div>
                                       )}

                                       {/* No of Loans - Dropdown 1-50 */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">No of Loans</label>
                                          <select
                                             value={claimFileForm.numberOfLoans}
                                             onChange={(e) => {
                                                const numLoans = parseInt(e.target.value) || 1;
                                                const currentLoans = claimFileForm.loanDetails || [];
                                                let newLoanDetails: LoanDetails[] = [];

                                                for (let i = 1; i <= numLoans; i++) {
                                                   if (currentLoans[i - 1]) {
                                                      newLoanDetails.push({ ...currentLoans[i - 1], loanNumber: i });
                                                   } else {
                                                      newLoanDetails.push({ loanNumber: i, accountNumber: '', valueOfLoan: '', startDate: '', endDate: '', apr: '', billedInterestCharges: '', latePaymentCharges: '', overlimitCharges: '' });
                                                   }
                                                }

                                                setClaimFileForm({ ...claimFileForm, numberOfLoans: e.target.value, loanDetails: newLoanDetails });
                                             }}
                                             className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          >
                                             {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                                                <option key={num} value={num}>{num}</option>
                                             ))}
                                          </select>
                                          <p className="text-xs text-gray-400 mt-1">Selecting a number generates loan detail fields below.</p>
                                       </div>

                                       {/* Dynamic Loan Details (EF fields) - Generated based on No of Loans */}
                                       {claimFileForm.loanDetails && claimFileForm.loanDetails.length > 0 && (
                                          <div className="pl-4 border-l-4 border-blue-400 dark:border-blue-600 space-y-4">
                                             <p className="text-sm font-bold text-blue-600 dark:text-blue-400">Loan Details (per Loan)</p>
                                             {claimFileForm.loanDetails.map((loan, idx) => (
                                                <div key={idx} className="bg-gray-200 dark:bg-slate-600 rounded-lg p-4 space-y-4 border border-gray-300 dark:border-slate-500 shadow-sm">
                                                   <h4 className="text-base font-bold text-gray-800 dark:text-gray-200">Loan {loan.loanNumber}</h4>
                                                   <div className="space-y-4">
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Account Number</label>
                                                         <input
                                                            type="text"
                                                            value={loan.accountNumber || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], accountNumber: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                            placeholder="Enter account number"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Value of Loan</label>
                                                         <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                                            <input
                                                               type="text"
                                                               value={loan.valueOfLoan || ''}
                                                               onChange={(e) => {
                                                                  const updated = [...claimFileForm.loanDetails];
                                                                  updated[idx] = { ...updated[idx], valueOfLoan: e.target.value };
                                                                  setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                               }}
                                                               className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                               placeholder="0"
                                                            />
                                                         </div>
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Start Date</label>
                                                         <input
                                                            type="date"
                                                            value={loan.startDate || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], startDate: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-semibold"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">End Date</label>
                                                         <input
                                                            type="date"
                                                            value={loan.endDate || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], endDate: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-semibold"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">APR (%)</label>
                                                         <input
                                                            type="text"
                                                            value={loan.apr || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], apr: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                            placeholder="0"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Billed/Interest Charges</label>
                                                         <input
                                                            type="text"
                                                            value={loan.billedInterestCharges || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], billedInterestCharges: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                            placeholder="0"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Late Payment Charges</label>
                                                         <input
                                                            type="text"
                                                            value={loan.latePaymentCharges || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], latePaymentCharges: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                            placeholder="0"
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Overlimit Charges</label>
                                                         <input
                                                            type="text"
                                                            value={loan.overlimitCharges || ''}
                                                            onChange={(e) => {
                                                               const updated = [...claimFileForm.loanDetails];
                                                               updated[idx] = { ...updated[idx], overlimitCharges: e.target.value };
                                                               setClaimFileForm({ ...claimFileForm, loanDetails: updated });
                                                            }}
                                                            className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                            placeholder="0"
                                                         />
                                                      </div>
                                                   </div>
                                                </div>
                                             ))}
                                          </div>
                                       )}

                                       {/* Total Amount of Debt */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Total Amount of Debt</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.totalAmountOfDebt || ''}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, totalAmountOfDebt: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Claim Value */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Claim Value</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.claimValue || ''}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, claimValue: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Credit Limit & Increases - Large Text Field */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Credit Limit & Increases</label>
                                          <textarea
                                             value={claimFileForm.creditLimitIncreases}
                                             onChange={(e) => setClaimFileForm({ ...claimFileForm, creditLimitIncreases: e.target.value })}
                                             rows={4}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                                             placeholder="Enter credit limit history and any increases..."
                                          />
                                       </div>

                                       {/* DSAR Review - Large Text Field */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">DSAR Review</label>
                                          <textarea
                                             value={claimFileForm.dsarReview}
                                             onChange={(e) => setClaimFileForm({ ...claimFileForm, dsarReview: e.target.value })}
                                             rows={6}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                                             placeholder="Enter DSAR analysis notes..."
                                          />
                                       </div>

                                       {/* Complaint Paragraph - Large Text Field */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Complaint Paragraph</label>
                                          <textarea
                                             value={claimFileForm.complaintParagraph}
                                             onChange={(e) => setClaimFileForm({ ...claimFileForm, complaintParagraph: e.target.value })}
                                             rows={6}
                                             className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                                             placeholder="Enter complaint narrative..."
                                          />
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>

                           {/* ==================== SECTION 2: PAYMENT SECTION ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-emerald-200 dark:border-emerald-900 overflow-hidden">
                              <button
                                 onClick={() => setExpandedClaimSection(expandedClaimSection === 'payment' ? null : 'payment')}
                                 className={`w-full p-4 flex justify-between items-center transition-all duration-200 ${expandedClaimSection === 'payment'
                                       ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                                       : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600'
                                    }`}
                              >
                                 <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
                                    <span className="w-2 h-2 bg-white rounded-full"></span>
                                    Payment
                                 </h3>
                                 <ChevronDown size={22} className={`text-white transition-transform duration-300 ${expandedClaimSection === 'payment' ? 'rotate-180' : ''}`} />
                              </button>

                              {expandedClaimSection === 'payment' && (
                                 <div className="p-5 border-t-2 border-emerald-200 dark:border-emerald-900">

                                    <div className="space-y-4">
                                       {/* Offer Made */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Offer Made</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.offerMade}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, offerMade: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Fee (%) */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Fee (%)</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">%</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.feePercent}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, feePercent: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Total Refund */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Total Refund</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.totalRefund}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, totalRefund: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Total Debt */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Total Debt</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.totalDebt}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, totalDebt: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Balance Due to Client */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Balance Due to Client</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.balanceDueToClient}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, balanceDueToClient: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Our Fees + VAT */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Our Fees + VAT</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.ourFeesPlusVat}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, ourFeesPlusVat: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Our Fees - VAT */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Our Fees - VAT</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.ourFeesMinusVat}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, ourFeesMinusVat: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* VAT */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">VAT</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.vatAmount}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, vatAmount: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Total Fee */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Total Fee</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.totalFee}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, totalFee: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Outstanding Debt */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Outstanding Debt</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.outstandingDebt}
                                                onChange={(e) => setClaimFileForm({ ...claimFileForm, outstandingDebt: e.target.value })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>

                           {/* ==================== SECTION 3: PAYMENT PLAN ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-purple-200 dark:border-purple-900 overflow-hidden">
                              <button
                                 onClick={() => setExpandedClaimSection(expandedClaimSection === 'paymentPlan' ? null : 'paymentPlan')}
                                 className={`w-full p-4 flex justify-between items-center transition-all duration-200 ${expandedClaimSection === 'paymentPlan'
                                       ? 'bg-gradient-to-r from-purple-600 to-violet-600'
                                       : 'bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600'
                                    }`}
                              >
                                 <h3 className="text-lg font-bold text-white uppercase tracking-wide flex items-center gap-2">
                                    <span className="w-2 h-2 bg-white rounded-full"></span>
                                    Payment Plan
                                 </h3>
                                 <ChevronDown size={22} className={`text-white transition-transform duration-300 ${expandedClaimSection === 'paymentPlan' ? 'rotate-180' : ''}`} />
                              </button>

                              {expandedClaimSection === 'paymentPlan' && (
                                 <div className="p-5 border-t-2 border-purple-200 dark:border-purple-900">
                                    <div className="space-y-4">
                                       {/* Client Outstanding Fees */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Client Outstanding Fees</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.paymentPlan.clientOutstandingFees}
                                                onChange={(e) => setClaimFileForm({
                                                   ...claimFileForm,
                                                   paymentPlan: { ...claimFileForm.paymentPlan, clientOutstandingFees: e.target.value }
                                                })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Payment Plan Status */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Payment Plan</label>
                                          <select
                                             value={claimFileForm.paymentPlan.planStatus}
                                             onChange={(e) => setClaimFileForm({
                                                ...claimFileForm,
                                                paymentPlan: { ...claimFileForm.paymentPlan, planStatus: e.target.value as PaymentPlan['planStatus'] }
                                             })}
                                             className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          >
                                             <option value="">Select Status...</option>
                                             <option value="Plan Set Up">Plan Set Up</option>
                                             <option value="Missed Payment">Missed Payment</option>
                                             <option value="Not Set Up">Not Set Up</option>
                                             <option value="Settled">Settled</option>
                                          </select>
                                       </div>

                                       {/* Plan Date */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Plan Date</label>
                                          <input
                                             type="date"
                                             value={claimFileForm.paymentPlan.planDate}
                                             onChange={(e) => setClaimFileForm({
                                                ...claimFileForm,
                                                paymentPlan: { ...claimFileForm.paymentPlan, planDate: e.target.value }
                                             })}
                                             className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-semibold"
                                          />
                                       </div>

                                       {/* Term of the Plan */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Term of the Plan</label>
                                          <input
                                             type="text"
                                             value={claimFileForm.paymentPlan.termOfPlan}
                                             onChange={(e) => setClaimFileForm({
                                                ...claimFileForm,
                                                paymentPlan: { ...claimFileForm.paymentPlan, termOfPlan: e.target.value }
                                             })}
                                             className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                             placeholder="e.g., 12 months"
                                          />
                                       </div>

                                       {/* Start Date */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Start Date</label>
                                          <input
                                             type="date"
                                             value={claimFileForm.paymentPlan.startDate}
                                             onChange={(e) => setClaimFileForm({
                                                ...claimFileForm,
                                                paymentPlan: { ...claimFileForm.paymentPlan, startDate: e.target.value }
                                             })}
                                             className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-semibold"
                                          />
                                       </div>

                                       {/* Remaining Balance */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Remaining Balance</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.paymentPlan.remainingBalance}
                                                onChange={(e) => setClaimFileForm({
                                                   ...claimFileForm,
                                                   paymentPlan: { ...claimFileForm.paymentPlan, remainingBalance: e.target.value }
                                                })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>

                                       {/* Monthly Payment Agreed */}
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Monthly Payment Agreed</label>
                                          <div className="flex items-center gap-2">
                                             <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                             <input
                                                type="text"
                                                value={claimFileForm.paymentPlan.monthlyPaymentAgreed || ''}
                                                onChange={(e) => setClaimFileForm({
                                                   ...claimFileForm,
                                                   paymentPlan: { ...claimFileForm.paymentPlan, monthlyPaymentAgreed: e.target.value }
                                                })}
                                                className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                                placeholder="0"
                                             />
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>

                           {/* ==================== CLAIM DOCUMENTS SECTION ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-300 dark:border-slate-600 p-5">
                              <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide">Claim Documents</h3>
                                 <div className="flex items-center gap-3">
                                    <button
                                       onClick={() => { setClaimNoteLender(claimFileForm.lender); setClaimNoteContent(''); setShowClaimNoteModal(true); }}
                                       className="text-xs font-medium text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                                    >
                                       <Plus size={14} /> Add Note
                                    </button>
                                    <button
                                       onClick={() => setShowClaimDocUpload(true)}
                                       className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                       <Plus size={14} /> Upload Document
                                    </button>
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 {(() => {
                                    const currentLender = claimFileForm.lender;
                                    const currentCaseId = viewingClaimId;
                                    const contactId = contact?.id;
                                    // refSpec pattern: {contactId}{caseId} - used in generated document filenames
                                    const refSpec = contactId && currentCaseId ? `${contactId}${currentCaseId}` : null;
                                    const sanitizedLender = currentLender?.replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase() || '';

                                    const filteredClaimsDocs = contactDocs.filter(doc => {
                                       const tags = doc.tags || [];
                                       const lenderLower = currentLender?.toLowerCase() || '';
                                       const category = doc.category?.toLowerCase() || '';

                                       // Exclude "Other" category unless it's a claim-document
                                       const isClaimDoc = tags.some(t => t === 'claim-document');
                                       if (category === 'other' && !isClaimDoc) return false;

                                       // 1. Best match: document filename starts with refSpec (contactId+caseId)
                                       if (refSpec && doc.name.startsWith(refSpec)) return true;

                                       // 2. Match by lender tag (exact match only)
                                       const matchesTag = tags.some(t => t.toLowerCase() === lenderLower);

                                       // 3. Match by sanitized lender name in filename (e.g. "VANQUIS" in "- VANQUIS -")
                                       const matchesLenderInName = sanitizedLender && doc.name.toUpperCase().includes(` - ${sanitizedLender} - `);

                                       // 4. For uploaded claim docs (Bank Statement etc), match by lender tag only
                                       return matchesTag || (matchesLenderInName && !refSpec);
                                    });

                                    return filteredClaimsDocs.length > 0 ? (
                                       filteredClaimsDocs.map((doc) => (
                                          <div key={doc.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                             <div className="flex items-center gap-3">
                                                <FileIcon size={16} className="text-gray-400" />
                                                <div>
                                                   <p className="text-sm font-medium text-gray-900 dark:text-white">{doc.name}</p>
                                                   <p className="text-xs text-gray-500 dark:text-gray-400">
                                                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB') : 'No date'} - {doc.category || 'Uncategorized'}
                                                   </p>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-2">
                                                <button
                                                   onClick={() => {
                                                      setDocToDelete({ id: doc.id, name: doc.name });
                                                      setShowDeleteDocConfirm(true);
                                                   }}
                                                   className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                                >
                                                   Delete
                                                </button>
                                                <button
                                                   onClick={() => handleDocumentPreview(doc)}
                                                   className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                   View
                                                </button>
                                             </div>
                                          </div>
                                       ))
                                    ) : (
                                       <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 dark:border-slate-600 rounded-lg">
                                          <FileIcon size={24} className="mx-auto mb-2 opacity-50" />
                                          <p className="text-sm">No {currentLender} documents found</p>
                                       </div>
                                    );
                                 })()}
                              </div>
                           </div>

                        </div>{/* End of Sections Container */}

                        {/* Delete Confirmation Modal */}
                        {showDeleteClaimConfirm && (
                           <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4 relative">
                                 {/* Deleting Progress Overlay */}
                                 {isDeletingClaim && (
                                    <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                                       <div className="relative w-24 h-24">
                                          <svg className="w-full h-full transform -rotate-90">
                                             <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                                             <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                                strokeDasharray={251.2}
                                                strokeDashoffset={251.2 - (251.2 * deleteProgress) / 100}
                                                className="text-red-500 transition-all duration-300 ease-out"
                                                strokeLinecap="round"
                                             />
                                          </svg>
                                          <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-red-600 dark:text-red-400">
                                             {Math.round(deleteProgress)}%
                                          </div>
                                       </div>
                                       <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                                          {deleteProgress < 100 ? 'Deleting claim & cleaning up files...' : 'Done!'}
                                       </p>
                                    </div>
                                 )}
                                 <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                       <AlertTriangle size={20} className="text-red-600" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Claim?</h3>
                                 </div>
                                 <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                                    Are you sure you want to delete this claim? This action cannot be undone.
                                 </p>
                                 <div className="flex justify-end gap-3">
                                    <button
                                       onClick={() => setShowDeleteClaimConfirm(false)}
                                       className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                                       disabled={isDeletingClaim}
                                    >
                                       Cancel
                                    </button>
                                    <button
                                       onClick={handleDeleteClaim}
                                       className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                       disabled={isDeletingClaim}
                                    >
                                       {isDeletingClaim && <Loader2 size={14} className="animate-spin" />}
                                       {isDeletingClaim ? 'Deleting...' : 'Delete Claim'}
                                    </button>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* Claim Document Upload Modal */}
                        {showClaimDocUpload && (
                           <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4 relative">
                                 {/* Upload Progress Overlay */}
                                 {isUploadingClaimDoc && (
                                    <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                                       <div className="relative w-24 h-24">
                                          <svg className="w-full h-full transform -rotate-90">
                                             <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                                             <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                                strokeDasharray={251.2}
                                                strokeDashoffset={251.2 - (251.2 * claimDocUploadProgress) / 100}
                                                className="text-blue-500 transition-all duration-300 ease-out"
                                                strokeLinecap="round"
                                             />
                                          </svg>
                                          <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
                                             {Math.round(claimDocUploadProgress)}%
                                          </div>
                                       </div>
                                       <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                                          {claimDocUploadProgress < 100 ? 'Uploading document...' : 'Processing...'}
                                       </p>
                                    </div>
                                 )}
                                 <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Upload Document</h3>
                                    <button onClick={() => !isUploadingClaimDoc && setShowClaimDocUpload(false)} className="text-gray-400 hover:text-gray-600" disabled={isUploadingClaimDoc}>
                                       <X size={20} />
                                    </button>
                                 </div>
                                 <div className="space-y-4">
                                    <div>
                                       <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Document Category</label>
                                       <select
                                          value={claimDocCategory}
                                          onChange={(e) => setClaimDocCategory(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          disabled={isUploadingClaimDoc}
                                       >
                                          {DOCUMENT_CATEGORIES.map(cat => (
                                             <option key={cat} value={cat}>{cat}</option>
                                          ))}
                                       </select>
                                    </div>
                                    <div>
                                       <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Select File</label>
                                       <input
                                          type="file"
                                          onChange={(e) => setClaimDocFile(e.target.files?.[0] || null)}
                                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          disabled={isUploadingClaimDoc}
                                       />
                                    </div>
                                    {claimDocFile && (
                                       <p className="text-xs text-gray-500">Selected: {claimDocFile.name}</p>
                                    )}
                                 </div>
                                 <div className="flex justify-end gap-3 mt-6">
                                    <button
                                       onClick={() => setShowClaimDocUpload(false)}
                                       className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                                       disabled={isUploadingClaimDoc}
                                    >
                                       Cancel
                                    </button>
                                    <button
                                       onClick={handleClaimDocUpload}
                                       disabled={!claimDocFile || isUploadingClaimDoc}
                                       className="px-4 py-2 text-sm font-medium text-white bg-navy-700 hover:bg-navy-800 rounded-lg disabled:opacity-50"
                                    >
                                       {isUploadingClaimDoc ? 'Uploading...' : 'Upload'}
                                    </button>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            )}

            {/* ==================== COMMUNICATION TAB ==================== */}
            {activeTab === 'communication' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Communication History</h2>
                     <select
                        value={communicationFilter}
                        onChange={(e) => setCommunicationFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                     >
                        <option value="all">All Communications</option>
                        <option value="email">Email Only</option>
                        <option value="sms">SMS Only</option>
                        <option value="whatsapp">WhatsApp Only</option>
                        <option value="call">Calls Only</option>
                        <option value="inbound">Inbound Only</option>
                        <option value="outbound">Outbound Only</option>
                     </select>
                  </div>

                  <div className="space-y-3">
                     {filteredCommunications.map((comm) => (
                        <div key={comm.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4">
                           <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${comm.channel === 'email' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' :
                                 comm.channel === 'sms' ? 'bg-green-50 dark:bg-green-900/30 text-green-600' :
                                    comm.channel === 'whatsapp' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                                       'bg-purple-50 dark:bg-purple-900/30 text-purple-600'
                                 }`}>
                                 {comm.channel === 'email' ? <MailIcon size={18} /> :
                                    comm.channel === 'sms' ? <MessageIcon size={18} /> :
                                       comm.channel === 'whatsapp' ? <MessageIcon size={18} /> :
                                          <PhoneIcon size={18} />}
                              </div>
                              <div className="flex-1">
                                 <div className="flex justify-between items-start">
                                    <div>
                                       <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                                          {comm.channel} - {comm.direction}
                                       </p>
                                       {comm.subject && <p className="text-xs text-gray-500 dark:text-gray-400">Subject: {comm.subject}</p>}
                                    </div>
                                    <span className="text-xs text-gray-400">{formatTimeAgo(comm.timestamp)}</span>
                                 </div>
                                 <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{comm.content}</p>
                                 {comm.channel === 'call' && comm.callDurationSeconds && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                       Duration: {Math.floor(comm.callDurationSeconds / 60)}m {comm.callDurationSeconds % 60}s
                                    </p>
                                 )}
                                 {comm.agentName && (
                                    <p className="text-xs text-gray-400 mt-2">Agent: {comm.agentName}</p>
                                 )}
                              </div>
                           </div>
                        </div>
                     ))}

                     {filteredCommunications.length === 0 && (
                        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                           <MessageIcon size={48} className="mx-auto mb-3 opacity-20" />
                           <p>No communications found.</p>
                        </div>
                     )}
                  </div>
               </div>
            )}

            {/* ==================== SUB WORKFLOW TAB ==================== */}
            {activeTab === 'subworkflow' && (
               <div className="space-y-6">
                  {/* Trigger New Workflow */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                     <h3 className="font-bold text-navy-900 dark:text-white text-sm mb-4">Trigger Chase Workflow</h3>
                     <div className="flex gap-4">
                        <select
                           value={selectedWorkflowType}
                           onChange={(e) => setSelectedWorkflowType(e.target.value)}
                           className="flex-1 px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           <option value="">Select a workflow...</option>
                           {WORKFLOW_TYPES.map(wf => (
                              <option key={wf.id} value={wf.id}>{wf.name}</option>
                           ))}
                        </select>
                        <button
                           onClick={handleTriggerWorkflow}
                           disabled={!selectedWorkflowType}
                           className="px-4 py-2 bg-navy-700 hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                           <Workflow size={16} /> Trigger
                        </button>
                     </div>
                     {selectedWorkflowType && (
                        <div className="mt-4 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                           <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description:</p>
                           <p className="text-sm text-gray-700 dark:text-gray-300">
                              {WORKFLOW_TYPES.find(w => w.id === selectedWorkflowType)?.description}
                           </p>
                           <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Sequence:</p>
                           <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                              {WORKFLOW_TYPES.find(w => w.id === selectedWorkflowType)?.sequence}
                           </p>
                        </div>
                     )}
                  </div>

                  {/* Active Workflows */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                     <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                        <h3 className="font-bold text-navy-900 dark:text-white text-sm">Active Chase Sequences</h3>
                     </div>
                     <div className="p-4 space-y-3">
                        {activeWorkflows.map((wf) => (
                           <div key={wf.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                              <div>
                                 <p className="text-sm font-bold text-gray-900 dark:text-white">{wf.workflowName}</p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Started: {new Date(wf.triggeredAt).toLocaleDateString()} | Step {wf.currentStep}/{wf.totalSteps}
                                 </p>
                                 {wf.nextActionDescription && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{wf.nextActionDescription}</p>
                                 )}
                              </div>
                              <button
                                 onClick={() => handleCancelWorkflow(wf.id)}
                                 className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              >
                                 <XCircle size={20} />
                              </button>
                           </div>
                        ))}
                        {activeWorkflows.length === 0 && (
                           <p className="text-center text-gray-400 py-4">No active workflows</p>
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* ==================== NOTES TAB ==================== */}
            {activeTab === 'notes' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Notes</h2>
                     <div className="flex items-center gap-3">
                        {/* Lender Filter */}
                        <div className="flex items-center gap-2 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-700">
                           <Filter size={14} className="text-gray-400" />
                           <select
                              value={noteFilter}
                              onChange={(e) => setNoteFilter(e.target.value)}
                              className="text-xs bg-transparent text-gray-700 dark:text-gray-200 outline-none cursor-pointer pr-1"
                           >
                              <option value="all">All Notes</option>
                              <option value="note">General Notes</option>
                              {noteLenders.map(l => (
                                 <option key={l} value={l}>{l}</option>
                              ))}
                           </select>
                        </div>
                        <button
                           onClick={() => { setEditingNote(null); setNewNoteContent(''); setNewNotePinned(false); setShowAddNoteModal(true); }}
                           className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                        >
                           <Plus size={14} /> Add Note
                        </button>
                     </div>
                  </div>

                  {/* Notes List */}
                  {notesLoading ? (
                     <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-navy-700 dark:text-gray-400" />
                     </div>
                  ) : sortedNotes.length > 0 ? (
                     <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[140px_1fr_48px] bg-white dark:bg-slate-800 border-b-2 border-gray-200 dark:border-slate-600">
                           <div className="px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600">Lender</div>
                           <div className="px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider text-center">Notes</div>
                           <div className="px-4 py-3"></div>
                        </div>
                        {/* List Rows */}
                        <div className="divide-y divide-gray-200 dark:divide-slate-600">
                           {sortedNotes.map((note) => {
                              const { lender, noteContent } = parseLenderFromNote(note.content);
                              const color = lender ? getLenderColor(lender) : null;
                              // Lender notes get lender's light row color, generic notes get light yellow
                              const rowBgClass = lender && color ? color.rowBg : 'bg-yellow-50 dark:bg-yellow-900/20';
                              return (
                                 <div key={note.id} className={`grid grid-cols-[140px_1fr_48px] items-center ${rowBgClass} transition-all hover:opacity-90`}>
                                    {/* Lender Column */}
                                    <div className="px-4 py-4 border-r border-gray-200 dark:border-slate-600 flex items-center justify-center">
                                       {lender ? (
                                          <span className={`inline-block px-3 py-1.5 rounded-md text-sm font-bold ${color!.bg} ${color!.text} ${color!.dark}`}>
                                             {lender}
                                          </span>
                                       ) : (
                                          <span className="inline-block px-3 py-1.5 rounded-md text-sm font-bold bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">
                                             Note
                                          </span>
                                       )}
                                    </div>
                                    {/* Notes Column - Truncated to 3 lines */}
                                    <div className="px-5 py-4">
                                       <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                          {noteContent || note.content}
                                       </p>
                                    </div>
                                    {/* Preview Button */}
                                    <div className="px-2 py-4 flex justify-center">
                                       <button
                                          onClick={() => setPreviewNote(note)}
                                          className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-slate-500 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-white dark:hover:bg-slate-700 transition-all flex items-center justify-center shadow-sm"
                                          title="Preview note"
                                       >
                                          <Eye size={14} className="text-gray-500 dark:text-gray-400" />
                                       </button>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  ) : (
                     <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                        <StickyNote size={48} className="mx-auto mb-3 opacity-20" />
                        <p>No notes found. Add one to get started.</p>
                     </div>
                  )}
               </div>
            )}

            {/* ==================== DOCUMENTS TAB ==================== */}
            {activeTab === 'documents' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Documents</h2>
                     <div className="flex gap-2">
                        <button
                           onClick={handleSyncDocuments}
                           disabled={syncingDocs}
                           className="text-xs font-bold bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                           title="Sync documents from S3 storage"
                        >
                           <RotateCcw size={14} className={syncingDocs ? 'animate-spin' : ''} />
                           {syncingDocs ? 'Syncing...' : 'Sync'}
                        </button>
                        <button
                           onClick={() => setShowUploadModal(true)}
                           className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                        >
                           <Upload size={14} /> Upload Document
                        </button>
                     </div>
                  </div>

                  {docsLoading ? (
                     <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                        <Loader2 size={20} className="animate-spin mr-2" /> Loading documents...
                     </div>
                  ) : contactDocs.length > 0 ? (
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                        {/* Pagination Info Header */}
                        <div className="px-5 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between">
                           <span className="text-sm text-gray-600 dark:text-gray-400">
                              Showing {((docsPage - 1) * docsPerPage) + 1}-{Math.min(docsPage * docsPerPage, contactDocs.length)} of {contactDocs.length} documents
                           </span>
                           {totalDocsPages > 1 && (
                              <div className="flex items-center gap-2">
                                 <button
                                    onClick={() => setDocsPage(p => Math.max(1, p - 1))}
                                    disabled={docsPage === 1}
                                    className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    Previous
                                 </button>
                                 <span className="text-sm text-gray-600 dark:text-gray-400">
                                    Page {docsPage} of {totalDocsPages}
                                 </span>
                                 <button
                                    onClick={() => setDocsPage(p => Math.min(totalDocsPages, p + 1))}
                                    disabled={docsPage === totalDocsPages}
                                    className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    Next
                                 </button>
                              </div>
                           )}
                        </div>
                        <table className="w-full text-left">
                           <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700">
                              <tr className="text-xs text-white uppercase tracking-wider font-bold">
                                 <th className="py-4 px-5">Document Name</th>
                                 <th className="py-4 px-5">Lender</th>
                                 <th className="py-4 px-5">Category</th>
                                 <th className="py-4 px-5">Type</th>
                                 <th className="py-4 px-5">Date</th>
                                 <th className="py-4 px-5 text-right">Actions</th>
                              </tr>
                           </thead>
                           <tbody>
                              {paginatedDocs.map((doc, index) => (
                                 <tr
                                    key={doc.id}
                                    className={`
                                       ${index % 2 === 0
                                          ? 'bg-white dark:bg-slate-800'
                                          : 'bg-indigo-50/50 dark:bg-slate-700/50'
                                       }
                                       hover:bg-indigo-100 dark:hover:bg-indigo-900/30
                                       transition-all duration-200
                                       border-b border-gray-100 dark:border-slate-700
                                    `}
                                 >
                                    <td className="py-4 px-5">
                                       <div className="flex items-center gap-3">
                                          <div className={`p-2 rounded-lg shadow-sm ${doc.type === 'pdf'
                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                : doc.type === 'docx'
                                                   ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                   : 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-400'
                                             }`}>
                                             <FileIcon size={16} />
                                          </div>
                                          <button
                                             onClick={() => handleDocumentPreview(doc)}
                                             className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left"
                                             title="Click to preview"
                                          >
                                             {doc.name}
                                          </button>
                                       </div>
                                    </td>
                                    <td className="py-4 px-5">
                                       <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                          {getLenderFromDoc(doc) || 'N/A'}
                                       </span>
                                    </td>
                                    <td className="py-4 px-5">
                                       <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${doc.category === 'Cover Letter'
                                             ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                                             : doc.category === 'LOA'
                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                                : 'bg-gray-100 dark:bg-slate-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-500'
                                          }`}>
                                          {doc.category || 'General'}
                                       </span>
                                    </td>
                                    <td className="py-4 px-5">
                                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${doc.type === 'pdf'
                                             ? 'bg-red-500 text-white'
                                             : doc.type === 'docx'
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-500 text-white'
                                          }`}>
                                          {doc.type}
                                       </span>
                                    </td>
                                    <td className="py-4 px-5">
                                       <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                          {formatDate(doc.dateModified)}
                                       </span>
                                    </td>
                                    <td className="py-4 px-5 text-right">
                                       <div className="flex items-center justify-end gap-2">
                                          <button
                                             onClick={() => handleDocumentPreview(doc)}
                                             className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                                             title="Preview"
                                          >
                                             <Eye size={16} />
                                          </button>
                                          {doc.url && (
                                             <button
                                                onClick={() => handleDownload(doc)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors"
                                             >
                                                <Download size={12} />
                                                Download
                                             </button>
                                          )}
                                          <button
                                             onClick={() => {
                                                setDocToDelete({ id: doc.id, name: doc.name });
                                                setShowDeleteDocConfirm(true);
                                             }}
                                             className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                                             title="Delete"
                                          >
                                             <Trash2 size={16} />
                                          </button>
                                       </div>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                        {/* Pagination Footer */}
                        {totalDocsPages > 1 && (
                           <div className="px-5 py-3 bg-gray-50 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-600 flex items-center justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                 Showing {((docsPage - 1) * docsPerPage) + 1}-{Math.min(docsPage * docsPerPage, contactDocs.length)} of {contactDocs.length}
                              </span>
                              <div className="flex items-center gap-2">
                                 <button
                                    onClick={() => setDocsPage(1)}
                                    disabled={docsPage === 1}
                                    className="px-2 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    First
                                 </button>
                                 <button
                                    onClick={() => setDocsPage(p => Math.max(1, p - 1))}
                                    disabled={docsPage === 1}
                                    className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    ← Prev
                                 </button>
                                 <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {docsPage} / {totalDocsPages}
                                 </span>
                                 <button
                                    onClick={() => setDocsPage(p => Math.min(totalDocsPages, p + 1))}
                                    disabled={docsPage === totalDocsPages}
                                    className="px-3 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    Next →
                                 </button>
                                 <button
                                    onClick={() => setDocsPage(totalDocsPages)}
                                    disabled={docsPage === totalDocsPages}
                                    className="px-2 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                    Last
                                 </button>
                              </div>
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800">
                        <FileIcon size={48} className="mx-auto mb-3 opacity-20" />
                        <p>No documents found. Upload one to get started.</p>
                     </div>
                  )}
               </div>
            )}

            {/* ==================== ACTION TIMELINE TAB ==================== */}
            {activeTab === 'timeline' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Action Timeline</h2>
                     <select
                        value={timelineFilter}
                        onChange={(e) => setTimelineFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                     >
                        <option value="all">All Actions</option>
                        <option value="claims">Claims</option>
                        <option value="communication">Communication</option>
                        <option value="documents">Documents</option>
                        <option value="notes">Notes</option>
                        <option value="workflows">Workflows</option>
                     </select>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                     {filteredActionLogs.length > 0 ? filteredActionLogs.map((log, index) => (
                        <div key={log.id} className={`flex items-center gap-4 px-5 py-4 ${index !== filteredActionLogs.length - 1 ? 'border-b border-gray-200 dark:border-slate-700' : ''}`}>
                           {/* Icon */}
                           <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                              <RotateCcw size={22} className="text-blue-500 dark:text-blue-400" />
                           </div>

                           {/* Action label */}
                           <div className="w-20 shrink-0">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Action</p>
                           </div>

                           {/* Description and actor */}
                           <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                 {log.description}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                 by {log.actorType === 'system' ? 'System' : `User ${log.actorName || 'Unknown'}`}
                              </p>
                           </div>

                           {/* Date/Time on rightmost side */}
                           <div className="shrink-0 text-right">
                              <p className="text-sm text-gray-500 dark:text-gray-400">{formatActionDate(log.timestamp)}</p>
                           </div>
                        </div>
                     )) : (
                        // Fall back to legacy timeline if no CRM action logs
                        legacyTimeline.length > 0 ? legacyTimeline.map((item, index) => (
                           <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${index !== legacyTimeline.length - 1 ? 'border-b border-gray-200 dark:border-slate-700' : ''}`}>
                              {/* Icon */}
                              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                 <RotateCcw size={22} className="text-blue-500 dark:text-blue-400" />
                              </div>

                              {/* Action label */}
                              <div className="w-20 shrink-0">
                                 <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Action</p>
                              </div>

                              {/* Description */}
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                    {item.title}{item.description ? ` - ${item.description}` : ''}
                                 </p>
                                 <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">by System</p>
                              </div>

                              {/* Date/Time on rightmost side */}
                              <div className="shrink-0 text-right">
                                 <p className="text-sm text-gray-500 dark:text-gray-400">{formatActionDate(item.date)}</p>
                              </div>
                           </div>
                        )) : (
                           <p className="text-center text-gray-400 py-8">No activity recorded yet.</p>
                        )
                     )}
                  </div>
               </div>
            )}

         </div>

         {/* Upload Modal with Category Selection */}
         {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700 relative">
                  {/* Upload Progress Overlay */}
                  {isUploadingDocument && (
                     <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <div className="relative w-24 h-24">
                           <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                 strokeDasharray={251.2}
                                 strokeDashoffset={251.2 - (251.2 * docUploadProgress) / 100}
                                 className="text-blue-500 transition-all duration-300 ease-out"
                                 strokeLinecap="round"
                              />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
                              {Math.round(docUploadProgress)}%
                           </div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                           {docUploadProgress < 100 ? 'Uploading document...' : 'Processing...'}
                        </p>
                     </div>
                  )}
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Upload Document</h3>
                  <div className="space-y-4">
                     <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-700/50 text-center">
                        <input
                           type="file"
                           id="file-upload"
                           className="hidden"
                           onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                           disabled={isUploadingDocument}
                        />
                        <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center ${isUploadingDocument ? 'pointer-events-none opacity-50' : ''}`}>
                           <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-3">
                              <Upload size={24} />
                           </div>
                           {uploadFile ? (
                              <p className="text-sm font-bold text-navy-900 dark:text-white">{uploadFile.name}</p>
                           ) : (
                              <>
                                 <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Click to upload</p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF, DOCX, JPG, PNG</p>
                              </>
                           )}
                        </label>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Category</label>
                        <select
                           value={uploadCategory}
                           onChange={(e) => setUploadCategory(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           disabled={isUploadingDocument}
                        >
                           {DOCUMENT_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                           ))}
                        </select>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button
                        onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadCategory('Other'); }}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm"
                        disabled={isUploadingDocument}
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleUploadDocument}
                        disabled={!uploadFile || isUploadingDocument}
                        className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        {isUploadingDocument ? 'Uploading...' : 'Upload'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Preview Loading Indicator */}
         {previewLoading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-300">Loading document...</p>
               </div>
            </div>
         )}

         {/* Preview Modal - Enhanced for multiple file types */}
         {previewDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-navy-50 dark:bg-slate-700">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-slate-600 rounded shadow-sm">
                           <FileIcon className="text-blue-500" size={20} />
                        </div>
                        <div>
                           <h3 className="font-bold text-navy-900 dark:text-white">{previewDoc.name}</h3>
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                              {previewDoc.size} {previewDoc.dateModified ? `• ${previewDoc.dateModified}` : ''} {previewDoc.category ? `• ${previewDoc.category}` : ''}
                           </p>
                        </div>
                     </div>
                     <div className="flex items-center gap-2">
                        {previewDoc.url && (
                           <>
                              <a
                                 href={previewDoc.url}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-1"
                              >
                                 <Eye size={14} /> Open in New Tab
                              </a>
                              <button
                                 onClick={() => handleDownload(previewDoc)}
                                 className="px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-1"
                              >
                                 <Download size={14} /> Download
                              </button>
                           </>
                        )}
                        <button onClick={() => setPreviewDoc(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                           <X size={24} />
                        </button>
                     </div>
                  </div>
                  <div className="flex-1 bg-gray-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                     {/* PDF Preview */}
                     {(previewDoc.type === 'pdf' || previewDoc.name.match(/\.pdf$/i)) && previewDoc.url ? (
                        <iframe
                           src={previewDoc.url}
                           className="w-full h-full border-0"
                           title={`Preview: ${previewDoc.name}`}
                        />
                     ) : /* Image Preview */
                        (previewDoc.type === 'image' || previewDoc.name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)) && previewDoc.url ? (
                           <div className="relative p-4 flex items-center justify-center w-full h-full overflow-auto">
                              <img
                                 src={previewDoc.url}
                                 alt={`Preview: ${previewDoc.name}`}
                                 className="max-w-full max-h-full object-contain shadow-lg rounded"
                                 onError={(e) => {
                                    // If image fails to load, show fallback
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = target.parentElement?.querySelector('.image-fallback');
                                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                 }}
                              />
                              <div className="image-fallback hidden flex-col items-center justify-center text-center p-8">
                                 <GenericFileIcon size={64} className="mb-4 text-gray-300 dark:text-slate-600" />
                                 <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Image Failed to Load</p>
                                 <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">The image URL may be invalid or expired.</p>
                              </div>
                           </div>
                        ) : /* Text/HTML Preview */
                           (previewDoc.type === 'txt' || previewDoc.type === 'html' || previewDoc.content) ? (
                              <div className="w-full h-full p-6 overflow-auto">
                                 <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
                                    {previewDoc.type === 'html' || previewDoc.content?.startsWith('<') ? (
                                       <div
                                          className="prose dark:prose-invert max-w-none"
                                          dangerouslySetInnerHTML={{ __html: previewDoc.content || '' }}
                                       />
                                    ) : (
                                       <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                                          {previewDoc.content || 'No content available'}
                                       </pre>
                                    )}
                                 </div>
                              </div>
                           ) : /* Office Documents - Show iframe or fallback */
                              (previewDoc.name.match(/\.(docx?|xlsx?|pptx?)$/i)) && previewDoc.url ? (
                                 <div className="flex flex-col items-center justify-center text-center p-8">
                                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-md">
                                       <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                          <FileIcon size={32} className="text-blue-600 dark:text-blue-400" />
                                       </div>
                                       <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{previewDoc.name}</h4>
                                       <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                          Office documents require download to view properly.
                                       </p>
                                       <div className="flex flex-col gap-3">
                                          <button
                                             onClick={() => handleDownload(previewDoc)}
                                             className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                          >
                                             <Download size={16} /> Download File
                                          </button>
                                          <a
                                             href={previewDoc.url}
                                             target="_blank"
                                             rel="noopener noreferrer"
                                             className="px-5 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                                          >
                                             <Eye size={16} /> Open in Browser
                                          </a>
                                       </div>
                                    </div>
                                 </div>
                              ) : /* Default Fallback - No Preview Available */
                                 (
                                    <div className="flex flex-col items-center justify-center text-center p-8">
                                       <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-md border border-gray-200 dark:border-slate-700">
                                          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                                             <GenericFileIcon size={32} className="text-gray-400 dark:text-slate-500" />
                                          </div>
                                          <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{previewDoc.name}</h4>
                                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                             Size: {previewDoc.size || 'Unknown'}
                                          </p>
                                          {previewDoc.url ? (
                                             <>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                                   This file type cannot be previewed directly in the browser.
                                                </p>
                                                <div className="flex flex-col gap-3">
                                                   <button
                                                      onClick={() => handleDownload(previewDoc)}
                                                      className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                                   >
                                                      <Download size={16} /> Download File
                                                   </button>
                                                   <a
                                                      href={previewDoc.url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="px-5 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                                                   >
                                                      <Eye size={16} /> Open in New Tab
                                                   </a>
                                                </div>
                                             </>
                                          ) : (
                                             <p className="text-sm text-red-500 dark:text-red-400">
                                                No file URL available. The file may not have been uploaded correctly.
                                             </p>
                                          )}
                                       </div>
                                    </div>
                                 )}
                  </div>
               </div>
            </div>
         )}

         {/* Add Claim Modal */}
         {showAddClaim && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700 relative">
                  {/* Progress Overlay */}
                  {isCreatingClaim && (
                     <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <div className="relative w-24 h-24">
                           <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                 strokeDasharray={251.2}
                                 strokeDashoffset={251.2 - (251.2 * (claimProgressTotal > 0 ? (claimProgress / claimProgressTotal) * 100 : 0)) / 100}
                                 className="text-green-500 transition-all duration-300 ease-out"
                                 strokeLinecap="round"
                              />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-navy-900 dark:text-white">
                              {claimProgressTotal > 0 ? Math.round((claimProgress / claimProgressTotal) * 100) : 0}%
                           </div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-navy-900 dark:text-white">
                           Creating claim {claimProgress} of {claimProgressTotal}...
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                           {claimProgress < claimProgressTotal ? selectedLenders[claimProgress] : 'Finishing up...'}
                        </p>
                     </div>
                  )}
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Add New Claim</h3>
                  <div className="space-y-4">
                     <div className="relative" ref={dropdownRef}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lender(s) / Bank(s)</label>
                        <div
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 min-h-[42px] cursor-pointer flex flex-wrap gap-2 items-center"
                           onClick={() => setIsLenderDropdownOpen(!isLenderDropdownOpen)}
                        >
                           {selectedLenders.length === 0 && <span className="text-gray-400 text-sm">Select lenders...</span>}
                           {selectedLenders.map(l => (
                              <span key={l} className="bg-navy-100 dark:bg-navy-900 text-navy-700 dark:text-navy-300 text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                 {l}
                                 <X size={12} className="cursor-pointer hover:text-red-500" onClick={(e) => { e.stopPropagation(); toggleLender(l); }} />
                              </span>
                           ))}
                           <div className="ml-auto">
                              <ChevronDown size={16} className={`text-gray-400 transition-transform ${isLenderDropdownOpen ? 'rotate-180' : ''}`} />
                           </div>
                        </div>

                        {isLenderDropdownOpen && (
                           <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg animate-in fade-in zoom-in-95 duration-200">
                              {/* Search Input */}
                              <div className="p-2 border-b border-gray-200 dark:border-slate-600">
                                 <div className="relative">
                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                       ref={lenderSearchRef}
                                       type="text"
                                       className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-600"
                                       placeholder="Search lenders..."
                                       value={lenderSearchQuery}
                                       onChange={(e) => setLenderSearchQuery(e.target.value)}
                                       onClick={(e) => e.stopPropagation()}
                                       autoFocus
                                    />
                                 </div>
                              </div>
                              {/* Lender List */}
                              <div className="max-h-48 overflow-y-auto">
                                 {COMMON_LENDERS
                                    .filter(l => l.toLowerCase().includes(lenderSearchQuery.toLowerCase()))
                                    .map(l => (
                                       <div
                                          key={l}
                                          className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
                                          onClick={() => toggleLender(l)}
                                       >
                                          <div className={`w-4 h-4 border rounded flex items-center justify-center ${selectedLenders.includes(l) ? 'bg-navy-600 border-navy-600 text-white' : 'border-gray-300 dark:border-slate-500'}`}>
                                             {selectedLenders.includes(l) && <Check size={10} />}
                                          </div>
                                          {l}
                                       </div>
                                    ))}
                                 {COMMON_LENDERS.filter(l => l.toLowerCase().includes(lenderSearchQuery.toLowerCase())).length === 0 && (
                                    <div className="px-3 py-4 text-center text-sm text-gray-400">
                                       No lenders found matching "{lenderSearchQuery}"
                                    </div>
                                 )}
                              </div>
                           </div>
                        )}
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Value per claim</label>
                        <div className="flex items-center gap-2">
                           <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                           <input
                              type="number"
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              value={newClaimData.claimValue}
                              onChange={e => setNewClaimData({ ...newClaimData, claimValue: Number(e.target.value) })}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button
                        onClick={() => { setShowAddClaim(false); setSelectedLenders([]); setLenderSearchQuery(''); }}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        disabled={isCreatingClaim}
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleAddClaim}
                        className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        disabled={isCreatingClaim || selectedLenders.length === 0}
                     >
                        {isCreatingClaim && <Loader2 size={16} className="animate-spin" />}
                        {isCreatingClaim ? 'Creating...' : `Create ${selectedLenders.length > 1 ? `${selectedLenders.length} Claims` : 'Claim'}`}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Status Update Modal */}
         {showStatusUpdate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Update Status</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                     {Object.values(ClaimStatus).map(status => (
                        <button
                           key={status}
                           onClick={() => handleUpdateStatus(showStatusUpdate, status)}
                           className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 rounded text-sm text-gray-700 dark:text-gray-300"
                        >
                           {status}
                        </button>
                     ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                     <button onClick={() => setShowStatusUpdate(null)} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white">Cancel</button>
                  </div>
               </div>
            </div>
         )}

         {/* ============================================ */}
         {/* CRM Specification Modals (Phase 5) */}
         {/* ============================================ */}

         {/* SMS Modal */}
         {showSMSModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <MessageIcon size={20} className="text-green-600" /> Log SMS
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                        <input
                           type="text"
                           value={contact.phone || ''}
                           disabled
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700 text-gray-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template (Optional)</label>
                        <select
                           onChange={(e) => setSmsContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           <option value="">Select a template...</option>
                           {SMS_TEMPLATES.map(t => (
                              <option key={t.id} value={t.content}>{t.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                        <textarea
                           value={smsContent}
                           onChange={(e) => setSmsContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={4}
                           placeholder="Type your message..."
                        />
                        <p className="text-xs text-gray-400 mt-1">{smsContent.length}/160 characters</p>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowSMSModal(false); setSmsContent(''); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleLogSMS}
                        disabled={!smsContent.trim()}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        <Send size={14} /> Log SMS
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Call Modal */}
         {showCallModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <PhoneIcon size={20} className="text-purple-600" /> Log Call
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                        <input
                           type="text"
                           value={contact.phone || ''}
                           disabled
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700 text-gray-500"
                        />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (seconds)</label>
                           <input
                              type="number"
                              value={callDuration}
                              onChange={(e) => setCallDuration(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                              placeholder="e.g., 180"
                           />
                        </div>
                        <div>
                           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Outcome</label>
                           <select
                              value={callOutcome}
                              onChange={(e) => setCallOutcome(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           >
                              <option value="">Select outcome...</option>
                              <option value="Answered">Answered</option>
                              <option value="Voicemail">Voicemail</option>
                              <option value="No Answer">No Answer</option>
                              <option value="Busy">Busy</option>
                              <option value="Wrong Number">Wrong Number</option>
                           </select>
                        </div>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Call Notes</label>
                        <textarea
                           value={callNotes}
                           onChange={(e) => setCallNotes(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={3}
                           placeholder="Summary of the call..."
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowCallModal(false); setCallDuration(''); setCallOutcome(''); setCallNotes(''); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleLogCall}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2"
                     >
                        <PhoneIcon size={14} /> Log Call
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Email Modal */}
         {showEmailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <MailIcon size={20} className="text-blue-600" /> Log Email
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                        <input
                           type="email"
                           value={contact.email || ''}
                           disabled
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700 text-gray-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template (Optional)</label>
                        <select
                           onChange={(e) => {
                              const template = EMAIL_TEMPLATES.find(t => t.id === e.target.value);
                              if (template) {
                                 setEmailSubject(template.subject);
                                 setEmailContent(template.content);
                              }
                           }}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           <option value="">Select a template...</option>
                           {EMAIL_TEMPLATES.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                        <input
                           type="text"
                           value={emailSubject}
                           onChange={(e) => setEmailSubject(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           placeholder="Email subject..."
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                        <textarea
                           value={emailContent}
                           onChange={(e) => setEmailContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={6}
                           placeholder="Email content..."
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowEmailModal(false); setEmailSubject(''); setEmailContent(''); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleLogEmail}
                        disabled={!emailContent.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        <Send size={14} /> Log Email
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* WhatsApp Modal */}
         {showWhatsAppModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <MessageIcon size={20} className="text-emerald-600" /> Log WhatsApp
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                        <input
                           type="text"
                           value={contact.phone || ''}
                           disabled
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700 text-gray-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template (Optional)</label>
                        <select
                           onChange={(e) => setWhatsappContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           <option value="">Select a template...</option>
                           {WHATSAPP_TEMPLATES.map(t => (
                              <option key={t.id} value={t.content}>{t.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                        <textarea
                           value={whatsappContent}
                           onChange={(e) => setWhatsappContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={4}
                           placeholder="Type your message..."
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowWhatsAppModal(false); setWhatsappContent(''); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleLogWhatsApp}
                        disabled={!whatsappContent.trim()}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        <Send size={14} /> Log WhatsApp
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Add/Edit Note Modal */}
         {showAddNoteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <StickyNote size={20} className="text-yellow-500" /> {editingNote ? 'Edit Note' : 'Add Note'}
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note Content</label>
                        <textarea
                           value={newNoteContent}
                           onChange={(e) => setNewNoteContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={5}
                           placeholder="Type your note here..."
                        />
                     </div>
                     <div className="flex items-center gap-2">
                        <input
                           type="checkbox"
                           id="pin-note"
                           checked={newNotePinned}
                           onChange={(e) => setNewNotePinned(e.target.checked)}
                           className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500"
                        />
                        <label htmlFor="pin-note" className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                           <Pin size={14} className="text-yellow-500" /> Pin to top
                        </label>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowAddNoteModal(false); setEditingNote(null); setNewNoteContent(''); setNewNotePinned(false); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={editingNote ? handleUpdateNote : handleAddCRMNote}
                        disabled={!newNoteContent.trim()}
                        className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {editingNote ? 'Update Note' : 'Save Note'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Claim Note Modal - Add note from claim section */}
         {showClaimNoteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <StickyNote size={20} className="text-green-500" /> Add Note for {claimNoteLender}
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lender</label>
                        <div className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700/50 text-gray-900 dark:text-white font-medium">
                           {claimNoteLender || 'Unknown'}
                        </div>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note Content</label>
                        <textarea
                           value={claimNoteContent}
                           onChange={(e) => setClaimNoteContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={6}
                           placeholder="Type your note for this claim..."
                           autoFocus
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowClaimNoteModal(false); setClaimNoteContent(''); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleAddClaimNote}
                        disabled={!claimNoteContent.trim()}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        Save Note
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Note Preview Modal - Expanded view */}
         {previewNote && (() => {
            const { lender, noteContent } = parseLenderFromNote(previewNote.content);
            const color = lender ? getLenderColor(lender) : null;
            const isManagement = currentUser?.role === 'Management';
            const modalBg = lender && color ? color.rowBg : 'bg-yellow-50 dark:bg-yellow-900/20';
            return (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className={`${modalBg} rounded-xl shadow-xl w-full max-w-lg border border-gray-200 dark:border-slate-700 flex flex-col max-h-[80vh]`}>
                     {/* Header */}
                     <div className="flex items-center justify-between px-6 py-4 border-b border-gray-300/50 dark:border-slate-600/50">
                        <div className="flex items-center gap-3">
                           {lender && color ? (
                              <span className={`inline-block px-4 py-1.5 rounded-md text-base font-bold ${color.bg} ${color.text} ${color.dark}`}>
                                 {lender}
                              </span>
                           ) : (
                              <span className="inline-block px-4 py-1.5 rounded-md text-base font-bold bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">Note</span>
                           )}
                        </div>
                        <button
                           onClick={() => setPreviewNote(null)}
                           className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                           <X size={20} />
                        </button>
                     </div>
                     {/* Scrollable Note Content */}
                     <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                           {noteContent || previewNote.content}
                        </p>
                     </div>
                     {/* Footer: Date, Agent, Actions */}
                     <div className="border-t border-gray-300/50 dark:border-slate-600/50 px-6 py-4">
                        <div className="flex items-center justify-between">
                           <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Date Added</span>
                                 <span className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                                    {previewNote.createdAt ? new Date(previewNote.createdAt).toLocaleDateString('en-GB') : 'Unknown'}
                                 </span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Agent:</span>
                                 <span className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                                    {previewNote.createdByName || 'Unknown'}
                                 </span>
                              </div>
                           </div>
                           {isManagement && (
                              <div className="flex items-center gap-2">
                                 <button
                                    onClick={() => handleEditNoteFromPreview(previewNote)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium transition-colors"
                                 >
                                    Edit
                                 </button>
                                 <button
                                    onClick={() => handleDeleteNoteFromPreview(previewNote.id)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium transition-colors"
                                 >
                                    Delete
                                 </button>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               </div>
            );
         })()}

         {/* LOA Link Modal */}
         {showLoaLinkModal && loaLink && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                     <h3 className="font-bold text-lg text-navy-900 dark:text-white">LOA Link Generated</h3>
                     <button
                        onClick={() => setShowLoaLinkModal(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                     >
                        <X size={20} />
                     </button>
                  </div>

                  <div className="mb-4">
                     <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        Share this link with <strong>{contact?.fullName}</strong> to complete the LOA (Letter of Authority) form:
                     </p>
                     <div className="bg-gray-50 dark:bg-slate-700 p-3 rounded-lg border border-gray-200 dark:border-slate-600 flex items-center gap-2">
                        <code className="flex-1 text-xs text-gray-800 dark:text-gray-200 break-all font-mono">
                           {loaLink}
                        </code>
                        <button
                           onClick={copyLoaLinkToClipboard}
                           className="loa-copy-btn p-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded transition-colors flex-shrink-0 flex items-center gap-1"
                           title="Copy to clipboard"
                        >
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                     </div>
                  </div>

                  <div className="flex justify-end gap-3">
                     <button
                        onClick={() => setShowLoaLinkModal(false)}
                        className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                     >
                        Done
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Document Delete Confirmation Modal */}
         {showDeleteDocConfirm && docToDelete && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4 relative">
                  {/* Deleting Progress Overlay */}
                  {isDeletingDoc && (
                     <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <div className="relative w-24 h-24">
                           <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                 strokeDasharray={251.2}
                                 strokeDashoffset={251.2 - (251.2 * deleteDocProgress) / 100}
                                 className="text-green-500 transition-all duration-300 ease-out"
                                 strokeLinecap="round"
                              />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-green-600 dark:text-green-400">
                              {Math.round(deleteDocProgress)}%
                           </div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                           {deleteDocProgress < 100 ? 'Deleting document from S3...' : 'Done!'}
                        </p>
                     </div>
                  )}
                  <div className="flex items-center gap-3 mb-4">
                     <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                        <Trash2 size={20} className="text-red-600" />
                     </div>
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Document?</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                     Are you sure you want to delete <strong>"{docToDelete.name}"</strong>?
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                     This will permanently remove the file from storage. This action cannot be undone.
                  </p>
                  <div className="mb-6">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Type <span className="font-bold text-red-600">DELETE</span> to confirm:
                     </label>
                     <input
                        type="text"
                        value={deleteDocConfirmText}
                        onChange={(e) => setDeleteDocConfirmText(e.target.value.toUpperCase())}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        placeholder="DELETE"
                        disabled={isDeletingDoc}
                     />
                  </div>
                  <div className="flex justify-end gap-3">
                     <button
                        onClick={() => {
                           setShowDeleteDocConfirm(false);
                           setDocToDelete(null);
                           setDeleteDocConfirmText('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        disabled={isDeletingDoc}
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleDeleteDocument}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        disabled={isDeletingDoc || deleteDocConfirmText !== 'DELETE'}
                     >
                        {isDeletingDoc && <Loader2 size={14} className="animate-spin" />}
                        {isDeletingDoc ? 'Deleting...' : 'Delete Document'}
                     </button>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

const Contacts: React.FC = () => {
   const { contacts, addContact, deleteContacts, addNotification, actionLogs, fetchAllActionLogs, addCommunication, pendingContactNavigation, clearContactNavigation, contactsPagination, fetchContactsPage } = useCRM();
   const navigate = useNavigate();
   const { contactId: urlContactId } = useParams<{ contactId: string }>();
   const [searchParams] = useSearchParams();

   // Fetch all action logs for the Last Activity column
   useEffect(() => {
      fetchAllActionLogs();
   }, [fetchAllActionLogs]);

   // Sync URL param with selectedContactId state (supports new tab via query params)
   useEffect(() => {
      if (urlContactId) {
         setSelectedContactId(urlContactId);
         setViewMode('detail');
         const tabParam = searchParams.get('tab');
         const claimIdParam = searchParams.get('claimId');
         if (tabParam) {
            setInitialTab(tabParam as ContactTab);
         }
         if (claimIdParam) {
            setInitialClaimId(claimIdParam);
         }
      }
   }, [urlContactId, searchParams]);

   // Callback to navigate back to Pipeline/Cases module
   const handleBackToPipeline = useCallback(() => {
      navigate('/cases');
   }, [navigate]);

   // Helper function to generate Client ID in RR-contactId format
   const generateClientId = (contact: Contact): string => {
      return `RR-${contact.id}`;
   };

   // Helper function to get the latest action for a contact
   const getLatestAction = (contactId: string): { actionType: string; description: string; timeAgo: string } | null => {
      const contactActions = actionLogs.filter(log => String(log.clientId) === String(contactId));
      if (contactActions.length === 0) return null;

      // Sort by timestamp descending and get the most recent
      const sorted = [...contactActions].sort((a, b) =>
         new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const latest = sorted[0];

      // Format relative time
      const date = new Date(latest.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeAgo = '';
      if (diffMins < 1) timeAgo = 'Just now';
      else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
      else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
      else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
      else timeAgo = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

      // Format action type for display
      const actionTypeFormatted = latest.actionType
         .replace(/_/g, ' ')
         .replace(/\b\w/g, c => c.toUpperCase());

      return {
         actionType: actionTypeFormatted,
         description: latest.description,
         timeAgo
      };
   };
   const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
   const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
   const [initialTab, setInitialTab] = useState<ContactTab>('personal');
   const [initialClaimId, setInitialClaimId] = useState<string | undefined>(undefined);
   const [showAddContact, setShowAddContact] = useState(false);
   const [showBulkImport, setShowBulkImport] = useState(false);
   const [showSearchFilters, setShowSearchFilters] = useState(false);

   // Handle navigation from Pipeline (double-click on claim)
   useEffect(() => {
      if (pendingContactNavigation) {
         setSelectedContactId(pendingContactNavigation.contactId);
         setInitialTab(pendingContactNavigation.tab as ContactTab);
         setInitialClaimId(pendingContactNavigation.claimId);
         setViewMode('detail');
         navigate(`/contacts/${pendingContactNavigation.contactId}`); // Update URL
         clearContactNavigation();
      }
   }, [pendingContactNavigation, clearContactNavigation, navigate]);

   // Individual search fields
   const [searchFullName, setSearchFullName] = useState('');
   const [searchEmail, setSearchEmail] = useState('');
   const [searchPhone, setSearchPhone] = useState('');
   const [searchPostcode, setSearchPostcode] = useState('');
   const [searchClientId, setSearchClientId] = useState('');

   // Pagination State
   const [contactsPerPage, setContactsPerPage] = useState(50);
   const [currentContactsPage, setCurrentContactsPage] = useState(1);

   // Debounced server-side search + pagination
   useEffect(() => {
      const timer = setTimeout(() => {
         fetchContactsPage(currentContactsPage, contactsPerPage, {
            fullName: searchFullName || undefined,
            email: searchEmail || undefined,
            phone: searchPhone || undefined,
            postcode: searchPostcode || undefined,
            clientId: searchClientId || undefined,
         });
      }, 400);
      return () => clearTimeout(timer);
   }, [searchFullName, searchEmail, searchPhone, searchPostcode, searchClientId, contactsPerPage, currentContactsPage]);

   // Reset to page 1 when filters or per-page changes
   useEffect(() => {
      setCurrentContactsPage(1);
   }, [searchFullName, searchEmail, searchPhone, searchPostcode, searchClientId, contactsPerPage]);

   // Action Menu & Delete Logic
   const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
   const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
   const [deleteConfirmation, setDeleteConfirmation] = useState('');
   const [deleteError, setDeleteError] = useState('');

   // Email Modal State (for list view)
   const [showListEmailModal, setShowListEmailModal] = useState(false);
   const [listEmailContact, setListEmailContact] = useState<Contact | null>(null);
   const [listEmailSubject, setListEmailSubject] = useState('');
   const [listEmailContent, setListEmailContent] = useState('');

   // Add Contact Form State
   const [newContactData, setNewContactData] = useState<FormData>(INITIAL_FORM_STATE);

   const handleContactClick = (id: string) => {
      setSelectedContactId(id);
      setInitialTab('personal'); // Reset to default tab when clicking from list
      setInitialClaimId(undefined); // Reset claim when clicking from list
      setViewMode('detail');
      navigate(`/contacts/${id}`); // Update URL
   };

   const handleBack = () => {
      setSelectedContactId(null);
      setInitialTab('personal'); // Reset tab when going back
      setInitialClaimId(undefined); // Reset claim when going back
      setViewMode('list');
      navigate('/contacts'); // Go back to contacts list
   };

   // Close menu when clicking outside
   useEffect(() => {
      const handleClickOutside = () => setActiveActionMenu(null);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
   }, []);

   const handleSaveNewContact = () => {
      addContact({
         fullName: `${newContactData.firstName} ${newContactData.lastName}`,
         firstName: newContactData.firstName,
         lastName: newContactData.lastName,
         email: newContactData.email,
         phone: newContactData.phone,
         dateOfBirth: newContactData.dob,
         address: {
            line1: newContactData.addressLine1,
            line2: newContactData.addressLine2,
            city: newContactData.city,
            postalCode: newContactData.postalCode
         },
         livedLessThan3Years: newContactData.livedLessThan3Years,
         previousAddress: newContactData.previousAddress,
         claimValue: Number(newContactData.claimValue),
         status: newContactData.status,
         source: 'Manual Input'
      });
      setShowAddContact(false);
      setNewContactData(INITIAL_FORM_STATE);
   };

   // Delete Handlers
   const handleDeleteClick = (contact: Contact, e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveActionMenu(null);
      setContactToDelete(contact);
      setDeleteConfirmation('');
      setDeleteError('');
   };

   const handleConfirmDelete = () => {
      if (deleteConfirmation === 'DELETE' && contactToDelete) {
         deleteContacts([contactToDelete.id]);
         setContactToDelete(null);
      } else {
         setDeleteError('Please type DELETE exactly to confirm.');
      }
   };

   // Email Modal Handlers (for list view)
   const handleEmailClick = (contact: Contact, e: React.MouseEvent) => {
      e.stopPropagation();
      setListEmailContact(contact);
      setListEmailSubject('');
      setListEmailContent('');
      setShowListEmailModal(true);
   };

   const handleListLogEmail = async () => {
      if (!listEmailContent.trim() || !listEmailContact) return;
      await addCommunication({
         clientId: listEmailContact.id,
         channel: 'email',
         direction: 'outbound',
         subject: listEmailSubject,
         content: listEmailContent
      });
      setListEmailSubject('');
      setListEmailContent('');
      setShowListEmailModal(false);
      setListEmailContact(null);
      addNotification('success', 'Email logged successfully');
   };

   if (viewMode === 'detail' && selectedContactId) {
      return <ContactDetailView contactId={selectedContactId} onBack={handleBack} initialTab={initialTab} initialClaimId={initialClaimId} onBackToPipeline={handleBackToPipeline} />;
   }

   // Server-side pagination — contacts already contains only the current page
   const paginatedContacts = contacts;
   const totalContactsPages = contactsPagination.totalPages;
   const startContactIndex = (currentContactsPage - 1) * contactsPerPage;
   const endContactIndex = startContactIndex + contactsPerPage;

   return (
      <div className="flex flex-col h-full bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors">
         {/* Header */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 shadow-sm">
            <div className="h-16 flex items-center justify-between px-6">
               <h1 className="text-xl font-bold text-gray-800 dark:text-white">Contacts Directory</h1>
               <div className="flex gap-3">
                  <button
                     onClick={() => setShowBulkImport(true)}
                     className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 text-navy-700 dark:text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-colors text-sm"
                  >
                     <FileUp size={18} /> Bulk Import
                  </button>
                  <button
                     onClick={() => setShowAddContact(true)}
                     className="bg-brand-orange hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-colors text-sm"
                  >
                     <UserPlus size={18} /> Add Contact
                  </button>
               </div>
            </div>

            {/* Search Filters Panel - Always visible */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-600">
                  <div className="grid grid-cols-5 gap-4">
                     <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Client ID / Reference</label>
                        <input
                           type="text"
                           placeholder="Search ID or reference..."
                           value={searchClientId}
                           onChange={(e) => setSearchClientId(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Full Name</label>
                        <input
                           type="text"
                           placeholder="Search full name..."
                           value={searchFullName}
                           onChange={(e) => setSearchFullName(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Email</label>
                        <input
                           type="text"
                           placeholder="Search email..."
                           value={searchEmail}
                           onChange={(e) => setSearchEmail(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Contact Number</label>
                        <input
                           type="text"
                           placeholder="Search phone..."
                           value={searchPhone}
                           onChange={(e) => setSearchPhone(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">Post Code</label>
                        <input
                           type="text"
                           placeholder="Search postcode..."
                           value={searchPostcode}
                           onChange={(e) => setSearchPostcode(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                     <span className="text-sm text-gray-500 dark:text-gray-400">
                        {contactsPagination.total} contacts
                     </span>
                     <button
                        onClick={() => {
                           setSearchFullName('');
                           setSearchEmail('');
                           setSearchPhone('');
                           setSearchPostcode('');
                           setSearchClientId('');
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                     >
                        <RotateCcw size={14} />
                        Clear Filters
                     </button>
                  </div>
               </div>
         </div>

         {/* List */}
         <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-x-auto min-h-[400px]">
               <table className="w-full text-left min-w-[900px]">
                  <thead className="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-700 dark:to-slate-800 border-b-2 border-gray-200 dark:border-slate-600">
                     <tr>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Client ID</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Full Name</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Telephone</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Last Activity</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider text-right">Action</th>
                     </tr>
                  </thead>
                  <tbody>
                     {contactsPagination.isLoadingMore && (
                        <tr>
                           <td colSpan={6} className="px-6 py-8 text-center">
                              <div className="flex items-center justify-center gap-2 text-gray-400">
                                 <Loader2 size={18} className="animate-spin" />
                                 <span className="text-sm">Loading contacts...</span>
                              </div>
                           </td>
                        </tr>
                     )}
                     {!contactsPagination.isLoadingMore && paginatedContacts.map((contact, index) => (
                        <tr
                           key={contact.id}
                           onClick={() => handleContactClick(contact.id)}
                           className={`
                              ${index % 2 === 0
                                 ? 'bg-white dark:bg-slate-800'
                                 : 'bg-slate-50/80 dark:bg-slate-750 dark:bg-slate-700/50'
                              }
                              hover:bg-blue-50 dark:hover:bg-slate-600
                              transition-all duration-150 cursor-pointer group
                              border-b border-gray-100 dark:border-slate-700/50
                              hover:shadow-md hover:scale-[1.005] hover:z-10 relative
                           `}
                        >
                           {/* Client ID */}
                           <td className="px-6 py-4">
                              <span className="font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
                                 {generateClientId(contact)}
                              </span>
                           </td>
                           {/* Full Name */}
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                                    {(contact.fullName || contact.firstName || '?').charAt(0).toUpperCase()}
                                 </div>
                                 <div className="font-semibold text-gray-900 dark:text-white text-sm">{contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed'}</div>
                              </div>
                           </td>
                           {/* Email */}
                           <td className="px-6 py-4">
                              {contact.email ? (
                                 <button
                                    onClick={(e) => handleEmailClick(contact, e)}
                                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors"
                                    title="Click to send email"
                                 >
                                    <MailIcon size={14} className="text-blue-500" />
                                    <span>{contact.email}</span>
                                 </button>
                              ) : (
                                 <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <MailIcon size={14} />
                                    <span>—</span>
                                 </div>
                              )}
                           </td>
                           {/* Telephone */}
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                 <PhoneIcon size={14} className="text-gray-400" />
                                 <span>{contact.phone || '—'}</span>
                              </div>
                           </td>
                           {/* Last Activity (from Action Timeline) */}
                           <td className="px-6 py-4">
                              {(() => {
                                 const latestAction = getLatestAction(contact.id);
                                 if (!latestAction) {
                                    return (
                                       <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                                          No activity
                                       </span>
                                    );
                                 }
                                 return (
                                    <div className="max-w-[300px]">
                                       <p className="text-sm text-gray-700 dark:text-gray-300 truncate" title={latestAction.description}>
                                          {latestAction.description}
                                       </p>
                                       <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                          {latestAction.timeAgo}
                                       </p>
                                    </div>
                                 );
                              })()}
                           </td>
                           <td className="px-6 py-4 text-right relative">
                              <button
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMenu(activeActionMenu === contact.id ? null : contact.id);
                                 }}
                                 className="text-gray-400 hover:text-indigo-600 dark:hover:text-white p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-600 transition-all hover:shadow-sm"
                              >
                                 <MoreHorizontal size={20} />
                              </button>
                              {activeActionMenu === contact.id && (
                                 <div
                                    className="absolute right-8 top-8 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 z-50 overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                 >
                                    <button
                                       className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
                                       onClick={(e) => { e.stopPropagation(); handleContactClick(contact.id); }}
                                    >
                                       <Edit size={14} /> View / Edit Details
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-slate-700 my-1"></div>
                                    <button
                                       className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                                       onClick={(e) => handleDeleteClick(contact, e)}
                                    >
                                       <Trash2 size={14} /> Delete Contact
                                    </button>
                                 </div>
                              )}
                           </td>
                        </tr>
                     ))}
                     {!contactsPagination.isLoadingMore && paginatedContacts.length === 0 && (
                        <tr>
                           <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                              No contacts found.
                           </td>
                        </tr>
                     )}
                  </tbody>
               </table>

               {/* Pagination Controls */}
               {contactsPagination.total > 0 && (
                  <div className="flex items-center justify-between px-6 py-2.5 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
                     <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                           Showing {startContactIndex + 1}-{Math.min(startContactIndex + paginatedContacts.length, contactsPagination.total)} of {contactsPagination.total}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <div className="flex items-center gap-1.5">
                           <span className="text-xs text-gray-500 dark:text-gray-400">Show:</span>
                           <select
                              value={contactsPerPage}
                              onChange={(e) => setContactsPerPage(Number(e.target.value))}
                              className="px-1.5 py-0.5 border border-gray-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                           >
                              <option value={20}>20</option>
                              <option value={30}>30</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                           </select>
                        </div>
                     </div>
                     <div className="flex items-center">
                        <button
                           onClick={() => setCurrentContactsPage(prev => Math.max(prev - 1, 1))}
                           disabled={currentContactsPage === 1}
                           className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                        >
                           Previous
                        </button>
                        <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                           {currentContactsPage} / {totalContactsPages || 1}
                        </span>
                        <button
                           onClick={() => setCurrentContactsPage(prev => Math.min(prev + 1, totalContactsPages))}
                           disabled={currentContactsPage === totalContactsPages || totalContactsPages === 0}
                           className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                        >
                           Next
                        </button>
                     </div>
                  </div>
               )}
            </div>
         </div>

         {/* Add Contact Modal */}
         {showAddContact && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="font-bold text-lg text-navy-900 dark:text-white">Add New Contact</h3>
                     <button onClick={() => setShowAddContact(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={20} />
                     </button>
                  </div>

                  <div className="space-y-6">
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                           <input
                              type="text"
                              value={newContactData.firstName}
                              onChange={(e) => setNewContactData({ ...newContactData, firstName: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                           <input
                              type="text"
                              value={newContactData.lastName}
                              onChange={(e) => setNewContactData({ ...newContactData, lastName: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                           <input
                              type="email"
                              value={newContactData.email}
                              onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                           <input
                              type="tel"
                              value={newContactData.phone}
                              onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label>
                           <input
                              type="date"
                              value={newContactData.dob}
                              onChange={(e) => setNewContactData({ ...newContactData, dob: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                           <select
                              value={newContactData.status}
                              onChange={(e) => setNewContactData({ ...newContactData, status: e.target.value as ClaimStatus })}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                           >
                              {Object.values(ClaimStatus).map(s => (
                                 <option key={s} value={s}>{s}</option>
                              ))}
                           </select>
                        </div>
                     </div>

                     <div>
                        <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3 border-b border-gray-100 dark:border-slate-700 pb-1">Address Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address Line 1</label>
                              <input
                                 type="text"
                                 value={newContactData.addressLine1}
                                 onChange={(e) => setNewContactData({ ...newContactData, addressLine1: e.target.value })}
                                 className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                              />
                           </div>
                           <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address Line 2</label>
                              <input
                                 type="text"
                                 value={newContactData.addressLine2}
                                 onChange={(e) => setNewContactData({ ...newContactData, addressLine2: e.target.value })}
                                 className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                              />
                           </div>
                           <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                              <input
                                 type="text"
                                 value={newContactData.city}
                                 onChange={(e) => setNewContactData({ ...newContactData, city: e.target.value })}
                                 className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                              />
                           </div>
                           <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Post Code</label>
                              <input
                                 type="text"
                                 value={newContactData.postalCode}
                                 onChange={(e) => setNewContactData({ ...newContactData, postalCode: e.target.value })}
                                 className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                              />
                           </div>
                        </div>
                     </div>

                     <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-slate-700">
                        <button onClick={() => setShowAddContact(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium">Cancel</button>
                        <button onClick={handleSaveNewContact} className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium">Create Contact</button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* Delete Warning Modal */}
         {contactToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700 text-center">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                     <AlertTriangle size={24} />
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Delete Contact?</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                     This action cannot be undone. This will permanently delete <strong>{contactToDelete.fullName}</strong> and all associated claims.
                  </p>

                  <div className="mb-6 text-left">
                     <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
                     </label>
                     <input
                        type="text"
                        value={deleteConfirmation}
                        onChange={(e) => {
                           setDeleteConfirmation(e.target.value);
                           setDeleteError('');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        placeholder="DELETE"
                     />
                     {deleteError && <p className="text-xs text-red-500 mt-1">{deleteError}</p>}
                  </div>

                  <div className="flex justify-center gap-3">
                     <button
                        onClick={() => setContactToDelete(null)}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-600"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleConfirmDelete}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={deleteConfirmation !== 'DELETE'}
                     >
                        Confirm Delete
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Bulk Import Modal */}
         {showBulkImport && (
            <BulkImport
               onClose={() => setShowBulkImport(false)}
               onComplete={(count) => {
                  addNotification('success', `Successfully imported ${count} contact${count !== 1 ? 's' : ''}`);
               }}
            />
         )}

         {/* Email Modal (List View) */}
         {showListEmailModal && listEmailContact && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white flex items-center gap-2">
                     <MailIcon size={20} className="text-blue-600" /> Log Email
                  </h3>
                  <div className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                        <input
                           type="email"
                           value={listEmailContact.email || ''}
                           disabled
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700 text-gray-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template (Optional)</label>
                        <select
                           onChange={(e) => {
                              const template = EMAIL_TEMPLATES.find(t => t.id === e.target.value);
                              if (template) {
                                 setListEmailSubject(template.subject);
                                 setListEmailContent(template.content);
                              }
                           }}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           <option value="">Select a template...</option>
                           {EMAIL_TEMPLATES.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                        <input
                           type="text"
                           value={listEmailSubject}
                           onChange={(e) => setListEmailSubject(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           placeholder="Email subject..."
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                        <textarea
                           value={listEmailContent}
                           onChange={(e) => setListEmailContent(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           rows={6}
                           placeholder="Email content..."
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button
                        onClick={() => {
                           setShowListEmailModal(false);
                           setListEmailSubject('');
                           setListEmailContent('');
                           setListEmailContact(null);
                        }}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleListLogEmail}
                        disabled={!listEmailContent.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                     >
                        <Send size={14} /> Log Email
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Contacts;
