
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, Filter, Send, Paperclip, MoreVertical, Phone, Video, 
  MessageCircle, Mail, Smartphone, Image as ImageIcon,
  FileText, Mic, Check, CheckCheck, RefreshCw, X, Facebook,
  ExternalLink, Calendar, DollarSign, Building2, Tag, Link as LinkIcon
} from 'lucide-react';
import { MOCK_CONVERSATIONS } from '../constants';
import { Platform, Conversation, Message, MessageAttachment } from '../types';
import { useCRM } from '../context/CRMContext';

const PlatformIcon = ({ platform, size = 16, className = "" }: { platform: Platform, size?: number, className?: string }) => {
  switch (platform) {
    case 'whatsapp': return <MessageCircle size={size} className={`text-green-500 ${className}`} />;
    case 'email': return <Mail size={size} className={`text-blue-500 ${className}`} />;
    case 'sms': return <Smartphone size={size} className={`text-slate-500 ${className}`} />;
    case 'facebook': return <Facebook size={size} className={`text-blue-600 ${className}`} />;
    default: return <MessageCircle size={size} className={className} />;
  }
};

interface ConversationsProps {
   platformFilter?: Platform | 'all';
}

const Conversations: React.FC<ConversationsProps> = ({ platformFilter = 'all' }) => {
  const { contacts } = useCRM();
  // Using Mock Data directly as no backend service exists for this demo
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  
  // State for active conversation
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [messageInput, setMessageInput] = useState('');
  const [mediaTab, setMediaTab] = useState<'images' | 'docs' | 'audio' | 'video'>('images');
  const [loading, setLoading] = useState(false);
  
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Refs for scrolling to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Filter conversations based on prop and search
  const filteredConversations = conversations.filter(c => {
    const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
    const matchesSearch = 
       c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) || 
       c.lastMessage.text.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  // Automatically select first conversation if list changes or filter changes
  useEffect(() => {
     if (filteredConversations.length > 0 && (!selectedId || !filteredConversations.find(c => c.id === selectedId))) {
        setSelectedId(filteredConversations[0].id);
     } else if (filteredConversations.length === 0) {
        setSelectedId(null);
     }
  }, [platformFilter, filteredConversations.length]); // Depend on length change to re-select

  const selectedConversation = conversations.find(c => c.id === selectedId);
  
  // Map conversation to Contact based on internal ID or Name match
  const relatedContact = selectedConversation ? (contacts.find(c => {
    if (c.id === selectedConversation.contactId) return true;
    return c.fullName.trim().toLowerCase() === selectedConversation.contactName.trim().toLowerCase();
  }) || contacts.find(c => c.id === selectedConversation.contactId)) : undefined;

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConversation?.id, selectedConversation?.messages.length]);

  const loadConversations = async () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setConversations(MOCK_CONVERSATIONS);
      setLoading(false);
    }, 500);
  };

  const handleSendMessage = async () => {
     if (!messageInput.trim()) return;
     
     const currentConv = conversations.find(c => c.id === selectedId);
     if (!currentConv) return;
  
     const newMessage: Message = {
        id: `temp_${Date.now()}`,
        sender: 'agent',
        text: messageInput,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        platform: currentConv.platform,
        status: 'sent'
     };
  
     const updatedConvs = conversations.map(c => {
        if (c.id === selectedId) {
           return {
              ...c,
              messages: [...c.messages, newMessage],
              lastMessage: newMessage
           };
        }
        return c;
     });
     setConversations(updatedConvs);
     setMessageInput('');
  };

  if (!selectedConversation && filteredConversations.length === 0) {
     return (
        <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400">
           <div className="text-center">
              <MessageCircle size={48} className="mx-auto mb-4 opacity-20" />
              <p>No conversations found for {platformFilter === 'all' ? 'any platform' : platformFilter}.</p>
           </div>
        </div>
     );
  }

  // Safe fallback if selection logic hasn't run yet but data exists
  const activeConversation = selectedConversation || filteredConversations[0];
  if (!activeConversation) return null;

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* 1. Left Panel: Contact List */}
      <div className="w-[300px] border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
           <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-navy-900 dark:text-white text-lg capitalize">
                 {platformFilter === 'all' ? 'Inbox' : `${platformFilter} Chats`}
              </h2>
              <button 
                 onClick={loadConversations}
                 className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`}
                 title="Refresh Messages"
              >
                 <RefreshCw size={16} />
              </button>
           </div>
           
           <div className="relative mb-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 text-gray-900 dark:text-white placeholder:text-gray-400"
              />
           </div>
        </div>
        
        {/* Infinite Scroll List */}
        <div 
          className="flex-1 overflow-y-auto"
          ref={sidebarRef}
        >
           {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                 No conversations found.
              </div>
           ) : (
             filteredConversations.map(conv => (
               <div 
                 key={conv.id}
                 onClick={() => setSelectedId(conv.id)}
                 className={`p-4 border-b border-gray-50 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors relative ${activeConversation.id === conv.id ? 'bg-blue-50/50 dark:bg-slate-700/50 border-l-4 border-l-brand-orange' : 'border-l-4 border-l-transparent'}`}
               >
                  <div className="flex justify-between items-start mb-1">
                     <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-navy-100 dark:bg-slate-700 flex items-center justify-center text-navy-700 dark:text-white font-bold overflow-hidden border border-gray-200 dark:border-slate-600 shrink-0">
                           {conv.avatar ? (
                              <img 
                                src={conv.avatar} 
                                alt={conv.contactName} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback if image fails to load
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerText = conv.contactName.charAt(0);
                                }} 
                              />
                           ) : conv.contactName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                           <h3 className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-navy-900 dark:text-white' : 'font-medium text-gray-900 dark:text-gray-300'}`}>{conv.contactName}</h3>
                           <div className="flex items-center gap-1 text-xs text-gray-400">
                              <PlatformIcon platform={conv.platform} size={12} />
                              <span className="capitalize">{conv.platform}</span>
                           </div>
                        </div>
                     </div>
                     <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{conv.lastMessage.timestamp}</span>
                  </div>
                  <p className={`text-xs mt-2 line-clamp-1 ${conv.unreadCount > 0 ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                     {conv.lastMessage.sender === 'user' ? 'You: ' : ''}{conv.lastMessage.text}
                  </p>
                  {conv.unreadCount > 0 && (
                     <span className="absolute right-4 bottom-4 bg-brand-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {conv.unreadCount}
                     </span>
                  )}
               </div>
             ))
           )}
        </div>
      </div>

      {/* 2. Center Panel: Message Thread */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 min-w-0">
         {/* Thread Header */}
         <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center font-bold text-sm overflow-hidden border border-gray-200 dark:border-slate-600 shrink-0">
                  {activeConversation.avatar ? (
                     <img src={activeConversation.avatar} alt="" className="w-full h-full object-cover" />
                  ) : activeConversation.contactName.charAt(0)}
               </div>
               <div>
                  <h3 className="font-bold text-navy-900 dark:text-white text-sm flex items-center gap-2">
                     {activeConversation.contactName}
                     {relatedContact && <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 font-medium">CRM Linked</span>}
                  </h3>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                     <PlatformIcon platform={activeConversation.platform} size={12} className="mr-1" />
                     via {activeConversation.platform}
                  </div>
               </div>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
               <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"><Phone size={18} /></button>
               <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"><Video size={18} /></button>
               <button className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"><MoreVertical size={18} /></button>
            </div>
         </div>

         {/* Messages */}
         <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={chatContainerRef}>
            {activeConversation.messages.map((msg, idx) => (
               <div key={msg.id || idx} className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex flex-col gap-1 max-w-[70%]">
                     <div className={`rounded-2xl px-4 py-3 shadow-sm text-sm ${
                        msg.sender === 'agent' 
                        ? 'bg-navy-700 text-white rounded-tr-none' 
                        : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-slate-700'
                     }`}>
                        {/* Text Content */}
                        {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                        {/* Attachments */}
                        {msg.attachments?.map((att, i) => (
                           <div key={i} className="mt-2 p-2 bg-black/10 rounded flex items-center gap-2">
                              <Paperclip size={14} />
                              <span className="text-xs truncate">{att.name}</span>
                           </div>
                        ))}

                        <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${msg.sender === 'agent' ? 'text-gray-300' : 'text-gray-400'}`}>
                           {msg.timestamp}
                           {msg.sender === 'agent' && (
                              msg.status === 'read' ? <CheckCheck size={12} /> : <Check size={12} />
                           )}
                        </div>
                     </div>
                  </div>
               </div>
            ))}
            <div ref={messagesEndRef} />
         </div>

         {/* Input Area */}
         <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
            <div className="flex gap-2">
               <button className="p-3 text-gray-400 hover:text-navy-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
                  <Paperclip size={20} />
               </button>
               <input 
                  type="text" 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={`Reply via ${activeConversation.platform}...`}
                  className="flex-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 transition-shadow text-gray-900 dark:text-white placeholder:text-gray-400"
               />
               <button 
                  onClick={handleSendMessage}
                  className="bg-navy-700 hover:bg-navy-800 text-white p-3 rounded-xl transition-colors shadow-md shadow-navy-200"
               >
                  <Send size={18} />
               </button>
            </div>
         </div>
      </div>

      {/* 3. Right Panel: Contact & Media */}
      <div className="w-[320px] border-l border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col hidden xl:flex">
         <div className="p-6 border-b border-gray-100 dark:border-slate-700 text-center">
            <div className="w-20 h-20 rounded-full bg-navy-50 dark:bg-slate-700 text-navy-700 dark:text-white text-2xl font-bold flex items-center justify-center mx-auto mb-3 overflow-hidden border border-gray-200 dark:border-slate-600 shrink-0">
               {activeConversation.avatar ? (
                  <img src={activeConversation.avatar} alt="" className="w-full h-full object-cover" />
               ) : activeConversation.contactName.charAt(0)}
            </div>
            <h2 className="font-bold text-lg text-navy-900 dark:text-white">{activeConversation.contactName}</h2>
            
            {/* Dynamic Contact Details from CRM */}
            <div className="mt-2 space-y-1">
               <p className="text-sm text-gray-500 dark:text-gray-400">{relatedContact?.email || 'No email associated'}</p>
               <p className="text-sm text-gray-500 dark:text-gray-400">{relatedContact?.phone || 'No phone associated'}</p>
            </div>

            {relatedContact ? (
                <div className="mt-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700 text-left space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><LinkIcon size={12}/> Source:</span>
                        <span className="font-medium text-navy-900 dark:text-white">{relatedContact.source}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><Building2 size={12}/> Lender:</span>
                        <span className="font-medium text-navy-900 dark:text-white">{relatedContact.lender}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><DollarSign size={12}/> Value:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">£{relatedContact.claimValue}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><Tag size={12}/> Status:</span>
                        <span className="font-medium text-brand-orange">{relatedContact.status}</span>
                    </div>
                </div>
            ) : (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 text-xs rounded-lg border border-yellow-100 dark:border-yellow-900">
                   Contact not fully linked in CRM.
                </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 mt-6">
               <button className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors">
                  <FileText size={14} /> Create Note
               </button>
               <button className="flex items-center justify-center gap-2 py-2 px-3 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors">
                  <Calendar size={14} /> Schedule Call
               </button>
            </div>
         </div>

         {/* Media Gallery */}
         <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 pb-0">
               <h3 className="font-bold text-sm text-navy-900 dark:text-white mb-3">Media Gallery</h3>
               <div className="flex border-b border-gray-200 dark:border-slate-700">
                  <button 
                    onClick={() => setMediaTab('images')}
                    className={`flex-1 pb-2 text-xs font-medium transition-colors border-b-2 ${mediaTab === 'images' ? 'text-brand-orange border-brand-orange' : 'text-gray-400 border-transparent hover:text-navy-600 dark:hover:text-gray-200'}`}
                  >
                     Images
                  </button>
                  <button 
                    onClick={() => setMediaTab('docs')}
                    className={`flex-1 pb-2 text-xs font-medium transition-colors border-b-2 ${mediaTab === 'docs' ? 'text-brand-orange border-brand-orange' : 'text-gray-400 border-transparent hover:text-navy-600 dark:hover:text-gray-200'}`}
                  >
                     Docs
                  </button>
                  <button 
                    onClick={() => setMediaTab('audio')}
                    className={`flex-1 pb-2 text-xs font-medium transition-colors border-b-2 ${mediaTab === 'audio' ? 'text-brand-orange border-brand-orange' : 'text-gray-400 border-transparent hover:text-navy-600 dark:hover:text-gray-200'}`}
                  >
                     Audio
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
               {mediaTab === 'images' && (
                  <div className="grid grid-cols-2 gap-3">
                     {activeConversation.mediaGallery.images.map((img, i) => (
                        <div key={i} className="aspect-square bg-gray-200 dark:bg-slate-700 rounded-lg relative overflow-hidden group cursor-pointer border border-gray-200 dark:border-slate-600">
                           {img.url && !img.url.startsWith('#') ? (
                              <img src={img.url} alt={img.name} className="w-full h-full object-contain p-1" />
                           ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100 dark:bg-slate-800">
                                 <ImageIcon size={24} />
                              </div>
                           )}
                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-xs font-medium px-2 text-center">{img.name}</span>
                           </div>
                        </div>
                     ))}
                     {activeConversation.mediaGallery.images.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No images found</p>}
                  </div>
               )}

               {mediaTab === 'docs' && (
                  <div className="space-y-2">
                     {activeConversation.mediaGallery.documents.map((doc, i) => (
                        <div key={i} className="flex items-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                           <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg mr-3">
                              <FileText size={16} />
                           </div>
                           <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{doc.name}</p>
                              <p className="text-[10px] text-gray-400">{doc.size}</p>
                           </div>
                        </div>
                     ))}
                     {activeConversation.mediaGallery.documents.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No documents found</p>}
                  </div>
               )}

               {mediaTab === 'audio' && (
                  <div className="space-y-2">
                     {activeConversation.mediaGallery.audio.map((aud, i) => (
                        <div key={i} className="flex items-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                           <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-lg mr-3">
                              <Mic size={16} />
                           </div>
                           <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{aud.name}</p>
                              <p className="text-[10px] text-gray-400">{aud.size}</p>
                           </div>
                        </div>
                     ))}
                     {activeConversation.mediaGallery.audio.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No audio files found</p>}
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default Conversations;
