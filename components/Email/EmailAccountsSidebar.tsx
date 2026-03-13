import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Mail, Inbox, FileEdit, Send, Cloud, CloudOff, Trash2, Archive, FolderOpen, Plus, MoreHorizontal, Edit3, FolderPlus, ArrowUp, ArrowDown, Pencil, Search, X } from 'lucide-react';
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
  onDropOnFolder?: (emailIds: string[], accountId: string, folderId: string) => void;
  onComposeNew?: () => void;
  onCreateFolder?: (displayName: string, parentFolderId?: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
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
  onDropOnFolder,
  onComposeNew,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState('');

  // Custom folder order per account (stored in localStorage as { [accountId]: string[] })
  const [customFolderOrder, setCustomFolderOrder] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('emailFolderOrder') || '{}'); } catch { return {}; }
  });

  const saveFolderOrder = (order: Record<string, string[]>) => {
    setCustomFolderOrder(order);
    localStorage.setItem('emailFolderOrder', JSON.stringify(order));
  };

  const moveFolderInOrder = (accountId: string, folderId: string, direction: 'up' | 'down') => {
    const accountFolders = folders.filter(f => f.accountId === accountId && !f.parentId);
    const priorityOrder = ['inbox', 'sent items', 'drafts', 'deleted items', 'archive'];
    const sorted = [...accountFolders].sort((a, b) => {
      const order = customFolderOrder[accountId] || [];
      const aIdx = order.indexOf(a.id);
      const bIdx = order.indexOf(b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      const aPri = priorityOrder.indexOf(a.displayName.toLowerCase());
      const bPri = priorityOrder.indexOf(b.displayName.toLowerCase());
      if (aPri !== -1 && bPri !== -1) return aPri - bPri;
      if (aPri !== -1) return -1;
      if (bPri !== -1) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    const currentIdx = sorted.findIndex(f => f.id === folderId);
    if (currentIdx === -1) return;
    const newIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[currentIdx], reordered[newIdx]] = [reordered[newIdx], reordered[currentIdx]];
    const newOrder = { ...customFolderOrder, [accountId]: reordered.map(f => f.id) };
    saveFolderOrder(newOrder);
  };

  // Folder management state
  const [folderContextMenu, setFolderContextMenu] = useState<{ folderId: string; folderName: string; x: number; y: number; accountId: string; isSystem: boolean } | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState<{ accountId: string; parentFolderId?: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<{ folderId: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // System folders that can't be renamed/deleted/moved
  const systemFolderNames = ['inbox', 'drafts', 'sent items', 'sent', 'deleted items', 'trash', 'archive', 'outbox', 'junk email', 'junk'];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setFolderContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateFolderSubmit = () => {
    if (!newFolderName.trim() || !showCreateFolder) return;
    onCreateFolder?.(newFolderName.trim(), showCreateFolder.parentFolderId);
    setNewFolderName('');
    setShowCreateFolder(null);
  };

  const handleRenameSubmit = () => {
    if (!renameValue.trim() || !renamingFolder) return;
    onRenameFolder?.(renamingFolder.folderId, renameValue.trim());
    setRenamingFolder(null);
    setRenameValue('');
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string, folderName: string, accountId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isSystem = systemFolderNames.includes(folderName.toLowerCase());
    // Use button position for click events, mouse position for right-click
    let x = e.clientX;
    let y = e.clientY;
    if (e.type === 'click') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.right;
      y = rect.bottom;
    }
    setFolderContextMenu({ folderId, folderName, x, y, accountId, isSystem });
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleFolderDragLeave = () => {
    setDragOverFolderId(null);
  };

  const handleFolderDrop = (e: React.DragEvent, accountId: string, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.emailIds && onDropOnFolder) {
        onDropOnFolder(data.emailIds, accountId, folderId);
      }
    } catch (err) {
      console.error('Drop parse error:', err);
    }
  };

  const getAccountFolders = (accountId: string) => {
    const accountFolders = folders.filter(f => f.accountId === accountId);
    const topLevel = accountFolders.filter(f => !f.parentId);
    const children = accountFolders.filter(f => f.parentId);

    const priorityOrder = ['inbox', 'sent items', 'drafts', 'deleted items', 'archive'];
    const customOrder = customFolderOrder[accountId] || [];

    topLevel.sort((a, b) => {
      // Custom order takes precedence
      const aCustom = customOrder.indexOf(a.id);
      const bCustom = customOrder.indexOf(b.id);
      if (aCustom !== -1 && bCustom !== -1) return aCustom - bCustom;
      if (aCustom !== -1) return -1;
      if (bCustom !== -1) return 1;
      // Fall back to priority order
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
        <div className="flex items-center gap-2 mb-3">
          <Mail size={20} className="text-navy-700 dark:text-white" />
          <h2 className="font-semibold text-navy-900 dark:text-white">Email Accounts</h2>
        </div>
        <button
          onClick={onComposeNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors mb-2"
        >
          <Plus size={16} />
          <span>New Email</span>
        </button>
        {/* Folder filter input */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter folders..."
            value={folderFilter}
            onChange={e => setFolderFilter(e.target.value)}
            className="w-full pl-7 pr-7 py-1.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          {folderFilter && (
            <button
              onClick={() => setFolderFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
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
                  isExpanded ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {accountFolders.topLevel
                  .filter(folder => {
                    if (!folderFilter) return true;
                    const q = folderFilter.toLowerCase();
                    const matchesSelf = folder.displayName.toLowerCase().includes(q);
                    const matchesChild = getChildFolders(folder.name, account.id).some(c => c.displayName.toLowerCase().includes(q));
                    return matchesSelf || matchesChild;
                  })
                  .map(folder => {
                  const childFolders = getChildFolders(folder.name, account.id)
                    .filter(c => !folderFilter || c.displayName.toLowerCase().includes(folderFilter.toLowerCase()));
                  const hasChildren = childFolders.length > 0;
                  const isFolderExpanded = expandedFolders.has(folder.id) || !!folderFilter;

                  return (
                    <React.Fragment key={folder.id}>
                      <div
                        onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                        onDragLeave={handleFolderDragLeave}
                        onDrop={(e) => handleFolderDrop(e, account.id, folder.id)}
                        onContextMenu={(e) => handleFolderContextMenu(e, folder.name, folder.displayName, account.id)}
                        className={`group/folder flex items-center pl-8 pr-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                          selectedFolderId === folder.id
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                            : 'border-l-4 border-l-transparent'
                        } ${dragOverFolderId === folder.id ? 'bg-blue-100 dark:bg-blue-800/40 ring-2 ring-blue-400 ring-inset' : ''}`}
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
                              : folder.unreadCount > 0
                                ? 'font-semibold text-gray-900 dark:text-white'
                                : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {folder.displayName}
                          </span>

                          {folder.unreadCount > 0 && (
                            <span className={`text-xs font-bold ml-2 px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                              selectedFolderId === folder.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-brand-orange text-white'
                            }`}>
                              {folder.unreadCount}
                            </span>
                          )}
                        </div>

                        {/* Folder actions button (visible on hover) */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, folder.name, folder.displayName, account.id); }}
                          className="ml-1 p-0.5 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-600 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Folder options"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>

                      {/* Child folders */}
                      {hasChildren && isFolderExpanded && childFolders.map(child => (
                        <div
                          key={child.id}
                          onDragOver={(e) => handleFolderDragOver(e, child.id)}
                          onDragLeave={handleFolderDragLeave}
                          onDrop={(e) => handleFolderDrop(e, account.id, child.id)}
                          onContextMenu={(e) => handleFolderContextMenu(e, child.name, child.displayName, account.id)}
                          className={`group/childfolder flex items-center pl-14 pr-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                            selectedFolderId === child.id
                              ? 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                              : 'border-l-4 border-l-transparent'
                          } ${dragOverFolderId === child.id ? 'bg-blue-100 dark:bg-blue-800/40 ring-2 ring-blue-400 ring-inset' : ''}`}
                        >
                          <div
                            className="flex items-center flex-1 min-w-0"
                            onClick={() => onFolderClick(account.id, child.id)}
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

                          {/* Child folder actions button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFolderContextMenu(e, child.name, child.displayName, account.id); }}
                            className="ml-1 p-0.5 rounded opacity-0 group-hover/childfolder:opacity-100 hover:bg-gray-200 dark:hover:bg-slate-600 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Folder options"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Create new folder inline form */}
                {showCreateFolder && showCreateFolder.accountId === account.id && !showCreateFolder.parentFolderId && (
                  <div className="flex items-center pl-10 pr-4 py-2 gap-2">
                    <FolderPlus size={14} className="text-gray-400 flex-shrink-0" />
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateFolderSubmit(); if (e.key === 'Escape') { setShowCreateFolder(null); setNewFolderName(''); } }}
                      placeholder="Folder name"
                      className="flex-1 text-xs bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-500 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                    <button onClick={handleCreateFolderSubmit} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Add</button>
                    <button onClick={() => { setShowCreateFolder(null); setNewFolderName(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                )}

                {/* New folder button at bottom of folder list */}
                <button
                  onClick={() => setShowCreateFolder({ accountId: account.id })}
                  className="flex items-center gap-2 pl-10 pr-4 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-slate-700 w-full transition-colors"
                >
                  <FolderPlus size={12} />
                  <span>New folder</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-[100] py-1 w-48"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
        >
          {/* Move Up / Move Down */}
          <button
            onClick={() => {
              moveFolderInOrder(folderContextMenu.accountId, folderContextMenu.folderId, 'up');
              setFolderContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <ArrowUp size={14} />
            <span>Move Up</span>
          </button>
          <button
            onClick={() => {
              moveFolderInOrder(folderContextMenu.accountId, folderContextMenu.folderId, 'down');
              setFolderContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <ArrowDown size={14} />
            <span>Move Down</span>
          </button>

          <div className="border-t border-gray-200 dark:border-slate-600 my-1" />

          {/* Create subfolder */}
          <button
            onClick={() => {
              setShowCreateFolder({ accountId: folderContextMenu.accountId, parentFolderId: folderContextMenu.folderId });
              setFolderContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <FolderPlus size={14} />
            <span>New subfolder</span>
          </button>

          {/* Rename (not for system folders) */}
          {!folderContextMenu.isSystem && (
            <button
              onClick={() => {
                setRenamingFolder({ folderId: folderContextMenu.folderId, currentName: folderContextMenu.folderName });
                setRenameValue(folderContextMenu.folderName);
                setFolderContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <Pencil size={14} />
              <span>Rename</span>
            </button>
          )}

          {/* Delete (not for system folders) */}
          {!folderContextMenu.isSystem && (
            <>
              <div className="border-t border-gray-200 dark:border-slate-600 my-1" />
              <button
                onClick={() => {
                  if (confirm(`Delete folder "${folderContextMenu.folderName}"? All emails in it will be moved to Deleted Items.`)) {
                    onDeleteFolder?.(folderContextMenu.folderId);
                  }
                  setFolderContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={14} />
                <span>Delete folder</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Rename folder modal overlay */}
      {renamingFolder && (
        <div className="fixed inset-0 bg-black/30 z-[100] flex items-center justify-center" onClick={() => { setRenamingFolder(null); setRenameValue(''); }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Rename Folder</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setRenamingFolder(null); setRenameValue(''); } }}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRenamingFolder(null); setRenameValue(''); }} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
              <button onClick={handleRenameSubmit} className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Create subfolder modal overlay (when parentFolderId is set) */}
      {showCreateFolder && showCreateFolder.parentFolderId && (
        <div className="fixed inset-0 bg-black/30 z-[100] flex items-center justify-center" onClick={() => { setShowCreateFolder(null); setNewFolderName(''); }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Create Subfolder</h3>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolderSubmit(); if (e.key === 'Escape') { setShowCreateFolder(null); setNewFolderName(''); } }}
              placeholder="Folder name"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCreateFolder(null); setNewFolderName(''); }} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
              <button onClick={handleCreateFolderSubmit} className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">Create</button>
            </div>
          </div>
        </div>
      )}

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
