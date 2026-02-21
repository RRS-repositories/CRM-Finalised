
import React, { useEffect } from 'react';
import {
  Bell, AlertCircle, Users, Calendar, Check, ArrowLeft, CheckCheck
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';

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
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const Notifications: React.FC = () => {
  const {
    persistentNotifications,
    unreadNotificationCount,
    fetchPersistentNotifications,
    markNotificationRead,
    markAllNotificationsRead
  } = useCRM();

  useEffect(() => {
    fetchPersistentNotifications();
  }, [fetchPersistentNotifications]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'action_error': return <AlertCircle size={18} />;
      case 'task_assigned': return <Users size={18} />;
      case 'meeting_scheduled': return <Calendar size={18} />;
      case 'follow_up_due': return <AlertCircle size={18} />;
      case 'task_completed': return <Check size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const getIconStyle = (type: string) => {
    switch (type) {
      case 'action_error': return 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400';
      case 'task_assigned': return 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400';
      case 'meeting_scheduled': return 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400';
      case 'follow_up_due': return 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400';
      case 'task_completed': return 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  };

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.history.back()}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-gray-500 dark:text-gray-400"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} unread notification${unreadNotificationCount !== 1 ? 's' : ''}`
                  : 'All caught up'}
              </p>
            </div>
          </div>
          {unreadNotificationCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-orange hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
            >
              <CheckCheck size={16} />
              Mark all as read
            </button>
          )}
        </div>

        {/* Notification List */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          {persistentNotifications.length === 0 ? (
            <div className="px-6 py-16 text-center text-gray-500 dark:text-gray-400">
              <Bell size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No notifications yet</p>
              <p className="text-sm mt-1">You're all caught up!</p>
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
                  }
                }}
                className={`px-6 py-4 border-b border-gray-100 dark:border-slate-700 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-slate-700/50 ${
                  notification.type === 'action_error' && !notification.isRead
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : (!notification.isRead ? 'bg-orange-50/50 dark:bg-orange-900/10' : '')
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-full shrink-0 ${getIconStyle(notification.type)}`}>
                    {getIcon(notification.type)}
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
                      <p className={`text-sm mt-1 ${
                        notification.type === 'action_error' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                      {formatNotificationTime(notification.createdAt)}
                    </p>
                  </div>

                  {!notification.isRead && (
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-2 ${
                      notification.type === 'action_error' ? 'bg-red-500' : 'bg-brand-orange'
                    }`} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
