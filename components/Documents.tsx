import React, { useState, useRef } from 'react';
import {
   FileText, Search, Filter, Upload, File, Download, Trash2, Tag, Eye, Edit, Save, X,
   Folder, Plus, LayoutGrid, List, ChevronRight, AlignLeft, Bold, Italic, Underline
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Document, Template } from '../types';
import { MOCK_TEMPLATE_FOLDERS, TEMPLATE_VARIABLES } from '../constants';
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
   const { documents, updateDocument, addDocument, addNotification } = useCRM();
   const API_BASE_URL = API_ENDPOINTS.api;
   const [activeCategory, setActiveCategory] = useState('All');
   const [searchQuery, setSearchQuery] = useState('');

   // Edit State
   const [editingDoc, setEditingDoc] = useState<Document | null>(null);
   const [editName, setEditName] = useState('');
   const [editCategory, setEditCategory] = useState('');
   const [editTags, setEditTags] = useState('');

   const categories = ['All', 'Client', 'Correspondence', 'Legal', 'Templates', 'Other'];

   const filteredDocs = documents.filter(doc => {
      const matchesCategory = activeCategory === 'All' || doc.category === activeCategory;
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
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
         {/* Sidebar Categories */}
         <div className="w-64 border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-6 flex flex-col">
            {/* Removed Generic Upload Button to focus on generated content/templates */}
            <div className="mb-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
               Files & Generation
            </div>

            <div className="space-y-1">
               <h3 className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Folders</h3>
               {categories.map(cat => (
                  <button
                     key={cat}
                     onClick={() => setActiveCategory(cat)}
                     className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-between items-center group ${activeCategory === cat ? 'bg-white dark:bg-slate-700 text-navy-700 dark:text-white shadow-sm border border-gray-100 dark:border-slate-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-navy-900 dark:hover:text-white'
                        }`}
                  >
                     <div className="flex items-center gap-2">
                        <Folder size={16} className={`${activeCategory === cat ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'}`} />
                        {cat}
                     </div>
                     {cat !== 'All' && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-600 px-1.5 py-0.5 rounded-full">{documents.filter(d => d.category === cat).length}</span>}
                  </button>
               ))}
            </div>
         </div>

         {/* Main Content */}
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
               <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-left">
                     <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                        <tr>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12">Type</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ver</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Modified</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Size</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tags</th>
                           <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {filteredDocs.map((doc) => (
                           <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group">
                              <td className="px-6 py-4">
                                 {getFileIcon(doc.type)}
                              </td>
                              <td className="px-6 py-4">
                                 <span className="text-sm font-medium text-gray-900 dark:text-white">{doc.name}</span>
                              </td>
                              <td className="px-6 py-4">
                                 <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">v{doc.version || 1}.0</span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                 {doc.dateModified}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                 {doc.size}
                              </td>
                              <td className="px-6 py-4">
                                 <div className="flex gap-1">
                                    {doc.tags.map(tag => (
                                       <span key={tag} className="flex items-center text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900">
                                          <Tag size={10} className="mr-1" /> {tag}
                                       </span>
                                    ))}
                                 </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                 <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleEditClick(doc)} className="p-1.5 text-gray-500 hover:text-navy-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-600 rounded" title="Edit">
                                       <Edit size={16} />
                                    </button>
                                    <button onClick={() => handlePreview(doc)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Preview">
                                       <Eye size={16} />
                                    </button>
                                    {/* Download (also uses secure link) */}
                                    <button
                                       onClick={() => handlePreview(doc)}
                                       disabled={!doc.url}
                                       className={`p-1.5 rounded ${!doc.url ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                                       title="Download/View"
                                    >
                                       <Download size={16} />
                                    </button>
                                    <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                                       <Trash2 size={16} />
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
