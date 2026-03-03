import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Copy, ClipboardCheck, Plus, Loader2 } from 'lucide-react';
import { OO_MERGE_FIELDS } from '../../constants';

interface MergeFieldPickerProps {
  onFieldSelect?: (fieldKey: string) => void;
  onCopied?: (field: string) => void;
}

interface CustomField {
  id: number;
  key: string;
  label: string;
  defaultValue?: string;
  description?: string;
}

interface CustomGroup {
  group: string;
  fields: CustomField[];
}

const MergeFieldPicker: React.FC<MergeFieldPickerProps> = ({ onFieldSelect, onCopied }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldGroup, setNewFieldGroup] = useState('Custom');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fetch custom merge fields when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setLoadingCustom(true);
      fetch('/api/oo/merge-fields')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.customFields) {
            setCustomGroups(data.customFields);
          }
        })
        .catch(err => console.warn('[MergeFieldPicker] Failed to load custom fields:', err))
        .finally(() => setLoadingCustom(false));
    }
  }, [isOpen]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleFieldClick = async (key: string) => {
    if (onFieldSelect) {
      setCopiedField(key);
      await onFieldSelect(key);
      setTimeout(() => setCopiedField(null), 2000);
      return;
    }

    // Legacy clipboard fallback
    const text = `{{${key}}}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      onCopied?.(text);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(key);
      onCopied?.(text);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleAddField = async () => {
    if (!newFieldKey || !newFieldLabel) return;
    try {
      const res = await fetch('/api/oo/merge-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newFieldKey, label: newFieldLabel, group: newFieldGroup }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh custom fields
        const refreshRes = await fetch('/api/oo/merge-fields');
        const refreshData = await refreshRes.json();
        if (refreshData.success) setCustomGroups(refreshData.customFields || []);
        setNewFieldKey('');
        setNewFieldLabel('');
        setNewFieldGroup('Custom');
        setShowAddForm(false);
      }
    } catch (err) {
      console.error('[MergeFieldPicker] Failed to create field:', err);
    }
  };

  const handleDeleteField = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/oo/merge-fields/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCustomGroups(prev =>
          prev.map(g => ({
            ...g,
            fields: g.fields.filter(f => f.id !== id),
          })).filter(g => g.fields.length > 0)
        );
      }
    } catch (err) {
      console.error('[MergeFieldPicker] Failed to delete field:', err);
    }
  };

  // Combine built-in and custom groups
  const allGroups = [
    ...OO_MERGE_FIELDS.map(g => ({ ...g, custom: false })),
    ...customGroups.map(g => ({ group: g.group, fields: g.fields.map(f => ({ key: f.key, label: f.label, id: f.id })), custom: true })),
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
      >
        <Copy className="w-4 h-4" />
        Insert Field
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 max-h-[28rem] overflow-y-auto">
          {allGroups.map((group) => (
            <div key={`${group.custom ? 'custom-' : ''}${group.group}`}>
              <button
                onClick={() => toggleGroup(group.group)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                {expandedGroups.has(group.group) ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                {group.group}
                {group.custom && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
                    Custom
                  </span>
                )}
                <span className="ml-auto text-xs text-gray-400">{group.fields.length}</span>
              </button>

              {expandedGroups.has(group.group) && (
                <div className="pb-1">
                  {group.fields.map((field) => (
                    <button
                      key={field.key}
                      onClick={() => handleFieldClick(field.key)}
                      className="w-full flex items-center justify-between px-3 py-1.5 pl-9 text-sm text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors group"
                    >
                      <span className="font-mono text-xs">
                        {`{{${field.key}}}`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {copiedField === field.key ? (
                          <ClipboardCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <span className="text-xs text-gray-400 flex-shrink-0">{field.label}</span>
                        )}
                        {group.custom && 'id' in field && (
                          <button
                            onClick={(e) => handleDeleteField((field as CustomField).id, e)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs ml-1"
                            title="Remove field"
                          >
                            x
                          </button>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loadingCustom && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              <span className="ml-2 text-xs text-gray-400">Loading custom fields...</span>
            </div>
          )}

          {/* Add Custom Field Section */}
          <div className="border-t border-gray-200 dark:border-slate-600 mt-1">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Custom Field
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">New Custom Field</div>
                <input
                  type="text"
                  placeholder="Field key (e.g. custom.myField)"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
                />
                <input
                  type="text"
                  placeholder="Display label"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
                />
                <select
                  value={newFieldGroup}
                  onChange={(e) => setNewFieldGroup(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
                >
                  <option value="Custom">Custom</option>
                  <option value="Client">Client</option>
                  <option value="Claim">Claim</option>
                  <option value="Lender">Lender</option>
                  <option value="Firm">Firm</option>
                  <option value="System">System</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddField}
                    disabled={!newFieldKey || !newFieldLabel}
                    className="flex-1 px-2 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowAddForm(false); setNewFieldKey(''); setNewFieldLabel(''); }}
                    className="flex-1 px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MergeFieldPicker;
