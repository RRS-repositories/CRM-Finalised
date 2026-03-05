import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Send, Bot, UserCircle, Phone, Mail,
  ExternalLink, HandMetal, MoreVertical, Clock,
  CheckCircle2, AlertCircle, Snowflake, ChevronDown
} from 'lucide-react';
import { useConversationStore } from '../../stores/conversationStore';

const CHANNEL_LABELS: Record<string, string> = {
  fb_messenger: 'Messenger',
  instagram_dm: 'Instagram DM',
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
  tiktok_dm: 'TikTok DM',
};

const FUNNEL_STAGES = [
  { key: 'engaged', label: 'Engaged', color: 'bg-blue-500' },
  { key: 'qualifying', label: 'Qualifying', color: 'bg-cyan-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-indigo-500' },
  { key: 'educating', label: 'Educating', color: 'bg-purple-500' },
  { key: 'objection_handling', label: 'Objections', color: 'bg-amber-500' },
  { key: 'converting', label: 'Converting', color: 'bg-orange-500' },
  { key: 'registered', label: 'Registered', color: 'bg-emerald-500' },
];

const ConversationThread: React.FC = () => {
  const {
    selectedConversation, messages, loading,
    selectConversation, sendMessage, takeOver, updateConversation,
  } = useConversationStore();

  const [messageInput, setMessageInput] = useState('');
  const [showActions, setShowActions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!selectedConversation) return null;

  const conv = selectedConversation;
  const currentStageIndex = FUNNEL_STAGES.findIndex(s => s.key === conv.funnel_stage);

  const handleSend = () => {
    if (!messageInput.trim()) return;
    sendMessage(conv.id, messageInput);
    setMessageInput('');
  };

  const handleTakeOver = () => {
    takeOver(conv.id, 'agent');
    setShowActions(false);
  };

  const handleStatusChange = (status: string) => {
    updateConversation(conv.id, { status } as any);
    setShowActions(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        {/* Back button (mobile) */}
        <button
          onClick={() => selectConversation(null)}
          className="md:hidden p-1 text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {conv.contact_name || conv.channel_user_id || 'Unknown Contact'}
            </h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
              {CHANNEL_LABELS[conv.primary_channel] || conv.primary_channel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {conv.contact_phone && (
              <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{conv.contact_phone}</span>
            )}
            {conv.contact_email && (
              <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{conv.contact_email}</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {conv.status === 'human_needed' && (
            <button
              onClick={handleTakeOver}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <HandMetal size={12} /> Take Over
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <MoreVertical size={16} />
            </button>
            {showActions && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-20 py-1">
                <button
                  onClick={handleTakeOver}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <HandMetal size={14} /> Take Over
                </button>
                <button
                  onClick={() => handleStatusChange('registered')}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <CheckCircle2 size={14} /> Mark Registered
                </button>
                <button
                  onClick={() => handleStatusChange('cold')}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Snowflake size={14} /> Mark Cold
                </button>
                <button
                  onClick={() => handleStatusChange('closed')}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <AlertCircle size={14} /> Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Funnel Progress */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-1">
          {FUNNEL_STAGES.map((stage, i) => {
            const isActive = i <= currentStageIndex;
            const isCurrent = stage.key === conv.funnel_stage;
            return (
              <React.Fragment key={stage.key}>
                <div className="flex flex-col items-center flex-1" title={stage.label}>
                  <div className={`w-full h-1.5 rounded-full ${isActive ? stage.color : 'bg-gray-200 dark:bg-slate-700'}`} />
                  {isCurrent && (
                    <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{stage.label}</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">Score: {conv.qualification_score}/100</span>
          <span className="text-[10px] text-gray-400">{conv.total_messages} messages | Bot: {conv.bot_messages} | Human: {conv.human_messages}</span>
        </div>
      </div>

      {/* Qualification Sidebar (compact) */}
      {conv.qualification_data && Object.keys(conv.qualification_data).length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-900/10">
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase mb-1">Qualification Data</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {Object.entries(conv.qualification_data).map(([key, val]) => (
              <span key={key} className="text-[11px] text-gray-600 dark:text-gray-400">
                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span> {String(val)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading.messages ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin text-gray-400"><Clock size={20} /></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => {
            const isInbound = msg.direction === 'inbound';
            const isBot = msg.sender_type === 'bot';

            return (
              <div key={msg.id} className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] ${isInbound ? '' : ''}`}>
                  {/* Sender label */}
                  <div className={`flex items-center gap-1 mb-0.5 ${isInbound ? '' : 'justify-end'}`}>
                    {isInbound ? (
                      <span className="text-[10px] text-gray-400">
                        {conv.contact_name || 'Lead'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        {isBot ? <Bot size={9} /> : <UserCircle size={9} />}
                        {isBot ? 'Bot' : 'Agent'}
                      </span>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={`px-3 py-2 rounded-xl text-sm ${
                    isInbound
                      ? 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-tl-sm'
                      : isBot
                        ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100 rounded-tr-sm'
                        : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.message_text}</p>

                    {/* Quick replies / Buttons */}
                    {msg.quick_replies && Array.isArray(msg.quick_replies) && msg.quick_replies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {msg.quick_replies.map((qr: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs border border-current opacity-70">
                            {qr.text}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.buttons && Array.isArray(msg.buttons) && msg.buttons.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2">
                        {msg.buttons.map((btn: any, i: number) => (
                          <span key={i} className="px-3 py-1 rounded-lg text-xs border border-current text-center opacity-70">
                            {btn.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp + delivery status */}
                  <div className={`flex items-center gap-1 mt-0.5 ${isInbound ? '' : 'justify-end'}`}>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isInbound && msg.delivery_status && (
                      <span className="text-[10px] text-gray-400">
                        {msg.delivery_status === 'read' ? '✓✓' : msg.delivery_status === 'delivered' ? '✓✓' : msg.delivery_status === 'sent' ? '✓' : msg.delivery_status === 'failed' ? '✗' : ''}
                      </span>
                    )}
                    {msg.bot_intent_detected && (
                      <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-1">
                        [{msg.bot_intent_detected}]
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!messageInput.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversationThread;
