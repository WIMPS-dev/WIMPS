import { highlightMipsCode } from '@/helpers/mipsSyntax';
import React from 'react';
import Editor from 'react-simple-code-editor';
import type { Theme } from '../theme/themes';

const TAB = '    ';

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  theme: Theme;
  activeLine: number | null;
  breakpoints: Set<number>;
  onBreakpointToggle: (line: number) => void;
}

export function CodeEditor({ code, setCode, theme, activeLine, breakpoints, onBreakpointToggle }: CodeEditorProps) {
  const lines = code.split('\n');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newText = code.slice(0, start) + TAB + code.slice(end);
      setCode(newText);
      requestAnimationFrame(() => {
        target.selectionStart = start + TAB.length;
        target.selectionEnd = start + TAB.length;
      });
    }
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
      padding: 14,
      border: `1px solid ${theme.border}`,
    }}>
      {/* Editor shell */}
      <div style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.card,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'row',
      }}>
        {/* Gutter */}
        <div style={{
          width: 52,
          backgroundColor: theme.bg,
          borderRight: `1px solid ${theme.border}`,
          paddingTop: 16,
          paddingBottom: 100,
          flexShrink: 0,
          alignSelf: 'flex-start',
          minHeight: '100%',
          userSelect: 'none',
        }}>
          {lines.map((_, i) => {
            const lineNumber = i + 1;
            const isActive = activeLine === lineNumber;
            const hasBp = breakpoints.has(lineNumber);
            return (
              <div
                key={i}
                className="gutter-line"
                onClick={() => onBreakpointToggle(lineNumber)}
                title={hasBp ? 'Remove breakpoint' : 'Add breakpoint'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 4,
                  paddingLeft: 4,
                  paddingRight: 8,
                  height: 22,
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#2563eb55' : 'transparent',
                }}
              >
                {/* Breakpoint dot / hover hint */}
                <span
                  className={hasBp ? undefined : 'bp-hint'}
                  style={{
                    flexShrink: 0,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: hasBp ? '#ef4444' : 'transparent',
                    transition: 'background-color 0.1s',
                  }}
                />
                {/* Line number */}
                <span style={{
                  color: isActive ? theme.text : (hasBp ? '#ef4444' : theme.subText),
                  fontSize: 12,
                  fontFamily: 'monospace',
                  lineHeight: '22px',
                  fontWeight: isActive || hasBp ? 700 : 400,
                  minWidth: 20,
                  textAlign: 'right',
                }}>
                  {lineNumber}
                </span>
              </div>
            );
          })}
        </div>

        {/* Editor input wrapper */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, '--editor-caret': theme.text, '--editor-placeholder': theme.subText } as React.CSSProperties}>
          {/* Active line overlay */}
          <div style={{ position: 'absolute', top: 16, left: 0, right: 0, pointerEvents: 'none', zIndex: 0 }}>
            {lines.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 22,
                  backgroundColor: activeLine === i + 1 ? '#2563eb33' : 'transparent',
                }}
              />
            ))}
          </div>

          <Editor
            value={code}
            onValueChange={setCode}
            highlight={value => highlightMipsCode(value, theme.syntax)}
            padding={16}
            onKeyDown={handleKeyDown as any}
            placeholder="# Write MIPS assembly here..."
            textareaClassName="mips-editor-textarea"
            preClassName="mips-editor-highlight"
            style={{
              fontFamily: 'monospace',
              fontSize: 15,
              lineHeight: '22px',
              color: 'transparent',
              backgroundColor: 'transparent',
              outline: 'none',
              minHeight: '100%',
            }}
          />
        </div>
      </div>
    </div>
  );
}
