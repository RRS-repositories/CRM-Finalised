import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock, RefreshCw, Play, Pause, CheckCircle2, Target,
  MessageCircle, Users, TrendingUp, Snowflake, BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface SequenceRow {
  id: string;
  name: string;
  trigger_condition: string;
  is_active: boolean;
  total_enrolled: number;
  total_converted: number;
  conversion_rate: number;
  active_now: number;
  completed_count: number;
  converted_count: number;
  paused_count: number;
  unsubscribed_count: number;
  avg_messages_to_complete: number | null;
  responded_count: number;
  total_queue_items: number;
}

interface StepRow {
  current_step: number;
  total_at_step: number;
  responded: number;
  converted: number;
  unsubscribed: number;
}

interface OverallStats {
  total_enrolled: number;
  active: number;
  converted: number;
  completed: number;
  unsubscribed: number;
  total_responded: number;
  avg_messages_sent: number;
  overall_conversion_rate: number;
  overall_response_rate: number;
}

interface ColdRecovery {
  total_cold_enrolled: number;
  cold_converted: number;
  cold_responded: number;
}

interface QueueItem {
  id: string;
  conversation_id: string;
  sequence_name: string;
  trigger_condition: string;
  current_step: number;
  max_steps: number;
  next_send_at: string;
  next_channel: string;
  status: string;
  messages_sent: number;
  lead_responded: boolean;
  contact_name: string;
  contact_email: string;
  primary_channel: string;
  funnel_stage: string;
  conversation_status: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  no_response_24h: 'No Response (24h)',
  dropped_off_qualifying: 'Dropped Off (Qualifying)',
  dropped_off_converting: 'Dropped Off (Converting)',
  started_not_completed: 'Started Not Completed',
  viewed_landing_page: 'Viewed Landing Page',
  partial_registration: 'Partial Registration',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#3b82f6',
  paused: '#f59e0b',
  completed: '#10b981',
  converted: '#8b5cf6',
  unsubscribed: '#ef4444',
  max_reached: '#6b7280',
};

const FollowUpPerformance: React.FC = () => {
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [stepAnalytics, setStepAnalytics] = useState<StepRow[]>([]);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [coldRecovery, setColdRecovery] = useState<ColdRecovery | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'sequences' | 'queue'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [perfRes, queueRes] = await Promise.all([
        fetch('/api/marketing/followups/performance'),
        fetch('/api/marketing/followups/queue?status=active'),
      ]);
      if (perfRes.ok) {
        const data = await perfRes.json();
        setSequences(data.sequences || []);
        setStepAnalytics(data.stepAnalytics || []);
        setStats(data.stats || null);
        setColdRecovery(data.coldRecovery || null);
      }
      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue(data);
      }
    } catch (err) {
      console.error('Failed to fetch follow-up performance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePause = async (queueId: string) => {
    try {
      const res = await fetch(`/api/marketing/followups/queue/${queueId}/pause`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error pausing:', err);
    }
  };

  const stepChartData = stepAnalytics.map(s => ({
    step: `Step ${Number(s.current_step) + 1}`,
    'At Step': Number(s.total_at_step),
    'Responded': Number(s.responded),
    'Converted': Number(s.converted),
    'Unsubscribed': Number(s.unsubscribed),
  }));

  const sequenceStatusData = sequences.length > 0 ? [
    { name: 'Active', value: sequences.reduce((s, r) => s + Number(r.active_now), 0), color: STATUS_COLORS.active },
    { name: 'Completed', value: sequences.reduce((s, r) => s + Number(r.completed_count), 0), color: STATUS_COLORS.completed },
    { name: 'Converted', value: sequences.reduce((s, r) => s + Number(r.converted_count), 0), color: STATUS_COLORS.converted },
    { name: 'Paused', value: sequences.reduce((s, r) => s + Number(r.paused_count), 0), color: STATUS_COLORS.paused },
    { name: 'Unsubscribed', value: sequences.reduce((s, r) => s + Number(r.unsubscribed_count), 0), color: STATUS_COLORS.unsubscribed },
  ].filter(d => d.value > 0) : [];

  const seqColumns: Column<SequenceRow>[] = [
    { key: 'name', label: 'Sequence', render: (r) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
        <p className="text-xs text-gray-500">{TRIGGER_LABELS[r.trigger_condition] || r.trigger_condition}</p>
      </div>
    )},
    { key: 'is_active', label: 'Status', render: (r) => (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
        {r.is_active ? 'Active' : 'Paused'}
      </span>
    )},
    { key: 'total_enrolled', label: 'Enrolled', align: 'right' },
    { key: 'active_now', label: 'Active Now', align: 'right' },
    { key: 'converted_count', label: 'Converted', align: 'right', render: (r) => (
      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{r.converted_count}</span>
    )},
    { key: 'conversion_rate', label: 'Conv Rate', align: 'right', render: (r) => (
      <div className="flex items-center gap-2 justify-end">
        <div className="w-14 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Number(r.conversion_rate), 100)}%` }} />
        </div>
        <span className="text-xs">{Number(r.conversion_rate).toFixed(1)}%</span>
      </div>
    )},
    { key: 'responded_count', label: 'Responded', align: 'right' },
    { key: 'unsubscribed_count', label: 'Unsub', align: 'right', render: (r) => (
      <span className="text-red-500">{r.unsubscribed_count}</span>
    )},
  ];

  const queueColumns: Column<QueueItem>[] = [
    { key: 'contact_name', label: 'Contact', render: (r) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{r.contact_name || 'Unknown'}</p>
        <p className="text-xs text-gray-500">{r.contact_email}</p>
      </div>
    )},
    { key: 'sequence_name', label: 'Sequence', render: (r) => (
      <span className="text-sm">{r.sequence_name}</span>
    )},
    { key: 'current_step', label: 'Step', align: 'center', render: (r) => (
      <span className="text-sm">{Number(r.current_step) + 1}/{r.max_steps}</span>
    )},
    { key: 'next_send_at', label: 'Next Send', render: (r) => (
      <span className="text-xs text-gray-500">
        {r.next_send_at ? new Date(r.next_send_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
      </span>
    )},
    { key: 'messages_sent', label: 'Msgs Sent', align: 'right' },
    { key: 'lead_responded', label: 'Responded', align: 'center', render: (r) => (
      r.lead_responded
        ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
        : <span className="text-gray-300">-</span>
    )},
    { key: 'id', label: '', render: (r) => (
      <button onClick={() => handlePause(r.id)} className="p-1.5 text-gray-400 hover:text-amber-500" title="Pause">
        <Pause size={14} />
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
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Total Enrolled" value={String(stats.total_enrolled || 0)} icon={Users} color="blue" />
          <KPICard label="Active Now" value={String(stats.active || 0)} icon={Play} color="indigo" />
          <KPICard label="Converted" value={String(stats.converted || 0)} icon={Target} color="green" />
          <KPICard label="Response Rate" value={`${stats.overall_response_rate || 0}%`} icon={MessageCircle} color="purple" />
          <KPICard label="Conversion Rate" value={`${stats.overall_conversion_rate || 0}%`} icon={TrendingUp} color="orange" />
          <KPICard label="Avg Msgs Sent" value={String(stats.avg_messages_sent || 0)} icon={Clock} color="yellow" />
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'sequences', label: 'Sequences' },
          { key: 'queue', label: 'Active Queue' },
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

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Step Analysis */}
            {stepChartData.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Step-by-Step Analysis</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stepChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="At Step" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Responded" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Converted" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Unsubscribed" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Status Distribution */}
            {sequenceStatusData.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Queue Status Distribution</h3>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={220}>
                    <PieChart>
                      <Pie
                        data={sequenceStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="value"
                        nameKey="name"
                      >
                        {sequenceStatusData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {sequenceStatusData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-700 dark:text-gray-300 flex-1">{d.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cold Lead Recovery */}
          {coldRecovery && Number(coldRecovery.total_cold_enrolled) > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Snowflake size={16} /> Cold Lead Recovery
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{coldRecovery.total_cold_enrolled}</p>
                  <p className="text-xs text-gray-500 mt-1">Cold Leads Enrolled</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{coldRecovery.cold_responded}</p>
                  <p className="text-xs text-gray-500 mt-1">Re-Engaged</p>
                  <p className="text-xs text-gray-400">
                    {Number(coldRecovery.total_cold_enrolled) > 0
                      ? `${((Number(coldRecovery.cold_responded) / Number(coldRecovery.total_cold_enrolled)) * 100).toFixed(1)}%`
                      : '0%'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{coldRecovery.cold_converted}</p>
                  <p className="text-xs text-gray-500 mt-1">Recovered & Converted</p>
                  <p className="text-xs text-gray-400">
                    {Number(coldRecovery.total_cold_enrolled) > 0
                      ? `${((Number(coldRecovery.cold_converted) / Number(coldRecovery.total_cold_enrolled)) * 100).toFixed(1)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!stats?.total_enrolled && stepChartData.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Clock size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">No Follow-Up Data Yet</p>
              <p className="text-sm mt-1">Data will appear once follow-up sequences are active.</p>
            </div>
          )}
        </div>
      )}

      {/* Sequences Tab */}
      {tab === 'sequences' && (
        <div className="space-y-6">
          {sequences.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <DataTable
                columns={seqColumns}
                data={sequences}
                rowKey={(r) => r.id}
                defaultSortKey="total_enrolled"
                emptyMessage="No follow-up sequences configured"
              />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <BarChart3 size={40} className="mx-auto mb-2" />
              <p className="text-sm">No follow-up sequences created yet</p>
            </div>
          )}
        </div>
      )}

      {/* Queue Tab */}
      {tab === 'queue' && (
        <div className="space-y-6">
          {queue.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <DataTable
                columns={queueColumns}
                data={queue}
                rowKey={(r) => r.id}
                defaultSortKey="next_send_at"
                emptyMessage="No active follow-ups in queue"
              />
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <MessageCircle size={40} className="mx-auto mb-2" />
              <p className="text-sm">No active follow-ups in queue</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FollowUpPerformance;
