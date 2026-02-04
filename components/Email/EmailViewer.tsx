import React, { useRef, useEffect, useState } from 'react';
import {
  Reply, ReplyAll, Forward, Trash2, Archive, Star, MoreVertical,
  Paperclip, Download, FileText, Image as ImageIcon, Mail, Loader2, Eye
} from 'lucide-react';
import { Email } from '../../types';
import { getAttachmentUrl, getAttachmentDownloadUrl } from '../../services/emailApiService';
import AttachmentPreviewModal from './AttachmentPreviewModal';

interface EmailViewerProps {
  email: Email | undefined;
  onMarkAsRead?: (emailId: string) => void;
  loading?: boolean;
  activeFolderName?: string;
  accountId?: string | null;
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
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
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

const EmailViewer: React.FC<EmailViewerProps> = ({ email, onMarkAsRead, loading, activeFolderName, accountId }) => {
  // Preview modal state
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string; filename: string; mimeType: string; size: number;
  } | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const handleDownload = (attachmentId: string) => {
    if (!email || !accountId) return;
    const url = getAttachmentDownloadUrl(accountId, email.id, attachmentId);
    window.open(url, '_blank');
  };

  const handlePreview = (attachmentId: string, filename: string, mimeType: string, size: number) => {
    if (!email || !accountId) return;
    const url = getAttachmentUrl(accountId, email.id, attachmentId);
    setPreviewAttachment({ url, filename, mimeType, size });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400">
        <Loader2 size={32} className="mb-4 animate-spin opacity-40" />
        <p className="text-sm">Loading email...</p>
      </div>
    );
  }

  // No email selected state
  if (!email) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-gray-400">
        <Mail size={64} className="mb-4 opacity-20" />
        <p className="text-lg font-medium mb-1">No email selected</p>
        <p className="text-sm">Select an email to read its contents</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
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

      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Reply size={16} />
            <span>Reply</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ReplyAll size={16} />
            <span>Reply All</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <Forward size={16} />
            <span>Forward</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
              email.isStarred ? 'text-yellow-500' : 'text-gray-400'
            }`}
            title="Star"
          >
            <Star size={18} className={email.isStarred ? 'fill-yellow-500' : ''} />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Archive">
            <Archive size={18} />
          </button>
          <button className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Delete">
            <Trash2 size={18} />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="More">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Email Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          {email.subject || '(No Subject)'}
        </h1>

        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-navy-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
            {(email.from.name || email.from.email).charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {email.from.name || email.from.email}
                </span>
                {email.from.name && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    &lt;{email.from.email}&gt;
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0 ml-4">
                {formatDate(email.receivedAt)}
              </span>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>To: </span>
              {email.to.map((addr, i) => (
                <span key={addr.email}>
                  {addr.name || addr.email}
                  {i < email.to.length - 1 && ', '}
                </span>
              ))}
            </div>

            {email.cc && email.cc.length > 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
        </div>
      </div>

      {/* Email Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Inline image attachment previews — only show non-inline (actual file) image attachments */}
        {email.attachments && email.attachments.length > 0 && (() => {
          const imageAttachments = email.attachments!.filter(a => a.mimeType.startsWith('image/') && !a.isInline);
          if (imageAttachments.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-3 mb-4">
              {imageAttachments.map(attachment => (
                <div
                  key={attachment.id}
                  onClick={() => handlePreview(attachment.id, attachment.filename, attachment.mimeType, attachment.size)}
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

      {/* Attachments — fixed bottom section with scrollable grid */}
      {email.attachments && (() => {
        const fileAttachments = email.attachments!.filter(a => !(a.isInline && a.mimeType.startsWith('image/')));
        if (fileAttachments.length === 0) return null;
        return (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {fileAttachments.length} Attachment{fileAttachments.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
              {fileAttachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg transition-colors"
                >
                  {getAttachmentIcon(attachment.mimeType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handlePreview(attachment.id, attachment.filename, attachment.mimeType, attachment.size)}
                      className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleDownload(attachment.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600 rounded transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default EmailViewer;
