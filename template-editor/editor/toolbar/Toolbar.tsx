// template-editor/editor/toolbar/Toolbar.tsx
// Formatting toolbar that acts on the currently focused editor

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Minus, Type
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import VariablePicker from './VariablePicker';
import type { CRMVariable } from '../../types';

interface ToolbarProps {
  activeEditor: Editor | null;
  variables: CRMVariable[];
  onInsertVariable: (variable: CRMVariable) => void;
  onInsertSignature: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  activeEditor,
  variables,
  onInsertVariable,
  onInsertSignature,
}) => {
  const [, forceUpdate] = useState(0);

  // Re-render toolbar when editor state changes (selection, formatting)
  useEffect(() => {
    if (!activeEditor) return;

    const handler = () => forceUpdate((n) => n + 1);
    activeEditor.on('selectionUpdate', handler);
    activeEditor.on('transaction', handler);

    return () => {
      activeEditor.off('selectionUpdate', handler);
      activeEditor.off('transaction', handler);
    };
  }, [activeEditor]);

  const run = useCallback(
    (fn: (editor: Editor) => void) => {
      if (activeEditor) fn(activeEditor);
    },
    [activeEditor]
  );

  const isActive = useCallback(
    (nameOrAttrs: string | Record<string, unknown>, attrs?: Record<string, unknown>) => {
      if (!activeEditor) return false;
      if (typeof nameOrAttrs === 'string') {
        return activeEditor.isActive(nameOrAttrs, attrs) ?? false;
      }
      return activeEditor.isActive(nameOrAttrs) ?? false;
    },
    [activeEditor]
  );

  if (!activeEditor) {
    return <div className="te-toolbar" style={{ opacity: 0.5, pointerEvents: 'none' }}>
      <span style={{ fontSize: 12, color: '#999', padding: '0 8px' }}>Click on a page to start editing</span>
    </div>;
  }

  return (
    <div className="te-toolbar">
      {/* Undo/Redo */}
      <div className="te-toolbar-group">
        <button
          onClick={() => run((e) => e.chain().focus().undo().run())}
          title="Undo"
        >
          <Undo size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().redo().run())}
          title="Redo"
        >
          <Redo size={14} />
        </button>
      </div>

      {/* Block type */}
      <div className="te-toolbar-group">
        <select
          value={
            isActive('heading', { level: 1 })
              ? 'h1'
              : isActive('heading', { level: 2 })
              ? 'h2'
              : isActive('heading', { level: 3 })
              ? 'h3'
              : 'p'
          }
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'p') run((ed) => ed.chain().focus().setParagraph().run());
            else if (val === 'h1') run((ed) => ed.chain().focus().toggleHeading({ level: 1 }).run());
            else if (val === 'h2') run((ed) => ed.chain().focus().toggleHeading({ level: 2 }).run());
            else if (val === 'h3') run((ed) => ed.chain().focus().toggleHeading({ level: 3 }).run());
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>

      {/* Text formatting */}
      <div className="te-toolbar-group">
        <button
          onClick={() => run((e) => e.chain().focus().toggleBold().run())}
          className={isActive('bold') ? 'te-active' : ''}
          title="Bold"
        >
          <Bold size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().toggleItalic().run())}
          className={isActive('italic') ? 'te-active' : ''}
          title="Italic"
        >
          <Italic size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().toggleUnderline().run())}
          className={isActive('underline') ? 'te-active' : ''}
          title="Underline"
        >
          <UnderlineIcon size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().toggleStrike().run())}
          className={isActive('strike') ? 'te-active' : ''}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </button>
      </div>

      {/* Alignment */}
      <div className="te-toolbar-group">
        <button
          onClick={() => run((e) => e.chain().focus().setTextAlign('left').run())}
          className={isActive({ textAlign: 'left' }) ? 'te-active' : ''}
          title="Align Left"
        >
          <AlignLeft size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().setTextAlign('center').run())}
          className={isActive({ textAlign: 'center' }) ? 'te-active' : ''}
          title="Align Center"
        >
          <AlignCenter size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().setTextAlign('right').run())}
          className={isActive({ textAlign: 'right' }) ? 'te-active' : ''}
          title="Align Right"
        >
          <AlignRight size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().setTextAlign('justify').run())}
          className={isActive({ textAlign: 'justify' }) ? 'te-active' : ''}
          title="Justify"
        >
          <AlignJustify size={14} />
        </button>
      </div>

      {/* Lists */}
      <div className="te-toolbar-group">
        <button
          onClick={() => run((e) => e.chain().focus().toggleBulletList().run())}
          className={isActive('bulletList') ? 'te-active' : ''}
          title="Bullet List"
        >
          <List size={14} />
        </button>
        <button
          onClick={() => run((e) => e.chain().focus().toggleOrderedList().run())}
          className={isActive('orderedList') ? 'te-active' : ''}
          title="Numbered List"
        >
          <ListOrdered size={14} />
        </button>
      </div>

      {/* Extras */}
      <div className="te-toolbar-group">
        <button
          onClick={() => run((e) => e.chain().focus().setHorizontalRule().run())}
          title="Horizontal Rule"
        >
          <Minus size={14} />
        </button>
      </div>

      {/* Variable Picker */}
      <div className="te-toolbar-group">
        <VariablePicker variables={variables} onInsert={onInsertVariable} />
      </div>

      {/* Signature */}
      <div className="te-toolbar-group" style={{ borderRight: 'none' }}>
        <button
          onClick={onInsertSignature}
          title="Add Signature Field"
          style={{ fontSize: 11, gap: 4, display: 'flex', alignItems: 'center' }}
        >
          <span style={{ fontSize: 16 }}>{'\u270D'}</span> Signature
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
