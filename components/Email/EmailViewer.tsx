import React from 'react';
import {
  Reply, ReplyAll, Forward, Trash2, Archive, Star, MoreVertical,
  Paperclip, Download, FileText, Image as ImageIcon, Mail
} from 'lucide-react';
import { Email } from '../../types';

interface EmailViewerProps {
  email: Email | undefined;
  onMarkAsRead?: (emailId: string) => void;
}

const EmailViewer: React.FC<EmailViewerProps> = ({ email, onMarkAsRead }) => {
  // Format date for display
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

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Get icon for attachment type
  const getAttachmentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon size={16} className="text-blue-500" />;
    if (mimeType === 'application/pdf') return <FileText size={16} className="text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive size={16} className="text-yellow-500" />;
    return <FileText size={16} className="text-gray-500" />;
  };

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
        {/* Subject */}
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          {email.subject || '(No Subject)'}
        </h1>

        {/* From */}
        <div className="flex items-start gap-3 mb-3">
          {/* Avatar */}
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

            {/* To */}
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>To: </span>
              {email.to.map((addr, i) => (
                <span key={addr.email}>
                  {addr.name || addr.email}
                  {i < email.to.length - 1 && ', '}
                </span>
              ))}
            </div>

            {/* CC */}
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
        {email.bodyHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {email.bodyText}
          </pre>
        )}
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {email.attachments.length} Attachment{email.attachments.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {email.attachments.map(attachment => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 cursor-pointer transition-colors group"
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
                <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailViewer;
