import React, { useEffect, useState, useCallback } from 'react';
import {
  Building2, RefreshCw, TrendingUp, Award, Scale,
  DollarSign, Target, BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface LenderRow {
  id: string;
  lender_name: string;
  total_claims: number;
  claims_submitted: number;
  claims_upheld: number;
  claims_rejected: number;
  fos_referrals: number;
  fos_wins: number;
  fos_losses: number;
  upheld_rate: number;
  fos_win_rate: number;
  avg_compensation: number;
  avg_fee: number;
  total_revenue: number;
  total_ad_spend: number;
  cost_per_lead: number;
  lead_to_sign_rate: number;
  avg_days_to_resolve: number;
  ai_recommendation: string | null;
}

interface Summary {
  total_lenders: number;
  lenders_with_claims: number;
  total_claims: number;
  total_upheld: number;
  total_fos_referrals: number;
  total_fos_wins: number;
  avg_upheld_rate: number;
  avg_fos_win_rate: number;
  avg_compensation: number;
  total_revenue: number;
}

interface TopPerformers {
  byUpheldRate: { lender_name: string; upheld_rate: number; total_claims: number }[];
  byRevenue: { lender_name: string; total_revenue: number; total_claims: number }[];
  byCompensation: { lender_name: string; avg_compensation: number; total_claims: number }[];
}

const LenderPerformance: React.FC = () => {
  const [lenders, setLenders] = useState<LenderRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topPerformers, setTopPerformers] = useState<TopPerformers | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'table' | 'insights'>('table');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [lendersRes, summaryRes, topRes] = await Promise.all([
        fetch('/api/marketing/lender-intelligence'),
        fetch('/api/marketing/lender-intelligence/summary'),
        fetch('/api/marketing/lender-intelligence/top-performers'),
      ]);
      if (lendersRes.ok) setLenders(await lendersRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (topRes.ok) setTopPerformers(await topRes.json());
    } catch (err) {
      console.error('Failed to fetch lender intelligence:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const topByUpheldChart = (topPerformers?.byUpheldRate || []).map(l => ({
    lender: l.lender_name.length > 20 ? l.lender_name.slice(0, 20) + '...' : l.lender_name,
    'Upheld Rate': Number(l.upheld_rate),
    claims: l.total_claims,
  }));

  const topByRevenueChart = (topPerformers?.byRevenue || []).slice(0, 8).map(l => ({
    lender: l.lender_name.length > 20 ? l.lender_name.slice(0, 20) + '...' : l.lender_name,
    revenue: Number(l.total_revenue),
  }));

  const lenderColumns: Column<LenderRow>[] = [
    { key: 'lender_name', label: 'Lender', render: (r) => (
      <span className="font-medium text-gray-900 dark:text-white text-sm">{r.lender_name}</span>
    )},
    { key: 'total_claims', label: 'Claims', align: 'right' },
    { key: 'claims_upheld', label: 'Upheld', align: 'right', render: (r) => (
      <span className="text-emerald-600 dark:text-emerald-400">{r.claims_upheld}</span>
    )},
    { key: 'upheld_rate', label: 'Upheld %', align: 'right', render: (r) => (
      <div className="flex items-center gap-2 justify-end">
        <div className="w-14 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Number(r.upheld_rate), 100)}%` }} />
        </div>
        <span className="text-xs w-10 text-right">{Number(r.upheld_rate).toFixed(1)}%</span>
      </div>
    )},
    { key: 'fos_referrals', label: 'FOS Ref', align: 'right' },
    { key: 'fos_win_rate', label: 'FOS Win %', align: 'right', render: (r) => (
      <span className={`text-xs ${Number(r.fos_win_rate) >= 50 ? 'text-emerald-600' : 'text-amber-500'}`}>
        {Number(r.fos_win_rate).toFixed(1)}%
      </span>
    )},
    { key: 'avg_compensation', label: 'Avg Comp', align: 'right', render: (r) => (
      <span className="text-sm">
        {Number(r.avg_compensation) > 0 ? `£${Number(r.avg_compensation).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-'}
      </span>
    )},
    { key: 'total_revenue', label: 'Revenue', align: 'right', render: (r) => (
      <span className="text-sm font-medium">
        {Number(r.total_revenue) > 0 ? `£${Number(r.total_revenue).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-'}
      </span>
    )},
    { key: 'cost_per_lead', label: 'CPL', align: 'right', render: (r) => (
      <span className="text-sm">
        {Number(r.cost_per_lead) > 0 ? `£${Number(r.cost_per_lead).toFixed(2)}` : '-'}
      </span>
    )},
    { key: 'lead_to_sign_rate', label: 'Lead→Sign', align: 'right', render: (r) => (
      <span className="text-xs">{Number(r.lead_to_sign_rate).toFixed(1)}%</span>
    )},
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  const hasData = lenders.some(l => Number(l.total_claims) > 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Lenders Tracked" value={String(summary.lenders_with_claims || 0)} icon={Building2} color="blue" />
          <KPICard label="Total Claims" value={String(summary.total_claims || 0)} icon={Target} color="indigo" />
          <KPICard label="Avg Upheld Rate" value={`${summary.avg_upheld_rate || 0}%`} icon={TrendingUp} color="green" />
          <KPICard label="FOS Win Rate" value={`${summary.avg_fos_win_rate || 0}%`} icon={Scale} color="purple" />
          <KPICard label="Avg Compensation" value={summary.avg_compensation ? `£${Number(summary.avg_compensation).toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'} icon={DollarSign} color="orange" />
          <KPICard label="Total Revenue" value={summary.total_revenue ? `£${Number(summary.total_revenue).toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '-'} icon={Award} color="yellow" />
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
        {[
          { key: 'table', label: 'Lender Table' },
          { key: 'insights', label: 'Top Performers' },
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

      {!hasData ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Building2 size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">No Lender Data Yet</p>
          <p className="text-sm mt-1">Lender intelligence will populate as cases are processed.</p>
        </div>
      ) : (
        <>
          {/* Lender Table Tab */}
          {tab === 'table' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <DataTable
                columns={lenderColumns}
                data={lenders.filter(l => Number(l.total_claims) > 0)}
                rowKey={(r) => r.id}
                defaultSortKey="total_claims"
                emptyMessage="No lender data available"
              />
            </div>
          )}

          {/* Insights Tab */}
          {tab === 'insights' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top by Upheld Rate */}
                {topByUpheldChart.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <TrendingUp size={16} /> Highest Upheld Rate
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topByUpheldChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <YAxis type="category" dataKey="lender" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip formatter={(val: number) => `${val}%`} />
                        <Bar dataKey="Upheld Rate" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top by Revenue */}
                {topByRevenueChart.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <DollarSign size={16} /> Highest Revenue
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topByRevenueChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="lender" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip formatter={(val: number) => `£${val.toLocaleString()}`} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Top by Compensation */}
              {topPerformers?.byCompensation && topPerformers.byCompensation.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Award size={16} /> Highest Average Compensation
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {topPerformers.byCompensation.map((l, i) => (
                      <div key={l.lender_name} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">#{i + 1}</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={l.lender_name}>
                          {l.lender_name}
                        </p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          £{Number(l.avg_compensation).toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-gray-400">{l.total_claims} claims</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Recommendations */}
              {lenders.some(l => l.ai_recommendation) && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">AI Strategic Recommendations</h3>
                  <div className="space-y-3">
                    {lenders.filter(l => l.ai_recommendation).slice(0, 5).map((l) => (
                      <div key={l.id} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{l.lender_name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{l.ai_recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LenderPerformance;
