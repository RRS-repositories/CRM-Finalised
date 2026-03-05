import React, { useEffect, useState, useMemo } from 'react';
import { Clock, RefreshCw, Sun, Moon, Sunrise, Sunset, TrendingUp, Target } from 'lucide-react';
import { useMarketingStore } from '../../stores/marketingStore';
import KPICard from './shared/KPICard';

const fmtGBP = (n: number) => `\u00A3${Number(n).toFixed(2)}`;

interface HourDayData {
  hour_of_day: number;
  day_of_week: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  avg_ctr: number;
  avg_cpl: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type MetricKey = 'total_leads' | 'avg_cpl' | 'avg_ctr' | 'total_spend';

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'total_leads', label: 'Leads' },
  { key: 'avg_cpl', label: 'CPL' },
  { key: 'avg_ctr', label: 'CTR' },
  { key: 'total_spend', label: 'Spend' },
];

const TimeOfDayHeatmap: React.FC = () => {
  const { dateRange, platformFilter } = useMarketingStore();
  const [data, setData] = useState<HourDayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>('total_leads');

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

        const res = await fetch(`/api/marketing/metrics/hourly-heatmap?${params}`);
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error('Heatmap fetch error:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [dateRange, platformFilter]);

  // Build a 7x24 grid lookup
  const grid = useMemo(() => {
    const g: Record<string, HourDayData> = {};
    data.forEach(d => {
      g[`${d.day_of_week}-${d.hour_of_day}`] = d;
    });
    return g;
  }, [data]);

  // Find min/max for color scaling
  const { minVal, maxVal } = useMemo(() => {
    const vals = data.map(d => Number(d[metric]) || 0).filter(v => v > 0);
    return {
      minVal: vals.length ? Math.min(...vals) : 0,
      maxVal: vals.length ? Math.max(...vals) : 1,
    };
  }, [data, metric]);

  // For CPL, lower is better (invert colors)
  const invertColor = metric === 'avg_cpl';

  const getCellColor = (value: number) => {
    if (value === 0) return 'bg-gray-50 dark:bg-slate-800';
    const range = maxVal - minVal || 1;
    let intensity = (value - minVal) / range; // 0..1
    if (invertColor) intensity = 1 - intensity; // lower CPL = greener

    if (intensity > 0.8) return 'bg-emerald-500 dark:bg-emerald-600 text-white';
    if (intensity > 0.6) return 'bg-emerald-300 dark:bg-emerald-700 text-emerald-900 dark:text-emerald-100';
    if (intensity > 0.4) return 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100';
    if (intensity > 0.2) return 'bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100';
    return 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100';
  };

  const formatCellValue = (value: number) => {
    if (value === 0) return '';
    if (metric === 'avg_cpl') return `\u00A3${value.toFixed(0)}`;
    if (metric === 'avg_ctr') return `${value.toFixed(1)}%`;
    if (metric === 'total_spend') return `\u00A3${value.toFixed(0)}`;
    return String(Math.round(value));
  };

  // Best/worst hours
  const bestHour = useMemo(() => {
    if (!data.length) return null;
    const byHour: Record<number, { leads: number; spend: number }> = {};
    data.forEach(d => {
      if (!byHour[d.hour_of_day]) byHour[d.hour_of_day] = { leads: 0, spend: 0 };
      byHour[d.hour_of_day].leads += Number(d.total_leads);
      byHour[d.hour_of_day].spend += Number(d.total_spend);
    });
    let best = -1, bestLeads = 0;
    Object.entries(byHour).forEach(([h, v]) => {
      if (v.leads > bestLeads) { bestLeads = v.leads; best = Number(h); }
    });
    return best >= 0 ? { hour: best, leads: bestLeads } : null;
  }, [data]);

  const bestDay = useMemo(() => {
    if (!data.length) return null;
    const byDay: Record<number, number> = {};
    data.forEach(d => {
      byDay[d.day_of_week] = (byDay[d.day_of_week] || 0) + Number(d.total_leads);
    });
    let best = -1, bestLeads = 0;
    Object.entries(byDay).forEach(([d, leads]) => {
      if (leads > bestLeads) { bestLeads = leads; best = Number(d); }
    });
    return best >= 0 ? { day: DAYS[best], leads: bestLeads } : null;
  }, [data]);

  const totalLeads = useMemo(() => data.reduce((s, d) => s + Number(d.total_leads), 0), [data]);
  const totalSpend = useMemo(() => data.reduce((s, d) => s + Number(d.total_spend), 0), [data]);

  const formatHour = (h: number) => {
    if (h === 0) return '12am';
    if (h < 12) return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
  };

  const getTimeIcon = (h: number) => {
    if (h >= 6 && h < 10) return Sunrise;
    if (h >= 10 && h < 17) return Sun;
    if (h >= 17 && h < 20) return Sunset;
    return Moon;
  };

  if (loading && !data.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading heatmap data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Best Hour"
          value={bestHour ? formatHour(bestHour.hour) : '-'}
          icon={getTimeIcon(bestHour?.hour ?? 12)}
          color="green"
        />
        <KPICard label="Best Day" value={bestDay?.day || '-'} icon={TrendingUp} color="blue" />
        <KPICard label="Total Leads" value={String(totalLeads)} icon={Target} color="pink" />
        <KPICard label="Total Spend" value={fmtGBP(totalSpend)} icon={Clock} color="yellow" />
      </div>

      {/* Heatmap */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Performance Heatmap</h3>
          <div className="flex items-center gap-2">
            {METRIC_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  metric === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-12 p-1 text-xs text-gray-500 font-medium text-left"></th>
                  {HOURS.map(h => (
                    <th key={h} className="p-1 text-[10px] text-gray-500 dark:text-gray-400 font-medium text-center min-w-[36px]">
                      {h % 3 === 0 ? formatHour(h) : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => (
                  <tr key={day}>
                    <td className="p-1 text-xs text-gray-600 dark:text-gray-300 font-medium">{day}</td>
                    {HOURS.map(h => {
                      const cell = grid[`${dayIdx}-${h}`];
                      const value = cell ? Number(cell[metric]) || 0 : 0;
                      return (
                        <td
                          key={h}
                          className={`p-0.5 text-center`}
                          title={`${day} ${formatHour(h)}: ${formatCellValue(value) || '0'}`}
                        >
                          <div className={`rounded text-[9px] font-medium py-1.5 ${getCellColor(value)}`}>
                            {formatCellValue(value)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-gray-500">
              <span>{invertColor ? 'High (Worst)' : 'Low'}</span>
              <div className="flex gap-0.5">
                <div className="w-6 h-3 rounded-sm bg-red-200 dark:bg-red-900" />
                <div className="w-6 h-3 rounded-sm bg-orange-200 dark:bg-orange-800" />
                <div className="w-6 h-3 rounded-sm bg-yellow-200 dark:bg-yellow-800" />
                <div className="w-6 h-3 rounded-sm bg-emerald-300 dark:bg-emerald-700" />
                <div className="w-6 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-600" />
              </div>
              <span>{invertColor ? 'Low (Best)' : 'High'}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400 dark:text-gray-500 text-sm">
            No hourly data available. Heatmap will populate once hourly metrics include time-of-day breakdowns.
          </div>
        )}
      </div>

      {/* Best/Worst Hours Table */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Hour */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Performance by Hour</h3>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {(() => {
                const byHour: Record<number, { leads: number; spend: number; cpl: number }> = {};
                data.forEach(d => {
                  if (!byHour[d.hour_of_day]) byHour[d.hour_of_day] = { leads: 0, spend: 0, cpl: 0 };
                  byHour[d.hour_of_day].leads += Number(d.total_leads);
                  byHour[d.hour_of_day].spend += Number(d.total_spend);
                });
                Object.entries(byHour).forEach(([_, v]) => {
                  v.cpl = v.leads > 0 ? v.spend / v.leads : 0;
                });
                return Object.entries(byHour)
                  .sort(([, a], [, b]) => b.leads - a.leads)
                  .map(([h, v]) => {
                    const Icon = getTimeIcon(Number(h));
                    const maxLeads = Math.max(...Object.values(byHour).map(v => v.leads));
                    const barWidth = maxLeads > 0 ? (v.leads / maxLeads) * 100 : 0;
                    return (
                      <div key={h} className="flex items-center gap-2 text-sm">
                        <Icon size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600 dark:text-gray-300 w-12 text-xs">{formatHour(Number(h))}</span>
                        <div className="flex-1 h-5 bg-gray-100 dark:bg-slate-700 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500 dark:bg-blue-600 rounded"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-900 dark:text-white font-medium w-8 text-right">{v.leads}</span>
                        <span className="text-[10px] text-gray-400 w-14 text-right">{v.cpl > 0 ? fmtGBP(v.cpl) : '-'}</span>
                      </div>
                    );
                  });
              })()}
            </div>
          </div>

          {/* By Day */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Performance by Day</h3>
            <div className="space-y-2">
              {(() => {
                const byDay: Record<number, { leads: number; spend: number; cpl: number }> = {};
                data.forEach(d => {
                  if (!byDay[d.day_of_week]) byDay[d.day_of_week] = { leads: 0, spend: 0, cpl: 0 };
                  byDay[d.day_of_week].leads += Number(d.total_leads);
                  byDay[d.day_of_week].spend += Number(d.total_spend);
                });
                Object.entries(byDay).forEach(([_, v]) => {
                  v.cpl = v.leads > 0 ? v.spend / v.leads : 0;
                });
                const maxLeads = Math.max(...Object.values(byDay).map(v => v.leads));
                return [1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
                  const v = byDay[dayIdx] || { leads: 0, spend: 0, cpl: 0 };
                  const barWidth = maxLeads > 0 ? (v.leads / maxLeads) * 100 : 0;
                  return (
                    <div key={dayIdx} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600 dark:text-gray-300 w-10 text-xs font-medium">{DAYS[dayIdx]}</span>
                      <div className="flex-1 h-6 bg-gray-100 dark:bg-slate-700 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 dark:bg-emerald-600 rounded"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-900 dark:text-white font-medium w-8 text-right">{v.leads}</span>
                      <span className="text-[10px] text-gray-400 w-16 text-right">{v.cpl > 0 ? fmtGBP(v.cpl) : '-'} CPL</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeOfDayHeatmap;
