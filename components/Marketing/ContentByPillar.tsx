import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw, Eye, Heart, MessageCircle, Share2, Bookmark, UserPlus,
  Clock, Play, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { useTikTokStore } from '../../stores/tiktokStore';
import KPICard from './shared/KPICard';
import DataTable, { type Column } from './shared/DataTable';

const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

interface PillarPerformance {
  id: string;
  name: string;
  color: string;
  target_pct: number;
  content_count: number;
  published_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  total_followers_gained: number;
  avg_watch_time: number;
  avg_completion_rate: number;
  engagement_rate: number;
}

interface ContentPerformance {
  id: string;
  title: string;
  hook: string;
  status: string;
  format: string;
  published_at: string;
  duration_seconds: number;
  pillar_name: string;
  pillar_color: string;
  account_name: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  total_followers_gained: number;
  avg_watch_time: number;
  avg_completion_rate: number;
  engagement_rate: number;
}

const ContentByPillar: React.FC = () => {
  const { pillars, fetchPillars } = useTikTokStore();
  const [pillarPerf, setPillarPerf] = useState<PillarPerformance[]>([]);
  const [contentPerf, setContentPerf] = useState<ContentPerformance[]>([]);
  const [selectedPillar, setSelectedPillar] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPillars();
    fetchData();
  }, []);

  useEffect(() => {
    fetchContentPerf();
  }, [selectedPillar]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/tiktok/organic-metrics/by-pillar');
      if (res.ok) setPillarPerf(await res.json());
    } catch (err) {
      console.error('Pillar fetch error:', err);
    }
    setLoading(false);
  };

  const fetchContentPerf = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedPillar !== 'all') params.set('pillar_id', selectedPillar);
      const res = await fetch(`/api/marketing/tiktok/organic-metrics/by-content?${params}`);
      if (res.ok) setContentPerf(await res.json());
    } catch (err) {
      console.error('Content perf fetch error:', err);
    }
  };

  const totalViews = useMemo(() => pillarPerf.reduce((s, p) => s + Number(p.total_views || 0), 0), [pillarPerf]);
  const totalEngagement = useMemo(() =>
    pillarPerf.reduce((s, p) => s + Number(p.total_likes || 0) + Number(p.total_comments || 0) + Number(p.total_shares || 0), 0),
  [pillarPerf]);
  const bestPillar = useMemo(() => {
    if (!pillarPerf.length) return null;
    return pillarPerf.reduce((best, p) => Number(p.engagement_rate) > Number(best.engagement_rate) ? p : best);
  }, [pillarPerf]);

  // Chart data for pillar comparison
  const chartData = useMemo(() =>
    pillarPerf.map(p => ({
      name: p.name,
      views: Number(p.total_views),
      likes: Number(p.total_likes),
      comments: Number(p.total_comments),
      shares: Number(p.total_shares),
      color: p.color,
    })),
  [pillarPerf]);

  const contentColumns: Column<ContentPerformance>[] = [
    {
      key: 'title', label: 'Content',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-[200px]">{row.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {row.pillar_color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.pillar_color }} />}
            <span className="text-[10px] text-gray-400">{row.pillar_name || 'No pillar'}</span>
            {row.format && <span className="text-[10px] text-gray-400">{'\u00B7'} {row.format}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'hook', label: 'Hook',
      render: (row) => <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px] block">{row.hook || '-'}</span>,
    },
    { key: 'total_views', label: 'Views', align: 'right', render: (row) => fmtNum(Number(row.total_views)) },
    { key: 'total_likes', label: 'Likes', align: 'right', render: (row) => fmtNum(Number(row.total_likes)) },
    { key: 'total_comments', label: 'Comments', align: 'right', render: (row) => fmtNum(Number(row.total_comments)) },
    { key: 'total_shares', label: 'Shares', align: 'right', render: (row) => fmtNum(Number(row.total_shares)) },
    { key: 'total_saves', label: 'Saves', align: 'right', render: (row) => fmtNum(Number(row.total_saves)) },
    {
      key: 'engagement_rate', label: 'Eng. Rate', align: 'right',
      render: (row) => <span className="font-semibold">{Number(row.engagement_rate).toFixed(2)}%</span>,
    },
    {
      key: 'avg_completion_rate', label: 'Completion', align: 'right',
      render: (row) => row.avg_completion_rate ? `${(Number(row.avg_completion_rate) * 100).toFixed(1)}%` : '-',
    },
    { key: 'total_followers_gained', label: 'Followers', align: 'right', render: (row) => fmtNum(Number(row.total_followers_gained)) },
  ];

  if (loading && !pillarPerf.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading pillar data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Views" value={fmtNum(totalViews)} icon={Eye} color="blue" />
        <KPICard label="Total Engagement" value={fmtNum(totalEngagement)} icon={Heart} color="pink" />
        <KPICard
          label="Best Pillar"
          value={bestPillar ? bestPillar.name : '-'}
          icon={BarChart3}
          color="green"
        />
        <KPICard label="Active Pillars" value={String(pillarPerf.length)} icon={Play} color="purple" />
      </div>

      {/* Pillar Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {pillarPerf.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPillar(selectedPillar === p.id ? 'all' : p.id)}
            className={`text-left bg-white dark:bg-slate-800 border rounded-xl p-4 shadow-sm transition-all ${
              selectedPillar === p.id
                ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-semibold text-gray-900 dark:text-white text-sm">{p.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400">Content</p>
                <p className="font-semibold text-gray-900 dark:text-white">{Number(p.published_count)}</p>
              </div>
              <div>
                <p className="text-gray-400">Views</p>
                <p className="font-semibold text-gray-900 dark:text-white">{fmtNum(Number(p.total_views))}</p>
              </div>
              <div>
                <p className="text-gray-400">Eng Rate</p>
                <p className="font-semibold text-gray-900 dark:text-white">{Number(p.engagement_rate).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-gray-400">Followers</p>
                <p className="font-semibold text-gray-900 dark:text-white">{fmtNum(Number(p.total_followers_gained))}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pillar Comparison Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Pillar Performance Comparison</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
              <Tooltip formatter={(value: number, name: string) => [fmtNum(value), name]} />
              <Legend />
              <Bar dataKey="views" name="Views" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="likes" name="Likes" fill="#ec4899" radius={[4, 4, 0, 0]} />
              <Bar dataKey="comments" name="Comments" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="shares" name="Shares" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Content Performance Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Content Performance {selectedPillar !== 'all' && pillarPerf.find(p => p.id === selectedPillar)
                ? `\u2014 ${pillarPerf.find(p => p.id === selectedPillar)!.name}`
                : ''}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click a pillar card above to filter.</p>
          </div>
          {selectedPillar !== 'all' && (
            <button
              onClick={() => setSelectedPillar('all')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show All
            </button>
          )}
        </div>
        <DataTable
          columns={contentColumns}
          data={contentPerf}
          defaultSortKey="total_views"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          emptyMessage="No content performance data yet. Metrics will populate once TikTok content is published and synced."
          compact
        />
      </div>
    </div>
  );
};

export default ContentByPillar;
