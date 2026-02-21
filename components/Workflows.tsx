import React, { useEffect, useState, useCallback } from 'react';
import {
  Zap, Loader2, RefreshCw, ExternalLink, Maximize2, Minimize2, XCircle
} from 'lucide-react';

const WINDMILL_PROXY = '/wm';

const Workflows: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Set the Windmill auth cookie before loading the iframe
  const authenticate = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/windmill/auth-cookie');
      const data = await res.json();
      if (data.ok) {
        setReady(true);
      } else {
        setError(data.error || 'Failed to authenticate with Windmill');
      }
    } catch {
      setError('Server unreachable — is the backend running?');
    }
  }, []);

  useEffect(() => { authenticate(); }, [authenticate]);

  // ─── Loading / Error states ───────────────────────────────────────────
  if (!ready && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-900 text-gray-400">
        <Loader2 size={36} className="animate-spin mb-4" />
        <p className="text-sm">Connecting to Windmill...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-900">
        <XCircle size={40} className="text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-navy-900 dark:text-white mb-2">Connection Failed</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md text-center">{error}</p>
        <button
          onClick={authenticate}
          className="px-4 py-2 bg-[#FF6D5A] hover:bg-[#E05C4B] text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  // ─── Windmill embedded ────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full bg-slate-50 dark:bg-slate-900 ${expanded ? 'fixed inset-0 z-[200]' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        <Zap size={18} className="text-brand-orange" fill="currentColor" />
        <span className="font-bold text-navy-900 dark:text-white text-sm">Automation</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">Powered by Windmill</span>
        <div className="flex-1" />
        <button
          onClick={() => { setIframeKey(k => k + 1); setLoading(true); }}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title="Reload"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <a
          href={WINDMILL_PROXY}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title="Open in new tab"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Iframe */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400 z-10">
            <Loader2 size={36} className="animate-spin mb-4" />
            <p className="text-sm">Loading Windmill...</p>
          </div>
        )}
        <iframe
          key={iframeKey}
          src={WINDMILL_PROXY}
          className="w-full h-full border-0"
          title="Windmill"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
};

export default Workflows;
