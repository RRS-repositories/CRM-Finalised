// template-editor/index.ts — Main entry point

export { default as TemplateEditor } from './TemplateEditor';
export type { TemplateEditorProps } from './TemplateEditor';
export { default as PageManager } from './page-manager/PageManager';
export type { PageManagerHandle } from './page-manager/PageManager';
export { default as Toolbar } from './editor/toolbar/Toolbar';
export { default as VariablePicker } from './editor/toolbar/VariablePicker';
export { default as PdfViewer } from './upload/PdfViewer';
export { DocxImporter } from './upload/DocxImporter';
export { VariableNode } from './editor/extensions/VariableNode';
export { SignatureNode } from './editor/extensions/SignatureNode';
export { PAGE_CONFIG, DEFAULT_CRM_VARIABLES } from './constants';
export type { CRMVariable, DocumentMode, PageContent, PageData, SplitResult } from './types';
