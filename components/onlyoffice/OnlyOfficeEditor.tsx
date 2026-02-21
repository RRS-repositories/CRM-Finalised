import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Download, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { API_ENDPOINTS } from '../../src/config';
import MergeFieldPicker from './MergeFieldPicker';

interface OnlyOfficeEditorProps {
  type: 'template' | 'document';
  id: number;
  title: string;
  onClose: () => void;
}

interface EditorConfigResponse {
  success: boolean;
  config: Record<string, unknown>;
  onlyOfficeUrl: string;
  message?: string;
}

interface OOConnector {
  executeMethod(method: string, args: unknown[], callback?: (returnValue: unknown) => void): void;
  callCommand(command: () => void, isNoCalc?: boolean, isRecalc?: boolean): void;
  disconnect(): void;
}

interface OODocEditor {
  destroyEditor: () => void;
  createConnector: () => OOConnector;
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (containerId: string, config: Record<string, unknown>) => OODocEditor;
    };
  }
}

const OnlyOfficeEditor: React.FC<OnlyOfficeEditorProps> = ({ type, id, title, onClose }) => {
  const [state, setState] = useState<'loading' | 'editor' | 'fallback'>('loading');
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [editorConfig, setEditorConfig] = useState<Record<string, unknown> | null>(null);
  const editorRef = useRef<OODocEditor | null>(null);
  const connectorRef = useRef<OOConnector | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const endpoint = type === 'template'
        ? `${API_ENDPOINTS.oo.templates}/${id}/editor-config`
        : `${API_ENDPOINTS.oo.documents}/${id}/editor-config`;

      const res = await fetch(endpoint);
      const data: EditorConfigResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load editor config');
      }

      // Store the download URL for fallback
      const docUrl = (data.config?.document as Record<string, unknown>)?.url as string;
      if (docUrl) setDownloadUrl(docUrl);

      // Check if OnlyOffice URL is configured
      if (!data.onlyOfficeUrl) {
        setState('fallback');
        return;
      }

      // Try to load the OnlyOffice API script
      const scriptUrl = `${data.onlyOfficeUrl}/web-apps/apps/api/documents/api.js`;
      const script = document.createElement('script');
      script.src = scriptUrl;

      script.onload = () => {
        if (window.DocsAPI) {
          setEditorConfig(data.config);
          setState('editor');
        } else {
          setState('fallback');
        }
      };

      script.onerror = () => {
        setState('fallback');
      };

      document.head.appendChild(script);
    } catch (err) {
      console.error('[OO Editor] Config fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load editor');
      setState('fallback');
    }
  }, [type, id]);

  useEffect(() => {
    fetchConfig();
    return () => {
      if (connectorRef.current) {
        try { connectorRef.current.disconnect(); } catch { /* noop */ }
        connectorRef.current = null;
      }
      if (editorRef.current) {
        try { editorRef.current.destroyEditor(); } catch { /* noop */ }
      }
    };
  }, [fetchConfig]);

  // Fetch download URL for fallback mode
  useEffect(() => {
    if (state === 'fallback' && !downloadUrl) {
      const fetchDownload = async () => {
        try {
          if (type === 'template') {
            const res = await fetch(`${API_ENDPOINTS.oo.templates}/${id}`);
            const data = await res.json();
            if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
          } else {
            const res = await fetch(`${API_ENDPOINTS.oo.documents}/${id}/download`);
            const data = await res.json();
            if (data.url) setDownloadUrl(data.url);
          }
        } catch { /* ignore */ }
      };
      fetchDownload();
    }
  }, [state, downloadUrl, type, id]);

  // Initialize OnlyOffice editor once the container div is in the DOM
  useEffect(() => {
    if (state === 'editor' && editorConfig && window.DocsAPI && !editorRef.current) {
      try {
        const configWithEvents = {
          ...editorConfig,
          events: {
            ...((editorConfig.events as Record<string, unknown>) || {}),
            onDocumentReady: () => {
              try {
                if (editorRef.current) {
                  connectorRef.current = editorRef.current.createConnector();
                  console.log('[OO] Connector created successfully');
                }
              } catch (err) {
                console.warn('[OO] Failed to create connector (clipboard fallback active):', err);
              }
            },
          },
        };
        editorRef.current = new window.DocsAPI.DocEditor('oo-editor-container', configWithEvents);
      } catch (err) {
        console.error('[OO Editor] Failed to initialize:', err);
        setState('fallback');
      }
    }
  }, [state, editorConfig]);

  const insertFieldAtCursor = useCallback(async (fieldKey: string): Promise<'inserted' | 'copied'> => {
    const text = `{{${fieldKey}}}`;

    if (connectorRef.current) {
      return new Promise((resolve) => {
        let resolved = false;
        connectorRef.current!.executeMethod('InputText', [text], () => {
          if (!resolved) { resolved = true; resolve('inserted'); }
        });
        // Timeout: some OO versions don't fire the callback reliably
        setTimeout(() => { if (!resolved) { resolved = true; resolve('inserted'); } }, 2000);
      });
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return 'copied';
  }, []);

  const handleFieldInsert = useCallback(async (fieldKey: string) => {
    const result = await insertFieldAtCursor(fieldKey);
    if (result === 'inserted') {
      setToastMsg(`Inserted {{${fieldKey}}}`);
    } else {
      setToastMsg(`Copied {{${fieldKey}}} — paste with Ctrl+V`);
    }
    setTimeout(() => setToastMsg(''), 2500);
  }, [insertFieldAtCursor]);

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-900 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="h-5 w-px bg-gray-300 dark:bg-slate-600" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-md">
            {title}
          </span>
          {type === 'template' && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              Template
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {type === 'template' && <MergeFieldPicker onFieldSelect={handleFieldInsert} />}
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab
            </a>
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium shadow-lg transition-opacity">
          {toastMsg}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 relative">
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading editor...</p>
            </div>
          </div>
        )}

        {state === 'editor' && (
          <div id="oo-editor-container" className="w-full h-full" />
        )}

        {state === 'fallback' && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 max-w-md w-full text-center">
              <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Document Editor Not Connected
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {error || 'The OnlyOffice Document Server is not available. You can still download and edit this document locally.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download DOCX
                  </a>
                )}
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in new tab
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlyOfficeEditor;
