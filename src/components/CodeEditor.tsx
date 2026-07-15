import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MIPS_LANGUAGE_ID,
  defineMipsThemes,
  mipsThemeName,
  registerMipsLanguage,
} from '../helpers/mipsMonaco';
import type { Theme } from '../theme/themes';
import { THEMES } from '../theme/themes';

const MONACO_QUICK_COMMAND_ACTION_ID = 'editor.action.quickCommand';
const EDITOR_CONTEXT_MENU_WIDTH = 230;
const EDITOR_CONTEXT_MENU_ESTIMATED_HEIGHT = 322;
const EDITOR_CONTEXT_MENU_MARGIN = 8;

type EditorContextMenuState = {
  left: number;
  top: number;
  lineNumber: number | null;
  selectedIndex: number;
};

type EditorContextMenuItem =
  | { type: 'separator'; id: string }
  | {
      type: 'item';
      id: string;
      label: string;
      keybinding?: string;
      disabled?: boolean;
      run: () => void | Promise<void>;
    };

function clampContextMenuPosition(left: number, top: number) {
  const viewportMaxLeft = Math.max(
    EDITOR_CONTEXT_MENU_MARGIN,
    window.innerWidth - EDITOR_CONTEXT_MENU_WIDTH - EDITOR_CONTEXT_MENU_MARGIN,
  );
  const nextLeft = left + EDITOR_CONTEXT_MENU_WIDTH + EDITOR_CONTEXT_MENU_MARGIN > window.innerWidth
    ? left - EDITOR_CONTEXT_MENU_WIDTH
    : left;

  return {
    left: Math.max(
      EDITOR_CONTEXT_MENU_MARGIN,
      Math.min(nextLeft, viewportMaxLeft),
    ),
    top: Math.max(
      EDITOR_CONTEXT_MENU_MARGIN,
      Math.min(top, window.innerHeight - EDITOR_CONTEXT_MENU_ESTIMATED_HEIGHT - EDITOR_CONTEXT_MENU_MARGIN),
    ),
  };
}

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  theme: Theme;
  activeLine: number | null;
  cursorLine?: number | null;
  breakpoints: Set<number>;
  onBreakpointToggle: (line: number) => void;
  onCursorLineChange?: (line: number) => void;
  errorLines?: { line: number; message: string }[];
  onAssemble?: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  fontSize?: number;
  tabSize?: number;
}

export type CodeEditorHandle = {
  focus: () => void;
  find: () => void;
  replace: () => void;
  gotoLine: () => void;
};

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({
  code,
  setCode,
  theme,
  activeLine,
  cursorLine,
  breakpoints,
  onBreakpointToggle,
  onCursorLineChange,
  errorLines = [],
  onAssemble,
  onToggleSidebar,
  onOpenCommandPalette,
  fontSize = 15,
  tabSize = 4,
}, ref) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const activeDecoRef = useRef<string[]>([]);
  const bpDecoRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [contentLeft, setContentLeft] = useState(40);
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState | null>(null);
  const disposablesRef = useRef<Monaco.IDisposable[]>([]);
  const contextMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep callbacks fresh without re-binding Monaco commands/listeners
  const onAssembleRef = useRef(onAssemble);
  const onBreakpointToggleRef = useRef(onBreakpointToggle);
  const onToggleSidebarRef = useRef(onToggleSidebar);
  const onOpenCommandPaletteRef = useRef(onOpenCommandPalette);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  useEffect(() => { onAssembleRef.current = onAssemble; }, [onAssemble]);
  useEffect(() => { onBreakpointToggleRef.current = onBreakpointToggle; }, [onBreakpointToggle]);
  useEffect(() => { onToggleSidebarRef.current = onToggleSidebar; }, [onToggleSidebar]);
  useEffect(() => { onOpenCommandPaletteRef.current = onOpenCommandPalette; }, [onOpenCommandPalette]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    find: () => {
      editorRef.current?.focus();
      editorRef.current?.getAction('actions.find')?.run();
    },
    replace: () => {
      editorRef.current?.focus();
      editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run();
    },
    gotoLine: () => {
      editorRef.current?.focus();
      editorRef.current?.getAction('editor.action.gotoLine')?.run();
    },
  }), []);

  const isDark = theme.bg === THEMES.dark.bg;

  const beforeMount: BeforeMount = (monaco) => {
    registerMipsLanguage(monaco);
    defineMipsThemes(monaco);
  };

  const closeEditorContextMenu = useCallback(() => {
    setEditorContextMenu(null);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const runEditorAction = useCallback(async (actionId: string, fallback?: () => void) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const action = editor.getAction(actionId);
    if (action) {
      await action.run();
      return;
    }

    fallback?.();
  }, []);

  const openEditorContextMenu = useCallback((left: number, top: number, lineNumber: number | null) => {
    const position = clampContextMenuPosition(left, top);
    setEditorContextMenu({
      ...position,
      lineNumber,
      selectedIndex: 0,
    });
  }, []);

  const openEditorContextMenuFromKeyboard = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const editorDomNode = editor.getDomNode();
    const cursorPosition = editor.getPosition();
    const visiblePosition = cursorPosition ? editor.getScrolledVisiblePosition(cursorPosition) : null;
    const editorRect = editorDomNode?.getBoundingClientRect();
    if (!editorRect || !visiblePosition) {
      openEditorContextMenu(window.innerWidth / 2, window.innerHeight / 2, cursorPosition?.lineNumber ?? null);
      return;
    }

    openEditorContextMenu(
      editorRect.left + visiblePosition.left,
      editorRect.top + visiblePosition.top + visiblePosition.height,
      cursorPosition?.lineNumber ?? null,
    );
  }, [openEditorContextMenu]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    monaco.editor.setTheme(mipsThemeName(isDark));

    // Ctrl/Cmd+Enter → assemble (Monaco captures this key, so route via command)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onAssembleRef.current?.());

    // Ctrl/Cmd+B → toggle sidebar
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => onToggleSidebarRef.current?.());

    // WIMPS owns the command palette. Monaco captures these keys inside the
    // editor, so route them back to the app-level palette.
    editor.addCommand(monaco.KeyCode.F1, () => onOpenCommandPaletteRef.current?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => onOpenCommandPaletteRef.current?.());
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F10, () => openEditorContextMenuFromKeyboard());
    editor.addCommand(monaco.KeyCode.ContextMenu, () => openEditorContextMenuFromKeyboard());
    const quickCommandAction = editor.getAction(MONACO_QUICK_COMMAND_ACTION_ID);
    if (quickCommandAction) {
      (quickCommandAction as any).run = () => {
        onOpenCommandPaletteRef.current?.();
        return Promise.resolve();
      };
    }
    disposablesRef.current = [
      editor.onMouseDown((e) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
          const ln = e.target.position?.lineNumber;
          if (ln) onBreakpointToggleRef.current(ln);
        }
      }),
      editor.onDidChangeCursorPosition((e) => {
        onCursorLineChangeRef.current?.(e.position.lineNumber);
      }),
      editor.onDidLayoutChange((info) => setContentLeft(info.contentLeft)),
    ];

    setContentLeft(editor.getLayoutInfo().contentLeft);
    onCursorLineChangeRef.current?.(editor.getPosition()?.lineNumber ?? 1);
    setReady(true);
  };

  useEffect(() => {
    return () => { disposablesRef.current.forEach(d => d.dispose()); };
  }, []);

  // Active-line highlight
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const decos: Monaco.editor.IModelDeltaDecoration[] = activeLine
      ? [{ range: new monaco.Range(activeLine, 1, activeLine, 1), options: { isWholeLine: true, className: 'mips-active-line' } }]
      : [];
    activeDecoRef.current = ed.deltaDecorations(activeDecoRef.current, decos);
    if (activeLine) ed.revealLineInCenter(activeLine);
  }, [activeLine, ready]);

  // Breakpoint glyph dots
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const decos: Monaco.editor.IModelDeltaDecoration[] = [...breakpoints].map(ln => ({
      range: new monaco.Range(ln, 1, ln, 1),
      options: { glyphMarginClassName: 'mips-bp-glyph' },
    }));
    bpDecoRef.current = ed.deltaDecorations(bpDecoRef.current, decos);
  }, [breakpoints, ready]);

  // Error squiggles
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const markers: Monaco.editor.IMarkerData[] = errorLines
      .filter(e => e.line >= 1 && e.line <= lineCount)
      .map(e => ({
        startLineNumber: e.line,
        endLineNumber: e.line,
        startColumn: 1,
        endColumn: model.getLineMaxColumn(e.line),
        message: e.message,
        severity: monaco.MarkerSeverity.Error,
      }));
    monaco.editor.setModelMarkers(model, 'mips', markers);
  }, [errorLines, ready]);

  // Theme switch
  useEffect(() => {
    monacoRef.current?.editor.setTheme(mipsThemeName(isDark));
  }, [isDark]);

  // Font size update
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.5) });
  }, [fontSize]);

  useEffect(() => {
    editorRef.current?.updateOptions({ tabSize });
  }, [tabSize]);

  useEffect(() => {
    if (!editorRef.current || !cursorLine) return;
    const current = editorRef.current.getPosition()?.lineNumber;
    if (current !== cursorLine) {
      editorRef.current.setPosition({ lineNumber: cursorLine, column: 1 });
    }
  }, [cursorLine]);

  useEffect(() => {
    if (!editorContextMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.ide-editor-context-menu')) return;
      closeEditorContextMenu();
    };

    const handleResize = () => closeEditorContextMenu();

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [closeEditorContextMenu, editorContextMenu]);

  useEffect(() => {
    if (!editorContextMenu) return;
    if (editorContextMenu.selectedIndex < 0) return;
    contextMenuItemRefs.current[editorContextMenu.selectedIndex]?.focus();
  }, [editorContextMenu]);

  const handleEditorContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;

    event.preventDefault();
    event.stopPropagation();

    const target = editor.getTargetAtClientPoint(event.clientX, event.clientY);
    openEditorContextMenu(event.clientX, event.clientY, target?.position?.lineNumber ?? null);
  };

  const handleEditorKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu')) return;

    event.preventDefault();
    event.stopPropagation();
    openEditorContextMenuFromKeyboard();
  };

  const hasSelection = (() => {
    const selection = editorRef.current?.getSelection();
    return !!selection && !selection.isEmpty();
  })();
  const canUndo = editorRef.current?.getModel()?.canUndo() ?? false;
  const canRedo = editorRef.current?.getModel()?.canRedo() ?? false;

  const contextMenuItems: EditorContextMenuItem[] = editorContextMenu ? [
    {
      type: 'item',
      id: 'undo',
      label: 'Undo',
      keybinding: 'Ctrl+Z',
      disabled: !canUndo,
      run: () => editorRef.current?.trigger('wimps-context-menu', 'undo', null),
    },
    {
      type: 'item',
      id: 'redo',
      label: 'Redo',
      keybinding: 'Ctrl+Y',
      disabled: !canRedo,
      run: () => editorRef.current?.trigger('wimps-context-menu', 'redo', null),
    },
    { type: 'separator', id: 'edit-history-separator' },
    {
      type: 'item',
      id: 'cut',
      label: 'Cut',
      keybinding: 'Ctrl+X',
      disabled: !hasSelection,
      run: () => runEditorAction('editor.action.clipboardCutAction'),
    },
    {
      type: 'item',
      id: 'copy',
      label: 'Copy',
      keybinding: 'Ctrl+C',
      disabled: !hasSelection,
      run: () => runEditorAction('editor.action.clipboardCopyAction'),
    },
    {
      type: 'item',
      id: 'paste',
      label: 'Paste',
      keybinding: 'Ctrl+V',
      run: () => runEditorAction('editor.action.clipboardPasteAction'),
    },
    {
      type: 'item',
      id: 'select-all',
      label: 'Select All',
      keybinding: 'Ctrl+A',
      run: () => runEditorAction('editor.action.selectAll', () => editorRef.current?.trigger('wimps-context-menu', 'editor.action.selectAll', null)),
    },
    { type: 'separator', id: 'navigation-separator' },
    {
      type: 'item',
      id: 'find',
      label: 'Find',
      keybinding: 'Ctrl+F',
      run: () => runEditorAction('actions.find'),
    },
    {
      type: 'item',
      id: 'replace',
      label: 'Replace',
      keybinding: 'Ctrl+H',
      run: () => runEditorAction('editor.action.startFindReplaceAction'),
    },
    {
      type: 'item',
      id: 'goto-line',
      label: 'Go to Line',
      keybinding: 'Ctrl+G',
      run: () => runEditorAction('editor.action.gotoLine'),
    },
    { type: 'separator', id: 'mips-separator' },
    {
      type: 'item',
      id: 'toggle-breakpoint',
      label: editorContextMenu.lineNumber && breakpoints.has(editorContextMenu.lineNumber)
        ? 'Remove Breakpoint'
        : 'Add Breakpoint',
      disabled: !editorContextMenu.lineNumber,
      run: () => {
        if (editorContextMenu.lineNumber) onBreakpointToggleRef.current(editorContextMenu.lineNumber);
      },
    },
    {
      type: 'item',
      id: 'command-palette',
      label: 'Command Palette',
      keybinding: 'Ctrl+Shift+P',
      run: () => {
        window.requestAnimationFrame(() => onOpenCommandPaletteRef.current?.());
      },
    },
  ] : [];

  const enabledContextMenuItems = contextMenuItems.filter(item => item.type === 'item' && !item.disabled);

  const runContextMenuItem = (item: EditorContextMenuItem) => {
    if (item.type !== 'item' || item.disabled) return;
    setEditorContextMenu(null);
    void Promise.resolve(item.run()).finally(() => {
      if (item.id !== 'command-palette') window.requestAnimationFrame(() => editorRef.current?.focus());
    });
  };

  const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editorContextMenu || enabledContextMenuItems.length === 0) return;

    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeEditorContextMenu();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setEditorContextMenu(prev => {
        if (!prev) return prev;
        const count = enabledContextMenuItems.length;
        if (prev.selectedIndex < 0) return { ...prev, selectedIndex: step > 0 ? 0 : count - 1 };
        return { ...prev, selectedIndex: (prev.selectedIndex + step + count) % count };
      });
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setEditorContextMenu(prev => prev ? {
        ...prev,
        selectedIndex: event.key === 'Home' ? 0 : enabledContextMenuItems.length - 1,
      } : prev);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (editorContextMenu.selectedIndex < 0) return;
      runContextMenuItem(enabledContextMenuItems[editorContextMenu.selectedIndex]);
    }
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.card,
      padding: 0,
      }}>
      {editorContextMenu && createPortal(
        <div
          className="ide-context-menu ide-editor-context-menu"
          role="menu"
          aria-label="Editor actions"
          style={{
            left: editorContextMenu.left,
            top: editorContextMenu.top,
            width: EDITOR_CONTEXT_MENU_WIDTH,
            backgroundColor: theme.card,
            borderColor: theme.border,
            color: theme.text,
          }}
          onContextMenu={e => e.preventDefault()}
          onKeyDown={handleContextMenuKeyDown}
        >
          {contextMenuItems.map(item => {
            if (item.type === 'separator') {
              return <div key={item.id} className="ide-context-menu-separator" role="separator" style={{ backgroundColor: theme.border }} />;
            }

            const itemIndex = enabledContextMenuItems.findIndex(actionableItem => actionableItem.id === item.id);
            const isSelected = itemIndex === editorContextMenu.selectedIndex;
            return (
              <button
                key={item.id}
                ref={node => {
                  if (itemIndex >= 0) contextMenuItemRefs.current[itemIndex] = node;
                }}
                type="button"
                role="menuitem"
                className={`ide-context-menu-item${isSelected ? ' ide-context-menu-item--active' : ''}`}
                aria-disabled={item.disabled ? 'true' : undefined}
                tabIndex={isSelected ? 0 : -1}
                onMouseEnter={() => {
                  setEditorContextMenu(prev => prev ? { ...prev, selectedIndex: itemIndex } : prev);
                }}
                onClick={() => runContextMenuItem(item)}
              >
                <span>{item.label}</span>
                {item.keybinding && <span className="ide-context-menu-key">{item.keybinding}</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {/* Editor shell */}
      <div style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        backgroundColor: theme.card,
        borderRadius: 0,
        border: 'none',
        overflow: 'hidden',
      }}
        onContextMenu={handleEditorContextMenu}
        onKeyDownCapture={handleEditorKeyDownCapture}
      >
        <Editor
          language={MIPS_LANGUAGE_ID}
          theme={mipsThemeName(isDark)}
          value={code}
          onChange={(v) => setCode(v ?? '')}
          beforeMount={beforeMount}
          onMount={onMount}
          loading=""
          options={{
            fontSize,
            fontFamily: 'monospace',
            lineHeight: Math.round(fontSize * 1.5),
            minimap: { enabled: true },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            glyphMargin: true,
            lineNumbers: 'on',
            lineNumbersMinChars: 2,
            lineDecorationsWidth: 12,
            folding: false,
            renderLineHighlight: 'none',
            tabSize,
            insertSpaces: true,
            wordWrap: 'off',
            padding: { top: 12, bottom: 12 },
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            overviewRulerLanes: 2,
            fixedOverflowWidgets: true,
            contextmenu: false,
            find: {
              addExtraSpaceOnTop: false,
            },
          }}
        />

        {/* Placeholder — Monaco has no native one */}
        {code === '' && (
          <div style={{
            position: 'absolute',
            top: 12,
            left: contentLeft,
            pointerEvents: 'none',
            color: theme.subText,
            fontFamily: 'monospace',
            fontSize,
            lineHeight: `${Math.round(fontSize * 1.5)}px`,
            opacity: 0.7,
            userSelect: 'none',
          }}>
            # Write MIPS assembly here...
          </div>
        )}
      </div>
    </div>
  );
});
