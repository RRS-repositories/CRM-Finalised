import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EmailAccount, EmailFolder, Email } from '../../types';
import { fetchEmailAccounts, fetchFolders, fetchEmails, fetchEmailDetail, markEmailRead, fetchThreadMessages, deleteEmail, toggleEmailFlag, moveEmail, markEmailUnread as apiMarkEmailUnread, createFolder, renameFolder, deleteFolder as apideleteFolder, searchAllEmails } from '../../services/emailApiService';
import EmailAccountsSidebar from './EmailAccountsSidebar';
import EmailMessageList from './EmailMessageList';
import EmailViewer from './EmailViewer';
import EmailThreadViewer from './EmailThreadViewer';
import ComposeEmailModal, { ComposeMode } from './ComposeEmailModal';

const PAGE_SIZE = 50;

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

  // Get selected folder object
  const selectedFolder = folders.find(f => f.id === selectedFolderId);

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
    try {
      const result = await fetchEmails(accountId, folderName, PAGE_SIZE, 0);
      setEmails(result.emails);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
      if (result.emails.length > 0) {
        setSelectedEmailId(result.emails[0].id);
        loadEmailDetail(accountId, result.emails[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load emails:', err);
      setEmails([]);
      setHasMore(false);
    } finally {
      setLoadingEmails(false);
    }
  }, []);

  // Load more emails (infinite scroll)
  const loadMoreEmails = useCallback(async () => {
    if (!selectedAccountId || !activeFolderName || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchEmails(selectedAccountId, activeFolderName, PAGE_SIZE, emails.length);
      setEmails(prev => [...prev, ...result.emails]);
      setHasMore(result.hasMore);
      if (result.totalCount !== null) setTotalCount(result.totalCount);
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
      // Collapse this account
      const newExpanded = new Set(expandedAccounts);
      newExpanded.delete(accountId);
      setExpandedAccounts(newExpanded);
    } else {
      // Collapse all others, expand only this one
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

  // Handle cross-folder search
  const handleSearchAllFolders = async (query: string) => {
    if (!selectedAccountId || !query) return;
    setSearchAllLoading(true);
    try {
      const result = await searchAllEmails(selectedAccountId, query);
      setSearchAllResults(result.emails);
    } catch (err) {
      console.error('Search all folders failed:', err);
      setSearchAllResults([]);
    } finally {
      setSearchAllLoading(false);
    }
  };

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
    // Remove from bulk selection
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
      // Extract actual Graph folder ID from our composite folder ID
      const graphFolderId = targetFolderId.replace(`${targetAccountId}-`, '');
      const actualFolderId = folders.find(f => f.id === targetFolderId)?.name || graphFolderId;
      await Promise.all(emailIds.map(id => moveEmail(selectedAccountId!, id, actualFolderId)));
      // Remove moved emails from current view
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
    <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden">
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
    </div>
  );
};

export default EmailConversations;
