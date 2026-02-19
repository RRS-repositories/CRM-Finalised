import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Copy, ClipboardCheck } from 'lucide-react';
import { OO_MERGE_FIELDS } from '../../constants';

interface MergeFieldPickerProps {
  onFieldSelect?: (fieldKey: string) => void;
  onCopied?: (field: string) => void;
}

const MergeFieldPicker: React.FC<MergeFieldPickerProps> = ({ onFieldSelect, onCopied }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {OO_MERGE_FIELDS.map((group) => (
            <div key={group.group}>
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
                <span className="ml-auto text-xs text-gray-400">{group.fields.length}</span>
              </button>

              {expandedGroups.has(group.group) && (
                <div className="pb-1">
                  {group.fields.map((field) => (
                    <button
                      key={field.key}
                      onClick={() => handleFieldClick(field.key)}
                      className="w-full flex items-center justify-between px-3 py-1.5 pl-9 text-sm text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <span className="font-mono text-xs">
                        {`{{${field.key}}}`}
                      </span>
                      {copiedField === field.key ? (
                        <ClipboardCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <span className="text-xs text-gray-400 flex-shrink-0">{field.label}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MergeFieldPicker;
