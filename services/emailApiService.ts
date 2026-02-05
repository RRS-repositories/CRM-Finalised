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

export async function fetchEmails(accountId: string, folderName: string, limit = 50): Promise<Email[]> {
  const res = await fetch(`${API_BASE}/accounts/${accountId}/folders/${folderName}/messages?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch emails');
  const data = await res.json();
  return data.emails;
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
