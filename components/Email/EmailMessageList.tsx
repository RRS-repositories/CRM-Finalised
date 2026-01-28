import React, { useState } from 'react';
import { Search, Star, Paperclip, RefreshCw, Filter, Mail } from 'lucide-react';
import { Email, EmailFolder } from '../../types';

interface EmailMessageListProps {
  emails: Email[];
  selectedEmailId: string | null;
  selectedFolder: EmailFolder | undefined;
  onEmailClick: (emailId: string) => void;
}

const EmailMessageList: React.FC<EmailMessageListProps> = ({
  emails,
  selectedEmailId,
  selectedFolder,
  onEmailClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter emails by search query
  const filteredEmails = emails.filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject.toLowerCase().includes(query) ||
      email.from.name?.toLowerCase().includes(query) ||
      email.from.email.toLowerCase().includes(query) ||
      email.bodyText.toLowerCase().includes(query)
    );
  });

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate refresh
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Get preview text (first 100 chars of body)
  const getPreviewText = (email: Email) => {
    const text = email.bodyText.replace(/\n/g, ' ').trim();
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  };

  return (
    <div className="w-[320px] flex flex-col bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-navy-900 dark:text-white">
            {selectedFolder?.displayName || 'Inbox'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className={`p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors"
              title="Filter"
            >
              <Filter size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
            <Mail size={48} className="mb-4 opacity-30" />
            <p className="text-sm">
              {searchQuery ? 'No emails match your search' : 'No emails in this folder'}
            </p>
          </div>
        ) : (
          filteredEmails.map(email => (
            <div
              key={email.id}
              onClick={() => onEmailClick(email.id)}
              className={`px-4 py-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                selectedEmailId === email.id
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                  : 'border-l-4 border-l-transparent'
              } ${!email.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
            >
              {/* Top Row: Sender & Time */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Unread Indicator */}
                  {!email.isRead && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}

                  {/* Sender Name */}
                  <span className={`text-sm truncate ${
                    email.isRead
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'font-semibold text-gray-900 dark:text-white'
                  }`}>
                    {email.from.name || email.from.email}
                  </span>
                </div>

                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  {/* Star */}
                  {email.isStarred && (
                    <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  )}

                  {/* Attachment */}
                  {email.hasAttachments && (
                    <Paperclip size={14} className="text-gray-400" />
                  )}

                  {/* Time */}
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatRelativeTime(email.receivedAt)}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className={`text-sm mb-1 truncate ${
                email.isRead
                  ? 'text-gray-600 dark:text-gray-400'
                  : 'font-medium text-gray-900 dark:text-white'
              }`}>
                {email.subject || '(No Subject)'}
              </div>

              {/* Preview */}
              <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {getPreviewText(email)}
              </div>

              {/* Attachments Count */}
              {email.attachments && email.attachments.length > 0 && (
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                  <Paperclip size={12} />
                  <span>{email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer - Count */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {filteredEmails.length} email{filteredEmails.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>
    </div>
  );
};

export default EmailMessageList;
