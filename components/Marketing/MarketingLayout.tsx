import React from 'react';
import { useMarketingStore } from '../../stores/marketingStore';
import DateRangePicker from './shared/DateRangePicker';
import FilterBar from './shared/FilterBar';
import type { MarketingPage } from '../../types/marketing';
import {
  LayoutDashboard, Megaphone, Palette, Users, Wallet, Brain,
  Swords, MapPin, Clock, Heart, Music2, Flame, Layers,
  MessageCircle, Radio, GitMerge, PieChart, Building2, ShieldCheck,
  Inbox, Bot, Forward, Lightbulb, RefreshCw
} from 'lucide-react';

interface NavItem {
  id: MarketingPage;
  label: string;
  icon: React.ElementType;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  // Core
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Core' },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, group: 'Core' },
  { id: 'creatives', label: 'Creatives', icon: Palette, group: 'Core' },
  { id: 'leads', label: 'Leads', icon: Users, group: 'Core' },
  { id: 'spend-budget', label: 'Spend & Budget', icon: Wallet, group: 'Core' },
  { id: 'ai-centre', label: 'AI Centre', icon: Brain, group: 'Core' },
  // Strategy
  { id: 'creative-war-room', label: 'Creative War Room', icon: Swords, group: 'Strategy' },
  { id: 'placement', label: 'Placement', icon: MapPin, group: 'Strategy' },
  { id: 'time-of-day', label: 'Time of Day', icon: Clock, group: 'Strategy' },
  { id: 'emotional-cycle', label: 'Emotional Cycle', icon: Heart, group: 'Strategy' },
  // TikTok
  { id: 'tiktok-command', label: 'TikTok Command', icon: Music2, group: 'TikTok' },
  { id: 'spark-pipeline', label: 'Spark Ads', icon: Flame, group: 'TikTok' },
  { id: 'content-pillars', label: 'Content Pillars', icon: Layers, group: 'TikTok' },
  { id: 'comment-engagement', label: 'Comments', icon: MessageCircle, group: 'TikTok' },
  { id: 'live-streams', label: 'Live Streams', icon: Radio, group: 'TikTok' },
  // Cross-Platform
  { id: 'blended-performance', label: 'Blended CPL', icon: GitMerge, group: 'Analytics' },
  { id: 'roi-by-source', label: 'ROI by Source', icon: PieChart, group: 'Analytics' },
  { id: 'lender-performance', label: 'Lender Intel', icon: Building2, group: 'Analytics' },
  { id: 'credential-health', label: 'Credentials', icon: ShieldCheck, group: 'Analytics' },
  // Comms
  { id: 'unified-inbox', label: 'Unified Inbox', icon: Inbox, group: 'Comms' },
  { id: 'bot-performance', label: 'Bot Performance', icon: Bot, group: 'Comms' },
  { id: 'followup-performance', label: 'Follow-ups', icon: Forward, group: 'Comms' },
  { id: 'conversation-intelligence', label: 'Conv. Intel', icon: Lightbulb, group: 'Comms' },
];

const MarketingLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentPage, setCurrentPage,
    dateRange, setDatePreset, setDateRange,
    platformFilter, setPlatformFilter,
    refreshAll, loading,
  } = useMarketingStore();

  // Group nav items
  const groups = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const isRefreshing = Object.values(loading).some(Boolean);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors">
      {/* Top Bar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marketing</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Ad Performance & Lead Management</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refreshAll()}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw size={14} className={`text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <FilterBar platformFilter={platformFilter} onPlatformChange={setPlatformFilter} />
            <DateRangePicker
              preset={dateRange.preset}
              onPresetChange={setDatePreset}
              customFrom={dateRange.from}
              customTo={dateRange.to}
              onCustomChange={(from, to) => setDateRange({ preset: 'custom', from, to })}
            />
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex gap-6 border-b border-gray-200 dark:border-slate-700 overflow-x-auto pb-0 scrollbar-hide">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName} className="flex gap-1 items-end">
              <span className="text-[9px] font-bold text-gray-300 dark:text-slate-600 uppercase tracking-wider mr-1 pb-2.5 hidden xl:block">
                {groupName}
              </span>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentPage(item.id)}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-2.5 pb-2.5 pt-1 text-xs font-medium transition-colors border-b-2 whitespace-nowrap ${
                      isActive
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {children}
      </div>
    </div>
  );
};

export default MarketingLayout;
