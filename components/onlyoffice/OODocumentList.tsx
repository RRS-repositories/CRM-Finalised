import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Edit, Download, Trash2, Loader2, FileDown, RefreshCw, Files
} from 'lucide-react';
import { OOTemplate, OODocument } from '../../types';
import { API_ENDPOINTS } from '../../src/config';
import { useCRM } from '../../context/CRMContext';
import OnlyOfficeEditor from './OnlyOfficeEditor';

interface OODocumentListProps {
  templates: OOTemplate[];
  refreshTrigger?: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-yellow-100 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300', label: 'Draft' },
  final: { bg: 'bg-green-100 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', label: 'Final' },
  sent: { bg: 'bg-blue-100 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', label: 'Sent' },
};

const OODocumentList: React.FC<OODocumentListProps> = ({ templates, refreshTrigger }) => {
  const { addNotification } = useCRM();
  const [documents, setDocuments] = useState<OODocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorTarget, setEditorTarget] = useState<{ type: 'document'; id: number; title: string } | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.oo.documents);
      const data = await res.json();
      if (data.success) setDocuments(data.documents);
    } catch (err) {
      console.error('[OO] Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshTrigger]);

  const getTemplateName = (templateId: number) => {
    return templates.find(t => t.id === templateId)?.name || `Template #${templateId}`;
  };

  const handleDownload = async (doc: OODocument, format?: 'pdf') => {
    try {
      const url = format === 'pdf'
        ? `${API_ENDPOINTS.oo.documents}/${doc.id}/download?format=pdf`
        : `${API_ENDPOINTS.oo.documents}/${doc.id}/download`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.message || 'Download failed');
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleConvertPdf = async (doc: OODocument) => {
    setConvertingId(doc.id);
    try {
      const res = await fetch(`${API_ENDPOINTS.oo.documents}/${doc.id}/convert-pdf`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Conversion failed');

      setDocuments(prev => prev.map(d => d.id === doc.id ? data.document : d));
      addNotification('success', 'PDF generated successfully');
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'PDF conversion failed');
    } finally {
      setConvertingId(null);
    }
  };

  const handleDelete = async (doc: OODocument) => {
    if (!window.confirm(`Delete document "${doc.name}"?`)) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.oo.documents}/${doc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Delete failed');

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      addNotification('success', `Document "${doc.name}" deleted`);
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleStatusChange = async (doc: OODocument, status: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.oo.documents}/${doc.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Status update failed');
      setDocuments(prev => prev.map(d => d.id === doc.id ? data.document : d));
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Files className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Generated Documents</h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400">
            {documents.length}
          </span>
        </div>
        <button
          onClick={() => { setLoading(true); fetchDocuments(); }}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-slate-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <Files className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No documents generated yet. Use the Templates section above to generate documents.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-700/50 text-left">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Template</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Modified</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {documents.map(doc => {
                const statusStyle = STATUS_STYLES[doc.status] || STATUS_STYLES.draft;
                return (
                  <tr key={doc.id} className="group hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">{doc.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {getTemplateName(doc.templateId)}
                    </td>
                    <td className="px-6 py-3">
                      <select
                        value={doc.status}
                        onChange={(e) => handleStatusChange(doc, e.target.value)}
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border-0 cursor-pointer ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <option value="draft">Draft</option>
                        <option value="final">Final</option>
                        <option value="sent">Sent</option>
                      </select>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(doc.updatedAt)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditorTarget({ type: 'document', id: doc.id, title: doc.name })}
                          title="Open in editor"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          title="Download DOCX"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {doc.s3KeyPdf ? (
                          <button
                            onClick={() => handleDownload(doc, 'pdf')}
                            title="Download PDF"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20 transition-colors"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConvertPdf(doc)}
                            disabled={convertingId === doc.id}
                            title="Convert to PDF"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:text-orange-400 dark:hover:bg-orange-900/20 disabled:opacity-50 transition-colors"
                          >
                            {convertingId === doc.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileDown className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(doc)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Editor overlay */}
      {editorTarget && (
        <OnlyOfficeEditor
          type={editorTarget.type}
          id={editorTarget.id}
          title={editorTarget.title}
          onClose={() => { setEditorTarget(null); fetchDocuments(); }}
        />
      )}
    </div>
  );
};

export default OODocumentList;
