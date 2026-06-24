import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Theme } from '../theme/themes';
import type { CodeTab } from '../types';
import { getAuthToken, getApiHeaders, uniquifyName } from '../helpers/authStorage';
import { normalizeTab, readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';
import { FileRowSkeleton } from '../components/PageSkeletons';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Example files data
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      <polyline points="3 2 7 5 3 8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SectionHeader({ label, expanded, onToggle, theme }: { label: string; expanded: boolean; onToggle: () => void; theme: Theme }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        width: '100%', padding: '5px 8px',
        background: 'none', border: 'none', cursor: 'pointer',
        color: theme.subText, fontSize: 11, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        textAlign: 'left',
      }}
    >
      <ChevronIcon open={expanded} />
      {label}
    </button>
  );
}

interface FileRowProps {
  file: CodeTab;
  isActive: boolean;
  isOpen: boolean;
  isDeleting: boolean;
  isHovered: boolean;
  theme: Theme;
  onClick: () => void;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function FileRow({ file, isActive, isOpen, isDeleting, isHovered, theme, onClick, onDelete, onMouseEnter, onMouseLeave }: FileRowProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 8px', height: 28, cursor: 'pointer',
        backgroundColor: isActive ? theme.linkColor + '25' : isHovered ? theme.linkColor + '10' : 'transparent',
        opacity: isDeleting ? 0.4 : 1,
        transition: 'background-color 100ms, opacity 150ms',
        flexShrink: 0,
      }}
    >
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ color: isActive ? theme.linkColor : theme.subText, flexShrink: 0 }}>
          <FileIcon />
        </span>
        <span style={{
          fontSize: 13, color: isActive ? theme.text : isOpen ? theme.text : theme.subText,
          fontWeight: isActive ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.name}
        </span>
      </div>
      {isHovered && !isDeleting && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete file"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ef4444', padding: 3, display: 'flex', alignItems: 'center',
            borderRadius: 4, flexShrink: 0,
          }}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function ExampleRow({ ex, theme, onClick, isHovered, onMouseEnter, onMouseLeave }: { ex: ExampleFile; theme: Theme; onClick: () => void; isHovered: boolean; onMouseEnter: () => void; onMouseLeave: () => void }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 8px', height: 28, cursor: 'pointer',
        backgroundColor: isHovered ? theme.linkColor + '10' : 'transparent',
        transition: 'background-color 100ms',
        flexShrink: 0,
      }}
    >
      <span style={{ color: theme.subText, flexShrink: 0 }}><FileIcon /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: theme.subText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {ex.name}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface FileExplorerProps {
  theme: Theme;
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

export function FileExplorer({ theme, isLoggedIn, tabs, setTabs, activeTabId, setActiveTabId, removeTabLocally, onFilesLoaded, onUpload, onDownload }: FileExplorerProps) {
  const [serverFiles, setServerFiles] = useState<CodeTab[]>([]);
  const [localFiles, setLocalFiles] = useState<CodeTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(() => {
    try { const v = localStorage.getItem('explorer_examples_open'); return v === null ? true : v === 'true'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('explorer_examples_open', String(examplesExpanded)); } catch {}
  }, [examplesExpanded]);

  useEffect(() => {
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
  }, [isLoggedIn]);

  const handleOpen = (file: CodeTab) => {
    const existing = tabs.find(t => t.id === file.id);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      setTabs(prev => [...prev, { ...file, isDirty: false }]);
      setActiveTabId(file.id);
    }
  };

  const handleOpenExample = (ex: ExampleFile) => {
    const id = String(Date.now());
    const allNames = new Set([
      ...tabs.map(t => t.name),
      ...serverFiles.map(f => f.name),
      ...localFiles.map(f => f.name),
    ]);
    const name = uniquifyName(ex.name, allNames);
    setTabs(prev => [...prev, { id, name, code: ex.code, isDirty: false }]);
    setActiveTabId(id);
  };

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

  const handleDeleteLocal = (file: CodeTab) => {
    const updated = localFiles.filter(f => f.id !== file.id);
    setLocalFiles(updated);
    writeSavedFiles(updated);
    removeTabLocally(file.id);
  };

  const handleNewFile = () => {
    const id = String(Date.now());
    const allNames = new Set([
      ...tabs.map(t => t.name),
      ...serverFiles.map(f => f.name),
      ...localFiles.map(f => f.name),
    ]);
    let n = 1;
    while (allNames.has(`file${n}.asm`)) n++;
    const name = `file${n}.asm`;
    const newTab: CodeTab = { id, name, code: '', isDirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    if (!isLoggedIn) {
      const updated = [...localFiles, newTab];
      setLocalFiles(updated);
      writeSavedFiles(updated);
    } else {
      setServerFiles(prev => [...prev, newTab]);
    }
  };

  const openTabIds = new Set(tabs.map(t => t.id));
  const userFiles = isLoggedIn ? serverFiles : localFiles;

  const handleDelete = (file: CodeTab) =>
    isLoggedIn ? handleDeleteCloud(file) : handleDeleteLocal(file);

  const hdrBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: theme.subText, padding: 4, display: 'flex', alignItems: 'center',
    borderRadius: 4, flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header action buttons */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 2, padding: '3px 6px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
      }}>
        <button type="button" onClick={handleNewFile} title="New File" style={hdrBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="12" x2="12" y2="18" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        <button type="button" onClick={onUpload} title="Import file from disk" style={hdrBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <button type="button" onClick={onDownload} title="Export active file" style={hdrBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>

        {/* YOUR FILES / CLOUD FILES */}
        <SectionHeader
          label={isLoggedIn ? 'Cloud Files' : 'Local Files'}
          expanded={filesExpanded}
          onToggle={() => setFilesExpanded(p => !p)}
          theme={theme}
        />
        {filesExpanded && (
          <>
            {!isLoggedIn && (
              <div style={{ padding: '2px 24px 6px', fontSize: 11, color: theme.subText, lineHeight: '16px' }}>
                <Link to="/login" style={{ color: theme.linkColor, fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
                {' '}to sync files to the cloud.
              </div>
            )}
            {loading ? (
              <div style={{ padding: '0 8px' }}>
                <FileRowSkeleton theme={theme} count={3} />
              </div>
            ) : userFiles.length === 0 ? (
              <div style={{ padding: '4px 24px', color: theme.subText, fontSize: 12, lineHeight: '18px' }}>
                Nothing saved yet.<br />Hit 💾 Save to keep a file here.
              </div>
            ) : (
              userFiles.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  isActive={file.id === activeTabId}
                  isOpen={openTabIds.has(file.id)}
                  isDeleting={deletingId === file.id}
                  isHovered={hoveredId === file.id}
                  theme={theme}
                  onClick={() => handleOpen(file)}
                  onDelete={() => handleDelete(file)}
                  onMouseEnter={() => setHoveredId(file.id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              ))
            )}
          </>
        )}

        {/* EXAMPLES */}
        <SectionHeader
          label="Examples"
          expanded={examplesExpanded}
          onToggle={() => setExamplesExpanded(p => !p)}
          theme={theme}
        />
        {examplesExpanded && (
          EXAMPLE_FILES.map(ex => (
            <ExampleRow
              key={ex.name}
              ex={ex}
              theme={theme}
              onClick={() => handleOpenExample(ex)}
              isHovered={hoveredId === `ex:${ex.name}`}
              onMouseEnter={() => setHoveredId(`ex:${ex.name}`)}
              onMouseLeave={() => setHoveredId(null)}
            />
          ))
        )}
      </div>
    </div>
  );
}
