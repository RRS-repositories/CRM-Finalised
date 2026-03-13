import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link2, Image, Type, Undo2, Redo2, RemoveFormatting,
  ChevronDown, Highlighter, Palette
} from 'lucide-react';

interface RichTextToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onInsertImage?: () => void;
}

const FONT_FAMILIES = [
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];

const FONT_SIZES = [
  { label: '8', value: '1' },
  { label: '10', value: '2' },
  { label: '12', value: '3' },
  { label: '14', value: '4' },
  { label: '18', value: '5' },
  { label: '24', value: '6' },
  { label: '36', value: '7' },
];

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF',
  '#9900FF', '#FF00FF', '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3',
  '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
];

const HIGHLIGHT_COLORS = [
  'transparent', '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FF0000',
  '#0000FF', '#FFA500', '#FFCCCB', '#90EE90', '#ADD8E6', '#DDA0DD',
];

const RichTextToolbar: React.FC<RichTextToolbarProps> = ({ editorRef, onInsertImage }) => {
  const [showFontFamily, setShowFontFamily] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [currentFont, setCurrentFont] = useState('Tahoma');
  const [currentSize, setCurrentSize] = useState('12');

  const fontFamilyRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fontFamilyRef.current && !fontFamilyRef.current.contains(e.target as Node)) setShowFontFamily(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setShowFontSize(false);
      if (textColorRef.current && !textColorRef.current.contains(e.target as Node)) setShowTextColor(false);
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) setShowHighlight(false);
      if (linkInputRef.current && !linkInputRef.current.contains(e.target as Node)) setShowLinkInput(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedSelectionRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  const execCommand = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }, [editorRef]);

  const handleFontFamily = (font: typeof FONT_FAMILIES[0]) => {
    restoreSelection();
    execCommand('fontName', font.value);
    setCurrentFont(font.label);
    setShowFontFamily(false);
  };

  const handleFontSize = (size: typeof FONT_SIZES[0]) => {
    restoreSelection();
    execCommand('fontSize', size.value);
    setCurrentSize(size.label);
    setShowFontSize(false);
  };

  const handleTextColor = (color: string) => {
    restoreSelection();
    execCommand('foreColor', color);
    setShowTextColor(false);
  };

  const handleHighlight = (color: string) => {
    restoreSelection();
    if (color === 'transparent') {
      execCommand('removeFormat');
    } else {
      execCommand('hiliteColor', color);
    }
    setShowHighlight(false);
  };

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    restoreSelection();
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    execCommand('createLink', url);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const handleClearFormatting = () => {
    execCommand('removeFormat');
    execCommand('unlink');
  };

  const ToolbarButton: React.FC<{
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
  }> = ({ onClick, title, children, active }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent losing focus/selection in editor
        onClick();
      }}
      className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors ${
        active ? 'bg-gray-200 dark:bg-slate-600 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
      }`}
      title={title}
    >
      {children}
    </button>
  );

  const Separator = () => (
    <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-0.5" />
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
      {/* Undo / Redo */}
      <ToolbarButton onClick={() => execCommand('undo')} title="Undo (Ctrl+Z)">
        <Undo2 size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('redo')} title="Redo (Ctrl+Y)">
        <Redo2 size={14} />
      </ToolbarButton>

      <Separator />

      {/* Font Family */}
      <div className="relative" ref={fontFamilyRef}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowFontFamily(v => !v);
            setShowFontSize(false);
            setShowTextColor(false);
            setShowHighlight(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors min-w-[90px]"
          title="Font family"
        >
          <Type size={12} />
          <span className="truncate">{currentFont}</span>
          <ChevronDown size={10} />
        </button>
        {showFontFamily && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
            {FONT_FAMILIES.map(font => (
              <button
                key={font.label}
                onMouseDown={(e) => { e.preventDefault(); handleFontFamily(font); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 ${
                  currentFont === font.label ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                }`}
                style={{ fontFamily: font.value }}
              >
                {font.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font Size */}
      <div className="relative" ref={fontSizeRef}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowFontSize(v => !v);
            setShowFontFamily(false);
            setShowTextColor(false);
            setShowHighlight(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors min-w-[48px]"
          title="Font size"
        >
          <span>{currentSize}</span>
          <ChevronDown size={10} />
        </button>
        {showFontSize && (
          <div className="absolute top-full left-0 mt-1 w-20 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 py-1">
            {FONT_SIZES.map(size => (
              <button
                key={size.label}
                onMouseDown={(e) => { e.preventDefault(); handleFontSize(size); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 ${
                  currentSize === size.label ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Bold, Italic, Underline, Strikethrough */}
      <ToolbarButton onClick={() => execCommand('bold')} title="Bold (Ctrl+B)">
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('italic')} title="Italic (Ctrl+I)">
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('underline')} title="Underline (Ctrl+U)">
        <Underline size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('strikeThrough')} title="Strikethrough">
        <Strikethrough size={14} />
      </ToolbarButton>

      <Separator />

      {/* Text Color */}
      <div className="relative" ref={textColorRef}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowTextColor(v => !v);
            setShowHighlight(false);
            setShowFontFamily(false);
            setShowFontSize(false);
          }}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-gray-600 dark:text-gray-300"
          title="Text color"
        >
          <Palette size={14} />
        </button>
        {showTextColor && (
          <div className="absolute top-full left-0 mt-1 w-[200px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 p-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Text Color</p>
            <div className="grid grid-cols-10 gap-1">
              {TEXT_COLORS.map(color => (
                <button
                  key={color}
                  onMouseDown={(e) => { e.preventDefault(); handleTextColor(color); }}
                  className="w-4 h-4 rounded border border-gray-300 dark:border-slate-500 hover:ring-2 hover:ring-blue-400 transition-all"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Highlight Color */}
      <div className="relative" ref={highlightRef}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowHighlight(v => !v);
            setShowTextColor(false);
            setShowFontFamily(false);
            setShowFontSize(false);
          }}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-gray-600 dark:text-gray-300"
          title="Highlight color"
        >
          <Highlighter size={14} />
        </button>
        {showHighlight && (
          <div className="absolute top-full left-0 mt-1 w-[160px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 p-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Highlight</p>
            <div className="grid grid-cols-6 gap-1">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color}
                  onMouseDown={(e) => { e.preventDefault(); handleHighlight(color); }}
                  className={`w-5 h-5 rounded border hover:ring-2 hover:ring-blue-400 transition-all ${
                    color === 'transparent' ? 'border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-700 flex items-center justify-center' : 'border-gray-300 dark:border-slate-500'
                  }`}
                  style={color !== 'transparent' ? { backgroundColor: color } : undefined}
                  title={color === 'transparent' ? 'No highlight' : color}
                >
                  {color === 'transparent' && <span className="text-xs text-gray-400">✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Alignment */}
      <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Align left">
        <AlignLeft size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Align center">
        <AlignCenter size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('justifyRight')} title="Align right">
        <AlignRight size={14} />
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Bullet list">
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Numbered list">
        <ListOrdered size={14} />
      </ToolbarButton>

      <Separator />

      {/* Insert Link */}
      <div className="relative" ref={linkInputRef}>
        <ToolbarButton
          onClick={() => {
            saveSelection();
            setShowLinkInput(v => !v);
          }}
          title="Insert link"
        >
          <Link2 size={14} />
        </ToolbarButton>
        {showLinkInput && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-50 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Insert Link</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInsertLink(); }}
                placeholder="https://example.com"
                className="flex-1 text-sm px-2.5 py-1.5 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); handleInsertLink(); }}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Insert
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Insert Image */}
      {onInsertImage && (
        <ToolbarButton onClick={onInsertImage} title="Insert image">
          <Image size={14} />
        </ToolbarButton>
      )}

      {/* Clear Formatting */}
      <ToolbarButton onClick={handleClearFormatting} title="Clear formatting">
        <RemoveFormatting size={14} />
      </ToolbarButton>
    </div>
  );
};

export default RichTextToolbar;
