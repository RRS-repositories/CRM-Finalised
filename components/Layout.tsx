
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, MessageSquare, Target, Building2,
  FileText, ClipboardList, Settings, Workflow, Calendar,
  Bell, Sparkles, Megaphone, Shield, ChevronDown, ChevronRight,
  Facebook, Smartphone, Mail, MessageCircle, Check, X, AlertCircle, Info
} from 'lucide-react';
import { ViewState } from '../types';
import { useCRM } from '../context/CRMContext';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onToggleAI: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, onToggleAI }) => {
  const { currentUser, theme, notifications, removeNotification } = useCRM();

  // State for collapsible menus
  const [conversationsOpen, setConversationsOpen] = useState(false);

  // Auto-expand menu if a sub-item is active
  useEffect(() => {
    if (
      currentView === ViewState.CONVERSATIONS_ALL ||
      currentView === ViewState.CONVERSATIONS_FACEBOOK ||
      currentView === ViewState.CONVERSATIONS_WHATSAPP ||
      currentView === ViewState.CONVERSATIONS_SMS ||
      currentView === ViewState.CONVERSATIONS_EMAIL
    ) {
      setConversationsOpen(true);
    }
  }, [currentView]);

  const conversationSubItems = [
    // 'All Chats' removed from sub-menu, now accessed via parent click
    { id: ViewState.CONVERSATIONS_FACEBOOK, label: 'Facebook', icon: Facebook },
    { id: ViewState.CONVERSATIONS_WHATSAPP, label: 'WhatsApp', icon: MessageCircle },
    { id: ViewState.CONVERSATIONS_SMS, label: 'SMS', icon: Smartphone },
    { id: ViewState.CONVERSATIONS_EMAIL, label: 'Email', icon: Mail },
  ];

  const mainNavItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.PIPELINE, label: 'Cases', icon: Target },
    { id: ViewState.CONTACTS, label: 'Contacts', icon: Users },
    { id: ViewState.CALENDAR, label: 'Calendar', icon: Calendar },
    // Conversations is handled separately due to sub-menu
    { id: ViewState.MARKETING, label: 'Marketing', icon: Megaphone },
    { id: ViewState.DOCUMENTS, label: 'Docs & Templates', icon: FileText },
    { id: ViewState.FORMS, label: 'Forms', icon: ClipboardList },
    { id: ViewState.WORKFLOW, label: 'Automation', icon: Workflow },
  ];

  // Only add Management tab if current user is Management
  if (currentUser?.role === 'Management') {
    mainNavItems.push({ id: ViewState.MANAGEMENT, label: 'Management', icon: Shield });
  }

  const bottomNavItems = [
    { id: ViewState.LENDERS, label: 'Accounts', icon: Building2 },
    { id: ViewState.SETTINGS, label: 'Settings', icon: Settings },
  ];

  const renderNavItem = (item: any) => (
    <button
      key={item.id}
      onClick={() => onChangeView(item.id as ViewState)}
      className={`w-full flex items-center px-4 py-3 transition-colors relative group
        ${currentView === item.id ? 'bg-navy-800 text-brand-orange border-r-4 border-brand-orange dark:bg-navy-800' : 'text-gray-400 hover:bg-navy-800 hover:text-white'}
      `}
    >
      <item.icon size={20} className="mr-3" />
      <span className="text-sm font-medium">{item.label}</span>
    </button>
  );

  const isConversationActive = [
    ViewState.CONVERSATIONS_ALL,
    ViewState.CONVERSATIONS_FACEBOOK,
    ViewState.CONVERSATIONS_WHATSAPP,
    ViewState.CONVERSATIONS_SMS,
    ViewState.CONVERSATIONS_EMAIL
  ].includes(currentView);

  return (
    <div className={`flex h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden font-sans ${theme}`}>
      {/* Sidebar */}
      <aside
        className="w-64 bg-navy-900 text-white transition-all duration-300 flex flex-col shadow-xl z-20 dark:bg-navy-950"
      >
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-navy-800 flex-shrink-0">
          <img src="/rr-logo.png" alt="Logo" className="w-8 h-8 rounded-full shadow-lg" />
          <div className="font-serif text-lg tracking-tight text-white leading-tight">
            Rowan Rose<br />
            <span className="text-[10px] text-brand-orange uppercase tracking-[0.2em]">Solicitors</span>
          </div>
        </div>

        {/* Main Navigation (Scrollable) */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 hide-scrollbar">
          {mainNavItems.slice(0, 4).map(renderNavItem)}

          {/* Collapsible Conversations Menu */}
          <div>
            <div
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors cursor-pointer group
                   ${isConversationActive ? 'bg-navy-800 text-brand-orange border-r-4 border-brand-orange dark:bg-navy-800' : 'text-gray-400 hover:bg-navy-800 hover:text-white'}
                `}
            >
              <div
                className="flex items-center flex-1"
                onClick={() => {
                  if (isConversationActive && conversationsOpen) {
                    setConversationsOpen(false);
                  } else {
                    onChangeView(ViewState.CONVERSATIONS_ALL);
                    setConversationsOpen(true);
                  }
                }}
              >
                <MessageSquare size={20} className="mr-3" />
                <span className="text-sm font-medium">Conversations</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConversationsOpen(!conversationsOpen);
                }}
                className="p-1 rounded hover:bg-navy-700/50"
              >
                {conversationsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>

            {/* Sub-menu items */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${conversationsOpen ? 'max-h-64 opacity-100 bg-navy-950/50' : 'max-h-0 opacity-0'}`}>
              {conversationSubItems.map(subItem => (
                <button
                  key={subItem.id}
                  onClick={() => onChangeView(subItem.id)}
                  className={`w-full flex items-center pl-12 pr-4 py-2.5 text-xs font-medium transition-colors
                         ${currentView === subItem.id ? 'text-brand-orange bg-navy-800' : 'text-gray-400 hover:text-white hover:bg-navy-800/50'}
                      `}
                >
                  <subItem.icon size={14} className="mr-3 opacity-80" />
                  {subItem.label}
                </button>
              ))}
            </div>
          </div>

          {mainNavItems.slice(4).map(renderNavItem)}
        </nav>

        {/* Bottom Navigation (Fixed) */}
        <div className="py-2 border-t border-navy-800 space-y-1 flex-shrink-0">
          {bottomNavItems.map(renderNavItem)}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
              {conversationSubItems.find(i => i.id === currentView)?.label
                ? `Conversations > ${conversationSubItems.find(i => i.id === currentView)?.label}`
                : currentView === ViewState.CONVERSATIONS_ALL
                  ? 'Conversations > All Chats'
                  : allNavItems(mainNavItems, bottomNavItems).find(i => i.id === currentView)?.label === 'Cases'
                    ? 'Claims Pipeline'
                    : allNavItems(mainNavItems, bottomNavItems).find(i => i.id === currentView)?.label || 'Overview'}
            </h2>
          </div>

          <div className="flex items-center space-x-4">
            {/* AI Trigger */}
            <button
              onClick={onToggleAI}
              className="flex items-center gap-2 bg-gradient-to-r from-navy-700 to-navy-900 text-white px-4 py-2 rounded-full shadow-md hover:shadow-lg transition-all active:scale-95 group"
            >
              <Sparkles size={16} className="text-brand-orange group-hover:animate-pulse" />
              <span className="text-sm font-medium">Ask Assistant</span>
            </button>

            <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>

            <button className="text-gray-500 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-slate-800"></span>
            </button>

            <div className="flex items-center gap-3 pl-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 p-1 rounded-lg transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${currentUser?.role === 'Management' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                {currentUser?.fullName.charAt(0) || 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{currentUser?.fullName || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{currentUser?.role || 'Guest'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content View Port */}
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 relative">
          {children}
        </main>

        {/* Notification Toast Container */}
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`
                pointer-events-auto flex items-center gap-3 p-4 rounded-lg shadow-lg border w-80
                transition-all duration-500 transform
                ${n.isExiting ? 'translate-x-full opacity-0' : 'animate-slide-in'}
                ${n.type === 'success' ? 'bg-white dark:bg-slate-800 border-green-500 text-gray-800 dark:text-gray-100' : ''}
                ${n.type === 'error' ? 'bg-white dark:bg-slate-800 border-red-500 text-gray-800 dark:text-gray-100' : ''}
                ${n.type === 'info' ? 'bg-white dark:bg-slate-800 border-blue-500 text-gray-800 dark:text-gray-100' : ''}
              `}
            >
              <div className={`
                  p-1.5 rounded-full shrink-0
                  ${n.type === 'success' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : ''}
                  ${n.type === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : ''}
                  ${n.type === 'info' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}
               `}>
                {n.type === 'success' && <Check size={16} strokeWidth={3} />}
                {n.type === 'error' && <AlertCircle size={16} strokeWidth={2.5} />}
                {n.type === 'info' && <Info size={16} strokeWidth={2.5} />}
              </div>
              <div className="flex-1 text-sm font-medium">
                {n.message}
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper for title lookup
const allNavItems = (a: any[], b: any[]) => [...a, ...b];

export default Layout;
