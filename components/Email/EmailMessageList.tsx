import React, { useState, useMemo } from 'react';
import { Search, Star, Paperclip, RefreshCw, Filter, Mail, ChevronRight, MessageSquare } from 'lucide-react';
import { Email, EmailFolder } from '../../types';

// A thread group: the latest email in the thread + count of all messages
interface ThreadGroup {
  threadId: string;
  latestEmail: Email;
  count: number;
  hasUnread: boolean;
  participants: string[];
}

interface EmailMessageListProps {
  emails: Email[];
  selectedEmailId: string | null;
  selectedThreadId: string | null;
  selectedFolder: EmailFolder | undefined;
  onEmailClick: (emailId: string, accountId: string) => void;
  onThreadClick: (threadId: string, latestEmailId: string, accountId: string) => void;
  onRefresh?: () => Promise<void>;
  loading?: boolean;
}

const EmailMessageList: React.FC<EmailMessageListProps> = ({
  emails,
  selectedEmailId,
  selectedThreadId,
  selectedFolder,
  onEmailClick,
  onThreadClick,
  onRefresh,
  loading,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Group emails by threadId (conversationId)
  const threadGroups = useMemo(() => {
    const groups = new Map<string, Email[]>();

    for (const email of emails) {
      const key = email.threadId || email.id; // fallback to email id if no threadId
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(email);
    }

    const result: ThreadGroup[] = [];
    for (const [threadId, threadEmails] of groups) {
      // Sort by receivedAt descending — latest first
      threadEmails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

      const latestEmail = threadEmails[0];
      const hasUnread = threadEmails.some(e => !e.isRead);

      // Collect unique participants
      const participantSet = new Set<string>();
      for (const e of threadEmails) {
        participantSet.add(e.from.name || e.from.email);
      }

      result.push({
        threadId,
        latestEmail,
        count: threadEmails.length,
        hasUnread,
        participants: Array.from(participantSet),
      });
    }

    // Sort thread groups by latest email date descending
    result.sort((a, b) => new Date(b.latestEmail.receivedAt).getTime() - new Date(a.latestEmail.receivedAt).getTime());

    return result;
  }, [emails]);

  // Filter threads by search query
  const filteredThreads = useMemo(() => {
    if (!searchQuery) return threadGroups;
    const query = searchQuery.toLowerCase();
    return threadGroups.filter(thread => {
      const email = thread.latestEmail;
      return (
        email.subject.toLowerCase().includes(query) ||
        email.from.name?.toLowerCase().includes(query) ||
        email.from.email.toLowerCase().includes(query) ||
        email.bodyText.toLowerCase().includes(query) ||
        thread.participants.some(p => p.toLowerCase().includes(query))
      );
    });
  }, [threadGroups, searchQuery]);

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
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setIsRefreshing(false);
    }
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

      {/* Email / Thread List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
            <RefreshCw size={32} className="mb-4 animate-spin opacity-40" />
            <p className="text-sm">Loading emails...</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
            <Mail size={48} className="mb-4 opacity-30" />
            <p className="text-sm">
              {searchQuery ? 'No emails match your search' : 'No emails in this folder'}
            </p>
          </div>
        ) : (
          filteredThreads.map(thread => {
            const email = thread.latestEmail;
            const isSelected = selectedThreadId === thread.threadId || selectedEmailId === email.id;
            const isThread = thread.count > 1;

            return (
              <div
                key={thread.threadId}
                onClick={() => {
                  if (isThread) {
                    onThreadClick(thread.threadId, email.id, email.accountId);
                  } else {
                    onEmailClick(email.id, email.accountId);
                  }
                }}
                className={`px-4 py-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                    : 'border-l-4 border-l-transparent'
                } ${thread.hasUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
              >
                {/* Top Row: Sender & Time */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Unread Indicator */}
                    {thread.hasUnread && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}

                    {/* Sender Name */}
                    <span className={`text-sm truncate ${
                      thread.hasUnread
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {email.from.name || email.from.email}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    {/* Thread count badge */}
                    {isThread && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                        <MessageSquare size={10} />
                        {thread.count}
                      </span>
                    )}

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
                  thread.hasUnread
                    ? 'font-medium text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {email.subject || '(No Subject)'}
                </div>

                {/* Preview */}
                <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {getPreviewText(email)}
                </div>

                {/* Thread participants (if more than one participant) */}
                {isThread && thread.participants.length > 1 && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                    <span className="truncate">
                      {thread.participants.slice(0, 3).join(', ')}
                      {thread.participants.length > 3 && ` +${thread.participants.length - 3}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer - Count */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {filteredThreads.length} conversation{filteredThreads.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>
    </div>
  );
};

export default EmailMessageList;
