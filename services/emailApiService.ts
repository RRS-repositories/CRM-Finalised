import { EmailAccount, EmailFolder, Email } from '../types';

const API_BASE = '/api/email';

export async function fetchEmailAccounts(): Promise<EmailAccount[]> {
  const res = await fetch(`${API_BASE}/accounts`);
  if (!res.ok) throw new Error('Failed to fetch email accounts');
  const data = await res.json();
  return data.accounts;
}

export async function fetchFolders(accountId: string): Promise<EmailFolder[]> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders`);
  if (!res.ok) throw new Error('Failed to fetch folders');
  const data = await res.json();
  return data.folders;
}

export interface FetchEmailsResult {
  emails: Email[];
  hasMore: boolean;
  totalCount: number | null;
}

export async function fetchEmails(accountId: string, folderName: string, limit = 50, skip = 0): Promise<FetchEmailsResult> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/${folderName}/messages?limit=${limit}&skip=${skip}`);
  if (!res.ok) throw new Error('Failed to fetch emails');
  const data = await res.json();
  return { emails: data.emails, hasMore: data.hasMore ?? false, totalCount: data.totalCount ?? null };
}

export async function fetchEmailDetail(accountId: string, messageId: string): Promise<Email> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}`);
  if (!res.ok) throw new Error('Failed to fetch email detail');
  const data = await res.json();
  return data.email;
}

export async function markEmailRead(accountId: string, messageId: string, isRead: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/read`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead })
  });
  if (!res.ok) throw new Error('Failed to update read status');
}

export async function fetchThreadMessages(accountId: string, conversationId: string): Promise<Email[]> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/threads/${encodeURIComponent(conversationId)}/messages`);
  if (!res.ok) throw new Error('Failed to fetch thread messages');
  const data = await res.json();
  return data.emails;
}

export function getAttachmentUrl(accountId: string, messageId: string, attachmentId: string): string {
  return `${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function getAttachmentDownloadUrl(accountId: string, messageId: string, attachmentId: string): string {
  return `${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}?download=true`;
}

export async function deleteEmail(accountId: string, messageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete email');
}

export async function toggleEmailFlag(accountId: string, messageId: string, flagged: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/flag`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagStatus: flagged ? 'flagged' : 'notFlagged' })
  });
  if (!res.ok) throw new Error('Failed to update flag');
}

export async function moveEmail(accountId: string, messageId: string, destinationFolderId: string): Promise<{ newMessageId: string }> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinationFolderId })
  });
  if (!res.ok) throw new Error('Failed to move email');
  const data = await res.json();
  return { newMessageId: data.newMessageId };
}

export async function getArchiveFolderId(accountId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/archive`);
  if (!res.ok) throw new Error('Archive folder not found');
  const data = await res.json();
  return data.folderId;
}

export async function markEmailUnread(accountId: string, messageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/read`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isRead: false })
  });
  if (!res.ok) throw new Error('Failed to mark as unread');
}

// --- Send / Reply / Forward ---

export async function sendEmail(accountId: string, payload: {
  to: string[]; cc?: string[]; bcc?: string[]; subject: string;
  bodyHtml?: string; bodyText?: string;
  attachments?: { name: string; contentType: string; contentBytes: string }[];
}): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to send email');
  }
}

export async function searchAllEmails(accountId: string, query: string, limit = 50): Promise<{ emails: import('../types').Email[]; hasMore: boolean }> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return { emails: data.emails || [], hasMore: data.hasMore ?? false };
}

export async function sendDraftEmail(accountId: string, messageId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/send`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to send draft');
  }
}

export async function replyToEmail(accountId: string, messageId: string, comment: string, to?: string[], cc?: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment, to, cc }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to reply');
  }
}

export async function replyAllToEmail(accountId: string, messageId: string, comment: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/replyAll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to reply all');
  }
}

export async function forwardEmail(accountId: string, messageId: string, to: string[], comment?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/messages/${encodeURIComponent(messageId)}/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, comment }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to forward email');
  }
}

// --- Folder Management ---

export async function createFolder(accountId: string, displayName: string, parentFolderId?: string): Promise<{ id: string; displayName: string }> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, parentFolderId }),
  });
  if (!res.ok) throw new Error('Failed to create folder');
  const data = await res.json();
  return data.folder;
}

export async function renameFolder(accountId: string, folderId: string, displayName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error('Failed to rename folder');
}

export async function deleteFolder(accountId: string, folderId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete folder');
}

export async function moveFolderToParent(accountId: string, folderId: string, destinationParentId?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/${encodeURIComponent(folderId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinationParentId }),
  });
  if (!res.ok) throw new Error('Failed to move folder');
}
