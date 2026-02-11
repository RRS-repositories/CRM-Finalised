// template-editor/editor/extensions/ParagraphSpacing.ts
// Adds paragraph-level spacing/margin/indent attributes that survive DOCX import

import { Extension } from '@tiptap/core';

export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          marginTop: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const v = element.style.marginTop;
              return v && v !== '0px' && v !== '0' ? v : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.marginTop) return {};
              return { style: `margin-top: ${attributes.marginTop}` };
            },
          },
          marginBottom: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const v = element.style.marginBottom;
              return v && v !== '0px' && v !== '0' ? v : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.marginBottom) return {};
              return { style: `margin-bottom: ${attributes.marginBottom}` };
            },
          },
          marginLeft: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const v = element.style.marginLeft || element.style.paddingLeft;
              return v && v !== '0px' && v !== '0' ? v : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.marginLeft) return {};
              return { style: `margin-left: ${attributes.marginLeft}` };
            },
          },
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const v = element.style.lineHeight;
              return v && v !== 'normal' ? v : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },
});
