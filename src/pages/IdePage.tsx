import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon } from '../components/ActionIcons';
import { BitmapDisplay } from '../components/BitmapDisplay';
import { CodeEditor } from '../components/CodeEditor';
import { InstructionStats } from '../components/InstructionStats';
import { Logo } from '../components/Logo';
import { MemoryView } from '../components/MemoryView';
import { FileRowSkeleton, IdeSkeleton } from '../components/PageSkeletons';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { SaveStatus } from '../components/SaveStatus';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken, uniquifyName } from '../helpers/authStorage';
import { useAutosave } from '../hooks/useAutosave';
import type { InstrStats } from '../simulator/useMips';
import { assemble, continueSim, feedInput, getInstructionStats, getMemoryRange, getState, resetSim, runSim, stepBackSim, stepSim } from '../simulator/useMips';

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
    name: 'smile.asm',
    description: 'Smiley face — open the Bitmap tab (64×64, scale 4)',
    code:
`# smile.asm — smiley face drawn pixel by pixel
# Open the Bitmap tab, set 64x64 at scale 4, then run.
# Pixel format: 0x00RRGGBB stored at base + (y*64 + x)*4
.text
main:
    li   $s0, 0x10010000   # bitmap base address

    li   $t0, 0            # y = 0
yloop:
    li   $t1, 0            # x = 0
xloop:
    # Squared distance from face center (32, 32)
    addi $t2, $t0, -32
    addi $t3, $t1, -32
    mul  $t4, $t2, $t2     # dy^2
    mul  $t5, $t3, $t3     # dx^2
    add  $t6, $t4, $t5     # face r^2

    # Default: steel-blue background
    li   $s1, 0x006699CC
    li   $t9, 576          # 24^2 — face outer edge
    bgt  $t6, $t9, write

    # Dark outline ring: 22^2 < r^2 <= 24^2
    li   $s1, 0x00222222
    li   $t9, 484          # 22^2
    bgt  $t6, $t9, write

    # Yellow face fill
    li   $s1, 0x00FFD700

    # Left eye: center (24, 24), radius 4
    addi $t2, $t0, -24
    addi $t3, $t1, -24
    mul  $t4, $t2, $t2
    mul  $t5, $t3, $t3
    add  $t7, $t4, $t5
    li   $t9, 16
    ble  $t7, $t9, feature

    # Right eye: center (40, 24), radius 4
    addi $t2, $t0, -24
    addi $t3, $t1, -40
    mul  $t4, $t2, $t2
    mul  $t5, $t3, $t3
    add  $t7, $t4, $t5
    ble  $t7, $t9, feature

    # Smile arc: center (32, 36), ring r=10..13, lower arc only
    addi $t2, $t0, -36
    addi $t3, $t1, -32
    mul  $t4, $t2, $t2
    mul  $t5, $t3, $t3
    add  $t7, $t4, $t5
    blt  $t0, 36, write
    li   $t9, 100
    blt  $t7, $t9, write
    li   $t9, 169
    bgt  $t7, $t9, write
feature:
    li   $s1, 0x00222222

write:
    sll  $t2, $t0, 6       # y * 64
    add  $t2, $t2, $t1     # + x
    sll  $t2, $t2, 2       # * 4
    add  $t2, $t2, $s0     # + base
    sw   $s1, 0($t2)

    addi $t1, $t1, 1
    slti $t9, $t1, 64
    bnez $t9, xloop

    addi $t0, $t0, 1
    slti $t9, $t0, 64
    bnez $t9, yloop

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
      const tabs: CodeTab[] = parsed.tabs.map(normalizeTab);
      // activeTabId must reference a real (post-normalize) tab id, otherwise
      // activeCode never matches and the editor desyncs from React state.
      const activeTabId = tabs.some(t => t.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id;
      return { tabs, activeTabId };
    }
    // legacy: plain array
    if (Array.isArray(parsed) && parsed.length > 0) {
      const tabs = parsed.map(normalizeTab);
      return { tabs, activeTabId: tabs[0].id };
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
  const [filesDrawerOpen, setFilesDrawerOpen] = useState(false);
  const [closedFileNames, setClosedFileNames] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<'editor' | 'console' | 'registers' | 'memory'>('editor');

  const [rightTab, setRightTab] = useState<RightTab>('registers');
  const [instrStats, setInstrStats] = useState<InstrStats | null>(null);
  const [simTick, setSimTick] = useState(0);

  const prevRegistersRef = useRef<RegisterValue[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [changedRegisters, setChangedRegisters] = useState<Set<string>>(new Set());

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

  const { status: saveStatus, lastSavedAt, scheduleSave, flushNow } = useAutosave({
    tabsRef,
    isLoggedIn,
    setTabs,
    setIsLoggedIn,
    apiBase: API_BASE,
  });

  // Guest save state — mirrors the server autosave lifecycle for local storage
  const [guestSaveStatus, setGuestSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [guestSavedAt, setGuestSavedAt] = useState<number | null>(null);
  const guestSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (guestSavedTimerRef.current !== null) clearTimeout(guestSavedTimerRef.current);
    if (guestDebounceRef.current !== null) clearTimeout(guestDebounceRef.current);
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
  }, []);

  const markGuestSaved = useCallback(() => {
    setGuestSaveStatus('saved');
    setGuestSavedAt(Date.now());
    if (guestSavedTimerRef.current !== null) clearTimeout(guestSavedTimerRef.current);
    guestSavedTimerRef.current = setTimeout(() => {
      setGuestSaveStatus('idle');
      guestSavedTimerRef.current = null;
    }, 2000);
  }, []);

  // Write all current open tabs into saved_files, preserving closed-but-saved files.
  // Mirrors the server merge: closed files survive, open tabs are updated.
  const guestFlushNow = useCallback(() => {
    if (guestDebounceRef.current !== null) {
      clearTimeout(guestDebounceRef.current);
      guestDebounceRef.current = null;
    }
    const clean = tabsRef.current.map(t => ({ ...t, isDirty: false }));
    const existing = readSavedFiles();
    const openIds = new Set(clean.map(t => t.id));
    const merged = [...existing.filter(f => !openIds.has(f.id)), ...clean];
    writeSavedFiles(merged);
    setTabs(prev => prev.map(t => ({ ...t, isDirty: false })));
    markGuestSaved();
  }, [markGuestSaved, setTabs]);

  // Debounced guest save — call on every change, fires 1.5s after the last one
  const guestScheduleSave = useCallback(() => {
    if (guestDebounceRef.current !== null) clearTimeout(guestDebounceRef.current);
    guestDebounceRef.current = setTimeout(() => {
      guestDebounceRef.current = null;
      guestFlushNow();
    }, 1500);
  }, [guestFlushNow]);

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

  // Autosave whenever a dirty tab exists (server for logged-in, saved_files for guests)
  useEffect(() => {
    if (!tabs.some(t => t.isDirty)) return;
    if (isLoggedIn) scheduleSave();
    else guestScheduleSave();
  }, [tabs, isLoggedIn, scheduleSave, guestScheduleSave]);

  // Flush on tab hidden (user switches away / closes browser tab)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'hidden') return;
      if (isLoggedIn) flushNow();
      else guestFlushNow();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isLoggedIn, flushNow, guestFlushNow]);

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

  const handleSave = async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      // Fetch current server state first so closed-but-saved files are preserved
      const getRes = await fetch(`${API_BASE}/auth/tabs`, { headers: getApiHeaders(token) });
      if (getRes.status === 401) { clearAuthToken(); setIsLoggedIn(false); setOutput('Session expired. Please log in again.'); return; }
      const serverTabs: CodeTab[] = getRes.ok ? ((await getRes.json()) as CodeTab[]).map(normalizeTab) : [];

      const clean = tabsRef.current.map(t => ({ ...t, isDirty: false }));
      const openIds = new Set(clean.map(t => t.id));
      const merged = [...serverTabs.filter(t => !openIds.has(t.id)), ...clean];

      const postRes = await fetch(`${API_BASE}/auth/tabs`, {
        method: 'POST',
        headers: getApiHeaders(token, true),
        body: JSON.stringify({ tabs: merged }),
      });
      if (postRes.status === 401) { clearAuthToken(); setIsLoggedIn(false); setOutput('Session expired. Please log in again.'); return; }
      if (!postRes.ok) {
        const data = await postRes.json().catch(() => null);
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
    guestFlushNow();
    setOutput('Saved to browser.');
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
        const newId = String(Date.now());
        setActiveTabId(newId);
        return [{ id: newId, name: 'file1.asm', code: '', isDirty: false }];
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
        if (isLoggedIn) flushNow();
        else handleSaveLocal();
        return;
      }

      // Ctrl/Cmd+Enter — assemble from anywhere (including editor)
      if (metaOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        if (!isWaiting) handleAssemble();
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
      flushNow, handleSaveLocal]);

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
    if (isLoggedIn) {
      // Flush before removing so the tab's final content reaches the server
      flushNow();
    } else {
      // Flush all open tabs (including the one being closed) before removing it
      guestFlushNow();
    }
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
    const otherTabNames = new Set(tabsRef.current.filter(t => t.id !== editingTabId).map(t => t.name));
    const allNames = new Set([...otherTabNames, ...closedFileNames]);
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
          markGuestSaved();
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
    { label: 'Save',   onPress: isLoggedIn ? () => { flushNow(); } : handleSaveLocal, title: 'Save (Ctrl+S)' },
    { label: 'Import', onPress: handleUpload,   title: 'Import a file from disk' },
    { label: 'Export', onPress: handleDownload, title: 'Export the active file' },
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
  if (!ready) return <IdeSkeleton theme={theme} />;

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

            {/* Nav + save status + theme */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 1, height: 20, backgroundColor: theme.border }} />
              <SaveStatus status={saveStatus} guestStatus={guestSaveStatus} lastSavedAt={isLoggedIn ? lastSavedAt : guestSavedAt} isLoggedIn={isLoggedIn} onRetry={() => flushNow()} />
              <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>Docs</Link>
              <button
                type="button"
                onClick={() => setFilesDrawerOpen(true)}
                title="Files"
                style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.subText, cursor: 'pointer', padding: '4px 10px', fontSize: 13, fontWeight: 500 }}
              >
                Files
              </button>
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
            <SaveStatus status={saveStatus} guestStatus={guestSaveStatus} lastSavedAt={isLoggedIn ? lastSavedAt : guestSavedAt} isLoggedIn={isLoggedIn} onRetry={() => flushNow()} compact />
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
              { label: 'Save',      onPress: isLoggedIn ? () => { flushNow(); } : handleSaveLocal, disabled: false },
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
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Left column: editor + console */}
          <div className="editor-column" style={{ width: `${leftPct}%`, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: `${editorHeightPct}%`, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <CodeEditor code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} errorLines={errorLines} onAssemble={handleAssemble} />
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
              {rightTab === 'registers' && <RegisterPanel registers={registers} theme={theme} showHex={showHex} toggleFormat={() => setShowHex(p => !p)} changedRegisters={changedRegisters} />}
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
        onFilesLoaded={setClosedFileNames}
        onUpload={handleUpload}
        onDownload={handleDownload}
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
  onFilesLoaded: (names: Set<string>) => void;
  onUpload: () => void;
  onDownload: () => void;
}

function FilesDrawer({ open, onClose, theme, isLoggedIn, tabs, setTabs, activeTabId, setActiveTabId, removeTabLocally, onFilesLoaded, onUpload, onDownload }: FilesDrawerProps) {
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
        .then(data => {
          if (Array.isArray(data)) {
            const files = data.map(normalizeTab);
            setServerFiles(files);
            onFilesLoaded(new Set(files.map((f: CodeTab) => f.name)));
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      const files = readSavedFiles();
      setLocalFiles(files);
      onFilesLoaded(new Set(files.map(f => f.name)));
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
    setTabs(prev => {
      const allNames = new Set([
        ...prev.map(t => t.name),
        ...serverFiles.map(f => f.name),
        ...localFiles.map(f => f.name),
      ]);
      const name = uniquifyName(ex.name, allNames);
      return [...prev, { id, name, code: ex.code, isDirty: false }];
    });
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 0 18px', height: 48, borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ color: theme.text, fontWeight: 700, fontSize: 14, flex: 1 }}>Files</div>
          <button
            type="button"
            onClick={onUpload}
            title="Import file from disk"
            aria-label="Import file from disk"
            style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.subText, height: 28, padding: '0 8px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >↑ Import</button>
          <button
            type="button"
            onClick={onDownload}
            title="Download active file"
            aria-label="Download active file"
            style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', color: theme.subText, height: 28, padding: '0 8px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >↓ Export</button>
          <div style={{ width: 1, height: 16, backgroundColor: theme.border, flexShrink: 0, margin: '0 2px' }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file manager"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 20, lineHeight: 1, width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, flexShrink: 0 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>

          {/* ── Your Files ─────────────────────────────────────────────── */}
          {isLoggedIn ? (
            <>
              {sectionLabel('Cloud Files')}
              {loading ? (
                <FileRowSkeleton theme={theme} count={3} />
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
