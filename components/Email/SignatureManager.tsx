import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Trash2, Check, Edit3, Star } from 'lucide-react';
import RichTextToolbar from './RichTextToolbar';

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
}

interface SignatureManagerProps {
  accountId: string;
  onClose: () => void;
  onSelect?: (signature: EmailSignature) => void;
  mode?: 'manage' | 'select'; // manage = full editor, select = quick pick
}

const STORAGE_KEY = 'emailSignatures';

// Utility functions for signature storage
export const getSignatures = (accountId: string): EmailSignature[] => {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[accountId] || [];
  } catch {
    return [];
  }
};

export const saveSignatures = (accountId: string, signatures: EmailSignature[]) => {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[accountId] = signatures;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save signatures:', err);
  }
};

export const getDefaultSignature = (accountId: string): EmailSignature | null => {
  const sigs = getSignatures(accountId);
  return sigs.find(s => s.isDefault) || sigs[0] || null;
};

const SignatureManager: React.FC<SignatureManagerProps> = ({ accountId, onClose, onSelect, mode = 'manage' }) => {
  const [signatures, setSignatures] = useState<EmailSignature[]>(() => getSignatures(accountId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const persist = (updated: EmailSignature[]) => {
    setSignatures(updated);
    saveSignatures(accountId, updated);
  };

  const handleCreate = () => {
    const html = editorRef.current?.innerHTML || '';
    if (!html.trim() && !newName.trim()) return;
    const id = `sig_${Date.now()}`;
    const name = newName.trim() || `Signature ${signatures.length + 1}`;
    const newSig: EmailSignature = {
      id,
      name,
      html,
      isDefault: signatures.length === 0,
    };
    persist([...signatures, newSig]);
    setNewName('');
    setIsCreating(false);
    // Switch to editing the newly created signature
    setEditingId(id);
    setEditName(name);
  };

  const handleUpdate = (id: string) => {
    const html = editorRef.current?.innerHTML || '';
    persist(signatures.map(s => s.id === id ? { ...s, name: editName, html } : s));
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = (id: string) => {
    const updated = signatures.filter(s => s.id !== id);
    // If deleted was default, make first one default
    if (updated.length > 0 && !updated.some(s => s.isDefault)) {
      updated[0].isDefault = true;
    }
    persist(updated);
    if (editingId === id) setEditingId(null);
  };

  const handleSetDefault = (id: string) => {
    persist(signatures.map(s => ({ ...s, isDefault: s.id === id })));
  };

  const startEditing = (sig: EmailSignature) => {
    setEditingId(sig.id);
    setEditName(sig.name);
    setIsCreating(false);
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = sig.html;
    }, 50);
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingId(null);
    setNewName('');
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = '';
    }, 50);
  };

  // Quick select mode
  if (mode === 'select') {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 py-1">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-600">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Signatures</span>
        </div>
        {signatures.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">
            No signatures yet
          </div>
        ) : (
          signatures.map(sig => (
            <button
              key={sig.id}
              onClick={() => onSelect?.(sig)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              {sig.isDefault && <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />}
              <span className="truncate text-gray-700 dark:text-gray-300">{sig.name}</span>
              {sig.isDefault && <span className="text-xs text-gray-400 ml-auto flex-shrink-0">default</span>}
            </button>
          ))
        )}
        <div className="border-t border-gray-200 dark:border-slate-600 mt-1 pt-1">
          <button
            onClick={() => onSelect?.({ id: 'none', name: 'No signature', html: '', isDefault: false })}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={12} />
            <span>No signature</span>
          </button>
        </div>
      </div>
    );
  }

  // Full manage mode
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-600">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Signatures</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Signature List */}
          <div className="w-48 border-r border-gray-200 dark:border-slate-600 flex flex-col bg-gray-50 dark:bg-slate-800/50">
            <div className="flex-1 overflow-y-auto py-2">
              {signatures.map(sig => (
                <div
                  key={sig.id}
                  onClick={() => startEditing(sig)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    editingId === sig.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700 border-l-4 border-l-transparent'
                  }`}
                >
                  {sig.isDefault && <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                  <span className="text-sm truncate text-gray-700 dark:text-gray-300">{sig.name}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-gray-200 dark:border-slate-600">
              <button
                onClick={startCreating}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg font-medium transition-colors"
              >
                <Plus size={14} />
                <span>New Signature</span>
              </button>
            </div>
          </div>

          {/* Editor Panel */}
          <div className="flex-1 flex flex-col">
            {(editingId || isCreating) ? (
              <>
                {/* Name input */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-600">
                  <label className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">Name:</label>
                  <input
                    type="text"
                    value={editingId ? editName : newName}
                    onChange={e => editingId ? setEditName(e.target.value) : setNewName(e.target.value)}
                    placeholder="Signature name"
                    className="flex-1 text-sm bg-transparent border border-gray-300 dark:border-slate-500 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Toolbar */}
                <RichTextToolbar editorRef={editorRef} />

                {/* Editor */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none min-h-[150px]"
                  style={{ lineHeight: 1.6 }}
                />

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-600">
                  <div className="flex items-center gap-2">
                    {editingId && (
                      <>
                        <button
                          onClick={() => handleSetDefault(editingId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                            signatures.find(s => s.id === editingId)?.isDefault
                              ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <Star size={12} className={signatures.find(s => s.id === editingId)?.isDefault ? 'fill-yellow-500' : ''} />
                          <span>{signatures.find(s => s.id === editingId)?.isDefault ? 'Default' : 'Set as default'}</span>
                        </button>
                        <button
                          onClick={() => handleDelete(editingId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Check size={14} />
                    <span>{editingId ? 'Save' : 'Create'}</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Edit3 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a signature to edit</p>
                  <p className="text-xs mt-1">or create a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignatureManager;
