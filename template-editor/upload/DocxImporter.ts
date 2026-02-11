// template-editor/upload/DocxImporter.ts
// Imports DOCX via backend conversion to HTML, then parses into paginated TipTap nodes

import { API_BASE_URL } from '../../src/config';
import type { DocxImportResult } from '../types';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export class DocxImporter {
  /**
   * Import a DOCX file by sending it to the backend for conversion.
   * Returns pages (TipTap docs) plus optional header/footer text.
   */
  async import(file: File): Promise<DocxImportResult> {
    // Send to backend for HTML conversion (LibreOffice/mammoth)
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/api/templates/convert-to-html`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(`DOCX conversion failed: ${data.message || 'Unknown error'}`);
    }

    let html = data.html as string;

    // Post-process HTML for TipTap compatibility
    html = this.postProcessHtml(html);

    // Parse HTML into DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    // Extract header/footer before processing body content
    let { headerText, footerText } = this.extractHeaderFooter(body);

    // Fallback: use server-provided header/footer if not found in HTML
    if (!headerText && data.headerHtml) {
      const tmp = parser.parseFromString(data.headerHtml, 'text/html');
      const text = this.normalizeWhitespace(tmp.body.textContent?.trim() || '');
      if (text) headerText = text;
    }
    if (!footerText && data.footerHtml) {
      const tmp = parser.parseFromString(data.footerHtml, 'text/html');
      const text = this.normalizeWhitespace(tmp.body.textContent?.trim() || '');
      if (text) footerText = text;
    }

    // Convert DOM elements to TipTap-compatible JSON nodes
    const nodes = this.domToTipTapNodes(body);

    const pages = nodes.length === 0
      ? [{ type: 'doc', content: [{ type: 'paragraph' }] }]
      : [{ type: 'doc', content: nodes }];

    return { pages, headerText, footerText };
  }

  /**
   * Import from raw HTML string (for editable PDF or other HTML sources)
   */
  async importFromHtml(html: string): Promise<DocxImportResult> {
    html = this.postProcessHtml(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;
    const { headerText, footerText } = this.extractHeaderFooter(body);
    const nodes = this.domToTipTapNodes(body);
    const pages = nodes.length === 0
      ? [{ type: 'doc', content: [{ type: 'paragraph' }] }]
      : [{ type: 'doc', content: nodes }];
    return { pages, headerText, footerText };
  }

  /**
   * Extract header/footer divs from the document body.
   * LibreOffice marks them with title="header" / title="footer".
   * Removes them from the DOM so they don't appear in the main content.
   */
  private extractHeaderFooter(body: HTMLElement): { headerText?: string; footerText?: string } {
    let headerText: string | undefined;
    let footerText: string | undefined;

    // LibreOffice format: div[title="header"] / div[title="footer"]
    // Mammoth format: div.docx-header / div.docx-footer
    const headerDiv = body.querySelector('div[title="header"], div.docx-header');
    if (headerDiv) {
      const text = this.normalizeWhitespace(headerDiv.textContent?.trim() || '');
      if (text) headerText = text;
      headerDiv.remove();
    }

    const footerDiv = body.querySelector('div[title="footer"], div.docx-footer');
    if (footerDiv) {
      const text = this.normalizeWhitespace(footerDiv.textContent?.trim() || '');
      if (text) footerText = text;
      footerDiv.remove();
    }

    // Also remove mammoth textboxes wrapper (content is already inline in body)
    const textboxesDiv = body.querySelector('div.docx-textboxes');
    if (textboxesDiv) {
      // Move textbox children into the body before removing the wrapper
      while (textboxesDiv.firstChild) {
        body.insertBefore(textboxesDiv.firstChild, textboxesDiv);
      }
      textboxesDiv.remove();
    }

    return { headerText, footerText };
  }

  private postProcessHtml(html: string): string {
    // Convert align attributes to inline style
    html = html.replace(
      /<(p|div|td|th|h[1-6])(\s[^>]*?)\salign=["']?(left|center|right|justify)["']?/gi,
      (_m: string, tag: string, attrs: string, align: string) => {
        if (/style\s*=/i.test(attrs)) {
          return `<${tag}${attrs.replace(/style\s*=\s*["']/i, `style="text-align: ${align}; `)}`;
        }
        return `<${tag}${attrs} style="text-align: ${align}"`;
      }
    );
    html = html.replace(
      /<(p|div|td|th|h[1-6])\s+align=["']?(left|center|right|justify)["']?\s*>/gi,
      (_m: string, tag: string, align: string) => `<${tag} style="text-align: ${align}">`
    );

    // Convert <font> to <span>
    html = html.replace(
      /<font\b([^>]*)>([\s\S]*?)<\/font>/gi,
      (_m: string, attrs: string, inner: string) => {
        const styles: string[] = [];
        const sizeMatch = attrs.match(/size=["']?(\d+)["']?/i);
        const colorMatch = attrs.match(/color=["']?([^"'\s>]+)["']?/i);
        const faceMatch = attrs.match(/face=["']?([^"'>]+)["']?/i);
        if (sizeMatch) {
          const sizeMap: Record<string, string> = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' };
          styles.push(`font-size: ${sizeMap[sizeMatch[1]] || '12pt'}`);
        }
        if (colorMatch) styles.push(`color: ${colorMatch[1]}`);
        if (faceMatch) styles.push(`font-family: ${faceMatch[1]}`);
        return styles.length ? `<span style="${styles.join('; ')}">${inner}</span>` : `<span>${inner}</span>`;
      }
    );

    return html;
  }

  private domToTipTapNodes(body: HTMLElement): TipTapNode[] {
    const nodes: TipTapNode[] = [];

    for (const child of Array.from(body.children) as HTMLElement[]) {
      const result = this.elementToTipTapNodes(child);
      nodes.push(...result);
    }

    // If no block-level nodes found, wrap the text in a paragraph
    if (nodes.length === 0 && body.textContent?.trim()) {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: body.textContent.trim() }],
      });
    }

    return nodes;
  }

  /**
   * Extract paragraph-level style attributes (margins, line-height)
   * from an element's inline style. Returns an attrs object for TipTap.
   */
  private extractParagraphAttrs(el: HTMLElement): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};
    const style = el.style;

    const align = style?.textAlign;
    if (align && align !== 'left' && align !== 'start') {
      attrs.textAlign = align;
    }

    const mt = style?.marginTop;
    if (mt && mt !== '0px' && mt !== '0') attrs.marginTop = mt;

    const mb = style?.marginBottom;
    if (mb && mb !== '0px' && mb !== '0') attrs.marginBottom = mb;

    const ml = style?.marginLeft || style?.paddingLeft;
    if (ml && ml !== '0px' && ml !== '0') attrs.marginLeft = ml;

    const lh = style?.lineHeight;
    if (lh && lh !== 'normal') attrs.lineHeight = lh;

    return attrs;
  }

  /**
   * Convert a DOM element into one or more TipTap nodes.
   * Returns an array because a <p> containing an <img> may produce
   * separate block-level image + paragraph nodes.
   */
  private elementToTipTapNodes(el: HTMLElement): TipTapNode[] {
    const tag = el.tagName.toLowerCase();

    // Direct <img> element
    if (tag === 'img') {
      const imgNode = this.imgToNode(el);
      return imgNode ? [imgNode] : [];
    }

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag.charAt(1));
      const content = this.inlineContent(el);
      const attrs: Record<string, unknown> = {
        level: Math.min(level, 4),
        ...this.extractParagraphAttrs(el),
      };
      const node: TipTapNode = {
        type: 'heading',
        attrs,
        content: content.length > 0 ? content : [{ type: 'text', text: ' ' }],
      };
      return [node];
    }

    // Divs — check if they contain block-level children and recurse
    if (tag === 'div') {
      const hasBlockChildren = el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, div, blockquote');
      if (hasBlockChildren) {
        // Recurse into children like we do for <body>
        const nodes: TipTapNode[] = [];
        for (const child of Array.from(el.children) as HTMLElement[]) {
          nodes.push(...this.elementToTipTapNodes(child));
        }
        return nodes;
      }
      // Div without block children — treat as paragraph
      const content = this.inlineContent(el);
      if (content.length === 0) return [];
      const attrs = this.extractParagraphAttrs(el);
      const node: TipTapNode = { type: 'paragraph', content };
      if (Object.keys(attrs).length > 0) node.attrs = attrs;
      return [node];
    }

    // Paragraphs — check for embedded images
    if (tag === 'p') {
      const imgs = el.querySelectorAll('img');
      if (imgs.length > 0) {
        return this.paragraphWithImages(el);
      }

      const content = this.inlineContent(el);
      const attrs = this.extractParagraphAttrs(el);
      const node: TipTapNode = {
        type: 'paragraph',
        content: content.length > 0 ? content : [],
      };
      if (Object.keys(attrs).length > 0) node.attrs = attrs;
      return [node];
    }

    // Lists
    if (tag === 'ul' || tag === 'ol') {
      const listType = tag === 'ul' ? 'bulletList' : 'orderedList';
      const items: TipTapNode[] = [];
      for (const li of Array.from(el.children) as HTMLElement[]) {
        if (li.tagName.toLowerCase() === 'li') {
          // Check if <li> contains nested block elements (paragraphs, sub-lists)
          const liContent = this.extractListItemContent(li);
          items.push({
            type: 'listItem',
            content: liContent,
          });
        }
      }
      return items.length > 0 ? [{ type: listType, content: items }] : [];
    }

    // Horizontal rule
    if (tag === 'hr') {
      return [{ type: 'horizontalRule' }];
    }

    // Blockquote
    if (tag === 'blockquote') {
      return [{
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: this.inlineContent(el),
        }],
      }];
    }

    // Tables
    if (tag === 'table') {
      return [this.tableToNode(el)];
    }

    // Default: treat as paragraph
    const text = el.textContent?.trim();
    if (text) {
      return [{
        type: 'paragraph',
        content: [{ type: 'text', text }],
      }];
    }

    return [];
  }

  /**
   * Extract content from a <li> element, handling nested paragraphs and sub-lists.
   */
  private extractListItemContent(li: HTMLElement): TipTapNode[] {
    const result: TipTapNode[] = [];
    const hasBlockChildren = li.querySelector('p, ul, ol');

    if (hasBlockChildren) {
      for (const child of Array.from(li.children) as HTMLElement[]) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'p') {
          result.push({
            type: 'paragraph',
            content: this.inlineContent(child),
          });
        } else if (tag === 'ul' || tag === 'ol') {
          const nodes = this.elementToTipTapNodes(child);
          result.push(...nodes);
        }
      }
    }

    // If no block children found, wrap inline content in a paragraph
    if (result.length === 0) {
      result.push({
        type: 'paragraph',
        content: this.inlineContent(li),
      });
    }

    return result;
  }

  /**
   * Handle a paragraph/div that contains <img> tags.
   * Extracts images as separate block nodes and remaining text as paragraphs.
   */
  private paragraphWithImages(el: HTMLElement): TipTapNode[] {
    const result: TipTapNode[] = [];
    const align = el.style?.textAlign;
    const alignAttrs = (align && align !== 'left' && align !== 'start')
      ? { textAlign: align } : undefined;

    // Walk children: extract images as block nodes, text as paragraph
    let textRuns: TipTapNode[] = [];

    const flushText = () => {
      // Remove trailing hardBreaks
      while (textRuns.length > 0 && textRuns[textRuns.length - 1].type === 'hardBreak') {
        textRuns.pop();
      }
      if (textRuns.length > 0) {
        const pNode: TipTapNode = { type: 'paragraph', content: textRuns };
        if (alignAttrs) pNode.attrs = { ...alignAttrs };
        result.push(pNode);
        textRuns = [];
      }
    };

    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        if (childEl.tagName.toLowerCase() === 'img') {
          flushText();
          const imgNode = this.imgToNode(childEl);
          if (imgNode) result.push(imgNode);
        } else {
          // Inline element — collect as text
          const inline = this.inlineContent(childEl);
          const marks = this.getMarks(childEl);
          for (const inner of inline) {
            if (inner.type === 'text' && marks.length > 0) {
              inner.marks = [...(inner.marks || []), ...marks];
            }
            textRuns.push(inner);
          }
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        const raw = child.textContent || '';
        const text = this.normalizeWhitespace(raw);
        if (text) {
          textRuns.push({ type: 'text', text });
        }
      }
    }

    flushText();
    return result;
  }

  /** Convert an <img> element to a TipTap image node */
  private imgToNode(img: HTMLElement): TipTapNode | null {
    const src = img.getAttribute('src');
    if (!src) return null;

    // Try HTML attributes first, then fall back to inline style dimensions
    let width: string | null = img.getAttribute('width');
    let height: string | null = img.getAttribute('height');

    if (!width || !height) {
      const style = img.getAttribute('style') || '';
      const wMatch = style.match(/width:\s*(\d+(?:\.\d+)?)\s*px/i);
      const hMatch = style.match(/height:\s*(\d+(?:\.\d+)?)\s*px/i);
      if (wMatch && !width) width = Math.round(parseFloat(wMatch[1])).toString();
      if (hMatch && !height) height = Math.round(parseFloat(hMatch[1])).toString();
    }

    return {
      type: 'image',
      attrs: {
        src,
        alt: img.getAttribute('alt') || '',
        title: img.getAttribute('title') || null,
        width,
        height,
      },
    };
  }

  private tableToNode(table: HTMLElement): TipTapNode {
    const rows: TipTapNode[] = [];
    const trs = table.querySelectorAll('tr');
    trs.forEach((tr) => {
      const cells: TipTapNode[] = [];
      tr.querySelectorAll('td, th').forEach((cell) => {
        cells.push({
          type: cell.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell',
          content: [{
            type: 'paragraph',
            content: this.inlineContent(cell as HTMLElement),
          }],
        });
      });
      if (cells.length > 0) {
        rows.push({ type: 'tableRow', content: cells });
      }
    });
    return { type: 'table', content: rows };
  }

  /**
   * Collapse newlines and runs of whitespace into single spaces,
   * mimicking how browsers render whitespace inside normal-flow HTML.
   */
  private normalizeWhitespace(text: string): string {
    return text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
  }

  private inlineContent(el: HTMLElement): TipTapNode[] {
    const result: TipTapNode[] = [];

    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const raw = child.textContent || '';
        const text = this.normalizeWhitespace(raw);
        if (text) {
          result.push({ type: 'text', text });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const tag = childEl.tagName.toLowerCase();

        if (tag === 'br') {
          result.push({ type: 'hardBreak' });
          continue;
        }

        // Recurse and collect marks
        const innerContent = this.inlineContent(childEl);
        const marks = this.getMarks(childEl);

        for (const inner of innerContent) {
          if (inner.type === 'text' && marks.length > 0) {
            const existingMarks = inner.marks || [];
            inner.marks = [...existingMarks, ...marks];
          }
          result.push(inner);
        }
      }
    }

    return result;
  }

  private getMarks(el: HTMLElement): { type: string; attrs?: Record<string, unknown> }[] {
    const marks: { type: string; attrs?: Record<string, unknown> }[] = [];
    const tag = el.tagName.toLowerCase();

    if (tag === 'strong' || tag === 'b') marks.push({ type: 'bold' });
    if (tag === 'em' || tag === 'i') marks.push({ type: 'italic' });
    if (tag === 'u') marks.push({ type: 'underline' });
    if (tag === 's' || tag === 'del' || tag === 'strike') marks.push({ type: 'strike' });
    if (tag === 'a' && el.getAttribute('href')) {
      marks.push({ type: 'link', attrs: { href: el.getAttribute('href') } });
    }

    // Check for bold/italic/underline in style
    const style = el.getAttribute('style') || '';
    if (/font-weight:\s*(bold|[6-9]\d{2}|1000)/i.test(style)) marks.push({ type: 'bold' });
    if (/font-style:\s*italic/i.test(style)) marks.push({ type: 'italic' });
    if (/text-decoration[^:]*:\s*underline/i.test(style)) marks.push({ type: 'underline' });

    // Font size → textStyle mark
    const fontSizeMatch = style.match(/font-size:\s*([^;]+)/i);
    if (fontSizeMatch) {
      const fontSize = fontSizeMatch[1].trim();
      marks.push({ type: 'textStyle', attrs: { fontSize } });
    }

    // Color → textStyle mark (or color mark)
    const colorMatch = style.match(/(?<![a-z-])color:\s*([^;]+)/i);
    if (colorMatch) {
      const color = colorMatch[1].trim();
      // Skip black/default colors to keep JSON lean
      if (color !== '#000000' && color !== '#000' && color !== 'black' && color !== 'rgb(0, 0, 0)') {
        marks.push({ type: 'textStyle', attrs: { color } });
      }
    }

    // Font family → textStyle mark
    const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/i);
    if (fontFamilyMatch) {
      const fontFamily = fontFamilyMatch[1].trim().replace(/['"]/g, '');
      // Skip default fonts
      if (fontFamily && !fontFamily.match(/^(Arial|sans-serif|Helvetica)$/i)) {
        marks.push({ type: 'textStyle', attrs: { fontFamily } });
      }
    }

    return marks;
  }

}
