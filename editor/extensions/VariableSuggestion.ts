import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { VariableDropdown, VariableSuggestionItem } from '../components/VariableDropdown';
import { useVariableStore } from '../../stores/variableStore';

export function createVariableSuggestion() {
  return {
    char: '[',
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }: { query: string }): VariableSuggestionItem[] => {
      const allVars = useVariableStore.getState().getAllVariables();
      return allVars
        .filter(
          (v) =>
            v.name.toLowerCase().includes(query.toLowerCase()) ||
            v.key.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 15)
        .map((v) => ({
          id: v.id,
          name: v.name,
          key: v.key,
          category: v.category,
        }));
    },

    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(VariableDropdown, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            maxWidth: 'none',
          });
        },

        onUpdate: (props: any) => {
          component?.updateProps(props);
          if (popup?.[0] && props.clientRect) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },

        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown?.(props) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },

    command: ({ editor, range, props }: any) => {
      const item = props as VariableSuggestionItem;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'variable',
          attrs: {
            id: item.id,
            name: item.name,
            category: item.category,
            key: item.key,
            value: null,
          },
        })
        .insertContent(' ')
        .run();
    },
  };
}
