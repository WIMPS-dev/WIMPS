import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionIcon } from '../components/ActionIcons';
import { BitmapDisplay } from '../components/BitmapDisplay';
import type { CodeEditorHandle } from '../components/CodeEditor';
import { CodeEditor } from '../components/CodeEditor';
import { FileExplorer } from '../components/FileExplorer';
import { Logo } from '../components/Logo';
import { PerformancePanel, ProgramPanel } from '../components/MarsParityPanels';
import { MemoryView } from '../components/MemoryView';
import { IdeSkeleton } from '../components/PageSkeletons';
import { RegisterPanel, RegisterValue } from '../components/RegisterPanel';
import { SaveAction } from '../components/SaveStatus';
import { usePageReady } from '../components/Skeleton';
import { useTheme } from '../context/ThemeContext';
import { clearAuthToken, getApiHeaders, getAuthToken, uniquifyName } from '../helpers/authStorage';
import { normalizeTab, readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';
import { useAutosave } from '../hooks/useAutosave';
import type { InstrStats, PseudoExpansionInfo, ValueFormat } from '../simulator/useMips';
import { assemble, continueSim, feedInput, getCurrentPseudoExpansionRows, getInstructionStats, getPseudoExpansion, getSourceLineForAddress, getState, resetSim, runSim, runSimWithLimit, runWithLimit, setMemoryWord, setRegisterValue, stepBackSim, stepSim } from '../simulator/useMips';
import { getIdeChromeVars } from '../theme/ideChrome';
import type { CodeTab } from '../types';
import { DocsContent } from './DocsPage';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

type RailControl = 'files' | 'tool-library';
type ToolId = 'registers' | 'memory' | 'display' | 'program' | 'performance';
type SidebarView = RailControl | ToolId;
type MobileView = 'files' | 'editor' | 'console' | 'tool-library' | ToolId;
type ConsoleTab = 'program' | 'activity';

type ToolDefinition = {
  id: ToolId;
  label: string;
  title: string;
  icon: string;
  defaultEnabled: boolean;
  description: string;
};

type CommandEntry = {
  label: string;
  keywords: string;
  section: string;
  disabled: boolean;
  action: () => void;
  hotkey?: string;
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: 'registers', label: 'Registers', title: 'Registers', icon: 'Regs', defaultEnabled: true, description: 'General-purpose registers, PC, HI, LO, and flags.' },
  { id: 'memory', label: 'Memory', title: 'Memory', icon: 'Memory', defaultEnabled: true, description: 'Memory inspector and word editor.' },
  { id: 'display', label: 'Bitmap Display', title: 'Bitmap Display', icon: 'Bitmap', defaultEnabled: false, description: 'Bitmap display viewer.' },
  { id: 'program', label: 'Program', title: 'Program', icon: 'Segments', defaultEnabled: false, description: 'Instruction and label views.' },
  { id: 'performance', label: 'Analysis', title: 'Analysis', icon: 'Stats', defaultEnabled: false, description: 'Instruction counts and cache analysis.' },
];

const DEFAULT_ENABLED_TOOL_IDS = TOOL_DEFINITIONS.filter(tool => tool.defaultEnabled).map(tool => tool.id);
const ENABLED_TOOLS_KEY = 'ide_enabled_tools';
const ACTIVE_TOOL_KEY = 'ide_active_tool';

const DEFAULT_TABS: CodeTab[] = [{ id: '1', name: 'file1.asm', code: '', isDirty: false }];
const SIDEBAR_LEGACY_DEFAULT_WIDTH = 400;
const SIDEBAR_MIN_WIDTH = 112;
const SIDEBAR_MAX_WIDTH = 960;
const SIDEBAR_DEFAULT_WIDTH = 200;
const DOCS_TAB_ID = 'wimps-docs';
const DOCS_TAB_NAME = 'Documentation';
const WELCOME_TAB_ID = 'wimps-welcome';
const WELCOME_TAB_NAME = 'Welcome';
const WELCOME_SEEN_KEY = 'ide_welcome_seen';

const isEphemeralTab = (tab: Pick<CodeTab, 'kind'> | null | undefined): boolean =>
  tab?.kind === 'docs' || tab?.kind === 'welcome';

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', minWidth: 0 }}>
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
          width: '100%',
          minWidth: 0,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
            <div style={{ color: theme.subText, fontSize: 12 }}>Read-only reference tab</div>
            <button
              type="button"
              onClick={() => window.open('/docs', '_blank', 'noopener,noreferrer')}
              className="ide-docs-standalone-btn"
              style={{
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                borderRadius: 5,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                lineHeight: 1.2,
              }}
            >
              Open Docs Page
            </button>
          </div>
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

function WelcomeTabPanel({
  theme,
  onNewFile,
  onOpenDocs,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onNewFile: () => void;
  onOpenDocs: () => void;
}) {
  const primaryActionBtnStyle: React.CSSProperties = {
    border: '1px solid #2563eb',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const secondaryActionBtnStyle: React.CSSProperties = {
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
  };

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
  };

  const stepStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'start',
  };

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
          <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>Welcome</div>
          <div style={{ color: theme.subText, fontSize: 12 }}>Start here</div>
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '24px 20px 32px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(250px, 0.9fr)' }}>
              <div style={{ padding: '26px 24px', borderRight: `1px solid ${theme.border}` }}>
                <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Getting Started
                </div>
                <div style={{ color: theme.text, fontSize: 32, fontWeight: 800, lineHeight: 1.05, maxWidth: 420 }}>
                  Write, assemble, run.
                </div>
                <div style={{ color: theme.subText, fontSize: 14, lineHeight: 1.65, marginTop: 12, maxWidth: 560 }}>
                  Create a file. Assemble it. Step through execution. Check registers, memory, bitmap output, and console input without leaving the editor.
                </div>
              </div>

              <div style={{ padding: '20px 18px', backgroundColor: theme.bg }}>
                <div style={{ color: theme.text, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Quick actions</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button type="button" onClick={onNewFile} style={primaryActionBtnStyle}>Create New File</button>
                  <button type="button" onClick={onOpenDocs} style={secondaryActionBtnStyle}>Open Docs Tab</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '18px 18px 20px' }}>
            <div style={{ color: theme.text, fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Typical flow</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={stepStyle}>
                <div style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>1</div>
                <div>
                  <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Create or open a file</div>
                  <div style={{ color: theme.subText, fontSize: 13, lineHeight: 1.6 }}>
                    Click <strong style={{ color: theme.text }}>+</strong> in the tab bar for a blank file. Use Files when you want to reopen saved work.
                  </div>
                </div>
              </div>
              <div style={stepStyle}>
                <div style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>2</div>
                <div>
                  <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Assemble the current file</div>
                  <div style={{ color: theme.subText, fontSize: 13, lineHeight: 1.6 }}>
                    Click <strong style={{ color: theme.text }}>Assemble</strong> or press <strong style={{ color: theme.text }}>Ctrl+Enter</strong>. WIMPS prints assembler errors in Console with line references.
                  </div>
                </div>
              </div>
              <div style={stepStyle}>
                <div style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>3</div>
                <div>
                  <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Run, step, and inspect state</div>
                  <div style={{ color: theme.subText, fontSize: 13, lineHeight: 1.6 }}>
                    Use <strong style={{ color: theme.text }}>Run</strong>, <strong style={{ color: theme.text }}>Continue</strong>, <strong style={{ color: theme.text }}>Step</strong>, and <strong style={{ color: theme.text }}>Step Back</strong>. Watch the side panels and Console as state changes.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div style={cardStyle}>
              <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Inspect machine state</div>
              <div style={{ color: theme.subText, fontSize: 12, lineHeight: 1.6 }}>
                Open the left-rail tools for registers, memory, bitmap display, program view, and analysis.
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Use the Console</div>
              <div style={{ color: theme.subText, fontSize: 12, lineHeight: 1.6 }}>
                Output appears below the editor. Input syscalls pause execution and wait there for your response.
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Need syntax help?</div>
              <div style={{ color: theme.subText, fontSize: 12, lineHeight: 1.6 }}>
                Open Docs for examples, shortcuts, and simulator notes.
              </div>
            </div>
          </div>
        </div>
      </div>
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
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <span style={labelStyle}>Speed</span>
        <div style={{ flex: '1 1 120px', minWidth: 0 }}>
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
        const tabs: CodeTab[] = parsed.tabs.map(normalizeTab).filter((tab: CodeTab) => !isEphemeralTab(tab));
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
      const tabs = parsed.map(normalizeTab).filter((tab: CodeTab) => !isEphemeralTab(tab));
      if (tabs.length === 0) return { tabs: DEFAULT_TABS, activeTabId: DEFAULT_TABS[0].id };
      return { tabs, activeTabId: tabs[0].id };
    }
  } catch {}
  // Corrupt/unparseable — treat as first visit
  return { tabs: DEFAULT_TABS, activeTabId: '1' };
}

function writeLocalState(tabs: CodeTab[], activeTabId: string) {
  try {
    const persistedTabs = tabs.filter(tab => !isEphemeralTab(tab));
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
  const [programOutput, setProgramOutput] = useState('');
  const [activityLog, setActivityLog] = useState('');
  const [activeConsoleTab, setActiveConsoleTab] = useState<ConsoleTab>('program');
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
    try {
      const v = localStorage.getItem('sidebar_width');
      if (!v) return SIDEBAR_DEFAULT_WIDTH;
      const savedWidth = Number(v);
      if (!Number.isFinite(savedWidth)) return SIDEBAR_DEFAULT_WIDTH;
      const nextWidth = savedWidth === SIDEBAR_LEGACY_DEFAULT_WIDTH ? SIDEBAR_DEFAULT_WIDTH : savedWidth;
      return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, nextWidth));
    } catch { return SIDEBAR_DEFAULT_WIDTH; }
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
  const [showPseudoPopups, setShowPseudoPopups] = useState<boolean>(() => {
    try { const v = localStorage.getItem('show_pseudo_popups'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'run' | 'help' | 'settings' | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const [explorerAction, setExplorerAction] = useState<{ type: 'new-file' | 'new-folder'; nonce: number } | null>(null);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => { try { localStorage.setItem('show_pseudo_popups', String(showPseudoPopups));   } catch {} }, [showPseudoPopups]);

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
  const isWelcomeTab = activeTab?.kind === 'welcome';
  const canEditActiveTab = activeTab != null && !isEphemeralTab(activeTab);
  const activeFileName = activeTab?.name ?? 'untitled.asm';

  const appendActivity = useCallback((line: string) => {
    setActivityLog(current => current ? `${current}\n\n${line}` : line);
  }, []);

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

  const makeWelcomeTab = useCallback((id = WELCOME_TAB_ID): CodeTab => ({
    id,
    name: WELCOME_TAB_NAME,
    code: '',
    kind: 'welcome',
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

  const openWelcomeTab = useCallback((alwaysNew = false) => {
    const welcomeId = alwaysNew ? `${WELCOME_TAB_ID}-${Date.now()}` : WELCOME_TAB_ID;
    setTabs(prev => {
      if (!alwaysNew) {
        const existing = prev.find(tab => tab.kind === 'welcome' && tab.id === WELCOME_TAB_ID);
        if (existing) return prev;
      }
      return [...prev, makeWelcomeTab(welcomeId)];
    });
    setActiveTabId(welcomeId);
    setOpenMenu(null);
  }, [makeWelcomeTab]);

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

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_SEEN_KEY) === 'true') return;
      localStorage.setItem(WELCOME_SEEN_KEY, 'true');
      openWelcomeTab(false);
    } catch {}
  }, [openWelcomeTab]);

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
    setProgramOutput(state.output);
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
    setActiveConsoleTab('activity');
    appendActivity(`Build: assembling ${activeFileName}`);
    resetSim();
    setActiveLine(null);
    setIsWaiting(false);
    setChangedRegisters(new Set());
    prevRegistersRef.current = [];
    stepHistoryRef.current = [];
    const result = assemble(activeCode);
    if (!result.ok) {
      const report = result.error.trim();
      if (report) appendActivity(report);
      appendActivity('Build: operation completed with errors.');
      setIsAssembled(false);
      setErrorLines(result.errors.filter(e => !e.isWarning).map(e => ({ line: e.lineNumber, message: e.message })));
      clearDerivedSimMetadata();
    } else {
      appendActivity('Build: operation completed successfully.');
      setIsAssembled(true);
      setErrorLines([]);
      applyState(getState(), { activeLineOverride: null, pseudoExpansionAddressOverride: null });
    }
  };

  const handleRun = () => {
    stopAutoRun();
    setActiveConsoleTab('program');
    appendActivity(`Run: running ${activeFileName}`);
    stepHistoryRef.current = [];
    if (runSpeed === 4) {
      const state = runSim(Array.from(breakpoints));
      applyState(state, { pseudoExpansionAddressOverride: null });
      if (state.terminated) appendActivity('Run: execution terminated by null instruction.');
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
        if (state.terminated) appendActivity('Run: execution terminated by null instruction.');
        stopAutoRun();
        return;
      }
      runTimerRef.current = setTimeout(tick, delay);
    };
    runTimerRef.current = setTimeout(tick, delay);
  };

  const handleContinue = () => {
    stopAutoRun();
    setActiveConsoleTab('program');
    appendActivity(`Run: continuing ${activeFileName}`);
    stepHistoryRef.current = [];
    if (runSpeed === 4) {
      const state = continueSim(Array.from(breakpoints));
      applyState(state, { pseudoExpansionAddressOverride: null });
      if (state.terminated) appendActivity('Run: execution terminated by null instruction.');
    } else {
      startTimedRun(false);
    }
  };

  const handleStep = () => {
    stopAutoRun();
    setActiveConsoleTab('program');
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
    setProgramOutput('');
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
    setActiveConsoleTab('program');
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
    if (isLoggedIn) {
      setActiveConsoleTab('activity');
      appendActivity('Files: saved to account.');
    }
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
      if (!res.ok) {
        setActiveConsoleTab('activity');
        appendActivity('Files: delete failed. Check your connection.');
        return;
      }
      removeTabLocally(tab.id);
    } catch {
      setActiveConsoleTab('activity');
      appendActivity('Files: delete failed. Check your connection.');
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
    // Flush before removing so the tab's final content is saved
    flushNow();
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const next = tabs[idx === 0 ? 1 : idx - 1];
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTabId === id) setActiveTabId(next?.id ?? '');
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
    flushNow();
    const idx = tabs.findIndex(t => t.id === activeTab.id);
    if (idx === -1) return;
    const next = tabs[idx === 0 ? 1 : idx - 1];
    setTabs(prev => prev.filter(t => t.id !== activeTab.id));
    setActiveTabId(next?.id ?? '');
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
  };

  // File toolbar: Save + import/export

  const vDragHandle = (
    <div className="ide-editor-handle" onMouseDown={startEditorVDrag} />
  );
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const focusCommandInput = useCallback(() => {
    setCommandOpen(true);
    setCommandSelectedIndex(0);
    setOpenMenu(null);
    window.requestAnimationFrame(() => commandInputRef.current?.focus());
  }, []);

  const commandEntries = useMemo(() => {
    const base: CommandEntry[] = [
      { label: 'New File', keywords: 'create file tab explorer', section: 'File', disabled: false, action: () => triggerExplorerAction('new-file') },
      { label: 'New Folder', keywords: 'create folder explorer', section: 'File', disabled: false, action: () => triggerExplorerAction('new-folder') },
      { label: 'Import File', keywords: 'upload import file', section: 'File', disabled: false, action: handleUpload },
      { label: 'Export Active File', keywords: 'download export save file', section: 'File', disabled: !activeTab || isDocsTab || isWelcomeTab, action: handleDownload },
      { label: 'Close Tab', keywords: 'close tab', section: 'File', disabled: !activeTab, action: closeActiveTab, hotkey: isMac ? '⌘W' : 'Ctrl+W' },
      { label: 'Focus Editor', keywords: 'editor cursor focus', section: 'Edit', disabled: !canEditActiveTab, action: focusEditor },
      { label: 'Find', keywords: 'search find text editor', section: 'Edit', disabled: !canEditActiveTab, action: () => codeEditorRef.current?.find(), hotkey: isMac ? '⌘F' : 'Ctrl+F' },
      { label: 'Replace', keywords: 'search replace editor', section: 'Edit', disabled: !canEditActiveTab, action: () => codeEditorRef.current?.replace(), hotkey: isMac ? '⌘H' : 'Ctrl+H' },
      { label: 'Go to Line', keywords: 'line goto jump editor', section: 'Edit', disabled: !canEditActiveTab, action: () => codeEditorRef.current?.gotoLine(), hotkey: isMac ? '⌘G' : 'Ctrl+G' },
      { label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', keywords: 'sidebar files tools', section: 'View', disabled: false, action: () => setSidebarOpen(v => !v), hotkey: isMac ? '⌘B' : 'Ctrl+B' },
      { label: 'Assemble', keywords: 'compile build assemble run', section: 'Run', disabled: !canEditActiveTab || isWaiting, action: handleAssemble, hotkey: isMac ? '⌘↵' : 'Ctrl+Enter' },
      { label: runLabel, keywords: 'run continue execute', section: 'Run', disabled: !isAssembled || isTerminated, action: runLabel === 'Continue' ? handleContinue : handleRun, hotkey: runLabel === 'Continue' ? 'F8' : 'F5' },
      { label: 'Step', keywords: 'debug step', section: 'Run', disabled: !isAssembled || isTerminated, action: handleStep, hotkey: 'F10' },
      { label: 'Step Back', keywords: 'debug step back reverse', section: 'Run', disabled: !isAssembled || !canStepBack, action: handleStepBack, hotkey: 'F9' },
      { label: 'Reset', keywords: 'stop reset program', section: 'Run', disabled: !isAssembled, action: handleReset, hotkey: 'Esc' },
      { label: 'Open Welcome', keywords: 'welcome getting started help', section: 'Help', disabled: false, action: () => openWelcomeTab(false) },
      { label: 'Open Docs', keywords: 'documentation docs help', section: 'Help', disabled: false, action: () => openDocsTab(false) },
      { label: 'Standalone Docs Page', keywords: 'documentation docs browser page', section: 'Help', disabled: false, action: () => window.open('/docs', '_blank', 'noopener,noreferrer') },
      { label: isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme', keywords: 'theme settings appearance dark light', section: 'Settings', disabled: false, action: toggleTheme },
      { label: showPseudoPopups ? 'Hide Pseudo Popups' : 'Show Pseudo Popups', keywords: 'pseudo popups settings', section: 'Settings', disabled: false, action: () => setShowPseudoPopups(v => !v) },
      { label: `Set Tab Size: ${tabSize === 2 ? 4 : 2}`, keywords: 'tab size settings indent', section: 'Settings', disabled: false, action: () => setTabSize(tabSize === 2 ? 4 : 2) },
      { label: `Reset Font Size (${fontSize}px)`, keywords: 'font size settings editor', section: 'Settings', disabled: false, action: () => setFontSize(15) },
    ];
    const toolEntries: CommandEntry[] = TOOL_DEFINITIONS.map(tool => {
      const enabled = enabledToolIds.includes(tool.id);
      return {
        label: `${enabled ? 'Hide' : 'Show'} ${tool.label}`,
        keywords: `${tool.label} tool panel sidebar`,
        section: 'Tools',
        disabled: false,
        action: () => toggleToolEnabled(tool.id),
      };
    });
    return [...base, ...toolEntries];
  }, [
    activeTab, canEditActiveTab, canStepBack, closeActiveTab, enabledToolIds, focusEditor, fontSize,
    handleAssemble, handleContinue, handleDownload, handleReset, handleRun, handleStep, handleStepBack,
    handleUpload, isAssembled, isDark, isDocsTab, isTerminated, isWaiting, isWelcomeTab, openDocsTab,
    openWelcomeTab, runLabel, showPseudoPopups, sidebarOpen, tabSize, tabs.length,
    toggleTheme, toggleToolEnabled,
  ]);

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return commandEntries;
    return commandEntries.filter(entry =>
      entry.label.toLowerCase().includes(query) ||
      entry.section.toLowerCase().includes(query) ||
      entry.keywords.toLowerCase().includes(query),
    );
  }, [commandEntries, commandQuery]);

  useEffect(() => {
    setCommandSelectedIndex(prev => {
      if (filteredCommands.length === 0) return 0;
      return Math.min(prev, filteredCommands.length - 1);
    });
  }, [filteredCommands]);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (commandRef.current && !commandRef.current.contains(e.target as Node)) {
        setCommandOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        focusCommandInput();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusCommandInput]);

  const runCommand = useCallback((entry: CommandEntry | undefined) => {
    if (!entry || entry.disabled) return;
    entry.action();
    setCommandQuery('');
    setCommandOpen(false);
  }, [commandEntries]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!ready) return <IdeSkeleton theme={theme} />;

  const saveHotkey = isMac ? '⌘S' : 'Ctrl+S';
  const assembleKey = isMac ? '⌘ Enter' : 'Ctrl+Enter';
  const statusLeftItems = [activeTab?.name ?? 'No file', isDocsTab ? 'Docs' : 'MIPS'];
  const statusRightItems = [STATUS_CONFIG[simStatus].label, cursorLine ? `Ln ${cursorLine}` : null].filter(Boolean) as string[];
  const menuItemPadding = '2px 24px';
  const menuDivider = <div style={{ height: 1, backgroundColor: theme.border, margin: '3px 0' }} />;
  const editorRunActions = [
    { label: 'Assemble', onPress: handleAssemble, enabled: canEditActiveTab && !isWaiting, title: `Assemble (${assembleKey})`, hotkey: assembleKey },
    ...primaryDebugActions,
  ];
  const showFloatingDebugToolbar = isAssembled && !isDocsTab && !isWelcomeTab;

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: theme.bg, overflow: 'hidden',
      ...getIdeChromeVars(theme, isDark),
    } as React.CSSProperties}>
      {/* Top bar */}
      {wide ? (
        <>
          <div className="ide-titlebar" style={{ flexShrink: 0 }}>
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', userSelect: 'none' }}>
              <Logo size={15} gap={0} textSize={11} showText={false} />
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
                      borderRadius: openMenu === menu.key ? '4px 4px 0 0' : 4,
                      border: `1px solid ${openMenu === menu.key ? theme.border : 'transparent'}`,
                      borderBottomColor: openMenu === menu.key ? 'var(--ide-commandbar-bg)' : 'transparent',
                      backgroundColor: openMenu === menu.key ? 'var(--ide-menu-active)' : 'transparent',
                      color: theme.text,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1,
                      position: 'relative',
                      zIndex: openMenu === menu.key ? 1001 : 'auto',
                    }}
                  >
                    {menu.label}
                  </button>
                  {openMenu === menu.key && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% - 1px)',
                      left: -1,
                      minWidth: menu.key === 'run' || menu.key === 'settings' ? 228 : 196,
                      backgroundColor: 'var(--ide-commandbar-bg)',
                      border: `1px solid ${theme.border}`,
                      borderTop: '1px solid var(--ide-commandbar-bg)',
                      borderRadius: '0 6px 6px 6px',
                      boxShadow: isDark ? '0 8px 18px rgba(0,0,0,0.22)' : '0 10px 18px rgba(15,23,42,0.12)',
                      padding: '4px 0 0',
                      zIndex: 1000,
                    }}>
                      {menu.key === 'file' && (
                        <>
                          {[
                            { label: 'New File', action: () => triggerExplorerAction('new-file'), disabled: false },
                            { label: 'New Folder', action: () => triggerExplorerAction('new-folder'), disabled: false },
                          ].map(item => (
                            <button
                              key={item.label}
                              type="button"
                              className="ide-menu-item"
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
                                padding: menuItemPadding,
                                fontSize: 13,
                                opacity: item.disabled ? 0.45 : 1,
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                                <span>{item.label}</span>
                              </span>
                            </button>
                          ))}
                          {menuDivider}
                          {[
                            { label: 'Import File...', action: handleUpload, disabled: false },
                            { label: 'Export Active File', action: handleDownload, disabled: !activeTab || isDocsTab },
                          ].map(item => (
                            <button
                              key={item.label}
                              type="button"
                              className="ide-menu-item"
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
                                padding: menuItemPadding,
                                fontSize: 13,
                                opacity: item.disabled ? 0.45 : 1,
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                                <span>{item.label}</span>
                              </span>
                            </button>
                          ))}
                          {menuDivider}
                          <button
                            type="button"
                            className="ide-menu-item"
                            disabled={!activeTab}
                            onClick={() => {
                              if (!activeTab) return;
                              closeActiveTab();
                              setOpenMenu(null);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              background: 'transparent',
                              color: !activeTab ? theme.subText : theme.text,
                              cursor: !activeTab ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              borderRadius: 0,
                              padding: menuItemPadding,
                              fontSize: 13,
                              opacity: !activeTab ? 0.45 : 1,
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                              <span>Close Tab</span>
                              <span style={{ color: theme.subText, fontSize: 12 }}>{isMac ? '⌘W' : 'Ctrl+W'}</span>
                            </span>
                          </button>
                        </>
                      )}
                      {menu.key === 'edit' && [
                        { label: 'Focus Editor', action: focusEditor, disabled: !canEditActiveTab },
                        { label: 'Find', action: () => codeEditorRef.current?.find(), disabled: !canEditActiveTab, hotkey: isMac ? '⌘F' : 'Ctrl+F' },
                        { label: 'Replace', action: () => codeEditorRef.current?.replace(), disabled: !canEditActiveTab, hotkey: isMac ? '⌘H' : 'Ctrl+H' },
                        { label: 'Go to Line', action: () => codeEditorRef.current?.gotoLine(), disabled: !canEditActiveTab, hotkey: isMac ? '⌘G' : 'Ctrl+G' },
                        { label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', action: () => setSidebarOpen(v => !v), disabled: false, hotkey: isMac ? '⌘B' : 'Ctrl+B' },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          className="ide-menu-item"
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
                            padding: menuItemPadding,
                            fontSize: 13,
                            opacity: item.disabled ? 0.45 : 1,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                            <span>{item.label}</span>
                            {item.hotkey ? <span style={{ color: theme.subText, fontSize: 12 }}>{item.hotkey}</span> : null}
                          </span>
                        </button>
                      ))}
                      {menu.key === 'run' && (
                        <>
                          {[
                            { label: 'Assemble', action: handleAssemble, disabled: !canEditActiveTab || isWaiting, hotkey: isMac ? '⌘↵' : 'Ctrl+Enter' },
                            { label: runLabel, action: runLabel === 'Continue' ? handleContinue : handleRun, disabled: !isAssembled || isTerminated, hotkey: runLabel === 'Continue' ? 'F8' : 'F5' },
                            { label: 'Step Back', action: handleStepBack, disabled: !isAssembled || !canStepBack, hotkey: 'F9' },
                            { label: 'Step', action: handleStep, disabled: !isAssembled || isTerminated, hotkey: 'F10' },
                            { label: 'Reset', action: handleReset, disabled: !isAssembled, hotkey: 'Esc' },
                          ].map(item => (
                            <button
                              key={item.label}
                              type="button"
                              className="ide-menu-item"
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
                                padding: menuItemPadding,
                                fontSize: 13,
                                opacity: item.disabled ? 0.45 : 1,
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                                <span>{item.label}</span>
                                {item.hotkey ? <span style={{ color: theme.subText, fontSize: 12 }}>{item.hotkey}</span> : null}
                              </span>
                            </button>
                          ))}
                          <div style={{ height: 1, backgroundColor: theme.border, margin: '5px 0' }} />
                          <div style={{ padding: '4px 14px 2px', color: theme.subText, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Speed
                          </div>
                          <div style={{ padding: '4px 14px 8px' }}>
                            <RunSpeedControl theme={theme} runSpeed={runSpeed} setRunSpeed={setRunSpeed} isTerminated={isTerminated} showLabel={false} />
                          </div>
                        </>
                      )}
                      {menu.key === 'help' && [
                        { label: 'Open Welcome', action: () => openWelcomeTab(false), hotkey: undefined },
                        { label: 'Open Docs', action: () => openDocsTab(false), hotkey: undefined },
                        { label: 'Standalone Docs Page', action: () => window.open('/docs', '_blank', 'noopener,noreferrer'), hotkey: undefined },
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          className="ide-menu-item"
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
                            padding: menuItemPadding,
                            fontSize: 13,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                            <span>{item.label}</span>
                            {item.hotkey ? <span style={{ color: theme.subText, fontSize: 12 }}>{item.hotkey}</span> : null}
                          </span>
                        </button>
                      ))}
                      {menu.key === 'settings' && (
                        <div style={{ padding: '4px 10px' }}>
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
                            runSpeed={runSpeed}
                            setRunSpeed={setRunSpeed}
                            isTerminated={isTerminated}
                          />
                        </div>
                      )}
                      <div style={{ height: 4 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }} />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(600px, 38vw, calc(100vw - 360px))',
                maxWidth: 600,
                minWidth: 260,
                pointerEvents: 'none',
              }}
            >
              <div
                ref={commandRef}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  justifyContent: 'center',
                  padding: '0',
                  pointerEvents: 'auto',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 22,
                    border: `1px solid ${commandOpen ? '#2563eb' : theme.border}`,
                    backgroundColor: commandOpen ? 'var(--ide-commandbar-bg)' : 'var(--ide-titlebar-bg)',
                    borderRadius: 7,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    gap: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', margin: '0 3px' }}>
                    <ActionIcon name="Search" size={14} />
                  </div>
                  <input
                    ref={commandInputRef}
                    value={commandQuery}
                    onFocus={() => {
                      setCommandOpen(true);
                      setCommandSelectedIndex(0);
                    }}
                    onChange={e => {
                      setCommandQuery(e.target.value);
                      setCommandOpen(true);
                      setCommandSelectedIndex(0);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setCommandOpen(true);
                        setCommandSelectedIndex(prev => filteredCommands.length === 0 ? 0 : Math.min(prev + 1, filteredCommands.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setCommandSelectedIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        runCommand(filteredCommands[commandSelectedIndex]);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        if (commandQuery) setCommandQuery('');
                        else setCommandOpen(false);
                      }
                    }}
                    placeholder="Search actions and settings"
                    className="ide-command-search"
                    aria-label="Search actions and settings"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: theme.text,
                      fontSize: 12,
                    }}
                  />
                  <span style={{ color: theme.subText, fontSize: 11, flexShrink: 0 }}>{isMac ? '⌘⇧P' : 'Ctrl+Shift+P'}</span>
                </div>
                {commandOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--ide-commandbar-bg)',
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      boxShadow: isDark ? '0 10px 24px rgba(0,0,0,0.28)' : '0 12px 24px rgba(15,23,42,0.12)',
                      overflow: 'hidden',
                      zIndex: 2550,
                    }}
                  >
                    <div style={{ maxHeight: 360, overflowY: 'auto', padding: filteredCommands.length === 0 ? 0 : 0 }}>
                      {filteredCommands.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: theme.subText, fontSize: 12 }}>
                          No matching actions.
                        </div>
                      ) : filteredCommands.map((entry, index) => (
                        <button
                          key={`${entry.section}-${entry.label}`}
                          type="button"
                          disabled={entry.disabled}
                          onMouseEnter={() => setCommandSelectedIndex(index)}
                          onClick={() => runCommand(entry)}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: index === commandSelectedIndex ? (isDark ? '#1e293b' : '#eff6ff') : 'transparent',
                        color: entry.disabled ? theme.subText : theme.text,
                            cursor: entry.disabled ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            borderRadius: 8,
                            padding: menuItemPadding,
                            minHeight: 22,
                            opacity: entry.disabled ? 0.5 : 1,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
                            {entry.hotkey ? (
                              <span style={{ display: 'block', fontSize: 11, color: theme.subText, textAlign: 'right', flexShrink: 0, opacity: 0.9 }}>{entry.hotkey}</span>
                            ) : <span />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 17, flexShrink: 0 }}><Logo size={20} gap={0} textSize={12} showText={false} /></div>
            <div style={{ flex: 1 }} />
            <SaveAction onClick={handleSaveLocal} hotkey={saveHotkey} />
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
        <>
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
            <div className="ide-tabbar" style={{ flexShrink: 0 }}>
              <div
                className="tab-scroll"
                role="tablist"
                aria-label="Editor files"
                style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}
              >
                <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', width: 'max-content', height: 35 }}>
                  {tabs.map(tab => (
                    <div
                      key={tab.id}
                      role="tab"
                      tabIndex={0}
                      aria-selected={tab.id === activeTabId}
                      onClick={() => setActiveTabId(tab.id)}
                      onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? setActiveTabId(tab.id) : undefined}
                      className={`ide-tab${tab.id === activeTabId ? ' ide-tab--active' : ''}`}
                      style={{
                        cursor: 'pointer',
                        flexShrink: 0,
                        maxWidth: 220,
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
                          style={{ width: 110, backgroundColor: 'transparent', border: 'none', outline: 'none', color: theme.text, fontSize: 13 }}
                        />
                      ) : (
                        <span
                          onDoubleClick={e => isEphemeralTab(tab) ? undefined : startRename(tab, e)}
                          style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 144 }}
                        >
                          {tab.name}{tab.isDirty ? ' •' : ''}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={e => closeTab(tab.id, e)}
                        aria-label={`Close ${tab.name}`}
                        className="ide-tab-close"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.subText, fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => triggerExplorerAction('new-file')}
                aria-label="New tab"
                className="ide-new-tab"
                style={{
                  background: 'none',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  color: theme.subText,
                  cursor: 'pointer',
                  fontSize: 18,
                  fontWeight: 600,
                  flexShrink: 0,
                  width: 35,
                  height: 35,
                  display: 'grid',
                  placeItems: 'center',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                +
              </button>
              <div
                className="ide-editor-actions"
                aria-label="Editor run actions"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  height: 35,
                  padding: '0 8px',
                  borderLeft: `1px solid ${theme.border}`,
                  flexShrink: 0,
                }}
              >
                {editorRunActions.map(action => {
                  const isAssembleAction = action.label === 'Assemble';
                  const isRunAction = action.label === 'Run' || action.label === 'Continue';
                  const actionColor = isAssembleAction && action.enabled
                    ? '#7dd3fc'
                    : isRunAction && action.enabled
                      ? '#86efac'
                      : action.enabled
                        ? theme.text
                        : theme.subText;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.enabled ? action.onPress : undefined}
                      title={action.title}
                      aria-label={action.label}
                      aria-disabled={!action.enabled}
                      className="ide-editor-action"
                      style={{
                        width: 28,
                        height: 28,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        borderRadius: 4,
                        background: 'transparent',
                        color: actionColor,
                        cursor: action.enabled ? 'pointer' : 'not-allowed',
                        opacity: action.enabled ? 1 : 0.42,
                        padding: 0,
                      }}
                    >
                      <ActionIcon name={action.label} size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ height: `${editorHeightPct}%`, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {showFloatingDebugToolbar && (
                <div
                  className="ide-floating-debug"
                  aria-label="Debug controls"
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    height: 32,
                    padding: '0 6px',
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                  }}
                >
                  {primaryDebugActions.map(action => {
                    const isRunAction = action.label === 'Run' || action.label === 'Continue';
                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.enabled ? action.onPress : undefined}
                        title={action.title}
                        aria-label={action.label}
                        aria-disabled={!action.enabled}
                        className="ide-editor-action"
                        style={{
                          width: 24,
                          height: 24,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none',
                          borderRadius: 4,
                          background: 'transparent',
                          color: isRunAction && action.enabled ? '#22c55e' : action.enabled ? theme.text : theme.subText,
                          cursor: action.enabled ? 'pointer' : 'not-allowed',
                          opacity: action.enabled ? 1 : 0.42,
                          padding: 0,
                        }}
                      >
                        <ActionIcon name={action.label} size={14} />
                      </button>
                    );
                  })}
                </div>
              )}
              {tabs.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: theme.subText }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ fontSize: 13, opacity: 0.6 }}>No file open</div>
                  <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center', lineHeight: '18px' }}>
                    Create a new file or open one<br />from the File Explorer
                  </div>
                </div>
              ) : isDocsTab ? (
                <DocsTabPanel theme={theme} />
              ) : isWelcomeTab ? (
                <WelcomeTabPanel
                  theme={theme}
                  onNewFile={() => triggerExplorerAction('new-file')}
                  onOpenDocs={() => openDocsTab(false)}
                />
              ) : (
                <>
                  {showPseudoPopups && <PseudoExpansionNotice theme={theme} pseudoExpansion={pseudoExpansion} pseudoExpansionAddress={pseudoExpansionAddress} />}
                  <CodeEditor ref={codeEditorRef} code={activeCode} setCode={setActiveCode} theme={theme} activeLine={activeLine} cursorLine={cursorLine} breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle} onCursorLineChange={setCursorLine} errorLines={errorLines} onAssemble={handleAssemble} onToggleSidebar={() => setSidebarOpen(o => !o)} fontSize={fontSize} tabSize={tabSize} />
                </>
              )}
            </div>

            {vDragHandle}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ConsolePanel
                programOutput={programOutput}
                activityLog={activityLog}
                activeTab={activeConsoleTab}
                onTabChange={setActiveConsoleTab}
                isWaiting={isWaiting}
                onSubmit={handleFeedInput}
                theme={theme}
              />
            </div>
          </div>

        </div>
        <div className="ide-statusbar" role="status" aria-live="polite">
          <div className="ide-statusbar-group">
            {statusLeftItems.map(item => <span key={item}>{item}</span>)}
          </div>
          <div className="ide-statusbar-group">
            {statusRightItems.map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
        </>
      ) : (
        /* Mobile single-panel */
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mobileView === 'files' && <FileExplorer theme={theme} isLoggedIn={isLoggedIn} tabs={tabs} setTabs={setTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} removeTabLocally={removeTabLocally} onFilesLoaded={setClosedFileNames} onUpload={handleUpload} onDownload={handleDownload} externalAction={explorerAction} />}
          {mobileView === 'editor' && (
            <>
              {isDocsTab ? (
                <DocsTabPanel theme={theme} />
              ) : isWelcomeTab ? (
                <WelcomeTabPanel
                  theme={theme}
                  onNewFile={() => triggerExplorerAction('new-file')}
                  onOpenDocs={() => openDocsTab(false)}
                />
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
              programOutput={programOutput}
              activityLog={activityLog}
              activeTab={activeConsoleTab}
              onTabChange={setActiveConsoleTab}
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
  programOutput: string;
  activityLog: string;
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  isWaiting: boolean;
  onSubmit: (value: string) => void;
  theme: import('../theme/themes').Theme;
}

function ConsolePanel({ programOutput, activityLog, activeTab, onTabChange, isWaiting, onSubmit, theme }: ConsolePanelProps) {
  const [currentInput, setCurrentInput] = useState('');
  const termRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const visibleOutput = activeTab === 'program' ? programOutput : activityLog;
  const isProgramTab = activeTab === 'program';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [visibleOutput, currentInput, activeTab]);

  useEffect(() => {
    if (isWaiting && isProgramTab) termRef.current?.focus();
  }, [isWaiting, isProgramTab]);

  useEffect(() => {
    if (!isWaiting) setCurrentInput('');
  }, [isWaiting]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isWaiting || !isProgramTab) return;
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
        role="tablist"
        aria-label="Console views"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: 30,
          flexShrink: 0,
          border: `1px solid ${theme.border}`,
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          backgroundColor: theme.card,
          padding: '0 6px',
        }}
      >
        {([
          ['program', 'Program I/O'],
          ['activity', 'Activity'],
        ] as const).map(([key, label]) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(key)}
              style={{
                height: 24,
                padding: '0 9px',
                border: 'none',
                borderBottom: `2px solid ${selected ? '#2563eb' : 'transparent'}`,
                background: 'transparent',
                color: selected ? theme.text : theme.subText,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div
        ref={termRef}
        tabIndex={isProgramTab ? 0 : -1}
        role="log"
        aria-live="polite"
        aria-label={isProgramTab ? 'Program I/O' : 'Activity'}
        aria-relevant="additions"
        onKeyDown={handleKeyDown}
        onClick={() => { if (isProgramTab) termRef.current?.focus(); }}
        style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: theme.bg,
          borderRadius: '0 0 10px 10px',
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
          cursor: isWaiting && isProgramTab ? 'text' : 'default',
        }}
      >
        {isWaiting && isProgramTab && (
          <span className="sr-only" aria-live="assertive">
            Program is waiting for input. Type your response and press Enter.
          </span>
        )}
        {visibleOutput ? (
          <span>{visibleOutput}</span>
        ) : (
          !(isWaiting && isProgramTab) && (
            <span style={{ color: theme.subText, fontStyle: 'italic' }}>
              {isProgramTab ? 'Run a program to see I/O here.' : 'Build and run activity appears here.'}
            </span>
          )
        )}
        {isWaiting && isProgramTab && (
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
