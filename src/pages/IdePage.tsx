import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon } from '../components/ActionIcons';
import { FileExplorer } from '../components/FileExplorer';
import { BitmapDisplay } from '../components/BitmapDisplay';
import { CodeEditor } from '../components/CodeEditor';
import { Logo } from '../components/Logo';
import { PerformancePanel, ProgramPanel } from '../components/MarsParityPanels';
import { MemoryView } from '../components/MemoryView';
import { IdeSkeleton } from '../components/PageSkeletons';
import { DocsContent } from './DocsPage';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { SaveAction, SaveStatus } from '../components/SaveStatus';
import { usePageReady } from '../components/Skeleton';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken, uniquifyName } from '../helpers/authStorage';
import { useAutosave } from '../hooks/useAutosave';
import type { InstrStats, PseudoExpansionInfo, ValueFormat } from '../simulator/useMips';
import { assemble, continueSim, feedInput, formatWordValue, getCurrentPseudoExpansionRows, getInstructionStats, getPseudoExpansion, getSourceLineForAddress, getState, resetSim, runSim, runSimWithLimit, runWithLimit, setMemoryWord, setRegisterValue, stepBackSim, stepSim } from '../simulator/useMips';
import type { CodeTab } from '../types';
import { normalizeTab, readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';
import type { CodeEditorHandle } from '../components/CodeEditor';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type RailControl = 'files' | 'tool-library';
type ToolId = 'registers' | 'memory' | 'display' | 'program' | 'performance';
type SidebarView = RailControl | ToolId;
type MobileView = 'files' | 'editor' | 'console' | 'tool-library' | ToolId;

type ToolDefinition = {
  id: ToolId;
  label: string;
  title: string;
  icon: string;
  defaultEnabled: boolean;
  description: string;
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: 'registers', label: 'Registers', title: 'Registers', icon: 'Regs', defaultEnabled: true, description: 'General-purpose registers, PC, HI, LO, and flags.' },
  { id: 'memory', label: 'Memory', title: 'Memory', icon: 'Memory', defaultEnabled: true, description: 'Memory inspector and word editor.' },
  { id: 'display', label: 'Bitmap Display', title: 'Bitmap Display', icon: 'Bitmap', defaultEnabled: false, description: 'Bitmap display viewer.' },
  { id: 'program', label: 'Program', title: 'Program', icon: 'Segments', defaultEnabled: false, description: 'Instruction and label views.' },
  { id: 'performance', label: 'Performance', title: 'Performance', icon: 'Stats', defaultEnabled: false, description: 'Instruction counts and performance stats.' },
];

const DEFAULT_ENABLED_TOOL_IDS = TOOL_DEFINITIONS.filter(tool => tool.defaultEnabled).map(tool => tool.id);
const ENABLED_TOOLS_KEY = 'ide_enabled_tools';
const ACTIVE_TOOL_KEY = 'ide_active_tool';

const DEFAULT_TABS: CodeTab[] = [{ id: '1', name: 'file1.asm', code: '', isDirty: false }];
const SIDEBAR_MIN_WIDTH = 340;
const SIDEBAR_MAX_WIDTH = 960;
const SIDEBAR_DEFAULT_WIDTH = 400;
const DOCS_TAB_ID = 'wimps-docs';
const DOCS_TAB_NAME = 'Documentation';

const buildInitialRegisters = (): RegisterValue[] =>
  ['$zero','$at','$v0','$v1','$a0','$a1','$a2','$a3',
   '$t0','$t1','$t2','$t3','$t4','$t5','$t6','$t7',
   '$s0','$s1','$s2','$s3','$s4','$s5','$s6','$s7',
   '$t8','$t9','$k0','$k1','$gp','$sp','$fp','$ra']
  .map((name, i) => ({ name, number: i, hexValue: '0x00000000' }));

function explainExpandedInstruction(assembly: string) {
  const op = assembly.trim().split(/\s+/)[0]?.toLowerCase();
  if (op === 'lui') return 'Load the upper 16 address bits into a register.';
  if (op === 'ori') return 'Add the lower 16 address bits without changing the upper bits.';
  if (op === 'addiu') return 'Add an immediate value; often used for small constants.';
  if (op === 'addu') return 'Copy or add register values without overflow traps.';
  if (op === 'sll') return 'Shift bits left; also used for nop.';
  return 'One real machine instruction produced by the assembler.';
}

function isToolId(value: string): value is ToolId {
  return TOOL_DEFINITIONS.some(tool => tool.id === value);
}

function readEnabledToolIds(): ToolId[] {
  try {
    const raw = localStorage.getItem(ENABLED_TOOLS_KEY);
    if (raw === null) return DEFAULT_ENABLED_TOOL_IDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ENABLED_TOOL_IDS;
    const filtered = parsed.filter((value): value is ToolId => typeof value === 'string' && isToolId(value));
    if (parsed.length === 0) return [];
    const unique = TOOL_DEFINITIONS
      .map(tool => tool.id)
      .filter(id => filtered.includes(id));
    return unique.length > 0 ? unique : DEFAULT_ENABLED_TOOL_IDS;
  } catch {
    return DEFAULT_ENABLED_TOOL_IDS;
  }
}

function readActiveToolId(enabledToolIds: ToolId[]): ToolId | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TOOL_KEY);
    if (raw && isToolId(raw) && enabledToolIds.includes(raw)) return raw;
  } catch {}
  return null;
}

function readInitialToolState(): { enabledToolIds: ToolId[]; activeToolId: ToolId | null } {
  const enabledToolIds = readEnabledToolIds();
  return { enabledToolIds, activeToolId: readActiveToolId(enabledToolIds) };
}

function PanelTabButton({
  theme,
  active,
  label,
  onClick,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#2563eb' : theme.border}`,
        backgroundColor: active ? '#2563eb22' : theme.bg,
        color: active ? '#2563eb' : theme.text,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function RunSpeedControl({
  theme,
  runSpeed,
  setRunSpeed,
  isTerminated,
  showLabel = true,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  runSpeed: number;
  setRunSpeed: (value: number) => void;
  isTerminated: boolean;
  showLabel?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {showLabel && <span style={{ color: theme.subText, fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>Speed</span>}
      <input
        type="range"
        min={0}
        max={4}
        step={1}
        value={runSpeed}
        disabled={isTerminated}
        onChange={e => setRunSpeed(Number(e.target.value))}
        aria-label="Run speed"
        title={['Crawl', 'Slow', 'Normal', 'Fast', 'Max'][runSpeed]}
        style={{
          width: 92,
          accentColor: '#2563eb',
          cursor: isTerminated ? 'not-allowed' : 'pointer',
        }}
      />
    </div>
  );
}

function DocsTabPanel({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.card,
      }}>
        <div>
          <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>Documentation</div>
          <div style={{ color: theme.subText, fontSize: 12 }}>Read-only reference tab</div>
        </div>
        <span style={{
          color: '#2563eb',
          backgroundColor: '#2563eb18',
          border: '1px solid #2563eb55',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
        }}>Read only</span>
      </div>
      <DocsContent embedded />
    </div>
  );
}

function SettingsPanel({
  theme,
  isDark,
  toggleTheme,
  fontSize,
  setFontSize,
  tabSize,
  setTabSize,
  showPseudoPopups,
  setShowPseudoPopups,
  showHotkeys,
  setShowHotkeys,
  runSpeed,
  setRunSpeed,
  isTerminated,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  isDark: boolean;
  toggleTheme: () => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  tabSize: 2 | 4;
  setTabSize: React.Dispatch<React.SetStateAction<2 | 4>>;
  showPseudoPopups: boolean;
  setShowPseudoPopups: React.Dispatch<React.SetStateAction<boolean>>;
  showHotkeys: boolean;
  setShowHotkeys: React.Dispatch<React.SetStateAction<boolean>>;
  runSpeed: number;
  setRunSpeed: (value: number) => void;
  isTerminated: boolean;
}) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 24,
    marginBottom: 6,
    whiteSpace: 'nowrap',
  };
  const labelStyle: React.CSSProperties = {
    color: theme.subText,
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  };

  return (
    <>
      <div style={rowStyle}>
        <span style={labelStyle}>Theme</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['dark', 'light'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { if ((t === 'dark') !== isDark) toggleTheme(); }}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 0,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${(t === 'dark') === isDark ? '#2563eb' : theme.border}`,
                backgroundColor: (t === 'dark') === isDark ? '#2563eb22' : 'transparent',
                color: (t === 'dark') === isDark ? '#2563eb' : theme.subText,
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Font Size</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={() => setFontSize(s => Math.max(10, s - 1))} disabled={fontSize <= 10} style={{ width: 22, height: 22, borderRadius: 0, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, cursor: fontSize <= 10 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: fontSize <= 10 ? 0.4 : 1 }} aria-label="Decrease font size">-</button>
          <span style={{ minWidth: 40, textAlign: 'center', fontSize: 12, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>{fontSize}px</span>
          <button type="button" onClick={() => setFontSize(s => Math.min(24, s + 1))} disabled={fontSize >= 24} style={{ width: 22, height: 22, borderRadius: 0, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, cursor: fontSize >= 24 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: fontSize >= 24 ? 0.4 : 1 }} aria-label="Increase font size">+</button>
          <button type="button" onClick={() => setFontSize(15)} style={{ padding: '3px 7px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.subText }}>Reset</button>
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Tab Size</span>
        <div style={{ display: 'flex', gap: 6 }}>
        {([2, 4] as const).map(t => (
          <button key={t} type="button" onClick={() => setTabSize(t)} style={{ flex: 1, padding: '4px 8px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${tabSize === t ? '#2563eb' : theme.border}`, backgroundColor: tabSize === t ? '#2563eb22' : 'transparent', color: tabSize === t ? '#2563eb' : theme.subText }}>{t} spaces</button>
        ))}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Pseudo Popups</span>
        <button
          type="button"
          onClick={() => setShowPseudoPopups(v => !v)}
          style={{
            padding: '4px 8px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showPseudoPopups ? '#2563eb' : theme.border}`,
            backgroundColor: showPseudoPopups ? '#2563eb22' : 'transparent',
            color: showPseudoPopups ? '#2563eb' : theme.subText,
          }}
        >{showPseudoPopups ? 'Visible' : 'Hidden'}</button>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Hotkey Labels</span>
        <button
          type="button"
          onClick={() => setShowHotkeys(v => !v)}
          style={{
            padding: '4px 8px', borderRadius: 0, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showHotkeys ? '#2563eb' : theme.border}`,
            backgroundColor: showHotkeys ? '#2563eb22' : 'transparent',
            color: showHotkeys ? '#2563eb' : theme.subText,
          }}
        >{showHotkeys ? 'Visible' : 'Hidden'}</button>
      </div>
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <span style={labelStyle}>Speed</span>
        <div style={{ width: 128 }}>
          <RunSpeedControl theme={theme} runSpeed={runSpeed} setRunSpeed={setRunSpeed} isTerminated={isTerminated} showLabel={false} />
        </div>
      </div>
    </>
  );
}

function PseudoExpansionNotice({
  theme,
  pseudoExpansion,
  pseudoExpansionAddress,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  pseudoExpansion: PseudoExpansionInfo | null;
  pseudoExpansionAddress: number | null;
}) {
  if (!pseudoExpansion) return null;

  return (
    <div style={{ margin: '0 14px 10px', border: '1px solid #92400e', backgroundColor: '#78350f18', borderRadius: 10, padding: 12 }}>
      <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Pseudo-instruction expansion
      </div>
      <div style={{ color: theme.text, fontSize: 12, lineHeight: '18px', marginTop: 4 }}>
        Source line {pseudoExpansion.sourceLine} expands into {pseudoExpansion.total} machine instructions. Step moves through the real instructions below one at a time.
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {getCurrentPseudoExpansionRows(pseudoExpansionAddress ?? undefined).map((row, i) => (
          <div
            key={row.address}
            style={{
              display: 'grid',
              gridTemplateColumns: '4ch minmax(0, 1fr)',
              gap: 8,
              alignItems: 'start',
              color: i + 1 === pseudoExpansion.index ? theme.text : theme.subText,
              fontSize: 11,
            }}
          >
            <span style={{ fontFamily: 'monospace' }}>{i + 1}/{pseudoExpansion.total}</span>
            <span>
              <span style={{ display: 'block', fontFamily: 'monospace', color: theme.text }}>{row.assembly}</span>
              <span style={{ display: 'block', marginTop: 2, lineHeight: '15px' }}>{explainExpandedInstruction(row.assembly)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type StepHistoryEntry = {
  line: number;
  pc: number;
};

function ToolLibraryPanel({
  theme,
  enabledToolIds,
  onToggleTool,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  enabledToolIds: ToolId[];
  onToggleTool: (toolId: ToolId) => void;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: theme.bg }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.card }}>
        <div style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>Tool Library</div>
        <div style={{ color: theme.subText, fontSize: 11, marginTop: 4 }}>
          Choose which tools appear in the sidebar and mobile tool switcher.
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10 }}>
        {TOOL_DEFINITIONS.map(tool => {
          const enabled = enabledToolIds.includes(tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onToggleTool(tool.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '22px 1fr',
                gap: 10,
                alignItems: 'center',
                textAlign: 'left',
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${enabled ? '#2563eb' : theme.border}`,
                backgroundColor: enabled ? '#2563eb14' : theme.card,
                color: theme.text,
                cursor: 'pointer',
              }}
            >
              <ActionIcon name={tool.icon} size={18} />
              <span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{tool.label}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: theme.subText }}>{tool.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SidebarPanelFrame({
  children,
}: React.PropsWithChildren<{
}>) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

function DisplayPanel({ theme, simTick }: { theme: ReturnType<typeof useTheme>['theme']; simTick: number }) {
  return (
    <SidebarPanelFrame>
      <BitmapDisplay theme={theme} tick={simTick} />
    </SidebarPanelFrame>
  );
}

function readLocalState(): { tabs: CodeTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem('saved_tabs');
    // No key at all = genuine first visit; spawn default file
    if (raw === null) return { tabs: DEFAULT_TABS, activeTabId: '1' };
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tabs)) {
      if (parsed.tabs.length > 0) {
        const tabs: CodeTab[] = parsed.tabs.map(normalizeTab).filter((tab: CodeTab) => tab.kind !== 'docs');
        if (tabs.length === 0) return { tabs: DEFAULT_TABS, activeTabId: DEFAULT_TABS[0].id };
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
      const tabs = parsed.map(normalizeTab).filter((tab: CodeTab) => tab.kind !== 'docs');
      if (tabs.length === 0) return { tabs: DEFAULT_TABS, activeTabId: DEFAULT_TABS[0].id };
      return { tabs, activeTabId: tabs[0].id };
    }
  } catch {}
  // Corrupt/unparseable — treat as first visit
  return { tabs: DEFAULT_TABS, activeTabId: '1' };
}

function writeLocalState(tabs: CodeTab[], activeTabId: string) {
  try {
    const persistedTabs = tabs.filter(tab => tab.kind !== 'docs');
    const persistedActiveTabId = persistedTabs.some(tab => tab.id === activeTabId)
      ? activeTabId
      : (persistedTabs[0]?.id ?? '');
    localStorage.setItem('saved_tabs', JSON.stringify({ tabs: persistedTabs, activeTabId: persistedActiveTabId }));
  } catch {}
}

// ---------------------------------------------------------------------------
export default function IdePage() {
  const { theme, isDark, toggleTheme } = useTheme();
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
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(1);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isAssembled, setIsAssembled] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [canStepBack, setCanStepBack] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);
  const [errorLines, setErrorLines] = useState<{ line: number; message: string }[]>([]);
  const [valueFormat, setValueFormat] = useState<ValueFormat>('hex');
  const [runSpeed, setRunSpeed] = useState(4);
  const runTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // TEMP: login disabled
  // useState(() => !!getAuthToken())`
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [closedFileNames, setClosedFileNames] = useState<Set<string>>(new Set());
  const [initialToolState] = useState(readInitialToolState);
  const [enabledToolIds, setEnabledToolIds] = useState<ToolId[]>(initialToolState.enabledToolIds);
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(initialToolState.activeToolId);
  const [activeSidebarView, setActiveSidebarView] = useState<SidebarView>(initialToolState.activeToolId ?? 'files');
  const [mobileView, setMobileView] = useState<MobileView>(initialToolState.activeToolId ?? 'editor');

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem('sidebar_open'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try { const v = localStorage.getItem('sidebar_width'); return v ? Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Number(v))) : SIDEBAR_DEFAULT_WIDTH; } catch { return SIDEBAR_DEFAULT_WIDTH; }
  });
  const [registerEditable, setRegisterEditable] = useState(false);
  const [memoryEditable, setMemoryEditable] = useState(false);
  const [instrStats, setInstrStats] = useState<InstrStats | null>(null);
  const [pseudoExpansion, setPseudoExpansion] = useState<PseudoExpansionInfo | null>(null);
  const [pseudoExpansionAddress, setPseudoExpansionAddress] = useState<number | null>(null);
  const [simTick, setSimTick] = useState(0);
  const stepHistoryRef = useRef<StepHistoryEntry[]>([]);
  const [fontSize, setFontSize] = useState<number>(() => {
    try { const v = localStorage.getItem('editor_font_size'); return v ? Math.max(10, Math.min(24, Number(v))) : 15; } catch { return 15; }
  });
  const [tabSize, setTabSize] = useState<2 | 4>(() => {
    try { const v = localStorage.getItem('editor_tab_size'); return v === '2' ? 2 : 4; } catch { return 4; }
  });
  const [showHotkeys, setShowHotkeys] = useState<boolean>(() => {
    try { const v = localStorage.getItem('show_hotkeys'); return v === null ? false : v === 'true'; } catch { return false; }
  });
  const [showPseudoPopups, setShowPseudoPopups] = useState<boolean>(() => {
    try { const v = localStorage.getItem('show_pseudo_popups'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'run' | 'help' | 'settings' | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const [explorerAction, setExplorerAction] = useState<{ type: 'new-file' | 'new-folder'; nonce: number } | null>(null);

  const prevRegistersRef = useRef<RegisterValue[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeEditorRef = useRef<CodeEditorHandle | null>(null);
  const [changedRegisters, setChangedRegisters] = useState<Set<string>>(new Set());

  const [editorHeightPct, setEditorHeightPct] = useState(70);

  const isWide = typeof window !== 'undefined' && window.innerWidth >= 900;
  const [wide, setWide] = useState(isWide);
  const prevWideRef = useRef(isWide);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const getLastSteppedLine = () => {
    const history = stepHistoryRef.current;
    return history.length > 0 ? history[history.length - 1].line : null;
  };

  const getLastStepPc = () => {
    const history = stepHistoryRef.current;
    return history.length > 0 ? history[history.length - 1].pc : null;
  };

  const enabledTools = useMemo(
    () => TOOL_DEFINITIONS.filter(tool => enabledToolIds.includes(tool.id)),
    [enabledToolIds],
  );

  const firstEnabledToolId = enabledTools[0]?.id ?? null;
  const visibleToolId = wide
    ? activeSidebarView !== 'files' && activeSidebarView !== 'tool-library'
      ? activeSidebarView
      : null
    : mobileView !== 'files' && mobileView !== 'editor' && mobileView !== 'console' && mobileView !== 'tool-library'
      ? mobileView
      : null;

  useEffect(() => {
    setActiveToolId(current => {
      if (visibleToolId) return visibleToolId;
      if (current && enabledToolIds.includes(current)) return current;
      return null;
    });
  }, [enabledToolIds, visibleToolId]);

  useEffect(() => {
    setMobileView(current => {
      if (current === 'files' || current === 'editor' || current === 'console' || current === 'tool-library') return current;
      return enabledToolIds.includes(current) ? current : 'editor';
    });
  }, [enabledToolIds]);

  useEffect(() => {
    setActiveSidebarView(current => {
      if (current === 'files' || current === 'tool-library') return current;
      return enabledToolIds.includes(current) ? current : (firstEnabledToolId ?? 'files');
    });
  }, [enabledToolIds, firstEnabledToolId]);

  useEffect(() => {
    if (prevWideRef.current === wide) return;
    prevWideRef.current = wide;

    if (wide) {
      if (mobileView === 'files' || mobileView === 'tool-library') {
        setActiveSidebarView(mobileView);
        return;
      }
      if (mobileView !== 'editor' && mobileView !== 'console' && enabledToolIds.includes(mobileView)) {
        setActiveSidebarView(mobileView);
      }
      return;
    }

    if (activeSidebarView === 'files' || activeSidebarView === 'tool-library') {
      setMobileView(activeSidebarView);
      return;
    }
    if (enabledToolIds.includes(activeSidebarView)) {
      setMobileView(activeSidebarView);
    }
  }, [activeSidebarView, enabledToolIds, mobileView, wide]);

  const { status: saveStatus, lastSavedAt, scheduleSave, flushNow, markSaved } = useAutosave({
    tabsRef,
    isLoggedIn,
    setTabs,
    setIsLoggedIn,
    apiBase: API_BASE,
  });

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current);
    if (runTimerRef.current !== null) clearTimeout(runTimerRef.current);
  }, []);

  useEffect(() => { try { localStorage.setItem('sidebar_open',       String(sidebarOpen));      } catch {} }, [sidebarOpen]);
  useEffect(() => { try { localStorage.setItem('sidebar_width',      String(sidebarWidth));      } catch {} }, [sidebarWidth]);
  useEffect(() => { try { localStorage.setItem(ENABLED_TOOLS_KEY, JSON.stringify(enabledToolIds)); } catch {} }, [enabledToolIds]);
  useEffect(() => {
    try {
      if (activeToolId) localStorage.setItem(ACTIVE_TOOL_KEY, activeToolId);
      else localStorage.removeItem(ACTIVE_TOOL_KEY);
    } catch {}
  }, [activeToolId]);
  useEffect(() => { try { localStorage.setItem('editor_font_size',   String(fontSize));           } catch {} }, [fontSize]);
  useEffect(() => { try { localStorage.setItem('editor_tab_size',    String(tabSize));            } catch {} }, [tabSize]);
  useEffect(() => { try { localStorage.setItem('show_hotkeys',       String(showHotkeys));        } catch {} }, [showHotkeys]);
  useEffect(() => { try { localStorage.setItem('show_pseudo_popups', String(showPseudoPopups));   } catch {} }, [showPseudoPopups]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const handlePointer = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openMenu]);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? null, [tabs, activeTabId]);
  const activeCode = activeTab?.code ?? '';
  const isDocsTab = activeTab?.kind === 'docs';
  const canEditActiveTab = activeTab != null && !isDocsTab;

  const clearDerivedSimMetadata = () => {
    setInstrStats(null);
    setPseudoExpansion(null);
  };

  const makeDocsTab = useCallback((id = DOCS_TAB_ID): CodeTab => ({
    id,
    name: DOCS_TAB_NAME,
    code: '',
    kind: 'docs',
    isDirty: false,
  }), []);

  const openDocsTab = useCallback((alwaysNew = false) => {
    const docId = alwaysNew ? `${DOCS_TAB_ID}-${Date.now()}` : DOCS_TAB_ID;
    setTabs(prev => {
      if (!alwaysNew) {
        const existing = prev.find(tab => tab.kind === 'docs' && tab.id === DOCS_TAB_ID);
        if (existing) return prev;
      }
      return [...prev, makeDocsTab(docId)];
    });
    setActiveTabId(docId);
    setOpenMenu(null);
  }, [makeDocsTab]);

  const setActiveCode = useCallback((code: string) => {
    if (!canEditActiveTab) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, code, isDirty: true } : t));
    setIsAssembled(false);
    setErrorLines([]);
    clearDerivedSimMetadata();
  }, [activeTabId, canEditActiveTab]);

  // Reset assembled state and error markers when switching tabs
  useEffect(() => {
    setIsAssembled(false);
    setErrorLines([]);
    setCursorLine(1);
    clearDerivedSimMetadata();
  }, [activeTabId]);

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

  const applyState = (
    state: ReturnType<typeof getState>,
    options?: { activeLineOverride?: number | null; pseudoExpansionAddressOverride?: number | null },
  ) => {
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
    setActiveLine(options && 'activeLineOverride' in options ? options.activeLineOverride ?? null : state.lineNumber);
    setIsWaiting(state.isWaiting);
    setCanStepBack(state.canUndo);
    setIsTerminated(state.terminated);
    setInstrStats(getInstructionStats());
    const pseudoAddress = options && 'pseudoExpansionAddressOverride' in options
      ? options.pseudoExpansionAddressOverride ?? null
      : state.pc;
    setPseudoExpansionAddress(pseudoAddress);
    setPseudoExpansion(pseudoAddress == null ? null : getPseudoExpansion(pseudoAddress));
    setSimTick(t => t + 1);
  };

  const handleAssemble = () => {
    if (!canEditActiveTab) return;
    stopAutoRun();
    resetSim();
    setActiveLine(null);
    setIsWaiting(false);
    setChangedRegisters(new Set());
    prevRegistersRef.current = [];
    stepHistoryRef.current = [];
    const result = assemble(activeCode);
    if (!result.ok) {
      setOutput(`Assembly failed:\n${result.error}`);
      setIsAssembled(false);
      setErrorLines(result.errors.filter(e => !e.isWarning).map(e => ({ line: e.lineNumber, message: e.message })));
      clearDerivedSimMetadata();
    } else {
      setIsAssembled(true);
      setErrorLines([]);
      applyState(getState(), { activeLineOverride: null, pseudoExpansionAddressOverride: null });
    }
  };

  const handleRun = () => {
    stopAutoRun();
    stepHistoryRef.current = [];
    if (runSpeed === 4) {
      applyState(runSim(Array.from(breakpoints)), { pseudoExpansionAddressOverride: null });
    } else {
      startTimedRun(true);
    }
  };

  const stopAutoRun = () => {
    if (runTimerRef.current !== null) clearTimeout(runTimerRef.current);
    runTimerRef.current = null;
  };

  const startTimedRun = (fresh: boolean) => {
    stopAutoRun();
    const delay = runSpeed === 0 ? 650 : runSpeed === 1 ? 350 : runSpeed === 2 ? 160 : 45;
    const batch = runSpeed === 3 ? 5 : 1;
    let first = true;
    const tick = () => {
      const state = fresh && first
        ? runSimWithLimit(batch, Array.from(breakpoints))
        : runWithLimit(batch, Array.from(breakpoints));
      first = false;
      applyState(state, { pseudoExpansionAddressOverride: null });
      if (state.terminated || state.isWaiting) {
        stopAutoRun();
        return;
      }
      runTimerRef.current = setTimeout(tick, delay);
    };
    runTimerRef.current = setTimeout(tick, delay);
  };

  const handleContinue = () => {
    stopAutoRun();
    stepHistoryRef.current = [];
    if (runSpeed === 4) {
      applyState(continueSim(Array.from(breakpoints)), { pseudoExpansionAddressOverride: null });
    } else {
      startTimedRun(false);
    }
  };

  const handleStep = () => {
    stopAutoRun();
    const beforeState = getState();
    const currentLine = getSourceLineForAddress(beforeState.pc) ?? beforeState.lineNumber;
    const state = stepSim();
    if (currentLine != null) stepHistoryRef.current.push({ line: currentLine, pc: beforeState.pc });
    applyState(state, {
      activeLineOverride: getLastSteppedLine(),
      pseudoExpansionAddressOverride: getLastStepPc(),
    });
  };

  const handleStepBack = () => {
    stopAutoRun();
    stepHistoryRef.current.pop();
    const state = stepBackSim();
    applyState(state, {
      activeLineOverride: getLastSteppedLine(),
      pseudoExpansionAddressOverride: getLastStepPc(),
    });
  };

  const handleReset = () => {
    stopAutoRun();
    resetSim();
    setRegisters(buildInitialRegisters());
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setChangedRegisters(new Set());
    prevRegistersRef.current = [];
    stepHistoryRef.current = [];
    setOutput('');
    setActiveLine(null);
    setIsWaiting(false);
    setIsAssembled(false);
    setCanStepBack(false);
    setIsTerminated(false);
    clearDerivedSimMetadata();
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
    stepHistoryRef.current = [];
    const state = feedInput(value);
    applyState(state, { pseudoExpansionAddressOverride: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegisterEdit = (name: string, value: number) => {
    applyState(setRegisterValue(name, value));
  };

  const handleMemoryEdit = (address: number, value: number) => {
    applyState(setMemoryWord(address, value));
  };

  const handleSaveLocal = () => {
    flushNow();
    if (isLoggedIn) setOutput('Saved to account.');
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

      // Browser-level editor shortcuts: keep the user's focus in the file and
      // route find/replace/navigation to Monaco instead of the browser.
      if (metaOrCtrl && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H' || e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'f' || e.key === 'F') codeEditorRef.current?.find();
        else if (e.key === 'h' || e.key === 'H') codeEditorRef.current?.replace();
        else codeEditorRef.current?.gotoLine();
        return;
      }

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
        case 'F5':
          if (isAssembled && !isTerminated && !canStepBack && !isWaiting) {
            e.preventDefault();
            handleRun();
          }
          break;
        case 'F8':
          if (isAssembled && !isTerminated && canStepBack) {
            e.preventDefault();
            handleContinue();
          }
          break;
        case 'F9':
          if (isAssembled && canStepBack) {
            e.preventDefault();
            handleStepBack();
          }
          break;
        case 'F10':
          if (isAssembled && !isTerminated) {
            e.preventDefault();
            handleStep();
          }
          break;
        case 'Escape':
          if (isAssembled) {
            e.preventDefault();
            handleReset();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [canStepBack, isAssembled, isTerminated, isWaiting,
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

  const addTab = (folderPath?: string) => {
    const id = String(Date.now());
    const existingNames = new Set(tabs.map(t => t.name));
    let n = 1;
    while (existingNames.has(`file${n}.asm`)) n++;
    const newTab: CodeTab = {
      id,
      name: `file${n}.asm`,
      path: folderPath,
      code: '',
      isDirty: false,
    };
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

  const closeActiveTab = useCallback(() => {
    if (!activeTab) return;
    if (tabs.length === 1) return;
    flushNow();
    const idx = tabs.findIndex(t => t.id === activeTab.id);
    const next = tabs[idx === 0 ? 1 : idx - 1];
    setTabs(prev => prev.filter(t => t.id !== activeTab.id));
    setActiveTabId(next.id);
    setOpenMenu(null);
  }, [activeTab, flushNow, tabs]);

  const focusEditor = useCallback(() => {
    codeEditorRef.current?.focus();
    setOpenMenu(null);
  }, []);

  const triggerExplorerAction = useCallback((type: 'new-file' | 'new-folder') => {
    setActiveSidebarView('files');
    setSidebarOpen(true);
    setMobileView('files');
    setExplorerAction({ type, nonce: Date.now() });
    setOpenMenu(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Drag-to-resize
  // ---------------------------------------------------------------------------
  const startSidebarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + (ev.clientX - startX))));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleSidebarViewClick = (view: SidebarView) => {
    if (view === activeSidebarView) {
      setSidebarOpen(open => !open);
      return;
    }
    setActiveSidebarView(view);
    if (view === 'files' || view === 'tool-library') setActiveToolId(null);
    else setActiveToolId(view);
    setSidebarOpen(true);
  };

  const handleMobileViewClick = (view: MobileView) => {
    setMobileView(view);
    if (view === 'files' || view === 'editor' || view === 'console' || view === 'tool-library') setActiveToolId(null);
    else setActiveToolId(view);
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
  const runLabel = canStepBack || isWaiting ? 'Continue' : 'Run';
  const primaryDebugActions: { label: 'Run' | 'Continue' | 'Step Back' | 'Step' | 'Reset'; onPress: () => void; enabled: boolean; title: string; hotkey: string }[] = [
    { label: runLabel, onPress: runLabel === 'Continue' ? handleContinue : handleRun, enabled: isAssembled && !isTerminated, title: `${runLabel} (${runLabel === 'Continue' ? 'F8' : 'F5'})`, hotkey: runLabel === 'Continue' ? 'F8' : 'F5' },
    { label: 'Step Back', onPress: handleStepBack, enabled: isAssembled && canStepBack, title: 'Step Back (F9)', hotkey: 'F9' },
    { label: 'Step', onPress: handleStep, enabled: isAssembled && !isTerminated, title: 'Step (F10)', hotkey: 'F10' },
    { label: 'Reset', onPress: handleReset, enabled: isAssembled, title: 'Reset (Escape)', hotkey: 'Esc' },
  ];

  const simStatus =
    errorLines.length > 0 ? 'error'     as const
    : !isAssembled        ? 'idle'      as const
    : isTerminated        ? 'done'      as const
    : canStepBack || isWaiting ? 'stepping'  as const
    :                       'assembled' as const;

  const STATUS_CONFIG = {
    idle:      { label: '● Not assembled',                   color: '#f59e0b', bg: '#78350f22', border: '#92400e' },
    assembled: { label: '✓ Assembled',                       color: '#6ee7b7', bg: '#06574422', border: '#065f46' },
    stepping:  { label: '▶ Stepping',                        color: '#7dd3fc', bg: '#0c4a6e22', border: '#0c4a6e' },
    done:      { label: '◼ Done',                            color: '#94a3b8', bg: '#1e29381a', border: '#334155' },
    error:     { label: `✕ Error (${errorLines.length})`,    color: '#f87171', bg: '#7f1d1d22', border: '#7f1d1d' },
  } as const;

  const getFallbackToolId = (toolId: ToolId, nextEnabledToolIds: ToolId[]) => {
    if (nextEnabledToolIds.length === 0) return null;
    const currentIndex = TOOL_DEFINITIONS.findIndex(tool => tool.id === toolId);
    return (
      TOOL_DEFINITIONS.slice(currentIndex + 1).map(tool => tool.id).find(id => nextEnabledToolIds.includes(id)) ??
      TOOL_DEFINITIONS.slice(0, currentIndex).map(tool => tool.id).find(id => nextEnabledToolIds.includes(id)) ??
      nextEnabledToolIds[0]
    );
  };

  const toggleToolEnabled = useCallback((toolId: ToolId) => {
    const disabling = enabledToolIds.includes(toolId);
    const nextSet = new Set(enabledToolIds);
    if (disabling) nextSet.delete(toolId);
    else nextSet.add(toolId);
    const nextEnabledToolIds = TOOL_DEFINITIONS.map(tool => tool.id).filter(id => nextSet.has(id));
    const fallbackToolId = getFallbackToolId(toolId, nextEnabledToolIds);

    setEnabledToolIds(nextEnabledToolIds);
    if (disabling) {
      setActiveSidebarView(prev => (prev === toolId ? (fallbackToolId ?? 'files') : prev));
      setMobileView(prev => (prev === toolId ? (fallbackToolId ?? 'editor') : prev));
      setActiveToolId(prev => (prev === toolId ? fallbackToolId : prev));
    }
  }, [enabledToolIds]);

  const renderToolPanel = (toolId: ToolId): React.ReactNode => {
    switch (toolId) {
      case 'registers':
        return (
          <RegisterPanel
            registers={registers}
            theme={theme}
            valueFormat={valueFormat}
            setValueFormat={setValueFormat}
            editable={registerEditable}
            onToggleEditable={() => setRegisterEditable(v => !v)}
            changedRegisters={changedRegisters}
            onRegisterEdit={handleRegisterEdit}
            tick={simTick}
          />
        );
      case 'memory':
        return (
          <MemoryView
            tick={simTick}
            theme={theme}
            valueFormat={valueFormat}
            setValueFormat={setValueFormat}
            editable={memoryEditable}
            onToggleEditable={() => setMemoryEditable(v => !v)}
            onMemoryEdit={handleMemoryEdit}
          />
        );
      case 'display':
        return <DisplayPanel theme={theme} simTick={simTick} />;
      case 'program':
        return <SidebarPanelFrame><ProgramPanel tick={simTick} theme={theme} /></SidebarPanelFrame>;
      case 'performance':
        return <SidebarPanelFrame><PerformancePanel tick={simTick} theme={theme} stats={instrStats} /></SidebarPanelFrame>;
    }
    const _exhaustive: never = toolId;
    return _exhaustive;
  };

  // File toolbar: Save + import/export

  const vDragHandle = (
    <div className="ide-editor-handle" onMouseDown={startEditorVDrag} />
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!ready) return <IdeSkeleton theme={theme} />;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const saveHotkey = isMac ? '⌘S' : 'Ctrl+S';
  const assembleKey = isMac ? '⌘ Enter' : 'Ctrl+Enter';
  const toolBarDivider = <div style={{ width: 1, height: 14, backgroundColor: theme.border, flexShrink: 0 }} />;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: theme.bg, overflow: 'hidden',
      '--ide-ink': theme.text,
      '--ide-card': theme.card,
      '--ide-hover': isDark ? '#334155' : 'rgba(0,0,0,0.07)',
      '--ide-border': theme.border,
      '--ide-active-icon': isDark ? '#7dd3fc' : '#1d4ed8',
      '--ide-icon-hover': isDark ? '#94a3b8' : '#1e293b',
    } as React.CSSProperties}>
      {/* Top bar */}
      {wide ? (
        <>
          <div className="ide-titlebar" style={{ flexShrink: 0 }}>
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <Logo size={15} gap={4} textSize={11} />
            </div>
            <div ref={menuBarRef} className="ide-menubar" style={{ flexShrink: 0 }}>
              {([
                { key: 'file', label: 'File' },
                { key: 'edit', label: 'Edit' },
                { key: 'run', label: 'Run' },
                { key: 'help', label: 'Help' },
                { key: 'settings', label: 'Settings' },
              ] as const).map(menu => (
                <div key={menu.key} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(current => current === menu.key ? null : menu.key)}
                    style={{
                      height: 24,
                      padding: '0 8px',
                      borderRadius: 0,
                      border: `1px solid ${openMenu === menu.key ? theme.border : 'transparent'}`,
                      backgroundColor: openMenu === menu.key ? (isDark ? '#334155' : '#e2e8f0') : 'transparent',
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                    }}
                  >
                    {menu.label}
                  </button>
                  {openMenu === menu.key && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: menu.key === 'run' || menu.key === 'settings' ? 220 : 180,
                      backgroundColor: theme.card,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 0,
                      boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
                      padding: 4,
                      zIndex: 1000,
                    }}>
                      {menu.key === 'file' && [
                        { label: 'New File', action: () => triggerExplorerAction('new-file'), disabled: false },
                        { label: 'New Folder', action: () => triggerExplorerAction('new-folder'), disabled: false },
                        { label: 'Import File...', action: handleUpload, disabled: false },
                        { label: 'Export Active File', action: handleDownload, disabled: !activeTab || isDocsTab },
                        { label: 'Close Active Tab', action: closeActiveTab, disabled: tabs.length <= 1 || !activeTab },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          disabled={item.disabled}
                          onClick={() => {
                            if (item.disabled) return;
                            item.action();
                            setOpenMenu(null);
                          }}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            color: item.disabled ? theme.subText : theme.text,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            borderRadius: 0,
                            padding: '6px 8px',
                            fontSize: 12,
                            opacity: item.disabled ? 0.45 : 1,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                      {menu.key === 'edit' && [
                        { label: 'Focus Editor', action: focusEditor, disabled: !canEditActiveTab },
                        { label: 'Find', action: () => codeEditorRef.current?.find(), disabled: !canEditActiveTab },
                        { label: 'Replace', action: () => codeEditorRef.current?.replace(), disabled: !canEditActiveTab },
                        { label: 'Go to Line', action: () => codeEditorRef.current?.gotoLine(), disabled: !canEditActiveTab },
                        { label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', action: () => setSidebarOpen(v => !v), disabled: false },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          disabled={item.disabled}
                          onClick={() => {
                            if (item.disabled) return;
                            item.action();
                            setOpenMenu(null);
                          }}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            color: item.disabled ? theme.subText : theme.text,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            borderRadius: 0,
                            padding: '6px 8px',
                            fontSize: 12,
                            opacity: item.disabled ? 0.45 : 1,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                      {menu.key === 'run' && (
                        <>
                          {[
                            { label: 'Assemble', action: handleAssemble, disabled: !canEditActiveTab || isWaiting },
                            { label: runLabel, action: runLabel === 'Continue' ? handleContinue : handleRun, disabled: !isAssembled || isTerminated },
                            { label: 'Step Back', action: handleStepBack, disabled: !isAssembled || !canStepBack },
                            { label: 'Step', action: handleStep, disabled: !isAssembled || isTerminated },
                            { label: 'Reset', action: handleReset, disabled: !isAssembled },
                          ].map(item => (
                            <button
                              key={item.label}
                              type="button"
                              disabled={item.disabled}
                              onClick={() => {
                                if (item.disabled) return;
                                item.action();
                                setOpenMenu(null);
                              }}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                            color: item.disabled ? theme.subText : theme.text,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            borderRadius: 0,
                            padding: '6px 8px',
                            fontSize: 12,
                            opacity: item.disabled ? 0.45 : 1,
                          }}
                        >
                              {item.label}
                            </button>
                          ))}
                          <div style={{ height: 1, backgroundColor: theme.border, margin: '6px 4px' }} />
                          <div style={{ padding: '4px 10px 2px', color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Speed
                          </div>
                          <div style={{ padding: '4px 10px 8px' }}>
                            <RunSpeedControl theme={theme} runSpeed={runSpeed} setRunSpeed={setRunSpeed} isTerminated={isTerminated} showLabel={false} />
                          </div>
                        </>
                      )}
                      {menu.key === 'help' && [
                        { label: 'Open Docs', action: () => openDocsTab(false) },
                        { label: 'Standalone Docs Page', action: () => window.open('/docs', '_blank', 'noopener,noreferrer') },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            item.action();
                            setOpenMenu(null);
                          }}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            color: theme.text,
                            cursor: 'pointer',
                            textAlign: 'left',
                            borderRadius: 0,
                            padding: '6px 8px',
                            fontSize: 12,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                      {menu.key === 'settings' && (
                        <div style={{ padding: '6px 8px' }}>
                          <SettingsPanel
                            theme={theme}
                            isDark={isDark}
                            toggleTheme={toggleTheme}
                            fontSize={fontSize}
                            setFontSize={setFontSize}
                            tabSize={tabSize}
                            setTabSize={setTabSize}
                            showPseudoPopups={showPseudoPopups}
                            setShowPseudoPopups={setShowPseudoPopups}
                            showHotkeys={showHotkeys}
                            setShowHotkeys={setShowHotkeys}
                            runSpeed={runSpeed}
                            setRunSpeed={setRunSpeed}
                            isTerminated={isTerminated}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => flushNow()} compact />
              <SaveAction onClick={handleSaveLocal} hotkey={saveHotkey} showHotkeys={showHotkeys} />
              <button
                type="button"
                onClick={handleUpload}
                title="Import file"
                aria-label="Import file"
                style={{
                  background: isDark ? '#1e293b' : '#f8fafc',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  cursor: 'pointer',
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  color: theme.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <ActionIcon name="Import" size={12} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                title="Export active file"
                aria-label="Export active file"
                disabled={!activeTab || isDocsTab}
                style={{
                  background: isDark ? '#1e293b' : '#f8fafc',
                  border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                  cursor: !activeTab || isDocsTab ? 'not-allowed' : 'pointer',
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  color: !activeTab || isDocsTab ? theme.subText : theme.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  opacity: !activeTab || isDocsTab ? 0.5 : 1,
                }}
              >
                <ActionIcon name="Export" size={12} />
              </button>
              <Link to="/docs" className="ide-nav-link" style={{ color: theme.subText, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Docs</Link>
              <ThemeSwitch />
            </div>
            <div ref={settingsRef} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSettingsOpen(o => !o)}
                title="Settings"
                aria-label="Settings"
                aria-expanded={settingsOpen}
                className="ide-settings-btn"
                style={{
                  background: settingsOpen ? '#2563eb22' : (isDark ? '#1e293b' : '#f8fafc'),
                  border: `1px solid ${settingsOpen ? '#2563eb' : (isDark ? '#475569' : '#cbd5e1')}`,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: 0,
                  color: settingsOpen ? '#2563eb' : theme.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                  boxShadow: settingsOpen ? '0 0 0 1px #2563eb22' : '0 1px 2px rgba(0,0,0,0.12)',
                }}
              >
                <ActionIcon name="Settings" size={14} />
              </button>
              {settingsOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 0,
                  padding: '8px 10px',
                  width: 250,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                  zIndex: 1000,
                }}>
                  <SettingsPanel
                    theme={theme}
                    isDark={isDark}
                    toggleTheme={toggleTheme}
                    fontSize={fontSize}
                    setFontSize={setFontSize}
                    tabSize={tabSize}
                    setTabSize={setTabSize}
                    showPseudoPopups={showPseudoPopups}
                    setShowPseudoPopups={setShowPseudoPopups}
                    showHotkeys={showHotkeys}
                    setShowHotkeys={setShowHotkeys}
                    runSpeed={runSpeed}
                    setRunSpeed={setRunSpeed}
                    isTerminated={isTerminated}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="ide-tabbar" style={{ flexShrink: 0 }}>
            <div
              className="tab-scroll"
              role="tablist"
              aria-label="Editor files"
              style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}
            >
              <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', width: 'max-content', height: 33 }}>
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
                      padding: '0 9px',
                      borderRadius: 0,
                      backgroundColor: tab.id === activeTabId ? theme.bg : theme.tabInactive,
                      borderLeft: `1px solid ${theme.border}`,
                      borderRight: `1px solid ${theme.border}`,
                      cursor: 'pointer',
                      flexShrink: 0,
                      maxWidth: 180,
                      fontFamily: 'inherit',
                      color: tab.id === activeTabId ? theme.text : theme.subText,
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
                        style={{ width: 90, backgroundColor: 'transparent', border: 'none', outline: 'none', color: theme.text, fontSize: 11 }}
                      />
                    ) : (
                      <span
                        onDoubleClick={e => tab.kind === 'docs' ? undefined : startRename(tab, e)}
                        style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 92 }}
                      >
                        {tab.name}{tab.isDirty ? ' •' : ''}
                      </span>
                    )}
                    {tabs.length > 1 && (
                      <button
                        type="button"
                        onClick={e => closeTab(tab.id, e)}
                        aria-label={`Close ${tab.name}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 13, lineHeight: 1, padding: 2, flexShrink: 0 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => addTab()}
              aria-label="New tab"
              className="ide-new-tab"
              style={{ background: 'none', border: 'none', color: theme.subText, cursor: 'pointer', width: 24, height: 24, fontSize: 15, flexShrink: 0 }}
            >
              +
            </button>
          </div>

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
            <button
              type="button"
              onClick={canEditActiveTab && !isWaiting ? handleAssemble : undefined}
              title="Assemble (Ctrl+Enter)"
              aria-label="Assemble"
              className="ide-action-btn ide-active"
              style={{
                backgroundColor: canEditActiveTab ? '#2563eb' : theme.card,
                border: 'none',
                borderRadius: 6,
                color: canEditActiveTab ? '#fff' : theme.subText,
                cursor: canEditActiveTab ? 'pointer' : 'not-allowed',
                opacity: canEditActiveTab ? 1 : 0.55,
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
              {showHotkeys && (
                <span style={{
                  fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                  color: '#1e3a8a',
                  backgroundColor: '#ffffff',
                  padding: '2px 6px', borderRadius: 4,
                  lineHeight: '16px', marginLeft: 4, flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                }}>{assembleKey}</span>
              )}
            </button>
            {toolBarDivider}

            {primaryDebugActions.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.enabled ? a.onPress : undefined}
                title={a.title}
                aria-label={a.label}
                aria-disabled={!a.enabled}
                className="ide-action-btn"
                style={{
                  backgroundColor: (a.label === 'Run' || a.label === 'Continue') && isAssembled ? '#16a34a18' : 'transparent',
                  border: `1px solid ${(a.label === 'Run' || a.label === 'Continue') && isAssembled ? '#16a34a55' : 'transparent'}`,
                  borderRadius: 5,
                  color: (a.label === 'Run' || a.label === 'Continue') && isAssembled
                    ? (a.enabled ? '#16a34a' : '#86efac')
                    : (a.enabled ? theme.text : theme.subText),
                  cursor: a.enabled ? 'pointer' : 'not-allowed',
                  height: 28,
                  padding: '0 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
              >
                <ActionIcon name={a.label} size={13} />
                <span>{a.label}</span>
                {showHotkeys && (
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', fontWeight: 800,
                    color: a.enabled ? theme.text : theme.subText,
                    padding: '1px 6px', borderRadius: 4,
                    border: `1px solid ${a.enabled ? theme.text + '66' : theme.border}`,
                    backgroundColor: a.enabled ? theme.bg : theme.card,
                    lineHeight: '14px', marginLeft: 1, flexShrink: 0,
                    boxShadow: a.enabled ? '0 1px 1px rgba(0,0,0,0.08)' : 'none',
                  }}>{a.hotkey}</span>
                )}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {toolBarDivider}
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
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 17, flexShrink: 0 }}><Logo size={20} gap={5} textSize={12} /></div>
            <div style={{ flex: 1 }} />
            <div style={{ marginRight: 8 }}>
              <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => flushNow()} compact />
            </div>
            <SaveAction onClick={handleSaveLocal} hotkey={saveHotkey} showHotkeys={showHotkeys} />
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
              { label: 'Assemble',  onPress: handleAssemble,  disabled: !canEditActiveTab || isWaiting },
              { label: runLabel,    onPress: runLabel === 'Continue' ? handleContinue : handleRun, disabled: !isAssembled || isTerminated },
              { label: 'Step Back', onPress: handleStepBack,  disabled: !isAssembled || !canStepBack },
              { label: 'Step',      onPress: handleStep,      disabled: !isAssembled || isTerminated },
              { label: 'Reset',     onPress: handleReset,     disabled: !isAssembled },
            ].map(a => {
              const isAssemble = a.label === 'Assemble';
              const isRunAction = a.label === 'Run' || a.label === 'Continue';
              const isDisabled = Boolean(a.disabled);
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={isDisabled ? undefined : a.onPress}
                  title={a.label}
                  aria-label={a.label}
                  disabled={isDisabled}
                  className={`ide-action-btn${isAssemble ? ' ide-active' : ''}`}
                  style={{
                    backgroundColor: isAssemble ? '#2563eb' : isRunAction && isAssembled ? '#16a34a18' : theme.card,
                    border: `1px solid ${isAssemble ? '#2563eb' : isRunAction && isAssembled ? '#16a34a55' : theme.border}`,
                    borderRadius: 6,
                    color: isAssemble ? '#fff' : isRunAction && isAssembled ? '#16a34a' : theme.text,
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
                  borderRadius: 6,
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
        <div
          className="tab-scroll"
          role="tablist"
          aria-label="IDE views"
          style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, flexShrink: 0, overflowX: 'auto' }}
        >
          {(['files', 'editor', 'console', 'tool-library'] as const).map(view => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => handleMobileViewClick(view)}
              style={{
                flex: view === 'editor' ? 1 : '0 0 auto',
                padding: '10px 0',
                minWidth: 88,
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
              {view === 'tool-library' ? 'Tools' : view}
            </button>
          ))}
          {enabledTools.map(tool => (
            <button
              key={tool.id}
              type="button"
              role="tab"
              aria-selected={mobileView === tool.id}
              onClick={() => handleMobileViewClick(tool.id)}
              style={{
                flex: '0 0 auto',
                padding: '10px 0',
                minWidth: 88,
                minHeight: 48,
                backgroundColor: mobileView === tool.id ? theme.tabActive : theme.tabInactive,
                border: 'none',
                borderRight: `1px solid ${theme.border}`,
                color: mobileView === tool.id ? theme.text : theme.subText,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}
      {!wide && enabledTools.length === 0 && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, color: theme.subText, fontSize: 11 }}>
          No tools enabled. Use the Tools tab to re-enable sidebar tools.
        </div>
      )}

      {/* Main layout */}
      {wide ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* Activity bar */}
          <div className="ide-activity-bar">
            <button
              type="button"
              className={`ide-activity-icon${activeSidebarView === 'files' && sidebarOpen ? ' ide-activity-icon--active' : ''}`}
              onClick={() => handleSidebarViewClick('files')}
              title="Files"
              aria-label="Files"
              aria-pressed={activeSidebarView === 'files' && sidebarOpen}
            >
              <ActionIcon name="Files" size={18} />
              <span>Files</span>
            </button>

            {enabledTools.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={`ide-activity-icon${activeSidebarView === tool.id && sidebarOpen ? ' ide-activity-icon--active' : ''}`}
                onClick={() => handleSidebarViewClick(tool.id)}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={activeSidebarView === tool.id && sidebarOpen}
              >
                <ActionIcon name={tool.icon} size={18} />
                <span>{tool.label}</span>
              </button>
            ))}

            <div style={{ flex: 1 }} />

            <button
              type="button"
              className={`ide-activity-icon${activeSidebarView === 'tool-library' && sidebarOpen ? ' ide-activity-icon--active' : ''}`}
              onClick={() => handleSidebarViewClick('tool-library')}
              title="Manage Tools"
              aria-label="Manage Tools"
              aria-pressed={activeSidebarView === 'tool-library' && sidebarOpen}
            >
              <ActionIcon name="Tools" size={18} />
              <span>Tools</span>
            </button>
          </div>

          {/* Sidebar panel (hidden when collapsed) */}
          {sidebarOpen && (
            <>
              <div className="ide-sidebar" style={{ width: sidebarWidth }}>
                <div className="ide-sidebar-header">
                  {(activeSidebarView === 'files'
                    ? 'FILES'
                    : activeSidebarView === 'tool-library'
                      ? 'TOOL LIBRARY'
                      : TOOL_DEFINITIONS.find(tool => tool.id === activeSidebarView)?.title.toUpperCase()) ?? 'TOOLS'}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {activeSidebarView === 'files' && <FileExplorer theme={theme} isLoggedIn={isLoggedIn} tabs={tabs} setTabs={setTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} removeTabLocally={removeTabLocally} onFilesLoaded={setClosedFileNames} onUpload={handleUpload} onDownload={handleDownload} externalAction={explorerAction} />}
                  {activeSidebarView === 'tool-library' && <ToolLibraryPanel theme={theme} enabledToolIds={enabledToolIds} onToggleTool={toggleToolEnabled} />}
                  {activeSidebarView !== 'files' && activeSidebarView !== 'tool-library' && renderToolPanel(activeSidebarView)}
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
              ) : isDocsTab ? (
                <DocsTabPanel theme={theme} />
              ) : (
                <>
                  {showPseudoPopups && <PseudoExpansionNotice theme={theme} pseudoExpansion={pseudoExpansion} pseudoExpansionAddress={pseudoExpansionAddress} />}
                  <CodeEditor ref={codeEditorRef} code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} cursorLine={cursorLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} onCursorLineChange={setCursorLine} errorLines={errorLines} onAssemble={handleAssemble} onToggleSidebar={() => setSidebarOpen(o => !o)} fontSize={fontSize} tabSize={tabSize} />
                </>
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
          {mobileView === 'files' && <FileExplorer theme={theme} isLoggedIn={isLoggedIn} tabs={tabs} setTabs={setTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} removeTabLocally={removeTabLocally} onFilesLoaded={setClosedFileNames} onUpload={handleUpload} onDownload={handleDownload} externalAction={explorerAction} />}
          {mobileView === 'editor' && (
            <>
              {isDocsTab ? (
                <DocsTabPanel theme={theme} />
              ) : (
                <>
                  {showPseudoPopups && <PseudoExpansionNotice theme={theme} pseudoExpansion={pseudoExpansion} pseudoExpansionAddress={pseudoExpansionAddress} />}
                  <CodeEditor ref={codeEditorRef} code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} cursorLine={cursorLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} onCursorLineChange={setCursorLine} onAssemble={handleAssemble} fontSize={fontSize} tabSize={tabSize} />
                </>
              )}
            </>
          )}
          {mobileView === 'console' && (
            <ConsolePanel
              output={output}
              isWaiting={isWaiting}
              onSubmit={handleFeedInput}
              theme={theme}
            />
          )}
          {mobileView === 'tool-library' && <ToolLibraryPanel theme={theme} enabledToolIds={enabledToolIds} onToggleTool={toggleToolEnabled} />}
          {mobileView !== 'files' && mobileView !== 'editor' && mobileView !== 'console' && mobileView !== 'tool-library' && renderToolPanel(mobileView)}
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
