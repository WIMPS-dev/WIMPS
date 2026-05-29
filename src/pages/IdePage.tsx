import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeEditor } from '../components/CodeEditor';
import { MemoryView } from '../components/MemoryView';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken } from '../helpers/authStorage';
import { assemble, feedInput, getMemoryRange, getState, resetSim, runSim, stepSim } from '../simulator/useMips';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const DATA_START = 0x10010000;
const DATA_WORDS = 32;

interface CodeTab {
  id: string;
  name: string;
  code: string;
  isDirty?: boolean;
  _id?: string;
}

const DEFAULT_TABS: CodeTab[] = [{ id: '1', name: 'file1.asm', code: '', isDirty: false }];

const buildInitialRegisters = (): RegisterValue[] =>
  ['$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
   '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
   '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
   '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra']
  .map((name, i) => ({ name, number: i, hexValue: '0x00000000' }));

const normalizeTab = (item: any): CodeTab => ({
  ...item,
  id: item?.id ?? item?._id ?? String(Date.now() + Math.random()),
  _id: item?._id ? String(item._id) : undefined,
  name: item?.name || 'untitled.asm',
  code: item?.code || '',
  isDirty: Boolean(item?.isDirty),
});

function readLocalState(): { tabs: CodeTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem('saved_tabs');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
      return { tabs: parsed.tabs.map(normalizeTab), activeTabId: parsed.activeTabId ?? parsed.tabs[0].id };
    }
    // legacy: plain array
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { tabs: parsed.map(normalizeTab), activeTabId: parsed[0].id };
    }
  } catch {}
  return { tabs: DEFAULT_TABS, activeTabId: '1' };
}

function writeLocalState(tabs: CodeTab[], activeTabId: string) {
  try { localStorage.setItem('saved_tabs', JSON.stringify({ tabs, activeTabId })); } catch {}
}

// ---------------------------------------------------------------------------
export default function IdePage() {
  const { theme } = useTheme();

  const [tabs, setTabs] = useState<CodeTab[]>(() => readLocalState().tabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => readLocalState().activeTabId);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTabName, setEditTabName] = useState('');

  const [registers, setRegisters] = useState<RegisterValue[]>(buildInitialRegisters());
  const [output, setOutput] = useState('');
  const [memoryData, setMemoryData] = useState<any[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isAssembled, setIsAssembled] = useState(false);
  const [showHex, setShowHex] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileView, setMobileView] = useState<'editor' | 'console' | 'registers' | 'memory'>('editor');

  const [rightTab, setRightTab] = useState<'registers' | 'memory'>('registers');

  // Desktop layout percentages
  const [leftPct, setLeftPct] = useState(75);
  const [editorHeightPct, setEditorHeightPct] = useState(70);

  const isWide = typeof window !== 'undefined' && window.innerWidth >= 900;
  const [wide, setWide] = useState(isWide);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const activeCode = useMemo(() => tabs.find(t => t.id === activeTabId)?.code ?? '', [tabs, activeTabId]);

  const setActiveCode = useCallback((code: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, code, isDirty: true } : t));
    setIsAssembled(false);
  }, [activeTabId]);

  // Reset assembled state when switching tabs
  useEffect(() => { setIsAssembled(false); }, [activeTabId]);

  // Auth check on mount
  useEffect(() => {
    const token = getAuthToken();
    setIsLoggedIn(!!token);
  }, []);

  // Load tabs from server on mount (logged-in users only)
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_BASE}/auth/tabs`, { headers: getApiHeaders(token) })
      .then(r => {
        if (r.status === 401) { clearAuthToken(); setIsLoggedIn(false); return null; }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const loaded = data.map(normalizeTab);
          setTabs(loaded);
          setActiveTabId(loaded[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-persist to localStorage whenever tabs or active tab change
  useEffect(() => { writeLocalState(tabs, activeTabId); }, [tabs, activeTabId]);

  const applyState = (state: ReturnType<typeof getState>) => {
    setRegisters(state.registers);
    setOutput(state.output);
    setActiveLine(state.lineNumber);
    setIsWaiting(state.isWaiting);
    setMemoryData(getMemoryRange(DATA_START, DATA_WORDS));
  };

  const handleAssemble = () => {
    resetSim();
    setActiveLine(null);
    setIsWaiting(false);
    const result = assemble(activeCode);
    if (!result.ok) {
      setOutput(`Assembly failed:\n${result.error}`);
      setIsAssembled(false);
    } else {
      setOutput('');
      setRegisters(buildInitialRegisters());
      setMemoryData([]);
      setIsAssembled(true);
    }
  };

  const handleRun = () => {
    const state = runSim();
    applyState(state);
  };

  const handleStep = () => {
    const state = stepSim();
    applyState(state);
  };

  const handleReset = () => {
    resetSim();
    setRegisters(buildInitialRegisters());
    setOutput('');
    setMemoryData([]);
    setActiveLine(null);
    setIsWaiting(false);
    setIsAssembled(false);
  };

  const handleFeedInput = useCallback((value: string) => {
    const state = feedInput(value);
    applyState(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const clean = tabsRef.current.map(t => ({ ...t, isDirty: false }));
      const res = await fetch(`${API_BASE}/auth/tabs`, {
        method: 'POST',
        headers: getApiHeaders(token, true),
        body: JSON.stringify({ tabs: clean }),
      });
      if (res.status === 401) { clearAuthToken(); setIsLoggedIn(false); setOutput('Session expired. Please log in again.'); return; }
      if (!res.ok) { setOutput('Save failed. Check your connection.'); return; }
      setTabs(clean);
      setOutput('Saved to account.');
    } catch {
      setOutput('Save failed. Check your connection.');
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setIsLoggedIn(false);
  };

  const addTab = () => {
    const id = String(Date.now());
    const n = tabs.length + 1;
    const newTab: CodeTab = { id, name: `file${n}.asm`, code: '', isDirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs[idx === 0 ? 1 : idx - 1];
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTabId === id) setActiveTabId(next.id);
  };

  const startRename = (tab: CodeTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditTabName(tab.name);
  };

  const commitRename = () => {
    if (!editingTabId) return;
    const name = editTabName.trim() || 'untitled.asm';
    setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, name } : t));
    setEditingTabId(null);
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.asm,.s,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const id = String(Date.now());
        setTabs(prev => [...prev, { id, name: file.name, code: text, isDirty: false }]);
        setActiveTabId(id);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDownload = () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const blob = new Blob([tab.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Drag-to-resize
  // ---------------------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);

  const startHDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = leftPct;
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(30, Math.min(80, pct)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startEditorVDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const col = (e.target as HTMLElement).closest('.editor-column') as HTMLElement;
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorHeightPct(Math.max(20, Math.min(85, pct)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ---------------------------------------------------------------------------
  // Editor actions
  // ---------------------------------------------------------------------------
  const actions = [
    { label: 'Assemble', symbol: '⚙', onPress: handleAssemble },
    { label: 'Run',      symbol: '▶', onPress: handleRun },
    { label: 'Step',     symbol: '→', onPress: handleStep },
    { label: 'Reset',    symbol: '↺', onPress: handleReset },
    { label: 'Upload',   symbol: '↑', onPress: handleUpload },
    { label: 'Download', symbol: '↓', onPress: handleDownload },
    ...(isLoggedIn ? [{ label: 'Save', symbol: '💾', onPress: handleSave }] : []),
  ];

  const hDragHandle = (
    <div
      onMouseDown={startHDrag}
      style={{ width: 5, flexShrink: 0, cursor: 'col-resize', backgroundColor: theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 1, height: 28, backgroundColor: theme.subText, opacity: 0.35, borderRadius: 1 }} />
    </div>
  );

  const vDragHandle = (
    <div
      onMouseDown={startEditorVDrag}
      style={{ height: 5, flexShrink: 0, cursor: 'row-resize', backgroundColor: theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ height: 1, width: 28, backgroundColor: theme.subText, opacity: 0.35, borderRadius: 1 }} />
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: theme.bg, overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 48,
        borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.card,
        flexShrink: 0,
        gap: 8,
        padding: '0 12px',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 16, flexShrink: 0, marginRight: 4 }}>WIMPS</Link>

        {/* Tabs — scrollable, capped width */}
        <div style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {/* Scroll wrapper: plain block so overflow-x actually scrolls */}
          <div className="tab-scroll" style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: 'max-content', height: 36 }}>
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 8px',
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: tab.id === activeTabId ? theme.tabActive : theme.tabInactive,
                    border: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                    flexShrink: 0,
                    maxWidth: 160,
                  }}
                >
                  {editingTabId === tab.id ? (
                    <input
                      autoFocus
                      value={editTabName}
                      onChange={e => setEditTabName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => e.key === 'Enter' && commitRename()}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 90, backgroundColor: 'transparent', border: 'none', outline: 'none', color: theme.text, fontSize: 12 }}
                    />
                  ) : (
                    <span
                      onDoubleClick={e => startRename(tab, e)}
                      style={{ fontSize: 12, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}
                    >
                      {tab.name}{tab.isDirty ? ' •' : ''}
                    </span>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={e => closeTab(tab.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 14, lineHeight: 1, padding: 2, flexShrink: 0 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* New tab */}
          <button
            onClick={addTab}
            style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subText, cursor: 'pointer', width: 28, height: 28, fontSize: 18, flexShrink: 0 }}
          >
            +
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, backgroundColor: theme.border, flexShrink: 0 }} />

          {/* Action buttons grouped in a toolbar pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0 6px', height: 34 }}>
            {actions.map(a => {
              const isBlue = isAssembled
                ? (a.label === 'Run' || a.label === 'Step')
                : a.label === 'Assemble';
              return (
                <button
                  key={a.label}
                  onClick={a.onPress}
                  title={a.label}
                  style={{
                    backgroundColor: isBlue ? '#2563eb' : 'transparent',
                    border: 'none',
                    borderRadius: 5,
                    color: isBlue ? '#fff' : theme.text,
                    cursor: 'pointer',
                    width: 28,
                    height: 26,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {a.symbol ?? a.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ThemeSwitch />
          <Link to="/docs" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Docs</Link>
          {isLoggedIn ? (
            <button onClick={handleLogout} style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}>Sign out</button>
          ) : (
            <Link to="/login" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>Sign in</Link>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      {!wide && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          {(['editor', 'console', 'registers', 'memory'] as const).map(view => (
            <button
              key={view}
              onClick={() => setMobileView(view)}
              style={{
                flex: 1,
                padding: '8px 0',
                backgroundColor: mobileView === view ? theme.tabActive : theme.tabInactive,
                border: 'none',
                borderRight: `1px solid ${theme.border}`,
                color: mobileView === view ? theme.text : theme.subText,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {view}
            </button>
          ))}
        </div>
      )}

      {/* Main layout */}
      {wide ? (
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Left column: editor + console */}
          <div className="editor-column" style={{ width: `${leftPct}%`, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: `${editorHeightPct}%`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} />
            </div>

            {vDragHandle}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ConsolePanel output={output} isWaiting={isWaiting} onSubmit={handleFeedInput} theme={theme} />
            </div>
          </div>

          {hDragHandle}

          {/* Right column: tabbed registers / memory */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}`, flexShrink: 0, height: 34 }}>
              {(['registers', 'memory'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    borderBottom: rightTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                    backgroundColor: 'transparent',
                    color: rightTab === tab ? theme.text : theme.subText,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {tab === 'registers' ? 'Registers' : 'Memory'}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {rightTab === 'registers' && <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} />}
              {rightTab === 'memory' && <MemoryView data={memoryData} theme={theme} />}
            </div>
          </div>
        </div>
      ) : (
        /* Mobile single-panel */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mobileView === 'editor' && (
            <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} />
          )}
          {mobileView === 'console' && (
            <ConsolePanel
              output={output}
              isWaiting={isWaiting}
              onSubmit={handleFeedInput}
              theme={theme}
            />
          )}
          {mobileView === 'registers' && (
            <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} />
          )}
          {mobileView === 'memory' && <MemoryView data={memoryData} theme={theme} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Console sub-component
// ---------------------------------------------------------------------------
interface ConsolePanelProps {
  output: string;
  isWaiting: boolean;
  onSubmit: (value: string) => void;
  theme: import('../theme/themes').Theme;
}

function ConsolePanel({ output, isWaiting, onSubmit, theme }: ConsolePanelProps) {
  const [currentInput, setCurrentInput] = useState('');
  const termRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);

  // Auto-scroll whenever output or in-progress input changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [output, currentInput]);

  // Grab focus as soon as the program asks for input
  useEffect(() => {
    if (isWaiting) termRef.current?.focus();
  }, [isWaiting]);

  // Clear the typed-but-not-submitted text when waiting ends
  useEffect(() => {
    if (!isWaiting) setCurrentInput('');
  }, [isWaiting]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isWaiting) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = currentInput;
      setCurrentInput('');
      onSubmit(val);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      setCurrentInput(prev => prev.slice(0, -1));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setCurrentInput(prev => prev + e.key);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={termRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => termRef.current?.focus()}
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: theme.bg,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          padding: '12px 14px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: '20px',
          color: theme.consoleText,
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: 'text',
          cursor: isWaiting ? 'text' : 'default',
        }}
      >
        {output ? (
          <span>{output}</span>
        ) : (
          !isWaiting && (
            <span style={{ color: theme.subText, fontStyle: 'italic' }}>
              Run a program to see output here.
            </span>
          )
        )}
        {isWaiting && (
          <>
            <span style={{ color: '#2563eb' }}>{currentInput}</span>
            <span className="terminal-cursor" />
          </>
        )}
        <span ref={endRef} />
      </div>
    </div>
  );
}
