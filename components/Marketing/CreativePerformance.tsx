import React, { useEffect, useState } from 'react';
import { RefreshCw, Image, Film, LayoutGrid, List, Search } from 'lucide-react';
import { useMarketingStore } from '../../stores/marketingStore';
import DataTable, { type Column } from './shared/DataTable';
import PlatformBadge from './shared/PlatformBadge';

const fmtGBP = (n: number) => `\u00A3${Number(n).toFixed(2)}`;
const fmtNum = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

interface CreativeWithMetrics {
  id: string;
  platform: string;
  type: string;
  headline: string;
  body_text: string;
  call_to_action: string;
  image_url: string;
  video_url: string;
  thumbnail_url: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  avg_ctr: number;
  avg_cpl: number;
  avg_roas: number;
  created_at: string;
}

const CreativePerformance: React.FC = () => {
  const { platformFilter } = useMarketingStore();
  const [creatives, setCreatives] = useState<CreativeWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const fetchCreatives = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/marketing/ads/creatives/list?${params}`);
      if (res.ok) setCreatives(await res.json());
    } catch (err) {
      console.error('Creatives fetch error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCreatives();
  }, [platformFilter, typeFilter]);

  const filtered = creatives.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      return (c.headline || '').toLowerCase().includes(q) || (c.body_text || '').toLowerCase().includes(q);
    }
    return true;
  });

  const tableColumns: Column<CreativeWithMetrics>[] = [
    {
      key: 'headline',
      label: 'Creative',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {(row.thumbnail_url || row.image_url) ? (
              <img src={row.thumbnail_url || row.image_url} alt="" className="w-full h-full object-cover" />
            ) : row.type === 'video' ? (
              <Film size={16} className="text-gray-400" />
            ) : (
              <Image size={16} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-[200px]">{row.headline || 'Untitled'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <PlatformBadge platform={row.platform} />
              <span className="text-[10px] text-gray-400 uppercase">{row.type}</span>
            </div>
          </div>
        </div>
      ),
    },
    { key: 'total_spend', label: 'Spend', align: 'right', render: (row) => fmtGBP(row.total_spend) },
    { key: 'total_impressions', label: 'Impr.', align: 'right', render: (row) => fmtNum(row.total_impressions) },
    { key: 'total_clicks', label: 'Clicks', align: 'right', render: (row) => fmtNum(row.total_clicks) },
    { key: 'avg_ctr', label: 'CTR', align: 'right', render: (row) => `${Number(row.avg_ctr).toFixed(2)}%` },
    { key: 'total_leads', label: 'Leads', align: 'right', render: (row) => String(Number(row.total_leads)) },
    { key: 'avg_cpl', label: 'CPL', align: 'right', render: (row) => Number(row.total_leads) > 0 ? fmtGBP(row.avg_cpl) : '-' },
    { key: 'avg_roas', label: 'ROAS', align: 'right', render: (row) => `${Number(row.avg_roas).toFixed(2)}x` },
  ];

  if (loading && !creatives.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading creatives...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search creatives..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="carousel">Carousel</option>
          </select>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded ${view === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}
          >
            <LayoutGrid size={14} className="text-gray-500" />
          </button>
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded ${view === 'table' ? 'bg-white dark:bg-slate-700 shadow-sm' : ''}`}
          >
            <List size={14} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.length > 0 ? filtered.map((cr) => (
            <div key={cr.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Thumbnail */}
              <div className="aspect-square bg-gray-100 dark:bg-slate-700 flex items-center justify-center relative">
                {(cr.thumbnail_url || cr.image_url) ? (
                  <img src={cr.thumbnail_url || cr.image_url} alt="" className="w-full h-full object-cover" />
                ) : cr.type === 'video' ? (
                  <Film size={32} className="text-gray-300" />
                ) : (
                  <Image size={32} className="text-gray-300" />
                )}
                <div className="absolute top-2 left-2">
                  <PlatformBadge platform={cr.platform} />
                </div>
                <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-white uppercase">
                  {cr.type}
                </span>
              </div>

              {/* Details */}
              <div className="p-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{cr.headline || 'Untitled'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{cr.call_to_action || ''}</p>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Spend</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{fmtGBP(cr.total_spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">CTR</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{Number(cr.avg_ctr).toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">CPL</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      {Number(cr.total_leads) > 0 ? fmtGBP(cr.avg_cpl) : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-full flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
              No creatives found. Creatives will appear here once synced from your ad platforms.
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <DataTable
            columns={tableColumns}
            data={filtered}
            defaultSortKey="total_spend"
            defaultSortDir="desc"
            rowKey={(row) => row.id}
            emptyMessage="No creatives found. Creatives will appear here once synced from your ad platforms."
            compact
          />
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Showing {filtered.length} creatives. Toggle grid/table view above.
      </p>
    </div>
  );
};

export default CreativePerformance;
