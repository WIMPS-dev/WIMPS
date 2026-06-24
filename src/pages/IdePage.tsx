import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon } from '../components/ActionIcons';
import { FileExplorer } from '../components/FileExplorer';
import { BitmapDisplay } from '../components/BitmapDisplay';
import { CodeEditor } from '../components/CodeEditor';
import { InstructionStats } from '../components/InstructionStats';
import { Logo } from '../components/Logo';
import { MemoryView } from '../components/MemoryView';
import { IdeSkeleton } from '../components/PageSkeletons';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { SaveStatus } from '../components/SaveStatus';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken, uniquifyName } from '../helpers/authStorage';
import { useAutosave } from '../hooks/useAutosave';
import type { InstrStats } from '../simulator/useMips';
import { assemble, continueSim, feedInput, getInstructionStats, getMemoryRange, getState, resetSim, runSim, stepBackSim, stepSim } from '../simulator/useMips';
import type { CodeTab } from '../types';
import { normalizeTab, readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const DATA_START = 0x10010000;
const DATA_WORDS = 32;

type SidebarPanel = 'files' | 'registers' | 'memory' | 'stats' | 'bitmap';

const SIDEBAR_PANELS: { id: SidebarPanel; label: string; icon: string }[] = [
  { id: 'files',     label: 'Files',  icon: 'Files'  },
  { id: 'registers', label: 'Regs',   icon: 'Regs'   },
  { id: 'memory',    label: 'Memory', icon: 'Memory' },
  { id: 'stats',     label: 'Stats',  icon: 'Stats'  },
  { id: 'bitmap',    label: 'Bitmap', icon: 'Bitmap' },
];

const DEFAULT_TABS: CodeTab[] = [{ id: '1', name: 'file1.asm', code: '', isDirty: false }];

const buildInitialRegisters = (): RegisterValue[] =>
  ['$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
   '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
   '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
   '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra']
  .map((name, i) => ({ name, number: i, hexValue: '0x00000000' }));

function readLocalState(): { tabs: CodeTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem('saved_tabs');
    // No key at all = genuine first visit; spawn default file
    if (raw === null) return { tabs: DEFAULT_TABS, activeTabId: '1' };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tabs)) {
      if (parsed.tabs.length > 0) {
        const tabs: CodeTab[] = parsed.tabs.map(normalizeTab);
        // activeTabId must reference a real (post-normalize) tab id, otherwise
        // activeCode never matches and the editor desyncs from React state.
        const activeTabId = tabs.some(t => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id;
        return { tabs, activeTabId };
      }
      // Empty array = user deliberately deleted all files
      return { tabs: [], activeTabId: '' };
    }
    // legacy: plain array
    if (Array.isArray(parsed) && parsed.length > 0) {
      const tabs = parsed.map(normalizeTab);
      return { tabs, activeTabId: tabs[0].id };
    }
  } catch {}
  // Corrupt/unparseable — treat as first visit
  return { tabs: DEFAULT_TABS, activeTabId: '1' };
}

function writeLocalState(tabs: CodeTab[], activeTabId: string) {
  try { localStorage.setItem('saved_tabs', JSON.stringify({ tabs, activeTabId })); } catch {}
}

// ---------------------------------------------------------------------------
export default function IdePage() {
  const { theme } = useTheme();
  const ready = usePageReady();

  // Read once — two separate readLocalState() calls would generate divergent
  // random ids for any tab missing one, desyncing tabs[0].id from activeTabId.
  const [initialState] = useState(readLocalState);
  const [tabs, setTabs] = useState<CodeTab[]>(initialState.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initialState.activeTabId);
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
  const [isTerminated, setIsTerminated] = useState(false);
  const [errorLines, setErrorLines] = useState<{ line: number; message: string }[]>([]);
  const [showHex, setShowHex] = useState(true);
  // TEMP: login disabled
  // useState(() => !!getAuthToken())`
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [closedFileNames, setClosedFileNames] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<'editor' | 'console' | 'registers' | 'memory'>('editor');

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem('sidebar_open'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try { const v = localStorage.getItem('sidebar_width'); return v ? Math.max(160, Math.min(480, Number(v))) : 260; } catch { return 260; }
  });
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SidebarPanel>(() => {
    try {
      const v = localStorage.getItem('sidebar_panel');
      return (['files', 'registers', 'memory', 'stats', 'bitmap'] as const).includes(v as SidebarPanel) ? v as SidebarPanel : 'registers';
    } catch { return 'registers'; }
  });
  const [instrStats, setInstrStats] = useState<InstrStats | null>(null);
  const [simTick, setSimTick] = useState(0);

  const prevRegistersRef = useRef<RegisterValue[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [changedRegisters, setChangedRegisters] = useState<Set<string>>(new Set());

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

  const { status: saveStatus, lastSavedAt, scheduleSave, flushNow, markSaved } = useAutosave({
    tabsRef,
    isLoggedIn,
    setTabs,
    setIsLoggedIn,
    apiBase: API_BASE,
  });

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => { try { localStorage.setItem('sidebar_open',  String(sidebarOpen));      } catch {} }, [sidebarOpen]);
  useEffect(() => { try { localStorage.setItem('sidebar_width', String(sidebarWidth));      } catch {} }, [sidebarWidth]);
  useEffect(() => { try { localStorage.setItem('sidebar_panel', activeSidebarPanel);        } catch {} }, [activeSidebarPanel]);

  const activeCode = useMemo(() => tabs.find(t => t.id === activeTabId)?.code ?? '', [tabs, activeTabId]);

  const setActiveCode = useCallback((code: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, code, isDirty: true } : t));
    setIsAssembled(false);
    setErrorLines([]);
  }, [activeTabId]);

  // Reset assembled state and error markers when switching tabs
  useEffect(() => { setIsAssembled(false); setErrorLines([]); }, [activeTabId]);

  // Load tabs from server on mount (logged-in users only).
  // Always apply the server response — never let stale localStorage bleed through.
  useEffect(() => {
    // TEMP: login disabled
    /*
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_BASE}/auth/tabs`, { headers: getApiHeaders(token) })
      .then(r => {
        if (r.status === 401) { clearAuthToken(); setIsLoggedIn(false); return null; }
        return r.json();
      })
      .then(data => {
        if (!Array.isArray(data)) return;
        if (data.length > 0) {
          const loaded = data.map(normalizeTab);
          setTabs(loaded);
          setActiveTabId(loaded[0].id);
        } else {
          // Logged in but no server files — clear any guest localStorage files
          setTabs(DEFAULT_TABS);
          setActiveTabId(DEFAULT_TABS[0].id);
        }
      })
      .catch(() => {});
    */
  }, []);

  // Auto-persist to localStorage whenever tabs or active tab change
  useEffect(() => {
    writeLocalState(tabs, activeTabId);
  }, [tabs, activeTabId]);

  // Autosave whenever a dirty tab exists (server for logged-in, localStorage for guests)
  useEffect(() => {
    if (!tabs.some(t => t.isDirty)) return;
    scheduleSave();
  }, [tabs, scheduleSave]);

  // Flush on tab hidden (user switches away / closes browser tab)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'hidden') return;
      flushNow();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [flushNow]);

  const applyState = (state: ReturnType<typeof getState>) => {
    const prev = prevRegistersRef.current;
    const next = state.registers;
    if (prev.length > 0) {
      const changed = new Set(
        next.filter((r, i) => prev[i]?.hexValue !== r.hexValue).map(r => r.name)
      );
      setChangedRegisters(changed);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setChangedRegisters(new Set()), 800);
    }
    prevRegistersRef.current = next;
    setRegisters(next);
    setOutput(state.output);
    setActiveLine(state.lineNumber);
    setIsWaiting(state.isWaiting);
    setCanStepBack(state.canUndo);
    setIsTerminated(state.terminated);
    setMemoryData(getMemoryRange(DATA_START, DATA_WORDS));
    setInstrStats(getInstructionStats());
    setSimTick(t => t + 1);
  };

  const handleAssemble = () => {
    resetSim();
    setActiveLine(null);
    setIsWaiting(false);
    setChangedRegisters(new Set());
    prevRegistersRef.current = [];
    const result = assemble(activeCode);
    if (!result.ok) {
      setOutput(`Assembly failed:\n${result.error}`);
      setIsAssembled(false);
      setErrorLines(result.errors.filter(e => !e.isWarning).map(e => ({ line: e.lineNumber, message: e.message })));
    } else {
      setIsAssembled(true);
      setErrorLines([]);
      applyState(getState());
      setActiveLine(null);
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
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setChangedRegisters(new Set());
    prevRegistersRef.current = [];
    setOutput('');
    setMemoryData([]);
    setActiveLine(null);
    setIsWaiting(false);
    setIsAssembled(false);
    setCanStepBack(false);
    setIsTerminated(false);
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

  const handleSaveLocal = () => {
    flushNow();
    setOutput(isLoggedIn ? 'Saved to account.' : 'Saved to browser.');
  };

  const handleLogout = () => {
    clearAuthToken();
    localStorage.removeItem('saved_tabs');
    localStorage.removeItem('saved_files');
    setIsLoggedIn(false);
    setTabs(DEFAULT_TABS);
    setActiveTabId(DEFAULT_TABS[0].id);
  };

  // Shared helper: removes a tab from local state and fixes the active tab.
  const removeTabLocally = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      if (prev.length === 1) {
        setActiveTabId('');
        return [];
      }
      const next = prev[idx === 0 ? 1 : idx - 1];
      if (activeTabId === tabId) setActiveTabId(next.id);
      return prev.filter(t => t.id !== tabId);
    });
  }, [activeTabId]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const metaOrCtrl = e.ctrlKey || e.metaKey;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'SELECT';

      // Ctrl/Cmd+S — immediate save from anywhere (including editor)
      if (metaOrCtrl && e.key === 's') {
        e.preventDefault();
        handleSaveLocal();
        return;
      }

      // Ctrl/Cmd+Enter — assemble from anywhere (including editor)
      if (metaOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        if (!isWaiting) handleAssemble();
        return;
      }

      // Ctrl/Cmd+B — toggle sidebar
      if (metaOrCtrl && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(o => !o);
        return;
      }

      // F-keys and Escape: skip when a plain input field has focus or when
      // the simulator is waiting for console input (user is typing into console)
      if (inInput || isWaiting) return;

      switch (e.key) {
        case 'F5':  e.preventDefault(); handleRun(); break;
        case 'F8':  e.preventDefault(); handleContinue(); break;
        case 'F9':  e.preventDefault(); if (canStepBack) handleStepBack(); break;
        case 'F10': e.preventDefault(); handleStep(); break;
        case 'Escape': handleReset(); break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLoggedIn, canStepBack, isWaiting,
      handleAssemble, handleRun, handleContinue, handleStep, handleStepBack, handleReset,
      handleSaveLocal]);

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
    const existingNames = new Set(tabs.map(t => t.name));
    let n = 1;
    while (existingNames.has(`file${n}.asm`)) n++;
    const newTab: CodeTab = { id, name: `file${n}.asm`, code: '', isDirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    // Flush before removing so the tab's final content is saved
    flushNow();
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
    const raw = editTabName.trim() || 'untitled.asm';
    const currentName = tabsRef.current.find(t => t.id === editingTabId)?.name;
    const otherTabNames = new Set(tabsRef.current.filter(t => t.id !== editingTabId).map(t => t.name));
    const allNames = new Set([...otherTabNames, ...[...closedFileNames].filter(n => n !== currentName)]);
    const name = uniquifyName(raw, allNames);
    setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, name, isDirty: true } : t));
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
        const allNames = new Set([...tabsRef.current.map(t => t.name), ...closedFileNames]);
        const name = uniquifyName(file.name, allNames);
        const newTab: CodeTab = { id, name, code: text, isDirty: true };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(id);
        if (!isLoggedIn) {
          // tabsRef won't have newTab yet (setTabs is async), so upsert directly
          const clean = { ...newTab, isDirty: false };
          const existing = readSavedFiles();
          writeSavedFiles(existing.some(f => f.id === clean.id)
            ? existing.map(f => f.id === clean.id ? clean : f)
            : [...existing, clean]);
          markSaved();
        }
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
  const startSidebarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.max(160, Math.min(480, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleSidebarIconClick = (panel: SidebarPanel) => {
    if (panel === activeSidebarPanel) {
      setSidebarOpen(o => !o);
    } else {
      setActiveSidebarPanel(panel);
      setSidebarOpen(true);
    }
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
  // Debug toolbar: Assemble + step controls. Assemble always enabled; rest require isAssembled.
  const debugActions: { label: string; onPress: () => void; enabled: boolean; title: string }[] = [
    { label: 'Run',       onPress: handleRun,       enabled: isAssembled && !isTerminated,               title: 'Run (F5)' },
    { label: 'Continue',  onPress: handleContinue,  enabled: isAssembled && !isTerminated,               title: 'Continue (F8)' },
    { label: 'Step Back', onPress: handleStepBack,  enabled: isAssembled && canStepBack,                 title: 'Step Back (F9)' },
    { label: 'Step',      onPress: handleStep,      enabled: isAssembled && !isTerminated,               title: 'Step (F10)' },
    { label: 'Reset',     onPress: handleReset,     enabled: isAssembled,                                title: 'Reset (Escape)' },
  ];

  const simStatus =
    errorLines.length > 0 ? 'error'     as const
    : !isAssembled        ? 'idle'      as const
    : isTerminated        ? 'done'      as const
    : activeLine !== null ? 'stepping'  as const
    :                       'assembled' as const;

  const STATUS_CONFIG = {
    idle:      { label: '● Not assembled',                   color: '#f59e0b', bg: '#78350f22', border: '#92400e' },
    assembled: { label: '✓ Assembled',                       color: '#6ee7b7', bg: '#06574422', border: '#065f46' },
    stepping:  { label: '▶ Stepping',                        color: '#7dd3fc', bg: '#0c4a6e22', border: '#0c4a6e' },
    done:      { label: '◼ Done',                            color: '#94a3b8', bg: '#1e29381a', border: '#334155' },
    error:     { label: `✕ Error (${errorLines.length})`,    color: '#f87171', bg: '#7f1d1d22', border: '#7f1d1d' },
  } as const;

  // File toolbar: Save + import/export
  const fileActions: { label: string; onPress: () => void; title: string }[] = [
    { label: 'Save',   onPress: handleSaveLocal, title: 'Save (Ctrl+S)' },
    { label: 'Import', onPress: handleUpload,   title: 'Import a file from disk' },
    { label: 'Export', onPress: handleDownload, title: 'Export the active file' },
  ];

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
  if (!ready) return <IdeSkeleton theme={theme} />;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: theme.bg, overflow: 'hidden',
      '--ide-ink': theme.text,
      '--ide-card': theme.card,
      '--ide-hover': theme.resizer,
      '--ide-border': theme.border,
    } as React.CSSProperties}>
      {/* Top bar */}
      {wide ? (
        /* ── Desktop: file toolbar + debug toolbar ── */
        <>
          {/* Row 1 — file toolbar: logo, tabs, file ops, nav */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 44,
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: theme.card,
            flexShrink: 0,
            gap: 8,
            padding: '0 12px',
            overflow: 'hidden',
          }}>
            {/* Logo */}
            <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 16, flexShrink: 0, marginRight: 4 }}><Logo size={20} /></Link>

            {/* Tabs */}
            <div style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              <div
                className="tab-scroll"
                role="tablist"
                aria-label="Editor files"
                style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: 'max-content', height: 36 }}>
                  {tabs.map(tab => (
                    <div
                      key={tab.id}
                      role="tab"
                      tabIndex={0}
                      aria-selected={tab.id === activeTabId}
                      onClick={() => setActiveTabId(tab.id)}
                      onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? setActiveTabId(tab.id) : undefined}
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
                    </div>
                  ))}
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
            </div>

            {/* File actions: Save / Import / Export */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{ width: 1, height: 20, backgroundColor: theme.border, marginRight: 4 }} />
              {fileActions.map(a => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onPress}
                  title={a.title}
                  aria-label={a.label}
                  className="ide-action-btn"
                  style={{
                    background: 'none',
                    border: `1px solid ${theme.border}`,
                    borderRadius: 6,
                    color: theme.text,
                    cursor: 'pointer',
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                    height: 28,
                  }}
                >
                  <ActionIcon name={a.label} size={13} />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>

            {/* Nav + theme */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 1, height: 20, backgroundColor: theme.border }} />
              <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Docs</Link>
              <ThemeSwitch />
            </div>
          </div>

          {/* Row 2 — debug toolbar: Assemble + step controls + status pill placeholder */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: theme.bg,
            flexShrink: 0,
            padding: '0 12px',
            gap: 6,
          }}>
            {/* Assemble — always enabled, always blue */}
            <button
              type="button"
              onClick={handleAssemble}
              title="Assemble (Ctrl+Enter)"
              aria-label="Assemble"
              className="ide-action-btn ide-active"
              style={{
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                height: 28,
                padding: '0 12px',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
              }}
            >
              <ActionIcon name="Assemble" size={13} />
              <span>Assemble</span>
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: theme.border, flexShrink: 0 }} />

            {/* Step controls — dimmed until assembled */}
            {debugActions.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.enabled ? a.onPress : undefined}
                title={a.title}
                aria-label={a.label}
                aria-disabled={!a.enabled}
                className="ide-action-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  borderRadius: 5,
                  color: theme.text,
                  cursor: a.enabled ? 'pointer' : 'not-allowed',
                  opacity: a.enabled ? 1 : 0.35,
                  height: 28,
                  padding: '0 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s',
                }}
              >
                <ActionIcon name={a.label} size={13} />
                <span>{a.label}</span>
              </button>
            ))}

            <div style={{ flex: 1 }} />
            <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => flushNow()} />
            <div style={{ width: 1, height: 16, backgroundColor: theme.border, flexShrink: 0, margin: '0 4px' }} />
            {/* Status pill */}
            <div
              className="sim-status-pill"
              role="status"
              aria-live="polite"
              style={{
                color: STATUS_CONFIG[simStatus].color,
                backgroundColor: STATUS_CONFIG[simStatus].bg,
                borderColor: STATUS_CONFIG[simStatus].border,
              }}
            >
              {STATUS_CONFIG[simStatus].label}
            </div>
          </div>
        </>

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
            <Link to="/" style={{ textDecoration: 'none', color: theme.text, fontWeight: 800, fontSize: 17, flexShrink: 0 }}><Logo size={22} /></Link>
            <div style={{ flex: 1 }} />
            <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt}onRetry={() => flushNow()} compact />
            <ThemeSwitch />
            <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Docs</Link>
            {/* TEMP: login disabled
            {isLoggedIn ? (
              <button type="button" onClick={handleLogout} className="ide-sign-out" style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text, cursor: 'pointer', padding: '6px 12px', fontSize: 14 }}>Sign out</button>
            ) : (
              <Link to="/login" className="ide-sign-in" style={{ backgroundColor: '#2563eb', color: '#fff', textDecoration: 'none', padding: '7px 14px', borderRadius: 6, fontSize: 14, fontWeight: 600 }}>Sign in</Link>
            )}
            */}
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
            {[
              { label: 'Assemble',  onPress: handleAssemble,  disabled: false },
              { label: 'Run',       onPress: handleRun,       disabled: isTerminated },
              { label: 'Continue',  onPress: handleContinue,  disabled: isTerminated },
              { label: 'Step Back', onPress: handleStepBack,  disabled: !canStepBack },
              { label: 'Step',      onPress: handleStep,      disabled: isTerminated },
              { label: 'Reset',     onPress: handleReset,     disabled: false },
              { label: 'Save',      onPress: handleSaveLocal, disabled: false },
            ].map(a => {
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
                  <ActionIcon name={a.label} size={16} />
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>{a.label}</span>
                </button>
              );
            })}

            {[
              { label: 'Import', onPress: handleUpload },
              { label: 'Export', onPress: handleDownload },
            ].map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.onPress}
                title={a.label}
                aria-label={a.label}
                className="ide-action-btn"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  color: theme.text,
                  cursor: 'pointer',
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
                <ActionIcon name={a.label} size={16} />
                <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>{a.label}</span>
              </button>
            ))}
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Activity bar */}
          <div className="ide-activity-bar">
            {SIDEBAR_PANELS.map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                className={`ide-activity-icon${activeSidebarPanel === id && sidebarOpen ? ' ide-activity-icon--active' : ''}`}
                onClick={() => handleSidebarIconClick(id)}
                title={label}
                aria-label={label}
                aria-pressed={activeSidebarPanel === id && sidebarOpen}
              >
                <ActionIcon name={icon} size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Sidebar panel (hidden when collapsed) */}
          {sidebarOpen && (
            <>
              <div className="ide-sidebar" style={{ width: sidebarWidth }}>
                <div className="ide-sidebar-header">
                  {SIDEBAR_PANELS.find(p => p.id === activeSidebarPanel)?.label.toUpperCase()}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {activeSidebarPanel === 'files'     && <FileExplorer theme={theme} isLoggedIn={isLoggedIn} tabs={tabs} setTabs={setTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} removeTabLocally={removeTabLocally} onFilesLoaded={setClosedFileNames} onUpload={handleUpload} onDownload={handleDownload} />}
                  {activeSidebarPanel === 'registers' && <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} changedRegisters={changedRegisters} />}
                  {activeSidebarPanel === 'memory'    && <MemoryView data={memoryData} theme={theme} />}
                  {activeSidebarPanel === 'stats'     && <InstructionStats stats={instrStats} theme={theme} />}
                  {activeSidebarPanel === 'bitmap'    && <BitmapDisplay theme={theme} tick={simTick} />}
                </div>
              </div>
              <div className="ide-sidebar-handle" onMouseDown={startSidebarDrag} />
            </>
          )}

          {/* Editor + console column */}
          <div className="editor-column" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: `${editorHeightPct}%`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {tabs.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: theme.subText }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ fontSize: 13, opacity: 0.6 }}>No file open</div>
                  <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center', lineHeight: '18px' }}>
                    Create a new file or open one<br />from the Files panel
                  </div>
                </div>
              ) : (
                <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} errorLines={errorLines} onAssemble={handleAssemble} onToggleSidebar={() => setSidebarOpen(o => !o)} />
              )}
            </div>

            {vDragHandle}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ConsolePanel output={output} isWaiting={isWaiting} onSubmit={handleFeedInput} theme={theme} />
            </div>
          </div>

        </div>
      ) : (
        /* Mobile single-panel */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mobileView === 'editor' && (
            <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} onAssemble={handleAssemble} />
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
            <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} changedRegisters={changedRegisters} />
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
