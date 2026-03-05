import React, { useEffect, useState } from 'react';
import {
  MessageCircle, Search, Filter, RefreshCw, Phone, Mail,
  Bot, UserCircle, Clock, AlertCircle, CheckCircle2, Snowflake
} from 'lucide-react';
import { useConversationStore } from '../../stores/conversationStore';
import KPICard from './shared/KPICard';
import ConversationThread from './ConversationThread';

const CHANNEL_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  fb_messenger: { icon: 'M', color: 'bg-blue-500', label: 'Messenger' },
  instagram_dm: { icon: 'IG', color: 'bg-pink-500', label: 'Instagram' },
  whatsapp: { icon: 'WA', color: 'bg-green-500', label: 'WhatsApp' },
  email: { icon: '@', color: 'bg-gray-500', label: 'Email' },
  sms: { icon: 'SM', color: 'bg-purple-500', label: 'SMS' },
  tiktok_dm: { icon: 'TT', color: 'bg-gray-800', label: 'TikTok' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  new: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', label: 'New' },
  bot_active: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', label: 'Bot Active' },
  bot_qualifying: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', label: 'Qualifying' },
  bot_educating: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', label: 'Educating' },
  bot_converting: { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300', label: 'Converting' },
  human_needed: { color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'Needs Human' },
  human_active: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'Human Active' },
  registered: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: 'Registered' },
  nurture: { color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', label: 'Nurture' },
  cold: { color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', label: 'Cold' },
  closed: { color: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500', label: 'Closed' },
};

const FUNNEL_STAGES = ['engaged', 'qualifying', 'qualified', 'educating', 'objection_handling', 'converting', 'registered'];

const UnifiedInbox: React.FC = () => {
  const {
    conversations, selectedConversation, stats, loading, filters,
    fetchConversations, fetchStats, selectConversation, setFilter, refreshAll,
  } = useConversationStore();

  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [filters.status, filters.channel]);

  const handleSearch = () => {
    setFilter('search', searchInput);
    fetchConversations();
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard label="Total Conversations" value={String(stats.total)} icon={MessageCircle} color="blue" />
          <KPICard label="Needs Human" value={String(stats.human_needed)} icon={AlertCircle} color="pink" />
          <KPICard label="Bot Active" value={String(stats.bot_active)} icon={Bot} color="indigo" />
          <KPICard label="Registered" value={String(stats.registered)} icon={CheckCircle2} color="green" />
          <KPICard label="Nurturing" value={String(stats.nurture)} icon={Clock} color="purple" />
          <KPICard label="Avg Response" value={stats.avg_response_time > 0 ? `${Math.round(stats.avg_response_time / 60)}m` : '-'} icon={Clock} color="yellow" />
        </div>
      )}

      {/* Main Layout: Conversation List + Thread */}
      <div className="flex gap-0 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
        {/* Left: Conversation List */}
        <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 border-r border-gray-200 dark:border-slate-700 flex-shrink-0`}>
          {/* Search + Filters */}
          <div className="p-3 border-b border-gray-100 dark:border-slate-700 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search contacts..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button onClick={refreshAll} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Refresh">
                <RefreshCw size={16} className={loading.conversations ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300"
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="human_needed">Needs Human</option>
                <option value="human_active">Human Active</option>
                <option value="bot_active">Bot Active</option>
                <option value="registered">Registered</option>
                <option value="nurture">Nurture</option>
                <option value="cold">Cold</option>
              </select>
              <select
                value={filters.channel}
                onChange={(e) => setFilter('channel', e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300"
              >
                <option value="">All Channels</option>
                <option value="fb_messenger">Messenger</option>
                <option value="instagram_dm">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="tiktok_dm">TikTok</option>
              </select>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <MessageCircle size={32} className="mx-auto mb-2" />
                <p className="text-sm">No conversations found</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const ch = CHANNEL_ICONS[conv.primary_channel] || { icon: '?', color: 'bg-gray-400', label: 'Unknown' };
                const st = STATUS_CONFIG[conv.status] || STATUS_CONFIG.new;
                const isSelected = selectedConversation?.id === conv.id;
                const isUrgent = conv.status === 'human_needed';

                return (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 dark:border-slate-700/50 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                        : isUrgent
                          ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {/* Channel Icon */}
                    <div className={`w-8 h-8 rounded-full ${ch.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                      {ch.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {conv.contact_name || conv.channel_user_id || 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
                          {timeAgo(conv.last_message_at)}
                        </span>
                      </div>

                      {/* Last message preview */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {conv.last_message_sender === 'bot' && <Bot size={10} className="inline mr-1" />}
                        {conv.last_message_sender === 'human_agent' && <UserCircle size={10} className="inline mr-1" />}
                        {conv.last_message_text || 'No messages yet'}
                      </p>

                      {/* Status + Funnel badges */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {conv.qualification_score > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Score: {conv.qualification_score}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">{conv.total_messages} msgs</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Conversation Thread */}
        <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} flex-col flex-1`}>
          {selectedConversation ? (
            <ConversationThread />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
              <MessageCircle size={48} className="mb-3" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs mt-1">Choose a conversation from the list to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnifiedInbox;
