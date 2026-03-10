
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, Users, MessageSquare, Target, Building2,
  FileText, ClipboardList, Settings, Workflow, Calendar,
  Bell, Sparkles, Megaphone, Shield, ChevronDown, ChevronRight, ChevronLeft,
  Facebook, Smartphone, Mail, MessageCircle, Check, X, AlertCircle, Info, LogOut, MessagesSquare,
  LifeBuoy, Search, Sun, Moon, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ViewState } from '../types';
import { useCRM } from '../context/CRMContext';
import { API_ENDPOINTS } from '../src/config';
import SupportTicketModal from './SupportTicketModal';

interface SearchResult {
  contact_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  client_id: string;
  postal_code: string;
  claim_id: string | null;
  case_number: string | null;
  lender: string | null;
  claim_status: string | null;
  reference_specified: string | null;
}

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onToggleAI: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, onChangeView, onToggleAI }) => {
  const {
    currentUser,
    theme,
    toggleTheme,
    notifications,
    removeNotification,
    errorToasts,
    removeErrorToast,
    logout,
    persistentNotifications,
    unreadNotificationCount,
    fetchPersistentNotifications,
    markNotificationRead,
    markAllNotificationsRead
  } = useCRM();

  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [taskWorkOpen, setTaskWorkOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [offlineAgents, setOfflineAgents] = useState<{id:number;name:string;role:string;minutes_offline:number}[]>([]);
  const [offlineBannerExpanded, setOfflineBannerExpanded] = useState(false);
  const offlineBannerRef = useRef<HTMLDivElement>(null);

  // Global search state
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.api}/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setSearchOpen(true);
      }
    } catch {
      // silently fail
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => performSearch(val), 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      performSearch(searchQuery);
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    navigate(`/contacts/${result.contact_id}`);
  };

  // Live clock - update every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch persistent notifications on mount and periodically
  useEffect(() => {
    fetchPersistentNotifications();
    const interval = setInterval(() => {
      fetchPersistentNotifications();
    }, 15000); // Poll every 15s for live error notifications
    return () => clearInterval(interval);
  }, [fetchPersistentNotifications]);

  // Poll offline agents for Management users (CRM-wide, shows on every page)
  useEffect(() => {
    if (currentUser?.role !== 'Management') return;
    const fetchOffline = async () => {
      try {
        const res = await fetch(`${API_ENDPOINTS.api}/task-work/offline-agents`);
        const data = await res.json();
        setOfflineAgents(data.offlineAgents || []);
      } catch { /* silent */ }
    };
    fetchOffline();
    const interval = setInterval(fetchOffline, 30000);
    return () => clearInterval(interval);
  }, [currentUser?.role]);

  // Close offline banner on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (offlineBannerRef.current && !offlineBannerRef.current.contains(e.target as Node)) {
        setOfflineBannerExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const formatOfflineTime = (minutes: number) => {
    if (minutes >= 60) {
      const hrs = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${Math.round(minutes)}m`;
  };

  // Activity heartbeat: track mouse/keyboard activity, send heartbeat every 30s if active within last 3 min
  useEffect(() => {
    if (!currentUser?.id) return;
    let lastActivity = Date.now();

    const onActivity = () => { lastActivity = Date.now(); };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('scroll', onActivity, true);
    window.addEventListener('touchstart', onActivity);

    // Send heartbeat immediately on mount
    fetch(`${API_ENDPOINTS.api}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    }).catch(() => {});

    const heartbeatInterval = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      // Only send heartbeat if user was active in the last 3 minutes (180000ms)
      if (idleMs < 180000) {
        fetch(`${API_ENDPOINTS.api}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        }).catch(() => {});
      }
    }, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity, true);
      window.removeEventListener('touchstart', onActivity);
      clearInterval(heartbeatInterval);
    };
  }, [currentUser?.id]);

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
    if (
      currentView === ViewState.TASK_WORK_DASHBOARD ||
      currentView === ViewState.TASK_WORK_ASSIGNER
    ) {
      setTaskWorkOpen(true);
    }
  }, [currentView]);

  const emailAllowedRoles = ['Management', 'Admin', 'Payments'];
  const canAccessEmail = currentUser && emailAllowedRoles.includes(currentUser.role);

  const conversationSubItems = [
    { id: ViewState.CONVERSATIONS_FACEBOOK, label: 'Facebook', icon: Facebook },
    { id: ViewState.CONVERSATIONS_WHATSAPP, label: 'WhatsApp', icon: MessageCircle },
    { id: ViewState.CONVERSATIONS_SMS, label: 'SMS', icon: Smartphone },
    ...(canAccessEmail ? [{ id: ViewState.CONVERSATIONS_EMAIL, label: 'Email', icon: Mail }] : []),
  ];

  const mainNavItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.PIPELINE, label: 'Cases', icon: Target },
    { id: ViewState.CONTACTS, label: 'Contacts', icon: Users },
    { id: ViewState.CALENDAR, label: 'Calendar', icon: Calendar },
    { id: ViewState.MARKETING, label: 'Marketing', icon: Megaphone },
    { id: ViewState.DOCUMENTS, label: 'Docs & Templates', icon: FileText },
    { id: ViewState.FORMS, label: 'Forms', icon: ClipboardList },
    { id: ViewState.WORKFLOW, label: 'Automation', icon: Workflow },
  ];

  if (currentUser?.role === 'Management') {
    mainNavItems.push({ id: ViewState.MANAGEMENT, label: 'Management', icon: Shield });
  }

  const bottomNavItems = [
    { id: ViewState.LENDERS, label: 'Accounts', icon: Building2 },
    { id: ViewState.MATTERMOST, label: 'Mattermost', icon: MessagesSquare },
    { id: ViewState.SETTINGS, label: 'Settings', icon: Settings },
  ];

  const renderNavItem = (item: any) => {
    const isActive = currentView === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onChangeView(item.id as ViewState)}
        title={sidebarCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 transition-all duration-200 relative group rounded-lg mx-2
          ${sidebarCollapsed ? 'px-3 py-3 justify-center' : 'px-4 py-2.5'}
          ${isActive
            ? 'bg-brand-orange/10 text-brand-orange'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }
        `}
        style={{ width: sidebarCollapsed ? 'calc(100% - 16px)' : 'calc(100% - 16px)' }}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-orange rounded-r-full" />
        )}
        <item.icon size={20} className="shrink-0" />
        {!sidebarCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
      </button>
    );
  };

  const isConversationActive = [
    ViewState.CONVERSATIONS_ALL,
    ViewState.CONVERSATIONS_FACEBOOK,
    ViewState.CONVERSATIONS_WHATSAPP,
    ViewState.CONVERSATIONS_SMS,
    ViewState.CONVERSATIONS_EMAIL
  ].includes(currentView);

  const isTaskWorkActive = [
    ViewState.TASK_WORK_DASHBOARD,
    ViewState.TASK_WORK_ASSIGNER
  ].includes(currentView);

  const taskWorkSubItems = [
    { id: ViewState.TASK_WORK_DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.TASK_WORK_ASSIGNER, label: 'Task Assigner', icon: Users },
  ];

  // Format live clock
  const formatClock = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = currentTime;
    const day = days[d.getDay()];
    const date = d.getDate();
    const month = months[d.getMonth()];
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day}, ${date} ${month} • ${hours}:${mins}`;
  };

  // Get page title
  const getPageTitle = () => {
    const subItem = conversationSubItems.find(i => i.id === currentView);
    if (subItem) return `Conversations > ${subItem.label}`;
    if (currentView === ViewState.CONVERSATIONS_ALL) return 'Conversations > All Chats';
    const taskWorkSub = taskWorkSubItems.find(i => i.id === currentView);
    if (taskWorkSub) return `Task Work > ${taskWorkSub.label}`;
    if (currentView === ViewState.MY_TASKS) return 'My Tasks';
    const navItem = allNavItems(mainNavItems, bottomNavItems).find(i => i.id === currentView);
    if (navItem?.label === 'Cases') return 'Claims Pipeline';
    return navItem?.label || 'Dashboard';
  };

  return (
    <div className={`flex h-screen overflow-hidden font-sans ${theme}`}>
      {/* Sidebar - always dark */}
      <aside
        className={`${sidebarCollapsed ? 'w-[72px]' : 'w-64'} bg-[#0f1219] text-white transition-all duration-300 flex flex-col shadow-2xl z-20 relative`}
      >
        {/* Brand */}
        <div className={`h-16 flex items-center border-b border-white/5 flex-shrink-0 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-5'}`}>
          <img src="/rr-logo.png" alt="Logo" className="w-9 h-9 rounded-full shadow-lg shadow-brand-orange/20 shrink-0" />
          {!sidebarCollapsed && (
            <div className="animate-fade-in">
              <p className="font-serif text-lg tracking-tight text-white leading-tight">Rowan Rose</p>
              <p className="text-[10px] text-brand-orange uppercase tracking-[0.2em] font-medium">Solicitors</p>
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-[#1c2333] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-brand-orange/20 transition-all z-30 shadow-lg"
        >
          {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 sidebar-scroll">
          {mainNavItems.slice(0, 4).map(renderNavItem)}

          {/* Collapsible Conversations Menu */}
          <div>
            <div
              className={`w-full flex items-center justify-between transition-all duration-200 cursor-pointer group rounded-lg mx-2
                ${sidebarCollapsed ? 'px-3 py-3 justify-center' : 'px-4 py-2.5'}
                ${isConversationActive
                  ? 'bg-brand-orange/10 text-brand-orange'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
              `}
              style={{ width: 'calc(100% - 16px)' }}
            >
              {isConversationActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-orange rounded-r-full" />
              )}
              <div
                className="flex items-center gap-3 flex-1"
                onClick={() => {
                  if (isConversationActive && conversationsOpen) {
                    setConversationsOpen(false);
                  } else {
                    onChangeView(ViewState.CONVERSATIONS_ALL);
                    setConversationsOpen(true);
                  }
                }}
              >
                <MessageSquare size={20} className="shrink-0" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Conversations</span>}
              </div>
              {!sidebarCollapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConversationsOpen(!conversationsOpen);
                  }}
                  className="p-1 rounded hover:bg-white/10"
                >
                  {conversationsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              )}
            </div>

            {/* Sub-menu items */}
            {!sidebarCollapsed && (
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${conversationsOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                {conversationSubItems.map(subItem => (
                  <button
                    key={subItem.id}
                    onClick={() => onChangeView(subItem.id)}
                    className={`w-full flex items-center pl-14 pr-4 py-2 text-xs font-medium transition-all duration-200 rounded-r-lg
                      ${currentView === subItem.id
                        ? 'text-brand-orange bg-brand-orange/5'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}
                    `}
                  >
                    <subItem.icon size={14} className="mr-3 opacity-80" />
                    {subItem.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mainNavItems.slice(4).map(renderNavItem)}

          {/* Tasks (Admin only - view assigned tasks) */}
          {currentUser?.role === 'Admin' && renderNavItem({ id: ViewState.MY_TASKS, label: 'Tasks', icon: ClipboardList })}

          {/* Collapsible Task Work Menu (Management only) */}
          {currentUser?.role === 'Management' && (
            <div>
              <div
                className={`w-full flex items-center justify-between transition-all duration-200 cursor-pointer group rounded-lg mx-2
                  ${sidebarCollapsed ? 'px-3 py-3 justify-center' : 'px-4 py-2.5'}
                  ${isTaskWorkActive
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
                `}
                style={{ width: 'calc(100% - 16px)' }}
              >
                {isTaskWorkActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-orange rounded-r-full" />
                )}
                <div
                  className="flex items-center gap-3 flex-1"
                  onClick={() => {
                    if (isTaskWorkActive && taskWorkOpen) {
                      setTaskWorkOpen(false);
                    } else {
                      onChangeView(ViewState.TASK_WORK_DASHBOARD);
                      setTaskWorkOpen(true);
                    }
                  }}
                >
                  <ClipboardList size={20} className="shrink-0" />
                  {!sidebarCollapsed && <span className="text-sm font-medium">Task Work</span>}
                </div>
                {!sidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTaskWorkOpen(!taskWorkOpen);
                    }}
                    className="p-1 rounded hover:bg-white/10"
                  >
                    {taskWorkOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>

              {/* Task Work Sub-menu items */}
              {!sidebarCollapsed && (
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${taskWorkOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                  {taskWorkSubItems.map(subItem => (
                    <button
                      key={subItem.id}
                      onClick={() => onChangeView(subItem.id)}
                      className={`w-full flex items-center pl-14 pr-4 py-2 text-xs font-medium transition-all duration-200 rounded-r-lg
                        ${currentView === subItem.id
                          ? 'text-brand-orange bg-brand-orange/5'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}
                      `}
                    >
                      <subItem.icon size={14} className="mr-3 opacity-80" />
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-white/5 flex-shrink-0">
          {/* Bottom nav items */}
          <div className="py-2 space-y-1">
            {renderNavItem(bottomNavItems[0])}
            {renderNavItem(bottomNavItems[1])}
          </div>

          {/* User Profile */}
          <div className={`border-t border-white/5 ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${currentUser?.role === 'Management' ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-blue-500 to-blue-700'}`}>
                  {currentUser?.fullName.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{currentUser?.fullName || 'User'}</p>
                  <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-400">
                    {currentUser?.role || 'Agent'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ${currentUser?.role === 'Management' ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-blue-500 to-blue-700'}`}>
                  {currentUser?.fullName.charAt(0) || 'U'}
                </div>
              </div>
            )}

            {/* Sign Out */}
            <button
              onClick={logout}
              title={sidebarCollapsed ? 'Sign Out' : undefined}
              className={`w-full flex items-center gap-3 transition-all duration-200 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg mt-3
                ${sidebarCollapsed ? 'px-3 py-2.5 justify-center' : 'px-4 py-2.5'}
              `}
            >
              <LogOut size={18} className="shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 bg-white dark:bg-surface-800 border-b border-gray-200 dark:border-white/5 flex items-center justify-between px-6 z-[100] shrink-0 relative">
          {/* Left: Title + Badge */}
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {getPageTitle()}
            </h2>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Real-time Data</span>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden md:flex items-center flex-1 max-w-lg mx-8" ref={searchRef}>
            <div className="relative w-full">
              {searchLoading ? (
                <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              ) : (
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                placeholder="Search by name, email, phone, postcode, lender, status..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange/50 transition-all"
              />

              {/* Search Results Dropdown */}
              {searchOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-[200] max-h-80 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      No results found for "{searchQuery}"
                    </div>
                  ) : (
                    searchResults.map((r, idx) => (
                      <button
                        key={`${r.contact_id}-${r.claim_id || idx}`}
                        onClick={() => handleSelectResult(r)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-semibold text-brand-orange">
                                {r.client_id || `RR-${r.contact_id}`}
                                {r.claim_id ? `/${r.contact_id}${r.claim_id}` : ''}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {r.lender && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {r.lender}
                                </span>
                              )}
                              {r.claim_status && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                  {r.claim_status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Clock, Notifications, Profile */}
          <div className="flex items-center gap-3">
            {/* Date/Time */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <Calendar size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{formatClock()}</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-white transition-all"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <div className="relative w-5 h-5">
                <Sun
                  size={20}
                  className={`absolute inset-0 transition-all duration-300 ${
                    theme === 'dark' ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
                  }`}
                />
                <Moon
                  size={20}
                  className={`absolute inset-0 transition-all duration-300 ${
                    theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
                  }`}
                />
              </div>
            </button>

            {/* AI Trigger */}
            <button
              onClick={onToggleAI}
              className="flex items-center gap-2 bg-gradient-to-r from-brand-orange to-yellow-500 text-white px-4 py-2 rounded-full shadow-md shadow-brand-orange/20 hover:shadow-lg hover:shadow-brand-orange/30 transition-all active:scale-95 group"
            >
              <Sparkles size={14} className="group-hover:animate-pulse" />
              <span className="text-xs font-semibold hidden sm:inline">AI Assistant</span>
            </button>

            <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-white transition-all"
              >
                <Bell size={20} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 border-white dark:border-surface-800 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {notificationDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[200]"
                    onClick={() => setNotificationDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 z-[201] overflow-hidden animate-scale-in">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-surface-900">
                      <h3 className="font-semibold text-gray-800 dark:text-white">Notifications</h3>
                      {unreadNotificationCount > 0 && (
                        <button
                          onClick={() => markAllNotificationsRead()}
                          className="text-xs text-brand-orange hover:text-brand-orange/80 font-medium transition-colors"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {persistentNotifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          <Bell size={32} className="mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No notifications yet</p>
                        </div>
                      ) : (
                        persistentNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => {
                              if (!notification.isRead) {
                                markNotificationRead(notification.id);
                              }
                              if (notification.type === 'action_error' && notification.contactId) {
                                window.open(`/contacts/${notification.contactId}`, '_blank');
                              } else if (notification.link) {
                                if (notification.link.includes('calendar')) {
                                  onChangeView(ViewState.CALENDAR);
                                } else if (notification.link.includes('contact')) {
                                  onChangeView(ViewState.CONTACTS);
                                }
                              }
                              setNotificationDropdownOpen(false);
                            }}
                            className={`px-4 py-3 border-b border-gray-100 dark:border-white/5 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/5 ${
                              notification.type === 'action_error' && !notification.isRead
                                ? 'bg-red-50 dark:bg-red-900/20'
                                : (!notification.isRead ? 'bg-brand-orange/5 dark:bg-brand-orange/5' : '')
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-full shrink-0 ${
                                notification.type === 'action_error' ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' :
                                notification.type === 'task_assigned' ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' :
                                notification.type === 'meeting_scheduled' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' :
                                notification.type === 'follow_up_due' ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' :
                                notification.type === 'task_completed' ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' :
                                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                              }`}>
                                {notification.type === 'action_error' && <AlertCircle size={14} />}
                                {notification.type === 'task_assigned' && <Users size={14} />}
                                {notification.type === 'meeting_scheduled' && <Calendar size={14} />}
                                {notification.type === 'follow_up_due' && <AlertCircle size={14} />}
                                {notification.type === 'task_completed' && <Check size={14} />}
                              </div>

                              <div className="flex-1 min-w-0">
                                {notification.type === 'action_error' && notification.contactName ? (
                                  <p className={`text-sm ${!notification.isRead ? 'font-semibold text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {notification.contactName} <span className="font-normal text-gray-500 dark:text-gray-400 text-xs">#{notification.contactId}</span>
                                  </p>
                                ) : (
                                  <p className={`text-sm ${!notification.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {notification.title}
                                  </p>
                                )}
                                {notification.message && (
                                  <p className={`text-xs mt-0.5 line-clamp-2 ${
                                    notification.type === 'action_error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                                  }`}>
                                    {notification.message}
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                  {formatNotificationTime(notification.createdAt)}
                                </p>
                              </div>

                              {!notification.isRead && (
                                <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${
                                  notification.type === 'action_error' ? 'bg-red-500' : 'bg-brand-orange'
                                }`} />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {persistentNotifications.length > 0 && (
                      <div className="px-4 py-2 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-surface-900">
                        <button
                          onClick={() => {
                            window.open('/notifications', '_blank');
                            setNotificationDropdownOpen(false);
                          }}
                          className="w-full text-center text-xs text-brand-orange hover:text-brand-orange/80 font-medium py-1 transition-colors"
                        >
                          View Full List →
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <div
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 p-1.5 rounded-lg transition-all"
                onClick={() => { setProfileDropdownOpen(!profileDropdownOpen); setNotificationDropdownOpen(false); }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${currentUser?.role === 'Management' ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-blue-500 to-blue-700'}`}>
                  {currentUser?.fullName.charAt(0) || 'U'}
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">{currentUser?.fullName || 'User'}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{currentUser?.role || 'Guest'}</p>
                </div>
              </div>

              {profileDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 z-50 overflow-hidden animate-scale-in">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{currentUser?.fullName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser?.email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { onChangeView(ViewState.SETTINGS); setProfileDropdownOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                      >
                        <Settings className="w-4 h-4 text-gray-400" />
                        Settings
                      </button>
                      <button
                        onClick={() => { setProfileDropdownOpen(false); setTicketModalOpen(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                      >
                        <LifeBuoy className="w-4 h-4 text-brand-orange" />
                        Raise Support Ticket
                      </button>
                      <button
                        onClick={() => { setProfileDropdownOpen(false); logout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Offline Agents Banner - Management only, compact ticker */}
        {currentUser?.role === 'Management' && offlineAgents.length > 0 && (
          <div ref={offlineBannerRef} className="relative bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20">
            <div
              className="flex items-center gap-2 px-4 py-1.5 cursor-pointer select-none"
              onClick={() => setOfflineBannerExpanded(prev => !prev)}
            >
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                {offlineAgents.length} agent{offlineAgents.length !== 1 ? 's' : ''} inactive
              </span>
              <div className="flex-1 overflow-hidden">
                <div className="flex gap-3 text-xs text-red-600 dark:text-red-400 truncate">
                  {offlineAgents.slice(0, 5).map(a => (
                    <span key={a.id} className="whitespace-nowrap">
                      {a.name.split(' ')[0]} <span className="text-red-400 dark:text-red-500">({formatOfflineTime(a.minutes_offline)})</span>
                    </span>
                  ))}
                  {offlineAgents.length > 5 && <span className="text-red-400">+{offlineAgents.length - 5} more</span>}
                </div>
              </div>
              <ChevronDown size={14} className={`text-red-400 transition-transform shrink-0 ${offlineBannerExpanded ? 'rotate-180' : ''}`} />
            </div>
            {offlineBannerExpanded && (
              <div className="absolute left-0 right-0 top-full z-50 bg-white dark:bg-surface-800 border border-red-200 dark:border-red-500/20 rounded-b-xl shadow-lg max-h-60 overflow-auto">
                {offlineAgents.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-white/5 last:border-b-0">
                    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 flex-1">{a.name} <span className="text-gray-400">({a.role})</span></span>
                    <span className={`text-xs font-bold ${a.minutes_offline >= 60 ? 'text-red-600 dark:text-red-400' : 'text-orange-500 dark:text-orange-400'}`}>
                      {formatOfflineTime(a.minutes_offline)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content View Port */}
        <main className="flex-1 overflow-auto bg-gray-100 dark:bg-surface-900 relative">
          {children}
        </main>

        {/* Notification Toast Container */}
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`
                pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border w-80 backdrop-blur-sm
                transition-all duration-500 transform
                ${n.isExiting ? 'translate-x-full opacity-0' : 'animate-slide-in'}
                ${n.type === 'success' ? 'bg-white/95 dark:bg-surface-800/95 border-emerald-500 text-gray-800 dark:text-gray-100' : ''}
                ${n.type === 'error' ? 'bg-white/95 dark:bg-surface-800/95 border-red-500 text-gray-800 dark:text-gray-100' : ''}
                ${n.type === 'info' ? 'bg-white/95 dark:bg-surface-800/95 border-blue-500 text-gray-800 dark:text-gray-100' : ''}
              `}
            >
              <div className={`
                  p-1.5 rounded-full shrink-0
                  ${n.type === 'success' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : ''}
                  ${n.type === 'error' ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : ''}
                  ${n.type === 'info' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : ''}
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
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Error Notification Toasts */}
        {errorToasts.length > 0 && (
          <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-3 pointer-events-none">
            {errorToasts.map((toast) => (
              <div
                key={toast.id}
                onClick={() => {
                  if (toast.contactId) {
                    window.open(`/contacts/${toast.contactId}`, '_blank');
                  }
                  markNotificationRead(toast.id);
                  removeErrorToast(toast.id);
                }}
                className={`
                  pointer-events-auto cursor-pointer w-96 p-4 rounded-xl shadow-2xl border-l-4 border-red-500
                  bg-white dark:bg-surface-800 backdrop-blur-sm
                  transition-all duration-500 transform
                  ${toast.isExiting ? 'translate-x-full opacity-0' : 'animate-slide-in'}
                  hover:shadow-xl hover:scale-[1.01]
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {toast.contactName} <span className="font-normal text-gray-500 dark:text-gray-400 text-xs">#{toast.contactId}</span>
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">
                      {toast.message}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Click to open contact</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeErrorToast(toast.id); }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Support Ticket Modal */}
        <SupportTicketModal isOpen={ticketModalOpen} onClose={() => setTicketModalOpen(false)} />
      </div>
    </div>
  );
};

// Helper for title lookup
const allNavItems = (a: any[], b: any[]) => [...a, ...b];

// Helper to format notification time
const formatNotificationTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default Layout;
