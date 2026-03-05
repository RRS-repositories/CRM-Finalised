import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, UserX, Target, DollarSign,
  RefreshCw, Download
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import PlatformBadge from './shared/PlatformBadge';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => `\u00A3${Number(n).toFixed(2)}`;

const FUNNEL_COLORS: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  qualified: '#8b5cf6',
  converted: '#10b981',
  rejected: '#ef4444',
};

const FUNNEL_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  converted: 'Converted',
  rejected: 'Rejected',
};

interface LeadStats {
  statuses: { status: string; count: string; avg_cost: string }[];
  total: number;
}

const LeadAnalytics: React.FC = () => {
  const { leads, leadsTotal, loading, fetchLeads, platformFilter, campaignsWithMetrics } = useMarketingStore();
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const params = new URLSearchParams();
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      const res = await fetch(`/api/marketing/leads/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Lead stats fetch error:', err);
    }
    setStatsLoading(false);
  };

  useEffect(() => {
    fetchLeads();
    fetchStats();
  }, [platformFilter]);

  const totalLeads = stats?.total || 0;
  const newCount = Number(stats?.statuses?.find(s => s.status === 'new')?.count || 0);
  const qualifiedCount = Number(stats?.statuses?.find(s => s.status === 'qualified')?.count || 0);
  const convertedCount = Number(stats?.statuses?.find(s => s.status === 'converted')?.count || 0);
  const rejectedCount = Number(stats?.statuses?.find(s => s.status === 'rejected')?.count || 0);
  const conversionRate = totalLeads > 0 ? ((convertedCount / totalLeads) * 100).toFixed(1) : '0';

  // Funnel data for bar chart
  const funnelData = (stats?.statuses || []).map(s => ({
    status: FUNNEL_LABELS[s.status] || s.status,
    count: Number(s.count),
    avgCost: Number(s.avg_cost),
    fill: FUNNEL_COLORS[s.status] || '#94a3b8',
  }));

  // Pie chart data
  const pieData = (stats?.statuses || []).filter(s => Number(s.count) > 0).map(s => ({
    name: FUNNEL_LABELS[s.status] || s.status,
    value: Number(s.count),
    fill: FUNNEL_COLORS[s.status] || '#94a3b8',
  }));

  // Campaign lead source table — campaigns ranked by leads
  const campaignLeadData = campaignsWithMetrics
    .filter(c => Number(c.total_leads) > 0)
    .sort((a, b) => Number(b.total_leads) - Number(a.total_leads))
    .slice(0, 15);

  const campaignColumns: Column<any>[] = [
    {
      key: 'name', label: 'Campaign',
      render: (row) => (
        <div className="flex items-center gap-2">
          <PlatformBadge platform={row.platform} />
          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{row.name}</span>
        </div>
      ),
    },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads)) },
    { key: 'total_spend', label: 'Spend', align: 'right', render: (row) => fmtGBP(Number(row.total_spend)) },
    { key: 'avg_cpl', label: 'CPL', align: 'right', render: (row) => fmtGBP(Number(row.avg_cpl)) },
    { key: 'avg_ctr', label: 'CTR', align: 'right', render: (row) => `${Number(row.avg_ctr).toFixed(2)}%` },
    { key: 'avg_roas', label: 'ROAS', align: 'right', render: (row) => `${Number(row.avg_roas).toFixed(2)}x` },
  ];

  // Recent leads table
  const recentLeadColumns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (row) => new Date(row.created_at).toLocaleDateString('en-GB') },
    { key: 'name', label: 'Name', render: (row) => <span className="font-medium text-gray-900 dark:text-white">{row.name || '-'}</span> },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'campaign_name', label: 'Campaign', render: (row) => row.campaign_name || '-' },
    { key: 'platform', label: 'Platform', render: (row) => <PlatformBadge platform={row.platform} /> },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded`} style={{ backgroundColor: `${FUNNEL_COLORS[row.status]}20`, color: FUNNEL_COLORS[row.status] }}>
          {FUNNEL_LABELS[row.status] || row.status}
        </span>
      ),
    },
    { key: 'cost', label: 'Cost', align: 'right', render: (row) => row.cost ? fmtGBP(Number(row.cost)) : '-' },
  ];

  if (statsLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading lead analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total Leads" value={String(totalLeads)} icon={Users} color="blue" />
        <KPICard label="New" value={String(newCount)} icon={Users} color="yellow" />
        <KPICard label="Qualified" value={String(qualifiedCount)} icon={UserCheck} color="purple" />
        <KPICard label="Converted" value={String(convertedCount)} icon={Target} color="green" />
        <KPICard label="Conversion Rate" value={`${conversionRate}%`} icon={Target} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Funnel Bar Chart */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Lead Funnel</h3>
          {funnelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(value: number) => [value, 'Leads']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">No lead data available.</div>
          )}
        </div>

        {/* Lead Distribution Pie */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Lead Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">No lead data available.</div>
          )}
        </div>
      </div>

      {/* Lead Source by Campaign */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Lead Sources by Campaign</h3>
        </div>
        <DataTable
          columns={campaignColumns}
          data={campaignLeadData}
          defaultSortKey="total_leads"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          emptyMessage="No campaign lead data available."
          compact
        />
      </div>

      {/* Recent Leads Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Recent Leads</h3>
          <span className="text-xs text-gray-400">{leadsTotal} total</span>
        </div>
        <DataTable
          columns={recentLeadColumns}
          data={leads}
          rowKey={(row) => row.id}
          emptyMessage="No leads yet. Leads will appear here once synced from your ad platforms."
          compact
        />
      </div>
    </div>
  );
};

export default LeadAnalytics;
