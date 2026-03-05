import { create } from 'zustand';
import type {
  DateRange,
  DateRangePreset,
  PlatformFilter,
  MarketingPage,
  MarketingOverviewKPIs,
  CampaignWithMetrics,
  Campaign,
  AdLead,
} from '../types/marketing';

interface DailyDataPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number;
  roas: number;
}

interface PlatformSummary {
  platform: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  avg_cpl: number;
  avg_cpm: number;
  avg_roas: number;
}

interface MarketingStore {
  // Navigation
  currentPage: MarketingPage;
  setCurrentPage: (page: MarketingPage) => void;
  selectedCampaignId: string | null;
  setSelectedCampaignId: (id: string | null) => void;

  // Filters
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  setDatePreset: (preset: DateRangePreset) => void;
  platformFilter: PlatformFilter;
  setPlatformFilter: (filter: PlatformFilter) => void;

  // Overview data
  overviewKPIs: MarketingOverviewKPIs | null;
  dailyData: DailyDataPoint[];
  platformSummary: PlatformSummary[];
  campaignsWithMetrics: CampaignWithMetrics[];

  // Leads
  leads: AdLead[];
  leadsTotal: number;

  // Loading states
  loading: {
    overview: boolean;
    daily: boolean;
    campaigns: boolean;
    leads: boolean;
  };

  // Error state
  error: string | null;

  // Actions
  fetchOverview: () => Promise<void>;
  fetchDailyData: () => Promise<void>;
  fetchCampaignsWithMetrics: () => Promise<void>;
  fetchPlatformSummary: () => Promise<void>;
  fetchLeads: (offset?: number) => Promise<void>;
  refreshAll: () => Promise<void>;
}

function buildQueryParams(dateRange: DateRange, platformFilter: PlatformFilter): string {
  const params = new URLSearchParams();
  if (dateRange.preset !== 'custom') {
    params.set('preset', dateRange.preset);
  } else {
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
  }
  if (platformFilter !== 'all') {
    params.set('platform', platformFilter);
  }
  return params.toString();
}

export const useMarketingStore = create<MarketingStore>((set, get) => ({
  // Navigation
  currentPage: 'overview',
  setCurrentPage: (page) => set({ currentPage: page }),
  selectedCampaignId: null,
  setSelectedCampaignId: (id) => set({ selectedCampaignId: id }),

  // Filters
  dateRange: { preset: 'last_30d' },
  setDateRange: (range) => {
    set({ dateRange: range });
    get().refreshAll();
  },
  setDatePreset: (preset) => {
    set({ dateRange: { preset } });
    get().refreshAll();
  },
  platformFilter: 'all',
  setPlatformFilter: (filter) => {
    set({ platformFilter: filter });
    get().refreshAll();
  },

  // Data
  overviewKPIs: null,
  dailyData: [],
  platformSummary: [],
  campaignsWithMetrics: [],
  leads: [],
  leadsTotal: 0,

  loading: {
    overview: false,
    daily: false,
    campaigns: false,
    leads: false,
  },
  error: null,

  // Actions
  fetchOverview: async () => {
    set((s) => ({ loading: { ...s.loading, overview: true }, error: null }));
    try {
      const qs = buildQueryParams(get().dateRange, get().platformFilter);
      const res = await fetch(`/api/marketing/metrics/overview?${qs}`);
      if (!res.ok) throw new Error('Failed to fetch overview');
      const data = await res.json();
      set((s) => ({ overviewKPIs: data, loading: { ...s.loading, overview: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, overview: false } }));
    }
  },

  fetchDailyData: async () => {
    set((s) => ({ loading: { ...s.loading, daily: true } }));
    try {
      const qs = buildQueryParams(get().dateRange, get().platformFilter);
      const res = await fetch(`/api/marketing/metrics/daily?${qs}`);
      if (!res.ok) throw new Error('Failed to fetch daily data');
      const data = await res.json();
      set((s) => ({ dailyData: data, loading: { ...s.loading, daily: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, daily: false } }));
    }
  },

  fetchCampaignsWithMetrics: async () => {
    set((s) => ({ loading: { ...s.loading, campaigns: true } }));
    try {
      const qs = buildQueryParams(get().dateRange, get().platformFilter);
      const res = await fetch(`/api/marketing/metrics/by-campaign?${qs}`);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      const data = await res.json();
      set((s) => ({ campaignsWithMetrics: data, loading: { ...s.loading, campaigns: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, campaigns: false } }));
    }
  },

  fetchPlatformSummary: async () => {
    try {
      const qs = buildQueryParams(get().dateRange, get().platformFilter);
      const res = await fetch(`/api/marketing/metrics/by-platform?${qs}`);
      if (!res.ok) throw new Error('Failed to fetch platform summary');
      const data = await res.json();
      set({ platformSummary: data });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchLeads: async (offset = 0) => {
    set((s) => ({ loading: { ...s.loading, leads: true } }));
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(offset));
      if (get().platformFilter !== 'all') params.set('platform', get().platformFilter);
      const res = await fetch(`/api/marketing/leads?${params}`);
      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      set((s) => ({ leads: data.leads, leadsTotal: data.total, loading: { ...s.loading, leads: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, leads: false } }));
    }
  },

  refreshAll: async () => {
    const store = get();
    await Promise.all([
      store.fetchOverview(),
      store.fetchDailyData(),
      store.fetchCampaignsWithMetrics(),
      store.fetchPlatformSummary(),
    ]);
  },
}));
