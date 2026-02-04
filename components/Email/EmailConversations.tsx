import React, { useState, useEffect, useCallback } from 'react';
import { EmailAccount, EmailFolder, Email } from '../../types';
import { fetchEmailAccounts, fetchFolders, fetchEmails, fetchEmailDetail, markEmailRead, fetchThreadMessages } from '../../services/emailApiService';
import EmailAccountsSidebar from './EmailAccountsSidebar';
import EmailMessageList from './EmailMessageList';
import EmailViewer from './EmailViewer';
import EmailThreadViewer from './EmailThreadViewer';

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

  // Loading state
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Currently selected folder name (inbox, drafts, sent, etc.)
  const [activeFolderName, setActiveFolderName] = useState<string>('inbox');

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
      const inbox = fldrs.find(f => f.name === 'inbox');
      if (inbox) {
        setSelectedFolderId(inbox.id);
        setActiveFolderName('inbox');
        await loadEmailsForFolder(accountId, 'inbox');
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
    try {
      const msgs = await fetchEmails(accountId, folderName);
      setEmails(msgs);
      if (msgs.length > 0) {
        setSelectedEmailId(msgs[0].id);
        loadEmailDetail(accountId, msgs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load emails:', err);
      setEmails([]);
    } finally {
      setLoadingEmails(false);
    }
  }, []);

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
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
      const existingFolders = folders.filter(f => f.accountId === accountId);
      if (existingFolders.length === 0) {
        await loadFoldersForAccount(accountId);
      }
    }
    setExpandedAccounts(newExpanded);
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
  const handleEmailClick = (emailId: string) => {
    setSelectedEmailId(emailId);
    setSelectedThreadId(null);
    setViewMode('single');
    setThreadEmails([]);
    if (selectedAccountId) {
      loadEmailDetail(selectedAccountId, emailId);
    }
  };

  // Handle thread click — load all messages in the conversation
  const handleThreadClick = (threadId: string, latestEmailId: string) => {
    setSelectedThreadId(threadId);
    setSelectedEmailId(latestEmailId);
    setViewMode('thread');
    if (selectedAccountId) {
      loadThreadMessages(selectedAccountId, threadId);
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
      />

      {/* Show thread viewer for multi-message threads, single viewer otherwise */}
      {viewMode === 'thread' ? (
        <EmailThreadViewer
          threadEmails={threadEmails}
          onMarkAsRead={handleMarkAsRead}
          loading={loadingThread}
          activeFolderName={activeFolderName}
          accountId={selectedAccountId}
        />
      ) : (
        <EmailViewer
          email={selectedEmail || undefined}
          onMarkAsRead={handleMarkAsRead}
          loading={loadingDetail}
          activeFolderName={activeFolderName}
          accountId={selectedAccountId}
        />
      )}
    </div>
  );
};

export default EmailConversations;
