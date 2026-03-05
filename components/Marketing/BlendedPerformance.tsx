import React, { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, Users, TrendingDown, Target, BarChart3,
  PieChart, ArrowRight, RefreshCw, Layers
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface BlendedSummary {
  period_start: string;
  period_end: string;
  total_leads: number;
  total_spend: number;
  blended_cpl: number;
  cost_per_signed: number;
  roi_pct: number;
  leads_signed: number;
  leads_won: number;
  total_fees: number;
  total_compensation: number;
  tiktok_organic_leads: number;
  tiktok_spark_leads: number;
  tiktok_paid_leads: number;
  meta_paid_leads: number;
  meta_organic_leads: number;
  cross_platform_retarget_leads: number;
}

interface TrendPoint {
  period_start: string;
  total_leads: number;
  total_spend: number;
  blended_cpl: number;
  cost_per_signed: number;
  tiktok_organic_leads: number;
  tiktok_spark_leads: number;
  tiktok_paid_leads: number;
  meta_paid_leads: number;
  meta_organic_leads: number;
  cross_platform_retarget_leads: number;
}

interface SourceBreakdown {
  source: string;
  leads: number;
  spend: number;
  cpl: number;
}

interface JourneyStats {
  primary_attribution: string;
  total_journeys: number;
  conversions: number;
  avg_touches: number;
  total_cost: number;
  cost_per_conversion: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  'TikTok Organic': '#10b981',
  'TikTok Spark Ads': '#f59e0b',
  'TikTok Paid': '#ef4444',
  'Meta Paid': '#3b82f6',
  'Meta Organic': '#8b5cf6',
  'Cross-Platform Retarget': '#ec4899',
};

const BlendedPerformance: React.FC = () => {
  const [summary, setSummary] = useState<BlendedSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [sources, setSources] = useState<SourceBreakdown[]>([]);
  const [journeys, setJourneys] = useState<JourneyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, trendRes, sourceRes, journeyRes] = await Promise.all([
        fetch(`/api/marketing/blended/summary?period_type=${periodType}`),
        fetch(`/api/marketing/blended/trend?period_type=${periodType}`),
        fetch('/api/marketing/blended/by-source'),
        fetch('/api/marketing/blended/journeys'),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (trendRes.ok) setTrend(await trendRes.json());
      if (sourceRes.ok) {
        const data = await sourceRes.json();
        setSources(data.sources || []);
      }
      if (journeyRes.ok) setJourneys(await journeyRes.json());
    } catch (err) {
      console.error('Failed to fetch blended data:', err);
    } finally {
      setLoading(false);
    }
  }, [periodType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const trendChartData = trend.map(t => ({
    period: new Date(t.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    'Blended CPL': Number(t.blended_cpl),
    'Cost/Signed': Number(t.cost_per_signed),
    'Total Leads': t.total_leads,
  }));

  const waterfallData = sources.filter(s => s.leads > 0).map(s => ({
    name: s.source,
    leads: s.leads,
    spend: s.spend,
    cpl: Number(s.cpl.toFixed(2)),
  }));

  const leadsByChannel = trend.length > 0 ? trend.map(t => ({
    period: new Date(t.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    'TikTok Organic': t.tiktok_organic_leads,
    'TikTok Spark': t.tiktok_spark_leads,
    'TikTok Paid': t.tiktok_paid_leads,
    'Meta Paid': t.meta_paid_leads,
    'Meta Organic': t.meta_organic_leads,
    'Cross-Platform': t.cross_platform_retarget_leads,
  })) : [];

  const journeyColumns: Column<JourneyStats>[] = [
    { key: 'primary_attribution', label: 'Attribution', render: (r) => (
      <span className="font-medium text-gray-900 dark:text-white capitalize">{(r.primary_attribution || '').replace(/_/g, ' ')}</span>
    )},
    { key: 'total_journeys', label: 'Journeys', align: 'right' },
    { key: 'conversions', label: 'Conversions', align: 'right' },
    { key: 'avg_touches', label: 'Avg Touches', align: 'right' },
    { key: 'total_cost', label: 'Total Cost', align: 'right', render: (r) => `$${Number(r.total_cost).toLocaleString()}` },
    { key: 'cost_per_conversion', label: 'Cost/Conversion', align: 'right', render: (r) => Number(r.cost_per_conversion) > 0 ? `$${Number(r.cost_per_conversion).toFixed(2)}` : '-' },
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard
          label="Blended CPL"
          value={summary ? `$${Number(summary.blended_cpl).toFixed(2)}` : '$0'}
          icon={Target}
          color="blue"
          invertDelta
        />
        <KPICard
          label="Cost per Signed"
          value={summary ? `$${Number(summary.cost_per_signed).toFixed(2)}` : '$0'}
          icon={DollarSign}
          color="purple"
          invertDelta
        />
        <KPICard
          label="Total Leads"
          value={summary ? String(summary.total_leads) : '0'}
          icon={Users}
          color="green"
        />
        <KPICard
          label="Total Spend"
          value={summary ? `$${Number(summary.total_spend).toLocaleString()}` : '$0'}
          icon={DollarSign}
          color="yellow"
        />
        <KPICard
          label="Leads Signed"
          value={summary ? String(summary.leads_signed) : '0'}
          icon={BarChart3}
          color="orange"
        />
        <KPICard
          label="ROI"
          value={summary && Number(summary.roi_pct) > 0 ? `${Number(summary.roi_pct)}%` : '-'}
          icon={TrendingDown}
          color="pink"
        />
      </div>

      {/* Period toggle + Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Blended Performance</h2>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
            {(['weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodType(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  periodType === p ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* CPL Trend Chart */}
      {trendChartData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">CPL Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Blended CPL" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Cost/Signed" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Total Leads" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} yAxisId="right" hide />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Breakdown Waterfall */}
        {waterfallData.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Leads by Channel</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={waterfallData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v: number) => v.toLocaleString()} />
                <Bar dataKey="leads" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry) => (
                    <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Channel CPL Comparison */}
        {waterfallData.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">CPL by Channel</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={waterfallData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                <Bar dataKey="cpl" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry) => (
                    <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stacked Leads by Channel Over Time */}
      {leadsByChannel.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Lead Volume by Channel Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={leadsByChannel}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="TikTok Organic" stackId="a" fill="#10b981" />
              <Bar dataKey="TikTok Spark" stackId="a" fill="#f59e0b" />
              <Bar dataKey="TikTok Paid" stackId="a" fill="#ef4444" />
              <Bar dataKey="Meta Paid" stackId="a" fill="#3b82f6" />
              <Bar dataKey="Meta Organic" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="Cross-Platform" stackId="a" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Source Detail Table */}
      {sources.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Channel Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-600">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Channel</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Leads</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Spend</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">CPL</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">% of Leads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {sources.map((s) => {
                  const totalLeads = sources.reduce((sum, x) => sum + x.leads, 0);
                  const pct = totalLeads > 0 ? ((s.leads / totalLeads) * 100).toFixed(1) : '0';
                  return (
                    <tr key={s.source} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[s.source] || '#94a3b8' }} />
                        {s.source}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{s.leads.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">${s.spend.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {s.cpl > 0 ? `$${s.cpl.toFixed(2)}` : 'Free'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cross-Platform Journeys */}
      {journeys.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers size={16} /> Cross-Platform Attribution
            </h3>
          </div>
          <DataTable
            columns={journeyColumns}
            data={journeys}
            rowKey={(r) => r.primary_attribution}
            defaultSortKey="conversions"
            emptyMessage="No journey data yet"
          />
        </div>
      )}

      {/* Empty state */}
      {!summary && trend.length === 0 && sources.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <PieChart size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">No Blended Performance Data Yet</p>
          <p className="text-sm mt-1">Data will appear once the blended CPL calculator runs.</p>
        </div>
      )}
    </div>
  );
};

export default BlendedPerformance;
