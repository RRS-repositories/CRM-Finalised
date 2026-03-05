import React, { useEffect, useMemo } from 'react';
import {
  RefreshCw, Users, Video, Eye, Heart, MessageCircle, Share2,
  Bookmark, UserPlus, Clock, ChevronRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { useTikTokStore } from '../../stores/tiktokStore';
import KPICard from './shared/KPICard';

const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const PIPELINE_STAGES = [
  { key: 'draft', label: 'Draft', color: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  { key: 'scripted', label: 'Scripted', color: 'bg-blue-200 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  { key: 'filmed', label: 'Filmed', color: 'bg-purple-200 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  { key: 'editing', label: 'Editing', color: 'bg-amber-200 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  { key: 'scheduled', label: 'Scheduled', color: 'bg-cyan-200 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  { key: 'published', label: 'Published', color: 'bg-green-200 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
] as const;

const TikTokCommandCentre: React.FC = () => {
  const {
    accounts, pillars, pipeline, organicMetrics, loading,
    fetchAccounts, fetchPillars, fetchPipeline, fetchOrganicMetrics,
  } = useTikTokStore();

  useEffect(() => {
    fetchAccounts();
    fetchPillars();
    fetchPipeline();
    fetchOrganicMetrics();
  }, []);

  const totalFollowers = useMemo(() => accounts.reduce((s, a) => s + (a.follower_count || 0), 0), [accounts]);
  const totalVideos = useMemo(() => accounts.reduce((s, a) => s + (a.video_count || 0), 0), [accounts]);

  const totalViews = useMemo(() => organicMetrics.reduce((s, m) => s + Number(m.views || 0), 0), [organicMetrics]);
  const totalLikes = useMemo(() => organicMetrics.reduce((s, m) => s + Number(m.likes || 0), 0), [organicMetrics]);
  const totalFollowersGained = useMemo(() => organicMetrics.reduce((s, m) => s + Number(m.followers_gained || 0), 0), [organicMetrics]);

  const pipelineTotal = useMemo(() =>
    Object.values(pipeline).reduce((s, items) => s + items.length, 0),
  [pipeline]);

  // Pillar balance pie chart
  const pillarChartData = useMemo(() =>
    pillars.filter(p => Number(p.published_count) > 0).map(p => ({
      name: p.name,
      value: Number(p.published_count),
      color: p.color,
    })),
  [pillars]);

  // Today's scheduled content
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayScheduled = useMemo(() =>
    pipeline.scheduled.filter(c => c.scheduled_date === todayStr),
  [pipeline, todayStr]);

  const isLoading = loading.accounts || loading.pillars || loading.pipeline;

  if (isLoading && !accounts.length && !pillars.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading TikTok Command Centre...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Followers" value={fmtNum(totalFollowers)} icon={Users} color="pink" />
        <KPICard label="Total Videos" value={fmtNum(totalVideos)} icon={Video} color="purple" />
        <KPICard label="Views (30d)" value={fmtNum(totalViews)} icon={Eye} color="blue" />
        <KPICard label="Likes (30d)" value={fmtNum(totalLikes)} icon={Heart} color="pink" />
        <KPICard label="New Followers" value={fmtNum(totalFollowersGained)} icon={UserPlus} color="green" />
        <KPICard label="In Pipeline" value={String(pipelineTotal)} icon={Clock} color="yellow" />
      </div>

      {/* Account Cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-rose-600 dark:text-rose-400">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .56.04.81.13v-3.5a6.37 6.37 0 0 0-.81-.05A6.34 6.34 0 0 0 3.15 15.4a6.34 6.34 0 0 0 6.34 6.15 6.34 6.34 0 0 0 6.34-6.34V9.13a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.56Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{acc.account_name}</p>
                    {acc.tiktok_username && <p className="text-xs text-gray-400">@{acc.tiktok_username}</p>}
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  acc.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'
                }`}>
                  {acc.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtNum(acc.follower_count || 0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Followers</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtNum(acc.following_count || 0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Following</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtNum(acc.video_count || 0)}</p>
                  <p className="text-[10px] text-gray-400 uppercase">Videos</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content Pipeline */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Content Pipeline</h3>
        <div className="grid grid-cols-6 gap-3">
          {PIPELINE_STAGES.map(stage => {
            const items = pipeline[stage.key as keyof typeof pipeline] || [];
            return (
              <div key={stage.key}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold ${stage.text}`}>{stage.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stage.color} ${stage.text}`}>
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {items.slice(0, 4).map(item => (
                    <div key={item.id} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2.5 border border-gray-100 dark:border-slate-600">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {item.pillar_color && (
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.pillar_color }}
                          />
                        )}
                        <span className="text-[10px] text-gray-400 truncate">{item.pillar_name || 'No pillar'}</span>
                      </div>
                      {item.scheduled_date && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(item.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  ))}
                  {items.length > 4 && (
                    <p className="text-[10px] text-gray-400 text-center">+{items.length - 4} more</p>
                  )}
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-[10px] text-gray-300 dark:text-gray-600">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Today's Schedule</h3>
          {todayScheduled.length > 0 ? (
            <div className="space-y-3">
              {todayScheduled.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  {item.pillar_color && (
                    <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: item.pillar_color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                    <p className="text-xs text-gray-400">{item.pillar_name} {item.scheduled_time ? `\u00B7 ${item.scheduled_time}` : ''}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
                    {item.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500 text-sm">
              No content scheduled for today.
            </div>
          )}
        </div>

        {/* Pillar Balance */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Content Pillar Balance</h3>
          {pillarChartData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={pillarChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80}>
                    {pillarChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pillars.map(p => {
                  const totalPublished = pillars.reduce((s, pp) => s + Number(pp.published_count || 0), 0);
                  const actualPct = totalPublished > 0 ? (Number(p.published_count || 0) / totalPublished * 100) : 0;
                  const diff = actualPct - p.target_pct;
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{p.name}</span>
                      <span className="text-gray-400 w-10 text-right">{actualPct.toFixed(0)}%</span>
                      <span className={`w-14 text-right font-medium ${
                        Math.abs(diff) <= 5 ? 'text-emerald-600' : diff < -5 ? 'text-red-500' : 'text-amber-500'
                      }`}>
                        ({diff > 0 ? '+' : ''}{diff.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-500 text-sm">
              No published content yet. Pillar distribution will appear as content is published.
            </div>
          )}
        </div>
      </div>

      {/* Organic Metrics Chart */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Organic Performance (30 Days)</h3>
        {organicMetrics.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={organicMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => [fmtNum(value), name]}
                labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={false} name="Views" />
              <Line yAxisId="left" type="monotone" dataKey="likes" stroke="#ec4899" strokeWidth={1.5} dot={false} name="Likes" />
              <Line yAxisId="right" type="monotone" dataKey="followers_gained" stroke="#10b981" strokeWidth={1.5} dot={false} name="New Followers" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[280px] text-gray-400 dark:text-gray-500 text-sm">
            No organic metrics data yet. Metrics will populate once TikTok accounts are synced.
          </div>
        )}
      </div>
    </div>
  );
};

export default TikTokCommandCentre;
