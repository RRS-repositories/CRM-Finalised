import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Search, Star, Paperclip, RefreshCw, Filter, Mail, MessageSquare, Trash2, MailOpen, MailX, CheckSquare, Square, Loader2, GripVertical } from 'lucide-react';
import { Email, EmailFolder } from '../../types';

interface ThreadGroup {
  threadId: string;
  latestEmail: Email;
  count: number;
  hasUnread: boolean;
  participants: string[];
  allEmailIds: string[];
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
  // Bulk selection
  selectedEmailIds: Set<string>;
  onToggleSelectEmail: (emailId: string) => void;
  onSelectAll: (emailIds: string[]) => void;
  onDeselectAll: () => void;
  onBulkDelete: () => void;
  onBulkMarkRead: () => void;
  onBulkMarkUnread: () => void;
  onBulkMove: (destinationFolderId: string) => void;
  // Infinite scroll
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  totalCount: number | null;
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
  selectedEmailIds,
  onToggleSelectEmail,
  onSelectAll,
  onDeselectAll,
  onBulkDelete,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkMove,
  hasMore,
  loadingMore,
  onLoadMore,
  totalCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [draggedEmailIds, setDraggedEmailIds] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Group emails by threadId
  const threadGroups = useMemo(() => {
    const groups = new Map<string, Email[]>();

    for (const email of emails) {
      const key = email.threadId || email.id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(email);
    }

    const result: ThreadGroup[] = [];
    for (const [threadId, threadEmails] of groups) {
      threadEmails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

      const latestEmail = threadEmails[0];
      const hasUnread = threadEmails.some(e => !e.isRead);

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
        allEmailIds: threadEmails.map(e => e.id),
      });
    }

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

  // Infinite scroll - Intersection Observer
  useEffect(() => {
    if (!loadMoreTriggerRef.current || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );

    observer.observe(loadMoreTriggerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

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

  const getPreviewText = (email: Email) => {
    const text = email.bodyText.replace(/\n/g, ' ').trim();
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  };

  // Check if any thread's emails are selected
  const isThreadSelected = (thread: ThreadGroup) => {
    return thread.allEmailIds.some(id => selectedEmailIds.has(id));
  };

  // Check if all visible threads are selected
  const allSelected = filteredThreads.length > 0 && filteredThreads.every(t => isThreadSelected(t));

  // Handle select all toggle
  const handleSelectAllToggle = () => {
    if (allSelected) {
      onDeselectAll();
    } else {
      const allIds = filteredThreads.flatMap(t => t.allEmailIds);
      onSelectAll(allIds);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, thread: ThreadGroup) => {
    const ids = isThreadSelected(thread)
      ? Array.from(selectedEmailIds)
      : thread.allEmailIds;
    setDraggedEmailIds(ids);

    // Set drag data
    e.dataTransfer.setData('application/json', JSON.stringify({
      emailIds: ids,
      accountId: thread.latestEmail.accountId,
    }));
    e.dataTransfer.effectAllowed = 'move';

    // Custom drag image
    const dragEl = document.createElement('div');
    dragEl.className = 'bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium';
    dragEl.textContent = ids.length === 1 ? '1 email' : `${ids.length} emails`;
    dragEl.style.position = 'absolute';
    dragEl.style.top = '-1000px';
    document.body.appendChild(dragEl);
    e.dataTransfer.setDragImage(dragEl, 0, 0);
    setTimeout(() => document.body.removeChild(dragEl), 0);
  };

  const handleDragEnd = () => {
    setDraggedEmailIds([]);
  };

  const hasSelection = selectedEmailIds.size > 0;

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

      {/* Bulk Action Toolbar */}
      {hasSelection && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 flex items-center gap-2">
          <button
            onClick={handleSelectAllToggle}
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400"
            title={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 mr-auto">
            {selectedEmailIds.size} selected
          </span>
          <button
            onClick={onBulkMarkRead}
            className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400"
            title="Mark as read"
          >
            <MailOpen size={14} />
          </button>
          <button
            onClick={onBulkMarkUnread}
            className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400"
            title="Mark as unread"
          >
            <MailX size={14} />
          </button>
          <button
            onClick={onBulkDelete}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400"
            title="Delete selected"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Select All Row (when no selection active) */}
      {!hasSelection && filteredThreads.length > 0 && !loading && (
        <div className="px-4 py-1.5 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2 bg-gray-50 dark:bg-slate-800">
          <button
            onClick={handleSelectAllToggle}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-400 dark:text-gray-500"
            title="Select all"
          >
            <Square size={14} />
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">Select all</span>
        </div>
      )}

      {/* Email / Thread List */}
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
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
          <>
            {filteredThreads.map(thread => {
              const email = thread.latestEmail;
              const isSelected = selectedThreadId === thread.threadId || selectedEmailId === email.id;
              const isThread = thread.count > 1;
              const isChecked = isThreadSelected(thread);
              const isHovered = hoveredThreadId === thread.threadId;
              const isDragging = draggedEmailIds.some(id => thread.allEmailIds.includes(id));

              return (
                <div
                  key={thread.threadId}
                  draggable
                  onDragStart={(e) => handleDragStart(e, thread)}
                  onDragEnd={handleDragEnd}
                  onMouseEnter={() => setHoveredThreadId(thread.threadId)}
                  onMouseLeave={() => setHoveredThreadId(null)}
                  onClick={() => {
                    if (isThread) {
                      onThreadClick(thread.threadId, email.id, email.accountId);
                    } else {
                      onEmailClick(email.id, email.accountId);
                    }
                  }}
                  className={`group relative px-4 py-3 border-b border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                      : 'border-l-4 border-l-transparent'
                  } ${thread.hasUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''} ${
                    isChecked ? 'bg-blue-50 dark:bg-blue-900/15' : ''
                  } ${isDragging ? 'opacity-50' : ''}`}
                >
                  {/* Checkbox + Drag handle area */}
                  <div className="flex items-start gap-2">
                    {/* Checkbox - visible on hover or when selected */}
                    <div
                      className={`flex-shrink-0 mt-0.5 transition-all duration-150 ${
                        isHovered || isChecked || hasSelection
                          ? 'opacity-100 w-5'
                          : 'opacity-0 w-0 overflow-hidden'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle all emails in this thread
                        thread.allEmailIds.forEach(id => onToggleSelectEmail(id));
                      }}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 dark:border-gray-500 hover:border-blue-400'
                      }`}>
                        {isChecked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Email content */}
                    <div className="flex-1 min-w-0">
                      {/* Top Row: Sender & Time */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {thread.hasUnread && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <span className={`text-sm truncate ${
                            thread.hasUnread
                              ? 'font-semibold text-gray-900 dark:text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {email.from.name || email.from.email}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          {isThread && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                              <MessageSquare size={10} />
                              {thread.count}
                            </span>
                          )}
                          {email.isStarred && (
                            <Star size={14} className="text-yellow-500 fill-yellow-500" />
                          )}
                          {email.hasAttachments && (
                            <Paperclip size={14} className="text-gray-400" />
                          )}
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

                      {/* Thread participants */}
                      {isThread && thread.participants.length > 1 && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <span className="truncate">
                            {thread.participants.slice(0, 3).join(', ')}
                            {thread.participants.length > 3 && ` +${thread.participants.length - 3}`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Drag handle - visible on hover */}
                    <div className={`flex-shrink-0 mt-1 transition-opacity duration-150 cursor-grab active:cursor-grabbing ${
                      isHovered ? 'opacity-40' : 'opacity-0'
                    }`}>
                      <GripVertical size={14} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreTriggerRef} className="py-4 flex items-center justify-center">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Loading more emails...</span>
                  </div>
                ) : (
                  <button
                    onClick={onLoadMore}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Load more emails
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer - Count */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {filteredThreads.length} conversation{filteredThreads.length !== 1 ? 's' : ''}
          {totalCount !== null && ` of ${totalCount}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>
    </div>
  );
};

export default EmailMessageList;
