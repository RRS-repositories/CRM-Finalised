import React, { useState } from 'react';
import {
   FileText, Search, Filter, File, Download, Trash2, Tag, Eye, Edit, Save, X
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Document } from '../types';
import Templates from './Templates';
import { API_ENDPOINTS } from '../src/config';

const Documents: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'documents' | 'templates'>('documents');

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
            </div>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-hidden relative">
            {activeTab === 'documents' ? (
               <DocumentsContent />
            ) : (
               <Templates />
            )}
         </div>
      </div>
   );
};

// --- Sub-Component: Documents Content ---
const DocumentsContent: React.FC = () => {
   const { documents, updateDocument, addDocument, addNotification, contacts } = useCRM();
   const API_BASE_URL = API_ENDPOINTS.api;
   const [searchQuery, setSearchQuery] = useState('');

   // Edit State
   const [editingDoc, setEditingDoc] = useState<Document | null>(null);
   const [editName, setEditName] = useState('');
   const [editCategory, setEditCategory] = useState('');
   const [editTags, setEditTags] = useState('');

   const categories = ['All', 'Client', 'Correspondence', 'Legal', 'Templates', 'Other'];

   // Helper to get client name from associatedContactId
   const getClientName = (contactId?: string) => {
      if (!contactId) return '';
      const contact = contacts.find(c => c.id === contactId);
      return contact?.fullName || '';
   };

   // Helper to extract lender from document tags or name
   const getLenderFromDoc = (doc: Document) => {
      // First check tags for known lenders (exclude document type tags)
      const docTypeTags = ['Cover Letter', 'LOA', 'T&C', 'Signature', 'Uploaded', 'Previous Address', 'Signed', 'LOA Form'];
      const lenderTag = doc.tags.find(tag => !docTypeTags.includes(tag));
      if (lenderTag) return lenderTag;

      // Fallback: parse from document name (first part before underscore)
      const nameParts = doc.name.split('_');
      if (nameParts.length > 1) {
         return nameParts[0].replace(/_/g, ' ');
      }
      return '';
   };

   // Helper to check if a document is a signature file (to hide from frontend display)
   // Note: We only hide signature files, NOT user-uploaded ID documents
   const isSignatureFile = (doc: Document) => {
      const lowerName = doc.name.toLowerCase();
      // Check if it's a signature file by name or tags
      if (lowerName.includes('signature') || lowerName.includes('_sig')) return true;
      if (doc.tags.some(tag => tag.toLowerCase().includes('signature'))) return true;
      return false;
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

   const filteredDocs = documents.filter(doc => {
      // Only hide signature files - allow all other documents including uploaded IDs
      if (isSignatureFile(doc)) return false;
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
         getClientName(doc.associatedContactId).toLowerCase().includes(searchQuery.toLowerCase()) ||
         getLenderFromDoc(doc).toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
   });

   const getFileIcon = (type: string) => {
      switch (type) {
         case 'pdf': return <FileText className="text-red-500" size={20} />;
         case 'docx': return <FileText className="text-blue-500" size={20} />;
         case 'image': return <File className="text-purple-500" size={20} />;
         case 'txt': return <FileText className="text-gray-500" size={20} />;
         default: return <File className="text-gray-500 dark:text-gray-400" size={20} />;
      }
   };

   const handleEditClick = (doc: Document) => {
      setEditingDoc(doc);
      setEditName(doc.name);
      setEditCategory(doc.category);
      setEditTags(doc.tags.join(', '));
   };

   const handleSaveDoc = () => {
      if (!editingDoc) return;

      const updatedDoc: Document = {
         ...editingDoc,
         name: editName,
         category: editCategory as any,
         tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
         dateModified: new Date().toISOString().split('T')[0]
      };

      updateDocument(updatedDoc);
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

   return (
      <div className="flex h-full bg-white dark:bg-slate-900 relative">
         {/* Main Content - Full Width (no sidebar) */}
         <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="h-16 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
               <div className="relative w-96">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                     type="text"
                     placeholder="Search documents..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                  />
               </div>
               <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                     <Filter size={16} /> Filter
                  </button>
               </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-left">
                     <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700">
                        <tr className="text-xs text-white uppercase tracking-wider font-bold">
                           <th className="px-5 py-4">Client</th>
                           <th className="px-5 py-4">Document Name</th>
                           <th className="px-5 py-4">Lender</th>
                           <th className="px-5 py-4">Modified</th>
                           <th className="px-5 py-4 pl-10">Tags</th>
                           <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody>
                        {filteredDocs.map((doc, index) => (
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
                                 group
                              `}
                           >
                              <td className="px-5 py-4">
                                 <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{getClientName(doc.associatedContactId) || 'N/A'}</span>
                              </td>
                              <td className="px-5 py-4">
                                 <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg shadow-sm flex-shrink-0 ${
                                       doc.type === 'pdf'
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                          : doc.type === 'docx'
                                             ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                             : 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-400'
                                    }`}>
                                       {getFileIcon(doc.type)}
                                    </div>
                                    <button
                                       onClick={() => handlePreview(doc)}
                                       className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left"
                                       title="Click to preview"
                                    >
                                       {doc.name}
                                    </button>
                                 </div>
                              </td>
                              <td className="px-5 py-4">
                                 <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    {getLenderFromDoc(doc) || 'N/A'}
                                 </span>
                              </td>
                              <td className="px-5 py-4">
                                 <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                    {formatDate(doc.dateModified)}
                                 </span>
                              </td>
                              <td className="px-5 py-4 pl-10">
                                 <div className="flex gap-1.5 flex-wrap">
                                    {doc.tags.map((tag, tagIndex) => {
                                       const tagColors = [
                                          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
                                          'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                                          'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
                                          'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
                                       ];
                                       return (
                                          <span
                                             key={tag}
                                             className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tagColors[tagIndex % tagColors.length]}`}
                                          >
                                             <Tag size={10} className="mr-1" /> {tag}
                                          </span>
                                       );
                                    })}
                                 </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                 <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                       onClick={() => handleEditClick(doc)}
                                       className="p-2 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-500 transition-colors"
                                       title="Edit"
                                    >
                                       <Edit size={14} />
                                    </button>
                                    <button
                                       onClick={() => handlePreview(doc)}
                                       className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                                       title="Preview"
                                    >
                                       <Eye size={14} />
                                    </button>
                                    <button
                                       onClick={() => handlePreview(doc)}
                                       disabled={!doc.url}
                                       className={`p-2 rounded-lg transition-colors ${!doc.url
                                          ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50'
                                       }`}
                                       title="Download/View"
                                    >
                                       <Download size={14} />
                                    </button>
                                    <button
                                       className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors"
                                       title="Delete"
                                    >
                                       <Trash2 size={14} />
                                    </button>
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {filteredDocs.length === 0 && (
                     <div className="p-12 text-center text-gray-400">
                        <FileText size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No documents found matching your filters.</p>
                     </div>
                  )}
               </div>
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
      </div>
   );
};

export default Documents;
