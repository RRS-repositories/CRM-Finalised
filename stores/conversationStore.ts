import { create } from 'zustand';

interface Conversation {
  id: string;
  lead_id: string | null;
  crm_client_id: number | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  primary_channel: string;
  channel_user_id: string;
  status: string;
  funnel_stage: string;
  bot_stage: number;
  qualification_data: Record<string, any>;
  qualification_score: number;
  objections_raised: string[];
  source_platform: string;
  total_messages: number;
  bot_messages: number;
  human_messages: number;
  assigned_to: string;
  last_message_at: string;
  last_message_text?: string;
  last_message_sender?: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  sender_type: string;
  channel: string;
  message_type: string;
  message_text: string;
  media_url: string | null;
  buttons: any[] | null;
  quick_replies: any[] | null;
  bot_intent_detected: string;
  bot_confidence: number;
  delivery_status: string;
  created_at: string;
}

interface ConversationStats {
  total: number;
  new_count: number;
  bot_active: number;
  human_needed: number;
  human_active: number;
  registered: number;
  nurture: number;
  cold_count: number;
  qualifying: number;
  converting: number;
  avg_response_time: number;
  avg_messages: number;
}

interface ConversationStore {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  stats: ConversationStats | null;

  loading: {
    conversations: boolean;
    messages: boolean;
    stats: boolean;
  };
  error: string | null;

  filters: {
    status: string;
    channel: string;
    search: string;
  };

  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  selectConversation: (conversation: Conversation | null) => void;
  setFilter: (key: 'status' | 'channel' | 'search', value: string) => void;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  takeOver: (conversationId: string, assignedTo: string) => Promise<void>;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  selectedConversation: null,
  messages: [],
  stats: null,

  loading: { conversations: false, messages: false, stats: false },
  error: null,

  filters: { status: '', channel: '', search: '' },

  fetchConversations: async () => {
    set((s) => ({ loading: { ...s.loading, conversations: true } }));
    try {
      const { filters } = get();
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.channel) params.set('channel', filters.channel);
      if (filters.search) params.set('search', filters.search);

      const res = await fetch(`/api/marketing/conversations?${params}`);
      if (!res.ok) throw new Error('Failed to fetch conversations');
      const data = await res.json();
      set((s) => ({ conversations: data, loading: { ...s.loading, conversations: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, conversations: false } }));
    }
  },

  fetchMessages: async (conversationId) => {
    set((s) => ({ loading: { ...s.loading, messages: true } }));
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      set((s) => ({ messages: data, loading: { ...s.loading, messages: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, messages: false } }));
    }
  },

  fetchStats: async () => {
    set((s) => ({ loading: { ...s.loading, stats: true } }));
    try {
      const res = await fetch('/api/marketing/conversations/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      set((s) => ({ stats: data, loading: { ...s.loading, stats: false } }));
    } catch (err: any) {
      set((s) => ({ error: err.message, loading: { ...s.loading, stats: false } }));
    }
  },

  selectConversation: (conversation) => {
    set({ selectedConversation: conversation, messages: [] });
    if (conversation) get().fetchMessages(conversation.id);
  },

  setFilter: (key, value) => {
    set((s) => ({ filters: { ...s.filters, [key]: value } }));
  },

  sendMessage: async (conversationId, text) => {
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: text }),
      });
      if (res.ok) {
        get().fetchMessages(conversationId);
        get().fetchConversations();
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  takeOver: async (conversationId, assignedTo) => {
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/take-over`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo }),
      });
      if (res.ok) {
        const data = await res.json();
        set({ selectedConversation: data });
        get().fetchConversations();
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateConversation: async (conversationId, updates) => {
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        set({ selectedConversation: data });
        get().fetchConversations();
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  refreshAll: async () => {
    const store = get();
    await Promise.all([
      store.fetchConversations(),
      store.fetchStats(),
    ]);
  },
}));
