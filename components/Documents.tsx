import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
   FileText, Search, File, Download, Trash2, Tag, Eye, Edit, Save, X,
   ChevronLeft, Clock, RefreshCw, ChevronDown, ChevronRight, User,
   Send, AlertTriangle, CheckCircle, Mail, XCircle, History, ExternalLink,
   MailX, Timer, Loader2
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Document, OOTemplate, DocumentStatus } from '../types';
import Templates from './Templates';
import { API_ENDPOINTS } from '../src/config';
import { OOTemplateManager, OODocumentList } from './onlyoffice';
import { DOCUMENT_STATUS_CONFIG } from '../constants';

const Documents: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'documents' | 'templates' | 'editor'>('documents');

   return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
         {/* Tab Navigation Bar */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 pt-4 flex items-center justify-between flex-shrink-0">
            <div className="flex gap-6">
               <button
                  onClick={() => setActiveTab('documents')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'documents' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Document Files
               </button>
               <button
                  onClick={() => setActiveTab('templates')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'templates' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Template Library
               </button>
               <button
                  onClick={() => setActiveTab('editor')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'editor' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Template Editor
               </button>
            </div>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-hidden relative">
            {activeTab === 'documents' ? (
               <DocumentsContent />
            ) : activeTab === 'templates' ? (
               <Templates />
            ) : (
               <TemplateEditorTab />
            )}
         </div>
      </div>
   );
};

// --- Sub-Component: Template Editor (OnlyOffice) ---
const TemplateEditorTab: React.FC = () => {
   const [templates, setTemplates] = useState<OOTemplate[]>([]);
   const [refreshTrigger, setRefreshTrigger] = useState(0);

   return (
      <div className="h-full overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-900">
         <OOTemplateManager
            onTemplatesLoaded={setTemplates}
            onDocumentGenerated={() => setRefreshTrigger(prev => prev + 1)}
         />
         <OODocumentList templates={templates} refreshTrigger={refreshTrigger} />
      </div>
   );
};

// --- Sub-Component: Documents Content (Dashboard + Drill-down) ---
// Timeline event type
interface TimelineEvent {
   id: string;
   type: string;
   description: string;
   actorName?: string;
   timestamp: string;
   metadata?: any;
}

const DocumentsContent: React.FC = () => {
   const { documents, updateDocument, updateDocumentStatus, sendDocument, fetchDocumentTimeline, addNotification, contacts } = useCRM();
   const API_BASE_URL = API_ENDPOINTS.api;

   // View state
   const [view, setView] = useState<'dashboard' | 'list'>('dashboard');
   const [selectedStatus, setSelectedStatus] = useState<DocumentStatus | null>(null);
   const [searchQuery, setSearchQuery] = useState('');

   // Edit state
   const [editingDoc, setEditingDoc] = useState<Document | null>(null);
   const [editName, setEditName] = useState('');
   const [editCategory, setEditCategory] = useState('');
   const [editTags, setEditTags] = useState('');
   const [editStatus, setEditStatus] = useState<DocumentStatus>('Draft');

   // Timeline state (real action_logs)
   const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
   const [timelineLoading, setTimelineLoading] = useState(false);

   // Per-document timeline modal
   const [docTimelineId, setDocTimelineId] = useState<string | null>(null);
   const [docTimelineEvents, setDocTimelineEvents] = useState<TimelineEvent[]>([]);
   const [docTimelineLoading, setDocTimelineLoading] = useState(false);

   // Sending state
   const [sendingDocId, setSendingDocId] = useState<string | null>(null);

   // Delete document state
   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
   const [docToDelete, setDocToDelete] = useState<Document | null>(null);
   const [deleteConfirmText, setDeleteConfirmText] = useState('');
   const [isDeletingDoc, setIsDeletingDoc] = useState(false);
   const [deleteProgress, setDeleteProgress] = useState(0);

   const categories = ['All', 'Client', 'Correspondence', 'Legal', 'Templates', 'Other'];

   // --- Helpers ---
   const contactMap = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);

   const getClientName = (contactId?: string) => {
      if (!contactId) return '';
      return contactMap.get(contactId)?.fullName || '';
   };

   const getLenderFromDoc = (doc: Document) => {
      const docTypeTags = ['Cover Letter', 'LOA', 'T&C', 'Signature', 'Uploaded', 'Previous Address', 'Signed', 'LOA Form', 'claim-document'];
      const lenderTag = doc.tags.find(tag => !docTypeTags.includes(tag) && !tag.startsWith('Original:'));
      if (lenderTag) return lenderTag;
      const nameParts = doc.name.split('_');
      if (nameParts.length > 1) return nameParts[0].replace(/_/g, ' ');
      return '';
   };

   const isSignatureFile = (doc: Document) => {
      const lowerName = doc.name.toLowerCase();
      if (lowerName.includes('signature') || lowerName.includes('_sig')) return true;
      if (doc.tags.some(tag => tag.toLowerCase().includes('signature'))) return true;
      return false;
   };

   const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
      return dateStr;
   };

   // Non-signature documents
   const visibleDocs = useMemo(() =>
      documents.filter(doc => !isSignatureFile(doc)),
      [documents]
   );

   const getFileIcon = (type: string) => {
      switch (type) {
         case 'pdf': return <FileText className="text-red-500" size={20} />;
         case 'docx': return <FileText className="text-blue-500" size={20} />;
         case 'image': return <File className="text-purple-500" size={20} />;
         case 'txt': return <FileText className="text-gray-500" size={20} />;
         default: return <File className="text-gray-500 dark:text-gray-400" size={20} />;
      }
   };

   // --- Dashboard metrics ---
   const statusMetrics = useMemo(() => {
      const today = new Date().toISOString().split('T')[0];
      return DOCUMENT_STATUS_CONFIG.map(config => {
         const statusDocs = visibleDocs.filter(d =>
            (d.documentStatus || 'Draft') === config.status
         );
         const todayCount = statusDocs.filter(d => d.dateModified === today).length;
         return { ...config, count: statusDocs.length, todayCount };
      });
   }, [visibleDocs]);

   // --- Timeline: fetch real action_logs ---
   const fetchTimeline = useCallback(async () => {
      setTimelineLoading(true);
      try {
         const res = await fetch(`${API_BASE_URL}/actions/documents?limit=25`);
         if (!res.ok) throw new Error('Failed');
         const data = await res.json();
         const mapped: TimelineEvent[] = data.map((entry: any) => ({
            id: entry.id?.toString() || `${entry.timestamp}`,
            type: entry.action_type || 'unknown',
            description: entry.description || entry.action_type?.replace(/_/g, ' ') || '',
            actorName: entry.full_name || entry.actor_name || entry.actor_type || '',
            timestamp: entry.timestamp || entry.created_at || '',
            metadata: entry.metadata,
         }));
         setTimelineEvents(mapped);
      } catch (err) {
         console.error('Timeline fetch error:', err);
      } finally {
         setTimelineLoading(false);
      }
   }, [API_BASE_URL]);

   useEffect(() => {
      fetchTimeline();
   }, [fetchTimeline]);

   // --- Drill-down: filtered + grouped ---
   const groupedDocs = useMemo(() => {
      let filtered = visibleDocs;
      if (selectedStatus) {
         filtered = filtered.filter(d => (d.documentStatus || 'Draft') === selectedStatus);
      }
      if (searchQuery) {
         const q = searchQuery.toLowerCase();
         filtered = filtered.filter(doc =>
            doc.name.toLowerCase().includes(q) ||
            getClientName(doc.associatedContactId).toLowerCase().includes(q) ||
            getLenderFromDoc(doc).toLowerCase().includes(q)
         );
      }

      // Group by contact + lender
      const groups = new Map<string, { contactName: string; lender: string; docs: Document[] }>();
      filtered.forEach(doc => {
         const contactId = doc.associatedContactId || 'none';
         const contactName = getClientName(doc.associatedContactId) || 'No Client';
         const lender = getLenderFromDoc(doc) || 'No Lender';
         const key = `${contactId}_${lender}`;
         if (!groups.has(key)) {
            groups.set(key, { contactName, lender, docs: [] });
         }
         groups.get(key)!.docs.push(doc);
      });

      return Array.from(groups.values()).sort((a, b) =>
         a.contactName.localeCompare(b.contactName)
      );
   }, [visibleDocs, selectedStatus, searchQuery, contacts]);

   // --- Edit handlers ---
   const handleEditClick = (doc: Document) => {
      setEditingDoc(doc);
      setEditName(doc.name);
      setEditCategory(doc.category);
      setEditTags(doc.tags.join(', '));
      setEditStatus(doc.documentStatus || 'Draft');
   };

   const handleSaveDoc = () => {
      if (!editingDoc) return;
      const updatedDoc: Document = {
         ...editingDoc,
         name: editName,
         category: editCategory as any,
         tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
         dateModified: new Date().toISOString().split('T')[0],
         documentStatus: editStatus,
      };
      updateDocument(updatedDoc);
      if (editStatus !== (editingDoc.documentStatus || 'Draft')) {
         updateDocumentStatus(editingDoc.id, editStatus);
      }
      setEditingDoc(null);
   };

   const handlePreview = async (doc: Document) => {
      if (!doc.url) return;
      try {
         const res = await fetch(`${API_BASE_URL}/documents/secure-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: doc.url })
         });
         const data = await res.json();
         if (data.success && data.signedUrl) {
            window.open(data.signedUrl, '_blank');
         } else {
            addNotification('error', 'Could not open document');
         }
      } catch (err) {
         console.error('Preview error:', err);
         addNotification('error', 'Failed to generate secure link');
      }
   };

   const handleStatusClick = (status: DocumentStatus) => {
      setSelectedStatus(status);
      setSearchQuery('');
      setView('list');
   };

   const handleBackToDashboard = () => {
      setView('dashboard');
      setSelectedStatus(null);
      setSearchQuery('');
   };

   const handleSendDocument = async (doc: Document) => {
      if (sendingDocId) return;
      setSendingDocId(doc.id);
      try {
         const result = await sendDocument(doc.id);
         if (result) {
            // Refresh timeline after sending
            fetchTimeline();
         }
      } finally {
         setSendingDocId(null);
      }
   };

   const handleOpenDocTimeline = async (docId: string) => {
      setDocTimelineId(docId);
      setDocTimelineLoading(true);
      try {
         const events = await fetchDocumentTimeline(docId);
         const mapped: TimelineEvent[] = events.map((entry: any) => ({
            id: entry.id?.toString() || `${entry.timestamp || entry.occurred_at}`,
            type: entry.action_type || entry.event_type || 'unknown',
            description: entry.description || entry.action_type?.replace(/_/g, ' ') || entry.event_type || '',
            actorName: entry.actor_name || entry.actor_type || '',
            timestamp: entry.timestamp || entry.occurred_at || '',
            metadata: entry.metadata || {},
         }));
         setDocTimelineEvents(mapped);
      } catch (err) {
         console.error('Doc timeline error:', err);
         setDocTimelineEvents([]);
      } finally {
         setDocTimelineLoading(false);
      }
   };

   const handleDeleteDocClick = (doc: Document) => {
      setDocToDelete(doc);
      setShowDeleteConfirm(true);
      setDeleteConfirmText('');
   };

   const handleDeleteDocument = async () => {
      if (!docToDelete || deleteConfirmText !== 'DELETE') return;

      setIsDeletingDoc(true);
      setDeleteProgress(0);

      // Simulate progress
      const progressInterval = setInterval(() => {
         setDeleteProgress(prev => {
            if (prev >= 90) return prev;
            return prev + Math.random() * 15;
         });
      }, 200);

      try {
         const res = await fetch(`${API_BASE_URL}/documents/${docToDelete.id}`, {
            method: 'DELETE'
         });

         clearInterval(progressInterval);

         if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete document');
         }

         setDeleteProgress(100);
         await new Promise(resolve => setTimeout(resolve, 500));

         addNotification('success', `Document "${docToDelete.name}" deleted successfully`);

         // Close modal and reset state
         setShowDeleteConfirm(false);
         setDocToDelete(null);
         setDeleteConfirmText('');
      } catch (err: unknown) {
         clearInterval(progressInterval);
         const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
         console.error('Delete document error:', err);
         addNotification('error', errorMessage);
      } finally {
         setIsDeletingDoc(false);
         setDeleteProgress(0);
      }
   };

   const selectedStatusConfig = selectedStatus
      ? DOCUMENT_STATUS_CONFIG.find(c => c.status === selectedStatus)
      : null;

   const totalFilteredDocs = groupedDocs.reduce((sum, g) => sum + g.docs.length, 0);

   return (
      <div className="flex h-full bg-white dark:bg-slate-900 relative">
         <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="h-14 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
               {view === 'dashboard' ? (
                  <>
                     <h2 className="text-base font-bold text-navy-900 dark:text-white">Document Overview</h2>
                     <span className="text-xs text-gray-400 dark:text-gray-500">{visibleDocs.length} total documents</span>
                  </>
               ) : (
                  <>
                     <div className="flex items-center gap-3">
                        <button
                           onClick={handleBackToDashboard}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                        >
                           <ChevronLeft size={16} /> Back
                        </button>
                        {selectedStatusConfig && (
                           <div className="flex items-center gap-2">
                              <div
                                 className="w-3 h-3 rounded-full"
                                 style={{ backgroundColor: selectedStatusConfig.iconColor }}
                              />
                              <span className="text-sm font-bold text-navy-900 dark:text-white">
                                 {selectedStatusConfig.label}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                 ({totalFilteredDocs} document{totalFilteredDocs !== 1 ? 's' : ''})
                              </span>
                           </div>
                        )}
                     </div>
                     <div className="relative w-72">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                           type="text"
                           placeholder="Search within results..."
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full pl-8 pr-4 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                        />
                     </div>
                  </>
               )}
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
               {view === 'dashboard' ? (
                  <>
                     {/* Dashboard Grid */}
                     <div className="flex-1 overflow-y-auto p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                           {statusMetrics.map((metric, idx) => (
                              <button
                                 key={metric.status}
                                 onClick={() => handleStatusClick(metric.status)}
                                 className={`
                                    ${metric.bgClass} ${metric.borderClass}
                                    border rounded-2xl p-5 text-left transition-all duration-200
                                    cursor-pointer card-hover animate-fade-in-up
                                    flex flex-col justify-between min-h-[160px]
                                 `}
                                 style={{ animationDelay: `${(idx % 3) * 0.05 + 0.05}s` }}
                              >
                                 <div>
                                    <p className={`text-xs font-bold uppercase tracking-wider ${metric.textClass}`}>
                                       {metric.label}
                                    </p>
                                    <p className={`text-5xl font-black mt-2 leading-none ${metric.countClass}`}>
                                       {metric.count}
                                    </p>
                                    <p className={`text-[10px] mt-1.5 leading-snug ${metric.textClass} opacity-70`}>
                                       {metric.description}
                                    </p>
                                 </div>
                                 <div className="flex items-end justify-between mt-4 pt-3 border-t border-white/10">
                                    <span className={`text-xs ${metric.textClass} opacity-70`}>
                                       {metric.count} total
                                    </span>
                                    <span className={`text-xs font-semibold ${metric.textClass}`}>
                                       {metric.todayCount > 0 ? `${metric.todayCount} today` : '0 today'}
                                    </span>
                                 </div>
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Timeline Sidebar — real action_logs */}
                     <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 flex flex-col">
                        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                           <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
                              <Clock size={14} className="text-brand-orange" />
                              Timeline
                           </h3>
                           <button
                              onClick={fetchTimeline}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              title="Refresh timeline"
                           >
                              <RefreshCw size={14} className={timelineLoading ? 'animate-spin' : ''} />
                           </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                           {timelineEvents.length === 0 && !timelineLoading ? (
                              <div className="p-6 text-center text-gray-400 dark:text-gray-500">
                                 <FileText size={32} className="mx-auto mb-2 opacity-30" />
                                 <p className="text-xs">No document activity yet</p>
                              </div>
                           ) : (
                              timelineEvents.map(event => (
                                 <div
                                    key={event.id}
                                    className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                                 >
                                    <div className="flex items-start gap-3">
                                       <div className="mt-0.5 flex-shrink-0">
                                          <TimelineIcon type={event.type} />
                                       </div>
                                       <div className="min-w-0 flex-1">
                                          <p className={`text-xs font-bold truncate ${
                                             event.type === 'email_bounced' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'
                                          }`}>
                                             {formatEventDescription(event.type, event.description)}
                                          </p>
                                          {event.actorName && (
                                             <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                {event.actorName}
                                             </p>
                                          )}
                                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                             {formatTimestamp(event.timestamp)}
                                          </p>
                                       </div>
                                    </div>
                                 </div>
                              ))
                           )}
                        </div>
                     </div>
                  </>
               ) : (
                  /* Drill-down List View */
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
                     {groupedDocs.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                           <FileText size={48} className="mx-auto mb-4 opacity-20" />
                           <p className="text-sm">No documents found{selectedStatus ? ` with status "${selectedStatus}"` : ''}.</p>
                        </div>
                     ) : (
                        <div className="space-y-4">
                           {groupedDocs.map((group) => (
                              <DocumentGroup
                                 key={`${group.contactName}_${group.lender}`}
                                 contactName={group.contactName}
                                 lender={group.lender}
                                 docs={group.docs}
                                 getFileIcon={getFileIcon}
                                 getLenderFromDoc={getLenderFromDoc}
                                 formatDate={formatDate}
                                 handlePreview={handlePreview}
                                 handleEditClick={handleEditClick}
                                 updateDocumentStatus={updateDocumentStatus}
                                 handleSendDocument={handleSendDocument}
                                 handleOpenDocTimeline={handleOpenDocTimeline}
                                 handleDeleteDocClick={handleDeleteDocClick}
                                 sendingDocId={sendingDocId}
                              />
                           ))}
                        </div>
                     )}
                  </div>
               )}
            </div>
         </div>

         {/* Edit Document Modal */}
         {editingDoc && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-navy-50 dark:bg-slate-700">
                     <h3 className="font-bold text-navy-900 dark:text-white">Edit Document Details</h3>
                     <button onClick={() => setEditingDoc(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={20} />
                     </button>
                  </div>
                  <div className="p-6 space-y-4">
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Document Name</label>
                        <input
                           type="text"
                           value={editName}
                           onChange={(e) => setEditName(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                        <select
                           value={editCategory}
                           onChange={(e) => setEditCategory(e.target.value)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           {categories.filter(c => c !== 'All').map(c => (
                              <option key={c} value={c}>{c}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Document Status</label>
                        <select
                           value={editStatus}
                           onChange={(e) => setEditStatus(e.target.value as DocumentStatus)}
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        >
                           {DOCUMENT_STATUS_CONFIG.map(s => (
                              <option key={s.status} value={s.status}>{s.label}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma separated)</label>
                        <input
                           type="text"
                           value={editTags}
                           onChange={(e) => setEditTags(e.target.value)}
                           placeholder="e.g. Invoice, Paid, Q1"
                           className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        />
                     </div>
                  </div>
                  <div className="px-6 py-4 bg-gray-50 dark:bg-slate-700 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-600">
                     <button
                        onClick={() => setEditingDoc(null)}
                        className="px-4 py-2 bg-white dark:bg-slate-600 border border-gray-200 dark:border-slate-500 rounded-lg text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-500"
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleSaveDoc}
                        className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                     >
                        <Save size={16} /> Save Changes
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Per-Document Timeline Modal */}
         {docTimelineId && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[80vh] flex flex-col">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-navy-50 dark:bg-slate-700">
                     <h3 className="font-bold text-navy-900 dark:text-white flex items-center gap-2">
                        <History size={16} />
                        Document History
                     </h3>
                     <button onClick={() => { setDocTimelineId(null); setDocTimelineEvents([]); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={20} />
                     </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                     {docTimelineLoading ? (
                        <div className="flex items-center justify-center py-12">
                           <RefreshCw size={20} className="animate-spin text-gray-400" />
                        </div>
                     ) : docTimelineEvents.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                           <History size={32} className="mx-auto mb-2 opacity-30" />
                           <p className="text-sm">No history for this document</p>
                        </div>
                     ) : (
                        <div className="relative pl-6">
                           <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-600" />
                           {docTimelineEvents.map((event, i) => (
                              <div key={event.id} className="relative pb-4 last:pb-0">
                                 <div className="absolute -left-3.5 top-1">
                                    <TimelineIcon type={event.type} />
                                 </div>
                                 <div className="ml-4">
                                    <p className={`text-xs font-bold ${
                                       event.type === 'email_bounced' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'
                                    }`}>
                                       {formatEventDescription(event.type, event.description)}
                                    </p>
                                    {event.actorName && (
                                       <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                          by {event.actorName}
                                       </p>
                                    )}
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                       {formatTimestamp(event.timestamp)}
                                    </p>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}

         {/* Delete Document Confirmation Modal */}
         {showDeleteConfirm && docToDelete && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-md w-full relative">
                  {/* Deleting Progress Overlay */}
                  {isDeletingDoc && (
                     <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <div className="relative w-24 h-24">
                           <svg className="w-full h-full transform -rotate-90">
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-600" />
                              <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                 strokeDasharray={251.2}
                                 strokeDashoffset={251.2 - (251.2 * deleteProgress) / 100}
                                 className="text-green-500 transition-all duration-300 ease-out"
                                 strokeLinecap="round"
                              />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-green-600 dark:text-green-400">
                              {Math.round(deleteProgress)}%
                           </div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-white">
                           {deleteProgress < 100 ? 'Deleting document from S3...' : 'Done!'}
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
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        placeholder="DELETE"
                        disabled={isDeletingDoc}
                     />
                  </div>
                  <div className="flex justify-end gap-3">
                     <button
                        onClick={() => {
                           setShowDeleteConfirm(false);
                           setDocToDelete(null);
                           setDeleteConfirmText('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        disabled={isDeletingDoc}
                     >
                        Cancel
                     </button>
                     <button
                        onClick={handleDeleteDocument}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        disabled={isDeletingDoc || deleteConfirmText !== 'DELETE'}
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

// --- Sub-Component: Document Group (Collapsible Contact+Lender section) ---
interface DocumentGroupProps {
   contactName: string;
   lender: string;
   docs: Document[];
   getFileIcon: (type: string) => React.ReactNode;
   getLenderFromDoc: (doc: Document) => string;
   formatDate: (dateStr: string) => string;
   handlePreview: (doc: Document) => void;
   handleEditClick: (doc: Document) => void;
   updateDocumentStatus: (docId: string, status: DocumentStatus) => Promise<void>;
   handleSendDocument: (doc: Document) => void;
   handleOpenDocTimeline: (docId: string) => void;
   handleDeleteDocClick: (doc: Document) => void;
   sendingDocId: string | null;
}

const DocumentGroup: React.FC<DocumentGroupProps> = ({
   contactName, lender, docs, getFileIcon, formatDate,
   handlePreview, handleEditClick, updateDocumentStatus,
   handleSendDocument, handleOpenDocTimeline, handleDeleteDocClick, sendingDocId
}) => {
   const [isExpanded, setIsExpanded] = useState(true);

   return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
         {/* Group Header */}
         <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 hover:from-indigo-700 hover:to-purple-700 transition-all"
         >
            <div className="flex items-center gap-3">
               {isExpanded ? <ChevronDown size={16} className="text-white/80" /> : <ChevronRight size={16} className="text-white/80" />}
               <User size={14} className="text-white/70" />
               <span className="text-sm font-bold text-white">{contactName}</span>
               <span className="text-white/50 mx-1">/</span>
               <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white">
                  {lender}
               </span>
            </div>
            <span className="text-xs font-semibold text-white/80 bg-white/20 px-2.5 py-1 rounded-full">
               {docs.length} doc{docs.length !== 1 ? 's' : ''}
            </span>
         </button>

         {/* Document Rows */}
         {isExpanded && (
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold border-b border-gray-100 dark:border-slate-700">
                     <th className="px-5 py-2.5">Document Name</th>
                     <th className="px-5 py-2.5">Status</th>
                     <th className="px-5 py-2.5">Modified</th>
                     <th className="px-5 py-2.5">Tags</th>
                     <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody>
                  {docs.map((doc, index) => {
                     const docStatusConfig = DOCUMENT_STATUS_CONFIG.find(
                        c => c.status === (doc.documentStatus || 'Draft')
                     );
                     return (
                        <tr
                           key={doc.id}
                           className={`
                              ${index % 2 === 0
                                 ? 'bg-white dark:bg-slate-800'
                                 : 'bg-indigo-50/30 dark:bg-slate-700/30'
                              }
                              hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                              transition-all duration-150
                              border-b border-gray-50 dark:border-slate-700/50
                              group
                           `}
                        >
                           <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                 <div className={`p-1.5 rounded-lg flex-shrink-0 ${doc.type === 'pdf'
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                    : doc.type === 'docx'
                                       ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                       : 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-400'
                                 }`}>
                                    {getFileIcon(doc.type)}
                                 </div>
                                 <button
                                    onClick={() => handlePreview(doc)}
                                    className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left truncate max-w-[260px]"
                                    title={doc.name}
                                 >
                                    {doc.name}
                                 </button>
                              </div>
                           </td>
                           <td className="px-5 py-3">
                              <select
                                 value={doc.documentStatus || 'Draft'}
                                 onChange={(e) => updateDocumentStatus(doc.id, e.target.value as DocumentStatus)}
                                 className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-navy-600 cursor-pointer"
                                 style={{
                                    color: docStatusConfig?.iconColor,
                                    borderColor: docStatusConfig?.iconColor + '40',
                                 }}
                                 onClick={(e) => e.stopPropagation()}
                              >
                                 {DOCUMENT_STATUS_CONFIG.map(s => (
                                    <option key={s.status} value={s.status}>{s.label}</option>
                                 ))}
                              </select>
                           </td>
                           <td className="px-5 py-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                 {formatDate(doc.dateModified)}
                              </span>
                           </td>
                           <td className="px-5 py-3">
                              <div className="flex gap-1 flex-wrap">
                                 {doc.tags.slice(0, 3).map((tag, tagIndex) => {
                                    const tagColors = [
                                       'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
                                       'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                                       'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                                    ];
                                    return (
                                       <span
                                          key={tag}
                                          className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tagColors[tagIndex % tagColors.length]}`}
                                       >
                                          <Tag size={8} className="mr-0.5" /> {tag}
                                       </span>
                                    );
                                 })}
                                 {doc.tags.length > 3 && (
                                    <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
                                       +{doc.tags.length - 3}
                                    </span>
                                 )}
                              </div>
                           </td>
                           <td className="px-5 py-3 text-right">
                              <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                 {/* Send button — only for Draft/For Approval */}
                                 {(doc.documentStatus === 'Draft' || doc.documentStatus === 'For Approval') && (
                                    <button
                                       onClick={() => handleSendDocument(doc)}
                                       disabled={sendingDocId === doc.id}
                                       className={`p-1.5 rounded-lg transition-colors ${
                                          sendingDocId === doc.id
                                             ? 'bg-blue-50 text-blue-300 cursor-wait'
                                             : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                                       }`}
                                       title="Mark as Sent"
                                    >
                                       <Send size={13} className={sendingDocId === doc.id ? 'animate-pulse' : ''} />
                                    </button>
                                 )}
                                 {/* Timeline button */}
                                 <button
                                    onClick={() => handleOpenDocTimeline(doc.id)}
                                    className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
                                    title="View History"
                                 >
                                    <History size={13} />
                                 </button>
                                 <button
                                    onClick={() => handleEditClick(doc)}
                                    className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-500 transition-colors"
                                    title="Edit"
                                 >
                                    <Edit size={13} />
                                 </button>
                                 <button
                                    onClick={() => handlePreview(doc)}
                                    className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                                    title="Preview"
                                 >
                                    <Eye size={13} />
                                 </button>
                                 <button
                                    onClick={() => handlePreview(doc)}
                                    disabled={!doc.url}
                                    className={`p-1.5 rounded-lg transition-colors ${!doc.url
                                       ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                       : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50'
                                    }`}
                                    title="Download/View"
                                 >
                                    <Download size={13} />
                                 </button>
                                 <button
                                    onClick={() => handleDeleteDocClick(doc)}
                                    className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                                    title="Delete"
                                 >
                                    <Trash2 size={13} />
                                 </button>
                              </div>
                           </td>
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         )}
      </div>
   );
};

// --- Helper: Timeline Icon by event type ---
const TimelineIcon: React.FC<{ type: string }> = ({ type }) => {
   const size = 14;
   switch (type) {
      case 'document_sent':
         return <Send size={size} className="text-blue-500" />;
      case 'document_viewed':
         return <Eye size={size} className="text-purple-500" />;
      case 'document_completed':
         return <CheckCircle size={size} className="text-emerald-500" />;
      case 'document_declined':
         return <XCircle size={size} className="text-rose-500" />;
      case 'email_bounced':
         return <MailX size={size} className="text-red-600" />;
      case 'document_expired':
         return <Timer size={size} className="text-red-400" />;
      case 'document_chase_sent':
         return <Mail size={size} className="text-orange-500" />;
      case 'document_status_changed':
         return <RefreshCw size={size} className="text-gray-500" />;
      default:
         return <FileText size={size} className="text-gray-400" />;
   }
};

// --- Helper: Format event type into human-readable description ---
const formatEventDescription = (type: string, description: string): string => {
   if (description && description !== type) return description;
   const labels: Record<string, string> = {
      document_sent: 'Document sent to client',
      document_viewed: 'Client viewed document',
      document_completed: 'Document completed',
      document_declined: 'Client declined document',
      email_bounced: 'Email bounced — invalid address',
      document_expired: 'Document expired (30+ days)',
      document_chase_sent: 'Chase reminder sent',
      document_status_changed: 'Status changed',
   };
   return labels[type] || type.replace(/_/g, ' ');
};

// --- Helper: Format ISO timestamp ---
const formatTimestamp = (ts: string): string => {
   if (!ts) return '';
   try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
   } catch {
      return ts;
   }
};

export default Documents;
