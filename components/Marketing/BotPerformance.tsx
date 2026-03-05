import React, { useEffect, useState, useCallback } from 'react';
import {
  Bot, Users, CheckCircle2, HandMetal, Target, TrendingDown,
  MessageCircle, Clock, RefreshCw, AlertTriangle, BarChart3
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface BotStats {
  total_conversations: number;
  fully_resolved: number;
  handed_off: number;
  in_qualifying: number;
  in_converting: number;
  dropped_off: number;
  resolution_rate: number;
  handoff_rate: number;
  avg_bot_messages: number;
  avg_qualification_score: number;
}

interface FunnelEntry { funnel_stage: string; count: number; }
interface ChannelEntry { primary_channel: string; total: number; registered: number; handoffs: number; }
interface ObjectionEntry { objection_type: string; times_used: number; resolution_rate: number; }
interface DailyMetric {
  date: string;
  new_conversations: number;
  bot_handled_fully: number;
  bot_to_human_handoffs: number;
  bot_qualification_completed: number;
  leads_registered: number;
  avg_first_response_seconds: number;
}

const FUNNEL_COLORS: Record<string, string> = {
  engaged: '#3b82f6',
  qualifying: '#06b6d4',
  qualified: '#6366f1',
  educating: '#8b5cf6',
  objection_handling: '#f59e0b',
  converting: '#f97316',
  registered: '#10b981',
  dropped_off: '#ef4444',
  unqualified: '#6b7280',
  cold: '#94a3b8',
};

const CHANNEL_LABELS: Record<string, string> = {
  fb_messenger: 'Messenger',
  instagram_dm: 'Instagram',
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
  tiktok_dm: 'TikTok',
};

const BotPerformance: React.FC = () => {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelEntry[]>([]);
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [objections, setObjections] = useState<ObjectionEntry[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'funnel' | 'objections'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/chatbot/performance');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setFunnel(data.funnel);
        setChannels(data.channels);
        setObjections(data.objections);
        setDailyMetrics(data.dailyMetrics);
      }
    } catch (err) {
      console.error('Failed to fetch bot performance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const funnelChartData = funnel.map(f => ({
    stage: f.funnel_stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count: Number(f.count),
    fill: FUNNEL_COLORS[f.funnel_stage] || '#94a3b8',
  }));

  const dailyChartData = dailyMetrics.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    'New Conversations': d.new_conversations,
    'Bot Resolved': d.bot_handled_fully,
    'Handoffs': d.bot_to_human_handoffs,
    'Registered': d.leads_registered,
  }));

  const objectionColumns: Column<ObjectionEntry>[] = [
    { key: 'objection_type', label: 'Objection', render: (r) => (
      <span className="font-medium text-gray-900 dark:text-white capitalize">{r.objection_type.replace(/_/g, ' ')}</span>
    )},
    { key: 'times_used', label: 'Times Raised', align: 'right' },
    { key: 'resolution_rate', label: 'Resolution Rate', align: 'right', render: (r) => (
      <div className="flex items-center gap-2 justify-end">
        <div className="w-16 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Number(r.resolution_rate), 100)}%` }} />
        </div>
        <span className="text-xs">{Number(r.resolution_rate).toFixed(0)}%</span>
      </div>
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
          <KPICard label="Total Bot Convos" value={String(stats.total_conversations)} icon={Bot} color="indigo" />
          <KPICard label="Resolution Rate" value={`${stats.resolution_rate}%`} icon={CheckCircle2} color="green" />
          <KPICard label="Handoff Rate" value={`${stats.handoff_rate}%`} icon={HandMetal} color="yellow" />
          <KPICard label="Avg Bot Messages" value={String(stats.avg_bot_messages)} icon={MessageCircle} color="blue" />
          <KPICard label="Avg Qual Score" value={String(stats.avg_qualification_score)} icon={Target} color="purple" />
          <KPICard label="Dropped Off" value={String(stats.dropped_off)} icon={TrendingDown} color="pink" />
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'funnel', label: 'Qualification Funnel' },
          { key: 'objections', label: 'Objection Heatmap' },
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
          {/* Daily Metrics Chart */}
          {dailyChartData.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Daily Bot Activity</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="New Conversations" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Bot Resolved" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Handoffs" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Registered" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Channel Breakdown */}
          {channels.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Performance by Channel</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {channels.map((ch) => {
                  const convRate = Number(ch.total) > 0 ? ((Number(ch.registered) / Number(ch.total)) * 100).toFixed(1) : '0';
                  return (
                    <div key={ch.primary_channel} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {CHANNEL_LABELS[ch.primary_channel] || ch.primary_channel}
                      </p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{ch.total}</p>
                      <div className="flex justify-center gap-3 mt-1 text-[10px] text-gray-400">
                        <span className="text-emerald-500">{ch.registered} reg</span>
                        <span className="text-amber-500">{ch.handoffs} handoff</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{convRate}% conv</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!stats?.total_conversations && dailyChartData.length === 0 && (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Bot size={48} className="mx-auto mb-3" />
              <p className="text-lg font-medium">No Bot Conversations Yet</p>
              <p className="text-sm mt-1">Data will appear once the chatbot handles conversations.</p>
            </div>
          )}
        </div>
      )}

      {/* Funnel Tab */}
      {tab === 'funnel' && (
        <div className="space-y-6">
          {funnelChartData.length > 0 ? (
            <>
              {/* Funnel Visualization */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Qualification Funnel</h3>
                <div className="space-y-2">
                  {funnelChartData.map((stage, i) => {
                    const maxCount = Math.max(...funnelChartData.map(s => s.count), 1);
                    const pct = (stage.count / maxCount) * 100;
                    const dropOff = i > 0 && funnelChartData[i - 1].count > 0
                      ? ((funnelChartData[i - 1].count - stage.count) / funnelChartData[i - 1].count * 100).toFixed(0)
                      : null;
                    return (
                      <div key={stage.stage} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-32 text-right flex-shrink-0">{stage.stage}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-8 relative overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-3 transition-all"
                            style={{ width: `${Math.max(pct, 5)}%`, backgroundColor: stage.fill }}
                          >
                            <span className="text-xs font-bold text-white">{stage.count}</span>
                          </div>
                        </div>
                        {dropOff && (
                          <span className="text-xs text-red-400 w-16 flex-shrink-0">-{dropOff}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Funnel Bar Chart */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Stage Distribution</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={funnelChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {funnelChartData.map((entry) => (
                        <Cell key={entry.stage} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <BarChart3 size={40} className="mx-auto mb-2" />
              <p className="text-sm">No funnel data yet</p>
            </div>
          )}
        </div>
      )}

      {/* Objections Tab */}
      {tab === 'objections' && (
        <div className="space-y-6">
          {objections.length > 0 ? (
            <>
              {/* Objection Heatmap */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Objection Frequency</h3>
                <div className="flex flex-wrap gap-2">
                  {objections.map((obj) => {
                    const maxUsed = Math.max(...objections.map(o => o.times_used), 1);
                    const intensity = obj.times_used / maxUsed;
                    const bg = intensity > 0.7 ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800'
                      : intensity > 0.4 ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
                    return (
                      <div key={obj.objection_type} className={`px-3 py-2 rounded-lg border ${bg}`}>
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 capitalize">
                          {obj.objection_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{obj.times_used}</p>
                        <p className="text-[10px] text-gray-500">{Number(obj.resolution_rate).toFixed(0)}% resolved</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Objection Table */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <DataTable
                  columns={objectionColumns}
                  data={objections}
                  rowKey={(r) => r.objection_type}
                  defaultSortKey="times_used"
                  emptyMessage="No objections tracked yet"
                />
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <AlertTriangle size={40} className="mx-auto mb-2" />
              <p className="text-sm">No objection data yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BotPerformance;
