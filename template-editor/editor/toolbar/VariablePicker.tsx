// template-editor/editor/toolbar/VariablePicker.tsx
// Dropdown to insert CRM variable chips

import React, { useState, useRef, useEffect } from 'react';
import type { CRMVariable } from '../../types';

interface VariablePickerProps {
  variables: CRMVariable[];
  onInsert: (variable: CRMVariable) => void;
}

const VariablePicker: React.FC<VariablePickerProps> = ({ variables, onInsert }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Group variables by category
  const grouped = variables.reduce((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {} as Record<string, CRMVariable[]>);

  // Filter by search
  const filteredGrouped = Object.entries(grouped).reduce((acc, [cat, vars]) => {
    const filtered = vars.filter(
      (v) =>
        v.label.toLowerCase().includes(search.toLowerCase()) ||
        v.key.toLowerCase().includes(search.toLowerCase())
    );
    if (filtered.length > 0) acc[cat] = filtered;
    return acc;
  }, {} as Record<string, CRMVariable[]>);

  return (
    <div className="te-variable-picker" ref={wrapperRef}>
      <button
        className="te-variable-picker-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {'{ }'} Variables {isOpen ? '\u25B4' : '\u25BE'}
      </button>

      <div className={`te-variable-picker-dropdown ${isOpen ? 'te-open' : ''}`}>
        {/* Search */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>
          <input
            type="text"
            placeholder="Search variables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid #ddd',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 12,
              outline: 'none',
            }}
            autoFocus={isOpen}
          />
        </div>

        {Object.entries(filteredGrouped).map(([category, vars]) => (
          <div key={category}>
            <div className="te-variable-group-label">{category}</div>
            {vars.map((v) => (
              <div
                key={v.key}
                className="te-variable-item"
                onClick={() => {
                  onInsert(v);
                  setIsOpen(false);
                  setSearch('');
                }}
                title={v.key}
              >
                {v.label}{' '}
                <span style={{ fontSize: 9, color: '#999' }}>
                  {`{{${v.key}}}`}
                </span>
              </div>
            ))}
          </div>
        ))}

        {Object.keys(filteredGrouped).length === 0 && (
          <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: 12 }}>
            No variables found
          </div>
        )}
      </div>
    </div>
  );
};

export default VariablePicker;
