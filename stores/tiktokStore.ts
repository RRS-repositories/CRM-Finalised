import { create } from 'zustand';

interface TikTokAccount {
  id: string;
  account_name: string;
  tiktok_username: string;
  tiktok_user_id: string;
  follower_count: number;
  following_count: number;
  video_count: number;
  is_active: boolean;
  last_synced: string | null;
}

interface ContentPillar {
  id: string;
  name: string;
  description: string;
  color: string;
  target_pct: number;
  is_active: boolean;
  sort_order: number;
  total_content: number;
  published_count: number;
  total_views: number;
  total_likes: number;
}

interface TikTokContent {
  id: string;
  tiktok_account_id: string;
  pillar_id: string;
  title: string;
  description: string;
  script: string;
  hook: string;
  call_to_action: string;
  hashtags: string[];
  sounds: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  published_at: string;
  format: string;
  pillar_name: string;
  pillar_color: string;
  account_name: string;
  tiktok_username: string;
}

interface ContentPipeline {
  draft: TikTokContent[];
  scripted: TikTokContent[];
  filmed: TikTokContent[];
  editing: TikTokContent[];
  scheduled: TikTokContent[];
  published: TikTokContent[];
}

interface OrganicMetric {
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers_gained: number;
  avg_watch_time: number;
  completion_rate: number;
  reach: number;
}

interface TikTokStore {
  accounts: TikTokAccount[];
  pillars: ContentPillar[];
  pipeline: ContentPipeline;
  content: TikTokContent[];
  organicMetrics: OrganicMetric[];

  loading: {
    accounts: boolean;
    pillars: boolean;
    pipeline: boolean;
    content: boolean;
    metrics: boolean;
  };
  error: string | null;

  fetchAccounts: () => Promise<void>;
  fetchPillars: () => Promise<void>;
  fetchPipeline: () => Promise<void>;
  fetchContent: (filters?: Record<string, string>) => Promise<void>;
  fetchOrganicMetrics: (accountId?: string, days?: number) => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useTikTokStore = create<TikTokStore>((set, get) => ({
  accounts: [],
  pillars: [],
  pipeline: { draft: [], scripted: [], filmed: [], editing: [], scheduled: [], published: [] },
  content: [],
  organicMetrics: [],

  loading: {
    accounts: false,
    pillars: false,
    pipeline: false,
    content: false,
    metrics: false,
  },
  error: null,

  fetchAccounts: async () => {
    set((s) => ({ loading: { ...s.loading, accounts: true } }));
    try {
      const res = await fetch('/api/marketing/tiktok/accounts');
      if (!res.ok) throw new Error('Failed to fetch TikTok accounts');
      const data = await res.json();
      set((s) => ({ accounts: data, loading: { ...s.loading, accounts: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, accounts: false } }));
    }
  },

  fetchPillars: async () => {
    set((s) => ({ loading: { ...s.loading, pillars: true } }));
    try {
      const res = await fetch('/api/marketing/tiktok/pillars');
      if (!res.ok) throw new Error('Failed to fetch pillars');
      const data = await res.json();
      set((s) => ({ pillars: data, loading: { ...s.loading, pillars: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, pillars: false } }));
    }
  },

  fetchPipeline: async () => {
    set((s) => ({ loading: { ...s.loading, pipeline: true } }));
    try {
      const res = await fetch('/api/marketing/tiktok/content/pipeline');
      if (!res.ok) throw new Error('Failed to fetch pipeline');
      const data = await res.json();
      set((s) => ({ pipeline: data, loading: { ...s.loading, pipeline: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, pipeline: false } }));
    }
  },

  fetchContent: async (filters) => {
    set((s) => ({ loading: { ...s.loading, content: true } }));
    try {
      const params = new URLSearchParams(filters || {});
      const res = await fetch(`/api/marketing/tiktok/content?${params}`);
      if (!res.ok) throw new Error('Failed to fetch content');
      const data = await res.json();
      set((s) => ({ content: data, loading: { ...s.loading, content: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, content: false } }));
    }
  },

  fetchOrganicMetrics: async (accountId, days = 30) => {
    set((s) => ({ loading: { ...s.loading, metrics: true } }));
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (accountId) params.set('account_id', accountId);
      const res = await fetch(`/api/marketing/tiktok/organic-metrics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch organic metrics');
      const data = await res.json();
      set((s) => ({ organicMetrics: data, loading: { ...s.loading, metrics: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, metrics: false } }));
    }
  },

  refreshAll: async () => {
    const store = get();
    await Promise.all([
      store.fetchAccounts(),
      store.fetchPillars(),
      store.fetchPipeline(),
      store.fetchOrganicMetrics(),
    ]);
  },
}));
