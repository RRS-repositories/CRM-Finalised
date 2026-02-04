import React from 'react';
import { ChevronDown, ChevronRight, Mail, Inbox, FileEdit, Send, Cloud, CloudOff } from 'lucide-react';
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

const FolderIcon: React.FC<{ folderName: string; size?: number }> = ({ folderName, size = 16 }) => {
  switch (folderName) {
    case 'inbox':
      return <Inbox size={size} className="text-blue-500" />;
    case 'drafts':
      return <FileEdit size={size} className="text-gray-400" />;
    case 'sent':
      return <Send size={size} className="text-green-500" />;
    default:
      return <Mail size={size} className="text-gray-400" />;
  }
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
  const getAccountFolders = (accountId: string) => {
    return folders.filter(f => f.accountId === accountId);
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
                  isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {accountFolders.map(folder => (
                  <div
                    key={folder.id}
                    onClick={() => onFolderClick(account.id, folder.id)}
                    className={`flex items-center pl-10 pr-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                      selectedFolderId === folder.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <FolderIcon folderName={folder.name} size={14} />
                    <span className={`ml-3 text-sm flex-1 ${
                      selectedFolderId === folder.id
                        ? 'font-medium text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {folder.displayName}
                    </span>

                    {/* Folder Unread Count */}
                    {folder.unreadCount > 0 && (
                      <span className={`text-xs font-medium ${
                        selectedFolderId === folder.id
                          ? 'text-blue-600 dark:text-blue-300'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {folder.unreadCount}
                      </span>
                    )}
                  </div>
                ))}
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
