// template-editor/page-manager/PageManager.tsx
// Manages the array of pages, each with its own TipTap editor

import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import PageEditor from '../editor/PageEditor';
import type { Editor } from '@tiptap/core';
import type { SplitResult, PageContent } from '../types';

interface PageState {
  id: string;
  initialContent?: Record<string, unknown>;
}

export interface PageManagerHandle {
  getActiveEditor: () => Editor | null;
  getAllContent: () => PageContent[];
  setPages: (pages: Record<string, unknown>[]) => void;
  addBlankPage: () => void;
  getPageCount: () => number;
  focusPage: (index: number) => void;
}

interface PageManagerProps {
  onActiveEditorChange: (editor: Editor | null) => void;
  onContentChange?: () => void;
  initialPages?: Record<string, unknown>[];
  headerText?: string;
  footerText?: string;
}

const PageManager = forwardRef<PageManagerHandle, PageManagerProps>(
  ({ onActiveEditorChange, onContentChange, initialPages, headerText, footerText }, ref) => {
    // Initialize pages from prop (saved content) or start with one blank page.
    // Using initializer function so this only runs once on mount.
    const [pages, setPages] = useState<PageState[]>(() => {
      if (initialPages && initialPages.length > 0) {
        return initialPages.map((content, i) => ({
          id: `page-init-${Date.now()}-${i}`,
          initialContent: content,
        }));
      }
      return [{ id: `page-${Date.now()}` }];
    });

    const activeEditorRef = useRef<Editor | null>(null);
    const editorsRef = useRef<Map<string, Editor>>(new Map());
    const activePageIndexRef = useRef(0);
    const pagesRef = useRef(pages);
    pagesRef.current = pages;

    // Handle overflow from a page — inserts a new page after the overflowing one
    // The new page will itself trigger checkOverflow if its content is too tall,
    // creating a cascade that paginates the entire document automatically.
    const handleOverflow = useCallback(
      (pageIndex: number, splitResult: SplitResult) => {
        if (!splitResult.overflow) return;

        setPages((prev) => {
          const newPages = [...prev];
          const nextPageIndex = pageIndex + 1;

          // If there's already a page after this one, prepend overflow to it
          if (nextPageIndex < newPages.length) {
            const existingNextPage = newPages[nextPageIndex];
            const existingContent = existingNextPage.initialContent as any;
            const overflowContent = splitResult.overflow as any;

            // Merge overflow nodes before existing next-page nodes
            const mergedNodes = [
              ...(overflowContent?.content ?? []),
              ...(existingContent?.content ?? []),
            ];

            newPages[nextPageIndex] = {
              ...existingNextPage,
              id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              initialContent: { type: 'doc', content: mergedNodes },
            };
          } else {
            // No next page — create one
            const newPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            newPages.splice(nextPageIndex, 0, {
              id: newPageId,
              initialContent: splitResult.overflow as Record<string, unknown>,
            });
          }

          return newPages;
        });
      },
      []
    );

    // Register editor in editorsRef as soon as it's created (before user focus)
    const handleEditorReady = useCallback(
      (pageIndex: number, editor: Editor) => {
        const pageId = pagesRef.current[pageIndex]?.id;
        if (pageId) {
          editorsRef.current.set(pageId, editor);
        }
      },
      []
    );

    // Handle focus on a page
    const handleFocus = useCallback(
      (pageIndex: number, editor: Editor) => {
        activeEditorRef.current = editor;
        activePageIndexRef.current = pageIndex;
        onActiveEditorChange(editor);

        // Also register on focus (handles dynamic pages from overflow)
        const pageId = pagesRef.current[pageIndex]?.id;
        if (pageId) {
          editorsRef.current.set(pageId, editor);
        }
      },
      [onActiveEditorChange]
    );

    // Handle backspace at start of page - move content to previous page
    const handleKeyDown = useCallback(
      (pageIndex: number, event: KeyboardEvent) => {
        if (event.key === 'Backspace' && pageIndex > 0) {
          const currentPages = pagesRef.current;
          const editor = editorsRef.current.get(currentPages[pageIndex]?.id);
          if (!editor) return;

          // Check if cursor is at the very start
          const { from } = editor.state.selection;
          if (from === 1 || from === 0) {
            // Get content and prepend to previous page
            const content = editor.getJSON();
            const nodes = content.content ?? [];
            if (nodes.length === 0 || (nodes.length === 1 && !nodes[0].content?.length)) {
              // Empty page - remove it
              event.preventDefault();
              setPages((prev) => prev.filter((_, i) => i !== pageIndex));
              // Focus previous page at end
              setTimeout(() => {
                const prevEditor = editorsRef.current.get(currentPages[pageIndex - 1]?.id);
                if (prevEditor) {
                  prevEditor.commands.focus('end');
                }
              }, 100);
            }
          }
        }
      },
      []
    );

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        getActiveEditor: () => activeEditorRef.current,
        getAllContent: () => {
          return pages.map((page, index) => {
            const editor = editorsRef.current.get(page.id);
            return {
              pageIndex: index,
              tiptapJSON: editor?.getJSON() ?? {},
            };
          });
        },
        setPages: (pageContents: Record<string, unknown>[]) => {
          const newPages = pageContents.map((content, i) => ({
            id: `page-${Date.now()}-${i}`,
            initialContent: content,
          }));
          setPages(newPages.length > 0 ? newPages : [{ id: `page-${Date.now()}` }]);
        },
        addBlankPage: () => {
          setPages((prev) => [
            ...prev,
            { id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
          ]);
        },
        getPageCount: () => pages.length,
        focusPage: (index: number) => {
          const page = pages[index];
          if (page) {
            const editor = editorsRef.current.get(page.id);
            editor?.commands.focus('start');
          }
        },
      }),
      [pages]
    );

    return (
      <div className="te-page-canvas">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={`te-page ${
              activePageIndexRef.current === index ? 'te-page-focused' : ''
            }`}
            data-page-index={index}
          >
            {headerText && (
              <div className="te-page-header">{headerText}</div>
            )}
            <PageEditor
              pageIndex={index}
              initialContent={page.initialContent}
              isFirstPage={index === 0}
              onOverflow={handleOverflow}
              onFocus={handleFocus}
              onEditorReady={handleEditorReady}
              onUpdate={onContentChange}
              onKeyDown={handleKeyDown}
            />
            {footerText ? (
              <div className="te-page-footer">{footerText}</div>
            ) : (
              <div className="te-page-number">Page {index + 1}</div>
            )}
          </div>
        ))}

        {/* Add page button */}
        <button
          className="te-page-add-button"
          onClick={() => {
            setPages((prev) => [
              ...prev,
              { id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
            ]);
          }}
        >
          + Add Page
        </button>
      </div>
    );
  }
);

PageManager.displayName = 'PageManager';

export default PageManager;
