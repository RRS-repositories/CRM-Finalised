// template-editor/editor/extensions/SignatureNode.ts
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    signatureField: {
      insertSignatureField: (attrs: { signerLabel: string; fieldId: string }) => ReturnType;
    };
  }
}

export const SignatureNode = Node.create({
  name: 'signatureField',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      signerLabel: {
        default: 'Signature',
      },
      fieldId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-signature]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-signature': node.attrs.fieldId,
        class: 'signature-field-placeholder',
        contenteditable: 'false',
      }),
      [
        'div',
        { class: 'signature-field-inner' },
        ['span', { class: 'signature-icon' }, '\u270D'],
        ['span', { class: 'signature-label' }, node.attrs.signerLabel],
        ['span', { class: 'signature-line' }],
      ],
    ];
  },

  addCommands() {
    return {
      insertSignatureField:
        (attrs: { signerLabel: string; fieldId: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
