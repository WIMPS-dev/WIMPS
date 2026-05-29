import { highlightMipsCode } from '@/helpers/mipsSyntax';
import React, { useState } from 'react';
import Editor from 'react-simple-code-editor';
import type { Theme } from '../theme/themes';

const TAB = '    ';

interface Action {
  label: string;
  symbol?: string;
  onPress: () => void;
}

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  actions: Action[];
  theme: Theme;
  activeLine: number | null;
}

export function CodeEditor({ code, setCode, actions, theme, activeLine }: CodeEditorProps) {
  const [showActionMenu, setShowActionMenu] = useState(false);

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
      position: 'relative',
    }}>
      {/* Floating action menu */}
      <div style={{ position: 'absolute', top: 15, right: 15, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button
          onClick={() => setShowActionMenu(p => !p)}
          style={{
            backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            width: 44,
            height: 44,
            cursor: 'pointer',
            fontSize: 18,
            color: theme.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {showActionMenu ? '▲' : '▼'}
        </button>
        {showActionMenu && actions.map(a => (
          <button
            key={a.label}
            onClick={a.onPress}
            title={a.label}
            style={{
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              width: 44,
              height: 44,
              cursor: 'pointer',
              color: theme.text,
              fontSize: 18,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {a.symbol ?? a.label}
          </button>
        ))}
      </div>

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
          width: 45,
          backgroundColor: theme.bg,
          borderRight: `1px solid ${theme.border}`,
          paddingTop: 16,
          paddingBottom: 100,
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {lines.map((_, i) => {
            const lineNumber = i + 1;
            const isActive = activeLine === lineNumber;
            return (
              <div
                key={i}
                style={{
                  color: isActive ? theme.text : theme.subText,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  lineHeight: '22px',
                  textAlign: 'right',
                  paddingRight: 10,
                  fontWeight: isActive ? 700 : 400,
                  backgroundColor: isActive ? '#2563eb55' : 'transparent',
                }}
              >
                {lineNumber}
              </div>
            );
          })}
        </div>

        {/* Editor input wrapper */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, '--editor-caret': theme.text } as React.CSSProperties}>
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
