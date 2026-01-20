
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
import { Contact, ClaimStatus, Claim, Document, CRMCommunication, WorkflowTrigger, CRMNote, ActionLogEntry, ClaimStatusSpec, BankDetails } from '../types';
import { SPEC_LENDERS, FINANCE_TYPES, WORKFLOW_TYPES, SPEC_STATUS_COLORS, DOCUMENT_CATEGORIES, getSpecStatusColor, SMS_TEMPLATES, EMAIL_TEMPLATES, WHATSAPP_TEMPLATES, CALL_OUTCOMES } from '../constants';
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

// --- Helper for Status Colors ---
const getStatusColor = (status: string) => {
   if (status.includes('New') || status.includes('Lead')) return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
   if (status.includes('Paid') || status.includes('Offer')) return 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
   if (status.includes('Pending') || status.includes('Wait')) return 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
   if (status.includes('Verified')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
   return 'bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
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
      contacts, documents, claims, activityLogs: legacyActivityLogs, addClaim, updateClaim, updateContact, setActiveContext, addNote, addDocument,
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
   const [showEditPersonal, setShowEditPersonal] = useState(false);
   const [showStatusUpdate, setShowStatusUpdate] = useState<string | null>(null);
   const [showUploadModal, setShowUploadModal] = useState(false);
   const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

   const [newClaimData, setNewClaimData] = useState<Partial<Claim>>({ claimValue: 0, status: ClaimStatus.NEW_LEAD });
   const [editPersonalData, setEditPersonalData] = useState<Partial<Contact>>({});

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
   const [previousAddress, setPreviousAddress] = useState({
      line1: '',
      line2: '',
      city: '',
      county: '',
      postalCode: ''
   });

   // Timeline Filter
   const [timelineFilter, setTimelineFilter] = useState<string>('all');

   // Claim File View (detailed view for individual claim)
   const [viewingClaimId, setViewingClaimId] = useState<string | null>(null);
   const [claimFileData, setClaimFileData] = useState<any>(null);
   const [claimFileForm, setClaimFileForm] = useState({
      lender: '',
      lenderOther: '',
      financeType: '',
      financeTypeOther: '',
      accountNumber: '',
      numberOfLoans: '',
      lenderReference: '',
      datesTimeline: '',
      apr: '',
      outstandingBalance: '',
      dsarReview: '',
      complaintParagraph: '',
      offerMade: '',
      latePaymentCharges: '',
      billedFinanceCharges: '',
      totalRefund: '',
      totalDebt: '',
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

   // Initialize bank details and previous address from contact
   useEffect(() => {
      if (contact) {
         if (contact.bankDetails) {
            setBankDetails(contact.bankDetails);
         }
         if (contact.previousAddressObj) {
            setPreviousAddress({
               line1: contact.previousAddressObj.line1 || '',
               line2: contact.previousAddressObj.line2 || '',
               city: contact.previousAddressObj.city || '',
               county: contact.previousAddressObj.state_county || '',
               postalCode: contact.previousAddressObj.postalCode || ''
            });
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

   const openEditPersonal = () => {
      setEditPersonalData({
         firstName: contact.firstName,
         lastName: contact.lastName,
         email: contact.email,
         phone: contact.phone,
         dateOfBirth: contact.dateOfBirth,
         address: contact.address ? { ...contact.address } : { line1: '', line2: '', city: '', postalCode: '' }
      });
      setShowEditPersonal(true);
   };

   const savePersonalDetails = () => {
      updateContact({
         ...contact,
         ...editPersonalData,
         fullName: `${editPersonalData.firstName} ${editPersonalData.lastName}`
      });
      setShowEditPersonal(false);
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
   const handleSaveBankDetails = async () => {
      await updateContactExtended(contact.id, { bankDetails });
   };

   const handleSavePreviousAddress = async () => {
      await updateContactExtended(contact.id, { previousAddress });
   };

   // Open claim file view
   const handleOpenClaimFile = async (claimId: string) => {
      setViewingClaimId(claimId);
      const fullClaim = await fetchFullClaim(claimId);
      setClaimFileData(fullClaim);

      // Also get the basic claim data from local state
      const basicClaim = claims.find(c => c.id === claimId);

      // Populate form with fetched data
      if (fullClaim || basicClaim) {
         setClaimFileForm({
            lender: fullClaim?.lender || basicClaim?.lender || '',
            lenderOther: fullClaim?.lender_other || '',
            financeType: fullClaim?.finance_type || '',
            financeTypeOther: fullClaim?.finance_type_other || '',
            accountNumber: fullClaim?.account_number || basicClaim?.accountNumber || '',
            numberOfLoans: fullClaim?.number_of_loans?.toString() || '',
            lenderReference: fullClaim?.lender_reference || '',
            datesTimeline: fullClaim?.dates_timeline || '',
            apr: fullClaim?.apr?.toString() || '',
            outstandingBalance: fullClaim?.outstanding_balance?.toString() || '',
            dsarReview: fullClaim?.dsar_review || '',
            complaintParagraph: fullClaim?.complaint_paragraph || '',
            offerMade: fullClaim?.offer_made?.toString() || '',
            latePaymentCharges: fullClaim?.late_payment_charges?.toString() || '',
            billedFinanceCharges: fullClaim?.billed_finance_charges?.toString() || '',
            totalRefund: fullClaim?.total_refund?.toString() || '',
            totalDebt: fullClaim?.total_debt?.toString() || '',
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
         lender: '',
         lenderOther: '',
         financeType: '',
         financeTypeOther: '',
         accountNumber: '',
         numberOfLoans: '',
         lenderReference: '',
         datesTimeline: '',
         apr: '',
         outstandingBalance: '',
         dsarReview: '',
         complaintParagraph: '',
         offerMade: '',
         latePaymentCharges: '',
         billedFinanceCharges: '',
         totalRefund: '',
         totalDebt: '',
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
            lender: claimFileForm.lender,
            lender_other: claimFileForm.lenderOther,
            finance_type: claimFileForm.financeType,
            finance_type_other: claimFileForm.financeTypeOther,
            account_number: claimFileForm.accountNumber,
            number_of_loans: claimFileForm.numberOfLoans ? parseInt(claimFileForm.numberOfLoans) : null,
            lender_reference: claimFileForm.lenderReference,
            dates_timeline: claimFileForm.datesTimeline,
            apr: claimFileForm.apr ? parseFloat(claimFileForm.apr) : null,
            outstanding_balance: claimFileForm.outstandingBalance ? parseFloat(claimFileForm.outstandingBalance) : null,
            dsar_review: claimFileForm.dsarReview,
            complaint_paragraph: claimFileForm.complaintParagraph,
            offer_made: claimFileForm.offerMade ? parseFloat(claimFileForm.offerMade) : null,
            late_payment_charges: claimFileForm.latePaymentCharges ? parseFloat(claimFileForm.latePaymentCharges) : null,
            billed_finance_charges: claimFileForm.billedFinanceCharges ? parseFloat(claimFileForm.billedFinanceCharges) : null,
            total_refund: claimFileForm.totalRefund ? parseFloat(claimFileForm.totalRefund) : null,
            total_debt: claimFileForm.totalDebt ? parseFloat(claimFileForm.totalDebt) : null,
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
   const handleDeleteClaim = async () => {
      if (!viewingClaimId) return;
      // TODO: Add actual delete API call when available
      // For now just close the view
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
         // Use full backend URL (port 5000) instead of relative path
         const apiUrl = `http://localhost:5000/api/contacts/${contact.id}/generate-loa-link`;
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
         {/* CRM Specification Header - Client ID + Name + Quick Actions */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 shadow-sm sticky top-0 z-20">
            <div className="flex justify-between items-center">
               <div className="flex items-center gap-4">
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                     <ArrowLeft size={20} />
                  </button>
                  <div className="flex flex-col">
                     <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {contact.clientId || `ID-${contact.id}`}
                     </span>
                     <h1 className="text-xl font-bold text-navy-900 dark:text-white">{contact.fullName}</h1>
                  </div>
               </div>

               {/* Quick Action Buttons (2x2 Grid) */}
               <div className="grid grid-cols-4 gap-2">
                  <button
                     onClick={() => setShowSMSModal(true)}
                     className="flex flex-col items-center justify-center p-2 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg transition-colors border border-green-100 dark:border-green-800"
                     title="Send SMS"
                  >
                     <MessageIcon size={16} />
                     <span className="text-[10px] font-bold mt-0.5">SMS</span>
                  </button>
                  <button
                     onClick={() => setShowCallModal(true)}
                     className="flex flex-col items-center justify-center p-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg transition-colors border border-purple-100 dark:border-purple-800"
                     title="Log Call"
                  >
                     <PhoneIcon size={16} />
                     <span className="text-[10px] font-bold mt-0.5">Call</span>
                  </button>
                  <button
                     onClick={() => setShowEmailModal(true)}
                     className="flex flex-col items-center justify-center p-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg transition-colors border border-blue-100 dark:border-blue-800"
                     title="Send Email"
                  >
                     <MailIcon size={16} />
                     <span className="text-[10px] font-bold mt-0.5">Email</span>
                  </button>
                  <button
                     onClick={() => setShowWhatsAppModal(true)}
                     className="flex flex-col items-center justify-center p-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-800"
                     title="WhatsApp"
                  >
                     <MessageIcon size={16} />
                     <span className="text-[10px] font-bold mt-0.5">WhatsApp</span>
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
                        ? 'border-brand-orange text-navy-900 dark:text-white'
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
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex justify-between items-center">
                           <h3 className="font-bold text-navy-900 dark:text-white text-sm">Personal Information</h3>
                           <button onClick={openEditPersonal} className="text-xs text-blue-600 dark:text-blue-400 hover:underline border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20">Edit</button>
                        </div>
                        <div className="p-4 space-y-4">
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
                        </div>
                     </div>

                     {/* Current Address */}
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mt-6">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                           <h3 className="font-bold text-navy-900 dark:text-white text-sm flex items-center gap-2">
                              <MapPin size={14} /> Current Address
                           </h3>
                        </div>
                        <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                           {contact.address && (contact.address.line1 || contact.address.city || contact.address.postalCode) ? (
                              <div className="space-y-1">
                                 <p className="font-medium text-gray-900 dark:text-white">{contact.address.line1}</p>
                                 {contact.address.line2 && <p>{contact.address.line2}</p>}
                                 <p>{contact.address.city}</p>
                                 <p>{contact.address.state_county}</p>
                                 <p className="font-mono">{contact.address.postalCode}</p>
                              </div>
                           ) : <p className="text-gray-400 italic">No address provided</p>}
                        </div>
                     </div>
                  </div>

                  {/* Previous Address & Bank Details */}
                  <div className="col-span-12 lg:col-span-6 space-y-6">
                     {/* Previous Address */}
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex justify-between items-center">
                           <h3 className="font-bold text-navy-900 dark:text-white text-sm flex items-center gap-2">
                              <History size={14} /> Previous Address
                           </h3>
                        </div>
                        <div className="p-4 space-y-3">
                           <div className="grid grid-cols-2 gap-3">
                              <div className="col-span-2">
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 1</label>
                                 <input
                                    type="text"
                                    value={previousAddress.line1}
                                    onChange={(e) => setPreviousAddress({ ...previousAddress, line1: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 />
                              </div>
                              <div className="col-span-2">
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Address Line 2</label>
                                 <input
                                    type="text"
                                    value={previousAddress.line2}
                                    onChange={(e) => setPreviousAddress({ ...previousAddress, line2: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">City</label>
                                 <input
                                    type="text"
                                    value={previousAddress.city}
                                    onChange={(e) => setPreviousAddress({ ...previousAddress, city: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">County</label>
                                 <input
                                    type="text"
                                    value={previousAddress.county}
                                    onChange={(e) => setPreviousAddress({ ...previousAddress, county: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Postcode</label>
                                 <input
                                    type="text"
                                    value={previousAddress.postalCode}
                                    onChange={(e) => setPreviousAddress({ ...previousAddress, postalCode: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 />
                              </div>
                              <div className="flex items-end">
                                 <button
                                    onClick={handleSavePreviousAddress}
                                    className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium"
                                 >
                                    Save
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Bank Details */}
                     <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                           <h3 className="font-bold text-navy-900 dark:text-white text-sm flex items-center gap-2">
                              <Building2 size={14} /> Bank Details
                           </h3>
                        </div>
                        <div className="p-4 space-y-3">
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
                        <div className="flex justify-between items-center mb-4">
                           <h2 className="text-lg font-bold text-navy-900 dark:text-white">ACTIVE CLAIMS</h2>
                           <div className="flex items-center gap-3">
                              <button
                                 onClick={handleGenerateLoaLink}
                                 disabled={generatingLoaLink}
                                 className="text-xs font-bold bg-brand-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                              >
                                 {generatingLoaLink ? (
                                    <>
                                       <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                       Generating...
                                    </>
                                 ) : (
                                    <>
                                       <FileCheck size={14} /> Generate LOA Link
                                    </>
                                 )}
                              </button>
                              <button
                                 onClick={() => setShowAddClaim(true)}
                                 className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                              >
                                 <Plus size={14} /> New Claim
                              </button>
                           </div>
                        </div>

                        <div className="space-y-3">
                           {contactClaims.map((claim) => (
                              <div key={claim.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
                                 <div className="p-4">
                                    <div className="flex items-center justify-between">
                                       <div>
                                          <h3 className="font-bold text-navy-900 dark:text-white text-base">{claim.lender}</h3>
                                          <div className="flex items-center gap-4 mt-2">
                                             <div
                                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                                                style={{ backgroundColor: `${getSpecStatusColor(claim.status)}20`, color: getSpecStatusColor(claim.status) }}
                                             >
                                                <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getSpecStatusColor(claim.status) }}></span>
                                                {claim.status}
                                             </div>
                                             <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                Reference: {claim.caseNumber || claim.id}
                                             </span>
                                          </div>
                                       </div>
                                       <button
                                          onClick={() => handleOpenClaimFile(claim.id)}
                                          className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-2"
                                       >
                                          Open File <ArrowLeft size={14} className="rotate-180" />
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           ))}

                           {contactClaims.length === 0 && (
                              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                                 <Briefcase size={48} className="mx-auto mb-3 opacity-20" />
                                 <p>No claims found. Add one to get started.</p>
                              </div>
                           )}
                        </div>
                     </>
                  )}

                  {/* INDIVIDUAL CLAIM FILE VIEW */}
                  {viewingClaimId && (
                     <div className="space-y-6">
                        {/* Header with Back, Save, Delete */}
                        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-4">
                           <button
                              onClick={handleCloseClaimFile}
                              className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-navy-700 dark:hover:text-white transition-colors"
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

                        {/* CLAIM STATUS SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Claim Status</h3>
                           <div className="flex items-center gap-4">
                              <label className="text-sm text-gray-600 dark:text-gray-400">Status:</label>
                              <select
                                 value={claimFileForm.specStatus}
                                 onChange={(e) => setClaimFileForm({ ...claimFileForm, specStatus: e.target.value })}
                                 className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 style={{ borderLeftWidth: '4px', borderLeftColor: getSpecStatusColor(claimFileForm.specStatus) }}
                              >
                                 <option value="New Claim">New Claim</option>
                                 <option value="LOA Sent">LOA Sent</option>
                                 <option value="Awaiting DSAR">Awaiting DSAR</option>
                                 <option value="DSAR Received">DSAR Received</option>
                                 <option value="Complaint Submitted">Complaint Submitted</option>
                                 <option value="FRL Received">FRL Received</option>
                                 <option value="Counter Submitted">Counter Submitted</option>
                                 <option value="FOS Referred">FOS Referred</option>
                                 <option value="Offer Made">Offer Made</option>
                                 <option value="Accepted">Accepted</option>
                                 <option value="Payment Received">Payment Received</option>
                                 <option value="Closed - Won">Closed - Won</option>
                                 <option value="Closed - Lost">Closed - Lost</option>
                              </select>
                           </div>
                           <p className="text-xs text-gray-400 mt-2">Selection updates claims list view and logs to Action Timeline</p>
                        </div>

                        {/* CLAIM DETAILS SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Claim Details</h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Lender</label>
                                 <select
                                    value={claimFileForm.lender}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, lender: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 >
                                    <option value="">Select Lender...</option>
                                    {SPEC_LENDERS.map(lender => (
                                       <option key={lender} value={lender}>{lender}</option>
                                    ))}
                                 </select>
                              </div>
                              {claimFileForm.lender === 'Other (specify)' && (
                                 <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Other Lender (specify)</label>
                                    <input
                                       type="text"
                                       value={claimFileForm.lenderOther}
                                       onChange={(e) => setClaimFileForm({ ...claimFileForm, lenderOther: e.target.value })}
                                       className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                       placeholder="Enter lender name"
                                    />
                                 </div>
                              )}
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type of Finance</label>
                                 <select
                                    value={claimFileForm.financeType}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, financeType: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                 >
                                    <option value="">Select Type...</option>
                                    {FINANCE_TYPES.map(type => (
                                       <option key={type} value={type}>{type}</option>
                                    ))}
                                 </select>
                              </div>
                              {claimFileForm.financeType === 'Other (specify)' && (
                                 <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Other Finance Type (specify)</label>
                                    <input
                                       type="text"
                                       value={claimFileForm.financeTypeOther}
                                       onChange={(e) => setClaimFileForm({ ...claimFileForm, financeTypeOther: e.target.value })}
                                       className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                       placeholder="Enter finance type"
                                    />
                                 </div>
                              )}
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Account Number(s)</label>
                                 <input
                                    type="text"
                                    value={claimFileForm.accountNumber}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, accountNumber: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono"
                                    placeholder="Enter account number(s)"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Number of Loans</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.numberOfLoans}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, numberOfLoans: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0"
                                    min="0"
                                 />
                              </div>
                              <div className="md:col-span-2">
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Lender Reference</label>
                                 <input
                                    type="text"
                                    value={claimFileForm.lenderReference}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, lenderReference: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono"
                                    placeholder="Enter lender reference"
                                 />
                              </div>
                           </div>
                        </div>

                        {/* LOAN TIMELINE SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Loan Timeline</h3>
                           <div className="space-y-4">
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start Date(s) / Increased Credit Date(s) / End Date(s)</label>
                                 <textarea
                                    value={claimFileForm.datesTimeline}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, datesTimeline: e.target.value })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                                    placeholder="Enter relevant dates and timeline information..."
                                 />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">APR (%)</label>
                                    <input
                                       type="number"
                                       value={claimFileForm.apr}
                                       onChange={(e) => setClaimFileForm({ ...claimFileForm, apr: e.target.value })}
                                       className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                       placeholder="0.00"
                                       step="0.01"
                                    />
                                 </div>
                                 <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Outstanding Balance (£)</label>
                                    <input
                                       type="number"
                                       value={claimFileForm.outstandingBalance}
                                       onChange={(e) => setClaimFileForm({ ...claimFileForm, outstandingBalance: e.target.value })}
                                       className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                       placeholder="0.00"
                                       step="0.01"
                                    />
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* DSAR REVIEW SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">DSAR Review</h3>
                           <textarea
                              value={claimFileForm.dsarReview}
                              onChange={(e) => setClaimFileForm({ ...claimFileForm, dsarReview: e.target.value })}
                              rows={6}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                              placeholder="Enter DSAR analysis notes..."
                           />
                        </div>

                        {/* COMPLAINT PARAGRAPH SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Complaint Paragraph</h3>
                           <textarea
                              value={claimFileForm.complaintParagraph}
                              onChange={(e) => setClaimFileForm({ ...claimFileForm, complaintParagraph: e.target.value })}
                              rows={6}
                              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none"
                              placeholder="Enter complaint narrative..."
                           />
                        </div>

                        {/* FINANCIAL SUMMARY SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Financial Summary</h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Offer Made by Lender (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.offerMade}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, offerMade: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Late Payment Charges (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.latePaymentCharges}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, latePaymentCharges: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Billed Finance Charges (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.billedFinanceCharges}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, billedFinanceCharges: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Total Refund (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.totalRefund}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, totalRefund: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Total Debt (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.totalDebt}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, totalDebt: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                           </div>
                        </div>

                        {/* FEE CALCULATION SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wide mb-4">Fee Calculation</h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Client's Fee (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.clientFee}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, clientFee: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Our Total Fee (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.ourTotalFee}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, ourTotalFee: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fee Without VAT (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.feeWithoutVat}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, feeWithoutVat: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">VAT (20%) (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.vat}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, vat: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                              <div>
                                 <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Our Fee (Net) (£)</label>
                                 <input
                                    type="number"
                                    value={claimFileForm.ourFeeNet}
                                    onChange={(e) => setClaimFileForm({ ...claimFileForm, ourFeeNet: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="0.00"
                                    step="0.01"
                                 />
                              </div>
                           </div>
                        </div>

                        {/* CLAIM DOCUMENTS SECTION */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
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
                              {contactDocs.filter(doc => doc.category && doc.category !== 'Other').length > 0 ? (
                                 contactDocs.map((doc) => (
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
                                    <p className="text-sm">No documents uploaded yet</p>
                                 </div>
                              )}
                           </div>
                        </div>

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

                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                     <div className="space-y-6 relative pl-4">
                        <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-700"></div>
                        {filteredActionLogs.length > 0 ? filteredActionLogs.map((log) => (
                           <div key={log.id} className="relative flex items-start gap-4 pl-4">
                              <div className={`w-3 h-3 rounded-full border-2 shadow-sm shrink-0 z-10 mt-1.5 ${log.actionCategory === 'claims' ? 'bg-indigo-500 border-indigo-100' :
                                 log.actionCategory === 'communication' ? 'bg-green-500 border-green-100' :
                                    log.actionCategory === 'documents' ? 'bg-blue-500 border-blue-100' :
                                       log.actionCategory === 'notes' ? 'bg-yellow-500 border-yellow-100' :
                                          log.actionCategory === 'workflows' ? 'bg-purple-500 border-purple-100' :
                                             'bg-gray-400 border-gray-100'
                                 }`}></div>
                              <div className="flex-1 pb-4">
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
                           legacyTimeline.map((item) => (
                              <div key={item.id} className="relative flex items-start gap-4 pl-4">
                                 <div className={`w-3 h-3 rounded-full border-2 shadow-sm shrink-0 z-10 mt-1.5 ${item.type === 'creation' ? 'bg-green-500 border-green-100' :
                                    item.type === 'status_change' ? 'bg-blue-500 border-blue-100' :
                                       item.type === 'communication' ? 'bg-purple-500 border-purple-100' :
                                          'bg-gray-400 border-gray-100'
                                    }`}></div>
                                 <div className="flex-1 pb-4">
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Value (£) per claim</label>
                        <input
                           type="number"
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           value={newClaimData.claimValue}
                           onChange={e => setNewClaimData({ ...newClaimData, claimValue: Number(e.target.value) })}
                        />
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

         {/* Edit Personal Details Modal */}
         {showEditPersonal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Edit Personal Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                        <input
                           type="text"
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           value={editPersonalData.firstName || ''}
                           onChange={e => setEditPersonalData({ ...editPersonalData, firstName: e.target.value })}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                        <input
                           type="text"
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           value={editPersonalData.lastName || ''}
                           onChange={e => setEditPersonalData({ ...editPersonalData, lastName: e.target.value })}
                        />
                     </div>
                     <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                           type="email"
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                           value={editPersonalData.email || ''}
                           onChange={e => setEditPersonalData({ ...editPersonalData, email: e.target.value })}
                        />
                     </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => setShowEditPersonal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
                     <button onClick={savePersonalDetails} className="px-4 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 text-sm">Save Changes</button>
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
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
         {/* Header */}
         <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
            <h1 className="text-xl font-bold text-navy-900 dark:text-white">Contacts Directory</h1>
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
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-visible min-h-[400px]">
               <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600 rounded-t-xl">
                     <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider rounded-tl-xl">Name</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Lender</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Est. Value</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Activity</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right rounded-tr-xl">Action</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                     {filteredContacts.map(contact => (
                        <tr key={contact.id} onClick={() => handleContactClick(contact.id)} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-navy-100 dark:bg-navy-800 text-navy-700 dark:text-white flex items-center justify-center font-bold text-xs">
                                    {contact.fullName.charAt(0)}
                                 </div>
                                 <div>
                                    <div className="font-medium text-navy-900 dark:text-white text-sm">{contact.fullName}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{contact.email}</div>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(contact.status)}`}>
                                 {contact.status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{contact.lender}</td>
                           <td className="px-6 py-4 text-sm font-medium text-green-600 dark:text-green-400">£{(contact.claimValue || 0).toLocaleString()}</td>
                           <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{contact.lastActivity}</td>
                           <td className="px-6 py-4 text-right relative">
                              <button
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMenu(activeActionMenu === contact.id ? null : contact.id);
                                 }}
                                 className="text-gray-400 hover:text-navy-600 dark:hover:text-white p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                              >
                                 <MoreHorizontal size={18} />
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
