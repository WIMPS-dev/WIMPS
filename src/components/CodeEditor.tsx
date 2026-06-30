import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import {
  MIPS_LANGUAGE_ID,
  defineMipsThemes,
  mipsThemeName,
  registerMipsLanguage,
} from '../helpers/mipsMonaco';
import type { Theme } from '../theme/themes';
import { THEMES } from '../theme/themes';

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
  fontSize?: number;
  tabSize?: number;
}

export function CodeEditor({
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
  fontSize = 15,
  tabSize = 4,
}: CodeEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const activeDecoRef = useRef<string[]>([]);
  const bpDecoRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [contentLeft, setContentLeft] = useState(40);
  const disposablesRef = useRef<Monaco.IDisposable[]>([]);

  // Keep callbacks fresh without re-binding Monaco commands/listeners
  const onAssembleRef = useRef(onAssemble);
  const onBreakpointToggleRef = useRef(onBreakpointToggle);
  const onToggleSidebarRef = useRef(onToggleSidebar);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  useEffect(() => { onAssembleRef.current = onAssemble; }, [onAssemble]);
  useEffect(() => { onBreakpointToggleRef.current = onBreakpointToggle; }, [onBreakpointToggle]);
  useEffect(() => { onToggleSidebarRef.current = onToggleSidebar; }, [onToggleSidebar]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);

  const isDark = theme.bg === THEMES.dark.bg;

  const beforeMount: BeforeMount = (monaco) => {
    registerMipsLanguage(monaco);
    defineMipsThemes(monaco);
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    monaco.editor.setTheme(mipsThemeName(isDark));

    // Ctrl/Cmd+Enter → assemble (Monaco captures this key, so route via command)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onAssembleRef.current?.());

    // Ctrl/Cmd+B → toggle sidebar
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => onToggleSidebarRef.current?.());

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

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
      padding: 14,
    }}>
      {/* Editor shell */}
      <div style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        backgroundColor: theme.card,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
      }}>
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
}
