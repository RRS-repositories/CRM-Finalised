import React, { useEffect, useState, useCallback } from 'react';
import {
  Flame, Eye, CheckCircle2, Rocket, Trophy, XCircle,
  DollarSign, Users, BarChart3, Target, GripVertical,
  ArrowRight, Clock, Zap, RefreshCw
} from 'lucide-react';
import KPICard from './shared/KPICard';
import DataTable, { Column } from './shared/DataTable';

interface PipelineItem {
  id: string;
  content_id: string;
  tiktok_account_id: string;
  stage: string;
  qualification_reason: string;
  views_at_qualification: number;
  engagement_rate_at_qual: number;
  auth_code: string;
  auth_code_expires_at: string;
  approved_by: string;
  approved_at: string;
  spark_ad_id: string;
  campaign_id: string;
  launched_at: string;
  completed_at: string;
  spark_spend: number;
  spark_impressions: number;
  spark_clicks: number;
  spark_leads: number;
  spark_cpl: number;
  notes: string;
  content_title: string;
  hook: string;
  thumbnail_url: string;
  format: string;
  account_name: string;
  tiktok_username: string;
  campaign_name: string;
  created_at: string;
  updated_at: string;
}

interface PipelineStats {
  total: number;
  monitoring: number;
  qualified: number;
  approved: number;
  live: number;
  completed: number;
  total_spark_spend: number;
  total_spark_leads: number;
  avg_spark_cpl: number;
}

interface GroupedPipeline {
  monitoring: PipelineItem[];
  qualified: PipelineItem[];
  approved: PipelineItem[];
  live: PipelineItem[];
  completed: PipelineItem[];
  rejected: PipelineItem[];
}

const STAGES = [
  { key: 'monitoring', label: 'Monitoring', icon: Eye, color: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600', badge: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { key: 'qualified', label: 'Qualified', icon: Zap, color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'live', label: 'Live', icon: Rocket, color: 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  { key: 'completed', label: 'Completed', icon: Trophy, color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
];

const SparkAdsPipeline: React.FC = () => {
  const [grouped, setGrouped] = useState<GroupedPipeline>({ monitoring: [], qualified: [], approved: [], live: [], completed: [], rejected: [] });
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [allItems, setAllItems] = useState<PipelineItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupedRes, statsRes, allRes] = await Promise.all([
        fetch('/api/marketing/spark-ads/pipeline/grouped'),
        fetch('/api/marketing/spark-ads/stats'),
        fetch('/api/marketing/spark-ads/pipeline'),
      ]);
      if (groupedRes.ok) setGrouped(await groupedRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (allRes.ok) setAllItems(await allRes.json());
    } catch (err) {
      console.error('Failed to fetch spark ads data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStageChange = async (itemId: string, newStage: string) => {
    try {
      const res = await fetch(`/api/marketing/spark-ads/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const tableColumns: Column<PipelineItem>[] = [
    { key: 'content_title', label: 'Content', render: (r) => (
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{r.content_title || 'Untitled'}</p>
        {r.hook && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]">{r.hook}</p>}
      </div>
    )},
    { key: 'tiktok_username', label: 'Account', render: (r) => r.tiktok_username ? `@${r.tiktok_username}` : '-' },
    { key: 'stage', label: 'Stage', render: (r) => {
      const s = STAGES.find(s => s.key === r.stage);
      return s ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.badge}`}>{s.label}</span> : r.stage;
    }},
    { key: 'views_at_qualification', label: 'Views at Qual', align: 'right', render: (r) => r.views_at_qualification ? Number(r.views_at_qualification).toLocaleString() : '-' },
    { key: 'engagement_rate_at_qual', label: 'Eng Rate', align: 'right', render: (r) => r.engagement_rate_at_qual ? `${Number(r.engagement_rate_at_qual).toFixed(1)}%` : '-' },
    { key: 'spark_spend', label: 'Spend', align: 'right', render: (r) => r.spark_spend ? `$${Number(r.spark_spend).toFixed(2)}` : '-' },
    { key: 'spark_leads', label: 'Leads', align: 'right', render: (r) => r.spark_leads ?? '-' },
    { key: 'spark_cpl', label: 'CPL', align: 'right', render: (r) => r.spark_cpl ? `$${Number(r.spark_cpl).toFixed(2)}` : '-' },
    { key: 'campaign_name', label: 'Campaign', render: (r) => r.campaign_name || '-' },
    { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '-' },
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total Pipeline" value={String(stats.total)} icon={Flame} color="orange" />
          <KPICard label="Live Spark Ads" value={String(stats.live)} icon={Rocket} color="green" />
          <KPICard label="Total Spend" value={`$${Number(stats.total_spark_spend).toLocaleString()}`} icon={DollarSign} color="blue" />
          <KPICard label="Avg Spark CPL" value={stats.avg_spark_cpl ? `$${Number(stats.avg_spark_cpl).toFixed(2)}` : '$0'} icon={Target} color="purple" invertDelta />
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Spark Ads Pipeline</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'kanban' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                view === 'table' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {view === 'kanban' ? (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const StageIcon = stage.icon;
            const items = grouped[stage.key as keyof GroupedPipeline] || [];
            return (
              <div key={stage.key} className={`flex-shrink-0 w-72 rounded-xl border ${stage.color} p-3`}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <StageIcon size={16} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{stage.label}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${stage.badge}`}>{items.length}</span>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {item.content_title || 'Untitled Content'}
                          </p>
                          {item.hook && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{item.hook}</p>
                          )}
                          {item.tiktok_username && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">@{item.tiktok_username}</p>
                          )}
                        </div>
                      </div>

                      {/* Metrics for live/completed items */}
                      {(stage.key === 'live' || stage.key === 'completed') && item.spark_spend != null && (
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                          <div className="text-xs">
                            <span className="text-gray-400">Spend</span>
                            <p className="font-medium text-gray-700 dark:text-gray-300">${Number(item.spark_spend).toFixed(2)}</p>
                          </div>
                          <div className="text-xs">
                            <span className="text-gray-400">Leads</span>
                            <p className="font-medium text-gray-700 dark:text-gray-300">{item.spark_leads ?? 0}</p>
                          </div>
                        </div>
                      )}

                      {/* Qualification info */}
                      {stage.key === 'qualified' && item.views_at_qualification && (
                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400">
                          {Number(item.views_at_qualification).toLocaleString()} views | {Number(item.engagement_rate_at_qual).toFixed(1)}% eng
                        </div>
                      )}

                      {/* Stage action buttons */}
                      <div className="flex gap-1 mt-2">
                        {stage.key === 'monitoring' && (
                          <button
                            onClick={() => handleStageChange(item.id, 'qualified')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          >
                            Qualify <ArrowRight size={10} />
                          </button>
                        )}
                        {stage.key === 'qualified' && (
                          <button
                            onClick={() => handleStageChange(item.id, 'approved')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                          >
                            Approve <ArrowRight size={10} />
                          </button>
                        )}
                        {stage.key === 'approved' && (
                          <button
                            onClick={() => handleStageChange(item.id, 'live')}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50"
                          >
                            Launch <Rocket size={10} />
                          </button>
                        )}
                        {stage.key !== 'completed' && stage.key !== 'rejected' && (
                          <button
                            onClick={() => handleStageChange(item.id, 'rejected')}
                            className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
                      No items
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <DataTable
            columns={tableColumns}
            data={allItems}
            rowKey={(r) => r.id}
            defaultSortKey="updated_at"
            emptyMessage="No spark ads in pipeline"
          />
        </div>
      )}

      {/* Stage Flow Summary */}
      {stats && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Pipeline Flow</h3>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {[
              { label: 'Monitoring', count: stats.monitoring, color: 'bg-gray-200 dark:bg-gray-700' },
              { label: 'Qualified', count: stats.qualified, color: 'bg-blue-200 dark:bg-blue-800' },
              { label: 'Approved', count: stats.approved, color: 'bg-emerald-200 dark:bg-emerald-800' },
              { label: 'Live', count: stats.live, color: 'bg-orange-200 dark:bg-orange-800' },
              { label: 'Completed', count: stats.completed, color: 'bg-purple-200 dark:bg-purple-800' },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <div className={`px-4 py-2 rounded-lg ${s.color} text-center min-w-[80px]`}>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{s.count}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{s.label}</p>
                </div>
                {i < 4 && <ArrowRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SparkAdsPipeline;
