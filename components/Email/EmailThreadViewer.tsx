import React, { useState, useRef, useEffect } from 'react';
import {
  Reply, ReplyAll, Forward, Trash2, Archive, Star, MoreVertical,
  Paperclip, Download, FileText, Image as ImageIcon, Mail, Loader2,
  ChevronDown, ChevronUp, ArrowLeft, Eye
} from 'lucide-react';
import { Email } from '../../types';
import { getAttachmentUrl, getAttachmentDownloadUrl } from '../../services/emailApiService';
import AttachmentPreviewModal from './AttachmentPreviewModal';

// Resolve cid: references in HTML body with actual attachment download URLs
const resolveCidReferences = (
  html: string,
  attachments: { id: string; contentId?: string | null; mimeType: string }[],
  accountId: string,
  messageId: string
): string => {
  if (!attachments || attachments.length === 0) return html;
  let resolved = html;
  for (const att of attachments) {
    if (att.contentId) {
      const url = getAttachmentUrl(accountId, messageId, att.id);
      resolved = resolved.replace(
        new RegExp(`cid:${att.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
        url
      );
    }
  }
  return resolved;
};

interface EmailThreadViewerProps {
  threadEmails: Email[];
  onMarkAsRead?: (emailId: string) => void;
  loading?: boolean;
  activeFolderName?: string;
  accountId?: string | null;
  onBackToSingle?: () => void;
}

// Isolated HTML email body renderer using iframe
const SafeHtmlBody: React.FC<{ html: string }> = ({ html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            margin: 0;
            padding: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #374151;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          table {
            max-width: 100% !important;
          }
          a {
            color: #2563eb;
            cursor: pointer;
          }
          pre, code {
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          blockquote {
            border-left: 3px solid #d1d5db;
            margin: 8px 0;
            padding-left: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `;

    doc.open();
    doc.write(wrappedHtml);
    doc.close();

    const adjustHeight = () => {
      try {
        const body = doc.body;
        const docEl = doc.documentElement;
        if (body && docEl) {
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            docEl.scrollHeight,
            docEl.offsetHeight
          );
          setIframeHeight(Math.max(height + 20, 100));
        }
      } catch (e) {
        // Cross-origin safety
      }
    };

    // Intercept all link clicks inside the sandboxed iframe and open them
    // from the parent window context to avoid sandbox popup restrictions
    const links = doc.querySelectorAll('a[href]');
    links.forEach(link => {
      link.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const href = (link as HTMLAnchorElement).getAttribute('href');
        if (href && href !== '#' && !href.startsWith('mailto:')) {
          window.open(href, '_blank', 'noopener,noreferrer');
        } else if (href && href.startsWith('mailto:')) {
          window.location.href = href;
        }
      });
    });

    const images = doc.querySelectorAll('img');
    if (images.length > 0) {
      let loaded = 0;
      images.forEach(img => {
        if (img.complete) {
          loaded++;
        } else {
          img.addEventListener('load', () => {
            loaded++;
            if (loaded >= images.length) adjustHeight();
          });
          img.addEventListener('error', () => {
            loaded++;
            if (loaded >= images.length) adjustHeight();
          });
        }
      });
      if (loaded >= images.length) adjustHeight();
    }

    setTimeout(adjustHeight, 100);
    setTimeout(adjustHeight, 500);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Email body"
      sandbox="allow-same-origin"
      style={{
        width: '100%',
        height: `${iframeHeight}px`,
        border: 'none',
        display: 'block',
      }}
    />
  );
};

const EmailThreadViewer: React.FC<EmailThreadViewerProps> = ({
  threadEmails,
  onMarkAsRead,
  loading,
  activeFolderName,
  accountId,
  onBackToSingle,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Preview modal state
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string; filename: string; mimeType: string; size: number;
  } | null>(null);

  useEffect(() => {
    if (threadEmails.length > 0) {
      const latestId = threadEmails[threadEmails.length - 1].id;
      setExpandedIds(new Set([latestId]));
    }
  }, [threadEmails]);

  const toggleExpand = (emailId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(threadEmails.map(e => e.id)));
  };

  const collapseAll = () => {
    if (threadEmails.length > 0) {
      setExpandedIds(new Set([threadEmails[threadEmails.length - 1].id]));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' });
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon size={16} className="text-blue-500" />;
    if (mimeType === 'application/pdf') return <FileText size={16} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive size={16} className="text-yellow-500" />;
    return <FileText size={16} className="text-gray-500" />;
  };

  const handleDownload = (email: Email, attachmentId: string) => {
    if (!accountId) return;
    const url = getAttachmentDownloadUrl(accountId, email.id, attachmentId);
    window.open(url, '_blank');
  };

  const handlePreview = (email: Email, attachmentId: string, filename: string, mimeType: string, size: number) => {
    if (!accountId) return;
    const url = getAttachmentUrl(accountId, email.id, attachmentId);
    setPreviewAttachment({ url, filename, mimeType, size });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400">
        <Loader2 size={32} className="mb-4 animate-spin opacity-40" />
        <p className="text-sm">Loading conversation...</p>
      </div>
    );
  }

  // No emails state
  if (!threadEmails || threadEmails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400">
        <Mail size={64} className="mb-4 opacity-20" />
        <p className="text-lg font-medium mb-1">No email selected</p>
        <p className="text-sm">Select an email to read its contents</p>
      </div>
    );
  }

  const threadSubject = threadEmails[0].subject || '(No Subject)';

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
      {/* Preview Modal */}
      {previewAttachment && (
        <AttachmentPreviewModal
          url={previewAttachment.url}
          filename={previewAttachment.filename}
          mimeType={previewAttachment.mimeType}
          size={previewAttachment.size}
          onClose={() => setPreviewAttachment(null)}
          onDownload={() => window.open(previewAttachment.url + '?download=true', '_blank')}
        />
      )}

      {/* Thread Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
            {threadSubject}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full">
              {threadEmails.length} message{threadEmails.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={expandAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Collapse
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Reply size={14} />
            <span>Reply</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ReplyAll size={14} />
            <span>Reply All</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Forward size={14} />
            <span>Forward</span>
          </button>
          <div className="flex-1" />
          <button className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Delete">
            <Trash2 size={16} />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="More">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Thread Messages - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {threadEmails.map((email, index) => {
          const isExpanded = expandedIds.has(email.id);

          return (
            <div
              key={email.id}
              className={`border rounded-lg transition-all ${
                isExpanded
                  ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm'
                  : 'border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-700/50'
              }`}
            >
              {/* Collapsed / Header Bar */}
              <div
                onClick={() => toggleExpand(email.id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {(email.from.name || email.from.email).charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {email.from.name || email.from.email}
                    </span>
                    {!email.isRead && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {email.bodyText.replace(/\n/g, ' ').substring(0, 120)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {email.hasAttachments && (
                    <Paperclip size={14} className="text-gray-400" />
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatShortDate(email.receivedAt)}
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-slate-700">
                  {/* Full header */}
                  <div className="px-4 py-3 bg-gray-50/50 dark:bg-slate-800/80">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {email.from.name || email.from.email}
                        </span>
                        {email.from.name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            &lt;{email.from.email}&gt;
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(email.receivedAt)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span>To: </span>
                      {email.to.map((addr, i) => (
                        <span key={addr.email}>
                          {addr.name || addr.email}
                          {i < email.to.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                    {email.cc && email.cc.length > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>Cc: </span>
                        {email.cc.map((addr, i) => (
                          <span key={addr.email}>
                            {addr.name || addr.email}
                            {i < email.cc.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Email Body */}
                  <div className="px-4 py-4">
                    {/* Inline image attachment previews — only non-inline (actual file) images */}
                    {email.attachments && email.attachments.length > 0 && (() => {
                      const imageAttachments = email.attachments!.filter(a => a.mimeType.startsWith('image/') && !a.isInline);
                      if (imageAttachments.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-3 mb-4">
                          {imageAttachments.map(attachment => (
                            <div
                              key={attachment.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(email, attachment.id, attachment.filename, attachment.mimeType, attachment.size);
                              }}
                              className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors shadow-sm"
                            >
                              <img
                                src={accountId ? getAttachmentUrl(accountId, email.id, attachment.id) : ''}
                                alt={attachment.filename}
                                className="max-h-48 max-w-[240px] object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-2 py-1 text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                {attachment.filename} · {formatFileSize(attachment.size)}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {email.bodyHtml ? (
                      <SafeHtmlBody html={
                        accountId && email.attachments
                          ? resolveCidReferences(email.bodyHtml, email.attachments, accountId, email.id)
                          : email.bodyHtml
                      } />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {email.bodyText}
                      </pre>
                    )}
                  </div>

                  {/* Attachments — show all attachments except inline images (logos/signatures) */}
                  {email.attachments && (() => {
                    const fileAttachments = email.attachments!.filter(a => !(a.isInline && a.mimeType.startsWith('image/')));
                    if (fileAttachments.length === 0) return null;
                    return (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
                      <div className="flex items-center gap-2 mb-2">
                        <Paperclip size={14} className="text-gray-500" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {fileAttachments.length} Attachment{fileAttachments.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {fileAttachments.map(attachment => (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-2 p-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg transition-colors"
                          >
                            {getAttachmentIcon(attachment.mimeType)}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
                                {attachment.filename}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatFileSize(attachment.size)}
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreview(email, attachment.id, attachment.filename, attachment.mimeType, attachment.size);
                                }}
                                className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                title="Preview"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(email, attachment.id);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 rounded transition-colors"
                                title="Download"
                              >
                                <Download size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmailThreadViewer;
