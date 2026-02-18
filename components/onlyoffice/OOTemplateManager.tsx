import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Search, FileText, Edit, Trash2, Loader2, Filter, FolderOpen
} from 'lucide-react';
import { OOTemplate, OODocument } from '../../types';
import { API_ENDPOINTS } from '../../src/config';
import { useCRM } from '../../context/CRMContext';
import OnlyOfficeEditor from './OnlyOfficeEditor';
import GenerateDocumentModal from './GenerateDocumentModal';

interface OOTemplateManagerProps {
  onTemplatesLoaded?: (templates: OOTemplate[]) => void;
  onDocumentGenerated?: () => void;
}

const OOTemplateManager: React.FC<OOTemplateManagerProps> = ({ onTemplatesLoaded, onDocumentGenerated }) => {
  const { addNotification } = useCRM();
  const [templates, setTemplates] = useState<OOTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [uploading, setUploading] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ type: 'template'; id: number; title: string } | null>(null);
  const [generateTarget, setGenerateTarget] = useState<OOTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.oo.templates);
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates);
        onTemplatesLoaded?.(data.templates);
      }
    } catch (err) {
      console.error('[OO] Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, [onTemplatesLoaded]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const categories = ['All', ...new Set(templates.map(t => t.category).filter(Boolean))];

  const filtered = templates.filter(t => {
    const matchSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = categoryFilter === 'All' || t.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const name = file.name.replace(/\.docx$/i, '');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      formData.append('category', 'General');

      const res = await fetch(API_ENDPOINTS.oo.templates, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Upload failed');

      setTemplates(prev => [...prev, data.template]);
      onTemplatesLoaded?.([...templates, data.template]);
      addNotification('success', `Template "${data.template.name}" uploaded`);
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (template: OOTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"? The S3 file will be kept.`)) return;

    try {
      const res = await fetch(`${API_ENDPOINTS.oo.templates}/${template.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Delete failed');

      const updated = templates.filter(t => t.id !== template.id);
      setTemplates(updated);
      onTemplatesLoaded?.(updated);
      addNotification('success', `Template "${template.name}" deleted`);
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleDocGenerated = (_doc: OODocument) => {
    setGenerateTarget(null);
    onDocumentGenerated?.();
    addNotification('success', 'Document generated successfully');
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Templates</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400">
              {templates.length}
            </span>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading...' : 'Upload Template'}
            </button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {templates.length === 0 ? 'No templates uploaded yet' : 'No templates match your search'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/50 text-left">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fields</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Modified</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filtered.map(template => (
                <tr key={template.id} className="group hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</p>
                        {template.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{template.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">
                      {template.category}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {template.mergeFields.length} fields
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(template.updatedAt)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditorTarget({ type: 'template', id: template.id, title: template.name })}
                        title="Edit in OnlyOffice"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setGenerateTarget(template)}
                        title="Generate Document"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor overlay */}
      {editorTarget && (
        <OnlyOfficeEditor
          type={editorTarget.type}
          id={editorTarget.id}
          title={editorTarget.title}
          onClose={() => { setEditorTarget(null); fetchTemplates(); }}
        />
      )}

      {/* Generate modal */}
      {generateTarget && (
        <GenerateDocumentModal
          template={generateTarget}
          onClose={() => setGenerateTarget(null)}
          onGenerated={handleDocGenerated}
        />
      )}
    </div>
  );
};

export default OOTemplateManager;
