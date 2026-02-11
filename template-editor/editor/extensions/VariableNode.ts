// template-editor/editor/extensions/VariableNode.ts
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (attrs: { fieldKey: string; label: string }) => ReturnType;
    };
  }
}

export const VariableNode = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true, // Treated as a single indivisible unit

  addAttributes() {
    return {
      fieldKey: {
        default: null,
      },
      label: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-variable]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable': node.attrs.fieldKey,
        class: 'crm-variable-chip',
        contenteditable: 'false',
      }),
      `{{${node.attrs.label}}}`,
    ];
  },

  addCommands() {
    return {
      insertVariable:
        (attrs: { fieldKey: string; label: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
