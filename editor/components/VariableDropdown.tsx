import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Plus } from 'lucide-react';

export interface VariableSuggestionItem {
  id: string;
  name: string;
  key: string;
  category: string;
}

interface VariableDropdownProps {
  items: VariableSuggestionItem[];
  command: (item: VariableSuggestionItem) => void;
}

const categoryLabels: Record<string, string> = {
  client: 'Client Details',
  claim: 'Claim Details',
  lender: 'Lender Details',
  system: 'System / Firm',
  custom: 'Custom Variables',
};

const categoryColors: Record<string, string> = {
  client: '#FF9800',
  claim: '#2196F3',
  lender: '#E91E63',
  system: '#9C27B0',
  custom: '#4CAF50',
};

export const VariableDropdown = forwardRef<any, VariableDropdownProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev <= 0 ? items.length - 1 : prev - 1
          );
          return true;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedIndex((prev) =>
            prev >= items.length - 1 ? 0 : prev + 1
          );
          return true;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (items[selectedIndex]) {
            command(items[selectedIndex]);
          }
          return true;
        }
        if (event.key === 'Escape') {
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: '1px solid #e5e7eb',
            padding: '12px 16px',
            minWidth: '260px',
          }}
        >
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>
            No matching variables found.
          </div>
        </div>
      );
    }

    // Group items by category
    const grouped: Record<string, VariableSuggestionItem[]> = {};
    items.forEach((item) => {
      const cat = item.category || 'custom';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });

    let flatIndex = 0;

    return (
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          minWidth: '300px',
          maxHeight: '340px',
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #f3f4f6',
            fontSize: '10px',
            fontWeight: 700,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Insert Variable
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
          {Object.entries(grouped).map(([category, vars]) => (
            <div key={category}>
              <div
                style={{
                  padding: '6px 12px 4px',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: categoryColors[category] || '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {categoryLabels[category] || category}
              </div>
              {vars.map((item) => {
                const currentIndex = flatIndex++;
                const isSelected = currentIndex === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={() => command(item)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      color: isSelected ? '#1d4ed8' : '#374151',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{item.name}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        color: '#9ca3af',
                      }}
                    >
                      [{item.key}]
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

VariableDropdown.displayName = 'VariableDropdown';

export default VariableDropdown;
