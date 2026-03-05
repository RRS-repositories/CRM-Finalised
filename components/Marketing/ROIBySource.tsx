import React, { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, TrendingUp, PoundSterling, BarChart3,
  Users, Award, RefreshCw, PieChart
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface SourceROI {
  source: string;
  total_leads: number;
  signed: number;
  won: number;
  total_compensation: number;
  total_fees: number;
  ad_spend: number;
  profit: number;
  roi_pct: number | null;
}

interface ProfitTrend {
  period_start: string;
  total_spend: number;
  total_fees: number;
  total_compensation: number;
  profit: number;
  roi_pct: number;
}

const SOURCE_COLORS: Record<string, string> = {
  'tiktok_organic': '#10b981',
  'tiktok_spark': '#f59e0b',
  'tiktok_paid': '#ef4444',
  'meta_paid': '#3b82f6',
  'meta_organic': '#8b5cf6',
  'cross_platform_retarget': '#ec4899',
  'direct': '#6b7280',
  'referral': '#14b8a6',
};

const formatSource = (s: string) => {
  return (s || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const ROIBySource: React.FC = () => {
  const [sources, setSources] = useState<SourceROI[]>([]);
  const [profitTrend, setProfitTrend] = useState<ProfitTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roiRes, trendRes] = await Promise.all([
        fetch('/api/marketing/blended/roi-by-source'),
        fetch('/api/marketing/blended/profitability-trend'),
      ]);
      if (roiRes.ok) setSources(await roiRes.json());
      if (trendRes.ok) setProfitTrend(await trendRes.json());
    } catch (err) {
      console.error('Failed to fetch ROI data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalLeads = sources.reduce((sum, s) => sum + Number(s.total_leads), 0);
  const totalSigned = sources.reduce((sum, s) => sum + Number(s.signed), 0);
  const totalWon = sources.reduce((sum, s) => sum + Number(s.won), 0);
  const totalFees = sources.reduce((sum, s) => sum + Number(s.total_fees), 0);
  const totalSpend = sources.reduce((sum, s) => sum + Number(s.ad_spend), 0);
  const totalProfit = totalFees - totalSpend;
  const overallROI = totalSpend > 0 ? ((totalProfit / totalSpend) * 100).toFixed(1) : null;

  const roiColumns: Column<SourceROI>[] = [
    { key: 'source', label: 'Source', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[r.source] || '#94a3b8' }} />
        <span className="font-medium text-gray-900 dark:text-white">{formatSource(r.source)}</span>
      </div>
    )},
    { key: 'total_leads', label: 'Leads', align: 'right', render: (r) => Number(r.total_leads).toLocaleString() },
    { key: 'signed', label: 'Signed', align: 'right', render: (r) => Number(r.signed).toLocaleString() },
    { key: 'won', label: 'Won', align: 'right', render: (r) => Number(r.won).toLocaleString() },
    { key: 'total_compensation', label: 'Compensation', align: 'right', render: (r) => `$${Number(r.total_compensation).toLocaleString()}` },
    { key: 'total_fees', label: 'Fees (inc VAT)', align: 'right', render: (r) => `$${Number(r.total_fees).toLocaleString()}` },
    { key: 'ad_spend', label: 'Ad Spend', align: 'right', render: (r) => `$${Number(r.ad_spend).toLocaleString()}` },
    { key: 'profit', label: 'Profit', align: 'right', render: (r) => {
      const profit = Number(r.profit);
      return (
        <span className={profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
          ${profit.toLocaleString()}
        </span>
      );
    }},
    { key: 'roi_pct', label: 'ROI', align: 'right', render: (r) => {
      if (r.roi_pct == null || Number(r.ad_spend) === 0) return <span className="text-emerald-600 dark:text-emerald-400">Infinite</span>;
      const roi = Number(r.roi_pct);
      return (
        <span className={roi >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500 dark:text-red-400 font-semibold'}>
          {roi.toFixed(1)}%
        </span>
      );
    }},
  ];

  // Quality comparison: Lead→Signed %, Signed→Won %
  const qualityData = sources.filter(s => Number(s.total_leads) > 0).map(s => ({
    source: formatSource(s.source),
    'Lead to Signed %': Number(s.total_leads) > 0 ? Number(((Number(s.signed) / Number(s.total_leads)) * 100).toFixed(1)) : 0,
    'Signed to Won %': Number(s.signed) > 0 ? Number(((Number(s.won) / Number(s.signed)) * 100).toFixed(1)) : 0,
  }));

  const trendChartData = profitTrend.map(t => ({
    month: new Date(t.period_start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    Revenue: Number(t.total_fees),
    Spend: Number(t.total_spend),
    Profit: Number(t.profit),
  }));

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Leads" value={totalLeads.toLocaleString()} icon={Users} color="blue" />
        <KPICard label="Signed" value={totalSigned.toLocaleString()} icon={BarChart3} color="green" />
        <KPICard label="Won" value={totalWon.toLocaleString()} icon={Award} color="purple" />
        <KPICard label="Total Fees" value={`$${totalFees.toLocaleString()}`} icon={PoundSterling} color="orange" />
        <KPICard label="Ad Spend" value={`$${totalSpend.toLocaleString()}`} icon={DollarSign} color="yellow" />
        <KPICard
          label="Overall ROI"
          value={overallROI ? `${overallROI}%` : 'N/A'}
          icon={TrendingUp}
          color="pink"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ROI by Source</h2>
        <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Main ROI Table */}
      {sources.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <DataTable
            columns={roiColumns}
            data={sources}
            rowKey={(r) => r.source}
            defaultSortKey="total_leads"
            emptyMessage="No ROI data"
          />
          {/* Totals row */}
          <div className="bg-gray-50 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-600 px-4 py-3 flex items-center text-sm font-semibold">
            <span className="text-gray-900 dark:text-white flex-1">Totals</span>
            <div className="flex gap-8 text-gray-700 dark:text-gray-300 text-right">
              <span>{totalLeads}</span>
              <span>{totalSigned}</span>
              <span>{totalWon}</span>
              <span>${totalFees.toLocaleString()}</span>
              <span>${totalSpend.toLocaleString()}</span>
              <span className={totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}>${totalProfit.toLocaleString()}</span>
              <span>{overallROI ? `${overallROI}%` : '-'}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <PieChart size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">No ROI Data Yet</p>
          <p className="text-sm mt-1">ROI data will appear once leads have source attribution and fee tracking.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Quality Comparison */}
        {qualityData.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Source Quality Comparison</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={qualityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Bar dataKey="Lead to Signed %" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                <Bar dataKey="Signed to Won %" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Profitability Trend */}
        {trendChartData.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly Profitability Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Spend" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Profit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Revenue Pipeline Visualization */}
      {sources.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Revenue Pipeline by Source</h3>
          <div className="space-y-3">
            {sources.filter(s => Number(s.total_leads) > 0).map((s) => {
              const signRate = Number(s.total_leads) > 0 ? (Number(s.signed) / Number(s.total_leads) * 100) : 0;
              const winRate = Number(s.signed) > 0 ? (Number(s.won) / Number(s.signed) * 100) : 0;
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <div className="w-40 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SOURCE_COLORS[s.source] || '#94a3b8' }} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{formatSource(s.source)}</span>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    {/* Leads bar */}
                    <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-blue-400 h-full rounded-full absolute left-0 top-0"
                        style={{ width: `${Math.min((Number(s.total_leads) / Math.max(totalLeads, 1)) * 100, 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700 dark:text-gray-300 z-10">
                        {Number(s.total_leads)} leads
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right">
                    <span className="text-xs text-gray-500">{signRate.toFixed(0)}% sign</span>
                  </div>
                  <div className="w-24 text-right">
                    <span className="text-xs text-gray-500">{winRate.toFixed(0)}% win</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ROIBySource;
