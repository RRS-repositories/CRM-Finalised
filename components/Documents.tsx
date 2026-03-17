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
   const [activeTab, setActiveTab] = useState<'documents' | 'templates' | 'editor' | 'tracking' | 'comms'>('documents');

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
                  onClick={() => setActiveTab('comms')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'comms' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Client Communications
               </button>
               <button
                  onClick={() => setActiveTab('templates')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'templates' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Template Library
               </button>
               <button
                  onClick={() => setActiveTab('tracking')}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors px-2 ${activeTab === 'tracking' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
               >
                  Document Tracking
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
            ) : activeTab === 'comms' ? (
               <ClientCommsTracking />
            ) : activeTab === 'templates' ? (
               <Templates />
            ) : activeTab === 'tracking' ? (
               <DocumentJourney />
            ) : (
               <TemplateEditorTab />
            )}
         </div>
      </div>
   );
};

// --- Sub-Component: Client Communications Tracking ---
const COMMS_TYPE_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
   id_upload: { label: 'ID Request', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
   questionnaire: { label: 'Questionnaire', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
   extra_lender: { label: 'Extra Lender Form', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
   previous_address: { label: 'Previous Address', color: 'text-teal-700 dark:text-teal-300', bgColor: 'bg-teal-100 dark:bg-teal-900/30' },
   sale_signature: { label: 'Sale Signature', color: 'text-rose-700 dark:text-rose-300', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
};

const COMMS_STATUS_TABS = [
   { key: 'Sent', label: 'Sent', icon: Send, color: 'text-blue-600', bgActive: 'bg-blue-50 dark:bg-blue-900/20 border-blue-500', ringColor: 'ring-blue-500' },
   { key: 'Viewed', label: 'Viewed', icon: Eye, color: 'text-amber-600', bgActive: 'bg-amber-50 dark:bg-amber-900/20 border-amber-500', ringColor: 'ring-amber-500' },
   { key: 'Completed', label: 'Completed', icon: CheckCircle, color: 'text-emerald-600', bgActive: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500', ringColor: 'ring-emerald-500' },
] as const;

interface CommsItem {
   id: number;
   client_id: number;
   claim_id: number | null;
   type: string;
   status: string;
   token: string;
   sent_at: string;
   first_viewed_at: string | null;
   completed_at: string | null;
   email_address: string;
   first_name: string;
   last_name: string;
   full_name: string | null;
   lender: string | null;
   documents?: { id: number; name: string; type: string; category: string; url: string; tags: string[] }[];
}

const ClientCommsTracking: React.FC = () => {
   const API_BASE_URL = API_ENDPOINTS.api;
   const [activeStatus, setActiveStatus] = useState<string>('Sent');
   const [items, setItems] = useState<CommsItem[]>([]);
   const [total, setTotal] = useState(0);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState('');
   const [counts, setCounts] = useState<Record<string, number>>({});

   const fetchCounts = useCallback(async () => {
      try {
         const res = await fetch(`${API_BASE_URL}/communications-tracking/status-counts`);
         if (res.ok) {
            const data = await res.json();
            const c: Record<string, number> = {};
            for (const [status, val] of Object.entries(data as Record<string, { total: number }>)) {
               c[status] = val.total;
            }
            setCounts(c);
         }
      } catch {}
   }, [API_BASE_URL]);

   const fetchItems = useCallback(async () => {
      setLoading(true);
      try {
         const params = new URLSearchParams({ status: activeStatus, limit: '200' });
         if (search) params.set('search', search);
         const res = await fetch(`${API_BASE_URL}/communications-tracking/list?${params}`);
         if (!res.ok) throw new Error('Failed');
         const data = await res.json();
         setItems(data.items || []);
         setTotal(data.total || 0);
      } catch (err) {
         console.error('Comms tracking fetch error:', err);
      } finally {
         setLoading(false);
      }
   }, [API_BASE_URL, activeStatus, search]);

   useEffect(() => { fetchCounts(); }, [fetchCounts]);
   useEffect(() => { fetchItems(); }, [fetchItems]);

   const formatDate = (d: string | null) => {
      if (!d) return '\u2014';
      const dt = new Date(d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
   };

   const getLink = (item: CommsItem) => {
      switch (item.type) {
         case 'id_upload': return `/id-upload/${item.token}`;
         case 'questionnaire': return `/questionnaire/token/${item.token}`;
         case 'extra_lender': return `/loa-form/${item.token}`;
         case 'previous_address': return `/previous-address/${item.token}`;
         case 'sale_signature': return `/api/signature/${item.token}`;
         default: return '#';
      }
   };

   const handlePreviewDoc = async (url: string) => {
      try {
         const res = await fetch(`${API_BASE_URL}/documents/secure-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
         });
         const data = await res.json();
         if (data.success && data.signedUrl) window.open(data.signedUrl, '_blank');
      } catch {}
   };

   return (
      <div className="flex flex-col h-full">
         {/* Header with status tabs */}
         <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
               <h2 className="text-base font-bold text-navy-900 dark:text-white flex items-center gap-2">
                  <Mail size={16} className="text-brand-orange" />
                  Client Communications
               </h2>
               <div className="relative w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                     type="text"
                     placeholder="Search by client name..."
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     className="w-full pl-8 pr-4 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                  />
               </div>
            </div>
            <div className="flex gap-2">
               {COMMS_STATUS_TABS.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeStatus === tab.key;
                  return (
                     <button
                        key={tab.key}
                        onClick={() => setActiveStatus(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                           isActive
                              ? `${tab.bgActive} border-current ${tab.color}`
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                     >
                        <Icon size={14} />
                        {tab.label}
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                           isActive ? 'bg-white/80 dark:bg-slate-700 text-gray-800 dark:text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                        }`}>
                           {counts[tab.key] || 0}
                        </span>
                     </button>
                  );
               })}
            </div>
         </div>

         {/* Table */}
         <div className="flex-1 overflow-y-auto">
            {loading ? (
               <div className="p-12 text-center text-gray-400">
                  <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                  <p className="text-sm">Loading...</p>
               </div>
            ) : items.length === 0 ? (
               <div className="p-12 text-center text-gray-400">
                  <Mail size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm">No {activeStatus.toLowerCase()} communications found.</p>
               </div>
            ) : (
               <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0 z-10">
                     <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Lender</th>
                        <th className="px-4 py-3 font-semibold">
                           {activeStatus === 'Sent' ? 'Sent At' : activeStatus === 'Viewed' ? 'Viewed At' : 'Completed At'}
                        </th>
                        <th className="px-4 py-3 font-semibold">Link</th>
                        {activeStatus === 'Completed' && <th className="px-4 py-3 font-semibold">Documents</th>}
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                     {items.map(item => {
                        const typeInfo = COMMS_TYPE_LABELS[item.type] || { label: item.type, color: 'text-gray-700', bgColor: 'bg-gray-100' };
                        const clientName = item.full_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || '\u2014';
                        const dateVal = activeStatus === 'Sent' ? item.sent_at : activeStatus === 'Viewed' ? item.first_viewed_at : item.completed_at;

                        return (
                           <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-3">
                                 <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-navy-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0">
                                       <User size={12} className="text-navy-600 dark:text-navy-300" />
                                    </div>
                                    <div>
                                       <p className="font-semibold text-gray-900 dark:text-white text-xs">{clientName}</p>
                                       <p className="text-[10px] text-gray-400">{item.email_address || ''}</p>
                                    </div>
                                 </div>
                              </td>
                              <td className="px-4 py-3">
                                 <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${typeInfo.bgColor} ${typeInfo.color}`}>
                                    {typeInfo.label}
                                 </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{item.lender || '\u2014'}</td>
                              <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(dateVal)}</td>
                              <td className="px-4 py-3">
                                 <a
                                    href={getLink(item)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                                 >
                                    <ExternalLink size={12} /> Open
                                 </a>
                              </td>
                              {activeStatus === 'Completed' && (
                                 <td className="px-4 py-3">
                                    {item.documents && item.documents.length > 0 ? (
                                       <div className="flex flex-wrap gap-1.5">
                                          {item.documents.map(doc => (
                                             <button
                                                key={doc.id}
                                                onClick={() => handlePreviewDoc(doc.url)}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                                                title={doc.name}
                                             >
                                                <FileText size={10} />
                                                {doc.name.length > 20 ? doc.name.substring(0, 20) + '...' : doc.name}
                                             </button>
                                          ))}
                                       </div>
                                    ) : (
                                       <span className="text-[10px] text-gray-400">\u2014</span>
                                    )}
                                 </td>
                              )}
                           </tr>
                        );
                     })}
                  </tbody>
               </table>
            )}
         </div>

         {/* Footer with count */}
         <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-2 flex-shrink-0">
            <p className="text-xs text-gray-400">
               Showing {items.length} of {total} {activeStatus.toLowerCase()} communications
            </p>
         </div>
      </div>
   );
};

// --- Sub-Component: Document Journey Tracking ---
interface JourneyDoc {
   id: number;
   name: string;
   document_status: string;
   tracking_token: string | null;
   sent_at: string | null;
   created_at: string;
   updated_at: string | null;
   contact_id: number | null;
   category: string | null;
   contact_name: string | null;
   contact_email: string | null;
   tracking_events: { event_type: string; occurred_at: string; ip_address: string | null }[] | null;
}

const JOURNEY_STEPS = ['Sent', 'Viewed', 'Completed'] as const;

const journeyStepColor = (step: string, reached: boolean) => {
   if (!reached) return 'bg-gray-200 dark:bg-slate-600 text-gray-400 dark:text-slate-500';
   switch (step) {
      case 'Sent': return 'bg-blue-500 text-white';
      case 'Viewed': return 'bg-amber-500 text-white';
      case 'Completed': return 'bg-emerald-500 text-white';
      default: return 'bg-gray-400 text-white';
   }
};

const journeyConnectorColor = (reached: boolean) =>
   reached ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-slate-600';

function getJourneyStage(doc: JourneyDoc): number {
   const status = doc.document_status;
   if (status === 'Completed' || status === 'Paid') return 3;
   if (status === 'Viewed') return 2;
   if (status === 'Sent' || status === 'For Approval') return 1;
   if (status === 'Declined' || status === 'Expired') return -1; // special
   return 0;
}

const DocumentJourney: React.FC = () => {
   const API_BASE_URL = API_ENDPOINTS.api;
   const [docs, setDocs] = useState<JourneyDoc[]>([]);
   const [total, setTotal] = useState(0);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState('');
   const [page, setPage] = useState(1);
   const [expandedId, setExpandedId] = useState<number | null>(null);
   const [docTimeline, setDocTimeline] = useState<any>(null);
   const [timelineLoading, setTimelineLoading] = useState(false);
   const limit = 50;

   const fetchJourney = useCallback(async () => {
      setLoading(true);
      try {
         const params = new URLSearchParams({ page: String(page), limit: String(limit) });
         if (search) params.set('search', search);
         const res = await fetch(`${API_BASE_URL}/documents/journey?${params}`);
         if (!res.ok) throw new Error('Failed');
         const data = await res.json();
         setDocs(data.documents || []);
         setTotal(data.total || 0);
      } catch (err) {
         console.error('Journey fetch error:', err);
      } finally {
         setLoading(false);
      }
   }, [API_BASE_URL, page, search]);

   useEffect(() => { fetchJourney(); }, [fetchJourney]);

   const handleExpand = async (docId: number) => {
      if (expandedId === docId) { setExpandedId(null); return; }
      setExpandedId(docId);
      setTimelineLoading(true);
      try {
         const res = await fetch(`${API_BASE_URL}/documents/${docId}/timeline`);
         if (res.ok) setDocTimeline(await res.json());
      } catch { setDocTimeline(null); }
      finally { setTimelineLoading(false); }
   };

   const totalPages = Math.ceil(total / limit);

   const formatDate = (d: string | null) => {
      if (!d) return '—';
      const dt = new Date(d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
   };

   return (
      <div className="flex flex-col h-full">
         {/* Header */}
         <div className="h-14 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
            <div className="flex items-center gap-3">
               <h2 className="text-base font-bold text-navy-900 dark:text-white">Document Journey Tracking</h2>
               <span className="text-xs text-gray-400">{total} documents</span>
            </div>
            <div className="relative w-72">
               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input
                  type="text"
                  placeholder="Search by document or client name..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-8 pr-4 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
               />
            </div>
         </div>

         {/* Table */}
         <div className="flex-1 overflow-y-auto">
            {loading ? (
               <div className="p-12 text-center text-gray-400">
                  <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                  <p className="text-sm">Loading document journeys...</p>
               </div>
            ) : docs.length === 0 ? (
               <div className="p-12 text-center text-gray-400">
                  <FileText size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm">No sent documents found.</p>
               </div>
            ) : (
               <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0 z-10">
                     <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-3 font-semibold">Document</th>
                        <th className="px-4 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Sent</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold min-w-[240px]">Journey</th>
                        <th className="px-4 py-3 font-semibold w-8"></th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                     {docs.map(doc => {
                        const stage = getJourneyStage(doc);
                        const isDeclinedOrExpired = stage === -1;
                        const isExpanded = expandedId === doc.id;
                        return (
                           <React.Fragment key={doc.id}>
                              <tr
                                 className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                 onClick={() => handleExpand(doc.id)}
                              >
                                 <td className="px-6 py-3">
                                    <div className="font-medium text-navy-900 dark:text-white truncate max-w-[200px]">{doc.name}</div>
                                    <div className="text-[10px] text-gray-400">{doc.category || 'Uncategorized'}</div>
                                 </td>
                                 <td className="px-4 py-3">
                                    <div className="text-gray-700 dark:text-gray-300">{doc.contact_name || '—'}</div>
                                    <div className="text-[10px] text-gray-400">{doc.contact_email || ''}</div>
                                 </td>
                                 <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                                    {formatDate(doc.sent_at)}
                                 </td>
                                 <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                       isDeclinedOrExpired
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : doc.document_status === 'Completed' || doc.document_status === 'Paid'
                                             ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                             : doc.document_status === 'Viewed'
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    }`}>
                                       {doc.document_status}
                                    </span>
                                 </td>
                                 <td className="px-4 py-3">
                                    {isDeclinedOrExpired ? (
                                       <span className="text-xs text-red-500 font-medium">{doc.document_status}</span>
                                    ) : (
                                       <div className="flex items-center gap-1">
                                          {JOURNEY_STEPS.map((step, i) => (
                                             <React.Fragment key={step}>
                                                {i > 0 && (
                                                   <div className={`h-0.5 w-6 rounded ${journeyConnectorColor(stage >= i + 1)}`} />
                                                )}
                                                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold ${journeyStepColor(step, stage >= i + 1)}`}
                                                   title={step}
                                                >
                                                   {stage >= i + 1 ? '✓' : i + 1}
                                                </div>
                                                <span className={`text-[10px] ${stage >= i + 1 ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400'}`}>
                                                   {step}
                                                </span>
                                             </React.Fragment>
                                          ))}
                                       </div>
                                    )}
                                 </td>
                                 <td className="px-4 py-3">
                                    <ChevronRight size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                 </td>
                              </tr>
                              {/* Expanded timeline detail */}
                              {isExpanded && (
                                 <tr>
                                    <td colSpan={6} className="bg-slate-50 dark:bg-slate-800/50 px-8 py-4">
                                       {timelineLoading ? (
                                          <div className="flex items-center gap-2 text-gray-400 text-xs">
                                             <Loader2 size={14} className="animate-spin" /> Loading timeline...
                                          </div>
                                       ) : !docTimeline ? (
                                          <p className="text-xs text-gray-400">No timeline data.</p>
                                       ) : (
                                          <div className="grid grid-cols-2 gap-6">
                                             {/* Tracking events */}
                                             <div>
                                                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Tracking Events</h4>
                                                {(!docTimeline.tracking_events || docTimeline.tracking_events.length === 0) ? (
                                                   <p className="text-xs text-gray-400">No tracking events yet.</p>
                                                ) : (
                                                   <div className="space-y-1.5">
                                                      {docTimeline.tracking_events.map((ev: any, i: number) => (
                                                         <div key={i} className="flex items-center gap-2 text-xs">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${
                                                               ev.event_type === 'viewed' ? 'bg-amber-500' :
                                                               ev.event_type === 'completed' || ev.event_type === 'signed' ? 'bg-emerald-500' :
                                                               ev.event_type === 'declined' ? 'bg-red-500' : 'bg-blue-500'
                                                            }`} />
                                                            <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{ev.event_type}</span>
                                                            <span className="text-gray-400">{formatDate(ev.timestamp || ev.occurred_at)}</span>
                                                            {ev.ip_address && <span className="text-gray-300 dark:text-gray-600">({ev.ip_address})</span>}
                                                         </div>
                                                      ))}
                                                   </div>
                                                )}
                                             </div>
                                             {/* Action logs */}
                                             <div>
                                                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Action Log</h4>
                                                {(!docTimeline.action_logs || docTimeline.action_logs.length === 0) ? (
                                                   <p className="text-xs text-gray-400">No action logs.</p>
                                                ) : (
                                                   <div className="space-y-1.5">
                                                      {docTimeline.action_logs.map((log: any, i: number) => (
                                                         <div key={i} className="flex items-start gap-2 text-xs">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1 flex-shrink-0" />
                                                            <div>
                                                               <span className="text-gray-700 dark:text-gray-300">{log.description}</span>
                                                               <div className="text-gray-400">
                                                                  {log.actor_name || log.actor_type} &middot; {formatDate(log.timestamp)}
                                                               </div>
                                                            </div>
                                                         </div>
                                                      ))}
                                                   </div>
                                                )}
                                             </div>
                                          </div>
                                       )}
                                    </td>
                                 </tr>
                              )}
                           </React.Fragment>
                        );
                     })}
                  </tbody>
               </table>
            )}
         </div>

         {/* Pagination */}
         {totalPages > 1 && (
            <div className="h-12 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
               <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
               <div className="flex gap-2">
                  <button
                     disabled={page <= 1}
                     onClick={() => setPage(p => p - 1)}
                     className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                     Previous
                  </button>
                  <button
                     disabled={page >= totalPages}
                     onClick={() => setPage(p => p + 1)}
                     className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                     Next
                  </button>
               </div>
            </div>
         )}
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

   // --- Dashboard metrics (lightweight endpoint, not full doc list) ---
   const [statusCounts, setStatusCounts] = useState<Record<string, { total: number; today: number }>>({});
   const fetchStatusCounts = useCallback(async () => {
      try {
         const [docRes, commsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/documents/status-counts`),
            fetch(`${API_BASE_URL}/communications-tracking/status-counts`)
         ]);

         const map: Record<string, { total: number; today: number }> = {};

         if (docRes.ok) {
            const rows: { status: string; total: number; today: number }[] = await docRes.json();
            for (const r of rows) map[r.status] = { total: r.total, today: r.today };
         }

         if (commsRes.ok) {
            const comms: Record<string, { total: number; today: number }> = await commsRes.json();
            for (const [status, counts] of Object.entries(comms)) {
               if (map[status]) {
                  map[status].total += counts.total;
                  map[status].today += counts.today;
               } else {
                  map[status] = { total: counts.total, today: counts.today };
               }
            }
         }

         setStatusCounts(map);
      } catch (err) { console.error('Status counts error:', err); }
   }, [API_BASE_URL]);

   useEffect(() => { fetchStatusCounts(); }, [fetchStatusCounts]);

   const statusMetrics = useMemo(() => {
      return DOCUMENT_STATUS_CONFIG.map(config => ({
         ...config,
         count: statusCounts[config.status]?.total || 0,
         todayCount: statusCounts[config.status]?.today || 0,
      }));
   }, [statusCounts]);

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

   // --- Drill-down: fetch docs by status from server ---
   const [drillDownDocs, setDrillDownDocs] = useState<Document[]>([]);
   const [drillDownLoading, setDrillDownLoading] = useState(false);

   useEffect(() => {
      if (view !== 'list' || !selectedStatus) return;
      setDrillDownLoading(true);
      const params = new URLSearchParams({ status: selectedStatus, limit: '200' });
      if (searchQuery) params.set('search', searchQuery);

      const commsParams = new URLSearchParams({ status: selectedStatus, limit: '200' });
      if (searchQuery) commsParams.set('search', searchQuery);

      Promise.all([
         fetch(`${API_BASE_URL}/documents/by-status?${params}`).then(r => r.json()).catch(() => []),
         fetch(`${API_BASE_URL}/communications-tracking/list?${commsParams}`).then(r => r.json()).catch(() => ({ items: [] }))
      ]).then(([docRows, commsData]: [any[], any]) => {
         const COMMS_LABELS: Record<string, string> = {
            id_upload: 'ID Request',
            questionnaire: 'Questionnaire',
            extra_lender: 'Extra Lender Form',
            previous_address: 'Previous Address',
            sale_signature: 'Sale Signature',
         };

         const docsMapped: Document[] = (docRows || []).map((d: any) => ({
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
            documentStatus: (d.document_status as DocumentStatus) || 'Draft',
            trackingToken: d.tracking_token || null,
            sentAt: d.sent_at || null,
            _contactName: d.contact_name || '',
         }));

         const commsMapped: Document[] = ((commsData?.items) || []).map((c: any) => ({
            id: `comms-${c.id}`,
            name: COMMS_LABELS[c.type] || c.type,
            type: 'email',
            category: 'Client Communication',
            url: '',
            size: '',
            version: 1,
            tags: [c.type, c.lender || ''].filter(Boolean),
            associatedContactId: c.client_id?.toString(),
            dateModified: (c.sent_at || '')?.split('T')[0],
            documentStatus: (selectedStatus as DocumentStatus) || 'Sent',
            trackingToken: c.token || null,
            sentAt: c.sent_at || null,
            _contactName: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            _commsToken: c.token,
            _commsType: c.type,
            _commsLink: c.type === 'id_upload' ? `/id-upload/${c.token}` :
                        c.type === 'questionnaire' ? `/questionnaire/token/${c.token}` :
                        c.type === 'extra_lender' ? `/loa-form/${c.token}` :
                        c.type === 'previous_address' ? `/previous-address/${c.token}` :
                        c.type === 'sale_signature' ? `/api/signature/${c.token}` : '',
            _commsDocuments: c.documents || [],
         }));

         setDrillDownDocs([...docsMapped, ...commsMapped]);
      })
      .catch(err => console.error('Drill-down fetch error:', err))
      .finally(() => setDrillDownLoading(false));
   }, [view, selectedStatus, searchQuery, API_BASE_URL]);

   const groupedDocs = useMemo(() => {
      // Group by contact + lender
      const groups = new Map<string, { contactName: string; lender: string; docs: Document[] }>();
      drillDownDocs.forEach(doc => {
         const contactId = doc.associatedContactId || 'none';
         const contactName = (doc as any)._contactName || getClientName(doc.associatedContactId) || 'No Client';
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
   }, [drillDownDocs, contacts]);

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
         updateDocumentStatus(editingDoc.id, editStatus).then(() => fetchStatusCounts());
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
            fetchTimeline();
            fetchStatusCounts();
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
         fetchStatusCounts();
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
                     <span className="text-xs text-gray-400 dark:text-gray-500">{statusMetrics.reduce((s, m) => s + m.count, 0)} total documents</span>
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
                     {drillDownLoading ? (
                        <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                           <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-40" />
                           <p className="text-sm">Loading documents...</p>
                        </div>
                     ) : groupedDocs.length === 0 ? (
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
