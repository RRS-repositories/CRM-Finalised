
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, MessageSquare, Target, Building2,
  FileText, ClipboardList, Settings, Workflow, Calendar,
  Bell, Sparkles, Megaphone, Shield, ChevronDown, ChevronRight, ChevronLeft,
  Facebook, Smartphone, Mail, MessageCircle, Check, X, AlertCircle, Info, LogOut, MessagesSquare,
  LifeBuoy, Search, Sun, Moon
} from 'lucide-react';
import { ViewState } from '../types';
import { useCRM } from '../context/CRMContext';
import SupportTicketModal from './SupportTicketModal';

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
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

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
          <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange/50 transition-all"
              />
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
