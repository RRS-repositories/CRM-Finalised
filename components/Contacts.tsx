
import React, { useState, useRef, useEffect } from 'react';
import {
   Search, Filter, Upload, Download, MoreHorizontal,
   Trash2, X, UserPlus, ArrowLeft, Clock as ClockIcon,
   FileText as FileIcon, Paperclip, StickyNote,
   ChevronDown, Plus, Check, Mail as MailIcon,
   Phone as PhoneIcon, Calendar as CalendarIcon,
   MapPin, CreditCard, Sparkles, MessageSquare as MessageIcon,
   Eye, File as GenericFileIcon, AlertTriangle, Edit, FileUp
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Contact, ClaimStatus, Claim, Document } from '../types';
import BulkImport from './BulkImport';

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
const formatTimeAgo = (dateString: string) => {
   const date = new Date(dateString);
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
};

// --- Sub-Component: Contact Detail View ---
const ContactDetailView = ({ contactId, onBack }: { contactId: string, onBack: () => void }) => {
   const { contacts, documents, claims, activityLogs, addClaim, updateClaim, updateContact, setActiveContext, addNote, addDocument } = useCRM();
   const contact = contacts.find(c => c.id === contactId);
   const contactClaims = claims.filter(c => c.contactId === contactId);

   const [activeTab, setActiveTab] = useState<'documents' | 'notes'>('documents');
   const [expandedClaimId, setExpandedClaimId] = useState<string | null>(contactClaims[0]?.id || null);

   // Modals & Forms
   const [showAddClaim, setShowAddClaim] = useState(false);
   const [showEditPersonal, setShowEditPersonal] = useState(false);
   const [showStatusUpdate, setShowStatusUpdate] = useState<string | null>(null);
   const [showUploadModal, setShowUploadModal] = useState(false);
   const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

   const [newClaimData, setNewClaimData] = useState<Partial<Claim>>({ claimValue: 0, status: ClaimStatus.NEW_LEAD });
   const [editPersonalData, setEditPersonalData] = useState<Partial<Contact>>({});

   // Note State
   const [newNote, setNewNote] = useState('');

   // Upload State
   const [uploadFile, setUploadFile] = useState<File | null>(null);

   // Multi-Lender Selection State for Add Claim
   const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
   const [isLenderDropdownOpen, setIsLenderDropdownOpen] = useState(false);
   const dropdownRef = useRef<HTMLDivElement>(null);

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

   const toggleLender = (lender: string) => {
      setSelectedLenders(prev =>
         prev.includes(lender) ? prev.filter(l => l !== lender) : [...prev, lender]
      );
   };

   if (!contact) return <div className="p-6">Contact not found. <button onClick={onBack} className="text-blue-600 underline ml-2">Back</button></div>;

   const contactDocs = documents.filter(d => d.associatedContactId === contactId);

   // Filter logs for this contact
   const timeline = activityLogs
      .filter(log => log.contactId === contactId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

   const notesList = activityLogs
      .filter(log => log.contactId === contactId && log.type === 'note')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
         category: 'Client',
         associatedContactId: contact.id,
         size: `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`,
      }, uploadFile);

      setShowUploadModal(false);
      setUploadFile(null);
   };

   return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 animate-in fade-in duration-200 relative transition-colors">
         {/* Header */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center shadow-sm sticky top-0 z-20">
            <div className="flex items-center gap-4">
               <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                  <ArrowLeft size={20} />
               </button>
               <div>
                  <h1 className="text-xl font-bold text-navy-900 dark:text-white">{contact.fullName}</h1>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                     <span>ID: {contact.id}</span>
                     <span>•</span>
                     <span className="flex items-center gap-1"><ClockIcon size={10} /> Last active: {contact.lastActivity}</span>
                  </div>
               </div>
            </div>
            <div className="flex gap-3">
               <span className={`px-3 py-1 rounded-full text-sm font-bold border ${getStatusColor(contact.status)}`}>
                  {contact.status}
               </span>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-12 gap-6">

               {/* LEFT COLUMN: Personal Details */}
               <div className="col-span-12 lg:col-span-3 space-y-6">
                  {/* Personal Info Card */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                     <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-navy-900 dark:text-white text-sm">Personal Details</h3>
                        <button onClick={openEditPersonal} className="text-xs text-blue-600 dark:text-blue-400 hover:underline border border-blue-200 dark:border-blue-900 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20">Edit</button>
                     </div>
                     <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-navy-100 dark:bg-navy-800 flex items-center justify-center text-navy-700 dark:text-white font-bold text-lg">
                              {contact.fullName.charAt(0)}
                           </div>
                           <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{contact.fullName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Client</p>
                           </div>
                        </div>
                        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 pt-2">
                           <div className="flex items-center gap-2 group">
                              <div className="p-1.5 bg-gray-50 dark:bg-slate-700 rounded text-gray-400 group-hover:text-blue-500 transition-colors"><MailIcon size={14} /></div>
                              <a href={`mailto:${contact.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 truncate flex-1" title={contact.email}>{contact.email}</a>
                           </div>
                           <div className="flex items-center gap-2 group">
                              <div className="p-1.5 bg-gray-50 dark:bg-slate-700 rounded text-gray-400 group-hover:text-green-500 transition-colors"><PhoneIcon size={14} /></div>
                              <a href={`tel:${contact.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 flex-1">{contact.phone}</a>
                           </div>
                           <div className="flex items-center gap-2 group">
                              <div className="p-1.5 bg-gray-50 dark:bg-slate-700 rounded text-gray-400 group-hover:text-purple-500 transition-colors"><CalendarIcon size={14} /></div>
                              <span className="flex-1">{formatDateOfBirth(contact.dateOfBirth)}</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Address Card */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                     <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                        <h3 className="font-bold text-navy-900 dark:text-white text-sm">Address</h3>
                     </div>
                     <div className="p-4 text-sm text-gray-600 dark:text-gray-300 space-y-3">
                        <div className="flex items-start gap-2">
                           <div className="p-1.5 bg-gray-50 dark:bg-slate-700 rounded text-gray-400 mt-0.5"><MapPin size={14} /></div>
                           <div className="flex-1 leading-relaxed">
                              {contact.address && (contact.address.line1 || contact.address.city || contact.address.postalCode) ? (
                                 <>
                                    <p className="font-medium text-gray-900 dark:text-white">{contact.address.line1}</p>
                                    {contact.address.line2 && <p>{contact.address.line2}</p>}
                                    <p>{[contact.address.city, contact.address.postalCode].filter(Boolean).join(', ')}</p>
                                 </>
                              ) : <p className="text-gray-400 italic">No address provided</p>}
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* CENTER COLUMN: Claims / Opportunities */}
               <div className="col-span-12 lg:col-span-5 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-4 flex-shrink-0">
                     <h2 className="text-lg font-bold text-navy-900 dark:text-white">Claims Portfolio</h2>
                     <button
                        onClick={() => setShowAddClaim(true)}
                        className="text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-navy-700 dark:text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm"
                     >
                        <Plus size={14} /> Add Claim
                     </button>
                  </div>

                  {/* Independent Scroll Container for Claims */}
                  <div
                     className="space-y-4 overflow-y-auto pr-2 h-[500px] pb-2"
                     style={{ scrollbarGutter: 'stable' }}
                  >
                     {contactClaims.map((claim) => (
                        <div key={claim.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-300 ${expandedClaimId === claim.id ? 'border-brand-orange ring-1 ring-brand-orange ring-opacity-20' : 'border-gray-200 dark:border-slate-700 hover:shadow-md'}`}>
                           {/* Always visible Header */}
                           <div
                              className="p-4 flex justify-between items-center cursor-pointer select-none"
                              onClick={() => setExpandedClaimId(expandedClaimId === claim.id ? null : claim.id)}
                           >
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${claim.status === ClaimStatus.CLAIM_SUCCESSFUL ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                    <CreditCard size={24} />
                                 </div>
                                 <div>
                                    <h3 className="font-bold text-navy-900 dark:text-white text-sm md:text-base">{claim.lender} Claim</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">Ref: {claim.id}</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-4">
                                 <div className="text-right hidden sm:block">
                                    <p className="text-sm font-bold text-green-600 dark:text-green-400">£{(claim.claimValue || 0).toLocaleString()}</p>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Est. Value</p>
                                 </div>
                                 <div className={`transition-transform duration-300 ${expandedClaimId === claim.id ? 'rotate-180' : ''}`}>
                                    <ChevronDown size={18} className="text-gray-400" />
                                 </div>
                              </div>
                           </div>

                           {/* Smoothly Animated Content Area */}
                           <div
                              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expandedClaimId === claim.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                           >
                              <div className="overflow-hidden">
                                 <div className="bg-gray-50 dark:bg-slate-700/50 border-t border-gray-100 dark:border-slate-700 p-5">
                                    <div className="grid grid-cols-2 gap-4 mb-5">
                                       <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Current Stage</p>
                                          <p className="text-sm font-bold text-navy-900 dark:text-white">{claim.status}</p>
                                       </div>
                                       <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Time in Stage</p>
                                          <p className="text-sm font-bold text-navy-900 dark:text-white">{claim.daysInStage || 0} Days</p>
                                       </div>
                                    </div>

                                    <div className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm mb-5">
                                       <div className="flex justify-between text-xs py-1 border-b border-gray-100 dark:border-slate-700 border-dashed">
                                          <span className="text-gray-500 dark:text-gray-400">Product Type</span>
                                          <span className="font-medium text-gray-900 dark:text-white">{claim.productType || 'Unknown'}</span>
                                       </div>
                                       <div className="flex justify-between text-xs py-1 border-b border-gray-100 dark:border-slate-700 border-dashed">
                                          <span className="text-gray-500 dark:text-gray-400">Account Number</span>
                                          <span className="font-medium text-gray-900 dark:text-white font-mono">{claim.accountNumber || '****'}</span>
                                       </div>
                                       <div className="flex justify-between text-xs py-1">
                                          <span className="text-gray-500 dark:text-gray-400">Start Date</span>
                                          <span className="font-medium text-gray-900 dark:text-white">{claim.startDate || 'N/A'}</span>
                                       </div>
                                    </div>

                                    <div className="flex gap-3">
                                       <button
                                          onClick={() => setShowStatusUpdate(claim.id)}
                                          className="flex-1 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold py-2.5 rounded-lg transition-colors shadow-sm"
                                       >
                                          Update Status
                                       </button>
                                       <button
                                          onClick={scrollToDocuments}
                                          className="flex-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-white text-xs font-bold py-2.5 rounded-lg transition-colors shadow-sm"
                                       >
                                          View Documents
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}

                     {contactClaims.length === 0 && (
                        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                           <p>No claims found. Add one to get started.</p>
                        </div>
                     )}
                  </div>
               </div>

               {/* RIGHT COLUMN: Activity & Actions */}
               <div className="col-span-12 lg:col-span-4 space-y-6">

                  {/* Quick Actions */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5">
                     <h3 className="font-bold text-navy-900 dark:text-white text-sm mb-4 flex items-center gap-2">
                        <Sparkles size={14} className="text-brand-orange" /> Quick Actions
                     </h3>
                     <div className="grid grid-cols-2 gap-3">
                        <button className="flex flex-col items-center justify-center p-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg transition-colors gap-2 border border-blue-100 dark:border-blue-800">
                           <MailIcon size={18} />
                           <span className="text-xs font-bold">Email</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg transition-colors gap-2 border border-green-100 dark:border-green-800">
                           <MessageIcon size={18} />
                           <span className="text-xs font-bold">SMS</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg transition-colors gap-2 border border-purple-100 dark:border-purple-800">
                           <PhoneIcon size={18} />
                           <span className="text-xs font-bold">Call</span>
                        </button>
                        <button className="flex flex-col items-center justify-center p-3 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-lg transition-colors gap-2 border border-orange-100 dark:border-orange-800">
                           <FileIcon size={18} />
                           <span className="text-xs font-bold">Gen LOA</span>
                        </button>
                     </div>
                  </div>

                  {/* Timeline */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 max-h-[400px] overflow-y-auto">
                     <h3 className="font-bold text-navy-900 dark:text-white text-sm mb-4 sticky top-0 bg-white dark:bg-slate-800 z-10">Activity Timeline</h3>
                     <div className="space-y-5 relative pl-2">
                        <div className="absolute left-3.5 top-2 bottom-2 w-px bg-gray-100 dark:bg-slate-700"></div>
                        {timeline.length > 0 ? timeline.map((item) => (
                           <div key={item.id} className="relative flex items-start gap-3 pl-2 group">
                              <div className={`w-3 h-3 rounded-full border-2 shadow-sm shrink-0 z-10 mt-1.5 group-hover:scale-110 transition-transform ${item.type === 'creation' ? 'bg-green-500 border-green-100' :
                                 item.type === 'status_change' ? 'bg-blue-500 border-blue-100' :
                                    item.type === 'communication' ? 'bg-purple-500 border-purple-100' :
                                       'bg-gray-400 border-gray-100'
                                 }`}></div>
                              <div className="pb-1 w-full">
                                 <div className="flex justify-between items-start">
                                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{item.title}</p>
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{formatTimeAgo(item.date)}</span>
                                 </div>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{item.description}</p>
                              </div>
                           </div>
                        )) : (
                           <p className="text-xs text-gray-400 text-center py-4">No recent activity.</p>
                        )}
                     </div>
                  </div>
               </div>
            </div>

            {/* BOTTOM SECTION: Documents & Notes */}
            <div id="documents-section" className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
               <div className="flex border-b border-gray-200 dark:border-slate-700 justify-between items-center pr-4">
                  <div className="flex">
                     <button
                        onClick={() => setActiveTab('documents')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'documents' ? 'border-brand-orange text-navy-900 dark:text-white bg-gray-50/50 dark:bg-slate-700/50' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                     >
                        <Paperclip size={16} /> Document Library
                     </button>
                     <button
                        onClick={() => setActiveTab('notes')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notes' ? 'border-brand-orange text-navy-900 dark:text-white bg-gray-50/50 dark:bg-slate-700/50' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                     >
                        <StickyNote size={16} /> Notes
                     </button>
                  </div>
                  {activeTab === 'documents' && (
                     <button
                        onClick={() => setShowUploadModal(true)}
                        className="text-xs font-bold bg-navy-700 hover:bg-navy-800 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm"
                     >
                        <Upload size={14} /> Upload Document
                     </button>
                  )}
               </div>
               <div className="p-6">
                  {activeTab === 'documents' ? (
                     <div className="overflow-x-auto">
                        {contactDocs.length > 0 ? (
                           <table className="w-full text-left">
                              <thead>
                                 <tr className="border-b border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                                    <th className="py-3 pl-2">Name</th>
                                    <th className="py-3">Type</th>
                                    <th className="py-3">Date</th>
                                    <th className="py-3 text-right pr-2">Action</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {contactDocs.map(doc => (
                                    <tr key={doc.id} className="border-b border-gray-50 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                       <td className="py-3 pl-2 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-3">
                                          <div className="p-1.5 bg-blue-50 dark:bg-slate-600 rounded text-blue-600 dark:text-blue-400"><FileIcon size={14} /></div>
                                          {doc.name}
                                       </td>
                                       <td className="py-3 text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{doc.type}</td>
                                       <td className="py-3 text-xs text-gray-500 dark:text-gray-400">{doc.dateModified}</td>
                                       <td className="py-3 pr-2 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                             <button
                                                onClick={() => setPreviewDoc(doc)}
                                                className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title="Preview"
                                             >
                                                <Eye size={16} />
                                             </button>
                                             {/* Download Button Logic */}
                                             {doc.url ? (
                                                <a
                                                   href={doc.url}
                                                   download={doc.name}
                                                   className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                                >
                                                   Download
                                                </a>
                                             ) : (
                                                <button disabled className="text-xs text-gray-400 font-medium cursor-not-allowed">
                                                   Download
                                                </button>
                                             )}
                                          </div>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        ) : (
                           <div className="text-center py-12 text-gray-400 text-sm border-2 border-dashed border-gray-100 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800">
                              <FileIcon size={32} className="mx-auto mb-2 opacity-20" />
                              No documents linked to this contact.
                           </div>
                        )}
                     </div>
                  ) : (
                     <div className="space-y-4 max-w-3xl">
                        {/* Add Note Input */}
                        <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg border border-gray-200 dark:border-slate-600 mb-6">
                           <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Add New Note</h4>
                           <textarea
                              value={newNote}
                              onChange={(e) => setNewNote(e.target.value)}
                              className="w-full p-3 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-navy-600 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                              placeholder="Type a note about this contact..."
                              rows={3}
                           />
                           <div className="flex justify-end mt-2">
                              <button
                                 onClick={handleAddNote}
                                 disabled={!newNote.trim()}
                                 className="bg-navy-700 hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                              >
                                 Save Note
                              </button>
                           </div>
                        </div>

                        {/* Notes List */}
                        {notesList.length > 0 ? (
                           notesList.map((note) => (
                              <div key={note.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-100 dark:border-slate-700 flex gap-3 shadow-sm">
                                 <StickyNote className="text-yellow-500 shrink-0 mt-0.5" size={18} />
                                 <div>
                                    <div className="flex items-center gap-2 mb-1">
                                       <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{note.title}</p>
                                       <span className="text-[10px] text-gray-400">• {formatTimeAgo(note.date)}</span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{note.description}</p>
                                 </div>
                              </div>
                           ))
                        ) : (
                           <div className="text-center py-8 text-gray-400 text-sm">
                              No notes found for this contact.
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </div>
         </div>

         {/* Upload Modal */}
         {showUploadModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Upload Document</h3>
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
                  <div className="flex justify-end gap-3 mt-6">
                     <button onClick={() => { setShowUploadModal(false); setUploadFile(null); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm">Cancel</button>
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

         {/* Preview Modal */}
         {previewDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-navy-50 dark:bg-slate-700">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-slate-600 rounded shadow-sm">
                           <FileIcon className="text-blue-500" size={20} />
                        </div>
                        <div>
                           <h3 className="font-bold text-navy-900 dark:text-white">{previewDoc.name}</h3>
                           <p className="text-xs text-gray-500 dark:text-gray-400">{previewDoc.size} • {previewDoc.dateModified}</p>
                        </div>
                     </div>
                     <button onClick={() => setPreviewDoc(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                        <X size={24} />
                     </button>
                  </div>
                  <div className="flex-1 bg-gray-100 dark:bg-slate-900 p-8 overflow-y-auto flex items-center justify-center">
                     {/* Render Image from URL */}
                     {(previewDoc.type === 'image' || previewDoc.name.match(/\.(jpg|jpeg|png|gif)$/i)) && previewDoc.url ? (
                        <div className="relative">
                           <img src={previewDoc.url} alt="Preview" className="max-w-full max-h-[60vh] shadow-lg rounded" />
                        </div>
                     ) : (
                        <div className="bg-white dark:bg-slate-800 w-[600px] h-[400px] shadow-lg rounded-xl flex flex-col items-center justify-center text-center p-8 border border-gray-200 dark:border-slate-700">
                           <GenericFileIcon size={64} className="mb-4 text-gray-300 dark:text-slate-600" />
                           <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Preview Unavailable</p>
                           <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm">
                              This file type cannot be previewed directly. Please download the file to view its contents.
                           </p>
                           {previewDoc.url && (
                              <a
                                 href={previewDoc.url}
                                 download={previewDoc.name}
                                 className="mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                              >
                                 <Download size={16} /> Download File
                              </a>
                           )}
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
