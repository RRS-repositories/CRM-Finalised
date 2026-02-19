
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Folder, Plus, Search, File, Edit, ChevronRight,
  Save, X, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Type, ListOrdered, List as ListBulleted, Undo, Redo,
  ChevronDown, FileText, CheckSquare, Calendar, GripVertical,
  PenTool, Hash, Upload, Play, Users,
  Minus, Sparkles, Palette, MoreHorizontal, Layers, Eye, Copy,
  AlertCircle, FileUp, TextCursorInput, ListFilter, Square, Download
} from 'lucide-react';
// mammoth removed — DOCX conversion now handled by backend (LibreOffice / Puppeteer)
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import FontSize from '../editor/extensions/FontSize';
import { VariableNode } from '../editor/extensions/VariableExtension';
import { createVariableSuggestion } from '../editor/extensions/VariableSuggestion';
import { useVariableStore, TemplateVariable } from '../stores/variableStore';
import { MOCK_TEMPLATE_FOLDERS, TEMPLATE_VARIABLES, VARIABLE_LOOKUP } from '../constants';
import { useCRM } from '../context/CRMContext';
import { Template, Contact, CustomVariable } from '../types';
import { API_BASE_URL } from '../src/config';
import allLendersData from '../all_lenders_details.json';
import TemplateEditor from '../template-editor/TemplateEditor';
import type { PageManagerHandle } from '../template-editor/page-manager/PageManager';
import type { PageContent, CRMVariable as TECRMVariable } from '../template-editor/types';
import { DEFAULT_CRM_VARIABLES } from '../template-editor/constants';

// ========== Custom Image Extension (preserves width/height from DOCX) ==========
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('width') || element.style?.width?.replace('px', '') || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width:${attributes.width}px;max-width:100%;height:auto` };
        },
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('height') || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
      style: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('style') || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

// ========== PDF Overlay Types ==========

type OverlayFieldType = 'variable' | 'signature' | 'date' | 'text' | 'checkbox' | 'initials' | 'text_block' | 'text_input' | 'dropdown';

interface PdfOverlayField {
  id: string;
  type: OverlayFieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  variableKey?: string;
  label?: string;
  value?: string;
  mapping?: string;
  // Enhanced properties
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  required?: boolean;
  assignedRole?: 'sender' | 'recipient' | 'any';
  textContent?: string; // For text_block: editable text content
  options?: string[]; // For dropdown: list of options
  placeholder?: string; // For text_input
  isEditing?: boolean; // For text_block: double-click-to-edit state
}

interface PdfData {
  pageImages: string[];
  extractedText: string;
  pageCount: number;
  s3Key?: string; // S3 key for original uploaded file (PDF or DOCX)
  previewS3Key?: string; // S3 key for converted PDF preview (DOCX → PDF)
}

interface ImportSourceInfo {
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'html';
  fileSize: string;
  uploadedAt: string;
  conversionMode?: 'editable' | 'static'; // For DOCX: convert vs static
  conversionMethod?: string; // 'libreoffice' | 'puppeteer' | 'mammoth'
  originalS3Key?: string; // S3 key for original DOCX (for generation)
}

// ========== Helper: get used variables from TipTap JSON ==========

function getUsedVariablesFromJSON(json: any): Set<string> {
  const used = new Set<string>();
  const walk = (node: any) => {
    if (node.type === 'variable' && node.attrs?.key) {
      used.add(node.attrs.key);
    }
    if (node.content) node.content.forEach(walk);
  };
  if (json) walk(json);
  return used;
}

// ========== Main Component ==========

const Templates: React.FC = () => {
  const { templates, updateTemplate, addTemplate, deleteTemplate, contacts, addDocument } = useCRM();
  const { getAllVariables, addCustomVariable, removeCustomVariable, setCustomVariables, resetCustomVariables, customVariables: storeCustomVars } = useVariableStore();

  // View state
  const [viewMode, setViewMode] = useState<'library' | 'editor'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [templateTypeFilter, setTemplateTypeFilter] = useState<'all' | 'email' | 'sms' | 'letter' | 'master-docx' | 'html'>('email');

  // Master DOCX Templates state
  const [docxTemplates, setDocxTemplates] = useState<Array<{type: string, s3Key: string, fileName: string, downloadUrl: string | null, exists: boolean}>>([]);

  // HTML Templates state (for Lambda PDF generation)
  const [htmlTemplates, setHtmlTemplates] = useState<Array<{template_type: string, name: string, html_content: string, updated_at: string}>>([]);
  const [htmlTemplatesLoading, setHtmlTemplatesLoading] = useState(false);
  const [editingHtmlTemplate, setEditingHtmlTemplate] = useState<{template_type: string, name: string, html_content: string} | null>(null);
  const [htmlEditorContent, setHtmlEditorContent] = useState('');
  const [htmlSaving, setHtmlSaving] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxUploading, setDocxUploading] = useState<string | null>(null);
  const docxFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocxType, setSelectedDocxType] = useState<string | null>(null);

  // Editor State
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorCategory, setEditorCategory] = useState('Client');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorSourceType, setEditorSourceType] = useState<'blank' | 'pdf' | 'docx' | 'txt'>('blank');

  // PDF overlay state
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [pdfOverlayFields, setPdfOverlayFields] = useState<PdfOverlayField[]>([]);
  const [activePdfPage, setActivePdfPage] = useState(0);
  const [selectedOverlayField, setSelectedOverlayField] = useState<string | null>(null);
  const [repositioning, setRepositioning] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Right panel tab
  const [rightPanelTab, setRightPanelTab] = useState<'variables' | 'content'>('variables');

  // Multi-page visual breaks
  const editorPageRef = useRef<HTMLDivElement>(null);
  const [pageBreakCount, setPageBreakCount] = useState(0);

  // Header/Footer state for paginated editor
  const [headerContent, setHeaderContent] = useState('');
  const [footerContent, setFooterContent] = useState('');
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingFooter, setEditingFooter] = useState(false);

  // Variables panel
  const [variableSearchQuery, setVariableSearchQuery] = useState('');
  const [showCreateCustomVarModal, setShowCreateCustomVarModal] = useState(false);
  const [newCustomVarName, setNewCustomVarName] = useState('');
  const [newCustomVarDefault, setNewCustomVarDefault] = useState('');

  // Generation Modal State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [templateToGenerate, setTemplateToGenerate] = useState<Template | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  // Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Add Template Modal State
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fill custom variables modal
  const [showFillCustomVarsModal, setShowFillCustomVarsModal] = useState(false);
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({});
  const [pendingGenerateContact, setPendingGenerateContact] = useState<Contact | null>(null);

  // Import source info (for import banner)
  const [importSource, setImportSource] = useState<ImportSourceInfo | null>(null);

  // DOCX choice dialog state
  const [showDocxChoiceDialog, setShowDocxChoiceDialog] = useState(false);
  const [pendingDocxFile, setPendingDocxFile] = useState<globalThis.File | null>(null);

  // PDF choice dialog state
  const [showPdfChoiceDialog, setShowPdfChoiceDialog] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<globalThis.File | null>(null);

  // Text block editing state (for PDF overlay text_block fields)
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);

  // ========== NEW Paginated Editor State ==========
  // File objects for the new TemplateEditor component
  const [editorDocxFile, setEditorDocxFile] = useState<globalThis.File | null>(null);
  const [editorPdfFile, setEditorPdfFile] = useState<globalThis.File | null>(null);
  // Use the new paginated editor? (vs legacy single-editor for backwards compat)
  const [useNewEditor, setUseNewEditor] = useState(true);
  // Track pages content from the new editor
  const [pagesContent, setPagesContent] = useState<PageContent[]>([]);
  // Store active editor from new template editor (for variable insertion)
  const [newActiveEditor, setNewActiveEditor] = useState<any>(null);
  // Ref for accessing PageManager methods
  const pageManagerRef = useRef<PageManagerHandle>(null);

  // ========== TipTap Editor ==========

  const variableSuggestion = useMemo(() => createVariableSuggestion(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Color,
      FontFamily,
      FontSize,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: 'Start typing your template content here... Type [ to insert a variable.',
      }),
      VariableNode,
      Mention.configure({
        HTMLAttributes: { class: 'variable-mention' },
        suggestion: variableSuggestion,
        renderLabel: ({ node }) => `[${node.attrs.label || node.attrs.id}]`,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'template-editor-prosemirror',
        style: 'outline: none; min-height: 100%; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.15; color: #1a1a1a; padding: 112px 72px 92px 72px;',
      },
    },
  });

  // ========== Load template content into editor ==========

  useEffect(() => {
    if (viewMode === 'editor' && editor) {
      if (currentTemplate) {
        // Check if content is TipTap JSON
        let content = currentTemplate.content;
        try {
          const parsed = JSON.parse(content);
          if (parsed && parsed.type === 'doc') {
            // It's TipTap JSON
            editor.commands.setContent(parsed);

            // Restore PDF data if present
            if ((parsed as any).__pdfData) {
              setPdfData((parsed as any).__pdfData);
              setPdfOverlayFields((parsed as any).__pdfOverlayFields || []);
              setEditorSourceType('pdf');
            } else {
              setPdfData(null);
              setPdfOverlayFields([]);
            }

            // Restore header/footer content if present
            if ((parsed as any).__headerContent) {
              setHeaderContent((parsed as any).__headerContent);
            } else {
              setHeaderContent('');
            }
            if ((parsed as any).__footerContent) {
              setFooterContent((parsed as any).__footerContent);
            } else {
              setFooterContent('');
            }
          } else {
            // JSON but not TipTap doc format
            editor.commands.setContent(content.trim().startsWith('<') ? content : `<p>${content}</p>`);
            setPdfData(null);
            setPdfOverlayFields([]);
          }
        } catch {
          // It's HTML or plain text
          if (content.trim().startsWith('<')) {
            editor.commands.setContent(content);
          } else {
            const html = content
              .split('\n')
              .map(line => line.trim() ? `<p>${line}</p>` : '<p><br/></p>')
              .join('');
            editor.commands.setContent(html);
          }
          setPdfData(null);
          setPdfOverlayFields([]);
        }

        // Restore custom variables
        if (currentTemplate.customVariables) {
          const converted: TemplateVariable[] = currentTemplate.customVariables.map(cv => ({
            id: cv.id,
            name: cv.name,
            key: cv.key.replace(/^\{\{/, '').replace(/\}\}$/, '').replace('custom_', 'custom.'),
            category: 'custom' as const,
            type: 'text' as const,
            defaultValue: cv.defaultValue,
          }));
          setCustomVariables(converted);
        } else {
          resetCustomVariables();
        }
      } else if (editorSourceType === 'blank') {
        // Only reset for truly blank new templates.
        // File upload handlers (PDF, DOCX, TXT) set editorSourceType
        // before switching to editor view, so skip this reset for them.
        editor.commands.setContent('<p></p>');
        resetCustomVariables();
        setPdfData(null);
        setPdfOverlayFields([]);
      }
    }
  }, [viewMode, currentTemplate, editor]);

  // ========== Multi-page break detection + spacer injection ==========
  // Stacked A4 page cards with header/footer zones (like Word / Google Docs).
  // Each page: header zone (80px) → body content → footer zone (60px).
  // Content flows in a single contenteditable. Spacers push blocks that cross boundaries.
  const PAGE_HEIGHT = 1123;     // A4 at 96dpi (px)
  const PAGE_GAP = 40;          // grey gap between page cards (px)
  const PAGE_PADDING_H = 72;    // horizontal padding (left/right)
  const PAGE_PADDING_TOP = 20;  // small padding above header zone
  const PAGE_PADDING_BOTTOM = 20; // small padding below footer zone
  const HEADER_HEIGHT = 80;     // header zone height
  const FOOTER_HEIGHT = 60;     // footer zone height
  const HF_GAP = 12;            // space between header/footer and content

  // Content zone: where body text actually flows
  const CONTENT_ZONE_TOP = PAGE_PADDING_TOP + HEADER_HEIGHT + HF_GAP;    // 112px
  const CONTENT_ZONE_BOTTOM = PAGE_PADDING_BOTTOM + FOOTER_HEIGHT + HF_GAP; // 92px
  const CONTENT_PER_PAGE = PAGE_HEIGHT - CONTENT_ZONE_TOP - CONTENT_ZONE_BOTTOM; // 919px
  // Dead zone between content areas: bottom reserved + gap + top reserved
  const SPACER_HEIGHT = CONTENT_ZONE_BOTTOM + PAGE_GAP + CONTENT_ZONE_TOP; // 244px

  useEffect(() => {
    const wrapper = editorPageRef.current;
    if (!wrapper || viewMode !== 'editor' || editorSourceType === 'pdf') {
      setPageBreakCount(0);
      return;
    }

    let rafId = 0;
    let isApplying = false; // guard against re-entrant calls

    const updatePageBreaks = () => {
      if (isApplying) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        isApplying = true;
        try {
          applySpacersAndCount();
        } finally {
          isApplying = false;
        }
      });
    };

    const applySpacersAndCount = () => {
      const proseMirror = wrapper.querySelector('.ProseMirror') as HTMLElement;
      if (!proseMirror) return;

      // Use getBoundingClientRect for reliable measurements (no offsetParent issues)
      const pmRect = proseMirror.getBoundingClientRect();

      // Filter to only real content blocks (skip ProseMirror internal nodes)
      const allChildren = Array.from(proseMirror.children) as HTMLElement[];
      const blocks = allChildren.filter(el => {
        const tag = el.tagName?.toLowerCase();
        return tag && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'div', 'table', 'hr', 'pre', 'img'].includes(tag);
      });

      // --- Step 1: Clear all previous spacer padding ---
      allChildren.forEach(b => {
        if (b.dataset.pageSpacer) {
          b.style.paddingBottom = '';
          delete b.dataset.pageSpacer;
        }
      });
      // Force reflow so measurements are accurate (no stale spacers)
      void proseMirror.offsetHeight;

      // --- Step 2: Measure positions & inject spacers ---
      // Content zone on page 1: from CONTENT_ZONE_TOP to CONTENT_ZONE_TOP + CONTENT_PER_PAGE
      // In ProseMirror coordinates (relative to its top), that's 112px to 1031px.
      let pageContentEnd = CONTENT_ZONE_TOP + CONTENT_PER_PAGE; // 1031

      let spacerCount = 0;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const bRect = block.getBoundingClientRect();
        // Position relative to ProseMirror's top edge
        const blockTop = bRect.top - pmRect.top;
        const blockBottom = bRect.bottom - pmRect.top;

        // Block fits entirely within current page content zone
        if (blockBottom <= pageContentEnd) continue;

        // Block crosses or exceeds the page boundary — push to next page
        // Add padding-bottom to previous block to create the gap
        if (i > 0) {
          const prev = blocks[i - 1];
          const prevRect = prev.getBoundingClientRect();
          const prevBottom = prevRect.bottom - pmRect.top;
          const gapNeeded = pageContentEnd - prevBottom; // remaining space on this page
          const totalSpacer = gapNeeded + SPACER_HEIGHT; // push past footer+gap+header

          if (totalSpacer > 0) {
            // Use padding-bottom to avoid CSS margin collapse issues
            const existingPB = parseFloat(getComputedStyle(prev).paddingBottom) || 0;
            prev.style.paddingBottom = `${existingPB + totalSpacer}px`;
            prev.dataset.pageSpacer = 'true';
            spacerCount++;
          }
        }

        // Advance page boundary to next page
        pageContentEnd += CONTENT_PER_PAGE + SPACER_HEIGHT;

        // Force reflow after spacer applied
        void proseMirror.offsetHeight;

        // Re-measure to handle very tall blocks spanning multiple pages
        const newRect = block.getBoundingClientRect();
        let newBottom = newRect.bottom - proseMirror.getBoundingClientRect().top;
        while (newBottom > pageContentEnd) {
          pageContentEnd += CONTENT_PER_PAGE + SPACER_HEIGHT;
        }
      }

      // --- Step 3: Set page count from content height ---
      void proseMirror.offsetHeight;
      const totalHeight = proseMirror.scrollHeight;
      // Calculate pages: each page is PAGE_HEIGHT, with PAGE_GAP between
      const pagesFromHeight = Math.max(1, Math.ceil(totalHeight / (PAGE_HEIGHT)));
      const actualPages = Math.max(pagesFromHeight, spacerCount + 1);
      setPageBreakCount(actualPages - 1);

      // Set wrapper height
      const wrapperHeight = actualPages * PAGE_HEIGHT + (actualPages - 1) * PAGE_GAP;
      wrapper.style.minHeight = `${wrapperHeight}px`;
    };

    // Initial calculation (delay for editor + images to render)
    const initialTimer = setTimeout(updatePageBreaks, 200);
    // Secondary run after images likely loaded
    const imageTimer = setTimeout(updatePageBreaks, 1000);

    // Watch for content size changes (catches image loads, font loading, etc.)
    const observer = new ResizeObserver(() => updatePageBreaks());
    const proseMirror = wrapper.querySelector('.ProseMirror');
    if (proseMirror) observer.observe(proseMirror);
    observer.observe(wrapper);

    // Also listen for editor updates (typing, pasting)
    const onUpdate = () => setTimeout(updatePageBreaks, 50);
    editor?.on('update', onUpdate);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(imageTimer);
      cancelAnimationFrame(rafId);
      observer.disconnect();
      editor?.off('update', onUpdate);
    };
  }, [editor, viewMode, editorSourceType]);

  // ========== HTML Templates (for Lambda PDF generation) ==========

  const fetchHtmlTemplates = useCallback(async () => {
    setHtmlTemplatesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/html-templates`);
      if (res.ok) {
        const data = await res.json();
        setHtmlTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to fetch HTML templates:', err);
    } finally {
      setHtmlTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templateTypeFilter === 'html') {
      fetchHtmlTemplates();
    }
  }, [templateTypeFilter, fetchHtmlTemplates]);

  const handleEditHtmlTemplate = (template: {template_type: string, name: string, html_content: string}) => {
    setEditingHtmlTemplate(template);
    setHtmlEditorContent(template.html_content);
  };

  const handleSaveHtmlTemplate = async () => {
    if (!editingHtmlTemplate) return;
    setHtmlSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/html-templates/${editingHtmlTemplate.template_type}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingHtmlTemplate.name,
          html_content: htmlEditorContent
        })
      });
      if (res.ok) {
        setEditingHtmlTemplate(null);
        setHtmlEditorContent('');
        fetchHtmlTemplates();
      } else {
        const err = await res.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Failed to save HTML template:', err);
      alert('Failed to save template');
    } finally {
      setHtmlSaving(false);
    }
  };

  const handleCreateHtmlTemplate = async (templateType: 'LOA' | 'COVER_LETTER') => {
    const defaultContent = templateType === 'LOA'
      ? `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; margin: 25px; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { color: #1a365d; margin: 0; }
    .section { margin-bottom: 15px; }
    .label { font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FAST ACTION CLAIMS</h1>
    <p>info@fastactionclaims.co.uk | 0161 533 1706</p>
  </div>

  <h2>LETTER OF AUTHORITY</h2>

  <div class="section">
    <p class="label">Client:</p>
    <p>{{clientFullName}}</p>
    <p>{{clientAddress}}</p>
  </div>

  <div class="section">
    <p class="label">Lender:</p>
    <p>{{lenderName}}</p>
  </div>

  <div class="section">
    <p class="label">Date:</p>
    <p>{{today}}</p>
  </div>

  <div class="section">
    <p class="label">Signature:</p>
    {{signatureImage}}
  </div>
</body>
</html>`
      : `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; margin: 25px; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { color: #1a365d; margin: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FAST ACTION CLAIMS</h1>
    <p>info@fastactionclaims.co.uk | 0161 533 1706</p>
  </div>

  <h2>COVER LETTER</h2>

  <p>Date: {{today}}</p>
  <p>Reference: {{refSpec}}</p>

  <p>Dear Sir/Madam,</p>

  <p>Re: {{clientFullName}} - {{lenderName}}</p>

  <p>Please find enclosed the Letter of Authority for the above named client.</p>

  <p>Yours faithfully,</p>
  <p>Fast Action Claims</p>
</body>
</html>`;

    try {
      const res = await fetch(`${API_BASE_URL}/api/html-templates/${templateType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateType === 'LOA' ? 'Letter of Authority' : 'Cover Letter',
          html_content: defaultContent
        })
      });
      if (res.ok) {
        fetchHtmlTemplates();
      }
    } catch (err) {
      console.error('Failed to create HTML template:', err);
    }
  };

  // ========== File Upload Handlers ==========

  const handleFileUpload = async (file: globalThis.File) => {
    if (!file) return;
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const ext = file.name.split('.').pop()?.toLowerCase();

    // DOCX - show choice dialog (Convert to Editable vs Upload as Static PDF)
    if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      setPendingDocxFile(file);
      setShowAddTemplateModal(false);
      setShowDocxChoiceDialog(true);
      return;
    }

    // PDF - show choice dialog (Convert to Editable vs Static Overlay)
    if (ext === 'pdf' || file.type === 'application/pdf') {
      setPendingPdfFile(file);
      setShowAddTemplateModal(false);
      setShowPdfChoiceDialog(true);
      return;
    }

    // TXT
    if (ext === 'txt' || file.type === 'text/plain') {
      const text = await file.text();
      const html = text
        .split(/\n\n+/)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');

      setShowAddTemplateModal(false);
      setCurrentTemplate(null);
      setEditorName(fileName);
      setEditorCategory('Client');
      setEditorDescription('');
      setEditorSourceType('txt');
      setPdfData(null);
      setPdfOverlayFields([]);
      setImportSource({
        fileName: file.name,
        fileType: 'txt',
        fileSize: (file.size / 1024).toFixed(1) + ' KB',
        uploadedAt: new Date().toLocaleString(),
      });
      setViewMode('editor');
      setTimeout(() => {
        if (editor) {
          editor.commands.setContent(html);
        }
      }, 150);
      return;
    }

    // HTML
    if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
      const content = await file.text();
      setShowAddTemplateModal(false);
      setCurrentTemplate(null);
      setEditorName(fileName);
      setEditorCategory('Client');
      setEditorDescription('');
      setEditorSourceType('blank');
      setPdfData(null);
      setPdfOverlayFields([]);
      setViewMode('editor');
      setTimeout(() => {
        if (editor) {
          editor.commands.setContent(content);
        }
      }, 150);
      return;
    }
  };

  // ========== DOCX Choice Handlers ==========

  const handleDocxConvertEditable = async () => {
    if (!pendingDocxFile) return;
    const file = pendingDocxFile;
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';

    // Convert DOCX → HTML on the backend (LibreOffice preferred, mammoth fallback)
    // This preserves more formatting than client-side mammoth alone
    const formData = new FormData();
    formData.append('file', file);

    const convertRes = await fetch(`${API_BASE_URL}/api/templates/convert-to-html`, {
      method: 'POST',
      body: formData,
    });
    const convertData = await convertRes.json();

    if (!convertData.success) {
      console.error('DOCX→HTML conversion failed:', convertData.message);
      alert('Failed to convert Word document: ' + (convertData.message || 'Unknown error'));
      return;
    }

    let html = convertData.html;

    // ── Post-process: fix formatting that TipTap can't parse natively ──

    // 1. Convert align="..." attributes → inline style text-align
    //    (LibreOffice outputs <p align="right"> which TipTap ignores)
    html = html.replace(
      /<(p|div|td|th|h[1-6])(\s[^>]*?)\salign=["']?(left|center|right|justify)["']?/gi,
      (match: string, tag: string, attrs: string, alignment: string) => {
        // If there's already a style attribute, append text-align to it
        if (/style\s*=/i.test(attrs)) {
          return `<${tag}${attrs.replace(
            /style\s*=\s*["']/i,
            `style="text-align: ${alignment}; `
          )}`;
        }
        return `<${tag}${attrs} style="text-align: ${alignment}"`;
      }
    );
    // Also handle tags where align is the only attribute
    html = html.replace(
      /<(p|div|td|th|h[1-6])\s+align=["']?(left|center|right|justify)["']?\s*>/gi,
      (_match: string, tag: string, alignment: string) =>
        `<${tag} style="text-align: ${alignment}">`
    );

    // 2. Convert <font> tags → <span> with inline styles
    //    (TipTap strips <font> entirely, losing size/color/face)
    html = html.replace(
      /<font\b([^>]*)>([\s\S]*?)<\/font>/gi,
      (_match: string, attrs: string, inner: string) => {
        const styles: string[] = [];
        const sizeMatch = attrs.match(/size=["']?(\d+)["']?/i);
        const colorMatch = attrs.match(/color=["']?([^"'\s>]+)["']?/i);
        const faceMatch = attrs.match(/face=["']?([^"'>]+)["']?/i);
        // Also extract any existing style attribute
        const existingStyle = attrs.match(/style=["']([^"']*)["']/i);
        if (existingStyle) styles.push(existingStyle[1].replace(/;?\s*$/, ''));
        if (sizeMatch) {
          const sizeMap: Record<string, string> = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' };
          styles.push(`font-size: ${sizeMap[sizeMatch[1]] || '12pt'}`);
        }
        if (colorMatch) styles.push(`color: ${colorMatch[1]}`);
        if (faceMatch) styles.push(`font-family: ${faceMatch[1]}`);
        return styles.length
          ? `<span style="${styles.join('; ')}">${inner}</span>`
          : `<span>${inner}</span>`;
      }
    );

    // 3. Enforce max-width on images so they don't overflow A4
    html = html.replace(/<img\b/gi, '<img style="max-width:100%;height:auto" ');

    // 4. Clean up empty paragraphs and double breaks
    html = html.replace(/<p>\s*<\/p>/g, '<p><br/></p>');
    html = html.replace(/<br\s*\/?>\s*<br\s*\/?>/g, '</p><p>');

    // Set header/footer from DOCX if extracted by backend
    if (convertData.headerHtml) {
      setHeaderContent(convertData.headerHtml);
    } else {
      setHeaderContent('');
    }
    if (convertData.footerHtml) {
      setFooterContent(convertData.footerHtml);
    } else {
      setFooterContent('');
    }

    setShowDocxChoiceDialog(false);
    setPendingDocxFile(null);
    setCurrentTemplate(null);
    setEditorName(fileName);
    setEditorCategory('Client');
    setEditorDescription('');
    setEditorSourceType('docx');
    setPdfData(null);
    setPdfOverlayFields([]);
    setImportSource({
      fileName: file.name,
      fileType: 'docx',
      fileSize,
      uploadedAt: new Date().toLocaleString(),
      conversionMode: 'editable',
      conversionMethod: convertData.conversionMethod,
      originalS3Key: convertData.originalS3Key,
    });
    // Set the DOCX file for the new paginated editor
    setEditorDocxFile(file);
    setEditorPdfFile(null);
    setViewMode('editor');
    // Also set legacy editor as fallback
    setTimeout(() => {
      if (editor) {
        editor.commands.setContent(html);
      }
    }, 150);
  };

  const handleDocxUploadStatic = async () => {
    if (!pendingDocxFile) return;
    const file = pendingDocxFile;
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';

    // Convert DOCX → PDF on the backend (LibreOffice or Puppeteer fallback)
    // This gives proper multi-page rendering with preserved formatting
    const formData = new FormData();
    formData.append('file', file);

    const convertRes = await fetch(`${API_BASE_URL}/api/templates/convert-docx`, {
      method: 'POST',
      body: formData,
    });
    const convertData = await convertRes.json();

    if (!convertData.success) {
      console.error('DOCX→PDF conversion failed:', convertData.message);
      alert('Failed to convert Word document: ' + (convertData.message || 'Unknown error'));
      return;
    }

    // Fetch the converted PDF and render pages using PDF.js (same as native PDF upload)
    const pdfResponse = await fetch(convertData.pdfUrl);
    const pdfBlob = await pdfResponse.blob();
    // Create a File-like object from the blob for loadPdfPages
    const pdfFile = Object.assign(pdfBlob, { name: fileName + '.pdf' }) as unknown as globalThis.File;
    const pdfResult = await loadPdfPages(pdfFile);
    const { pageImages, allTextItems, fullText, pageCount } = pdfResult;

    // Auto-detect field tags from extracted text
    const autoFields: PdfOverlayField[] = [];
    const tagPatterns = [
      { regex: /\{signature___?\}/gi, type: 'signature' as OverlayFieldType },
      { regex: /\{textfield___?\}/gi, type: 'text_input' as OverlayFieldType },
      { regex: /\{date___?\}/gi, type: 'date' as OverlayFieldType },
      { regex: /\{checkbox___?\}/gi, type: 'checkbox' as OverlayFieldType },
      { regex: /\{initials___?\}/gi, type: 'initials' as OverlayFieldType },
    ];
    tagPatterns.forEach(({ regex, type }) => {
      const matches = fullText.match(regex);
      if (matches) {
        matches.forEach((_, idx) => {
          autoFields.push({
            id: `auto_${type}_${Date.now()}_${idx}`,
            type,
            page: 0,
            x: 30,
            y: 20 + idx * 8,
            width: type === 'signature' ? 20 : type === 'checkbox' ? 3 : 15,
            height: type === 'signature' ? 5 : type === 'checkbox' ? 3 : 3,
            label: `${type.charAt(0).toUpperCase() + type.slice(1)} (auto)`,
            required: true,
          });
        });
      }
    });

    setShowDocxChoiceDialog(false);
    setPendingDocxFile(null);
    setCurrentTemplate(null);
    setEditorName(fileName);
    setEditorCategory('Client');
    setEditorDescription('');
    setEditorSourceType('pdf'); // Treat as PDF-like static mode
    setPdfData({
      pageImages,
      extractedText: fullText,
      pageCount,
      s3Key: convertData.originalS3Key || undefined,
      previewS3Key: convertData.previewS3Key || undefined,
    });
    setPdfOverlayFields(autoFields);
    setActivePdfPage(0);
    setImportSource({
      fileName: file.name,
      fileType: 'docx',
      fileSize,
      uploadedAt: new Date().toLocaleString(),
      conversionMode: 'static',
      conversionMethod: convertData.conversionMethod,
    });
    setViewMode('editor');
    setTimeout(() => {
      if (editor) {
        editor.commands.setContent(`<p><em>DOCX uploaded as static background (${convertData.conversionMethod}). Add overlay fields to annotate.</em></p>`);
      }
    }, 150);
  };

  // ========== PDF Choice Handlers ==========

  /** Helper: load a PDF and extract page images + structured text items */
  const loadPdfPages = async (file: globalThis.File) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageImages: string[] = [];
    const allTextItems: { str: string; x: number; y: number; w: number; h: number; fontName: string; fontSize: number; page: number }[] = [];
    let fullText = '';
    const scale = 2;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const viewportBase = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      pageImages.push(canvas.toDataURL('image/png'));

      // Extract text with position info
      const textContent = await page.getTextContent();
      const pageHeight = viewportBase.height;
      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim() === '') continue;
        const tx = item.transform;
        // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
        const x = tx[4];
        const y = pageHeight - tx[5]; // flip Y (PDF Y is bottom-up)
        allTextItems.push({
          str: item.str,
          x,
          y,
          w: item.width || 0,
          h: fontSize,
          fontName: item.fontName || '',
          fontSize,
          page: i,
        });
      }

      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    return { pdf, pageImages, allTextItems, fullText, pageCount: pdf.numPages };
  };

  /** Convert PDF text items into structured HTML preserving layout */
  const pdfTextItemsToHtml = (items: { str: string; x: number; y: number; w: number; h: number; fontName: string; fontSize: number; page: number }[]): string => {
    if (items.length === 0) return '<p></p>';

    type TextItem = typeof items[number];

    // Helper: join items within a line, inserting spaces based on x-position gaps
    const joinLineItems = (lineItems: TextItem[]): string => {
      if (lineItems.length === 0) return '';
      // Sort by x position
      const sorted = [...lineItems].sort((a, b) => a.x - b.x);
      let result = escapeHtml(sorted[0].str);

      for (let j = 1; j < sorted.length; j++) {
        const prev = sorted[j - 1];
        const curr = sorted[j];
        const prevEnd = prev.x + (prev.w || prev.str.length * prev.fontSize * 0.5);
        const gap = curr.x - prevEnd;
        // If gap is larger than ~25% of the font size, insert a space
        const spaceThreshold = curr.fontSize * 0.25;
        if (gap > spaceThreshold) {
          result += ' ';
        }
        result += escapeHtml(curr.str);
      }
      return result;
    };

    // 1) Group items into lines (items with similar Y position)
    interface TextLine {
      y: number;
      items: TextItem[];
      text: string; // pre-computed text with proper spacing
      fontSize: number;
      isBold: boolean;
      x: number;
      rightEdge: number; // rightmost extent of text on this line
      page: number;
    }

    const lines: TextLine[] = [];
    const yTolerance = 3;

    // Sort by page, then Y, then X
    const sorted = [...items].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.y - b.y) > yTolerance) return a.y - b.y;
      return a.x - b.x;
    });

    let currentLineItems: TextItem[] = [];
    let currentY = sorted[0].y;
    let currentPage = sorted[0].page;

    const pushLine = (lineItems: TextItem[], y: number, page: number) => {
      if (lineItems.length === 0) return;
      const avgFontSize = lineItems.reduce((sum, i) => sum + i.fontSize, 0) / lineItems.length;
      const isBold = lineItems.some(i => {
        const fn = i.fontName.toLowerCase();
        return fn.includes('bold') || fn.includes('black') || fn.includes('heavy');
      });
      const xMin = Math.min(...lineItems.map(i => i.x));
      const rightEdge = Math.max(...lineItems.map(i => i.x + (i.w || i.str.length * i.fontSize * 0.5)));
      lines.push({
        y,
        items: lineItems,
        text: joinLineItems(lineItems),
        fontSize: avgFontSize,
        isBold,
        x: xMin,
        rightEdge,
        page,
      });
    };

    for (const item of sorted) {
      if (Math.abs(item.y - currentY) <= yTolerance && item.page === currentPage) {
        currentLineItems.push(item);
      } else {
        pushLine(currentLineItems, currentY, currentPage);
        currentLineItems = [item];
        currentY = item.y;
        currentPage = item.page;
      }
    }
    pushLine(currentLineItems, currentY, currentPage);

    if (lines.length === 0) return '<p></p>';

    // 2) Determine body font size (most common)
    const fontSizeCounts: Record<number, number> = {};
    for (const line of lines) {
      const rounded = Math.round(line.fontSize);
      fontSizeCounts[rounded] = (fontSizeCounts[rounded] || 0) + line.items.length;
    }
    const bodyFontSize = parseInt(Object.entries(fontSizeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '12');

    // 3) Determine typical left margin + right margin (text area bounds)
    const bodyLines = lines.filter(l => Math.round(l.fontSize) === bodyFontSize);
    const xCounts: Record<number, number> = {};
    for (const line of bodyLines) {
      const roundedX = Math.round(line.x / 5) * 5;
      xCounts[roundedX] = (xCounts[roundedX] || 0) + 1;
    }
    const bodyLeftX = parseInt(Object.entries(xCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '50');
    // Estimate right edge of text area from the widest body lines
    const bodyRightEdges = bodyLines.map(l => l.rightEdge).sort((a, b) => b - a);
    const textAreaRight = bodyRightEdges.length > 2 ? bodyRightEdges[Math.floor(bodyRightEdges.length * 0.1)] : 545;
    const textAreaWidth = textAreaRight - bodyLeftX;

    // 4) Group lines into paragraphs
    // A paragraph break happens when there's a large Y gap OR font style changes
    const paragraphs: {
      lines: TextLine[];
      page: number;
    }[] = [];
    let currentParagraph: TextLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : null;

      const needsBreak = prevLine && (
        line.page !== prevLine.page ||
        (line.y - prevLine.y) > (prevLine.fontSize * 1.8) ||
        Math.round(line.fontSize) !== Math.round(prevLine.fontSize) ||
        line.isBold !== prevLine.isBold
      );

      if (needsBreak && currentParagraph.length > 0) {
        paragraphs.push({ lines: currentParagraph, page: currentParagraph[0].page });
        currentParagraph = [];
      }
      currentParagraph.push(line);
    }
    if (currentParagraph.length > 0) {
      paragraphs.push({ lines: currentParagraph, page: currentParagraph[0].page });
    }

    // 5) Generate HTML
    let html = '';
    let lastPage = 0;

    for (const para of paragraphs) {
      if (para.page !== lastPage && lastPage > 0) {
        html += '<hr />';
      }
      lastPage = para.page;

      const pLines = para.lines;
      if (pLines.length === 0) continue;

      const avgFontSize = pLines.reduce((s, l) => s + l.fontSize, 0) / pLines.length;
      const roundedSize = Math.round(avgFontSize);
      const isBold = pLines.every(l => l.isBold);
      const avgX = pLines.reduce((s, l) => s + l.x, 0) / pLines.length;

      // Heading detection
      let isHeading = false;
      let headingLevel = 0;
      if (roundedSize > bodyFontSize + 4) {
        isHeading = true; headingLevel = 1;
      } else if (roundedSize > bodyFontSize + 2) {
        isHeading = true; headingLevel = 2;
      } else if (isBold && pLines.length <= 2) {
        const totalChars = pLines.reduce((s, l) => s + l.text.length, 0);
        if (totalChars < 120) {
          isHeading = true; headingLevel = 3;
        }
      }

      // Bullet detection
      const firstLineText = pLines[0].text;
      const bulletMatch = firstLineText.match(/^[\u2022\u2023\u25E6\u2043\u2219•◦‣⁃\-–—]\s*/);
      const isBullet = bulletMatch !== null || avgX > bodyLeftX + 20;

      // Alignment detection
      const avgRightEdge = pLines.reduce((s, l) => s + l.rightEdge, 0) / pLines.length;
      const isRightAligned = avgX > bodyLeftX + textAreaWidth * 0.45;
      const isCentered = Math.abs((avgX - bodyLeftX) - (textAreaRight - avgRightEdge)) < 20 && avgX > bodyLeftX + 15;

      // Build paragraph text from lines
      // Key logic: if a line's text spans most of the text area width, it's
      // wrapping text → join with space. Short lines get <br> to preserve layout.
      let paraText = '';
      for (let li = 0; li < pLines.length; li++) {
        const line = pLines[li];
        if (li > 0) {
          const prevLineWidth = pLines[li - 1].rightEdge - pLines[li - 1].x;
          const fillRatio = prevLineWidth / textAreaWidth;
          // If the previous line fills >75% of text area width, it was wrapping → space
          // Otherwise it was a short/intentional line break → <br>
          if (fillRatio > 0.75) {
            paraText += ' ';
          } else {
            paraText += '<br/>';
          }
        }
        paraText += line.text;
      }

      if (!paraText.trim()) continue;

      // Wrap bold
      const content = isBold ? `<strong>${paraText}</strong>` : paraText;

      // Alignment style
      const alignStyle = isCentered ? ' style="text-align:center"' :
        (isRightAligned && !isCentered) ? ' style="text-align:right"' : '';

      if (isHeading) {
        const tag = `h${headingLevel}`;
        html += `<${tag}${alignStyle}>${content}</${tag}>`;
      } else if (isBullet && !isRightAligned) {
        const bulletText = bulletMatch ? paraText.substring(bulletMatch[0].length) : paraText;
        const bulletContent = isBold ? `<strong>${bulletText}</strong>` : bulletText;
        if (html.endsWith('</ul>')) {
          html = html.slice(0, -5);
          html += `<li>${bulletContent}</li></ul>`;
        } else {
          html += `<ul><li>${bulletContent}</li></ul>`;
        }
      } else {
        html += `<p${alignStyle}>${content}</p>`;
      }
    }

    return html || '<p></p>';
  };

  function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** PDF → Convert to Editable (rich text via intelligent text extraction) */
  const handlePdfConvertEditable = async () => {
    if (!pendingPdfFile) return;
    const file = pendingPdfFile;
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';

    const { pageImages, allTextItems, fullText, pageCount } = await loadPdfPages(file);

    // Convert extracted text items to structured HTML
    const html = pdfTextItemsToHtml(allTextItems);

    setShowPdfChoiceDialog(false);
    setPendingPdfFile(null);
    setCurrentTemplate(null);
    setEditorName(fileName);
    setEditorCategory('Client');
    setEditorDescription('');
    setEditorSourceType('docx'); // Use rich-text mode (not pdf overlay mode)
    setPdfData(null);
    setPdfOverlayFields([]);
    setImportSource({
      fileName: file.name,
      fileType: 'pdf',
      fileSize,
      uploadedAt: new Date().toLocaleString(),
      conversionMode: 'editable',
    });
    setViewMode('editor');
    setTimeout(() => {
      if (editor) {
        editor.commands.setContent(html);
      }
    }, 150);
  };

  /** Upload file to S3 via backend presigned URL */
  const uploadFileToS3 = async (file: globalThis.File): Promise<string | null> => {
    try {
      // Step 1: Get presigned upload URL from backend
      const urlRes = await fetch(`${API_BASE_URL}/api/templates/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      const urlData = await urlRes.json();
      if (!urlData.success) {
        console.warn('S3 presigned URL failed, continuing without S3:', urlData.message);
        return null;
      }
      // Step 2: Upload directly to S3 using presigned URL
      const uploadRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        console.warn('S3 upload failed, continuing without S3');
        return null;
      }
      return urlData.s3Key as string;
    } catch (err) {
      console.warn('S3 upload error, continuing without S3:', err);
      return null;
    }
  };

  /** PDF → Upload as Static Background (overlay field mode) */
  const handlePdfUploadStatic = async () => {
    if (!pendingPdfFile) return;
    const file = pendingPdfFile;
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';

    // Upload to S3 in parallel with PDF page rendering
    const [pdfResult, s3Key] = await Promise.all([
      loadPdfPages(file),
      uploadFileToS3(file),
    ]);
    const { pageImages, allTextItems, fullText, pageCount } = pdfResult;

    // Auto-detect field tags from extracted text
    const autoFields: PdfOverlayField[] = [];
    const tagPatterns = [
      { regex: /\{signature___?\}/gi, type: 'signature' as OverlayFieldType },
      { regex: /\{textfield___?\}/gi, type: 'text_input' as OverlayFieldType },
      { regex: /\{date___?\}/gi, type: 'date' as OverlayFieldType },
      { regex: /\{checkbox___?\}/gi, type: 'checkbox' as OverlayFieldType },
      { regex: /\{initials___?\}/gi, type: 'initials' as OverlayFieldType },
    ];
    tagPatterns.forEach(({ regex, type }) => {
      const matches = fullText.match(regex);
      if (matches) {
        matches.forEach((_, idx) => {
          autoFields.push({
            id: `auto_${type}_${Date.now()}_${idx}`,
            type,
            page: 0,
            x: 30,
            y: 20 + idx * 8,
            width: type === 'signature' ? 20 : type === 'checkbox' ? 3 : 15,
            height: type === 'signature' ? 5 : type === 'checkbox' ? 3 : 3,
            label: `${type.charAt(0).toUpperCase() + type.slice(1)} (auto)`,
            required: true,
          });
        });
      }
    });

    setShowPdfChoiceDialog(false);
    setPendingPdfFile(null);
    setCurrentTemplate(null);
    setEditorName(fileName);
    setEditorCategory('Client');
    setEditorDescription('');
    setEditorSourceType('pdf');
    setPdfData({ pageImages, extractedText: fullText, pageCount, s3Key: s3Key || undefined });
    setPdfOverlayFields(autoFields);
    setActivePdfPage(0);
    setImportSource({
      fileName: file.name,
      fileType: 'pdf',
      fileSize,
      uploadedAt: new Date().toLocaleString(),
      conversionMode: 'static',
    });
    setViewMode('editor');
    setTimeout(() => {
      if (editor) {
        editor.commands.setContent(`<p><em>PDF uploaded as static background with ${pageCount} page(s). Add overlay fields on the pages.</em></p>`);
      }
    }, 150);
  };

  // ========== Save Template ==========

  const handleSave = async () => {
    const timestamp = new Date().toISOString().split('T')[0];

    let contentToSave: string;
    const extraData: Record<string, unknown> = {};

    // NEW PAGINATED EDITOR: collect content from all pages
    if (useNewEditor && editorSourceType !== 'pdf') {
      const allPages = pagesContent.length > 0 ? pagesContent : [];
      if (allPages.length === 0) {
        // No content captured — nothing to save
        alert('No content to save. Please add some content first.');
        return;
      }
      // Save as a wrapper doc with __pages array for multi-page support
      const pagesDocs = allPages.map(p => p.tiptapJSON);
      contentToSave = JSON.stringify({
        type: 'doc',
        content: pagesDocs.flatMap((p: any) => p.content || []),
        __pages: pagesDocs,
        ...extraData,
      });
    } else {
      // LEGACY: single editor or PDF mode
      if (!editor) return;
      const editorJSON = editor.getJSON();

      if (editorSourceType === 'pdf' && pdfData) {
        extraData.__pdfData = pdfData;
        extraData.__pdfOverlayFields = pdfOverlayFields;
      }
      if (headerContent) extraData.__headerContent = headerContent;
      if (footerContent) extraData.__footerContent = footerContent;

      contentToSave = JSON.stringify({
        ...editorJSON,
        ...extraData,
      });
    }

    // Convert store custom variables to the Template format
    const customVarsForSave: CustomVariable[] = storeCustomVars.map(v => ({
      id: v.id,
      name: v.name,
      key: `{{custom_${v.key.replace('custom.', '')}}}`,
      defaultValue: v.defaultValue,
    }));

    let result;
    if (currentTemplate) {
      result = await updateTemplate({
        ...currentTemplate,
        name: editorName,
        category: editorCategory,
        description: editorDescription,
        content: contentToSave,
        lastModified: timestamp,
        customVariables: customVarsForSave,
      });
    } else {
      result = await addTemplate({
        name: editorName,
        category: editorCategory,
        description: editorDescription,
        content: contentToSave,
        customVariables: customVarsForSave,
      });
    }

    if (result.success) {
      setViewMode('library');
    }
  };

  // ========== Generate PDF (merge overlay fields with original PDF via backend) ==========

  const handleGeneratePdf = async () => {
    if (!pdfData?.s3Key || pdfOverlayFields.length === 0) return;

    // Resolve variable values from the store
    const allVars = useVariableStore.getState().getAllVariables();
    const variableValues: Record<string, string> = {};
    allVars.forEach(v => {
      variableValues[v.key] = v.defaultValue || '';
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/templates/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          s3Key: pdfData.s3Key,
          fields: pdfOverlayFields,
          variableValues,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        alert(`PDF generation failed: ${errData?.message || res.statusText}`);
        return;
      }

      // Download the generated PDF
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${editorName || 'generated'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Generate PDF error:', err);
      alert('Failed to generate PDF. Check console for details.');
    }
  };

  // ========== Actions ==========

  const handleEdit = (template: Template) => {
    // Detect source type from saved content
    let sourceType: 'blank' | 'pdf' | 'docx' | 'txt' = 'blank';
    try {
      const parsed = JSON.parse(template.content);
      if (parsed?.__pdfData) {
        sourceType = 'pdf';
        setPdfData(parsed.__pdfData);
        setPdfOverlayFields(parsed.__pdfOverlayFields || []);
      } else {
        setPdfData(null);
        setPdfOverlayFields([]);
      }
    } catch {
      setPdfData(null);
      setPdfOverlayFields([]);
    }
    setEditorSourceType(sourceType);
    setEditorDocxFile(null);
    setEditorPdfFile(null);
    setPagesContent([]);
    setCurrentTemplate(template);
    setEditorName(template.name);
    setEditorCategory(template.category);
    setEditorDescription(template.description);
    setViewMode('editor');
  };

  const handleNew = () => {
    setShowAddTemplateModal(false);
    setCurrentTemplate(null);
    setEditorName('New Template');
    setEditorCategory('Client');
    setEditorDescription('');
    setEditorSourceType('blank');
    setPdfData(null);
    setPdfOverlayFields([]);
    setImportSource(null);
    // Reset new editor state
    setEditorDocxFile(null);
    setEditorPdfFile(null);
    setPagesContent([]);
    setViewMode('editor');
  };

  const handlePreview = (template: Template) => {
    setPreviewTemplate(template);
    setShowPreviewModal(true);
  };

  const handleUseTemplate = (template: Template) => {
    setTemplateToGenerate(template);
    setSelectedContactId(contacts.length > 0 ? contacts[0].id : '');
    setShowGenerateModal(true);
  };

  // ========== Variable Insertion from Right Panel ==========

  const insertVariableAtCursor = useCallback((variable: TemplateVariable) => {
    // Try the new paginated editor's active editor first
    if (useNewEditor && newActiveEditor) {
      newActiveEditor.chain().focus().insertContent({
        type: 'variable',
        attrs: {
          fieldKey: variable.key,
          label: variable.name,
        },
      }).insertContent(' ').run();
      return;
    }
    // Fall back to legacy editor
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'variable',
      attrs: {
        id: variable.id,
        name: variable.name,
        category: variable.category,
        key: variable.key,
        value: variable.value || null,
      },
    }).insertContent(' ').run();
  }, [editor, useNewEditor, newActiveEditor]);

  // ========== Letterhead Insertion ==========

  const insertLetterhead = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent(`
      <div style="border-bottom: 2px solid #1a3a5c; padding-bottom: 12px; margin-bottom: 20px;">
        <p style="font-size: 18pt; font-weight: bold; color: #1a3a5c; margin: 0;">ROWAN ROSE SOLICITORS</p>
        <p style="font-size: 9pt; color: #666; margin: 4px 0 0 0;">Trading style of Rowan Rose Ltd (Company No. 12916452) | SRA No. 8000843</p>
        <p style="font-size: 9pt; color: #666; margin: 2px 0 0 0;">Boat Shed, Exchange Quay, Salford M5 3EQ</p>
      </div>
    `).run();
  }, [editor]);

  // ========== PDF Overlay Field Management ==========

  const addPdfOverlayField = (type: OverlayFieldType) => {
    const id = `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sizeMap: Record<OverlayFieldType, { w: number; h: number }> = {
      signature: { w: 20, h: 5 },
      checkbox: { w: 3, h: 3 },
      initials: { w: 8, h: 4 },
      text_block: { w: 30, h: 8 },
      text_input: { w: 25, h: 3.5 },
      dropdown: { w: 20, h: 3.5 },
      variable: { w: 15, h: 3 },
      text: { w: 15, h: 3 },
      date: { w: 15, h: 3 },
    };
    const size = sizeMap[type] || { w: 15, h: 3 };
    const field: PdfOverlayField = {
      id,
      type,
      page: activePdfPage,
      x: 30,
      y: 30 + pdfOverlayFields.filter(f => f.page === activePdfPage).length * 8,
      width: size.w,
      height: size.h,
      label: type === 'text_block' ? 'Text Block' : type === 'text_input' ? 'Text Input' : type.charAt(0).toUpperCase() + type.slice(1),
      fontSize: type === 'text_block' ? 12 : undefined,
      fontColor: '#000000',
      backgroundColor: type === 'text_block' ? '#FFFFFF' : undefined,
      required: false,
      assignedRole: 'any',
      textContent: type === 'text_block' ? 'Double-click to edit text...' : undefined,
      options: type === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : undefined,
      placeholder: type === 'text_input' ? 'Enter text here...' : undefined,
    };
    setPdfOverlayFields(prev => [...prev, field]);
    setSelectedOverlayField(id);
  };

  // PDF overlay drag/resize
  useEffect(() => {
    if (!repositioning) return;
    const handleMouseMove = (e: MouseEvent) => {
      const pageEl = document.getElementById(`pdf-page-${activePdfPage}`);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left - repositioning.offsetX) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top - repositioning.offsetY) / rect.height) * 100;
      setPdfOverlayFields(prev => prev.map(f =>
        f.id === repositioning.id
          ? { ...f, x: Math.max(0, Math.min(xPct, 90)), y: Math.max(0, Math.min(yPct, 95)) }
          : f
      ));
    };
    const handleMouseUp = () => setRepositioning(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [repositioning, activePdfPage]);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const pageEl = document.getElementById(`pdf-page-${activePdfPage}`);
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const dx = ((e.clientX - resizing.startX) / rect.width) * 100;
      const dy = ((e.clientY - resizing.startY) / rect.height) * 100;
      setPdfOverlayFields(prev => prev.map(f =>
        f.id === resizing.id
          ? { ...f, width: Math.max(3, resizing.startW + dx), height: Math.max(2, resizing.startH + dy) }
          : f
      ));
    };
    const handleMouseUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, activePdfPage]);

  // Delete overlay field on Delete/Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOverlayField) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) return;
        e.preventDefault();
        setPdfOverlayFields(prev => prev.filter(f => f.id !== selectedOverlayField));
        setSelectedOverlayField(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOverlayField]);

  // ========== Document Generation ==========

  const getLenderDetails = (lenderName: string | undefined) => {
    if (!lenderName) return null;
    const normalized = lenderName.toUpperCase().trim();
    let match = allLendersData.find((l: any) => l.lender?.toUpperCase() === normalized);
    if (!match) {
      match = allLendersData.find((l: any) => {
        const lu = l.lender?.toUpperCase() || '';
        return lu.includes(normalized) || normalized.includes(lu);
      });
    }
    return match || null;
  };

  const resolveContactField = (contact: Contact, fieldName: string): string => {
    switch (fieldName) {
      case 'fullName': return contact.fullName || '';
      case 'firstName': return contact.firstName || contact.fullName?.split(' ')[0] || '';
      case 'lastName': return contact.lastName || contact.fullName?.split(' ').slice(1).join(' ') || '';
      case 'email': return contact.email || '';
      case 'phone': return contact.phone || '';
      case 'address': return contact.address ? `${contact.address.line1}, ${contact.address.city}, ${contact.address.postalCode}` : 'Address Not on File';
      case 'dateOfBirth': return contact.dateOfBirth || 'DOB Not on File';
      case 'lender': return contact.lender || '';
      case 'claimValue': return contact.claimValue ? `£${contact.claimValue}` : '';
      case 'id': return contact.id || '';
      case 'clientId': return contact.clientId || '';
      case 'lenderCompanyName': {
        const ld = getLenderDetails(contact.lender);
        return ld?.address?.company_name || contact.lender || '';
      }
      case 'lenderAddress': {
        const ld = getLenderDetails(contact.lender);
        return ld?.address?.first_line_address || '';
      }
      case 'lenderCity': {
        const ld = getLenderDetails(contact.lender);
        return ld?.address?.town_city || '';
      }
      case 'lenderPostcode': {
        const ld = getLenderDetails(contact.lender);
        return ld?.address?.postcode || '';
      }
      case 'lenderEmail': {
        const ld = getLenderDetails(contact.lender);
        return ld?.email || '';
      }
      default: return '';
    }
  };

  const confirmGenerate = () => {
    if (!templateToGenerate || !selectedContactId) return;
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) return;

    const customVars = templateToGenerate.customVariables || [];
    if (customVars.length > 0) {
      const initialValues: Record<string, string> = {};
      customVars.forEach(cv => { initialValues[cv.key] = cv.defaultValue || ''; });
      setCustomVarValues(initialValues);
      setPendingGenerateContact(contact);
      setShowGenerateModal(false);
      setShowFillCustomVarsModal(true);
    } else {
      executeGenerate(contact, {});
    }
  };

  const executeGenerate = (contact: Contact, customValues: Record<string, string>) => {
    if (!templateToGenerate) return;

    let content = templateToGenerate.content;

    // Try parsing as TipTap JSON for variable replacement
    try {
      const parsed = JSON.parse(content);
      if (parsed && parsed.type === 'doc') {
        // Build variable values map
        const variableValues: Record<string, string> = {
          'client.full_name': contact.fullName || '',
          'client.first_name': contact.firstName || contact.fullName?.split(' ')[0] || '',
          'client.last_name': contact.lastName || contact.fullName?.split(' ').slice(1).join(' ') || '',
          'client.email': contact.email || '',
          'client.phone': contact.phone || '',
          'client.address': contact.address ? `${contact.address.line1}, ${contact.address.city}, ${contact.address.postalCode}` : '',
          'client.dob': contact.dateOfBirth || '',
          'claim.lender': contact.lender || '',
          'claim.reference': contact.id || '',
          'claim.value': contact.claimValue ? `£${contact.claimValue}` : '',
          'system.today': new Date().toLocaleDateString('en-GB'),
          'system.doc_date': new Date().toLocaleDateString('en-GB'),
          'firm.name': 'Rowan Rose Solicitors',
          'firm.sra_number': '8000843',
          'firm.address': 'Boat Shed, Exchange Quay, Salford M5 3EQ',
        };

        // Add custom variable values
        Object.entries(customValues).forEach(([key, value]) => {
          const cleanKey = key.replace(/^\{\{custom_/, 'custom.').replace(/\}\}$/, '');
          variableValues[cleanKey] = value;
        });

        const replaceVars = (node: any): any => {
          if (node.type === 'variable') {
            const value = variableValues[node.attrs.key];
            return { type: 'text', text: value || `[${node.attrs.name}]` };
          }
          if (node.content) {
            return { ...node, content: node.content.map(replaceVars) };
          }
          return node;
        };

        const filledDoc = replaceVars(parsed);

        // Create a temporary editor to get the HTML
        const tempDiv = document.createElement('div');
        // We'll generate HTML from the filled JSON by serialising manually
        const generateHtml = (node: any): string => {
          if (node.type === 'text') {
            let text = node.text || '';
            if (node.marks) {
              node.marks.forEach((mark: any) => {
                if (mark.type === 'bold') text = `<strong>${text}</strong>`;
                if (mark.type === 'italic') text = `<em>${text}</em>`;
                if (mark.type === 'underline') text = `<u>${text}</u>`;
              });
            }
            return text;
          }
          const children = (node.content || []).map(generateHtml).join('');
          switch (node.type) {
            case 'doc': return children;
            case 'paragraph': return `<p>${children || '<br/>'}</p>`;
            case 'heading': return `<h${node.attrs?.level || 1}>${children}</h${node.attrs?.level || 1}>`;
            case 'bulletList': return `<ul>${children}</ul>`;
            case 'orderedList': return `<ol>${children}</ol>`;
            case 'listItem': return `<li>${children}</li>`;
            case 'table': return `<table style="width:100%;border-collapse:collapse;border:1px solid #d1d5db;">${children}</table>`;
            case 'tableRow': return `<tr>${children}</tr>`;
            case 'tableCell': return `<td style="border:1px solid #d1d5db;padding:8px;">${children}</td>`;
            case 'tableHeader': return `<th style="border:1px solid #d1d5db;padding:8px;font-weight:bold;">${children}</th>`;
            case 'image': return `<img src="${node.attrs?.src}" style="max-width:100%;" />`;
            case 'horizontalRule': return '<hr />';
            case 'hardBreak': return '<br />';
            default: return children;
          }
        };

        const htmlOutput = generateHtml(filledDoc);
        content = htmlOutput;
      }
    } catch {
      // Legacy HTML content — apply old-style replacement
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;

      // Replace built-in variables
      Object.entries(VARIABLE_LOOKUP).forEach(([key, { contactField }]) => {
        let value = '';
        if (contactField) value = resolveContactField(contact, contactField);
        else if (key === '{{today}}') value = new Date().toLocaleDateString();
        else if (key === '{{companyName}}') value = 'Rowan Rose Solicitors';
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), value);
      });

      // Replace custom variables
      Object.entries(customValues).forEach(([key, value]) => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), value || '________________');
      });
    }

    addDocument({
      name: `${templateToGenerate.name} - ${contact.fullName}.html`,
      category: 'Client',
      type: 'html',
      associatedContactId: contact.id,
      size: '15 KB',
      version: 1,
      content: content,
    });

    setShowGenerateModal(false);
    setShowFillCustomVarsModal(false);
    setTemplateToGenerate(null);
    setPendingGenerateContact(null);
  };

  // ========== Computed ==========

  const allVariables = getAllVariables();
  const usedVariableKeys = editor ? getUsedVariablesFromJSON(editor.getJSON()) : new Set<string>();

  const filteredTemplates = templates.filter(t => {
    return t.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const typeFilteredTemplates = filteredTemplates.filter(t => {
    if (templateTypeFilter === 'all') return true;
    const name = t.name.toLowerCase();
    const desc = t.description?.toLowerCase() || '';
    if (templateTypeFilter === 'email') return name.includes('email') || desc.includes('email');
    if (templateTypeFilter === 'sms') return name.includes('sms') || desc.includes('sms');
    if (templateTypeFilter === 'letter') return name.includes('letter') || desc.includes('letter') || name.includes('loa') || name.includes('authority');
    return true;
  });

  // Group variables for right panel
  const groupedVariables = useMemo(() => {
    const vars = allVariables.filter(v =>
      !variableSearchQuery ||
      v.name.toLowerCase().includes(variableSearchQuery.toLowerCase()) ||
      v.key.toLowerCase().includes(variableSearchQuery.toLowerCase())
    );
    return {
      client: vars.filter(v => v.category === 'client'),
      claim: vars.filter(v => v.category === 'claim'),
      lender: vars.filter(v => v.category === 'lender'),
      system: vars.filter(v => v.category === 'system'),
      custom: vars.filter(v => v.category === 'custom'),
    };
  }, [allVariables, variableSearchQuery]);

  const categoryConfig: Record<string, { label: string; color: string }> = {
    client: { label: 'CLIENT DETAILS', color: '#FF9800' },
    claim: { label: 'CLAIM DETAILS', color: '#2196F3' },
    lender: { label: 'LENDER DETAILS', color: '#E91E63' },
    system: { label: 'SYSTEM / FIRM', color: '#9C27B0' },
    custom: { label: 'CUSTOM', color: '#4CAF50' },
  };

  // ========== EDITOR VIEW ==========

  if (viewMode === 'editor') {
    return (
      <div className="flex flex-col h-full bg-[#f0f0f0]">
        {/* Top Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex justify-between items-center shadow-sm z-30">
          <div className="flex items-center gap-3">
            <div onClick={() => setViewMode('library')} className="p-1.5 hover:bg-gray-100 rounded-full cursor-pointer text-gray-400 transition-colors">
              <ChevronRight className="rotate-180" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  className="font-bold text-base text-gray-900 border-none focus:ring-0 p-0 hover:bg-gray-50 rounded px-1 bg-transparent"
                />
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase tracking-wide">Templates</span>
                {editorSourceType !== 'blank' && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${
                    editorSourceType === 'pdf' ? 'bg-red-100 text-red-700' :
                    editorSourceType === 'docx' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {editorSourceType.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5 ml-1">
                <span>All templates</span>
                <span>&middot;</span>
                <span>Type [ to insert variables</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={editorCategory}
              onChange={(e) => setEditorCategory(e.target.value)}
              className="bg-gray-100 text-xs font-medium text-gray-700 border-none focus:ring-0 cursor-pointer rounded-lg px-3 py-2"
            >
              {MOCK_TEMPLATE_FOLDERS.map(f => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
            {editorSourceType === 'pdf' && pdfData?.s3Key && pdfOverlayFields.length > 0 && (
              <button
                onClick={handleGeneratePdf}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
              >
                <Download size={15} /> Generate PDF
              </button>
            )}
            <button
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Save size={15} /> Save
            </button>
          </div>
        </div>

        {/* Import Source Banner */}
        {importSource && (
          <div className={`px-4 py-2 flex items-center justify-between text-xs border-b ${
            importSource.fileType === 'pdf' ? 'bg-red-50 border-red-100 text-red-700' :
            importSource.fileType === 'docx' ? 'bg-blue-50 border-blue-100 text-blue-700' :
            'bg-gray-50 border-gray-100 text-gray-700'
          }`}>
            <div className="flex items-center gap-2">
              <FileUp size={14} />
              <span className="font-medium">Imported from:</span>
              <span>{importSource.fileName}</span>
              <span className="text-[10px] opacity-70">({importSource.fileSize})</span>
              {importSource.conversionMode && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  importSource.conversionMode === 'editable' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {importSource.conversionMode}
                </span>
              )}
            </div>
            <button
              onClick={() => setImportSource(null)}
              className="p-1 hover:bg-white/50 rounded transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Formatting Toolbar — only shown for legacy editor or PDF mode */}
        {editorSourceType !== 'pdf' && !useNewEditor && (
          <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center gap-0.5 overflow-x-auto z-20">
            <ToolbarBtn icon={Undo} onClick={() => editor?.chain().focus().undo().run()} title="Undo" />
            <ToolbarBtn icon={Redo} onClick={() => editor?.chain().focus().redo().run()} title="Redo" />
            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* Block type */}
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 hover:border-gray-300 focus:outline-none bg-white cursor-pointer"
              value={editor?.isActive('heading', { level: 1 }) ? 'h1' : editor?.isActive('heading', { level: 2 }) ? 'h2' : editor?.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'p') editor?.chain().focus().setParagraph().run();
                else if (val === 'h1') editor?.chain().focus().toggleHeading({ level: 1 }).run();
                else if (val === 'h2') editor?.chain().focus().toggleHeading({ level: 2 }).run();
                else if (val === 'h3') editor?.chain().focus().toggleHeading({ level: 3 }).run();
              }}
            >
              <option value="p">Normal text</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>

            {/* Font Family */}
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 hover:border-gray-300 focus:outline-none bg-white cursor-pointer ml-1"
              onChange={(e) => editor?.chain().focus().setFontFamily(e.target.value).run()}
              defaultValue="Times New Roman"
            >
              <option value="Times New Roman">Times New Roman</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
            </select>

            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarBtn icon={Bold} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold" active={editor?.isActive('bold')} />
            <ToolbarBtn icon={Italic} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic" active={editor?.isActive('italic')} />
            <ToolbarBtn icon={UnderlineIcon} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline" active={editor?.isActive('underline')} />
            <ToolbarBtn icon={Strikethrough} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough" active={editor?.isActive('strike')} />

            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarBtn icon={AlignLeft} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align Left" active={editor?.isActive({ textAlign: 'left' })} />
            <ToolbarBtn icon={AlignCenter} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align Center" active={editor?.isActive({ textAlign: 'center' })} />
            <ToolbarBtn icon={AlignRight} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align Right" active={editor?.isActive({ textAlign: 'right' })} />
            <ToolbarBtn icon={AlignJustify} onClick={() => editor?.chain().focus().setTextAlign('justify').run()} title="Justify" active={editor?.isActive({ textAlign: 'justify' })} />

            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarBtn icon={ListBulleted} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List" active={editor?.isActive('bulletList')} />
            <ToolbarBtn icon={ListOrdered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List" active={editor?.isActive('orderedList')} />

            <div className="w-px h-5 bg-gray-200 mx-1" />
            <ToolbarBtn icon={LinkIcon} onClick={() => {
              const url = prompt('URL:');
              if (url) editor?.chain().focus().setLink({ href: url }).run();
            }} title="Link" />
            <ToolbarBtn icon={Minus} onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule" />
          </div>
        )}

        {/* Main Editor Area - Three Column Layout */}
        <div className="flex-1 overflow-hidden flex">

          {/* Left Sidebar - Element Blocks */}
          <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-0.5 flex-shrink-0">
            {editorSourceType !== 'pdf' ? (
              <>
                <button
                  onClick={() => editor?.chain().focus().insertContent('<p></p>').run()}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Text Block"
                >
                  <Type size={16} />
                </button>
                <button
                  onClick={() => {
                    const url = prompt('Enter image URL:', 'https://via.placeholder.com/300');
                    if (url) editor?.chain().focus().setImage({ src: url }).run();
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Image"
                >
                  <ImageIcon size={16} />
                </button>
                <button
                  onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Table"
                >
                  <TableIcon size={16} />
                </button>
                <div className="w-6 h-px bg-gray-200 my-1" />
                <button
                  onClick={insertLetterhead}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Letterhead"
                >
                  <FileText size={16} />
                </button>
                <button
                  onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Divider"
                >
                  <Minus size={16} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => addPdfOverlayField('signature')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Signature Field">
                  <PenTool size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('text')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Text Field">
                  <Type size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('date')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Date Field">
                  <Calendar size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('checkbox')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Checkbox">
                  <CheckSquare size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('initials')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Initials Field">
                  <Hash size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('variable')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Variable Field">
                  <Layers size={16} />
                </button>
                <div className="w-6 h-px bg-gray-200 my-1" />
                <button onClick={() => addPdfOverlayField('text_block')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Text Block (editable overlay)">
                  <Square size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('text_input')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Text Input Field">
                  <TextCursorInput size={16} />
                </button>
                <button onClick={() => addPdfOverlayField('dropdown')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Dropdown Select">
                  <ListFilter size={16} />
                </button>
              </>
            )}
          </div>

          {/* Center: Document Canvas */}
          <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-[#ebebeb]">
            {editorSourceType === 'pdf' && pdfData ? (
              /* PDF Overlay Editor */
              <div className="flex flex-col items-center gap-4">
                {/* Page navigation */}
                <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm px-4 py-2 sticky top-0 z-10">
                  {pdfData.pageImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePdfPage(i)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        activePdfPage === i ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Page {i + 1}
                    </button>
                  ))}
                </div>

                {/* PDF pages */}
                {pdfData.pageImages.map((imgUrl, pageIndex) => (
                  <div
                    key={pageIndex}
                    id={`pdf-page-${pageIndex}`}
                    className="relative bg-white shadow-lg"
                    style={{
                      display: activePdfPage === pageIndex ? 'block' : 'none',
                      width: '210mm',
                    }}
                    onClick={() => setSelectedOverlayField(null)}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fieldType = e.dataTransfer.getData('fieldType') as OverlayFieldType;
                      if (!fieldType) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
                      const variableKey = e.dataTransfer.getData('variableKey') || undefined;
                      const variableName = e.dataTransfer.getData('variableName') || undefined;
                      const variableCategory = e.dataTransfer.getData('variableCategory') || undefined;
                      const id = `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                      const sizeMap: Record<string, { w: number; h: number }> = {
                        signature: { w: 20, h: 5 }, checkbox: { w: 3, h: 3 }, initials: { w: 8, h: 4 },
                        text_block: { w: 30, h: 8 }, text_input: { w: 25, h: 3.5 }, dropdown: { w: 20, h: 3.5 },
                        variable: { w: 15, h: 3 }, text: { w: 15, h: 3 }, date: { w: 15, h: 3 },
                      };
                      const size = sizeMap[fieldType] || { w: 15, h: 3 };
                      const newField: PdfOverlayField = {
                        id,
                        type: fieldType,
                        page: pageIndex,
                        x: Math.max(0, Math.min(xPct - size.w / 2, 100 - size.w)),
                        y: Math.max(0, Math.min(yPct - size.h / 2, 100 - size.h)),
                        width: size.w,
                        height: size.h,
                        label: variableName || fieldType.charAt(0).toUpperCase() + fieldType.slice(1),
                        variableKey,
                        required: false,
                        assignedRole: 'any',
                      };
                      setPdfOverlayFields(prev => [...prev, newField]);
                      setSelectedOverlayField(id);
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={`Page ${pageIndex + 1}`}
                      style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
                    />

                    {/* Overlay fields */}
                    {pdfOverlayFields
                      .filter(f => f.page === pageIndex)
                      .map(field => {
                        const isSelected = selectedOverlayField === field.id;
                        const isEditingBlock = editingTextBlockId === field.id;
                        const fieldStyles: Record<string, { bg: string; border: string; icon: string }> = {
                          variable: { bg: 'rgba(255, 152, 0, 0.15)', border: '#FF9800', icon: 'T' },
                          signature: { bg: 'rgba(33, 150, 243, 0.15)', border: '#2196F3', icon: '✍' },
                          date: { bg: 'rgba(76, 175, 80, 0.15)', border: '#4CAF50', icon: '📅' },
                          text: { bg: 'rgba(156, 39, 176, 0.15)', border: '#9C27B0', icon: 'T' },
                          checkbox: { bg: 'rgba(0, 150, 136, 0.15)', border: '#009688', icon: '☐' },
                          initials: { bg: 'rgba(255, 87, 34, 0.15)', border: '#FF5722', icon: 'IN' },
                          text_block: { bg: field.backgroundColor || '#FFFFFF', border: '#6366F1', icon: '¶' },
                          text_input: { bg: 'rgba(234, 179, 8, 0.12)', border: '#EAB308', icon: '⌨' },
                          dropdown: { bg: 'rgba(14, 165, 233, 0.12)', border: '#0EA5E9', icon: '▼' },
                        };
                        const style = fieldStyles[field.type] || fieldStyles.text;

                        // Text block renders differently - opaque bg, editable text
                        const isTextBlock = field.type === 'text_block';

                        return (
                          <div
                            key={field.id}
                            style={{
                              position: 'absolute',
                              left: `${field.x}%`,
                              top: `${field.y}%`,
                              width: `${field.width}%`,
                              height: `${field.height}%`,
                              backgroundColor: isTextBlock ? (field.backgroundColor || '#FFFFFF') : style.bg,
                              border: `2px ${isSelected ? 'solid' : 'dashed'} ${style.border}`,
                              borderRadius: '4px',
                              cursor: isEditingBlock ? 'text' : 'move',
                              display: 'flex',
                              alignItems: isTextBlock ? 'flex-start' : 'center',
                              justifyContent: isTextBlock ? 'flex-start' : 'center',
                              fontSize: field.fontSize ? `${field.fontSize}px` : '11px',
                              color: isTextBlock ? (field.fontColor || '#000') : style.border,
                              fontWeight: isTextBlock ? 400 : 600,
                              zIndex: isSelected ? 10 : 1,
                              userSelect: isEditingBlock ? 'text' : 'none',
                              padding: isTextBlock ? '4px 6px' : '0',
                              overflow: 'hidden',
                            }}
                            onClick={(e) => { e.stopPropagation(); setSelectedOverlayField(field.id); }}
                            onDoubleClick={(e) => {
                              if (isTextBlock) {
                                e.stopPropagation();
                                setEditingTextBlockId(field.id);
                              }
                            }}
                            onMouseDown={(e) => {
                              if (isEditingBlock) return; // Don't drag while editing
                              if ((e.target as HTMLElement).dataset.resizeHandle) return;
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setRepositioning({
                                id: field.id,
                                offsetX: e.clientX - rect.left,
                                offsetY: e.clientY - rect.top,
                              });
                              setSelectedOverlayField(field.id);
                            }}
                          >
                            {/* Text Block: editable or display mode */}
                            {isTextBlock ? (
                              isEditingBlock ? (
                                <textarea
                                  autoFocus
                                  value={field.textContent || ''}
                                  onChange={(e) => {
                                    setPdfOverlayFields(prev => prev.map(f =>
                                      f.id === field.id ? { ...f, textContent: e.target.value } : f
                                    ));
                                  }}
                                  onBlur={() => setEditingTextBlockId(null)}
                                  onKeyDown={(e) => { if (e.key === 'Escape') setEditingTextBlockId(null); }}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    resize: 'none',
                                    fontSize: field.fontSize ? `${field.fontSize}px` : '12px',
                                    color: field.fontColor || '#000',
                                    fontFamily: 'inherit',
                                    lineHeight: 1.4,
                                    padding: 0,
                                  }}
                                />
                              ) : (
                                <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, width: '100%' }}>
                                  {field.textContent || 'Double-click to edit...'}
                                </span>
                              )
                            ) : field.type === 'text_input' ? (
                              <span style={{ opacity: 0.6, fontSize: '10px' }}>
                                {field.placeholder || 'Text Input'} ⌨
                              </span>
                            ) : field.type === 'dropdown' ? (
                              <span style={{ opacity: 0.7, fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {field.label || 'Dropdown'} <ChevronDown size={10} />
                              </span>
                            ) : field.type === 'variable' && field.variableKey ? (
                              <span style={{ fontSize: '10px' }}>
                                [{field.variableKey}]
                              </span>
                            ) : (
                              <span>{field.label || field.variableKey || field.type}</span>
                            )}

                            {isSelected && !isEditingBlock && (
                              <>
                                <button
                                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md z-30"
                                  style={{ fontSize: '10px' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPdfOverlayFields(prev => prev.filter(f => f.id !== field.id));
                                    setSelectedOverlayField(null);
                                  }}
                                >
                                  <X size={10} />
                                </button>
                                {field.type !== 'checkbox' && (
                                  <div
                                    data-resize-handle="true"
                                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white rounded-sm cursor-se-resize shadow-sm z-30"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setResizing({
                                        id: field.id,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                        startW: field.width,
                                        startH: field.height,
                                      });
                                    }}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ))}

                {/* Extracted text panel */}
                <details className="w-[210mm] bg-white rounded-lg shadow-sm">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                    View Extracted Text
                  </summary>
                  <div className="px-4 pb-4">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap max-h-60 overflow-y-auto bg-gray-50 p-3 rounded">
                      {pdfData.extractedText}
                    </pre>
                  </div>
                </details>
              </div>
            ) : useNewEditor ? (
              /* NEW Paginated Template Editor — one TipTap editor per page */
              <div style={{ width: '100%', height: '100%' }}>
                <TemplateEditor
                  mode={editorSourceType === 'docx' ? 'docx' : 'blank'}
                  docxFile={editorDocxFile}
                  pdfFile={null}
                  variables={DEFAULT_CRM_VARIABLES}
                  initialContent={currentTemplate ? (() => {
                    try {
                      const parsed = JSON.parse(currentTemplate.content);
                      if (parsed && parsed.type === 'doc') return parsed;
                    } catch {}
                    return undefined;
                  })() : undefined}
                  onContentChange={(pages) => {
                    setPagesContent(pages);
                  }}
                  onActiveEditorChange={(ed) => {
                    setNewActiveEditor(ed);
                  }}
                  defaultFooterText="Fast Action Claims is a trading style of Rowan Rose Ltd, a company registered in England and Wales (12916452) whose registered office is situated at 1.03 Boat Shed, 12 Exchange Quay, Salford, M5 3EQ. A list of directors is available at our registered office. We are authorised and regulated by the Solicitors Regulation Authority."
                />
              </div>
            ) : (
              /* LEGACY TipTap Rich Text Editor - Multi-page A4 layout like Google Docs / Word Online */
              <div
                ref={editorPageRef}
                className="a4-paged-editor"
                style={{
                  width: '794px',
                  margin: '20px auto',
                  position: 'relative' as const,
                }}
              >
                {/* Layer 1: Page card backgrounds with shadows */}
                <div
                  className="a4-page-backgrounds"
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 0 }}
                >
                  {Array.from({ length: pageBreakCount + 1 }, (_, i) => {
                    const PH = 1123;
                    const PG = 40;
                    const topPos = i * (PH + PG);
                    return (
                      <div
                        key={`page-bg-${i}`}
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: `${topPos}px`,
                          height: `${PH}px`,
                          background: '#ffffff',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                          borderRadius: '2px',
                        }}
                      />
                    );
                  })}
                </div>

                {/* Layer 2: Header and Footer zones (clickable, editable) — white bg covers overflow */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none' }}>
                  {Array.from({ length: pageBreakCount + 1 }, (_, i) => {
                    const PH = 1123;
                    const PG = 40;
                    const pageTop = i * (PH + PG);
                    return (
                      <React.Fragment key={`hf-${i}`}>
                        {/* HEADER ZONE — covers full top area of page (padding + header + gap) */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${pageTop}px`,
                            height: '112px', // PAGE_PADDING_TOP + HEADER_HEIGHT + HF_GAP
                            zIndex: 25,
                            background: '#ffffff',
                            pointerEvents: 'none',
                          }}
                        >
                          {/* Clickable header content area inside */}
                          <div
                            style={{
                              position: 'absolute',
                              left: '72px',
                              right: '72px',
                              top: '20px',
                              height: '80px',
                              pointerEvents: 'auto',
                              cursor: 'pointer',
                              border: headerContent ? 'none' : '1px dashed #d0d0d0',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onClick={() => setEditingHeader(true)}
                          >
                            {editingHeader && i === 0 ? (
                              <textarea
                                autoFocus
                                value={headerContent}
                                onChange={(e) => setHeaderContent(e.target.value)}
                                onBlur={() => setEditingHeader(false)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setEditingHeader(false); }}
                                placeholder="Enter header text (company name, address, etc.)"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: '1px solid #3b82f6',
                                  borderRadius: '4px',
                                  padding: '8px 12px',
                                  fontSize: '10pt',
                                  fontFamily: '"Times New Roman", Times, serif',
                                  resize: 'none',
                                  outline: 'none',
                                  background: '#f8fafc',
                                  lineHeight: '1.4',
                                }}
                              />
                            ) : headerContent ? (
                              <div style={{
                                width: '100%',
                                height: '100%',
                                padding: '8px 12px',
                                fontSize: '10pt',
                                fontFamily: '"Times New Roman", Times, serif',
                                whiteSpace: 'pre-wrap',
                                color: '#333',
                                lineHeight: '1.4',
                                overflow: 'hidden',
                              }}
                                dangerouslySetInnerHTML={{ __html: headerContent }}
                              />
                            ) : (
                              <span style={{ fontSize: '10px', color: '#bbb', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                                Click to add header
                              </span>
                            )}
                          </div>
                        </div>

                        {/* FOOTER ZONE — covers full bottom area of page (gap + footer + padding) */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${pageTop + PH - 92}px`, // PH - CONTENT_ZONE_BOTTOM
                            height: '92px', // HF_GAP + FOOTER_HEIGHT + PAGE_PADDING_BOTTOM
                            zIndex: 25,
                            background: '#ffffff',
                            pointerEvents: 'none',
                          }}
                        >
                          {/* Clickable footer content area inside */}
                          <div
                            style={{
                              position: 'absolute',
                              left: '72px',
                              right: '72px',
                              top: '12px', // HF_GAP
                              height: '60px',
                              pointerEvents: 'auto',
                              cursor: 'pointer',
                              border: footerContent ? 'none' : '1px dashed #d0d0d0',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            onClick={() => setEditingFooter(true)}
                          >
                          {editingFooter && i === 0 ? (
                            <textarea
                              autoFocus
                              value={footerContent}
                              onChange={(e) => setFooterContent(e.target.value)}
                              onBlur={() => setEditingFooter(false)}
                              onKeyDown={(e) => { if (e.key === 'Escape') setEditingFooter(false); }}
                              placeholder="Enter footer text (company reg, SRA number, etc.)"
                              style={{
                                width: '100%',
                                height: '100%',
                                border: '1px solid #3b82f6',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '8pt',
                                fontFamily: '"Times New Roman", Times, serif',
                                resize: 'none',
                                outline: 'none',
                                background: '#f8fafc',
                                lineHeight: '1.3',
                                textAlign: 'center',
                              }}
                            />
                          ) : footerContent ? (
                            <div style={{
                              width: '100%',
                              height: '100%',
                              padding: '6px 12px',
                              fontSize: '8pt',
                              fontFamily: '"Times New Roman", Times, serif',
                              whiteSpace: 'pre-wrap',
                              color: '#666',
                              lineHeight: '1.3',
                              textAlign: 'center',
                              overflow: 'hidden',
                            }}
                              dangerouslySetInnerHTML={{ __html: footerContent }}
                            />
                          ) : (
                            <span style={{ fontSize: '10px', color: '#bbb', letterSpacing: '1px', textTransform: 'uppercase' as const }}>
                              Click to add footer
                            </span>
                          )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Layer 3: Actual editor content — white bg so text is always visible */}
                <div className="a4-content-layer" style={{ position: 'relative', zIndex: 1, background: '#ffffff' }}>
                  <EditorContent editor={editor} />
                </div>

                {/* Layer 4: Gap labels between pages */}
                {Array.from({ length: pageBreakCount }, (_, i) => {
                  const PH = 1123;
                  const PG = 40;
                  const gapTop = (i + 1) * PH + i * PG;
                  return (
                    <div
                      key={`page-gap-${i}`}
                      className="page-gap-label"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${gapTop}px`,
                        height: `${PG}px`,
                        zIndex: 30,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ebebeb',
                        borderTop: '1px solid #d0d0d0',
                        borderBottom: '1px solid #d0d0d0',
                      }}
                    >
                      <span style={{
                        fontSize: '9px',
                        color: '#999',
                        letterSpacing: '2px',
                        fontWeight: 600,
                        fontFamily: 'system-ui, sans-serif',
                        textTransform: 'uppercase' as const,
                      }}>
                        Page {i + 1} &mdash; Page {i + 2}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sidebar - Variables Panel */}
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col z-20 flex-shrink-0">
            {/* Panel tabs */}
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1">
              <button
                onClick={() => setRightPanelTab('variables')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  rightPanelTab === 'variables' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                Variables
              </button>
              <button
                onClick={() => setRightPanelTab('content')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  rightPanelTab === 'content' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                Content
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rightPanelTab === 'variables' ? (
                /* VARIABLES PANEL */
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Variables</h4>
                    <button
                      onClick={() => { setNewCustomVarName(''); setNewCustomVarDefault(''); setShowCreateCustomVarModal(true); }}
                      className="text-[10px] text-emerald-600 font-bold hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Plus size={12} /> Custom
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="text"
                      placeholder="Search variables..."
                      value={variableSearchQuery}
                      onChange={(e) => setVariableSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>

                  <div className="space-y-3">
                    {Object.entries(groupedVariables).map(([category, vars]) => {
                      if (vars.length === 0) return null;
                      const config = categoryConfig[category];
                      return (
                        <div key={category}>
                          <h5 className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: config.color }}>
                            {config.label}
                          </h5>
                          <div className="space-y-0.5">
                            {vars.map(v => {
                              const isUsed = usedVariableKeys.has(v.key);
                              return (
                                <div
                                  key={v.id}
                                  className="flex items-center group"
                                  draggable={editorSourceType === 'pdf'}
                                  onDragStart={(e) => {
                                    if (editorSourceType !== 'pdf') return;
                                    e.dataTransfer.setData('fieldType', 'variable');
                                    e.dataTransfer.setData('variableKey', v.key);
                                    e.dataTransfer.setData('variableName', v.name);
                                    e.dataTransfer.setData('variableCategory', v.category);
                                    e.dataTransfer.setData('variableId', v.id);
                                    e.dataTransfer.effectAllowed = 'copy';
                                  }}
                                >
                                  <button
                                    onClick={() => insertVariableAtCursor(v)}
                                    className={`flex-1 text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded flex items-center justify-between transition-colors ${
                                      isUsed ? 'text-gray-400' : 'text-gray-700'
                                    } ${editorSourceType === 'pdf' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />
                                      <span>{v.name}</span>
                                      {isUsed && (
                                        <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded font-medium">IN USE</span>
                                      )}
                                    </div>
                                    {editorSourceType === 'pdf' ? (
                                      <GripVertical size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                                    ) : (
                                      <Plus size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(`[${v.name}]`);
                                    }}
                                    className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Copy syntax"
                                  >
                                    <Copy size={12} />
                                  </button>
                                  {v.category === 'custom' && (
                                    <button
                                      onClick={() => removeCustomVariable(v.id)}
                                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Unused variables section */}
                    {allVariables.some(v => !usedVariableKeys.has(v.key)) && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                          Not Used in Document ({allVariables.filter(v => !usedVariableKeys.has(v.key)).length})
                        </summary>
                        <div className="mt-1 space-y-0.5">
                          {allVariables.filter(v => !usedVariableKeys.has(v.key)).map(v => (
                            <button
                              key={v.id}
                              onClick={() => insertVariableAtCursor(v)}
                              className="w-full text-left px-3 py-1 text-xs text-gray-400 hover:bg-gray-50 rounded flex items-center justify-between"
                            >
                              <span>{v.name}</span>
                              <Plus size={12} className="text-gray-300" />
                            </button>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Tip */}
                    <div className="bg-gray-50 rounded-lg p-2.5 text-[10px] text-gray-400 mt-2">
                      {editorSourceType === 'pdf' ? (
                        <>Tip: <strong>Drag</strong> variables from this list and drop them directly onto the PDF page to place them</>
                      ) : (
                        <>Tip: Type <code className="bg-gray-200 px-1 rounded font-mono">[</code> in the editor to quickly insert variables inline</>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* CONTENT BLOCKS PANEL */
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Blocks</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <BlockBtn icon={Type} label="Text" onClick={() => editor?.chain().focus().insertContent('<p></p>').run()} />
                      <BlockBtn icon={ImageIcon} label="Image" onClick={() => {
                        const url = prompt('Enter image URL:', 'https://via.placeholder.com/300');
                        if (url) editor?.chain().focus().setImage({ src: url }).run();
                      }} />
                      <BlockBtn icon={TableIcon} label="Table" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
                      <BlockBtn icon={Minus} label="Page break" onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
                      <BlockBtn icon={FileText} label="Letterhead" onClick={insertLetterhead} />
                    </div>
                  </div>

                  {editorSourceType === 'pdf' && (
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">PDF Overlay Fields</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <FieldBtn icon={PenTool} label="Signature" color="orange" onClick={() => addPdfOverlayField('signature')} fieldType="signature" />
                        <FieldBtn icon={Type} label="Text Field" color="orange" onClick={() => addPdfOverlayField('text')} fieldType="text" />
                        <FieldBtn icon={Calendar} label="Date" color="orange" onClick={() => addPdfOverlayField('date')} fieldType="date" />
                        <FieldBtn icon={CheckSquare} label="Checkbox" color="orange" onClick={() => addPdfOverlayField('checkbox')} fieldType="checkbox" />
                        <FieldBtn icon={Hash} label="Initials" color="orange" onClick={() => addPdfOverlayField('initials')} fieldType="initials" />
                        <FieldBtn icon={Layers} label="Variable" color="blue" onClick={() => addPdfOverlayField('variable')} fieldType="variable" />
                        <FieldBtn icon={Square} label="Text Block" color="purple" onClick={() => addPdfOverlayField('text_block')} fieldType="text_block" />
                        <FieldBtn icon={TextCursorInput} label="Text Input" color="orange" onClick={() => addPdfOverlayField('text_input')} fieldType="text_input" />
                        <FieldBtn icon={ListFilter} label="Dropdown" color="blue" onClick={() => addPdfOverlayField('dropdown')} fieldType="dropdown" />
                      </div>
                    </div>
                  )}

                  {/* Selected overlay field properties - enhanced per-type */}
                  {editorSourceType === 'pdf' && selectedOverlayField && (() => {
                    const field = pdfOverlayFields.find(f => f.id === selectedOverlayField);
                    if (!field) return null;
                    const updateField = (updates: Partial<PdfOverlayField>) => {
                      setPdfOverlayFields(prev => prev.map(f =>
                        f.id === field.id ? { ...f, ...updates } : f
                      ));
                    };
                    return (
                      <div className="border-t border-gray-100 pt-4">
                        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                          Field Properties
                          <span className="ml-2 text-[9px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded uppercase">
                            {field.type.replace('_', ' ')}
                          </span>
                        </h4>
                        <div className="space-y-3">
                          {/* Label - all field types */}
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Label</label>
                            <input
                              type="text"
                              value={field.label || ''}
                              onChange={(e) => updateField({ label: e.target.value })}
                              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          {/* Required checkbox */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.required || false}
                              onChange={(e) => updateField({ required: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs font-medium text-gray-600">Required field</span>
                          </label>

                          {/* Assigned Role */}
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Assigned Role</label>
                            <select
                              value={field.assignedRole || 'any'}
                              onChange={(e) => updateField({ assignedRole: e.target.value as any })}
                              className="w-full text-sm border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="any">Anyone</option>
                              <option value="sender">Sender (Firm)</option>
                              <option value="recipient">Recipient (Client)</option>
                            </select>
                          </div>

                          {/* Variable/Text mapping - for variable, text, text_input */}
                          {(field.type === 'variable' || field.type === 'text' || field.type === 'text_input') && (
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">
                                {field.type === 'variable' ? 'Link to Variable' : 'Map to Data Field'}
                              </label>
                              <select
                                value={field.variableKey || field.mapping || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (field.type === 'variable') {
                                    const varObj = allVariables.find(v => v.key === val);
                                    updateField({
                                      variableKey: val,
                                      label: varObj ? varObj.name : val,
                                    });
                                  } else {
                                    updateField({
                                      mapping: val,
                                      label: val ? `${field.type.replace('_', ' ').toUpperCase()}: ${val}` : field.label,
                                    });
                                  }
                                }}
                                className="w-full text-sm border border-gray-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">-- Select --</option>
                                {field.type === 'variable' ? (
                                  <>
                                    <optgroup label="Client Details">
                                      {allVariables.filter(v => v.category === 'client').map(v => (
                                        <option key={v.id} value={v.key}>{v.name}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="Claim Details">
                                      {allVariables.filter(v => v.category === 'claim').map(v => (
                                        <option key={v.id} value={v.key}>{v.name}</option>
                                      ))}
                                    </optgroup>
                                    <optgroup label="System / Firm">
                                      {allVariables.filter(v => v.category === 'system').map(v => (
                                        <option key={v.id} value={v.key}>{v.name}</option>
                                      ))}
                                    </optgroup>
                                    {allVariables.filter(v => v.category === 'custom').length > 0 && (
                                      <optgroup label="Custom">
                                        {allVariables.filter(v => v.category === 'custom').map(v => (
                                          <option key={v.id} value={v.key}>{v.name}</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <optgroup label="Client Details">
                                      <option value="fullName">Full Name</option>
                                      <option value="email">Email</option>
                                      <option value="address">Full Address</option>
                                      <option value="dob">Date of Birth</option>
                                    </optgroup>
                                    <optgroup label="Claim Details">
                                      <option value="lender">Lender Name</option>
                                      <option value="claimValue">Claim Value</option>
                                    </optgroup>
                                    <optgroup label="System">
                                      <option value="date.today">Today's Date</option>
                                      <option value="signature">Signature</option>
                                    </optgroup>
                                  </>
                                )}
                              </select>
                            </div>
                          )}

                          {/* Text Block specific: font size, color, background */}
                          {field.type === 'text_block' && (
                            <>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Font Size (px)</label>
                                <input
                                  type="number"
                                  min={8}
                                  max={48}
                                  value={field.fontSize || 12}
                                  onChange={(e) => updateField({ fontSize: parseInt(e.target.value) || 12 })}
                                  className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Text Color</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={field.fontColor || '#000000'}
                                      onChange={(e) => updateField({ fontColor: e.target.value })}
                                      className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                                    />
                                    <input
                                      type="text"
                                      value={field.fontColor || '#000000'}
                                      onChange={(e) => updateField({ fontColor: e.target.value })}
                                      className="flex-1 text-xs border border-gray-200 rounded p-1.5 font-mono"
                                    />
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-gray-600 mb-1">Background</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={field.backgroundColor || '#FFFFFF'}
                                      onChange={(e) => updateField({ backgroundColor: e.target.value })}
                                      className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                                    />
                                    <input
                                      type="text"
                                      value={field.backgroundColor || '#FFFFFF'}
                                      onChange={(e) => updateField({ backgroundColor: e.target.value })}
                                      className="flex-1 text-xs border border-gray-200 rounded p-1.5 font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="bg-indigo-50 rounded-lg p-2 text-[10px] text-indigo-600">
                                Tip: Double-click the text block on the page to edit its content. Match background color to PDF for content correction.
                              </div>
                            </>
                          )}

                          {/* Text Input specific: placeholder */}
                          {field.type === 'text_input' && (
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">Placeholder Text</label>
                              <input
                                type="text"
                                value={field.placeholder || ''}
                                onChange={(e) => updateField({ placeholder: e.target.value })}
                                className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter placeholder..."
                              />
                            </div>
                          )}

                          {/* Dropdown specific: options */}
                          {field.type === 'dropdown' && (
                            <div>
                              <label className="block text-xs font-bold text-gray-600 mb-1">Dropdown Options</label>
                              <div className="space-y-1.5">
                                {(field.options || []).map((opt, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...(field.options || [])];
                                        newOpts[idx] = e.target.value;
                                        updateField({ options: newOpts });
                                      }}
                                      className="flex-1 text-xs border border-gray-200 rounded p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                      onClick={() => {
                                        const newOpts = (field.options || []).filter((_, i) => i !== idx);
                                        updateField({ options: newOpts });
                                      }}
                                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => updateField({ options: [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`] })}
                                  className="w-full py-1.5 text-xs text-blue-600 font-medium border border-dashed border-blue-300 rounded hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Plus size={12} /> Add Option
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Position info */}
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-[10px] text-gray-400 font-medium mb-1">Position</p>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="text-[9px] text-gray-400">X</label>
                                <input
                                  type="number"
                                  value={Math.round(field.x)}
                                  onChange={(e) => updateField({ x: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-[11px] border border-gray-200 rounded p-1 text-center"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[9px] text-gray-400">Y</label>
                                <input
                                  type="number"
                                  value={Math.round(field.y)}
                                  onChange={(e) => updateField({ y: parseFloat(e.target.value) || 0 })}
                                  className="w-full text-[11px] border border-gray-200 rounded p-1 text-center"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[9px] text-gray-400">W</label>
                                <input
                                  type="number"
                                  value={Math.round(field.width)}
                                  onChange={(e) => updateField({ width: parseFloat(e.target.value) || 5 })}
                                  className="w-full text-[11px] border border-gray-200 rounded p-1 text-center"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[9px] text-gray-400">H</label>
                                <input
                                  type="number"
                                  value={Math.round(field.height)}
                                  onChange={(e) => updateField({ height: parseFloat(e.target.value) || 3 })}
                                  className="w-full text-[11px] border border-gray-200 rounded p-1 text-center"
                                />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setPdfOverlayFields(prev => prev.filter(f => f.id !== field.id));
                              setSelectedOverlayField(null);
                            }}
                            className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
                          >
                            Remove Field
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== LIBRARY VIEW ==========

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 relative">
      {/* Sidebar Folders */}
      <div className="w-56 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Files & Generation</p>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folders</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {MOCK_TEMPLATE_FOLDERS.map(folder => (
            <button
              key={folder.id}
              className="w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex justify-between items-center bg-gray-100 dark:bg-slate-700 text-navy-700 dark:text-white"
            >
              <div className="flex items-center gap-2">
                <Folder size={14} className="text-yellow-500" />
                {folder.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar with Search */}
        <div className="h-14 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
          <div className="relative w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Template Type Tabs */}
        <div className="px-6 py-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTemplateTypeFilter('email')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                templateTypeFilter === 'email'
                  ? 'bg-navy-700 border-navy-700 text-white'
                  : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
              }`}
            >
              Email Templates
            </button>
            <button
              onClick={() => setTemplateTypeFilter('sms')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                templateTypeFilter === 'sms'
                  ? 'bg-navy-700 border-navy-700 text-white'
                  : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
              }`}
            >
              SMS Templates
            </button>
            <button
              onClick={() => setTemplateTypeFilter('letter')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                templateTypeFilter === 'letter'
                  ? 'bg-navy-700 border-navy-700 text-white'
                  : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
              }`}
            >
              Letter Templates
            </button>
            <button
              onClick={() => setTemplateTypeFilter('html')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                templateTypeFilter === 'html'
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white dark:bg-slate-700 border-orange-600 dark:border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              }`}
            >
              HTML Templates (Lambda)
            </button>
          </div>
          <button
            onClick={() => setShowAddTemplateModal(true)}
            className="px-6 py-2.5 rounded-lg text-sm font-bold border-2 bg-white dark:bg-slate-700 border-green-600 dark:border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
          >
            Add new template
          </button>
        </div>

        {/* Templates Table or HTML Templates View */}
        {templateTypeFilter === 'html' ? (
          /* HTML Templates Section */
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
            {editingHtmlTemplate ? (
              /* HTML Editor */
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden h-full flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold">
                      {editingHtmlTemplate.template_type}
                    </span>
                    <h3 className="font-bold text-lg text-navy-900 dark:text-white">
                      {editingHtmlTemplate.name}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingHtmlTemplate(null); setHtmlEditorContent(''); }}
                      className="px-4 py-2 text-sm font-medium border-2 border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveHtmlTemplate}
                      disabled={htmlSaving}
                      className="px-4 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {htmlSaving ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <strong>Available Variables:</strong> {'{{clientFullName}}'}, {'{{clientAddress}}'}, {'{{clientPostcode}}'}, {'{{clientDOB}}'}, {'{{lenderName}}'}, {'{{lenderAddress}}'}, {'{{lenderEmail}}'}, {'{{today}}'}, {'{{refSpec}}'}, {'{{signatureImage}}'}
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto">
                  <textarea
                    value={htmlEditorContent}
                    onChange={(e) => setHtmlEditorContent(e.target.value)}
                    className="w-full p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y"
                    style={{ minHeight: '70vh', height: 'auto' }}
                    placeholder="Enter HTML template code here..."
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              /* HTML Templates List */
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="font-bold text-lg text-navy-900 dark:text-white">
                    HTML Templates for Lambda PDF Generation
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    LOA uses HTML template below. Cover Letter uses TipTap template from Letter Templates.
                  </p>
                </div>

                {htmlTemplatesLoading ? (
                  <div className="px-5 py-16 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-600 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400">Loading templates...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-slate-700">
                    {/* LOA Template */}
                    {(() => {
                      const loaTemplate = htmlTemplates.find(t => t.template_type === 'LOA');
                      return loaTemplate ? (
                        <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                              <FileText size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-navy-700 dark:text-navy-300">{loaTemplate.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Type: LOA | Updated: {new Date(loaTemplate.updated_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleEditHtmlTemplate(loaTemplate)}
                            className="px-4 py-1.5 text-sm font-medium border-2 border-orange-600 dark:border-orange-400 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors"
                          >
                            Edit HTML
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-5 py-4 bg-gray-50/50 dark:bg-slate-700/50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400">
                              <FileText size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">LOA Template (Not Created)</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">Click to create a default template</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCreateHtmlTemplate('LOA')}
                            className="px-4 py-1.5 text-sm font-medium border-2 border-green-600 dark:border-green-400 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                          >
                            Create Template
                          </button>
                        </div>
                      );
                    })()}

                    {/* Note: Cover Letter uses TipTap template from Letter Templates tab */}
                    <div className="px-5 py-4 bg-gray-50/50 dark:bg-slate-700/50">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        <strong>Cover Letter:</strong> Uses TipTap template from Letter Templates tab
                        <span className="text-xs ml-1">(x22904060229 - test test - VANQUIS - COVER LETTER)</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Regular Templates Table */
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {typeFilteredTemplates.length > 0 ? (
                  typeFilteredTemplates.map((template, index) => (
                    <div
                      key={template.id}
                      className={`flex items-center justify-between px-5 py-4 ${
                        index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50/50 dark:bg-slate-700/50'
                      } hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                          <FileText size={18} />
                        </div>
                        <button
                          onClick={() => handlePreview(template)}
                          className="text-sm font-semibold text-navy-700 dark:text-navy-300 hover:text-navy-900 dark:hover:text-navy-100 hover:underline transition-colors cursor-pointer"
                        >
                          {template.name}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(template)}
                          className="px-4 py-1.5 text-sm font-medium border-2 border-navy-600 dark:border-navy-400 text-navy-600 dark:text-navy-400 rounded-lg hover:bg-navy-50 dark:hover:bg-navy-900/30 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleUseTemplate(template)}
                          className="px-4 py-1.5 text-sm font-medium border-2 border-green-600 dark:border-green-400 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                        >
                          Generate
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete template "${template.name}"?`)) {
                              deleteTemplate(template.id);
                            }
                          }}
                          className="px-4 py-1.5 text-sm font-medium border-2 border-red-500 dark:border-red-400 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-16 text-center">
                    <File size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-400 dark:text-gray-500">No templates found matching your filters.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== MODALS ========== */}

      {/* Add Template Modal */}
      {showAddTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-lg text-navy-900 dark:text-white">Add New Template</h3>
              <button
                onClick={() => { setShowAddTemplateModal(false); setIsDraggingOver(false); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick={handleNew}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-navy-500 dark:hover:border-navy-400 hover:bg-navy-50 dark:hover:bg-navy-900/20 transition-all group"
              >
                <div className="p-3 rounded-lg bg-navy-100 dark:bg-navy-900/30 text-navy-600 dark:text-navy-400 group-hover:bg-navy-200 dark:group-hover:bg-navy-800/40 transition-colors">
                  <FileText size={24} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-navy-900 dark:text-white">Use a blank template</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Start from scratch with the rich text editor</p>
                </div>
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
              </div>

              <div
                onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                  isDraggingOver
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-300 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-900/10'
                }`}
              >
                <div className={`p-3 rounded-full transition-colors ${
                  isDraggingOver ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Upload size={28} />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-700 dark:text-gray-200">
                    {isDraggingOver ? 'Drop your file here' : 'Drag & drop a file here'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    or <span className="text-green-600 font-medium">browse to select</span> a file
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">PDF</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">DOCX</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold rounded">TXT</span>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded">HTML</span>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.html,.txt,.htm"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DOCX Choice Dialog - Convert vs Static */}
      {showDocxChoiceDialog && pendingDocxFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-navy-900 dark:text-white">How would you like to use this document?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{pendingDocxFile.name}</p>
              </div>
              <button
                onClick={() => { setShowDocxChoiceDialog(false); setPendingDocxFile(null); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={handleDocxConvertEditable}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
              >
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 group-hover:bg-green-200 transition-colors">
                  <Edit size={24} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Convert to Editable Template</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Convert DOCX content to rich text. You can edit the text, add variables, and modify formatting directly.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">RECOMMENDED</span>
                    <span className="text-[10px] text-gray-400">Best for letters, contracts, correspondence</span>
                  </div>
                </div>
              </button>

              <button
                onClick={handleDocxUploadStatic}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-blue-200 transition-colors">
                  <Layers size={24} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Upload as Static Background</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Render the document as a static image. Add overlay fields (signature, text, checkboxes) on top.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-gray-400">Best for pre-formatted forms, regulatory documents</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Choice Dialog - Convert to Editable vs Static Overlay */}
      {showPdfChoiceDialog && pendingPdfFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-navy-900 dark:text-white">How would you like to use this PDF?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{pendingPdfFile.name}</p>
              </div>
              <button
                onClick={() => { setShowPdfChoiceDialog(false); setPendingPdfFile(null); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={handlePdfConvertEditable}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all group"
              >
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 group-hover:bg-green-200 transition-colors">
                  <Edit size={24} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Convert to Editable Template</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Extract text, headings, and lists from the PDF into an editable rich text document. You can modify everything freely.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">RECOMMENDED</span>
                    <span className="text-[10px] text-gray-400">Best for letters, contracts, text-heavy documents</span>
                  </div>
                </div>
              </button>

              <button
                onClick={handlePdfUploadStatic}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
              >
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-blue-200 transition-colors">
                  <Layers size={24} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Keep as Static PDF with Overlay Fields</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Display the PDF pages as-is. Add draggable signature, text, date and other fields on top.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-gray-400">Best for pre-printed forms, regulatory docs with exact layout</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Custom Variable Modal */}
      {showCreateCustomVarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
            <h3 className="font-bold text-lg mb-2 text-gray-900">Create Custom Variable</h3>
            <p className="text-sm text-gray-500 mb-4">
              Custom variables are placeholders filled in when generating a document.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Variable Name *</label>
                <input
                  type="text"
                  value={newCustomVarName}
                  onChange={(e) => setNewCustomVarName(e.target.value)}
                  placeholder="e.g. Policy Number"
                  className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCustomVarName.trim()) {
                      const newVar = addCustomVariable(newCustomVarName.trim());
                      insertVariableAtCursor(newVar);
                      setShowCreateCustomVarModal(false);
                      setNewCustomVarName('');
                      setNewCustomVarDefault('');
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Default Value (optional)</label>
                <input
                  type="text"
                  value={newCustomVarDefault}
                  onChange={(e) => setNewCustomVarDefault(e.target.value)}
                  placeholder="e.g. N/A"
                  className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {newCustomVarName.trim() && (
                <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-500">
                  Will create: <code className="bg-gray-200 px-1 rounded font-mono">
                    [custom.{newCustomVarName.trim().replace(/\s+/g, '_').toLowerCase()}]
                  </code>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreateCustomVarModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newCustomVarName.trim()) return;
                  const newVar = addCustomVariable(newCustomVarName.trim());
                  if (newCustomVarDefault) {
                    useVariableStore.getState().setVariableValue(newVar.key, newCustomVarDefault);
                  }
                  insertVariableAtCursor(newVar);
                  setShowCreateCustomVarModal(false);
                  setNewCustomVarName('');
                  setNewCustomVarDefault('');
                }}
                disabled={!newCustomVarName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Create & Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Document Modal */}
      {showGenerateModal && templateToGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Generate Document</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Create a new document from <strong>{templateToGenerate.name}</strong>. Select a contact to populate fields.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Contact</label>
              <select
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-lg shadow-sm p-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.lender} Claim)</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={confirmGenerate} className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <Play size={16} /> Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fill Custom Variables Modal */}
      {showFillCustomVarsModal && pendingGenerateContact && templateToGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Fill Custom Variables</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This template has custom placeholders. Fill in the values below for
              <strong className="text-gray-700 dark:text-gray-200"> {pendingGenerateContact.fullName}</strong>.
            </p>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {(templateToGenerate.customVariables || []).map(cv => (
                <div key={cv.id}>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{cv.name}</label>
                  <input
                    type="text"
                    value={customVarValues[cv.key] || ''}
                    onChange={(e) => setCustomVarValues(prev => ({ ...prev, [cv.key]: e.target.value }))}
                    placeholder={cv.defaultValue || `Enter ${cv.name}`}
                    className="w-full text-sm border border-gray-200 dark:border-slate-600 rounded-lg p-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowFillCustomVarsModal(false); setPendingGenerateContact(null); setShowGenerateModal(true); }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm"
              >
                Back
              </button>
              <button
                onClick={() => executeGenerate(pendingGenerateContact, customVarValues)}
                className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Play size={16} /> Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showPreviewModal && previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-slate-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-bold text-lg text-navy-900 dark:text-white">{previewTemplate.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{previewTemplate.category} Template</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                {previewTemplate.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 pb-4 border-b border-gray-200 dark:border-slate-600">
                    <span className="font-semibold">Description:</span> {previewTemplate.description}
                  </p>
                )}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                  dangerouslySetInnerHTML={{ __html: (() => {
                    // Try to render TipTap JSON content
                    try {
                      const parsed = JSON.parse(previewTemplate.content);
                      if (parsed && parsed.type === 'doc') {
                        // Basic JSON to text for preview
                        const getText = (node: any): string => {
                          if (node.type === 'text') return node.text || '';
                          if (node.type === 'variable') return `[${node.attrs?.name || 'Variable'}]`;
                          if (node.type === 'paragraph') return `<p>${(node.content || []).map(getText).join('')}</p>`;
                          if (node.type === 'heading') return `<h${node.attrs?.level || 2}>${(node.content || []).map(getText).join('')}</h${node.attrs?.level || 2}>`;
                          return (node.content || []).map(getText).join('');
                        };
                        return getText(parsed);
                      }
                    } catch {}
                    return previewTemplate.content;
                  })() }}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium"
              >
                Close
              </button>
              <button
                onClick={() => { setShowPreviewModal(false); handleEdit(previewTemplate); }}
                className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Edit size={16} /> Edit Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== Sub-components ==========

const ToolbarBtn = ({ icon: Icon, onClick, title, active }: any) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      active ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`}
  >
    <Icon size={15} />
  </button>
);

const BlockBtn = ({ icon: Icon, label, onClick }: any) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg text-left hover:bg-gray-50 hover:border-gray-300 transition-colors group"
  >
    <Icon size={16} className="text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
    <span className="text-xs font-medium text-gray-600 truncate">{label}</span>
  </button>
);

const FieldBtn = ({ icon: Icon, label, color = 'orange', onClick, fieldType }: any) => {
  const styles: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100 hover:border-orange-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100 hover:border-purple-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100 hover:border-blue-200',
  };
  return (
    <button
      onClick={onClick}
      draggable={!!fieldType}
      onDragStart={(e: React.DragEvent) => {
        if (!fieldType) return;
        e.dataTransfer.setData('fieldType', fieldType);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-left transition-colors ${styles[color] || styles.orange} ${fieldType ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
  );
};

export default Templates;
