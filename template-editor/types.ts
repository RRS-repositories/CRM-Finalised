// template-editor/types.ts — All TypeScript interfaces

export interface PageData {
  id: string;
  element: HTMLElement | null;
}

export interface CRMVariable {
  key: string;        // e.g. "contact.firstName"
  label: string;      // e.g. "First Name"
  category: string;   // e.g. "Contact", "Deal", "Company"
}

export type DocumentMode = 'blank' | 'docx' | 'pdf';

export interface PageContent {
  pageIndex: number;
  tiptapJSON: Record<string, unknown>;
}

export interface SplitResult {
  kept: Record<string, unknown>;
  overflow: Record<string, unknown> | null;
}

export interface DocxImportResult {
  pages: Record<string, unknown>[];
  headerText?: string;
  footerText?: string;
}
