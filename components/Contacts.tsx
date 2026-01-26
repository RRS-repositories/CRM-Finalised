
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
   Search, Filter, Upload, Download, MoreHorizontal,
   Trash2, X, UserPlus, ArrowLeft, Clock as ClockIcon,
   FileText as FileIcon, Paperclip, StickyNote,
   ChevronDown, Plus, Check, Mail as MailIcon,
   Phone as PhoneIcon, Calendar as CalendarIcon,
   MapPin, CreditCard, Sparkles, MessageSquare as MessageIcon,
   Eye, File as GenericFileIcon, AlertTriangle, Edit, FileUp,
   User, Briefcase, Workflow, History, Send, XCircle,
   Pin, Building2, Hash, DollarSign, FileCheck, AlertCircle
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Contact, ClaimStatus, Claim, Document, CRMCommunication, WorkflowTrigger, CRMNote, ActionLogEntry, ClaimStatusSpec, BankDetails, LoanDetails, FinanceTypeEntry, PaymentPlan, PreviousAddressEntry } from '../types';
import { SPEC_LENDERS, FINANCE_TYPES, WORKFLOW_TYPES, SPEC_STATUS_COLORS, DOCUMENT_CATEGORIES, getSpecStatusColor, SMS_TEMPLATES, EMAIL_TEMPLATES, WHATSAPP_TEMPLATES, CALL_OUTCOMES } from '../constants';
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

// Common Lenders List for Dropdowns
const COMMON_LENDERS = [
   'Amigo Loans', 'Bamboo', 'Barclays', 'Black Horse', 'Capital One',
   'Creation', 'Everyday Loans', 'H&T', 'Likely Loans', 'Lloyds',
   'MBNA', 'Monzo', 'Morses Club', 'NatWest', 'Provident',
   'Santander', 'Tesco Bank', 'Vanquis', 'Virgin Money', 'Welcome Finance'
];

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
      status === 'LOA Sent' || status === 'LOA Signed' || status.includes('Bank Statements')) {
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

// --- Sub-Component: Contact Detail View (7-Tab Structure) ---
const ContactDetailView = ({ contactId, onBack }: { contactId: string, onBack: () => void }) => {
   const {
      contacts, documents, claims, activityLogs: legacyActivityLogs, addClaim, updateClaim, deleteClaim, updateContact, setActiveContext, addNote, addDocument,
      // CRM Specification Methods
      communications, fetchCommunications, addCommunication,
      workflowTriggers, fetchWorkflows, triggerWorkflow, cancelWorkflow,
      crmNotes, fetchNotes, addCRMNote, updateCRMNote, deleteCRMNote,
      actionLogs, fetchActionLogs,
      updateContactExtended, updateClaimExtended, fetchFullClaim, currentUser
   } = useCRM();

   const contact = contacts.find(c => c.id === contactId);
   const contactClaims = claims.filter(c => c.contactId === contactId);

   // Main 7-Tab Navigation
   const [activeTab, setActiveTab] = useState<ContactTab>('personal');
   const [expandedClaimId, setExpandedClaimId] = useState<string | null>(contactClaims[0]?.id || null);

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

   // Multi-Lender Selection State for Add Claim
   const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
   const [isLenderDropdownOpen, setIsLenderDropdownOpen] = useState(false);
   const dropdownRef = useRef<HTMLDivElement>(null);

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

   // Personal Details Extended (Bank Details & Previous Address)
   const [bankDetails, setBankDetails] = useState<BankDetails>({
      bankName: '',
      accountName: '',
      sortCode: '',
      accountNumber: ''
   });
   const [previousAddresses, setPreviousAddresses] = useState<PreviousAddressEntry[]>([]);

   // Edit modes for each section
   const [editingPersonalInfo, setEditingPersonalInfo] = useState(false);
   const [editingCurrentAddress, setEditingCurrentAddress] = useState(false);
   const [editingBankDetails, setEditingBankDetails] = useState(false);
   const [editingPreviousAddresses, setEditingPreviousAddresses] = useState(false);

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

   // Claim File View (detailed view for individual claim)
   const [viewingClaimId, setViewingClaimId] = useState<string | null>(null);
   const [claimFileData, setClaimFileData] = useState<any>(null);
   const [claimFileForm, setClaimFileForm] = useState({
      // Section 1: Claim Details
      lender: '',
      lenderOther: '',
      financeTypes: [] as FinanceTypeEntry[], // Multi-select finance types with account numbers
      financeType: '', // Legacy single select
      financeTypeOther: '',
      numberOfLoans: '1',
      loanDetails: [{ loanNumber: 1, valueOfLoan: '', startDate: '', endDate: '', apr: '' }] as LoanDetails[],
      billedInterestCharges: '',
      latePaymentCharges: '',
      overlimitCharges: '',
      creditLimitIncreases: '',
      dsarReview: '',
      complaintParagraph: '',
      // Section 2: Payment Section
      offerMade: '',
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
   const [showDeleteClaimConfirm, setShowDeleteClaimConfirm] = useState(false);
   const [showClaimDocUpload, setShowClaimDocUpload] = useState(false);
   const [claimDocFile, setClaimDocFile] = useState<File | null>(null);
   const [claimDocCategory, setClaimDocCategory] = useState('Other');

   // Set Context for AI on Mount
   useEffect(() => {
      if (contact) {
         setActiveContext({ type: 'contact', id: contact.id, name: contact.fullName, data: contact });
      }
      return () => setActiveContext(null);
   }, [contact]);

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsLenderDropdownOpen(false);
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
      }
   }, [contact]);

   const toggleLender = (lender: string) => {
      setSelectedLenders(prev =>
         prev.includes(lender) ? prev.filter(l => l !== lender) : [...prev, lender]
      );
   };

   if (!contact) return <div className="p-6">Contact not found. <button onClick={onBack} className="text-blue-600 underline ml-2">Back</button></div>;

   const contactDocs = documents.filter(d => d.associatedContactId === contactId);

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

   // Filter action logs based on timeline filter
   const filteredActionLogs = actionLogs.filter(log => {
      if (timelineFilter === 'all') return true;
      if (timelineFilter === 'claims') return log.actionCategory === 'claims';
      if (timelineFilter === 'communication') return log.actionCategory === 'communication';
      if (timelineFilter === 'documents') return log.actionCategory === 'documents';
      if (timelineFilter === 'notes') return log.actionCategory === 'notes';
      if (timelineFilter === 'workflows') return log.actionCategory === 'workflows';
      return true;
   });

   // Sort CRM notes (pinned first, then by date)
   const sortedNotes = [...crmNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
   });

   // Active workflows for this client
   const activeWorkflows = workflowTriggers.filter(w => w.status === 'active');

   const handleAddClaim = async () => {
      if (selectedLenders.length === 0) {
         alert("Please select at least one lender.");
         return;
      }
      for (const lender of selectedLenders) {
         await addClaim({
            contactId: contact.id,
            lender: lender,
            claimValue: Number(newClaimData.claimValue),
            status: newClaimData.status,
            productType: newClaimData.productType || 'Credit Card'
         });
      }
      setShowAddClaim(false);
      setNewClaimData({ claimValue: 0, status: ClaimStatus.NEW_LEAD });
      setSelectedLenders([]);
   };

   const handleUpdateStatus = (claimId: string, newStatus: ClaimStatus) => {
      const claim = contactClaims.find(c => c.id === claimId);
      if (claim) {
         updateClaim({ ...claim, status: newStatus });
      }
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

      await addDocument({
         name: uploadFile.name,
         type: uploadFile.name.split('.').pop()?.toLowerCase() as any || 'pdf',
         category: uploadCategory,
         associatedContactId: contact.id,
         size: `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`,
      }, uploadFile);

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadCategory('Other');
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
      await addCRMNote(contact.id, newNoteContent, newNotePinned);
      setNewNoteContent('');
      setNewNotePinned(false);
      setShowAddNoteModal(false);
   };

   const handleUpdateNote = async () => {
      if (!editingNote || !newNoteContent.trim()) return;
      await updateCRMNote(editingNote.id, newNoteContent, newNotePinned);
      setEditingNote(null);
      setNewNoteContent('');
      setNewNotePinned(false);
      setShowAddNoteModal(false);
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

   // Open claim file view
   const handleOpenClaimFile = async (claimId: string) => {
      setViewingClaimId(claimId);
      const fullClaim = await fetchFullClaim(claimId);
      setClaimFileData(fullClaim);

      // Also get the basic claim data from local state
      const basicClaim = claims.find(c => c.id === claimId);

      // Parse JSON fields safely
      let parsedFinanceTypes: FinanceTypeEntry[] = [];
      let parsedLoanDetails: LoanDetails[] = [{ loanNumber: 1, valueOfLoan: '', startDate: '', endDate: '', apr: '' }];
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
            parsedLoanDetails = typeof fullClaim.loan_details === 'string'
               ? JSON.parse(fullClaim.loan_details)
               : fullClaim.loan_details;
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
            parsedLoanDetails.push({ loanNumber: i, valueOfLoan: '', startDate: '', endDate: '', apr: '' });
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
            creditLimitIncreases: fullClaim?.credit_limit_increases || '',
            dsarReview: fullClaim?.dsar_review || '',
            complaintParagraph: fullClaim?.complaint_paragraph || '',
            // Section 2: Payment Section
            offerMade: fullClaim?.offer_made?.toString() || '',
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
            specStatus: fullClaim?.spec_status || basicClaim?.status || 'New Claim'
         });
      }
   };

   // Close claim file view and go back to list
   const handleCloseClaimFile = () => {
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
         loanDetails: [{ loanNumber: 1, valueOfLoan: '', startDate: '', endDate: '', apr: '' }],
         billedInterestCharges: '',
         latePaymentCharges: '',
         overlimitCharges: '',
         creditLimitIncreases: '',
         dsarReview: '',
         complaintParagraph: '',
         // Section 2: Payment Section
         offerMade: '',
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
            credit_limit_increases: claimFileForm.creditLimitIncreases,
            dsar_review: claimFileForm.dsarReview,
            complaint_paragraph: claimFileForm.complaintParagraph,

            // Section 2: Payment Section
            offer_made: claimFileForm.offerMade,
            total_refund: claimFileForm.totalRefund,
            total_debt: claimFileForm.totalDebt,
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

         // Also update the basic claim status if changed
         const basicClaim = claims.find(c => c.id === viewingClaimId);
         if (basicClaim && basicClaim.status !== claimFileForm.specStatus) {
            updateClaim({ ...basicClaim, status: claimFileForm.specStatus as ClaimStatus, lender: claimFileForm.lender });
         }
      } finally {
         setClaimFileSaving(false);
      }
   };

   // Delete claim handler
   // Delete claim handler
   const handleDeleteClaim = async () => {
      if (!viewingClaimId) return;
      await deleteClaim(viewingClaimId);
      setShowDeleteClaimConfirm(false);
      handleCloseClaimFile();
   };

   // Upload document for claim
   const handleClaimDocUpload = async () => {
      if (!claimDocFile || !viewingClaimId || !contact) return;

      try {
         const formData = new FormData();
         formData.append('file', claimDocFile);
         formData.append('contactId', contact.id);
         formData.append('category', claimDocCategory);
         formData.append('claimId', viewingClaimId);

         // Use existing addDocument method
         await addDocument({
            name: claimDocFile.name,
            type: claimDocFile.type,
            category: claimDocCategory,
            url: URL.createObjectURL(claimDocFile), // Temporary URL
            size: `${(claimDocFile.size / 1024).toFixed(1)} KB`,
            associatedContactId: contact.id
         });

         setShowClaimDocUpload(false);
         setClaimDocFile(null);
         setClaimDocCategory('Other');
      } catch (error) {
         console.error('Error uploading document:', error);
      }
   };

   // Generate Client ID (RR-YYMMDD-XXXX format)
   const generateClientId = () => {
      const now = new Date();
      const yy = now.getFullYear().toString().slice(-2);
      const mm = (now.getMonth() + 1).toString().padStart(2, '0');
      const dd = now.getDate().toString().padStart(2, '0');
      const xxxx = Math.floor(1000 + Math.random() * 9000).toString();
      return `RR-${yy}${mm}${dd}-${xxxx}`;
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
               userName: currentUser.name
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
                        {contact.clientId || `RR-${new Date(contact.createdAt || Date.now()).toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6)}-${contact.id.slice(-4).toUpperCase()}`}
                     </p>
                  </div>
               </div>

               {/* Center Section: Client Name - Large, bold typography */}
               <div className="flex-1 text-center">
                  <h1 className="text-2xl font-bold text-navy-900 dark:text-white tracking-tight">
                     {contact.firstName || ''} {contact.lastName || contact.fullName}
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
                     onClick={() => setActiveTab(tab.id)}
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
               <div className="grid grid-cols-12 gap-6">
                  {/* Personal Information */}
                  <div className="col-span-12 lg:col-span-6">
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-blue-500 to-indigo-600 flex justify-between items-center">
                           <h3 className="font-bold text-white text-sm flex items-center gap-2">
                              <User size={14} /> Personal Information
                           </h3>
                           <button
                              onClick={() => setEditingPersonalInfo(!editingPersonalInfo)}
                              className="text-xs text-white hover:text-blue-100 border border-white/30 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
                           >
                              {editingPersonalInfo ? 'Cancel' : 'Edit'}
                           </button>
                        </div>
                        <div className="p-4">
                           {editingPersonalInfo ? (
                              <div className="space-y-3">
                                 <div className="grid grid-cols-2 gap-3">
                                    <div>
                                       <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">First Name</label>
                                       <input
                                          type="text"
                                          value={personalInfoForm.firstName}
                                          onChange={(e) => setPersonalInfoForm({ ...personalInfoForm, firstName: e.target.value })}
                                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                       />
                                    </div>
                                    <div>
                                       <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Last Name</label>
                                       <input
                                          type="text"
                                          value={personalInfoForm.lastName}
                                          onChange={(e) => setPersonalInfoForm({ ...personalInfoForm, lastName: e.target.value })}
                                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
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
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mt-6">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-cyan-500 to-teal-600 flex justify-between items-center">
                           <h3 className="font-bold text-white text-sm flex items-center gap-2">
                              <MapPin size={14} /> Current Address
                           </h3>
                           <button
                              onClick={() => setEditingCurrentAddress(!editingCurrentAddress)}
                              className="text-xs text-white hover:text-cyan-100 border border-white/30 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
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
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-violet-500 to-purple-600 flex justify-between items-center">
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
                                    // Entering edit mode - add a blank address if none exist
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
                              className="text-xs text-white hover:text-violet-100 border border-white/30 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
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
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-emerald-500 to-green-600 flex justify-between items-center">
                           <h3 className="font-bold text-white text-sm flex items-center gap-2">
                              <Building2 size={14} /> Bank Details
                           </h3>
                           <button
                              onClick={() => setEditingBankDetails(!editingBankDetails)}
                              className="text-xs text-white hover:text-emerald-100 border border-white/30 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors"
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
                                 <div className="flex justify-end mt-3">
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
                  </div>
               </div>
            )}

            {/* ==================== CLAIMS TAB ==================== */}
            {activeTab === 'claims' && (
               <div className="space-y-4">
                  {/* CLAIMS LIST VIEW (when not viewing a specific claim) */}
                  {!viewingClaimId && (
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
                           <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              <div className="col-span-4">Lender</div>
                              <div className="col-span-2">Reference</div>
                              <div className="col-span-2">Created</div>
                              <div className="col-span-2 text-center">Status</div>
                              <div className="col-span-2 text-right">Action</div>
                           </div>

                           {/* Table Body */}
                           {contactClaims.map((claim, index) => (
                              <div
                                 key={claim.id}
                                 className={`grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600/50 transition-colors items-center ${index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/80 dark:bg-slate-700/40'}`}
                              >
                                 <div className="col-span-4">
                                    <p className="font-semibold text-navy-900 dark:text-white">{claim.lender}</p>
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
                        </div>
                     </>
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
                                 statuses: ['Onboarding Started', 'ID Verification Pending', 'ID Verification Complete', 'Questionnaire Sent', 'Questionnaire Complete', 'LOA Sent', 'LOA Signed', 'Bank Statements Requested', 'LENDER SELECTION FORM COMPLETED', 'Bank Statements Received', 'Onboarding Complete']
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

                        {/* Sections Container with darker background for depth */}
                        <div className="bg-slate-200 dark:bg-slate-950 rounded-xl p-5 space-y-5">

                           {/* ==================== SECTION 1: CLAIM DETAILS ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-300 dark:border-slate-600 p-5">
                              <h3 className="text-xl font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Claim Details</h3>

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
                                 {/* Lender - Dropdown Single Select */}
                                 <div>
                                    <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Lender</label>
                                    <select
                                       value={claimFileForm.lender}
                                       onChange={(e) => setClaimFileForm({ ...claimFileForm, lender: e.target.value })}
                                       className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    >
                                       <option value="">Select Lender...</option>
                                       {SPEC_LENDERS.map(lender => (
                                          <option key={lender} value={lender}>{lender}</option>
                                       ))}
                                    </select>
                                 </div>
                                 {claimFileForm.lender === 'Other (specify)' && (
                                    <div>
                                       <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Other Lender (specify)</label>
                                       <input
                                          type="text"
                                          value={claimFileForm.lenderOther}
                                          onChange={(e) => setClaimFileForm({ ...claimFileForm, lenderOther: e.target.value })}
                                          className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          placeholder="Enter lender name"
                                       />
                                    </div>
                                 )}

                                 {/* Status - Dropdown showing statuses for current stage only */}
                                 {(() => {
                                    // Get the actual claim status from the claims list
                                    const currentClaim = claims.find(c => c.id === viewingClaimId);
                                    const actualClaimStatus = currentClaim?.status || '';

                                    // Complete 48-status pipeline organized by category
                                    const pipelineStages = [
                                       {
                                          id: 'lead-generation',
                                          label: 'Lead Generation & Initial Contact',
                                          color: '#22c55e',
                                          statuses: [
                                             'New Lead',
                                             'Contact Attempted',
                                             'In Conversation',
                                             'Qualification Call',
                                             'Qualified Lead',
                                             'Not Qualified'
                                          ]
                                       },
                                       {
                                          id: 'onboarding',
                                          label: 'Client Onboarding',
                                          color: '#a855f7',
                                          statuses: [
                                             'Onboarding Started',
                                             'ID Verification Pending',
                                             'ID Verification Complete',
                                             'Questionnaire Sent',
                                             'Questionnaire Complete',
                                             'LOA Sent',
                                             'LOA Signed',
                                             'Bank Statements Requested',
                                             'LENDER SELECTION FORM COMPLETED',
                                             'Bank Statements Received',
                                             'Onboarding Complete'
                                          ]
                                       },
                                       {
                                          id: 'dsar-process',
                                          label: 'DSAR Process',
                                          color: '#ec4899',
                                          statuses: [
                                             'DSAR Prepared',
                                             'DSAR Sent to Lender',
                                             'DSAR Acknowledged',
                                             'DSAR Follow-up Sent',
                                             'DSAR Response Received',
                                             'DSAR Escalated (ICO)',
                                             'Data Analysis'
                                          ]
                                       },
                                       {
                                          id: 'complaint',
                                          label: 'Complaint Submission & Processing',
                                          color: '#f97316',
                                          statuses: [
                                             'Complaint Drafted',
                                             'Client Review',
                                             'Complaint Approved',
                                             'Complaint Submitted',
                                             'Complaint Acknowledged',
                                             'Awaiting Response',
                                             'Response Received',
                                             'Response Under Review'
                                          ]
                                       },
                                       {
                                          id: 'fos-escalation',
                                          label: 'FOS Escalation',
                                          color: '#14b8a6',
                                          statuses: [
                                             'FOS Referral Prepared',
                                             'FOS Submitted',
                                             'FOS Case Number Received',
                                             'FOS Investigation',
                                             'FOS Provisional Decision',
                                             'FOS Final Decision',
                                             'FOS Appeal'
                                          ]
                                       },
                                       {
                                          id: 'payments',
                                          label: 'Payments',
                                          color: '#10b981',
                                          statuses: [
                                             'Offer Received',
                                             'Offer Under Negotiation',
                                             'Offer Accepted',
                                             'Awaiting Payment',
                                             'Payment Received',
                                             'Fee Deducted',
                                             'Client Paid',
                                             'Claim Successful',
                                             'Claim Unsuccessful',
                                             'Claim Withdrawn'
                                          ]
                                       }
                                    ];

                                    // Find current stage based on actual claim status
                                    const currentStage = pipelineStages.find(stage =>
                                       stage.statuses.includes(actualClaimStatus)
                                    );

                                    // Get statuses for current stage (or all if not found)
                                    const availableStatuses = currentStage ? currentStage.statuses : [];
                                    const stageLabel = currentStage ? currentStage.label : 'Select Stage';
                                    const stageColor = currentStage ? currentStage.color : '#6b7280';

                                    return (
                                       <div>
                                          <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
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
                                                // Update the claim status in the claims list
                                                const newStatus = e.target.value;
                                                if (currentClaim) {
                                                   updateClaim({ ...currentClaim, status: newStatus as ClaimStatus });
                                                }
                                             }}
                                             className="claim-input w-full px-3 py-2 border-2 border-gray-400 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-md"
                                             style={{ borderLeftWidth: '4px', borderLeftColor: stageColor }}
                                          >
                                             {availableStatuses.length > 0 ? (
                                                availableStatuses.map(status => (
                                                   <option key={status} value={status}>{status}</option>
                                                ))
                                             ) : (
                                                // Show all statuses grouped if no current stage found
                                                pipelineStages.map(stage => (
                                                   <optgroup key={stage.id} label={stage.label}>
                                                      {stage.statuses.map(status => (
                                                         <option key={status} value={status}>{status}</option>
                                                      ))}
                                                   </optgroup>
                                                ))
                                             )}
                                          </select>
                                          <p className="text-[10px] text-gray-400 mt-1">
                                             Showing {availableStatuses.length} statuses for {stageLabel}
                                          </p>
                                       </div>
                                    );
                                 })()}

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
                                    <p className="text-xs text-gray-400 mt-1">Select multiple finance types. Each generates an Account Number field below.</p>
                                 </div>

                                 {/* Dynamic Account Number fields (EF) - One per finance type */}
                                 {claimFileForm.financeTypes.length > 0 && (
                                    <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-800 space-y-3">
                                       <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Account Numbers (per Finance Type)</p>
                                       {claimFileForm.financeTypes.map((ft, idx) => (
                                          <div key={idx}>
                                             <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{ft.financeType} - Account Number</label>
                                             <input
                                                type="text"
                                                value={ft.accountNumber || ''}
                                                onChange={(e) => {
                                                   const updated = [...claimFileForm.financeTypes];
                                                   updated[idx] = { ...updated[idx], accountNumber: e.target.value };
                                                   setClaimFileForm({ ...claimFileForm, financeTypes: updated });
                                                }}
                                                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono"
                                                placeholder={`Account number for ${ft.financeType}`}
                                             />
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
                                                newLoanDetails.push({ loanNumber: i, valueOfLoan: '', startDate: '', endDate: '', apr: '' });
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
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 )}

                                 {/* Billed/Interest Charges */}
                                 <div>
                                    <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Billed/Interest Charges</label>
                                    <div className="flex items-center gap-2">
                                       <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                       <input
                                          type="text"
                                          value={claimFileForm.billedInterestCharges}
                                          onChange={(e) => setClaimFileForm({ ...claimFileForm, billedInterestCharges: e.target.value })}
                                          className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          placeholder="0"
                                       />
                                    </div>
                                 </div>

                                 {/* Late Payment Charges */}
                                 <div>
                                    <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Late Payment Charges</label>
                                    <div className="flex items-center gap-2">
                                       <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                       <input
                                          type="text"
                                          value={claimFileForm.latePaymentCharges}
                                          onChange={(e) => setClaimFileForm({ ...claimFileForm, latePaymentCharges: e.target.value })}
                                          className="claim-input w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                          placeholder="0"
                                       />
                                    </div>
                                 </div>

                                 {/* Overlimit Charges */}
                                 <div>
                                    <label className="claim-label block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">Overlimit Charges</label>
                                    <div className="flex items-center gap-2">
                                       <span className="text-sm font-bold text-gray-700 dark:text-gray-200">£</span>
                                       <input
                                          type="text"
                                          value={claimFileForm.overlimitCharges}
                                          onChange={(e) => setClaimFileForm({ ...claimFileForm, overlimitCharges: e.target.value })}
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

                           {/* ==================== SECTION 2: PAYMENT SECTION ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-300 dark:border-slate-600 p-5">
                              <h3 className="text-xl font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Payment</h3>

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

                           {/* ==================== SECTION 3: PAYMENT PLAN ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-300 dark:border-slate-600 p-5">
                              <h3 className="text-xl font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Payment Plan</h3>

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

                           {/* ==================== CLAIM DOCUMENTS SECTION ==================== */}
                           <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-300 dark:border-slate-600 p-5">
                              <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide">Claim Documents</h3>
                                 <button
                                    onClick={() => setShowClaimDocUpload(true)}
                                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                 >
                                    <Plus size={14} /> Upload Document
                                 </button>
                              </div>
                              <div className="space-y-2">
                                 {(() => {
                                    const currentLender = claimFileForm.lender;
                                    const filteredClaimsDocs = contactDocs.filter(doc => {
                                       // Filter for PDF documents related to this specific lender
                                       if (doc.type !== 'pdf') return false;

                                       const tags = doc.tags || [];
                                       const matchesTag = tags.some(t => t.toLowerCase() === currentLender.toLowerCase());
                                       const matchesName = doc.name.toLowerCase().includes(currentLender.toLowerCase());

                                       return matchesTag || matchesName;
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
                                             <button
                                                onClick={() => setPreviewDoc(doc)}
                                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                             >
                                                View
                                             </button>
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
                              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
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
                                    >
                                       Cancel
                                    </button>
                                    <button
                                       onClick={handleDeleteClaim}
                                       className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                                    >
                                       Delete Claim
                                    </button>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* Claim Document Upload Modal */}
                        {showClaimDocUpload && (
                           <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
                                 <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Upload Document</h3>
                                    <button onClick={() => setShowClaimDocUpload(false)} className="text-gray-400 hover:text-gray-600">
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
                                    >
                                       Cancel
                                    </button>
                                    <button
                                       onClick={handleClaimDocUpload}
                                       disabled={!claimDocFile}
                                       className="px-4 py-2 text-sm font-medium text-white bg-navy-700 hover:bg-navy-800 rounded-lg disabled:opacity-50"
                                    >
                                       Upload
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
                     <button
                        onClick={() => { setEditingNote(null); setNewNoteContent(''); setNewNotePinned(false); setShowAddNoteModal(true); }}
                        className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                     >
                        <Plus size={14} /> Add Note
                     </button>
                  </div>

                  <div className="space-y-3">
                     {sortedNotes.map((note) => (
                        <div key={note.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border p-4 ${note.pinned ? 'border-yellow-300 dark:border-yellow-600' : 'border-gray-200 dark:border-slate-700'}`}>
                           <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${note.pinned ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600' : 'bg-gray-50 dark:bg-slate-700 text-gray-400'}`}>
                                 {note.pinned ? <Pin size={18} /> : <StickyNote size={18} />}
                              </div>
                              <div className="flex-1">
                                 <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                       {note.pinned && <span className="text-[10px] font-bold text-yellow-600 uppercase">Pinned</span>}
                                       <span className="text-xs text-gray-400">{note.createdByName || 'Unknown'}</span>
                                       <span className="text-xs text-gray-400">• {formatTimeAgo(note.createdAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <button
                                          onClick={() => openEditNote(note)}
                                          className="text-gray-400 hover:text-blue-600"
                                       >
                                          <Edit size={14} />
                                       </button>
                                       <button
                                          onClick={() => handleDeleteNote(note.id)}
                                          className="text-gray-400 hover:text-red-600"
                                       >
                                          <Trash2 size={14} />
                                       </button>
                                    </div>
                                 </div>
                                 <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">{note.content}</p>
                              </div>
                           </div>
                        </div>
                     ))}

                     {sortedNotes.length === 0 && (
                        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                           <StickyNote size={48} className="mx-auto mb-3 opacity-20" />
                           <p>No notes found. Add one to get started.</p>
                        </div>
                     )}
                  </div>
               </div>
            )}

            {/* ==================== DOCUMENTS TAB ==================== */}
            {activeTab === 'documents' && (
               <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Documents</h2>
                     <button
                        onClick={() => setShowUploadModal(true)}
                        className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                     >
                        <Upload size={14} /> Upload Document
                     </button>
                  </div>

                  {contactDocs.length > 0 ? (
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <table className="w-full text-left">
                           <thead className="bg-gray-50 dark:bg-slate-700">
                              <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                                 <th className="py-3 px-4">Name</th>
                                 <th className="py-3 px-4">Category</th>
                                 <th className="py-3 px-4">Type</th>
                                 <th className="py-3 px-4">Date</th>
                                 <th className="py-3 px-4 text-right">Actions</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                              {contactDocs.map(doc => (
                                 <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                    <td className="py-3 px-4">
                                       <div className="flex items-center gap-3">
                                          <div className="p-1.5 bg-blue-50 dark:bg-slate-600 rounded text-blue-600 dark:text-blue-400">
                                             <FileIcon size={14} />
                                          </div>
                                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{doc.name}</span>
                                       </div>
                                    </td>
                                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">{doc.category || 'General'}</td>
                                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{doc.type}</td>
                                    <td className="py-3 px-4 text-xs text-gray-500 dark:text-gray-400">{doc.dateModified}</td>
                                    <td className="py-3 px-4 text-right">
                                       <div className="flex items-center justify-end gap-2">
                                          <button
                                             onClick={() => setPreviewDoc(doc)}
                                             className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                             title="Preview"
                                          >
                                             <Eye size={16} />
                                          </button>
                                          {doc.url && (
                                             <a
                                                href={doc.url}
                                                download={doc.name}
                                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                             >
                                                Download
                                             </a>
                                          )}
                                       </div>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
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
                     <div className="relative">
                        <div className="absolute left-7 top-0 bottom-0 w-px bg-gray-200 dark:bg-slate-600"></div>
                        {filteredActionLogs.length > 0 ? filteredActionLogs.map((log, index) => (
                           <div key={log.id} className={`relative flex items-start gap-4 px-5 py-4 ${index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/80 dark:bg-slate-700/40'}`}>
                              <div className={`w-3 h-3 rounded-full border-2 shadow-sm shrink-0 z-10 mt-1.5 ${log.actionCategory === 'claims' ? 'bg-indigo-500 border-indigo-300' :
                                 log.actionCategory === 'communication' ? 'bg-green-500 border-green-300' :
                                    log.actionCategory === 'documents' ? 'bg-blue-500 border-blue-300' :
                                       log.actionCategory === 'notes' ? 'bg-yellow-500 border-yellow-300' :
                                          log.actionCategory === 'workflows' ? 'bg-purple-500 border-purple-300' :
                                             'bg-gray-400 border-gray-300'
                                 }`}></div>
                              <div className="flex-1">
                                 <div className="flex justify-between items-start">
                                    <div>
                                       <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{log.actionType}</p>
                                       <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{log.description}</p>
                                    </div>
                                    <span className="text-xs text-gray-400 whitespace-nowrap ml-4">{formatTimeAgo(log.timestamp)}</span>
                                 </div>
                                 {log.actorName && (
                                    <p className="text-xs text-gray-400 mt-1">By: {log.actorName}</p>
                                 )}
                              </div>
                           </div>
                        )) : (
                           // Fall back to legacy timeline if no CRM action logs
                           legacyTimeline.map((item, index) => (
                              <div key={item.id} className={`relative flex items-start gap-4 px-5 py-4 ${index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/80 dark:bg-slate-700/40'}`}>
                                 <div className={`w-3 h-3 rounded-full border-2 shadow-sm shrink-0 z-10 mt-1.5 ${item.type === 'creation' ? 'bg-green-500 border-green-300' :
                                    item.type === 'status_change' ? 'bg-blue-500 border-blue-300' :
                                       item.type === 'communication' ? 'bg-purple-500 border-purple-300' :
                                          'bg-gray-400 border-gray-300'
                                    }`}></div>
                                 <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                       <div>
                                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.title}</p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
                                       </div>
                                       <span className="text-xs text-gray-400 whitespace-nowrap ml-4">{formatTimeAgo(item.date)}</span>
                                    </div>
                                 </div>
                              </div>
                           ))
                        )}

                        {filteredActionLogs.length === 0 && legacyTimeline.length === 0 && (
                           <p className="text-center text-gray-400 py-8">No activity recorded yet.</p>
                        )}
                     </div>
                  </div>
               </div>
            )}

         </div>

         {/* Upload Modal with Category Selection */}
         {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Upload Document</h3>
                  <div className="space-y-4">
                     <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-700/50 text-center">
                        <input
                           type="file"
                           id="file-upload"
                           className="hidden"
                           onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
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
                        >
                           {DOCUMENT_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                           ))}
                        </select>
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadCategory('Other'); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button
                        onClick={handleUploadDocument}
                        disabled={!uploadFile}
                        className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        Upload
                     </button>
                  </div>
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
                              <a
                                 href={previewDoc.url}
                                 download={previewDoc.name}
                                 className="px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-1"
                              >
                                 <Download size={14} /> Download
                              </a>
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
                                          <a
                                             href={previewDoc.url}
                                             download={previewDoc.name}
                                             className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                          >
                                             <Download size={16} /> Download File
                                          </a>
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
                                                   <a
                                                      href={previewDoc.url}
                                                      download={previewDoc.name}
                                                      className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                                   >
                                                      <Download size={16} /> Download File
                                                   </a>
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
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
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
                           <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                              {COMMON_LENDERS.map(l => (
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
                     <button onClick={() => setShowAddClaim(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                     <button onClick={handleAddClaim} className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800">
                        Create {selectedLenders.length > 1 ? `${selectedLenders.length} Claims` : 'Claim'}
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

      </div>
   );
};

const Contacts: React.FC = () => {
   const { contacts, addContact, deleteContacts, addNotification } = useCRM();
   const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
   const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
   const [showAddContact, setShowAddContact] = useState(false);
   const [showBulkImport, setShowBulkImport] = useState(false);
   const [searchTerm, setSearchTerm] = useState('');

   // Action Menu & Delete Logic
   const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
   const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
   const [deleteConfirmation, setDeleteConfirmation] = useState('');
   const [deleteError, setDeleteError] = useState('');

   // Add Contact Form State
   const [newContactData, setNewContactData] = useState<FormData>(INITIAL_FORM_STATE);

   const handleContactClick = (id: string) => {
      setSelectedContactId(id);
      setViewMode('detail');
   };

   const handleBack = () => {
      setSelectedContactId(null);
      setViewMode('list');
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
         source: 'Manual'
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

   if (viewMode === 'detail' && selectedContactId) {
      return <ContactDetailView contactId={selectedContactId} onBack={handleBack} />;
   }

   const filteredContacts = contacts.filter(c =>
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
   );

   return (
      <div className="flex flex-col h-full bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors">
         {/* Header */}
         <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">Contacts Directory</h1>
            <div className="flex gap-3">
               <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                     type="text"
                     placeholder="Search contacts..."
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                  />
               </div>
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

         {/* List */}
         <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[400px]">
               <table className="w-full text-left">
                  <thead className="bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-700 dark:to-slate-800 border-b-2 border-gray-200 dark:border-slate-600">
                     <tr>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Lender</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Est. Value</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Last Activity</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider text-right">Action</th>
                     </tr>
                  </thead>
                  <tbody>
                     {filteredContacts.map((contact, index) => (
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
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                                    {contact.fullName.charAt(0).toUpperCase()}
                                 </div>
                                 <div>
                                    <div className="font-semibold text-gray-900 dark:text-white text-sm">{contact.fullName}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{contact.email}</div>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${getStatusColor(contact.status)}`}>
                                 <span className="w-2 h-2 rounded-full mr-2 bg-current opacity-70"></span>
                                 {contact.status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">{contact.lender || '—'}</td>
                           <td className="px-6 py-4">
                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg">
                                 £{(contact.claimValue || 0).toLocaleString()}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{contact.lastActivity || 'Active'}</td>
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
                     {filteredContacts.length === 0 && (
                        <tr>
                           <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                              No contacts found.
                           </td>
                        </tr>
                     )}
                  </tbody>
               </table>
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
      </div>
   );
};

export default Contacts;
