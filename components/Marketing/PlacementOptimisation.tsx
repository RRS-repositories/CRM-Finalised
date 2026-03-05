import React, { useEffect, useState, useMemo } from 'react';
import {
  Monitor, Smartphone, Layout, RefreshCw, TrendingDown, TrendingUp, DollarSign
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => {
  if (n >= 1000) return `\u00A3${(n / 1000).toFixed(1)}K`;
  return `\u00A3${n.toFixed(2)}`;
};
const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

interface PlacementData {
  placement: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  avg_ctr: number;
  avg_cpm: number;
  avg_cpc: number;
  avg_cpl: number;
}

interface PlacementTrend {
  date: string;
  placement: string;
  spend: number;
  leads: number;
  cpl: number;
}

const PLACEMENT_COLORS: Record<string, string> = {
  feed: '#3b82f6',
  stories: '#f59e0b',
  reels: '#ec4899',
  in_stream: '#8b5cf6',
  search: '#10b981',
  audience_network: '#f97316',
  explore: '#06b6d4',
  messenger: '#6366f1',
  right_column: '#64748b',
  tiktok_feed: '#ef4444',
};

const PLACEMENT_ICONS: Record<string, React.ReactNode> = {
  feed: <Monitor size={14} />,
  stories: <Smartphone size={14} />,
  reels: <Smartphone size={14} />,
};

const PlacementOptimisation: React.FC = () => {
  const { dateRange, platformFilter } = useMarketingStore();
  const [placements, setPlacements] = useState<PlacementData[]>([]);
  const [trends, setTrends] = useState<PlacementTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateRange.preset !== 'custom') {
          params.set('preset', dateRange.preset);
        } else {
          if (dateRange.from) params.set('from', dateRange.from);
          if (dateRange.to) params.set('to', dateRange.to);
        }
        if (platformFilter !== 'all') params.set('platform', platformFilter);

        const [placementRes, trendRes] = await Promise.all([
          fetch(`/api/marketing/metrics/by-placement?${params}`),
          fetch(`/api/marketing/metrics/placement-trend?${params}`),
        ]);

        if (placementRes.ok) setPlacements(await placementRes.json());
        if (trendRes.ok) setTrends(await trendRes.json());
      } catch (err) {
        console.error('Placement fetch error:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [dateRange, platformFilter]);

  const bestCPL = useMemo(() => {
    const withLeads = placements.filter(p => Number(p.total_leads) > 0);
    if (!withLeads.length) return null;
    return withLeads.reduce((best, p) => Number(p.avg_cpl) < Number(best.avg_cpl) ? p : best);
  }, [placements]);

  const worstCPL = useMemo(() => {
    const withLeads = placements.filter(p => Number(p.total_leads) > 0);
    if (!withLeads.length) return null;
    return withLeads.reduce((worst, p) => Number(p.avg_cpl) > Number(worst.avg_cpl) ? p : worst);
  }, [placements]);

  const totalSpend = useMemo(() => placements.reduce((s, p) => s + Number(p.total_spend), 0), [placements]);
  const totalLeads = useMemo(() => placements.reduce((s, p) => s + Number(p.total_leads), 0), [placements]);

  // Build trend chart data: pivot placements into columns per date
  const trendChartData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    trends.forEach(t => {
      if (!dateMap[t.date]) dateMap[t.date] = { date: t.date as any };
      (dateMap[t.date] as any)[t.placement] = Number(t.cpl);
    });
    return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [trends]);

  const trendPlacements = useMemo(() => [...new Set(trends.map(t => t.placement))], [trends]);

  const columns: Column<PlacementData>[] = [
    {
      key: 'placement', label: 'Placement',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{PLACEMENT_ICONS[row.placement] || <Layout size={14} />}</span>
          <span className="font-medium text-gray-900 dark:text-white capitalize">{row.placement.replace(/_/g, ' ')}</span>
        </div>
      ),
    },
    { key: 'total_spend', label: 'Spend', align: 'right', render: (row) => fmtGBP(Number(row.total_spend)) },
    { key: 'total_impressions', label: 'Impr.', align: 'right', render: (row) => fmtNum(Number(row.total_impressions)) },
    { key: 'total_clicks', label: 'Clicks', align: 'right', render: (row) => fmtNum(Number(row.total_clicks)) },
    { key: 'avg_ctr', label: 'CTR', align: 'right', render: (row) => `${Number(row.avg_ctr).toFixed(2)}%` },
    { key: 'avg_cpm', label: 'CPM', align: 'right', render: (row) => fmtGBP(Number(row.avg_cpm)) },
    { key: 'avg_cpc', label: 'CPC', align: 'right', render: (row) => fmtGBP(Number(row.avg_cpc)) },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads)) },
    {
      key: 'avg_cpl', label: 'CPL', align: 'right',
      render: (row) => {
        const cpl = Number(row.avg_cpl);
        if (Number(row.total_leads) === 0) return <span className="text-gray-400">-</span>;
        const isBest = bestCPL && row.placement === bestCPL.placement;
        const isWorst = worstCPL && row.placement === worstCPL.placement;
        return (
          <span className={`font-semibold ${isBest ? 'text-emerald-600 dark:text-emerald-400' : isWorst ? 'text-red-500' : ''}`}>
            {fmtGBP(cpl)}
            {isBest && <span className="text-[10px] ml-1">Best</span>}
            {isWorst && <span className="text-[10px] ml-1">Worst</span>}
          </span>
        );
      },
    },
  ];

  if (loading && !placements.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading placement data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Placements Tracked" value={String(placements.length)} icon={Layout} color="blue" />
        <KPICard label="Total Spend" value={fmtGBP(totalSpend)} icon={DollarSign} color="yellow" />
        <KPICard
          label="Best CPL Placement"
          value={bestCPL ? `${bestCPL.placement.replace(/_/g, ' ')}` : '-'}
          icon={TrendingDown}
          color="green"
        />
        <KPICard
          label="Worst CPL Placement"
          value={worstCPL ? `${worstCPL.placement.replace(/_/g, ' ')}` : '-'}
          icon={TrendingUp}
          color="orange"
        />
      </div>

      {/* Spend by Placement Bar Chart */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Spend & CPL by Placement</h3>
        {placements.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={placements.sort((a, b) => Number(b.total_spend) - Number(a.total_spend))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <YAxis
                type="category"
                dataKey="placement"
                tick={{ fontSize: 11 }}
                width={120}
                tickFormatter={(v) => v.replace(/_/g, ' ')}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'total_spend') return [`\u00A3${value.toFixed(2)}`, 'Spend'];
                  if (name === 'avg_cpl') return [`\u00A3${value.toFixed(2)}`, 'CPL'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar dataKey="total_spend" fill="#3b82f6" name="Spend" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500 text-sm">
            No placement breakdown data available for this period.
          </div>
        )}
      </div>

      {/* CPL Trend by Placement */}
      {trendChartData.length > 0 && trendPlacements.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">CPL Trend by Placement</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <Tooltip
                formatter={(value: number, name: string) => [`\u00A3${value.toFixed(2)}`, name.replace(/_/g, ' ')]}
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
              <Legend />
              {trendPlacements.map((p) => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stroke={PLACEMENT_COLORS[p] || '#6b7280'}
                  strokeWidth={1.5}
                  dot={false}
                  name={p.replace(/_/g, ' ')}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Placement Comparison Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Placement Comparison</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Compare cost efficiency across all ad placements.</p>
        </div>
        <DataTable
          columns={columns}
          data={placements}
          defaultSortKey="total_spend"
          defaultSortDir="desc"
          rowKey={(row) => row.placement}
          emptyMessage="No placement data yet. Placement breakdown will populate once metrics include placement information."
          compact
        />
      </div>
    </div>
  );
};

export default PlacementOptimisation;
