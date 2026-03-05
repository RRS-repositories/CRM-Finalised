import React, { useEffect } from 'react';
import {
  DollarSign, Users, Target, BarChart3, MousePointer2, TrendingUp,
  RefreshCw, AlertCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import PlatformBadge from './shared/PlatformBadge';

const fmt = (n: number, prefix = '') => {
  if (n >= 1000000) return `${prefix}${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${prefix}${(n / 1000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
};

const fmtGBP = (n: number) => fmt(n, '\u00A3');

const OverviewDashboard: React.FC = () => {
  const {
    overviewKPIs, dailyData, platformSummary, campaignsWithMetrics,
    loading, error, fetchOverview, fetchDailyData, fetchCampaignsWithMetrics,
    fetchPlatformSummary, setCurrentPage, setSelectedCampaignId,
  } = useMarketingStore();

  useEffect(() => {
    fetchOverview();
    fetchDailyData();
    fetchCampaignsWithMetrics();
    fetchPlatformSummary();
  }, []);

  const isLoading = loading.overview || loading.daily || loading.campaigns;

  if (isLoading && !overviewKPIs) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading marketing data...</span>
      </div>
    );
  }

  if (error && !overviewKPIs) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        <AlertCircle size={20} className="mr-2" />
        {error}
      </div>
    );
  }

  const kpis = overviewKPIs || {
    total_spend: 0, total_leads: 0, avg_cpl: 0, avg_cpm: 0, avg_cpc: 0, overall_roas: 0,
    spend_delta: null, leads_delta: null, cpl_delta: null, cpm_delta: null, cpc_delta: null, roas_delta: null,
  };

  // Top 5 and bottom 5 campaigns by CPL
  const sortedByCpl = [...campaignsWithMetrics].filter(c => c.total_leads > 0).sort((a, b) => a.avg_cpl - b.avg_cpl);
  const topPerformers = sortedByCpl.slice(0, 5);
  const bottomPerformers = sortedByCpl.slice(-5).reverse();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Spend" value={fmtGBP(Number(kpis.total_spend))} icon={DollarSign} delta={kpis.spend_delta} deltaLabel="vs prev" color="yellow" />
        <KPICard label="Total Leads" value={fmt(Number(kpis.total_leads))} icon={Users} delta={kpis.leads_delta} deltaLabel="vs prev" color="blue" />
        <KPICard label="Avg CPL" value={fmtGBP(Number(kpis.avg_cpl))} icon={Target} delta={kpis.cpl_delta} deltaLabel="vs prev" color="pink" invertDelta />
        <KPICard label="Avg CPM" value={fmtGBP(Number(kpis.avg_cpm))} icon={BarChart3} delta={kpis.cpm_delta} deltaLabel="vs prev" color="purple" invertDelta />
        <KPICard label="Avg CPC" value={fmtGBP(Number(kpis.avg_cpc))} icon={MousePointer2} delta={kpis.cpc_delta} deltaLabel="vs prev" color="green" invertDelta />
        <KPICard label="ROAS" value={`${Number(kpis.overall_roas).toFixed(2)}x`} icon={TrendingUp} delta={kpis.roas_delta} deltaLabel="vs prev" color="indigo" />
      </div>

      {/* Spend + Leads Chart */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Spend & Leads</h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === 'spend' ? [`\u00A3${value.toFixed(2)}`, 'Spend'] : [value, 'Leads']
                }
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} name="Spend" />
              <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} dot={false} name="Leads" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500 text-sm">
            No data for the selected period. Connect your ad platforms to start syncing metrics.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Comparison */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Platform Comparison</h3>
          {platformSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={platformSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="platform" tick={{ fontSize: 12 }} tickFormatter={(v) => v === 'meta' ? 'Meta' : 'TikTok'} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
                <Tooltip formatter={(value: number) => [`\u00A3${Number(value).toFixed(2)}`, '']} />
                <Bar dataKey="total_spend" fill="#f59e0b" name="Spend" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_cpl" fill="#ec4899" name="CPL" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-gray-400 dark:text-gray-500 text-sm">
              No platform data available yet.
            </div>
          )}
        </div>

        {/* Top & Bottom Performers */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Campaign Performance</h3>
          {topPerformers.length > 0 ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wide">Top Performers (Lowest CPL)</p>
                <div className="space-y-1">
                  {topPerformers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCampaignId(c.id); setCurrentPage('campaign-detail'); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformBadge platform={c.platform} />
                        <span className="text-sm text-gray-900 dark:text-white truncate">{c.name}</span>
                      </div>
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 ml-2 whitespace-nowrap">{fmtGBP(c.avg_cpl)} CPL</span>
                    </button>
                  ))}
                </div>
              </div>
              {bottomPerformers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-2 uppercase tracking-wide">Underperformers (Highest CPL)</p>
                  <div className="space-y-1">
                    {bottomPerformers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCampaignId(c.id); setCurrentPage('campaign-detail'); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PlatformBadge platform={c.platform} />
                          <span className="text-sm text-gray-900 dark:text-white truncate">{c.name}</span>
                        </div>
                        <span className="text-sm font-medium text-red-500 dark:text-red-400 ml-2 whitespace-nowrap">{fmtGBP(c.avg_cpl)} CPL</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-gray-400 dark:text-gray-500 text-sm">
              No campaign data yet. Campaigns will appear here once data syncs.
            </div>
          )}
        </div>
      </div>

      {/* Campaign Summary Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">All Campaigns</h3>
          <button
            onClick={() => setCurrentPage('campaigns')}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-600">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Campaign</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Spend</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Impressions</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Clicks</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">CTR</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Leads</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">CPL</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
              {campaignsWithMetrics.length > 0 ? (
                campaignsWithMetrics.slice(0, 10).map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                    onClick={() => { setSelectedCampaignId(c.id); setCurrentPage('campaign-detail'); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={c.platform} />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        c.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        c.status === 'PAUSED' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{fmtGBP(Number(c.total_spend))}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{fmt(Number(c.total_impressions))}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{fmt(Number(c.total_clicks))}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{Number(c.avg_ctr).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{Number(c.total_leads)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{Number(c.total_leads) > 0 ? fmtGBP(Number(c.avg_cpl)) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">{Number(c.avg_roas).toFixed(2)}x</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                    No campaigns found. Connect your Meta or TikTok ad account to start syncing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
