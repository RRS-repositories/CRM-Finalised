import React, { useEffect, useState, useCallback } from 'react';
import {
  Video, Calendar, Clock, Users, Heart, MessageCircle,
  Share2, Gift, Plus, RefreshCw, Play, CheckCircle2,
  Pause, X, Edit3, Eye
} from 'lucide-react';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface LiveStream {
  id: string;
  tiktok_account_id: string;
  title: string;
  description: string;
  scheduled_at: string;
  status: string;
  duration_minutes: number;
  peak_viewers: number;
  total_viewers: number;
  new_followers: number;
  likes: number;
  comments: number;
  shares: number;
  gifts_value: number;
  topics: string;
  ai_prep_notes: string;
  ai_summary: string;
  account_name: string;
  tiktok_username: string;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  planned: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Calendar, label: 'Planned' },
  live: { color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: Play, label: 'LIVE' },
  completed: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle2, label: 'Completed' },
  cancelled: { color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: X, label: 'Cancelled' },
};

const LiveStreamPlanning: React.FC = () => {
  const [lives, setLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLive, setSelectedLive] = useState<LiveStream | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'history' | 'analytics'>('upcoming');
  const [form, setForm] = useState({ title: '', description: '', scheduled_at: '', topics: '', tiktok_account_id: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/tiktok-comments/lives');
      if (res.ok) setLives(await res.json());
    } catch (err) {
      console.error('Failed to fetch live streams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const upcoming = lives.filter(l => l.status === 'planned' || l.status === 'live')
    .sort((a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime());

  const completed = lives.filter(l => l.status === 'completed' || l.status === 'cancelled')
    .sort((a, b) => new Date(b.scheduled_at || b.created_at).getTime() - new Date(a.scheduled_at || a.created_at).getTime());

  const totalViewers = completed.reduce((sum, l) => sum + (l.total_viewers || 0), 0);
  const totalFollowers = completed.reduce((sum, l) => sum + (l.new_followers || 0), 0);
  const avgDuration = completed.filter(l => l.duration_minutes).length > 0
    ? Math.round(completed.reduce((sum, l) => sum + (l.duration_minutes || 0), 0) / completed.filter(l => l.duration_minutes).length)
    : 0;
  const avgPeakViewers = completed.filter(l => l.peak_viewers).length > 0
    ? Math.round(completed.reduce((sum, l) => sum + (l.peak_viewers || 0), 0) / completed.filter(l => l.peak_viewers).length)
    : 0;

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    try {
      const res = await fetch('/api/marketing/tiktok-comments/lives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ title: '', description: '', scheduled_at: '', topics: '', tiktok_account_id: '' });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create live stream:', err);
    }
  };

  const handleStatusChange = async (liveId: string, status: string) => {
    try {
      const res = await fetch(`/api/marketing/tiktok-comments/lives/${liveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update live stream:', err);
    }
  };

  const historyColumns: Column<LiveStream>[] = [
    { key: 'title', label: 'Title', render: (r) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{r.title}</p>
        {r.tiktok_username && <p className="text-xs text-gray-400">@{r.tiktok_username}</p>}
      </div>
    )},
    { key: 'status', label: 'Status', render: (r) => {
      const s = STATUS_CONFIG[r.status] || STATUS_CONFIG.planned;
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
    }},
    { key: 'scheduled_at', label: 'Date', render: (r) => r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString() : '-' },
    { key: 'duration_minutes', label: 'Duration', align: 'right', render: (r) => r.duration_minutes ? `${r.duration_minutes}m` : '-' },
    { key: 'peak_viewers', label: 'Peak Viewers', align: 'right', render: (r) => r.peak_viewers ? r.peak_viewers.toLocaleString() : '-' },
    { key: 'total_viewers', label: 'Total Viewers', align: 'right', render: (r) => r.total_viewers ? r.total_viewers.toLocaleString() : '-' },
    { key: 'new_followers', label: 'New Followers', align: 'right', render: (r) => r.new_followers ? `+${r.new_followers.toLocaleString()}` : '-' },
    { key: 'likes', label: 'Likes', align: 'right', render: (r) => r.likes ? r.likes.toLocaleString() : '-' },
    { key: 'comments', label: 'Comments', align: 'right', render: (r) => r.comments ? r.comments.toLocaleString() : '-' },
    { key: 'gifts_value', label: 'Gifts', align: 'right', render: (r) => r.gifts_value ? `$${Number(r.gifts_value).toFixed(2)}` : '-' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Upcoming Lives" value={String(upcoming.length)} icon={Calendar} color="blue" />
        <KPICard label="Total Viewers" value={totalViewers.toLocaleString()} icon={Users} color="green" />
        <KPICard label="Avg Peak Viewers" value={avgPeakViewers.toLocaleString()} icon={Eye} color="purple" />
        <KPICard label="Followers Gained" value={`+${totalFollowers.toLocaleString()}`} icon={Heart} color="pink" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700 flex-1">
          {[
            { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
            { key: 'history', label: 'History', count: completed.length },
            { key: 'analytics', label: 'Analytics' },
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
              {t.count != null && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-xs">{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} /> Schedule Live
          </button>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Schedule Live Stream</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Live stream title"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={3}
                  placeholder="What will you cover?"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Topics (comma-separated)</label>
                <input
                  type="text"
                  value={form.topics}
                  onChange={(e) => setForm(f => ({ ...f, topics: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. PPI claims, lender updates, Q&A"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setForm({ title: '', description: '', scheduled_at: '', topics: '', tiktok_account_id: '' }); }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Live Detail */}
      {selectedLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedLive.title}</h3>
                {selectedLive.tiktok_username && (
                  <p className="text-sm text-gray-400">@{selectedLive.tiktok_username}</p>
                )}
              </div>
              <button onClick={() => setSelectedLive(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {selectedLive.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{selectedLive.description}</p>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Duration', value: selectedLive.duration_minutes ? `${selectedLive.duration_minutes}m` : '-', icon: Clock },
                { label: 'Peak Viewers', value: selectedLive.peak_viewers?.toLocaleString() || '-', icon: Users },
                { label: 'Total Viewers', value: selectedLive.total_viewers?.toLocaleString() || '-', icon: Eye },
                { label: 'New Followers', value: selectedLive.new_followers ? `+${selectedLive.new_followers}` : '-', icon: Heart },
                { label: 'Likes', value: selectedLive.likes?.toLocaleString() || '-', icon: Heart },
                { label: 'Comments', value: selectedLive.comments?.toLocaleString() || '-', icon: MessageCircle },
                { label: 'Shares', value: selectedLive.shares?.toLocaleString() || '-', icon: Share2 },
                { label: 'Gifts', value: selectedLive.gifts_value ? `$${Number(selectedLive.gifts_value).toFixed(2)}` : '-', icon: Gift },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                  <m.icon size={16} className="mx-auto mb-1 text-gray-400" />
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{m.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                </div>
              ))}
            </div>

            {/* AI Notes */}
            {selectedLive.ai_prep_notes && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">AI Prep Notes</h4>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedLive.ai_prep_notes}
                </div>
              </div>
            )}
            {selectedLive.ai_summary && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">AI Summary</h4>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedLive.ai_summary}
                </div>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setSelectedLive(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Lives */}
      {tab === 'upcoming' && (
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Video size={40} className="mx-auto mb-2" />
              <p className="text-sm">No upcoming live streams scheduled.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Schedule one now
              </button>
            </div>
          ) : (
            upcoming.map((live) => {
              const statusCfg = STATUS_CONFIG[live.status] || STATUS_CONFIG.planned;
              const StatusIcon = statusCfg.icon;
              const scheduledDate = live.scheduled_at ? new Date(live.scheduled_at) : null;
              const isToday = scheduledDate && new Date().toDateString() === scheduledDate.toDateString();

              return (
                <div
                  key={live.id}
                  className={`bg-white dark:bg-slate-800 rounded-xl border p-4 ${
                    live.status === 'live'
                      ? 'border-red-300 dark:border-red-700 ring-2 ring-red-100 dark:ring-red-900/30'
                      : isToday
                        ? 'border-blue-200 dark:border-blue-800'
                        : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${live.status === 'live' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-slate-700'}`}>
                        <Video size={20} className={live.status === 'live' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{live.title}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                            <StatusIcon size={10} className="inline mr-1" />
                            {statusCfg.label}
                          </span>
                          {isToday && live.status !== 'live' && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              Today
                            </span>
                          )}
                        </div>
                        {live.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{live.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                          {scheduledDate && (
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {scheduledDate.toLocaleDateString()} at {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {live.tiktok_username && <span>@{live.tiktok_username}</span>}
                          {live.topics && <span>{live.topics}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {live.status === 'planned' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(live.id, 'live')}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50"
                          >
                            <Play size={12} /> Go Live
                          </button>
                          <button
                            onClick={() => handleStatusChange(live.id, 'cancelled')}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {live.status === 'live' && (
                        <button
                          onClick={() => handleStatusChange(live.id, 'completed')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                        >
                          <CheckCircle2 size={12} /> End Live
                        </button>
                      )}
                    </div>
                  </div>

                  {/* AI Prep Notes */}
                  {live.ai_prep_notes && (
                    <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">AI Prep Notes</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{live.ai_prep_notes}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <DataTable
            columns={historyColumns}
            data={completed}
            rowKey={(r) => r.id}
            defaultSortKey="scheduled_at"
            onRowClick={(r) => setSelectedLive(r)}
            emptyMessage="No completed live streams yet"
          />
        </div>
      )}

      {/* Analytics */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{completed.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Streams</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgDuration}m</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg Duration</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalViewers.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Viewers</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">+{totalFollowers.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Followers Gained</p>
            </div>
          </div>

          {/* Per-Stream Comparison */}
          {completed.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Stream Performance Comparison</h3>
              <div className="space-y-3">
                {completed.slice(0, 10).map((live) => {
                  const maxViewers = Math.max(...completed.map(l => l.total_viewers || 0), 1);
                  const pct = ((live.total_viewers || 0) / maxViewers) * 100;
                  return (
                    <div key={live.id} className="flex items-center gap-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 w-48 truncate flex-shrink-0">{live.title}</p>
                      <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-4 relative">
                        <div
                          className="bg-blue-500 h-4 rounded-full transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-20 text-right">
                        {(live.total_viewers || 0).toLocaleString()} views
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveStreamPlanning;
