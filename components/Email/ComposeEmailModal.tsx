import React, { useState, useRef } from 'react';
import {
  X, Send, Paperclip, Trash2, Loader2, Minus, Maximize2, Minimize2
} from 'lucide-react';
import { EmailAccount } from '../../types';
import { sendEmail, replyToEmail, replyAllToEmail, forwardEmail } from '../../services/emailApiService';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

export interface ComposeEmailProps {
  mode: ComposeMode;
  accounts: EmailAccount[];
  defaultAccountId: string | null;
  // For reply/replyAll/forward
  originalEmail?: {
    id: string;
    accountId: string;
    from: { email: string; name?: string };
    to: { email: string; name?: string }[];
    cc?: { email: string; name?: string }[];
    subject: string;
    bodyHtml?: string;
    bodyText: string;
    receivedAt: string;
  };
  onClose: () => void;
  onSent?: () => void;
}

const ComposeEmailModal: React.FC<ComposeEmailProps> = ({
  mode,
  accounts,
  defaultAccountId,
  originalEmail,
  onClose,
  onSent,
}) => {
  const [fromAccountId, setFromAccountId] = useState(
    originalEmail?.accountId || defaultAccountId || accounts[0]?.id || ''
  );
  const [toField, setToField] = useState(() => {
    if (mode === 'reply' && originalEmail) return originalEmail.from.email;
    if (mode === 'replyAll' && originalEmail) {
      const all = [originalEmail.from.email, ...originalEmail.to.map(t => t.email)];
      const currentAccount = accounts.find(a => a.id === (originalEmail.accountId || defaultAccountId));
      const filtered = currentAccount ? all.filter(e => e.toLowerCase() !== currentAccount.email.toLowerCase()) : all;
      return [...new Set(filtered)].join(', ');
    }
    return '';
  });
  const [ccField, setCcField] = useState(() => {
    if (mode === 'replyAll' && originalEmail?.cc) {
      return originalEmail.cc.map(c => c.email).join(', ');
    }
    return '';
  });
  const [bccField, setBccField] = useState('');
  const [showCc, setShowCc] = useState(ccField.length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(() => {
    if (!originalEmail) return '';
    const subj = originalEmail.subject || '';
    if (mode === 'reply' || mode === 'replyAll') return subj.startsWith('RE:') ? subj : `RE: ${subj}`;
    if (mode === 'forward') return subj.startsWith('FW:') ? subj : `FW: ${subj}`;
    return subj;
  });

  const buildQuotedBody = () => {
    if (!originalEmail) return '';
    const date = new Date(originalEmail.receivedAt).toLocaleString();
    const from = originalEmail.from.name
      ? `${originalEmail.from.name} &lt;${originalEmail.from.email}&gt;`
      : originalEmail.from.email;
    const to = originalEmail.to.map(t => t.name || t.email).join(', ');
    return `<br/><br/><hr style="border:none;border-top:1px solid #ccc;"/><p style="font-size:12px;color:#666;">On ${date}, ${from} wrote to ${to}:</p><blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:8px 0;color:#555;">${originalEmail.bodyHtml || originalEmail.bodyText.replace(/\n/g, '<br/>')}</blockquote>`;
  };

  const [bodyHtml, setBodyHtml] = useState(() => {
    if (mode !== 'new' && originalEmail) return buildQuotedBody();
    return '';
  });

  const [attachments, setAttachments] = useState<{ name: string; contentType: string; contentBytes: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const parseEmails = (field: string) =>
    field.split(/[,;]/).map(e => e.trim()).filter(Boolean);

  const handleSend = async () => {
    const toAddresses = parseEmails(toField);
    if (toAddresses.length === 0) {
      setError('Please enter at least one recipient.');
      return;
    }
    setSending(true);
    setError('');

    try {
      const htmlContent = bodyRef.current?.innerHTML || bodyHtml;

      if (mode === 'new') {
        await sendEmail(fromAccountId, {
          to: toAddresses,
          cc: parseEmails(ccField),
          bcc: parseEmails(bccField),
          subject,
          bodyHtml: htmlContent,
          attachments: attachments.length > 0 ? attachments : undefined,
        });
      } else if (mode === 'reply' && originalEmail) {
        await replyToEmail(originalEmail.accountId, originalEmail.id, htmlContent, toAddresses);
      } else if (mode === 'replyAll' && originalEmail) {
        await replyAllToEmail(originalEmail.accountId, originalEmail.id, htmlContent);
      } else if (mode === 'forward' && originalEmail) {
        await forwardEmail(originalEmail.accountId, originalEmail.id, toAddresses, htmlContent);
      }

      onSent?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const handleAttach = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          contentBytes: base64,
        }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const modeLabel = mode === 'new' ? 'New Email' : mode === 'reply' ? 'Reply' : mode === 'replyAll' ? 'Reply All' : 'Forward';

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-4 z-50 w-72 bg-navy-800 text-white rounded-t-lg shadow-2xl cursor-pointer flex items-center justify-between px-4 py-2"
        onClick={() => setMinimized(false)}
      >
        <span className="text-sm font-medium truncate">{modeLabel}: {subject || '(No Subject)'}</span>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setMinimized(false); }} className="p-1 hover:bg-white/20 rounded"><Maximize2 size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 hover:bg-white/20 rounded"><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-4 z-50 w-[600px] max-h-[80vh] bg-white dark:bg-slate-800 rounded-t-xl shadow-2xl border border-gray-200 dark:border-slate-600 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800 text-white rounded-t-xl">
        <span className="font-medium text-sm">{modeLabel}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(true)} className="p-1 hover:bg-white/20 rounded" title="Minimize"><Minus size={14} /></button>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded" title="Close"><X size={14} /></button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        {/* From account selector */}
        {mode === 'new' && accounts.length > 1 && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-600 px-4 py-2">
            <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">From:</label>
            <select
              value={fromAccountId}
              onChange={e => setFromAccountId(e.target.value)}
              className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white"
            >
              {accounts.filter(a => a.isConnected).map(a => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* To */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-600 px-4 py-2">
          <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">To:</label>
          <input
            type="text"
            value={toField}
            onChange={e => setToField(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
            {!showCc && <button onClick={() => setShowCc(true)}>Cc</button>}
            {!showBcc && <button onClick={() => setShowBcc(true)}>Bcc</button>}
          </div>
        </div>

        {/* Cc */}
        {showCc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-600 px-4 py-2">
            <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">Cc:</label>
            <input
              type="text"
              value={ccField}
              onChange={e => setCcField(e.target.value)}
              className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
        )}

        {/* Bcc */}
        {showBcc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-600 px-4 py-2">
            <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">Bcc:</label>
            <input
              type="text"
              value={bccField}
              onChange={e => setBccField(e.target.value)}
              className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-600 px-4 py-2">
          <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0">Subject:</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
          />
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
          className="min-h-[200px] max-h-[400px] overflow-y-auto px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none"
          style={{ lineHeight: 1.6 }}
        />

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-slate-600">
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
                  <Paperclip size={12} className="text-gray-500" />
                  <span className="text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{att.name}</span>
                  <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
            {error}
          </div>
        )}
      </div>

      {/* Footer / Action Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span>Send</span>
          </button>
          <button
            onClick={handleAttach}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          title="Discard"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default ComposeEmailModal;
