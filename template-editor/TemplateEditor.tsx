// template-editor/TemplateEditor.tsx
// Main React component — the entry point for the template editor

import React, { useRef, useState, useCallback, useMemo } from 'react';
import PageManager, { PageManagerHandle } from './page-manager/PageManager';
import Toolbar from './editor/toolbar/Toolbar';
import PdfViewer from './upload/PdfViewer';
import { DocxImporter } from './upload/DocxImporter';
import { DEFAULT_CRM_VARIABLES } from './constants';
import type { Editor } from '@tiptap/core';
import type { CRMVariable, DocumentMode, PageContent } from './types';

// Import styles
import './styles/page.css';
import './styles/editor.css';
import './styles/variables.css';

interface TemplateEditorProps {
  mode: DocumentMode;
  variables?: CRMVariable[];
  initialContent?: Record<string, unknown>; // TipTap JSON doc to load
  onContentChange?: (pages: PageContent[]) => void;
  onSave?: (pages: PageContent[]) => void;
  onActiveEditorChange?: (editor: any) => void;
  // For file upload modes
  docxFile?: File | null;
  pdfFile?: File | null;
  // Optional footer text shown at the bottom of every page
  defaultFooterText?: string;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  mode,
  variables = DEFAULT_CRM_VARIABLES,
  initialContent,
  onContentChange,
  onActiveEditorChange,
  docxFile,
  pdfFile,
  defaultFooterText,
}) => {
  const pageManagerRef = useRef<PageManagerHandle>(null);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState<DocumentMode>(mode);
  const [headerText, setHeaderText] = useState<string | undefined>();
  const [footerText, setFooterText] = useState<string | undefined>(defaultFooterText);

  // Pre-compute initial pages from saved content so PageManager renders them
  // on first mount — no useEffect delay, no page swap, no jitter.
  const initialPages = useMemo(() => {
    if (!initialContent || mode !== 'blank') return undefined;
    const content = initialContent as any;
    if (content.__pages && Array.isArray(content.__pages) && content.__pages.length > 0) {
      return content.__pages as Record<string, unknown>[];
    } else if (content.type === 'doc' && content.content) {
      return [initialContent];
    } else if (Array.isArray(content)) {
      return content as Record<string, unknown>[];
    }
    return undefined;
  }, [initialContent, mode]);

  // Handle active editor change from PageManager
  const handleActiveEditorChange = useCallback((editor: Editor | null) => {
    setActiveEditor(editor);
    onActiveEditorChange?.(editor);
  }, [onActiveEditorChange]);

  // Handle content changes
  const handleContentChange = useCallback(() => {
    if (onContentChange && pageManagerRef.current) {
      const content = pageManagerRef.current.getAllContent();
      onContentChange(content);
    }
  }, [onContentChange]);

  // Insert a CRM variable into the active editor
  const handleInsertVariable = useCallback(
    (variable: CRMVariable) => {
      if (activeEditor) {
        activeEditor.chain().focus().insertContent({
          type: 'variable',
          attrs: {
            fieldKey: variable.key,
            label: variable.label,
          },
        }).run();
      }
    },
    [activeEditor]
  );

  // Insert a signature field
  const handleInsertSignature = useCallback(() => {
    if (activeEditor) {
      activeEditor.chain().focus().insertContent({
        type: 'signatureField',
        attrs: {
          signerLabel: 'Signature',
          fieldId: `sig_${Date.now()}`,
        },
      }).run();
    }
  }, [activeEditor]);

  // Load DOCX file when provided
  React.useEffect(() => {
    if (docxFile && currentMode === 'docx') {
      setLoading(true);
      const importer = new DocxImporter();
      importer
        .import(docxFile)
        .then((result) => {
          if (pageManagerRef.current) {
            pageManagerRef.current.setPages(result.pages);
          }
          setHeaderText(result.headerText);
          setFooterText(result.footerText);
          setLoading(false);
        })
        .catch((err) => {
          console.error('DOCX import error:', err);
          setLoading(false);
        });
    }
  }, [docxFile, currentMode]);

  // Notify parent of loaded content after editors initialize
  React.useEffect(() => {
    if (initialPages && onContentChange && pageManagerRef.current) {
      const timer = setTimeout(() => {
        if (pageManagerRef.current) {
          const pages = pageManagerRef.current.getAllContent();
          onContentChange(pages);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [initialPages]);

  // PDF mode — render with PdfViewer
  if (currentMode === 'pdf' && pdfFile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="te-toolbar" style={{ opacity: 0.5 }}>
          <span style={{ fontSize: 12, color: '#888', padding: '4px 12px' }}>
            PDF View Mode — Read Only
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <PdfViewer file={pdfFile} />
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="te-toolbar">
          <span style={{ fontSize: 12, color: '#888', padding: '4px 12px' }}>
            Importing document...
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#e8e8e8',
          }}
        >
          <div style={{ textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>Converting document...</div>
            <div style={{ fontSize: 13 }}>Please wait while the document is processed.</div>
          </div>
        </div>
      </div>
    );
  }

  // Blank / DOCX editable mode — paginated editor
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        activeEditor={activeEditor}
        variables={variables}
        onInsertVariable={handleInsertVariable}
        onInsertSignature={handleInsertSignature}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PageManager
          ref={pageManagerRef}
          initialPages={initialPages}
          onActiveEditorChange={handleActiveEditorChange}
          onContentChange={handleContentChange}
          headerText={headerText}
          footerText={footerText}
        />
      </div>
    </div>
  );
};

export default TemplateEditor;
export type { TemplateEditorProps };
