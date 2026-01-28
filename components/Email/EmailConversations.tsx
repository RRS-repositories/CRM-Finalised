import React, { useState, useEffect } from 'react';
import { MOCK_EMAIL_ACCOUNTS, MOCK_EMAIL_FOLDERS, MOCK_EMAILS } from '../../constants';
import { EmailAccount, EmailFolder, Email } from '../../types';
import EmailAccountsSidebar from './EmailAccountsSidebar';
import EmailMessageList from './EmailMessageList';
import EmailViewer from './EmailViewer';

const EmailConversations: React.FC = () => {
  // State for selection
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Get filtered data based on selections
  const selectedAccount = MOCK_EMAIL_ACCOUNTS.find(a => a.id === selectedAccountId);
  const selectedFolder = MOCK_EMAIL_FOLDERS.find(f => f.id === selectedFolderId);
  const selectedEmail = MOCK_EMAILS.find(e => e.id === selectedEmailId);

  // Get folders for selected account
  const accountFolders = selectedAccountId
    ? MOCK_EMAIL_FOLDERS.filter(f => f.accountId === selectedAccountId)
    : [];

  // Get emails for selected folder
  const folderEmails = selectedFolderId
    ? MOCK_EMAILS.filter(e => e.folderId === selectedFolderId)
    : [];

  // Auto-select first account on mount
  useEffect(() => {
    if (MOCK_EMAIL_ACCOUNTS.length > 0 && !selectedAccountId) {
      const firstAccount = MOCK_EMAIL_ACCOUNTS[0];
      setSelectedAccountId(firstAccount.id);
      setExpandedAccounts(new Set([firstAccount.id]));

      // Also select the inbox folder of the first account
      const inbox = MOCK_EMAIL_FOLDERS.find(f => f.accountId === firstAccount.id && f.name === 'inbox');
      if (inbox) {
        setSelectedFolderId(inbox.id);
      }
    }
  }, []);

  // Auto-select first email when folder changes
  useEffect(() => {
    if (selectedFolderId) {
      const emails = MOCK_EMAILS.filter(e => e.folderId === selectedFolderId);
      if (emails.length > 0) {
        setSelectedEmailId(emails[0].id);
      } else {
        setSelectedEmailId(null);
      }
    }
  }, [selectedFolderId]);

  // Handle account click - toggle expand/collapse
  const handleAccountClick = (accountId: string) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId);
    } else {
      newExpanded.add(accountId);
    }
    setExpandedAccounts(newExpanded);
  };

  // Handle folder click
  const handleFolderClick = (accountId: string, folderId: string) => {
    setSelectedAccountId(accountId);
    setSelectedFolderId(folderId);
  };

  // Handle email click
  const handleEmailClick = (emailId: string) => {
    setSelectedEmailId(emailId);
  };

  // Handle mark as read
  const handleMarkAsRead = (emailId: string) => {
    // In a real app, this would call an API
    console.log('Mark as read:', emailId);
  };

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Left Panel: Email Accounts & Folders */}
      <EmailAccountsSidebar
        accounts={MOCK_EMAIL_ACCOUNTS}
        folders={MOCK_EMAIL_FOLDERS}
        expandedAccounts={expandedAccounts}
        selectedAccountId={selectedAccountId}
        selectedFolderId={selectedFolderId}
        onAccountClick={handleAccountClick}
        onFolderClick={handleFolderClick}
      />

      {/* Middle Panel: Email List */}
      <EmailMessageList
        emails={folderEmails}
        selectedEmailId={selectedEmailId}
        selectedFolder={selectedFolder}
        onEmailClick={handleEmailClick}
      />

      {/* Right Panel: Email Viewer */}
      <EmailViewer
        email={selectedEmail}
        onMarkAsRead={handleMarkAsRead}
      />
    </div>
  );
};

export default EmailConversations;
