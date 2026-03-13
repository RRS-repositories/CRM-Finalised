import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { EmailAccount, EmailFolder, Email } from '../../types';
import { fetchEmailAccounts, fetchFolders, fetchEmails, fetchEmailDetail, markEmailRead, fetchThreadMessages, deleteEmail, toggleEmailFlag, moveEmail, markEmailUnread as apiMarkEmailUnread, createFolder, renameFolder, deleteFolder as apideleteFolder, searchAllEmails } from '../../services/emailApiService';
import EmailAccountsSidebar from './EmailAccountsSidebar';
import EmailMessageList from './EmailMessageList';
import EmailViewer from './EmailViewer';
import EmailThreadViewer from './EmailThreadViewer';
import ComposeEmailModal, { ComposeMode } from './ComposeEmailModal';

const PAGE_SIZE = 50;

// Toast notification for sent emails
interface SentToast {
  id: string;
  message: string;
  visible: boolean;
}

const EmailConversations: React.FC = () => {
  // Data state
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // Thread state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'thread'>('single');

  // Selection state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());

  // Pagination state
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Loading state
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Currently selected folder name (inbox, drafts, sent, etc.)
  const [activeFolderName, setActiveFolderName] = useState<string>('inbox');

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('new');
  const [composeOriginalEmail, setComposeOriginalEmail] = useState<Email | null>(null);

  // Cross-folder search state
  const [searchAllResults, setSearchAllResults] = useState<Email[] | null>(null);
  const [searchAllLoading, setSearchAllLoading] = useState(false);
  const searchRequestIdRef = useRef(0);

  // Sent toast notifications
  const [sentToasts, setSentToasts] = useState<SentToast[]>([]);

  // Get selected folder object
  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  // Show sent toast
  const showSentToast = (message: string) => {
    const id = `toast_${Date.now()}`;
    setSentToasts(prev => [...prev, { id, message, visible: true }]);
    // Auto-dismiss after 5s
    setTimeout(() => {
      setSentToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
      setTimeout(() => {
        setSentToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 5000);
  };

  const dismissToast = (id: string) => {
    setSentToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => {
      setSentToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  };

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const accts = await fetchEmailAccounts();
      setAccounts(accts);
      if (accts.length > 0) {
        const firstAccount = accts[0];
        setSelectedAccountId(firstAccount.id);
        setExpandedAccounts(new Set([firstAccount.id]));
        await loadFoldersForAccount(firstAccount.id);
      }
    } catch (err: any) {
      console.error('Failed to load email accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadFoldersForAccount = async (accountId: string) => {
    try {
      const fldrs = await fetchFolders(accountId);
      setFolders(prev => {
        const otherFolders = prev.filter(f => f.accountId !== accountId);
        return [...otherFolders, ...fldrs];
      });
      const inbox = fldrs.find(f => f.displayName.toLowerCase() === 'inbox');
      if (inbox) {
        setSelectedFolderId(inbox.id);
        setActiveFolderName(inbox.name);
        await loadEmailsForFolder(accountId, inbox.name);
      }
    } catch (err: any) {
      console.error('Failed to load folders:', err);
    }
  };

  const loadEmailsForFolder = useCallback(async (accountId: string, folderName: string) => {
    setLoadingEmails(true);
    setSelectedEmail(null);
    setSelectedEmailId(null);
    setSelectedThreadId(null);
    setThreadEmails([]);
    setViewMode('single');
    setSelectedEmailIds(new Set());
    prefetchCacheRef.current = null;
    try {
      const result = await fetchEmails(accountId, folderName, PAGE_SIZE, 0);
      setEmails(result.emails);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
      if (result.emails.length > 0) {
        setSelectedEmailId(result.emails[0].id);
        loadEmailDetail(accountId, result.emails[0].id);
      }
      // Pre-fetch the second page immediately so scrolling feels instant
      if (result.hasMore && result.emails.length > 0) {
        prefetchNextPage(result.emails.length);
      }
    } catch (err: any) {
      console.error('Failed to load emails:', err);
      setEmails([]);
      setHasMore(false);
    } finally {
      setLoadingEmails(false);
    }
  }, []);

  // Pre-fetch cache for next page
  const prefetchCacheRef = useRef<{ skip: number; folder: string; result: { emails: Email[]; hasMore: boolean; totalCount: number | null } } | null>(null);
  const prefetchingRef = useRef(false);

  // Pre-fetch next page in the background
  const prefetchNextPage = useCallback(async (currentLength: number) => {
    if (!selectedAccountId || !activeFolderName || prefetchingRef.current) return;
    prefetchingRef.current = true;
    try {
      const result = await fetchEmails(selectedAccountId, activeFolderName, PAGE_SIZE, currentLength);
      prefetchCacheRef.current = { skip: currentLength, folder: activeFolderName, result };
    } catch {
      // Prefetch failure is non-critical
    } finally {
      prefetchingRef.current = false;
    }
  }, [selectedAccountId, activeFolderName]);

  // Load more emails (infinite scroll) — uses prefetch cache if available
  const loadMoreEmails = useCallback(async () => {
    if (!selectedAccountId || !activeFolderName || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      // Check if we have a prefetched result for this exact offset
      const cache = prefetchCacheRef.current;
      let result;
      if (cache && cache.skip === emails.length && cache.folder === activeFolderName) {
        result = cache.result;
        prefetchCacheRef.current = null;
      } else {
        prefetchCacheRef.current = null;
        result = await fetchEmails(selectedAccountId, activeFolderName, PAGE_SIZE, emails.length);
      }
      const newLength = emails.length + result.emails.length;
      setEmails(prev => [...prev, ...result.emails]);
      setHasMore(result.hasMore);
      if (result.totalCount !== null) setTotalCount(result.totalCount);
      // Start prefetching the next page immediately
      if (result.hasMore) {
        prefetchNextPage(newLength);
      }
    } catch (err: any) {
      console.error('Failed to load more emails:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [selectedAccountId, activeFolderName, loadingMore, hasMore, emails.length]);

  const loadEmailDetail = async (accountId: string, messageId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await fetchEmailDetail(accountId, messageId);
      setSelectedEmail(detail);
      setEmails(prev => prev.map(e =>
        e.id === detail.id ? { ...e, isRead: true } : e
      ));
    } catch (err: any) {
      console.error('Failed to load email detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Load all messages in a thread
  const loadThreadMessages = async (accountId: string, conversationId: string) => {
    setLoadingThread(true);
    try {
      const msgs = await fetchThreadMessages(accountId, conversationId);
      setThreadEmails(msgs);
    } catch (err: any) {
      console.error('Failed to load thread messages:', err);
      setThreadEmails([]);
    } finally {
      setLoadingThread(false);
    }
  };

  // Handle account click - toggle expand/collapse and load folders
  const handleAccountClick = async (accountId: string) => {
    if (expandedAccounts.has(accountId)) {
      const newExpanded = new Set(expandedAccounts);
      newExpanded.delete(accountId);
      setExpandedAccounts(newExpanded);
    } else {
      setExpandedAccounts(new Set([accountId]));
      const existingFolders = folders.filter(f => f.accountId === accountId);
      if (existingFolders.length === 0) {
        await loadFoldersForAccount(accountId);
      }
    }
  };

  // Handle folder click
  const handleFolderClick = async (accountId: string, folderId: string) => {
    setSelectedAccountId(accountId);
    setSelectedFolderId(folderId);
    const folderName = folderId.replace(`${accountId}-`, '');
    setActiveFolderName(folderName);
    await loadEmailsForFolder(accountId, folderName);
  };

  // Handle single email click (non-thread)
  const handleEmailClick = (emailId: string, accountId: string) => {
    setSelectedEmailId(emailId);
    setSelectedThreadId(null);
    setViewMode('single');
    setThreadEmails([]);
    setSelectedAccountId(accountId);
    loadEmailDetail(accountId, emailId);
  };

  // Handle thread click — load all messages in the conversation
  const handleThreadClick = (threadId: string, latestEmailId: string, accountId: string) => {
    setSelectedThreadId(threadId);
    setSelectedEmailId(latestEmailId);
    setViewMode('thread');
    setSelectedAccountId(accountId);
    loadThreadMessages(accountId, threadId);
  };

  // Handle cross-folder search (keeps previous results visible while loading new ones)
  const handleSearchAllFolders = useCallback(async (query: string) => {
    if (!selectedAccountId || !query) return;
    const requestId = ++searchRequestIdRef.current;
    setSearchAllLoading(true);
    try {
      const result = await searchAllEmails(selectedAccountId, query);
      // Ignore stale responses from earlier searches
      if (requestId !== searchRequestIdRef.current) return;
      setSearchAllResults(result.emails);
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error('Search all folders failed:', err);
      setSearchAllResults([]);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearchAllLoading(false);
      }
    }
  }, [selectedAccountId]);

  // Handle refresh
  const handleRefresh = async () => {
    if (selectedAccountId && activeFolderName) {
      await loadEmailsForFolder(selectedAccountId, activeFolderName);
    }
  };

  // Handle mark as read
  const handleMarkAsRead = async (emailId: string) => {
    if (!selectedAccountId) return;
    try {
      await markEmailRead(selectedAccountId, emailId, true);
      setEmails(prev => prev.map(e =>
        e.id === emailId ? { ...e, isRead: true } : e
      ));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  // Handle delete email - remove from list and select next
  const handleDelete = (emailId: string) => {
    setEmails(prev => {
      const filtered = prev.filter(e => e.id !== emailId);
      if (selectedEmailId === emailId && filtered.length > 0) {
        const nextEmail = filtered[0];
        setSelectedEmailId(nextEmail.id);
        setSelectedEmail(null);
        if (selectedAccountId) {
          loadEmailDetail(selectedAccountId, nextEmail.id);
        }
      } else if (filtered.length === 0) {
        setSelectedEmailId(null);
        setSelectedEmail(null);
      }
      return filtered;
    });
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      next.delete(emailId);
      return next;
    });
    if (viewMode === 'thread') {
      setViewMode('single');
      setSelectedThreadId(null);
      setThreadEmails([]);
    }
  };

  // Handle flag toggle - update local state
  const handleFlag = (emailId: string, flagged: boolean) => {
    setEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isStarred: flagged } : e
    ));
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(prev => prev ? { ...prev, isStarred: flagged } : prev);
    }
    setThreadEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isStarred: flagged } : e
    ));
  };

  // Handle archive - remove from current folder view
  const handleArchive = (emailId: string) => {
    handleDelete(emailId);
  };

  // Handle mark as unread
  const handleMarkUnread = (emailId: string) => {
    setEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isRead: false } : e
    ));
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(prev => prev ? { ...prev, isRead: false } : prev);
    }
    setThreadEmails(prev => prev.map(e =>
      e.id === emailId ? { ...e, isRead: false } : e
    ));
  };

  // Handle sync all accounts
  const handleSyncAll = async () => {
    setLoadingAccounts(true);
    try {
      const accts = await fetchEmailAccounts();
      setAccounts(accts);
      if (selectedAccountId && activeFolderName) {
        await loadEmailsForFolder(selectedAccountId, activeFolderName);
      }
    } catch (err) {
      console.error('Failed to sync accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Bulk selection handlers
  const handleToggleSelectEmail = (emailId: string) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const handleSelectAll = (emailIds: string[]) => {
    setSelectedEmailIds(new Set(emailIds));
  };

  const handleDeselectAll = () => {
    setSelectedEmailIds(new Set());
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!selectedAccountId || selectedEmailIds.size === 0) return;
    const ids = Array.from(selectedEmailIds);
    try {
      await Promise.all(ids.map(id => deleteEmail(selectedAccountId!, id)));
      setEmails(prev => prev.filter(e => !selectedEmailIds.has(e.id)));
      setSelectedEmailIds(new Set());
      if (selectedEmailId && selectedEmailIds.has(selectedEmailId)) {
        setSelectedEmailId(null);
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  const handleBulkMarkRead = async () => {
    if (!selectedAccountId || selectedEmailIds.size === 0) return;
    const ids = Array.from(selectedEmailIds);
    try {
      await Promise.all(ids.map(id => markEmailRead(selectedAccountId!, id, true)));
      setEmails(prev => prev.map(e =>
        selectedEmailIds.has(e.id) ? { ...e, isRead: true } : e
      ));
    } catch (err) {
      console.error('Bulk mark read failed:', err);
    }
  };

  const handleBulkMarkUnread = async () => {
    if (!selectedAccountId || selectedEmailIds.size === 0) return;
    const ids = Array.from(selectedEmailIds);
    try {
      await Promise.all(ids.map(id => apiMarkEmailUnread(selectedAccountId!, id)));
      setEmails(prev => prev.map(e =>
        selectedEmailIds.has(e.id) ? { ...e, isRead: false } : e
      ));
    } catch (err) {
      console.error('Bulk mark unread failed:', err);
    }
  };

  const handleBulkMove = async (destinationFolderId: string) => {
    if (!selectedAccountId || selectedEmailIds.size === 0) return;
    const ids = Array.from(selectedEmailIds);
    try {
      await Promise.all(ids.map(id => moveEmail(selectedAccountId!, id, destinationFolderId)));
      setEmails(prev => prev.filter(e => !selectedEmailIds.has(e.id)));
      setSelectedEmailIds(new Set());
    } catch (err) {
      console.error('Bulk move failed:', err);
    }
  };

  // --- Compose email handlers ---
  const handleComposeNew = () => {
    setComposeMode('new');
    setComposeOriginalEmail(null);
    setComposeOpen(true);
  };

  const handleReply = (email: Email) => {
    setComposeMode('reply');
    setComposeOriginalEmail(email);
    setComposeOpen(true);
  };

  const handleReplyAll = (email: Email) => {
    setComposeMode('replyAll');
    setComposeOriginalEmail(email);
    setComposeOpen(true);
  };

  const handleForward = (email: Email) => {
    setComposeMode('forward');
    setComposeOriginalEmail(email);
    setComposeOpen(true);
  };

  const handleEditDraft = (email: Email) => {
    setComposeMode('draft');
    setComposeOriginalEmail(email);
    setComposeOpen(true);
  };

  const handleComposeSent = async () => {
    // If we just sent a draft via the compose modal, delete the original draft
    if (composeMode === 'draft' && composeOriginalEmail) {
      try {
        await deleteEmail(composeOriginalEmail.accountId, composeOriginalEmail.id);
      } catch (err) {
        console.error('Failed to delete draft after sending:', err);
      }
      handleDelete(composeOriginalEmail.id);
    }

    // Show sent confirmation toast
    const modeLabel = composeMode === 'reply' ? 'Reply' : composeMode === 'replyAll' ? 'Reply all' : composeMode === 'forward' ? 'Forwarded email' : 'Email';
    showSentToast(`${modeLabel} sent successfully`);

    // If replying within a thread, auto-refresh the thread to show the new message
    if ((composeMode === 'reply' || composeMode === 'replyAll') && viewMode === 'thread' && selectedThreadId && selectedAccountId) {
      // Small delay to let Graph API process the sent message
      setTimeout(() => {
        loadThreadMessages(selectedAccountId!, selectedThreadId!);
      }, 2000);
    }

    // Refresh current folder (handles Sent Items folder refresh too)
    if (selectedAccountId && activeFolderName) {
      loadEmailsForFolder(selectedAccountId, activeFolderName);
    }
  };

  // --- Folder management ---
  const handleCreateFolder = async (displayName: string, parentFolderId?: string) => {
    if (!selectedAccountId) return;
    try {
      await createFolder(selectedAccountId, displayName, parentFolderId);
      const fldrs = await fetchFolders(selectedAccountId);
      setFolders(prev => {
        const otherFolders = prev.filter(f => f.accountId !== selectedAccountId);
        return [...otherFolders, ...fldrs];
      });
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    if (!selectedAccountId) return;
    try {
      await renameFolder(selectedAccountId, folderId, newName);
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, displayName: newName } : f));
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!selectedAccountId) return;
    try {
      await apideleteFolder(selectedAccountId, folderId);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        setEmails([]);
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  // Handle drag-and-drop: email dropped onto a folder
  const handleDropOnFolder = async (emailIds: string[], targetAccountId: string, targetFolderId: string) => {
    if (!selectedAccountId) return;
    try {
      const graphFolderId = targetFolderId.replace(`${targetAccountId}-`, '');
      const actualFolderId = folders.find(f => f.id === targetFolderId)?.name || graphFolderId;
      await Promise.all(emailIds.map(id => moveEmail(selectedAccountId!, id, actualFolderId)));
      const movedSet = new Set(emailIds);
      setEmails(prev => prev.filter(e => !movedSet.has(e.id)));
      setSelectedEmailIds(prev => {
        const next = new Set(prev);
        emailIds.forEach(id => next.delete(id));
        return next;
      });
      if (selectedEmailId && movedSet.has(selectedEmailId)) {
        setSelectedEmailId(null);
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error('Failed to move emails via drag-and-drop:', err);
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden relative">
      <EmailAccountsSidebar
        accounts={accounts}
        folders={folders}
        expandedAccounts={expandedAccounts}
        selectedAccountId={selectedAccountId}
        selectedFolderId={selectedFolderId}
        onAccountClick={handleAccountClick}
        onFolderClick={handleFolderClick}
        onSyncAll={handleSyncAll}
        loading={loadingAccounts}
        onDropOnFolder={handleDropOnFolder}
        onComposeNew={handleComposeNew}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
      />

      <EmailMessageList
        emails={emails}
        selectedEmailId={selectedEmailId}
        selectedThreadId={selectedThreadId}
        selectedFolder={selectedFolder}
        onEmailClick={handleEmailClick}
        onThreadClick={handleThreadClick}
        onRefresh={handleRefresh}
        loading={loadingEmails}
        accounts={accounts}
        selectedEmailIds={selectedEmailIds}
        onToggleSelectEmail={handleToggleSelectEmail}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBulkDelete={handleBulkDelete}
        onBulkMarkRead={handleBulkMarkRead}
        onBulkMarkUnread={handleBulkMarkUnread}
        onBulkMove={handleBulkMove}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMoreEmails}
        totalCount={totalCount}
        onSearchAllFolders={handleSearchAllFolders}
        searchAllResults={searchAllResults}
        searchAllLoading={searchAllLoading}
      />

      {viewMode === 'thread' ? (
        <EmailThreadViewer
          threadEmails={threadEmails}
          onMarkAsRead={handleMarkAsRead}
          onDelete={handleDelete}
          onFlag={handleFlag}
          onArchive={handleArchive}
          onMarkUnread={handleMarkUnread}
          loading={loadingThread}
          activeFolderName={activeFolderName}
          accountId={selectedAccountId}
          accounts={accounts}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
        />
      ) : (
        <EmailViewer
          email={selectedEmail || undefined}
          onMarkAsRead={handleMarkAsRead}
          onDelete={handleDelete}
          onFlag={handleFlag}
          onArchive={handleArchive}
          onMarkUnread={handleMarkUnread}
          loading={loadingDetail}
          activeFolderName={activeFolderName}
          accountId={selectedAccountId}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onEditDraft={handleEditDraft}
        />
      )}

      {/* Compose Email Modal */}
      {composeOpen && (
        <ComposeEmailModal
          mode={composeMode}
          accounts={accounts}
          defaultAccountId={selectedAccountId}
          originalEmail={composeOriginalEmail || undefined}
          onClose={() => setComposeOpen(false)}
          onSent={handleComposeSent}
        />
      )}

      {/* Sent Confirmation Toasts */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
        {sentToasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 bg-green-600 text-white rounded-xl shadow-2xl transition-all duration-300 ${
              toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <CheckCircle size={18} />
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-0.5 hover:bg-white/20 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmailConversations;
