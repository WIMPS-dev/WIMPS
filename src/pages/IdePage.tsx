import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BitmapDisplay } from '../components/BitmapDisplay';
import { CodeEditor } from '../components/CodeEditor';
import { InstructionStats } from '../components/InstructionStats';
import { MemoryView } from '../components/MemoryView';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken } from '../helpers/authStorage';
import { assemble, continueSim, feedInput, getInstructionStats, getMemoryRange, getState, resetSim, runSim, stepBackSim, stepSim } from '../simulator/useMips';
import type { InstrStats } from '../simulator/useMips';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const DATA_START = 0x10010000;
const DATA_WORDS = 32;

const RIGHT_TABS = [
  { id: 'registers' as const, label: 'Registers' },
  { id: 'memory'    as const, label: 'Memory'    },
  { id: 'stats'     as const, label: 'Stats'     },
  { id: 'bitmap'    as const, label: 'Bitmap'    },
] as const;

type RightTab = typeof RIGHT_TABS[number]['id'];

interface CodeTab {
  id: string;
  name: string;
  code: string;
  isDirty?: boolean;
  _id?: string;
}

const DEFAULT_TABS: CodeTab[] = [{ id: '1', name: 'file1.asm', code: '', isDirty: false }];

// ---------------------------------------------------------------------------
// Example files shown in the Files drawer for all users
// ---------------------------------------------------------------------------
interface ExampleFile { name: string; description: string; code: string; }
const EXAMPLE_FILES: ExampleFile[] = [
  {
    name: 'hello.asm',
    description: 'Hello, World!',
    code:
`# Hello, World!
.data
msg: .asciiz "Hello, World!\\n"

.text
main:
    li   $v0, 4
    la   $a0, msg
    syscall

    li   $v0, 10
    syscall`,
  },
  {
    name: 'quadhex.asm',
    description: 'QuadHex — like FizzBuzz, but for 4, 6, and 24',
    code:
`# QuadHex — like FizzBuzz, but for 4, 6, and 24
.data
str_quad:    .asciiz "Quad"
str_hex:     .asciiz "Hex"
str_quadhex: .asciiz "QuadHex"
str_newline: .asciiz "\\n"

.text
main:
    li   $t0, 1          # counter
    li   $t1, 40         # limit

loop:
    bgt  $t0, $t1, done

    # divisible by 24?
    li   $t2, 24
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_quadhex

    # divisible by 6?
    li   $t2, 6
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_hex

    # divisible by 4?
    li   $t2, 4
    div  $t0, $t2
    mfhi $t3
    beqz $t3, print_quad

    # otherwise: print the number
    li   $v0, 1
    move $a0, $t0
    syscall
    j    next

print_quadhex:
    li   $v0, 4
    la   $a0, str_quadhex
    syscall
    j    next

print_hex:
    li   $v0, 4
    la   $a0, str_hex
    syscall
    j    next

print_quad:
    li   $v0, 4
    la   $a0, str_quad
    syscall

next:
    li   $v0, 4
    la   $a0, str_newline
    syscall
    addi $t0, $t0, 1
    j    loop

done:
    li   $v0, 10
    syscall`,
  },
  {
    name: 'fibonacci.asm',
    description: 'First 10 Fibonacci numbers (iterative)',
    code:
`# Print the first 10 Fibonacci numbers
.data
sep: .asciiz "\\n"

.text
main:
    li   $t0, 0        # a
    li   $t1, 1        # b
    li   $t2, 10       # count

loop:
    beqz $t2, done

    li   $v0, 1
    move $a0, $t0
    syscall

    li   $v0, 4
    la   $a0, sep
    syscall

    add  $t3, $t0, $t1
    move $t0, $t1
    move $t1, $t3
    addi $t2, $t2, -1
    j    loop

done:
    li   $v0, 10
    syscall`,
  },
];

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

// Separate store for explicitly saved guest files (distinct from the live session state).
// Only written when the user hits Save — closing a tab doesn't touch this store.
function readSavedFiles(): CodeTab[] {
  try {
    const raw = localStorage.getItem('saved_files');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.map(normalizeTab);
  } catch {}
  return [];
}

function writeSavedFiles(files: CodeTab[]) {
  try { localStorage.setItem('saved_files', JSON.stringify(files)); } catch {}
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
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [canStepBack, setCanStepBack] = useState(false);
  const [showHex, setShowHex] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [filesDrawerOpen, setFilesDrawerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'editor' | 'console' | 'registers' | 'memory'>('editor');

  const [rightTab, setRightTab] = useState<RightTab>('registers');
  const [instrStats, setInstrStats] = useState<InstrStats | null>(null);
  const [simTick, setSimTick] = useState(0);

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
    setCanStepBack(state.canUndo);
    setMemoryData(getMemoryRange(DATA_START, DATA_WORDS));
    setInstrStats(getInstructionStats());
    setSimTick(t => t + 1);
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
      setIsAssembled(true);
      applyState(getState());
    }
  };

  const handleRun = () => {
    const state = runSim(Array.from(breakpoints));
    applyState(state);
  };

  const handleContinue = () => {
    const state = continueSim(Array.from(breakpoints));
    applyState(state);
  };

  const handleStep = () => {
    const state = stepSim();
    applyState(state);
  };

  const handleStepBack = () => {
    const state = stepBackSim();
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
    setCanStepBack(false);
    setInstrStats(null);
    setSimTick(t => t + 1);
  };

  const handleBreakpointToggle = (line: number) => {
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setOutput(data?.error || 'Save failed. Check your connection.');
        return;
      }
      setTabs(clean);
      setOutput('Saved to account.');
    } catch {
      setOutput('Save failed. Check your connection.');
    }
  };

  const handleSaveLocal = () => {
    const clean = tabsRef.current.map(t => ({ ...t, isDirty: false }));
    writeSavedFiles(clean);
    setTabs(clean);
    setOutput('Saved to browser.');
  };

  const handleLogout = () => {
    clearAuthToken();
    setIsLoggedIn(false);
  };

  // Shared helper: removes a tab from local state and fixes the active tab.
  const removeTabLocally = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      if (prev.length === 1) {
        const newId = String(Date.now());
        setActiveTabId(newId);
        return [{ id: newId, name: 'file1.asm', code: '', isDirty: false }];
      }
      const next = prev[idx === 0 ? 1 : idx - 1];
      if (activeTabId === tabId) setActiveTabId(next.id);
      return prev.filter(t => t.id !== tabId);
    });
  }, [activeTabId]);

  const handleDeleteTab = async (tab: CodeTab, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/tabs/${tab.id}`, {
        method: 'DELETE',
        headers: getApiHeaders(token),
      });
      if (res.status === 401) { clearAuthToken(); setIsLoggedIn(false); return; }
      if (!res.ok) { setOutput('Delete failed. Check your connection.'); return; }
      removeTabLocally(tab.id);
    } catch {
      setOutput('Delete failed. Check your connection.');
    }
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
  const actions: { label: string; symbol: string; onPress: () => void; disabled?: boolean }[] = [
    { label: 'Assemble',  symbol: '⚙',  onPress: handleAssemble },
    { label: 'Run',       symbol: '▶',  onPress: handleRun },
    { label: 'Continue',  symbol: '⏭', onPress: handleContinue },
    { label: 'Step Back', symbol: '←',  onPress: handleStepBack, disabled: !canStepBack },
    { label: 'Step',      symbol: '→',  onPress: handleStep },
    { label: 'Reset',     symbol: '↺',  onPress: handleReset },
    { label: 'Upload',    symbol: '↑',  onPress: handleUpload },
    { label: 'Download',  symbol: '↓',  onPress: handleDownload },
    { label: 'Save', symbol: '💾', onPress: isLoggedIn ? handleSave : handleSaveLocal },
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
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: theme.bg, overflow: 'hidden',
      '--ide-ink': theme.text,
      '--ide-card': theme.card,
      '--ide-hover': theme.resizer,
    } as React.CSSProperties}>
      {/* Top bar */}
      {wide ? (
        /* ── Desktop top bar ── */
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
            <div
              className="tab-scroll"
              role="tablist"
              aria-label="Editor files"
              style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}
            >
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: 'max-content', height: 36 }}>
                {tabs.map(tab => {
                  const isHovered = hoveredTabId === tab.id;
                  return (
                    <div
                      key={tab.id}
                      role="tab"
                      tabIndex={0}
                      aria-selected={tab.id === activeTabId}
                      onClick={() => setActiveTabId(tab.id)}
                      onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? setActiveTabId(tab.id) : undefined}
                      onMouseEnter={() => setHoveredTabId(tab.id)}
                      onMouseLeave={() => setHoveredTabId(null)}
                      className="ide-tab"
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
                        maxWidth: 180,
                        fontFamily: 'inherit',
                      }}
                    >
                      {editingTabId === tab.id ? (
                        <input
                          autoFocus
                          aria-label="Rename tab"
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
                          type="button"
                          onClick={e => closeTab(tab.id, e)}
                          aria-label={`Close ${tab.name}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 14, lineHeight: 1, padding: 2, flexShrink: 0 }}
                        >
                          ×
                        </button>
                      )}
                      {isLoggedIn && isHovered && (
                        <button
                          type="button"
                          onClick={e => handleDeleteTab(tab, e)}
                          aria-label={`Delete ${tab.name} from account`}
                          title="Delete from account"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ef4444',
                            padding: 2,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 3,
                          }}
                        >
                          <TabTrashIcon />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* New tab */}
            <button
              type="button"
              onClick={addTab}
              aria-label="New tab"
              className="ide-new-tab"
              style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subText, cursor: 'pointer', width: 28, height: 28, fontSize: 18, flexShrink: 0 }}
            >
              +
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 20, backgroundColor: theme.border, flexShrink: 0 }} />

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0 6px', height: 34 }}>
              {actions.map(a => {
                const isBlue = isAssembled
                  ? (['Run', 'Continue', 'Step Back', 'Step'].includes(a.label))
                  : a.label === 'Assemble';
                const isDisabled = Boolean(a.disabled);
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={isDisabled ? undefined : a.onPress}
                    title={a.label}
                    aria-label={a.label}
                    disabled={isDisabled}
                    className={`ide-action-btn${isBlue ? ' ide-active' : ''}`}
                    style={{
                      backgroundColor: isBlue ? '#2563eb' : 'transparent',
                      border: 'none',
                      borderRadius: 5,
                      color: isBlue ? '#fff' : theme.text,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      opacity: isDisabled ? 0.35 : 1,
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
            <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Docs</Link>
            <button
              type="button"
              onClick={() => setFilesDrawerOpen(true)}
              title="Files"
              style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subText, cursor: 'pointer', padding: '4px 10px', fontSize: 13, fontWeight: 500 }}
            >
              Files
            </button>
            {isLoggedIn ? (
              <button type="button" onClick={handleLogout} className="ide-sign-out" style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}>Sign out</button>
            ) : (
              <Link to="/login" className="ide-sign-in" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>Sign in</Link>
            )}
          </div>
        </div>
      ) : (
        /* ── Mobile top bar: nav row + action row ── */
        <>
          {/* Row 1: logo + right controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 52,
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            flexShrink: 0,
            padding: '0 14px',
            gap: 10,
          }}>
            <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 17, flexShrink: 0 }}>WIMPS</Link>
            <div style={{ flex: 1 }} />
            <ThemeSwitch />
            <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Docs</Link>
            <button
              type="button"
              onClick={() => setFilesDrawerOpen(true)}
              title="Files"
              style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subText, cursor: 'pointer', padding: '6px 12px', fontSize: 14, fontWeight: 500 }}
            >
              Files
            </button>
            {isLoggedIn ? (
              <button type="button" onClick={handleLogout} className="ide-sign-out" style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, cursor: 'pointer', padding: '6px 12px', fontSize: 14 }}>Sign out</button>
            ) : (
              <Link to="/login" className="ide-sign-in" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '7px 14px', borderRadius: 6, fontSize: 14, fontWeight: 600 }}>Sign in</Link>
            )}
          </div>

          {/* Row 2: scrollable action buttons */}
          <div
            className="tab-scroll"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 48,
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.bg,
              flexShrink: 0,
              overflowX: 'auto',
              padding: '0 10px',
              gap: 6,
            }}
          >
            {actions.map(a => {
              const isBlue = isAssembled
                ? (['Run', 'Continue', 'Step Back', 'Step'].includes(a.label))
                : a.label === 'Assemble';
              const isDisabled = Boolean(a.disabled);
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={isDisabled ? undefined : a.onPress}
                  title={a.label}
                  aria-label={a.label}
                  disabled={isDisabled}
                  className={`ide-action-btn${isBlue ? ' ide-active' : ''}`}
                  style={{
                    backgroundColor: isBlue ? '#2563eb' : theme.card,
                    border: `1px solid ${isBlue ? '#2563eb' : theme.border}`,
                    borderRadius: 8,
                    color: isBlue ? '#fff' : theme.text,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.35 : 1,
                    minWidth: 44,
                    height: 36,
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    gap: 4,
                    padding: '0 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{a.symbol}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{a.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Mobile nav */}
      {!wide && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          {(['editor', 'console', 'registers', 'memory'] as const).map(view => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              style={{
                flex: 1,
                padding: '10px 0',
                minHeight: 48,
                backgroundColor: mobileView === view ? theme.tabActive : theme.tabInactive,
                border: 'none',
                borderRight: `1px solid ${theme.border}`,
                color: mobileView === view ? theme.text : theme.subText,
                fontSize: 13,
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
              <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} />
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
              {RIGHT_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={rightTab === id}
                  onClick={() => setRightTab(id)}
                  className="ide-panel-tab"
                  style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    borderBottom: rightTab === id ? '2px solid #2563eb' : '2px solid transparent',
                    backgroundColor: 'transparent',
                    color: rightTab === id ? theme.text : theme.subText,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '0 2px',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {rightTab === 'registers' && <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} />}
              {rightTab === 'memory'    && <MemoryView data={memoryData} theme={theme} />}
              {rightTab === 'stats'     && <InstructionStats stats={instrStats} theme={theme} />}
              {rightTab === 'bitmap'    && <BitmapDisplay theme={theme} tick={simTick} />}
            </div>
          </div>
        </div>
      ) : (
        /* Mobile single-panel */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mobileView === 'editor' && (
            <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} />
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

      <FilesDrawer
        open={filesDrawerOpen}
        onClose={() => setFilesDrawerOpen(false)}
        theme={theme}
        isLoggedIn={isLoggedIn}
        tabs={tabs}
        setTabs={setTabs}
        activeTabId={activeTabId}
        setActiveTabId={setActiveTabId}
        removeTabLocally={removeTabLocally}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trash icon for tab delete
// ---------------------------------------------------------------------------
function TabTrashIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="3" x2="10" y2="3" />
      <path d="M3.5 3V2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1" />
      <path d="M2 3l.6 7.5h5.8L9 3" />
      <line x1="4.5" y1="5.5" x2="4.5" y2="9" />
      <line x1="6.5" y1="5.5" x2="6.5" y2="9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Files drawer
// ---------------------------------------------------------------------------
interface FilesDrawerProps {
  open: boolean;
  onClose: () => void;
  theme: import('../theme/themes').Theme;
  isLoggedIn: boolean;
  tabs: CodeTab[];
  setTabs: React.Dispatch<React.SetStateAction<CodeTab[]>>;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  removeTabLocally: (tabId: string) => void;
}

function FilesDrawer({ open, onClose, theme, isLoggedIn, tabs, setTabs, activeTabId, setActiveTabId, removeTabLocally }: FilesDrawerProps) {
  const [serverFiles, setServerFiles] = useState<CodeTab[]>([]);
  const [localFiles, setLocalFiles] = useState<CodeTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (isLoggedIn) {
      setLoading(true);
      const token = getAuthToken();
      if (!token) { setLoading(false); return; }
      fetch(`${API_BASE}/auth/tabs`, { headers: getApiHeaders(token) })
        .then(r => r.ok ? r.json() : [])
        .then(data => { if (Array.isArray(data)) setServerFiles(data.map(normalizeTab)); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLocalFiles(readSavedFiles());
    }
  }, [open, isLoggedIn]);

  // Open any file into tabs (cloud or local — same logic)
  const handleOpen = (file: CodeTab) => {
    const existing = tabs.find(t => t.id === file.id);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      setTabs(prev => [...prev, { ...file, isDirty: false }]);
      setActiveTabId(file.id);
    }
    onClose();
  };

  // Open an example file — always creates a fresh tab with a new ID
  const handleOpenExample = (ex: ExampleFile) => {
    const id = String(Date.now());
    setTabs(prev => [...prev, { id, name: ex.name, code: ex.code, isDirty: false }]);
    setActiveTabId(id);
    onClose();
  };

  // Delete a cloud file
  const handleDeleteCloud = async (file: CodeTab) => {
    const token = getAuthToken();
    if (!token) return;
    setDeletingId(file.id);
    try {
      const res = await fetch(`${API_BASE}/auth/tabs/${file.id}`, {
        method: 'DELETE',
        headers: getApiHeaders(token),
      });
      if (!res.ok) return;
      setServerFiles(prev => prev.filter(f => f.id !== file.id));
      removeTabLocally(file.id);
    } finally {
      setDeletingId(null);
    }
  };

  // Delete a saved local file (guests only) — removes from saved_files store and closes tab if open
  const handleDeleteLocal = (file: CodeTab) => {
    const updated = localFiles.filter(f => f.id !== file.id);
    setLocalFiles(updated);
    writeSavedFiles(updated);
    removeTabLocally(file.id);
  };

  if (!open) return null;

  const openTabIds = new Set(tabs.map(t => t.id));

  // Shared row renderer
  const renderFileRow = (
    file: CodeTab,
    onOpenFile: () => void,
    onDeleteFile: (() => void) | null,
    deleteTitle: string,
  ) => {
    const isOpen = openTabIds.has(file.id);
    const isDeleting = deletingId === file.id;
    return (
      <div
        key={file.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 8,
          border: `1px solid ${isOpen ? theme.linkColor + '55' : theme.border}`,
          backgroundColor: isOpen ? theme.linkColor + '0d' : 'transparent',
          opacity: isDeleting ? 0.5 : 1,
          transition: 'opacity 150ms',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: theme.text, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
          <div style={{ color: theme.subText, fontSize: 11, marginTop: 1 }}>
            {isOpen
              ? <span style={{ color: theme.linkColor }}>● open</span>
              : `${file.code.split('\n').filter(Boolean).length} lines`}
          </div>
        </div>
        {!isOpen && (
          <button
            type="button"
            onClick={onOpenFile}
            disabled={isDeleting}
            style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 5, color: theme.subText, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', flexShrink: 0 }}
          >
            Open
          </button>
        )}
        {onDeleteFile && (
          <button
            type="button"
            onClick={onDeleteFile}
            disabled={isDeleting}
            title={deleteTitle}
            style={{ background: 'none', border: '1px solid #ef444444', borderRadius: 5, color: '#ef4444', cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          >
            <TabTrashIcon />
          </button>
        )}
      </div>
    );
  };

  const sectionLabel = (label: string) => (
    <div style={{ color: theme.subText, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '14px 4px 6px' }}>
      {label}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200 }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        backgroundColor: theme.card, borderLeft: `1px solid ${theme.border}`,
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ color: theme.text, fontWeight: 700, fontSize: 14 }}>Files</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file manager"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 20, lineHeight: 1, padding: 4, borderRadius: 4 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>

          {/* ── Your Files ─────────────────────────────────────────────── */}
          {isLoggedIn ? (
            <>
              {sectionLabel('Cloud Files')}
              {loading ? (
                <div style={{ color: theme.subText, fontSize: 13, padding: '12px 4px', textAlign: 'center' }}>Loading…</div>
              ) : serverFiles.length === 0 ? (
                <div style={{ color: theme.subText, fontSize: 13, padding: '8px 4px', lineHeight: '20px' }}>
                  Nothing saved yet. Hit 💾 Save in the toolbar to sync your tabs here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {serverFiles.map(file => renderFileRow(
                    file,
                    () => handleOpen(file),
                    () => handleDeleteCloud(file),
                    'Delete from account',
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {sectionLabel('Local Files')}
              {/* Login nudge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 8,
                backgroundColor: theme.linkColor + '12',
                border: `1px solid ${theme.linkColor}33`,
              }}>
                <div style={{ flex: 1, color: theme.subText, fontSize: 12, lineHeight: '17px' }}>
                  <Link to="/login" style={{ color: theme.linkColor, fontWeight: 600, textDecoration: 'none' }} onClick={onClose}>Sign in</Link>
                  {' '}to save your files to the cloud and access them anywhere.
                </div>
              </div>
              {localFiles.length === 0 ? (
                <div style={{ color: theme.subText, fontSize: 13, padding: '8px 4px', lineHeight: '20px' }}>
                  Nothing saved yet. Hit 💾 Save in the toolbar to keep a file here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {localFiles.map(file => renderFileRow(
                    file,
                    () => handleOpen(file),
                    () => handleDeleteLocal(file),
                    'Delete from local storage',
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Examples ───────────────────────────────────────────────── */}
          {sectionLabel('Examples')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {EXAMPLE_FILES.map(ex => (
              <div
                key={ex.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: theme.text, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ex.name}
                  </div>
                  <div style={{ color: theme.subText, fontSize: 11, marginTop: 1 }}>{ex.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenExample(ex)}
                  style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 5, color: theme.subText, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', flexShrink: 0 }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <p style={{ color: theme.subText, fontSize: 11, lineHeight: '16px', margin: 0 }}>
            {isLoggedIn
              ? 'Closing a tab (×) removes it from this session only — it stays in your account. Delete removes it permanently.'
              : 'Files are stored in your browser. Sign in to back them up to the cloud.'}
          </p>
        </div>
      </div>
    </>
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
        role="log"
        aria-live="polite"
        aria-label="Program console"
        aria-relevant="additions"
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
        {isWaiting && (
          <span className="sr-only" aria-live="assertive">
            Program is waiting for input. Type your response and press Enter.
          </span>
        )}
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
