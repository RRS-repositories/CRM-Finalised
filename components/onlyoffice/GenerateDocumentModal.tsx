import React, { useState } from 'react';
import { X, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { OOTemplate, OODocument } from '../../types';
import { API_ENDPOINTS } from '../../src/config';

interface GenerateDocumentModalProps {
  template: OOTemplate;
  onClose: () => void;
  onGenerated: (doc: OODocument) => void;
}

const GenerateDocumentModal: React.FC<GenerateDocumentModalProps> = ({ template, onClose, onGenerated }) => {
  const [caseId, setCaseId] = useState('');
  const [docName, setDocName] = useState('');
  const [useCustomData, setUseCustomData] = useState(false);
  const [customJson, setCustomJson] = useState('{\n  "client_name": "John Smith",\n  "lender_name": "Vanquis Bank"\n}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState<OODocument | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');

    let mergeData: Record<string, string> | undefined;
    if (useCustomData) {
      try {
        mergeData = JSON.parse(customJson);
      } catch {
        setError('Invalid JSON in merge data');
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_ENDPOINTS.oo.documents}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          caseId: caseId ? Number(caseId) : undefined,
          name: docName || undefined,
          mergeData,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Generation failed');
      }
      setGeneratedDoc(data.document);
      onGenerated(data.document);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Generate Document</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {generatedDoc ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Document Generated</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{generatedDoc.name}</p>
            </div>
          ) : (
            <>
              {/* Template name (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template</label>
                <div className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-700 dark:text-gray-300">
                  {template.name}
                  <span className="ml-2 text-xs text-gray-400">({template.mergeFields.length} fields)</span>
                </div>
              </div>

              {/* Document name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Document Name (optional)</label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder={`${template.name} - Generated ${new Date().toLocaleDateString('en-GB')}`}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Case ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Case ID (optional)</label>
                <input
                  type="number"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Custom merge data toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomData}
                    onChange={(e) => setUseCustomData(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Use custom merge data</span>
                </label>
              </div>

              {useCustomData && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Merge Data (JSON)</label>
                  <textarea
                    value={customJson}
                    onChange={(e) => setCustomJson(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              )}

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
          {generatedDoc ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateDocumentModal;
