// template-editor/editor/PageEditor.tsx
// A single TipTap editor instance for one page

import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontSize from '../../editor/extensions/FontSize';
import { ParagraphSpacing } from './extensions/ParagraphSpacing';
import { VariableNode } from './extensions/VariableNode';
import { SignatureNode } from './extensions/SignatureNode';
import { PAGE_CONFIG } from '../constants';
import type { Editor } from '@tiptap/core';
import type { SplitResult } from '../types';

// Extend Image to support width/height from imported DOCX
// Renders dimensions as inline style for reliable sizing
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('width') ||
          element.style.width?.replace('px', '') ||
          null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          const w = parseInt(attributes.width, 10);
          if (isNaN(w)) return {};
          return { style: `width: ${w}px` };
        },
      },
      height: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('height') ||
          element.style.height?.replace('px', '') ||
          null,
        renderHTML: (attributes) => {
          // Height is auto-calculated from width via CSS
          if (!attributes.height) return {};
          return {};
        },
      },
    };
  },
});

interface PageEditorProps {
  pageIndex: number;
  initialContent?: Record<string, unknown>;
  isFirstPage?: boolean;
  onOverflow: (pageIndex: number, splitResult: SplitResult) => void;
  onFocus: (pageIndex: number, editor: Editor) => void;
  onEditorReady?: (pageIndex: number, editor: Editor) => void;
  onUpdate?: () => void;
  onKeyDown?: (pageIndex: number, event: KeyboardEvent) => void;
}

const PageEditor: React.FC<PageEditorProps> = ({
  pageIndex,
  initialContent,
  isFirstPage = false,
  onOverflow,
  onFocus,
  onEditorReady,
  onUpdate,
  onKeyDown,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const checkingOverflow = useRef(false);
  const initialContentSet = useRef(false);
  const suppressOverflow = useRef(false);
  // Store callbacks in refs so they're always current in editor hooks
  const onFocusRef = useRef(onFocus);
  const onKeyDownRef = useRef(onKeyDown);
  const onUpdateRef = useRef(onUpdate);
  const onOverflowRef = useRef(onOverflow);
  const onEditorReadyRef = useRef(onEditorReady);
  onFocusRef.current = onFocus;
  onKeyDownRef.current = onKeyDown;
  onUpdateRef.current = onUpdate;
  onEditorReadyRef.current = onEditorReady;
  onOverflowRef.current = onOverflow;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Underline,
      ResizableImage.configure({
        allowBase64: true,
        inline: false,
      }),
      Placeholder.configure({
        placeholder: isFirstPage ? 'Start typing your template content here...' : '',
      }),
      TextStyle,
      Color,
      FontSize,
      ParagraphSpacing,
      VariableNode,
      SignatureNode,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'te-tiptap-editor',
      },
      handleKeyDown: (_view, event) => {
        onKeyDownRef.current?.(pageIndex, event);
        return false;
      },
    },
    onUpdate: () => {
      onUpdateRef.current?.();
    },
  });

  // Define checkOverflow before useEffects that reference it
  const checkOverflow = useCallback(() => {
    if (!editor || !contentRef.current || checkingOverflow.current || suppressOverflow.current) return;

    const el = contentRef.current.querySelector('.ProseMirror') as HTMLElement;
    if (!el) return;

    if (el.scrollHeight > PAGE_CONFIG.contentHeight) {
      checkingOverflow.current = true;

      const result = splitAtOverflow(editor, PAGE_CONFIG.contentHeight, el);
      if (result) {
        onOverflowRef.current(pageIndex, result);
      }

      // Brief cooldown to prevent double-fires; the cascade continues
      // in the *next* page's own checkOverflow, not here.
      setTimeout(() => {
        checkingOverflow.current = false;
      }, 150);
    }
  }, [editor, pageIndex]);

  // Register editor with parent as soon as it's available (so getAllContent works)
  useEffect(() => {
    if (editor) {
      onEditorReadyRef.current?.(pageIndex, editor);
    }
  }, [editor, pageIndex]);

  // Register focus handler once editor is available
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      onFocusRef.current(pageIndex, editor);
    };
    editor.on('focus', handler);
    return () => {
      editor.off('focus', handler);
    };
  }, [editor, pageIndex]);

  // Register update handler for overflow checking
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      requestAnimationFrame(() => checkOverflow());
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, checkOverflow]);

  // Set initial content once
  useEffect(() => {
    if (editor && initialContent && !initialContentSet.current) {
      initialContentSet.current = true;
      // Suppress overflow briefly to prevent rapid cascade jitter on mount.
      // After content settles, run ONE overflow check to split content that
      // doesn't fit (e.g. saved single-page content that's too tall).
      suppressOverflow.current = true;
      editor.commands.setContent(initialContent);
      setTimeout(() => {
        suppressOverflow.current = false;
        // Single deferred overflow check — splits content that exceeds the page
        requestAnimationFrame(() => checkOverflow());
      }, 600);
    }
  }, [editor, initialContent, checkOverflow]);

  // ResizeObserver for overflow detection
  useEffect(() => {
    if (!contentRef.current) return;

    const proseMirror = contentRef.current.querySelector('.ProseMirror');
    if (!proseMirror) return;

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });

    observer.observe(proseMirror);

    return () => observer.disconnect();
  }, [editor, checkOverflow]);

  return (
    <div className="te-page-content" ref={contentRef}>
      <EditorContent editor={editor} />
    </div>
  );
};

// Split content at the overflow point using binary search
function splitAtOverflow(
  editor: Editor,
  maxHeight: number,
  editorEl: HTMLElement
): SplitResult | null {
  const json = editor.getJSON();
  const nodes = json.content ?? [];

  if (nodes.length <= 1) return null;

  // Binary search for the split point
  let lo = 1;
  let hi = nodes.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    editor.commands.setContent({ type: 'doc', content: nodes.slice(0, mid) });

    if (editorEl.scrollHeight <= maxHeight) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const keptNodes = nodes.slice(0, lo);
  const overflowNodes = nodes.slice(lo);

  // Set editor to kept content
  editor.commands.setContent({ type: 'doc', content: keptNodes });

  return {
    kept: { type: 'doc', content: keptNodes },
    overflow: overflowNodes.length > 0 ? { type: 'doc', content: overflowNodes } : null,
  };
}

// Export getEditor for parent access
export { PageEditor };
export type { PageEditorProps };
export default PageEditor;
