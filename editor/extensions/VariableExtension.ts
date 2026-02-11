import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import VariableChip from '../components/VariableChip';

export const VariableNode = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: null },
      name: { default: '' },
      category: { default: 'custom' },
      key: { default: '' },
      value: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="variable"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-type': 'variable', class: 'variable-chip' },
        HTMLAttributes
      ),
      `[${HTMLAttributes.name}]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableChip);
  },
});
