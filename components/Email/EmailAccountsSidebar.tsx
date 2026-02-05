import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Mail, Inbox, FileEdit, Send, Cloud, CloudOff, Trash2, Archive, FolderOpen } from 'lucide-react';
import { EmailAccount, EmailFolder } from '../../types';

interface EmailAccountsSidebarProps {
  accounts: EmailAccount[];
  folders: EmailFolder[];
  expandedAccounts: Set<string>;
  selectedAccountId: string | null;
  selectedFolderId: string | null;
  onAccountClick: (accountId: string) => void;
  onFolderClick: (accountId: string, folderId: string) => void;
  onSyncAll?: () => void;
  loading?: boolean;
}

const FolderIcon: React.FC<{ displayName: string; size?: number }> = ({ displayName, size = 16 }) => {
  const name = displayName.toLowerCase();
  if (name === 'inbox') return <Inbox size={size} className="text-blue-500" />;
  if (name === 'drafts') return <FileEdit size={size} className="text-amber-500" />;
  if (name === 'sent items' || name === 'sent') return <Send size={size} className="text-green-500" />;
  if (name === 'deleted items' || name === 'trash') return <Trash2 size={size} className="text-red-400" />;
  if (name === 'archive') return <Archive size={size} className="text-purple-500" />;
  return <FolderOpen size={size} className="text-gray-400" />;
};

const EmailAccountsSidebar: React.FC<EmailAccountsSidebarProps> = ({
  accounts,
  folders,
  expandedAccounts,
  selectedAccountId,
  selectedFolderId,
  onAccountClick,
  onFolderClick,
  onSyncAll,
  loading,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const getAccountFolders = (accountId: string) => {
    // Get folders for this account, sorted: main folders first, then by name
    const accountFolders = folders.filter(f => f.accountId === accountId);

    // Separate top-level and child folders
    const topLevel = accountFolders.filter(f => !f.parentId);
    const children = accountFolders.filter(f => f.parentId);

    // Sort top-level: Inbox first, then Sent Items, then Drafts, then others alphabetically
    const priorityOrder = ['inbox', 'sent items', 'drafts', 'deleted items', 'archive'];
    topLevel.sort((a, b) => {
      const aName = a.displayName.toLowerCase();
      const bName = b.displayName.toLowerCase();
      const aIdx = priorityOrder.indexOf(aName);
      const bIdx = priorityOrder.indexOf(bName);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return aName.localeCompare(bName);
    });

    return { topLevel, children };
  };

  const getChildFolders = (parentName: string, accountId: string) => {
    return folders.filter(f => f.accountId === accountId && f.parentId === parentName);
  };

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getTotalUnreadForAccount = (accountId: string) => {
    return folders
      .filter(f => f.accountId === accountId)
      .reduce((sum, folder) => sum + folder.unreadCount, 0);
  };

  return (
    <div className="w-[280px] border-r border-gray-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-navy-700 dark:text-white" />
          <h2 className="font-semibold text-navy-900 dark:text-white">Email Accounts</h2>
        </div>
      </div>

      {/* Scrollable Account List */}
      <div className="flex-1 overflow-y-auto">
        {accounts.map(account => {
          const isExpanded = expandedAccounts.has(account.id);
          const accountFolders = getAccountFolders(account.id);
          const totalUnread = getTotalUnreadForAccount(account.id);

          return (
            <div key={account.id} className="border-b border-gray-100 dark:border-slate-700">
              {/* Account Header */}
              <div
                onClick={() => onAccountClick(account.id)}
                className={`flex items-center px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                  selectedAccountId === account.id && !selectedFolderId
                    ? 'bg-blue-50 dark:bg-slate-700'
                    : ''
                }`}
              >
                {/* Expand/Collapse Chevron */}
                <div className="w-5 h-5 flex items-center justify-center mr-2">
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                </div>

                {/* Account Color Indicator */}
                <div
                  className="w-3 h-3 rounded-full mr-3 flex-shrink-0"
                  style={{ backgroundColor: account.color || '#6B7280' }}
                />

                {/* Account Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {account.email}
                    </span>
                    {account.isConnected ? (
                      <Cloud size={12} className="text-green-500 flex-shrink-0" title="Connected" />
                    ) : (
                      <CloudOff size={12} className="text-gray-400 flex-shrink-0" title="Disconnected" />
                    )}
                  </div>
                </div>

                {/* Unread Badge */}
                {totalUnread > 0 && (
                  <span className="ml-2 bg-brand-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {totalUnread}
                  </span>
                )}
              </div>

              {/* Folders (when expanded) */}
              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  isExpanded ? 'max-h-[600px] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0'
                }`}
              >
                {accountFolders.topLevel.map(folder => {
                  const childFolders = getChildFolders(folder.name, account.id);
                  const hasChildren = childFolders.length > 0;
                  const isFolderExpanded = expandedFolders.has(folder.id);

                  return (
                    <React.Fragment key={folder.id}>
                      <div
                        className={`flex items-center pl-8 pr-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                          selectedFolderId === folder.id
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                            : 'border-l-4 border-l-transparent'
                        }`}
                      >
                        {/* Expand/collapse for folders with children */}
                        {hasChildren ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFolderExpand(folder.id); }}
                            className="w-4 h-4 flex items-center justify-center mr-1"
                          >
                            {isFolderExpanded ? (
                              <ChevronDown size={12} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={12} className="text-gray-400" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 h-4 mr-1" />
                        )}

                        <div
                          className="flex items-center flex-1 min-w-0"
                          onClick={() => onFolderClick(account.id, folder.id)}
                        >
                          <FolderIcon displayName={folder.displayName} size={14} />
                          <span className={`ml-2 text-sm flex-1 truncate ${
                            selectedFolderId === folder.id
                              ? 'font-medium text-blue-700 dark:text-blue-300'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {folder.displayName}
                          </span>

                          {folder.unreadCount > 0 && (
                            <span className={`text-xs font-medium ml-2 ${
                              selectedFolderId === folder.id
                                ? 'text-blue-600 dark:text-blue-300'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {folder.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Child folders */}
                      {hasChildren && isFolderExpanded && childFolders.map(child => (
                        <div
                          key={child.id}
                          onClick={() => onFolderClick(account.id, child.id)}
                          className={`flex items-center pl-14 pr-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                            selectedFolderId === child.id
                              ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                              : 'border-l-4 border-l-transparent'
                          }`}
                        >
                          <FolderIcon displayName={child.displayName} size={12} />
                          <span className={`ml-2 text-xs flex-1 truncate ${
                            selectedFolderId === child.id
                              ? 'font-medium text-blue-700 dark:text-blue-300'
                              : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {child.displayName}
                          </span>

                          {child.unreadCount > 0 && (
                            <span className={`text-xs font-medium ${
                              selectedFolderId === child.id
                                ? 'text-blue-600 dark:text-blue-300'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {child.unreadCount}
                            </span>
                          )}
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer - Connection Status */}
      <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            {loading ? 'Connecting...' : `${accounts.filter(a => a.isConnected).length} of ${accounts.length} connected`}
          </span>
          <button
            onClick={onSyncAll}
            disabled={loading}
            className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {loading ? 'Syncing...' : 'Sync All'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailAccountsSidebar;
