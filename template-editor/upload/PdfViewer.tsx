// template-editor/upload/PdfViewer.tsx
// Renders PDF pages as canvas elements using pdf.js (view-only)

import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PAGE_CONFIG } from '../constants';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  file: File;
}

interface PdfPageData {
  pageNum: number;
  dataUrl: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ file }) => {
  const [pages, setPages] = useState<PdfPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const renderedPages: PdfPageData[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;

          const pdfPage = await pdf.getPage(pageNum);
          const viewport = pdfPage.getViewport({ scale: 1.33 }); // ~96dpi for A4

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext('2d')!;
          await pdfPage.render({ canvasContext: ctx, viewport, canvas } as any).promise;

          renderedPages.push({
            pageNum,
            dataUrl: canvas.toDataURL('image/png'),
          });
        }

        if (!cancelled) {
          setPages(renderedPages);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('PDF render error:', err);
          setError(err.message || 'Failed to render PDF');
          setLoading(false);
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (loading) {
    return (
      <div className="te-page-canvas te-pdf-viewer-mode">
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Loading PDF...</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>
            Rendering {file.name}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="te-page-canvas te-pdf-viewer-mode">
        <div style={{ padding: 40, textAlign: 'center', color: '#c00' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>PDF Error</div>
          <div style={{ fontSize: 13 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="te-page-canvas te-pdf-viewer-mode">
      {pages.map((page) => (
        <div
          key={page.pageNum}
          className="te-page"
          style={{
            width: PAGE_CONFIG.width,
            height: PAGE_CONFIG.height,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <img
            src={page.dataUrl}
            alt={`Page ${page.pageNum}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          <div className="te-page-number">Page {page.pageNum}</div>
        </div>
      ))}
    </div>
  );
};

export default PdfViewer;
