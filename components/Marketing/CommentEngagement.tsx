import React, { useEffect, useState, useCallback } from 'react';
import {
  MessageCircle, Send, AlertTriangle, UserCheck, Star,
  ThumbsUp, ThumbsDown, HelpCircle, Zap, RefreshCw,
  Clock, Filter, ChevronDown, Check
} from 'lucide-react';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface Comment {
  id: string;
  content_id: string;
  tiktok_account_id: string;
  tiktok_comment_id: string;
  author_username: string;
  author_display_name: string;
  comment_text: string;
  likes: number;
  is_reply: boolean;
  parent_comment_id: string;
  status: string;
  sentiment: string;
  priority: string;
  is_lead_signal: boolean;
  ai_analysis: any;
  reply_text: string;
  replied_by: string;
  replied_at: string;
  content_title: string;
  content_hook: string;
  account_name: string;
  tiktok_username: string;
  created_at: string;
}

interface CommentStats {
  total_comments: number;
  pending: number;
  replied: number;
  flagged: number;
  converted: number;
  lead_signals: number;
  positive: number;
  negative: number;
  questions: number;
  lead_sentiment: number;
  reply_rate: number;
}

const SENTIMENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  positive: { icon: ThumbsUp, color: 'text-emerald-500', label: 'Positive' },
  negative: { icon: ThumbsDown, color: 'text-red-500', label: 'Negative' },
  neutral: { icon: MessageCircle, color: 'text-gray-400', label: 'Neutral' },
  question: { icon: HelpCircle, color: 'text-blue-500', label: 'Question' },
  lead_signal: { icon: Zap, color: 'text-amber-500', label: 'Lead Signal' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  normal: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  low: 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  replied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  flagged: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ignored: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  converted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

const CommentEngagement: React.FC = () => {
  const [queue, setQueue] = useState<Comment[]>([]);
  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [stats, setStats] = useState<CommentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'queue' | 'all' | 'analytics'>('queue');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (sentimentFilter) params.set('sentiment', sentimentFilter);

      const [queueRes, allRes, statsRes] = await Promise.all([
        fetch('/api/marketing/tiktok-comments/priority-queue'),
        fetch(`/api/marketing/tiktok-comments?${params}`),
        fetch('/api/marketing/tiktok-comments/stats'),
      ]);
      if (queueRes.ok) setQueue(await queueRes.json());
      if (allRes.ok) setAllComments(await allRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sentimentFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    try {
      const res = await fetch(`/api/marketing/tiktok-comments/${commentId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: replyText, replied_by: 'human' }),
      });
      if (res.ok) {
        setReplyingTo(null);
        setReplyText('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to reply:', err);
    }
  };

  const handleStatusChange = async (commentId: string, status: string) => {
    try {
      const res = await fetch(`/api/marketing/tiktok-comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const allColumns: Column<Comment>[] = [
    { key: 'author_username', label: 'Author', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
          {(r.author_display_name || r.author_username || '?')[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{r.author_display_name || r.author_username}</p>
          {r.author_username && <p className="text-xs text-gray-400">@{r.author_username}</p>}
        </div>
      </div>
    )},
    { key: 'comment_text', label: 'Comment', render: (r) => (
      <p className="text-sm text-gray-700 dark:text-gray-300 max-w-[300px] truncate">{r.comment_text}</p>
    )},
    { key: 'content_title', label: 'Content', render: (r) => (
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{r.content_title || '-'}</p>
    )},
    { key: 'sentiment', label: 'Sentiment', render: (r) => {
      const s = SENTIMENT_CONFIG[r.sentiment] || SENTIMENT_CONFIG.neutral;
      const Icon = s.icon;
      return <span className={`inline-flex items-center gap-1 text-xs ${s.color}`}><Icon size={12} /> {s.label}</span>;
    }},
    { key: 'priority', label: 'Priority', render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[r.priority] || PRIORITY_COLORS.normal}`}>
        {r.priority || 'normal'}
      </span>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || STATUS_COLORS.pending}`}>
        {r.status}
      </span>
    )},
    { key: 'is_lead_signal', label: 'Lead', align: 'center', render: (r) => r.is_lead_signal ? <Zap size={14} className="text-amber-500 mx-auto" /> : '-' },
    { key: 'likes', label: 'Likes', align: 'right' },
    { key: 'created_at', label: 'Date', render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '-' },
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
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <KPICard label="Total Comments" value={String(stats.total_comments)} icon={MessageCircle} color="blue" />
          <KPICard label="Pending Reply" value={String(stats.pending)} icon={Clock} color="yellow" />
          <KPICard label="Reply Rate" value={`${stats.reply_rate}%`} icon={Send} color="green" />
          <KPICard label="Lead Signals" value={String(stats.lead_signals)} icon={Zap} color="orange" />
          <KPICard label="Converted" value={String(stats.converted)} icon={UserCheck} color="purple" />
          <KPICard label="Flagged" value={String(stats.flagged)} icon={AlertTriangle} color="pink" />
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
        {[
          { key: 'queue', label: 'Priority Queue', count: queue.length },
          { key: 'all', label: 'All Comments', count: allComments.length },
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
        <button onClick={fetchData} className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Priority Queue */}
      {tab === 'queue' && (
        <div className="space-y-3">
          {queue.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Check size={40} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">All caught up! No pending comments in the queue.</p>
            </div>
          ) : (
            queue.map((comment) => {
              const sentimentCfg = SENTIMENT_CONFIG[comment.sentiment] || SENTIMENT_CONFIG.neutral;
              const SentimentIcon = sentimentCfg.icon;
              return (
                <div key={comment.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                      {(comment.author_display_name || comment.author_username || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {comment.author_display_name || comment.author_username}
                        </span>
                        {comment.author_username && (
                          <span className="text-xs text-gray-400">@{comment.author_username}</span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs ${sentimentCfg.color}`}>
                          <SentimentIcon size={12} /> {sentimentCfg.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[comment.priority] || PRIORITY_COLORS.normal}`}>
                          {comment.priority}
                        </span>
                        {comment.is_lead_signal && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            <Zap size={10} /> Lead
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{comment.comment_text}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                        {comment.content_title && <span>on: {comment.content_title}</span>}
                        {comment.tiktok_username && <span>@{comment.tiktok_username}</span>}
                        {comment.likes > 0 && <span>{comment.likes} likes</span>}
                        <span>{new Date(comment.created_at).toLocaleString()}</span>
                      </div>

                      {/* Reply Input */}
                      {replyingTo === comment.id ? (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type your reply..."
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)}
                            autoFocus
                          />
                          <button
                            onClick={() => handleReply(comment.id)}
                            disabled={!replyText.trim()}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Send size={14} /> Reply
                          </button>
                          <button
                            onClick={() => { setReplyingTo(null); setReplyText(''); }}
                            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => setReplyingTo(comment.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          >
                            <Send size={12} /> Reply
                          </button>
                          <button
                            onClick={() => handleStatusChange(comment.id, 'flagged')}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          >
                            <AlertTriangle size={12} /> Flag
                          </button>
                          <button
                            onClick={() => handleStatusChange(comment.id, 'ignored')}
                            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                          >
                            Ignore
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* All Comments */}
      {tab === 'all' && (
        <div>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="replied">Replied</option>
              <option value="flagged">Flagged</option>
              <option value="ignored">Ignored</option>
              <option value="converted">Converted</option>
            </select>
            <select
              value={sentimentFilter}
              onChange={(e) => setSentimentFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300"
            >
              <option value="">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="neutral">Neutral</option>
              <option value="question">Question</option>
              <option value="lead_signal">Lead Signal</option>
            </select>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <DataTable
              columns={allColumns}
              data={allComments}
              rowKey={(r) => r.id}
              defaultSortKey="created_at"
              emptyMessage="No comments found"
            />
          </div>
        </div>
      )}

      {/* Analytics */}
      {tab === 'analytics' && stats && (
        <div className="space-y-6">
          {/* Sentiment Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Sentiment Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Positive', value: stats.positive, color: 'bg-emerald-500', icon: ThumbsUp },
                { label: 'Negative', value: stats.negative, color: 'bg-red-500', icon: ThumbsDown },
                { label: 'Questions', value: stats.questions, color: 'bg-blue-500', icon: HelpCircle },
                { label: 'Lead Signals', value: stats.lead_sentiment, color: 'bg-amber-500', icon: Zap },
                { label: 'Neutral', value: Number(stats.total_comments) - stats.positive - stats.negative - stats.questions - stats.lead_sentiment, color: 'bg-gray-400', icon: MessageCircle },
              ].map((s) => {
                const pct = Number(stats.total_comments) > 0 ? (s.value / Number(stats.total_comments)) * 100 : 0;
                const Icon = s.icon;
                return (
                  <div key={s.label} className="text-center">
                    <Icon size={20} className="mx-auto mb-1 text-gray-400" />
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                    <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1.5 mt-2">
                      <div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{pct.toFixed(1)}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Status Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Pending', value: stats.pending, color: 'text-amber-500' },
                { label: 'Replied', value: stats.replied, color: 'text-emerald-500' },
                { label: 'Flagged', value: stats.flagged, color: 'text-red-500' },
                { label: 'Converted', value: stats.converted, color: 'text-purple-500' },
                { label: 'Reply Rate', value: `${stats.reply_rate}%`, color: 'text-blue-500' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentEngagement;
