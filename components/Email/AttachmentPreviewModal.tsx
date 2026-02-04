import React, { useEffect } from 'react';
import { X, Download, FileText, Image as ImageIcon, File } from 'lucide-react';

interface AttachmentPreviewModalProps {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  onClose: () => void;
  onDownload: () => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  url,
  filename,
  mimeType,
  size,
  onClose,
  onDownload,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
  const canPreview = isImage || isPdf || isText;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl flex flex-col max-w-[90vw] max-h-[90vh] w-full"
        style={{ maxWidth: isImage ? '900px' : '1000px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isImage ? (
              <ImageIcon size={18} className="text-blue-500 flex-shrink-0" />
            ) : isPdf ? (
              <FileText size={18} className="text-red-500 flex-shrink-0" />
            ) : (
              <File size={18} className="text-gray-500 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{filename}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(size)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Download size={14} />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-[300px]">
          {isImage ? (
            <img
              src={url}
              alt={filename}
              className="max-w-full max-h-[75vh] object-contain rounded"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={filename}
              className="w-full h-[75vh] rounded border border-gray-200 dark:border-slate-600"
            />
          ) : isText ? (
            <iframe
              src={url}
              title={filename}
              className="w-full h-[75vh] rounded border border-gray-200 dark:border-slate-600 bg-white"
            />
          ) : (
            /* Non-previewable file types */
            <div className="flex flex-col items-center justify-center text-gray-400 py-12">
              <File size={64} className="mb-4 opacity-30" />
              <p className="text-lg font-medium mb-1 text-gray-600 dark:text-gray-300">
                Preview not available
              </p>
              <p className="text-sm mb-6">
                This file type cannot be previewed. Click download to save it.
              </p>
              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Download size={16} />
                Download {filename}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttachmentPreviewModal;
