import React, { useEffect, useState, useMemo } from 'react';
import {
  Calendar, RefreshCw, Heart, Zap, Shield, Brain, Smile,
  Target, TrendingUp, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';
import DataTable, { type Column } from './shared/DataTable';

const fmtGBP = (n: number) => `\u00A3${Number(n).toFixed(2)}`;

interface CampaignSchedule {
  id: string;
  name: string;
  platform: string;
  status: string;
  emotional_angle: string;
  scheduled_days: string[];
  daily_budget: number;
  total_spend: number;
  total_leads: number;
  avg_cpl: number;
}

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMOTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  fear: { icon: Shield, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  urgency: { icon: Zap, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  hope: { icon: Heart, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-900/30' },
  empowerment: { icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  trust: { icon: Shield, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  curiosity: { icon: Brain, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  relief: { icon: Smile, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/30' },
};

const EMOTION_COLORS: Record<string, string> = {
  fear: '#ef4444',
  urgency: '#f97316',
  hope: '#ec4899',
  empowerment: '#10b981',
  trust: '#3b82f6',
  curiosity: '#8b5cf6',
  relief: '#14b8a6',
};

const EmotionalCycleCalendar: React.FC = () => {
  const { platformFilter } = useMarketingStore();
  const [campaigns, setCampaigns] = useState<CampaignSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (platformFilter !== 'all') params.set('platform', platformFilter);
        params.set('has_schedule', 'true');

        const res = await fetch(`/api/marketing/campaigns/scheduled?${params}`);
        if (res.ok) setCampaigns(await res.json());
      } catch (err) {
        console.error('Emotional cycle fetch error:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [platformFilter]);

  // Build calendar grid: day → list of campaigns
  const calendarGrid = useMemo(() => {
    const grid: Record<string, CampaignSchedule[]> = {};
    DAYS_FULL.forEach(d => { grid[d.toLowerCase()] = []; });

    campaigns.forEach(c => {
      const days = c.scheduled_days || [];
      days.forEach(d => {
        const key = d.toLowerCase();
        if (grid[key]) grid[key].push(c);
      });
    });
    return grid;
  }, [campaigns]);

  // Performance by emotional angle
  const anglePerformance = useMemo(() => {
    const map: Record<string, { spend: number; leads: number; count: number }> = {};
    campaigns.forEach(c => {
      const angle = c.emotional_angle || 'untagged';
      if (!map[angle]) map[angle] = { spend: 0, leads: 0, count: 0 };
      map[angle].spend += Number(c.total_spend || 0);
      map[angle].leads += Number(c.total_leads || 0);
      map[angle].count++;
    });
    return Object.entries(map).map(([angle, v]) => ({
      angle,
      ...v,
      cpl: v.leads > 0 ? v.spend / v.leads : 0,
    })).sort((a, b) => b.leads - a.leads);
  }, [campaigns]);

  const uniqueAngles = useMemo(() => [...new Set(campaigns.map(c => c.emotional_angle).filter(Boolean))], [campaigns]);
  const totalScheduled = campaigns.length;

  const columns: Column<CampaignSchedule>[] = [
    {
      key: 'name', label: 'Campaign',
      render: (row) => <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px] block">{row.name}</span>,
    },
    {
      key: 'emotional_angle', label: 'Angle',
      render: (row) => {
        const angle = row.emotional_angle || 'untagged';
        const config = EMOTION_CONFIG[angle];
        const Icon = config?.icon || Target;
        return (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${config?.bg || 'bg-gray-100 dark:bg-slate-700'} ${config?.color || 'text-gray-600 dark:text-gray-300'}`}>
            <Icon size={10} />
            {angle}
          </span>
        );
      },
    },
    {
      key: 'scheduled_days', label: 'Active Days',
      render: (row) => (
        <div className="flex gap-0.5">
          {DAYS_SHORT.map((d, i) => {
            const dayFull = DAYS_FULL[i].toLowerCase();
            const isActive = (row.scheduled_days || []).map(s => s.toLowerCase()).includes(dayFull);
            return (
              <span
                key={d}
                className={`w-5 h-5 flex items-center justify-center text-[9px] font-bold rounded ${
                  isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-400'
                }`}
              >
                {d[0]}
              </span>
            );
          })}
        </div>
      ),
    },
    { key: 'total_spend', label: 'Spend', align: 'right', render: (row) => fmtGBP(Number(row.total_spend || 0)) },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads || 0)) },
    {
      key: 'avg_cpl', label: 'CPL', align: 'right',
      render: (row) => Number(row.total_leads) > 0 ? fmtGBP(Number(row.avg_cpl)) : '-',
    },
  ];

  if (loading && !campaigns.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading emotional cycle data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Scheduled Campaigns" value={String(totalScheduled)} icon={Calendar} color="blue" />
        <KPICard label="Emotion Angles" value={String(uniqueAngles.length)} icon={Heart} color="pink" />
        <KPICard
          label="Best Angle"
          value={anglePerformance.length > 0 ? anglePerformance[0].angle : '-'}
          icon={TrendingUp}
          color="green"
        />
        <KPICard
          label="Days Covered"
          value={`${Object.values(calendarGrid).filter(v => v.length > 0).length}/7`}
          icon={BarChart3}
          color="purple"
        />
      </div>

      {/* Weekly Calendar */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Weekly Emotional Cycle</h3>
        <div className="grid grid-cols-7 gap-3">
          {DAYS_FULL.map((day, idx) => {
            const dayCampaigns = calendarGrid[day.toLowerCase()] || [];
            return (
              <div key={day} className="min-h-[120px]">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 text-center">{DAYS_SHORT[idx]}</div>
                <div className="space-y-1.5">
                  {dayCampaigns.length > 0 ? dayCampaigns.map(c => {
                    const angle = c.emotional_angle || 'untagged';
                    const config = EMOTION_CONFIG[angle];
                    const Icon = config?.icon || Target;
                    return (
                      <div
                        key={c.id}
                        className={`rounded-lg p-2 ${config?.bg || 'bg-gray-50 dark:bg-slate-700'} border border-transparent hover:border-gray-300 dark:hover:border-slate-500 transition-colors`}
                        title={`${c.name}\nAngle: ${angle}\nSpend: ${fmtGBP(Number(c.total_spend || 0))}\nLeads: ${c.total_leads || 0}`}
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <Icon size={10} className={config?.color || 'text-gray-400'} />
                          <span className={`text-[9px] font-bold uppercase ${config?.color || 'text-gray-500'}`}>{angle}</span>
                        </div>
                        <p className="text-[10px] text-gray-700 dark:text-gray-200 truncate font-medium">{c.name}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">{c.total_leads || 0} leads</p>
                      </div>
                    );
                  }) : (
                    <div className="flex items-center justify-center h-20 text-[10px] text-gray-300 dark:text-gray-600">
                      No ads
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Performance by Angle Chart */}
      {anglePerformance.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Performance by Emotional Angle</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={anglePerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="angle" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `\u00A3${v}`} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'leads') return [value, 'Leads'];
                  if (name === 'cpl') return [`\u00A3${value.toFixed(2)}`, 'CPL'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="leads" name="leads" radius={[4, 4, 0, 0]}>
                {anglePerformance.map((entry) => (
                  <Cell key={entry.angle} fill={EMOTION_COLORS[entry.angle] || '#6b7280'} />
                ))}
              </Bar>
              <Bar yAxisId="right" dataKey="cpl" name="cpl" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaign Schedule Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Campaign Schedule</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Campaigns with emotional angle and day scheduling. Tag campaigns with angles to build your emotional cycle.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={campaigns}
          defaultSortKey="total_leads"
          defaultSortDir="desc"
          rowKey={(row) => row.id}
          emptyMessage="No campaigns with emotional scheduling yet. Tag campaigns with emotional angles and scheduled days to build your weekly cycle."
          compact
        />
      </div>
    </div>
  );
};

export default EmotionalCycleCalendar;
