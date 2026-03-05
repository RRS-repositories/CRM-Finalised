import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Clock, Wifi, Key, Zap, RotateCw
} from 'lucide-react';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface Credential {
  id: string;
  service: string;
  credential_type: string;
  platform: string;
  status: string;
  expires_at: string | null;
  last_tested_at: string | null;
  last_test_result: string | null;
  last_refreshed_at: string | null;
  error_message: string | null;
  health_level: string;
  created_at: string;
}

interface Summary {
  total: number;
  active: number;
  expiring_soon: number;
  expired: number;
  errors: number;
  refreshing: number;
  tests_passing: number;
  tests_failing: number;
}

interface WebhookStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead_letter: number;
  avg_attempts_to_complete: number;
}

interface DeadLetter {
  id: string;
  source: string;
  status: string;
  attempts: number;
  last_error: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.FC<any>; color: string; bg: string }> = {
  active: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  expiring_soon: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  expired: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  refreshing: { icon: RotateCw, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  claude: 'Claude AI',
  sendgrid: 'SendGrid',
  twilio: 'Twilio',
};

const CredentialHealth: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'credentials' | 'webhooks'>('credentials');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, summaryRes, webhookRes, deadRes] = await Promise.all([
        fetch('/api/marketing/credentials/health'),
        fetch('/api/marketing/credentials/summary'),
        fetch('/api/marketing/credentials/webhook-queue/stats'),
        fetch('/api/marketing/credentials/webhook-queue/dead-letters'),
      ]);
      if (healthRes.ok) setCredentials(await healthRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (webhookRes.ok) setWebhookStats(await webhookRes.json());
      if (deadRes.ok) setDeadLetters(await deadRes.json());
    } catch (err) {
      console.error('Failed to fetch credential health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTest = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/credentials/${id}/test`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error testing credential:', err);
    }
  };

  const handleRefresh = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/credentials/${id}/refresh`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error refreshing credential:', err);
    }
  };

  const handleRetryDeadLetter = async (id: string) => {
    try {
      const res = await fetch(`/api/marketing/credentials/webhook-queue/${id}/retry`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error retrying dead letter:', err);
    }
  };

  const daysUntilExpiry = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const credColumns: Column<Credential>[] = [
    { key: 'service', label: 'Service', render: (r) => (
      <div className="flex items-center gap-2">
        <Key size={14} className="text-gray-400" />
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{r.service}</p>
          <p className="text-xs text-gray-500">{r.credential_type.replace(/_/g, ' ')}</p>
        </div>
      </div>
    )},
    { key: 'platform', label: 'Platform', render: (r) => (
      <span className="text-sm">{PLATFORM_LABELS[r.platform] || r.platform || '-'}</span>
    )},
    { key: 'status', label: 'Status', render: (r) => {
      const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.active;
      const Icon = cfg.icon;
      return (
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={cfg.color} />
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
            {r.status.replace(/_/g, ' ')}
          </span>
        </div>
      );
    }},
    { key: 'expires_at', label: 'Expires', render: (r) => {
      const days = daysUntilExpiry(r.expires_at);
      if (days === null) return <span className="text-gray-400 text-xs">No expiry</span>;
      const color = days < 0 ? 'text-red-500' : days < 7 ? 'text-amber-500' : 'text-gray-500';
      return (
        <span className={`text-xs ${color}`}>
          {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`}
        </span>
      );
    }},
    { key: 'last_test_result', label: 'Last Test', render: (r) => {
      if (!r.last_test_result) return <span className="text-gray-400 text-xs">Never tested</span>;
      return (
        <div className="flex items-center gap-1">
          {r.last_test_result === 'success'
            ? <CheckCircle2 size={12} className="text-emerald-500" />
            : <XCircle size={12} className="text-red-500" />}
          <span className="text-xs text-gray-500">
            {r.last_tested_at ? new Date(r.last_tested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
          </span>
        </div>
      );
    }},
    { key: 'id', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-1">
        <button onClick={() => handleTest(r.id)} className="p-1.5 text-gray-400 hover:text-blue-500" title="Test">
          <Wifi size={14} />
        </button>
        {r.credential_type === 'oauth_token' && (
          <button onClick={() => handleRefresh(r.id)} className="p-1.5 text-gray-400 hover:text-emerald-500" title="Refresh">
            <RotateCw size={14} />
          </button>
        )}
      </div>
    )},
  ];

  const deadLetterColumns: Column<DeadLetter>[] = [
    { key: 'source', label: 'Source', render: (r) => (
      <span className="font-medium text-gray-900 dark:text-white capitalize">{r.source}</span>
    )},
    { key: 'attempts', label: 'Attempts', align: 'right' },
    { key: 'last_error', label: 'Error', render: (r) => (
      <span className="text-xs text-red-500 truncate max-w-xs block">{r.last_error || '-'}</span>
    )},
    { key: 'created_at', label: 'Received', render: (r) => (
      <span className="text-xs text-gray-500">
        {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </span>
    )},
    { key: 'id', label: '', render: (r) => (
      <button onClick={() => handleRetryDeadLetter(r.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
        Retry
      </button>
    )},
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total Credentials" value={String(summary.total || 0)} icon={Key} color="blue" />
          <KPICard label="Active" value={String(summary.active || 0)} icon={CheckCircle2} color="green" />
          <KPICard label="Expiring Soon" value={String(summary.expiring_soon || 0)} icon={AlertTriangle} color="yellow" />
          <KPICard label="Errors" value={String((Number(summary.expired || 0) + Number(summary.errors || 0)))} icon={XCircle} color="pink" />
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
        {[
          { key: 'credentials', label: 'API Credentials' },
          { key: 'webhooks', label: 'Webhook Queue' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={fetchData} className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Credentials Tab */}
      {tab === 'credentials' && (
        <div className="space-y-6">
          {credentials.length > 0 ? (
            <>
              {/* Error/Warning banners */}
              {credentials.some(c => c.health_level === 'critical') && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                  <XCircle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Critical: Credentials need attention</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      {credentials.filter(c => c.health_level === 'critical').length} credential(s) are expired or have errors.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <DataTable
                  columns={credColumns}
                  data={credentials}
                  rowKey={(r) => r.id}
                  defaultSortKey="status"
                  emptyMessage="No credentials configured"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Shield size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">No Credentials Configured</p>
              <p className="text-sm mt-1">API credentials will appear here once configured.</p>
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === 'webhooks' && (
        <div className="space-y-6">
          {/* Webhook Stats */}
          {webhookStats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Pending', value: webhookStats.pending, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
                { label: 'Processing', value: webhookStats.processing, color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300' },
                { label: 'Completed', value: webhookStats.completed, color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
                { label: 'Failed', value: webhookStats.failed, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
                { label: 'Dead Letter', value: webhookStats.dead_letter, color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
                { label: 'Total', value: webhookStats.total, color: 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
              ].map((s) => (
                <div key={s.label} className={`rounded-lg p-3 text-center ${s.color}`}>
                  <p className="text-2xl font-bold">{Number(s.value) || 0}</p>
                  <p className="text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Dead Letters */}
          {deadLetters.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" /> Dead Letter Queue
                </h3>
              </div>
              <DataTable
                columns={deadLetterColumns}
                data={deadLetters}
                rowKey={(r) => r.id}
                defaultSortKey="created_at"
                emptyMessage="No dead letters"
              />
            </div>
          )}

          {!webhookStats?.total && deadLetters.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Zap size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">No Webhook Activity</p>
              <p className="text-sm mt-1">Webhook queue data will appear once webhooks start processing.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CredentialHealth;
