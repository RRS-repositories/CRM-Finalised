import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, RefreshCw, DollarSign, Users, Target, MousePointer2,
  BarChart3, TrendingUp, Eye, Zap
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import PlatformBadge from './shared/PlatformBadge';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => `\u00A3${n.toFixed(2)}`;
const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f97316'];

interface CampaignData {
  id: string;
  name: string;
  platform: string;
  status: string;
  objective: string;
  daily_budget: number;
  lifetime_budget: number;
  account_name: string;
  metrics: {
    total_spend: number;
    total_impressions: number;
    total_clicks: number;
    total_link_clicks: number;
    total_leads: number;
    total_conversions: number;
    total_conversion_value: number;
    avg_ctr: number;
    avg_cpm: number;
    avg_cpc: number;
    avg_cpl: number;
    avg_roas: number;
  };
}

const CampaignDetail: React.FC = () => {
  const { selectedCampaignId, setCurrentPage, dateRange } = useMarketingStore();
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<any[]>([]);
  const [adSets, setAdSets] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCampaignId) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const dateParams = dateRange.preset !== 'custom'
          ? `preset=${dateRange.preset}`
          : `from=${dateRange.from}&to=${dateRange.to}`;

        const [campaignRes, dailyRes, adSetsRes, adsRes] = await Promise.all([
          fetch(`/api/marketing/campaigns/${selectedCampaignId}`),
          fetch(`/api/marketing/campaigns/${selectedCampaignId}/daily?${dateParams}`),
          fetch(`/api/marketing/campaigns/${selectedCampaignId}/ad-sets`),
          fetch(`/api/marketing/campaigns/${selectedCampaignId}/ads`),
        ]);

        if (campaignRes.ok) setCampaign(await campaignRes.json());
        if (dailyRes.ok) setDailyMetrics(await dailyRes.json());
        if (adSetsRes.ok) setAdSets(await adSetsRes.json());
        if (adsRes.ok) setAds(await adsRes.json());
      } catch (err) {
        console.error('Campaign detail fetch error:', err);
      }
      setLoading(false);
    };

    fetchAll();
  }, [selectedCampaignId, dateRange]);

  if (!selectedCampaignId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No campaign selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading campaign...</span>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Campaign not found.
      </div>
    );
  }

  const m = campaign.metrics || {} as any;

  const adSetColumns: Column<any>[] = [
    { key: 'name', label: 'Ad Set', render: (row) => <span className="font-medium text-gray-900 dark:text-white">{row.name}</span> },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          row.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
          'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
        }`}>{row.status}</span>
      ),
    },
    { key: 'optimization_goal', label: 'Goal' },
    { key: 'daily_budget', label: 'Budget', align: 'right', render: (row) => row.daily_budget ? fmtGBP(Number(row.daily_budget)) : '-' },
    { key: 'bid_amount', label: 'Bid', align: 'right', render: (row) => row.bid_amount ? fmtGBP(Number(row.bid_amount)) : 'Auto' },
  ];

  const adColumns: Column<any>[] = [
    { key: 'name', label: 'Ad', render: (row) => <span className="font-medium text-gray-900 dark:text-white">{row.name}</span> },
    { key: 'ad_set_name', label: 'Ad Set' },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          row.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
          'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
        }`}>{row.status}</span>
      ),
    },
    { key: 'creative_type', label: 'Type', render: (row) => row.creative_type || '-' },
    { key: 'creative_headline', label: 'Headline', render: (row) => row.creative_headline || '-' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCurrentPage('campaigns')}
          className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={campaign.platform} size="md" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{campaign.name}</h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              campaign.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
              campaign.status === 'PAUSED' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
              'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'
            }`}>{campaign.status}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {campaign.objective} {campaign.account_name ? `\u00B7 ${campaign.account_name}` : ''}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard label="Spend" value={fmtGBP(Number(m.total_spend || 0))} icon={DollarSign} color="yellow" />
        <KPICard label="Impressions" value={fmtNum(Number(m.total_impressions || 0))} icon={Eye} color="blue" />
        <KPICard label="Clicks" value={fmtNum(Number(m.total_clicks || 0))} icon={MousePointer2} color="green" />
        <KPICard label="CTR" value={`${Number(m.avg_ctr || 0).toFixed(2)}%`} icon={BarChart3} color="purple" />
        <KPICard label="Leads" value={String(Number(m.total_leads || 0))} icon={Users} color="pink" />
        <KPICard label="CPL" value={Number(m.total_leads) > 0 ? fmtGBP(Number(m.avg_cpl || 0)) : '-'} icon={Target} color="orange" />
        <KPICard label="ROAS" value={`${Number(m.avg_roas || 0).toFixed(2)}x`} icon={TrendingUp} color="indigo" />
        <KPICard label="CPM" value={fmtGBP(Number(m.avg_cpm || 0))} icon={Zap} color="blue" />
      </div>

      {/* Daily Performance Chart */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Daily Performance</h3>
        {dailyMetrics.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'spend') return [`\u00A3${value.toFixed(2)}`, 'Spend'];
                  if (name === 'cpl') return [`\u00A3${value.toFixed(2)}`, 'CPL'];
                  return [value, name.charAt(0).toUpperCase() + name.slice(1)];
                }}
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} dot={false} name="spend" />
              <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} dot={false} name="leads" />
              <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={1.5} dot={false} name="clicks" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[280px] text-gray-400 dark:text-gray-500 text-sm">
            No daily data available for this campaign.
          </div>
        )}
      </div>

      {/* Ad Sets Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Ad Sets ({adSets.length})</h3>
        </div>
        <DataTable
          columns={adSetColumns}
          data={adSets}
          rowKey={(row) => row.id}
          emptyMessage="No ad sets found for this campaign."
          compact
        />
      </div>

      {/* Ads Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Ads ({ads.length})</h3>
        </div>
        <DataTable
          columns={adColumns}
          data={ads}
          rowKey={(row) => row.id}
          emptyMessage="No ads found for this campaign."
          compact
        />
      </div>
    </div>
  );
};

export default CampaignDetail;
