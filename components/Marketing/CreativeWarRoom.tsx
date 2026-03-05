import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, Activity, Eye, TrendingDown, RefreshCw,
  Tag, Zap, Film, Image, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import PlatformBadge from './shared/PlatformBadge';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => `\u00A3${Number(n).toFixed(2)}`;

interface LifecycleEntry {
  id: string;
  creative_id: string;
  campaign_id: string;
  peak_ctr: number;
  current_ctr: number;
  peak_cpl: number;
  current_cpl: number;
  ctr_decline_pct: number;
  cpl_increase_pct: number;
  days_active: number;
  status: string;
  first_seen: string;
  peak_date: string;
  last_checked: string;
  // joined
  headline?: string;
  type?: string;
  platform?: string;
  thumbnail_url?: string;
  image_url?: string;
  campaign_name?: string;
}

interface TagPerformance {
  category: string;
  value: string;
  count: number;
  avg_ctr: number;
  avg_cpl: number;
  avg_spend: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  watch: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  fatigued: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  retired: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300',
};

const CreativeWarRoom: React.FC = () => {
  const { platformFilter } = useMarketingStore();
  const [lifecycle, setLifecycle] = useState<LifecycleEntry[]>([]);
  const [tags, setTags] = useState<TagPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (platformFilter !== 'all') params.set('platform', platformFilter);

        const [lcRes, tagsRes] = await Promise.all([
          fetch(`/api/marketing/ads/creatives/lifecycle?${params}`),
          fetch(`/api/marketing/ads/creatives/tag-performance?${params}`),
        ]);

        if (lcRes.ok) setLifecycle(await lcRes.json());
        if (tagsRes.ok) setTags(await tagsRes.json());
      } catch (err) {
        console.error('War Room fetch error:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [platformFilter]);

  const statusCounts = useMemo(() => {
    const counts = { active: 0, watch: 0, fatigued: 0, retired: 0 };
    lifecycle.forEach(l => {
      if (counts[l.status as keyof typeof counts] !== undefined) {
        counts[l.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [lifecycle]);

  const avgDecline = useMemo(() => {
    const items = lifecycle.filter(l => l.ctr_decline_pct > 0);
    if (!items.length) return 0;
    return items.reduce((s, l) => s + Number(l.ctr_decline_pct), 0) / items.length;
  }, [lifecycle]);

  const avgDaysActive = useMemo(() => {
    if (!lifecycle.length) return 0;
    return Math.round(lifecycle.reduce((s, l) => s + l.days_active, 0) / lifecycle.length);
  }, [lifecycle]);

  // Tag performance by category
  const tagsByCategory = useMemo(() => {
    const map: Record<string, TagPerformance[]> = {};
    tags.forEach(t => {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    });
    return map;
  }, [tags]);

  const categoryLabels: Record<string, string> = {
    style: 'Creative Style',
    emotion: 'Emotional Angle',
    angle: 'Messaging Angle',
    format: 'Format',
    hook_type: 'Hook Type',
    lender_mention: 'Lender Mentioned',
  };

  const lifecycleColumns: Column<LifecycleEntry>[] = [
    {
      key: 'headline', label: 'Creative',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {(row.thumbnail_url || row.image_url) ? (
              <img src={row.thumbnail_url || row.image_url} alt="" className="w-full h-full object-cover" />
            ) : row.type === 'video' ? (
              <Film size={14} className="text-gray-400" />
            ) : (
              <Image size={14} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-[160px]">{row.headline || 'Untitled'}</p>
            {row.platform && <PlatformBadge platform={row.platform} />}
          </div>
        </div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLORS[row.status] || STATUS_COLORS.active}`}>
          {row.status.toUpperCase()}
        </span>
      ),
    },
    { key: 'days_active', label: 'Days', align: 'right', render: (row) => String(row.days_active) },
    { key: 'peak_ctr', label: 'Peak CTR', align: 'right', render: (row) => `${Number(row.peak_ctr).toFixed(2)}%` },
    { key: 'current_ctr', label: 'Curr CTR', align: 'right', render: (row) => `${Number(row.current_ctr).toFixed(2)}%` },
    {
      key: 'ctr_decline_pct', label: 'CTR Decline', align: 'right',
      render: (row) => {
        const d = Number(row.ctr_decline_pct);
        const color = d > 30 ? 'text-red-500' : d > 15 ? 'text-amber-500' : 'text-gray-500';
        return <span className={`font-semibold ${color}`}>{d > 0 ? `-${d.toFixed(0)}%` : '-'}</span>;
      },
    },
    { key: 'peak_cpl', label: 'Peak CPL', align: 'right', render: (row) => Number(row.peak_cpl) > 0 ? fmtGBP(Number(row.peak_cpl)) : '-' },
    { key: 'current_cpl', label: 'Curr CPL', align: 'right', render: (row) => Number(row.current_cpl) > 0 ? fmtGBP(Number(row.current_cpl)) : '-' },
    {
      key: 'cpl_increase_pct', label: 'CPL Rise', align: 'right',
      render: (row) => {
        const d = Number(row.cpl_increase_pct);
        const color = d > 30 ? 'text-red-500' : d > 15 ? 'text-amber-500' : 'text-gray-500';
        return <span className={`font-semibold ${color}`}>{d > 0 ? `+${d.toFixed(0)}%` : '-'}</span>;
      },
    },
  ];

  if (loading && !lifecycle.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading Creative War Room...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Active Creatives" value={String(statusCounts.active)} icon={Activity} color="green" />
        <KPICard label="Watch List" value={String(statusCounts.watch)} icon={Eye} color="yellow" />
        <KPICard label="Fatigued" value={String(statusCounts.fatigued)} icon={AlertTriangle} color="orange" />
        <KPICard label="Retired" value={String(statusCounts.retired)} icon={TrendingDown} color="purple" />
        <KPICard label="Avg CTR Decline" value={`${avgDecline.toFixed(1)}%`} icon={BarChart3} color="pink" />
        <KPICard label="Avg Days Active" value={String(avgDaysActive)} icon={Zap} color="blue" />
      </div>

      {/* Fatigue Alerts */}
      {statusCounts.fatigued > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-600" />
            <h3 className="font-semibold text-red-800 dark:text-red-300 text-sm">Fatigued Creatives — Action Required</h3>
          </div>
          <div className="space-y-1">
            {lifecycle.filter(l => l.status === 'fatigued').slice(0, 5).map(l => (
              <p key={l.id} className="text-sm text-red-700 dark:text-red-400">
                <span className="font-medium">{l.headline || 'Untitled'}</span> — CTR down {Number(l.ctr_decline_pct).toFixed(0)}% after {l.days_active} days
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Tag Performance Charts */}
      {Object.keys(tagsByCategory).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(tagsByCategory).slice(0, 4).map(([category, items]) => (
            <div key={category} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Tag size={14} className="text-gray-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {categoryLabels[category] || category} — CPL Comparison
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={items.sort((a, b) => a.avg_cpl - b.avg_cpl)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
                  <YAxis type="category" dataKey="value" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value: number) => [`\u00A3${value.toFixed(2)}`, 'Avg CPL']} />
                  <Bar dataKey="avg_cpl" radius={[0, 4, 4, 0]}>
                    {items.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#10b981' : i === items.length - 1 ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}

      {/* Lifecycle Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Creative Lifecycle Tracker</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sorted by fatigue severity. Watch for CTR decline &gt;15% and CPL rise &gt;20%.</p>
        </div>
        <DataTable
          columns={lifecycleColumns}
          data={lifecycle}
          defaultSortKey="ctr_decline_pct"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          emptyMessage="No creative lifecycle data yet. Fatigue tracking will populate as creatives run."
          compact
        />
      </div>
    </div>
  );
};

export default CreativeWarRoom;
