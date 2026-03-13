import React, { useState, useRef, useEffect } from 'react';
import {
  X, Send, Paperclip, Trash2, Loader2, Minus, Maximize2, Minimize2, Save,
  FileSignature, Settings, ChevronDown
} from 'lucide-react';
import { EmailAccount } from '../../types';
import { sendEmail, replyToEmail, replyAllToEmail, forwardEmail, saveDraft, fetchAttachmentsBase64 } from '../../services/emailApiService';
import RichTextToolbar from './RichTextToolbar';
import RecipientInput from './RecipientInput';
import SignatureManager, { getDefaultSignature, getSignatures, EmailSignature } from './SignatureManager';

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';

interface Recipient {
  email: string;
  name?: string;
}

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
    hasAttachments?: boolean;
    attachments?: { id: string; filename: string; mimeType: string; size: number }[];
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

  // Recipient state as structured arrays
  const [toRecipients, setToRecipients] = useState<Recipient[]>(() => {
    if (mode === 'draft' && originalEmail) return originalEmail.to.map(t => ({ email: t.email, name: t.name }));
    if (mode === 'reply' && originalEmail) return [{ email: originalEmail.from.email, name: originalEmail.from.name }];
    if (mode === 'replyAll' && originalEmail) {
      const all = [
        { email: originalEmail.from.email, name: originalEmail.from.name },
        ...originalEmail.to.map(t => ({ email: t.email, name: t.name })),
      ];
      const currentAccount = accounts.find(a => a.id === (originalEmail.accountId || defaultAccountId));
      const filtered = currentAccount
        ? all.filter(r => r.email.toLowerCase() !== currentAccount.email.toLowerCase())
        : all;
      // Deduplicate by email
      const seen = new Set<string>();
      return filtered.filter(r => {
        const key = r.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return [];
  });
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>(() => {
    if (mode === 'draft' && originalEmail?.cc) return originalEmail.cc.map(c => ({ email: c.email, name: c.name }));
    if (mode === 'replyAll' && originalEmail?.cc) return originalEmail.cc.map(c => ({ email: c.email, name: c.name }));
    return [];
  });
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(ccRecipients.length > 0);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(() => {
    if (!originalEmail) return '';
    const subj = originalEmail.subject || '';
    if (mode === 'draft') return subj;
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

  // Build initial body with signature
  const buildInitialBody = () => {
    const accountId = originalEmail?.accountId || defaultAccountId || accounts[0]?.id || '';
    const sig = getDefaultSignature(accountId);
    const sigHtml = sig ? `<div class="email-signature" data-signature-id="${sig.id}"><br/><br/>--<br/>${sig.html}</div>` : '';

    if (mode === 'draft' && originalEmail) {
      return originalEmail.bodyHtml || originalEmail.bodyText.replace(/\n/g, '<br/>') || '';
    }
    if (mode !== 'new' && originalEmail) {
      return sigHtml + buildQuotedBody();
    }
    return sigHtml;
  };

  const [bodyHtml] = useState(buildInitialBody);

  const [attachments, setAttachments] = useState<{ name: string; contentType: string; contentBytes: string }[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [showSignatureSelect, setShowSignatureSelect] = useState(false);
  const [showSignatureManager, setShowSignatureManager] = useState(false);
  const [size, setSize] = useState({ width: 640, height: 550 });
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const signatureRef = useRef<HTMLDivElement>(null);

  // Resize overlay prevents contentEditable from stealing mouse events during drag
  const [resizeOverlay, setResizeOverlay] = useState(false);

  const startResize = (e: React.MouseEvent, axis: 'top' | 'left' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    setResizeOverlay(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };

    const handleMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const dx = resizeStart.current.x - ev.clientX;
      const dy = resizeStart.current.y - ev.clientY;
      if (axis === 'top') {
        setSize(prev => ({ ...prev, height: Math.max(400, Math.min(resizeStart.current.h + dy, window.innerHeight - 40)) }));
      } else if (axis === 'left') {
        setSize(prev => ({ ...prev, width: Math.max(480, Math.min(resizeStart.current.w + dx, window.innerWidth - 40)) }));
      } else {
        setSize({
          width: Math.max(480, Math.min(resizeStart.current.w + dx, window.innerWidth - 40)),
          height: Math.max(400, Math.min(resizeStart.current.h + dy, window.innerHeight - 40)),
        });
      }
    };
    const handleUp = () => {
      isResizing.current = false;
      setResizeOverlay(false);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  // Load attachments when editing a draft that has them
  useEffect(() => {
    if (mode === 'draft' && originalEmail && (originalEmail.hasAttachments || (originalEmail.attachments && originalEmail.attachments.length > 0))) {
      setLoadingAttachments(true);
      fetchAttachmentsBase64(originalEmail.accountId, originalEmail.id)
        .then(atts => {
          setAttachments(atts.map(a => ({
            name: a.name,
            contentType: a.contentType,
            contentBytes: a.contentBytes,
          })));
        })
        .catch(err => {
          console.error('Failed to load draft attachments:', err);
        })
        .finally(() => setLoadingAttachments(false));
    }
  }, []);

  const handleSend = async () => {
    if (toRecipients.length === 0) {
      setError('Please enter at least one recipient.');
      return;
    }
    setSending(true);
    setError('');

    try {
      const htmlContent = bodyRef.current?.innerHTML || bodyHtml;
      const toAddresses = toRecipients.map(r => r.email);
      const ccAddresses = ccRecipients.map(r => r.email);
      const bccAddresses = bccRecipients.map(r => r.email);

      if (mode === 'new' || mode === 'draft') {
        await sendEmail(fromAccountId, {
          to: toAddresses,
          cc: ccAddresses.length > 0 ? ccAddresses : undefined,
          bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
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

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError('');
    setDraftSaved(false);
    try {
      const htmlContent = bodyRef.current?.innerHTML || bodyHtml;
      await saveDraft(fromAccountId, {
        to: toRecipients.map(r => r.email),
        cc: ccRecipients.map(r => r.email),
        bcc: bccRecipients.map(r => r.email),
        subject,
        bodyHtml: htmlContent,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save draft');
    } finally {
      setSavingDraft(false);
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

  // Handle signature selection
  const handleSelectSignature = (sig: EmailSignature) => {
    setShowSignatureSelect(false);
    if (!bodyRef.current) return;

    // Remove existing signature
    const existingSig = bodyRef.current.querySelector('.email-signature');
    if (existingSig) existingSig.remove();

    // Insert new signature (if not "none")
    if (sig.id !== 'none' && sig.html) {
      const sigDiv = document.createElement('div');
      sigDiv.className = 'email-signature';
      sigDiv.setAttribute('data-signature-id', sig.id);
      sigDiv.innerHTML = `<br/><br/>--<br/>${sig.html}`;

      // Insert before quoted text or at the end
      const hr = bodyRef.current.querySelector('hr');
      if (hr) {
        bodyRef.current.insertBefore(sigDiv, hr);
      } else {
        bodyRef.current.appendChild(sigDiv);
      }
    }
  };

  const modeLabel = mode === 'new' ? 'New Email' : mode === 'reply' ? 'Reply' : mode === 'replyAll' ? 'Reply All' : mode === 'forward' ? 'Forward' : 'Edit Draft';

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
    <>
      <div
        className={`fixed bottom-0 right-4 z-50 bg-white dark:bg-slate-800 shadow-2xl border border-gray-200 dark:border-slate-600 flex flex-col rounded-t-xl`}
        style={maximized
          ? { width: 'calc(100vw - 280px)', height: 'calc(100vh - 60px)', maxHeight: 'calc(100vh - 60px)' }
          : { width: `${size.width}px`, height: `${size.height}px`, maxHeight: '95vh' }
        }
      >
        {/* Resize edges - top, left, and top-left corner */}
        {!maximized && (
          <>
            <div onMouseDown={e => startResize(e, 'top')} className="absolute top-0 left-3 right-3 h-1.5 cursor-n-resize z-10 hover:bg-blue-400/30 rounded-t transition-colors" />
            <div onMouseDown={e => startResize(e, 'left')} className="absolute top-3 left-0 bottom-3 w-1.5 cursor-w-resize z-10 hover:bg-blue-400/30 rounded-l transition-colors" />
            <div onMouseDown={e => startResize(e, 'corner')} className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-20" />
          </>
        )}

        {/* Invisible overlay during resize to prevent contentEditable from stealing mouse events */}
        {resizeOverlay && <div className="fixed inset-0 z-[9999]" style={{ cursor: 'nw-resize' }} />}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800 text-white flex-shrink-0 rounded-t-xl">
          <span className="font-medium text-sm">{modeLabel}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setMinimized(true)} className="p-1 hover:bg-white/20 rounded" title="Minimize"><Minus size={14} /></button>
            <button onClick={() => setMaximized(v => !v)} className="p-1 hover:bg-white/20 rounded" title={maximized ? 'Restore' : 'Maximize'}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded" title="Close"><X size={14} /></button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
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

          {/* To - with autocomplete */}
          <div className="relative">
            <RecipientInput
              label="To"
              recipients={toRecipients}
              onChange={setToRecipients}
              placeholder="Type name or email..."
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
              {!showCc && <button onClick={() => setShowCc(true)}>Cc</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)}>Bcc</button>}
            </div>
          </div>

          {/* Cc - with autocomplete */}
          {showCc && (
            <RecipientInput
              label="Cc"
              recipients={ccRecipients}
              onChange={setCcRecipients}
            />
          )}

          {/* Bcc - with autocomplete */}
          {showBcc && (
            <RecipientInput
              label="Bcc"
              recipients={bccRecipients}
              onChange={setBccRecipients}
            />
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

          {/* Rich Text Toolbar */}
          <RichTextToolbar editorRef={bodyRef} />

          {/* Body */}
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
            className="flex-1 min-h-[100px] overflow-y-auto px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none"
            style={{ lineHeight: 1.6, fontFamily: 'Tahoma, Geneva, sans-serif' }}
          />

          {/* Attachments */}
          {(attachments.length > 0 || loadingAttachments) && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-slate-600">
              <div className="flex flex-wrap gap-2">
                {loadingAttachments && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Loading attachments...</span>
                  </div>
                )}
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
              onClick={handleSaveDraft}
              disabled={savingDraft || sending}
              className="flex items-center gap-1.5 px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 text-sm rounded-lg transition-colors"
              title="Save as Draft"
            >
              {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{draftSaved ? 'Saved!' : 'Draft'}</span>
            </button>
            <button
              onClick={handleAttach}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              title="Attach files"
            >
              <Paperclip size={16} />
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />

            {/* Signature selector */}
            <div className="relative" ref={signatureRef}>
              <button
                onClick={() => setShowSignatureSelect(v => !v)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                title="Insert signature"
              >
                <FileSignature size={16} />
              </button>
              {showSignatureSelect && (
                <SignatureManager
                  accountId={fromAccountId}
                  mode="select"
                  onClose={() => setShowSignatureSelect(false)}
                  onSelect={handleSelectSignature}
                />
              )}
            </div>

            {/* Manage Signatures */}
            <button
              onClick={() => setShowSignatureManager(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
              title="Manage signatures"
            >
              <Settings size={16} />
            </button>
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

      {/* Signature Manager Modal */}
      {showSignatureManager && (
        <SignatureManager
          accountId={fromAccountId}
          mode="manage"
          onClose={() => setShowSignatureManager(false)}
        />
      )}
    </>
  );
};

export default ComposeEmailModal;
