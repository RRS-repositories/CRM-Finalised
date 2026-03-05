import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, Plus } from 'lucide-react';
import { useMarketingStore } from '../../stores/marketingStore';
import DataTable, { type Column } from './shared/DataTable';
import PlatformBadge from './shared/PlatformBadge';

const fmtGBP = (n: number) => {
  if (n >= 1000000) return `\u00A3${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `\u00A3${(n / 1000).toFixed(1)}K`;
  return `\u00A3${n.toFixed(2)}`;
};

const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const CampaignPerformance: React.FC = () => {
  const {
    campaignsWithMetrics, loading, fetchCampaignsWithMetrics,
    setCurrentPage, setSelectedCampaignId,
  } = useMarketingStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchCampaignsWithMetrics();
  }, []);

  const filtered = campaignsWithMetrics.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'name',
      label: 'Campaign',
      render: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <PlatformBadge platform={row.platform} />
          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          row.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
          row.status === 'PAUSED' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
          row.status === 'IN_REVIEW' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
          'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
        }`}>
          {row.status}
        </span>
      ),
    },
    { key: 'objective', label: 'Objective' },
    {
      key: 'daily_budget',
      label: 'Budget',
      align: 'right',
      render: (row) => row.daily_budget ? `${fmtGBP(Number(row.daily_budget))}/d` : row.lifetime_budget ? `${fmtGBP(Number(row.lifetime_budget))} LT` : '-',
    },
    { key: 'total_spend', label: 'Spend', align: 'right', render: (row) => fmtGBP(Number(row.total_spend)) },
    { key: 'total_impressions', label: 'Impr.', align: 'right', render: (row) => fmtNum(Number(row.total_impressions)) },
    { key: 'total_clicks', label: 'Clicks', align: 'right', render: (row) => fmtNum(Number(row.total_clicks)) },
    { key: 'avg_ctr', label: 'CTR', align: 'right', render: (row) => `${Number(row.avg_ctr).toFixed(2)}%` },
    { key: 'avg_cpm', label: 'CPM', align: 'right', render: (row) => fmtGBP(Number(row.avg_cpm)) },
    { key: 'avg_cpc', label: 'CPC', align: 'right', render: (row) => fmtGBP(Number(row.avg_cpc)) },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads)) },
    { key: 'avg_cpl', label: 'CPL', align: 'right', render: (row) => Number(row.total_leads) > 0 ? fmtGBP(Number(row.avg_cpl)) : '-' },
    { key: 'avg_roas', label: 'ROAS', align: 'right', render: (row) => `${Number(row.avg_roas).toFixed(2)}x` },
    { key: 'avg_frequency', label: 'Freq.', align: 'right', render: (row) => Number(row.avg_frequency).toFixed(1) },
  ];

  const statuses = ['all', ...new Set(campaignsWithMetrics.map(c => c.status))];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCampaignsWithMetrics()}
            disabled={loading.campaigns}
            className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={14} className={`text-gray-500 ${loading.campaigns ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          defaultSortKey="total_spend"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            setSelectedCampaignId(row.id);
            setCurrentPage('campaign-detail');
          }}
          emptyMessage="No campaigns found. Connect your ad platforms to start syncing campaigns."
          compact
        />
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Showing {filtered.length} of {campaignsWithMetrics.length} campaigns. Click any row for campaign detail view.
      </p>
    </div>
  );
};

export default CampaignPerformance;
