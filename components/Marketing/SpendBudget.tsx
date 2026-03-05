import React, { useEffect, useMemo } from 'react';
import {
  Wallet, AlertTriangle, TrendingUp, DollarSign, Target, BarChart3
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, BarChart, Bar, Cell
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import PlatformBadge from './shared/PlatformBadge';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => {
  if (n >= 1000) return `\u00A3${(n / 1000).toFixed(1)}K`;
  return `\u00A3${n.toFixed(2)}`;
};

const SpendBudget: React.FC = () => {
  const {
    overviewKPIs, dailyData, campaignsWithMetrics, loading,
    fetchOverview, fetchDailyData, fetchCampaignsWithMetrics,
  } = useMarketingStore();

  useEffect(() => {
    fetchOverview();
    fetchDailyData();
    fetchCampaignsWithMetrics();
  }, []);

  const totalSpend = Number(overviewKPIs?.total_spend || 0);
  const totalLeads = Number(overviewKPIs?.total_leads || 0);
  const avgCpl = Number(overviewKPIs?.avg_cpl || 0);

  // Calculate total daily budget across all active campaigns
  const activeCampaigns = campaignsWithMetrics.filter(c => c.status === 'ACTIVE');
  const totalDailyBudget = activeCampaigns.reduce((sum, c) => sum + Number(c.daily_budget || 0), 0);
  const totalLifetimeBudget = activeCampaigns.reduce((sum, c) => sum + Number(c.lifetime_budget || 0), 0);

  // Budget utilization
  const daysInPeriod = dailyData.length || 1;
  const expectedSpend = totalDailyBudget * daysInPeriod;
  const pacing = expectedSpend > 0 ? ((totalSpend / expectedSpend) * 100).toFixed(0) : '0';
  const pacingNum = Number(pacing);

  // Daily spend chart with budget line
  const chartData = dailyData.map(d => ({
    ...d,
    budget_line: totalDailyBudget,
  }));

  // Budget status cards per campaign
  const budgetCards = useMemo(() => {
    return activeCampaigns.map(c => {
      const dailyBudget = Number(c.daily_budget || 0);
      const spent = Number(c.total_spend || 0);
      const expectedCampaign = dailyBudget * daysInPeriod;
      const campaignPacing = expectedCampaign > 0 ? ((spent / expectedCampaign) * 100) : 0;
      return {
        ...c,
        campaignPacing,
        expectedSpend: expectedCampaign,
        isOverspending: campaignPacing > 110,
        isUnderspending: campaignPacing < 80 && dailyBudget > 0,
      };
    }).sort((a, b) => Number(b.total_spend) - Number(a.total_spend));
  }, [activeCampaigns, daysInPeriod]);

  const alerts = budgetCards.filter(c => c.isOverspending || c.isUnderspending);

  const budgetColumns: Column<any>[] = [
    {
      key: 'name', label: 'Campaign',
      render: (row) => (
        <div className="flex items-center gap-2">
          <PlatformBadge platform={row.platform} />
          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{row.name}</span>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{row.status}</span> },
    { key: 'daily_budget', label: 'Daily Budget', align: 'right', render: (row) => row.daily_budget ? fmtGBP(Number(row.daily_budget)) : '-' },
    { key: 'total_spend', label: 'Period Spend', align: 'right', render: (row) => fmtGBP(Number(row.total_spend)) },
    { key: 'expectedSpend', label: 'Expected', align: 'right', render: (row) => fmtGBP(row.expectedSpend) },
    {
      key: 'campaignPacing', label: 'Pacing', align: 'right',
      render: (row) => {
        const p = row.campaignPacing;
        const color = p > 110 ? 'text-red-500' : p < 80 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400';
        return <span className={`font-semibold ${color}`}>{p.toFixed(0)}%</span>;
      },
    },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads)) },
    { key: 'avg_cpl', label: 'CPL', align: 'right', render: (row) => Number(row.total_leads) > 0 ? fmtGBP(Number(row.avg_cpl)) : '-' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total Spend" value={fmtGBP(totalSpend)} icon={DollarSign} delta={overviewKPIs?.spend_delta} deltaLabel="vs prev" color="yellow" />
        <KPICard label="Daily Budget" value={fmtGBP(totalDailyBudget)} icon={Wallet} color="blue" />
        <KPICard
          label="Budget Pacing"
          value={`${pacing}%`}
          icon={pacingNum > 110 ? AlertTriangle : TrendingUp}
          color={pacingNum > 110 ? 'orange' : pacingNum < 80 ? 'yellow' : 'green'}
        />
        <KPICard label="Active Campaigns" value={String(activeCampaigns.length)} icon={BarChart3} color="purple" />
        <KPICard label="Total Leads" value={String(totalLeads)} icon={Target} color="pink" />
        <KPICard label="Avg CPL" value={fmtGBP(avgCpl)} icon={Target} color="indigo" invertDelta />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Budget Alerts</h3>
          </div>
          <div className="space-y-1">
            {alerts.map(a => (
              <p key={a.id} className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-medium">{a.name}</span>
                {a.isOverspending ? ` is overspending at ${a.campaignPacing.toFixed(0)}% of expected budget` : ` is underspending at ${a.campaignPacing.toFixed(0)}% — consider checking delivery`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Daily Spend Chart with Budget Line */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Spend vs Budget</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <Tooltip formatter={(value: number, name: string) => {
                if (name === 'budget_line') return [`\u00A3${value.toFixed(2)}`, 'Budget'];
                return [`\u00A3${value.toFixed(2)}`, 'Spend'];
              }} />
              <Legend />
              <Line type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} name="Actual Spend" />
              {totalDailyBudget > 0 && (
                <Line type="monotone" dataKey="budget_line" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 4" dot={false} name="Daily Budget" />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500 text-sm">
            No spend data for the selected period.
          </div>
        )}
      </div>

      {/* Campaign Budget Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Campaign Budget Status</h3>
        </div>
        <DataTable
          columns={budgetColumns}
          data={budgetCards}
          defaultSortKey="total_spend"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          emptyMessage="No active campaigns with budgets found."
          compact
        />
      </div>
    </div>
  );
};

export default SpendBudget;
