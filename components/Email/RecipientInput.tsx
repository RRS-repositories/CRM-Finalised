import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, User, Building2, Loader2 } from 'lucide-react';

interface Recipient {
  email: string;
  name?: string;
}

interface ContactSuggestion {
  id: number;
  full_name: string;
  email: string;
  phone?: string;
}

interface RecipientInputProps {
  label: string;
  recipients: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  placeholder?: string;
}

const RecipientInput: React.FC<RecipientInputProps> = ({
  label,
  recipients,
  onChange,
  placeholder = 'Type name or email...',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch contact suggestions
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/paginated?search=${encodeURIComponent(query)}&limit=8&page=1`);
      if (res.ok) {
        const data = await res.json();
        const contacts: ContactSuggestion[] = (data.contacts || [])
          .filter((c: any) => c.email)
          .map((c: any) => ({
            id: c.id,
            full_name: c.full_name || '',
            email: c.email,
            phone: c.phone || '',
          }));
        setSuggestions(contacts);
        setShowSuggestions(contacts.length > 0);
        setHighlightedIndex(-1);
      }
    } catch (err) {
      console.error('Failed to search contacts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchContacts(val), 250);
  };

  const addRecipient = (recipient: Recipient) => {
    // Prevent duplicates
    if (recipients.some(r => r.email.toLowerCase() === recipient.email.toLowerCase())) return;
    onChange([...recipients, recipient]);
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeRecipient = (index: number) => {
    onChange(recipients.filter((_, i) => i !== index));
  };

  const handleSelectSuggestion = (suggestion: ContactSuggestion) => {
    addRecipient({ email: suggestion.email, name: suggestion.full_name });
  };

  // Parse raw email input (comma/semicolon/Enter separated)
  const commitRawInput = () => {
    const raw = inputValue.trim();
    if (!raw) return;

    const emails = raw.split(/[,;]/).map(e => e.trim()).filter(Boolean);
    const newRecipients: Recipient[] = [];
    for (const email of emails) {
      // Basic email validation
      if (email.includes('@')) {
        if (!recipients.some(r => r.email.toLowerCase() === email.toLowerCase())) {
          newRecipients.push({ email });
        }
      }
    }
    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients]);
    }
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Handle paste of comma-separated emails
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text.includes(',') || text.includes(';')) {
      e.preventDefault();
      const emails = text.split(/[,;]/).map(s => s.trim()).filter(s => s.includes('@'));
      const newRecipients: Recipient[] = [];
      for (const email of emails) {
        if (!recipients.some(r => r.email.toLowerCase() === email.toLowerCase())) {
          newRecipients.push({ email });
        }
      }
      if (newRecipients.length > 0) {
        onChange([...recipients, ...newRecipients]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (showSuggestions && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        e.preventDefault();
        commitRawInput();
      }
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      removeRecipient(recipients.length - 1);
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="flex items-start border-b border-gray-200 dark:border-slate-600 px-4 py-2" ref={containerRef}>
      <label className="text-sm text-gray-500 dark:text-gray-400 w-14 flex-shrink-0 pt-1">{label}:</label>
      <div className="flex-1 min-w-0 relative">
        <div className="flex flex-wrap items-center gap-1">
          {/* Recipient chips */}
          {recipients.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium max-w-[200px] group"
              title={r.name ? `${r.name} <${r.email}>` : r.email}
            >
              <span className="truncate">{r.name || r.email}</span>
              <button
                onClick={() => removeRecipient(i)}
                className="flex-shrink-0 hover:text-red-500 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {/* Input field */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => {
                if (inputValue.trim()) commitRawInput();
              }, 200);
            }}
            onPaste={handlePaste}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder={recipients.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400 py-0.5"
          />
          {loading && <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-[60] py-1 max-h-60 overflow-y-auto"
          >
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  i === highlightedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(s.full_name || s.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {s.full_name || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {s.email}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipientInput;
