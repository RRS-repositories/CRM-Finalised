import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';

const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  client: { bg: '#FFF3E0', border: '#FF9800', text: '#E65100' },
  claim: { bg: '#E3F2FD', border: '#2196F3', text: '#0D47A1' },
  system: { bg: '#F3E5F5', border: '#9C27B0', text: '#4A148C' },
  custom: { bg: '#E8F5E9', border: '#4CAF50', text: '#1B5E20' },
};

const VariableChip: React.FC<any> = ({ node, selected }) => {
  const { name, value, category } = node.attrs;
  const colors = categoryColors[category] || categoryColors.custom;

  return (
    <NodeViewWrapper
      as="span"
      className={`variable-chip-inline ${selected ? 'selected' : ''}`}
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        padding: '1px 8px',
        borderRadius: '4px',
        fontSize: '0.9em',
        fontWeight: 500,
        cursor: 'pointer',
        display: 'inline',
        whiteSpace: 'nowrap' as const,
        userSelect: 'none' as const,
        outline: selected ? `2px solid ${colors.border}` : 'none',
        outlineOffset: '1px',
      }}
      title={`Variable: ${name}\nKey: ${node.attrs.key}`}
    >
      {value || name}
    </NodeViewWrapper>
  );
};

export default VariableChip;
