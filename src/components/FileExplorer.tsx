import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Theme } from '../theme/themes';
import type { CodeTab } from '../types';
import { getAuthToken, getApiHeaders, uniquifyName } from '../helpers/authStorage';
import { normalizeTab, readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';
import { FileRowSkeleton } from '../components/PageSkeletons';
import {
  buildTree, renameFolderPrefix, moveFile,
  readCollapsedFolders, writeCollapsedFolders,
  readSavedFolders, writeSavedFolders,
  tabFolder,
  type TreeNode,
} from '../helpers/tabUtils';

// ---------------------------------------------------------------------------
// Tree context — shared by FolderTree / FolderRow to avoid prop-drilling
// ---------------------------------------------------------------------------
interface FileTreeCtx {
  theme: Theme;
  activeTabId: string;
  openTabIds: Set<string>;
  deletingId: string | null;
  collapsedFolders: Set<string>;
  hoveredPath: string | null;
  dragOverPath: string | null;
  selectedFolderPath: string | null;
  editingFolderPath: string | null;
  editFolderName: string;
  creatingFileAt: string | null;
  newFileName: string;
  creatingFolderAt: string | null;
  newFolderName: string;
  toggleCollapse(path: string): void;
  selectFolder(path: string): void;
  setHoveredPath(p: string | null): void;
  startRenameFolder(path: string, currentName: string): void;
  setEditFolderName(v: string): void;
  commitRenameFolder(): void;
  cancelRenameFolder(): void;
  setCreatingFileAt(p: string | null): void;
  setNewFileName(v: string): void;
  commitNewFile(folderPath: string): void;
  setCreatingFolderAt(p: string | null): void;
  setNewFolderName(v: string): void;
  commitNewFolder(parentPath: string): void;
  newFileInFolder(folderPath: string): void;
  newSubfolder(parentPath: string): void;
  deleteFolder(node: Extract<TreeNode, { kind: 'folder' }>): void;
  openFile(tab: CodeTab): void;
  deleteFile(tab: CodeTab): void;
  onDragStart(e: React.DragEvent, item: TreeNode): void;
  onDragOver(e: React.DragEvent, targetPath: string): void;
  onDragLeave(): void;
  onDrop(e: React.DragEvent, targetPath: string): void;
}

const TreeCtx = React.createContext<FileTreeCtx>(null!);

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

interface ConfirmModalProps {
  message: string;
  theme: Theme;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ message, theme, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.card, border: `1px solid ${theme.border}`,
          borderRadius: 10, padding: '20px 24px', maxWidth: 360, width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <p style={{ margin: '0 0 20px', fontSize: 14, color: theme.text, lineHeight: '1.5' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none', border: `1px solid ${theme.border}`,
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
              color: theme.subText, fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              background: '#dc2626', border: 'none',
              borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
              color: '#fff', fontSize: 13, fontWeight: 600,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function NewFolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function NewFileIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="15" x2="15" y2="15" />
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
  depth: number;
  theme: Theme;
  onClick: () => void;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function FileRow({ file, isActive, isOpen, isDeleting, isHovered, depth, theme, onClick, onDelete, onMouseEnter, onMouseLeave, onDragStart }: FileRowProps) {
  const indent = depth * 14;
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable
      onDragStart={onDragStart}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: `0 8px 0 ${8 + indent}px`, height: 28, cursor: 'pointer',
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
          onClick={e => { e.stopPropagation(); onDelete(); }}
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

function NewFolderInput({ parentPath, depth }: { parentPath: string; depth: number }) {
  const ctx = React.useContext(TreeCtx);
  const indent = depth * 14;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: `0 8px 0 ${8 + indent}px`, height: 26,
    }}>
      <FolderIcon />
      <input
        autoFocus
        value={ctx.newFolderName}
        placeholder="folder name"
        onChange={e => ctx.setNewFolderName(e.target.value)}
        onBlur={() => ctx.commitNewFolder(parentPath)}
        onKeyDown={e => {
          if (e.key === 'Enter') ctx.commitNewFolder(parentPath);
          if (e.key === 'Escape') ctx.setCreatingFolderAt(null);
          e.stopPropagation();
        }}
        style={{
          flex: 1, background: ctx.theme.bg,
          border: `1px solid ${ctx.theme.linkColor}`,
          borderRadius: 3, color: ctx.theme.text,
          fontSize: 13, padding: '1px 4px', outline: 'none',
        }}
      />
    </div>
  );
}

function NewFileInput({ folderPath, depth }: { folderPath: string; depth: number }) {
  const ctx = React.useContext(TreeCtx);
  const indent = depth * 14;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: `0 8px 0 ${8 + indent}px`, height: 26,
    }}>
      <span style={{ color: ctx.theme.subText, flexShrink: 0 }}>
        <FileIcon />
      </span>
      <input
        autoFocus
        value={ctx.newFileName}
        placeholder="file name"
        onChange={e => ctx.setNewFileName(e.target.value)}
        onBlur={() => ctx.commitNewFile(folderPath)}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') ctx.setCreatingFileAt(null);
          e.stopPropagation();
        }}
        style={{
          flex: 1, background: ctx.theme.bg,
          border: `1px solid ${ctx.theme.linkColor}`,
          borderRadius: 3, color: ctx.theme.text,
          fontSize: 13, padding: '1px 4px', outline: 'none',
        }}
      />
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

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'currentColor', padding: 3, display: 'flex',
  alignItems: 'center', borderRadius: 4, flexShrink: 0,
};

function FolderRow({ node, depth }: { node: Extract<TreeNode, { kind: 'folder' }>; depth: number }) {
  const ctx = React.useContext(TreeCtx);
  const isCollapsed  = ctx.collapsedFolders.has(node.fullPath);
  const isHovered    = ctx.hoveredPath === node.fullPath;
  const isDragTarget = ctx.dragOverPath === node.fullPath;
  const isSelected   = ctx.selectedFolderPath === node.fullPath;
  const isRenaming   = ctx.editingFolderPath === node.fullPath;
  const indent       = depth * 14;

  return (
    <div
      onMouseEnter={() => ctx.setHoveredPath(node.fullPath)}
      onMouseLeave={() => ctx.setHoveredPath(null)}
      draggable
      onDragStart={e => ctx.onDragStart(e, node)}
      onDragOver={e => ctx.onDragOver(e, node.fullPath)}
      onDragLeave={ctx.onDragLeave}
      onDrop={e => ctx.onDrop(e, node.fullPath)}
      onClick={() => ctx.selectFolder(node.fullPath)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: `0 8px 0 ${8 + indent}px`, height: 26,
        cursor: 'pointer', userSelect: 'none',
        backgroundColor: isDragTarget
          ? ctx.theme.linkColor + '20'
          : isSelected ? ctx.theme.linkColor + '18'
          : isHovered ? ctx.theme.linkColor + '10' : 'transparent',
        outline: isDragTarget ? `1px dashed ${ctx.theme.linkColor}` : 'none',
        outlineOffset: -1,
        transition: 'background-color 80ms',
      }}
    >
      <span
        onClick={e => { e.stopPropagation(); ctx.toggleCollapse(node.fullPath); }}
        style={{ color: ctx.theme.subText, flexShrink: 0, display: 'flex' }}
      >
        <ChevronIcon open={!isCollapsed} />
      </span>
      <FolderIcon />
      {isRenaming ? (
        <input
          autoFocus
          value={ctx.editFolderName}
          onChange={e => ctx.setEditFolderName(e.target.value)}
          onBlur={ctx.commitRenameFolder}
          onKeyDown={e => {
            if (e.key === 'Enter') ctx.commitRenameFolder();
            if (e.key === 'Escape') ctx.cancelRenameFolder();
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, background: ctx.theme.bg,
            border: `1px solid ${ctx.theme.linkColor}`,
            borderRadius: 3, color: ctx.theme.text,
            fontSize: 13, padding: '1px 4px', outline: 'none',
          }}
        />
      ) : (
        <span
          onDoubleClick={e => { e.stopPropagation(); ctx.startRenameFolder(node.fullPath, node.name); }}
          onClick={e => { e.stopPropagation(); ctx.selectFolder(node.fullPath); ctx.toggleCollapse(node.fullPath); }}
          style={{
            flex: 1, fontSize: 13, color: ctx.theme.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </span>
      )}
      {isHovered && !isRenaming && (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0, marginLeft: 'auto' }}>
          <button type="button" title="New file inside"
            onClick={e => { e.stopPropagation(); ctx.newFileInFolder(node.fullPath); }}
            style={{ ...iconBtnStyle, color: ctx.theme.subText }}>
            <NewFileIcon />
          </button>
          <button type="button" title="New subfolder"
            onClick={e => { e.stopPropagation(); ctx.newSubfolder(node.fullPath); }}
            style={{ ...iconBtnStyle, color: ctx.theme.subText }}>
            <NewFolderIcon size={12} />
          </button>
          <button type="button" title="Delete folder"
            onClick={e => { e.stopPropagation(); ctx.deleteFolder(node); }}
            style={{ ...iconBtnStyle, color: '#ef4444' }}>
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function FolderTree({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  const ctx = React.useContext(TreeCtx);
  return (
    <>
      {nodes.map(node => {
        if (node.kind === 'folder') {
          const isCollapsed     = ctx.collapsedFolders.has(node.fullPath);
          const isCreatingChild = ctx.creatingFolderAt === node.fullPath;
          const isCreatingFile  = ctx.creatingFileAt === node.fullPath;
          return (
            <React.Fragment key={node.fullPath}>
              <FolderRow node={node} depth={depth} />
              {!isCollapsed && (
                <>
                  <FolderTree nodes={node.children} depth={depth + 1} />
                  {isCreatingFile && <NewFileInput folderPath={node.fullPath} depth={depth + 1} />}
                  {isCreatingChild && <NewFolderInput parentPath={node.fullPath} depth={depth + 1} />}
                </>
              )}
            </React.Fragment>
          );
        }
        return (
          <FileRow
            key={node.tab.id}
            file={node.tab}
            depth={depth}
            isActive={node.tab.id === ctx.activeTabId}
            isOpen={ctx.openTabIds.has(node.tab.id)}
            isDeleting={ctx.deletingId === node.tab.id}
            isHovered={ctx.hoveredPath === node.tab.id}
            theme={ctx.theme}
            onClick={() => ctx.openFile(node.tab)}
            onDelete={() => ctx.deleteFile(node.tab)}
            onMouseEnter={() => ctx.setHoveredPath(node.tab.id)}
            onMouseLeave={() => ctx.setHoveredPath(null)}
            onDragStart={e => ctx.onDragStart(e, node)}
          />
        );
      })}
    </>
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
  externalAction?: { type: 'new-file' | 'new-folder'; nonce: number } | null;
}

export function FileExplorer({ theme, isLoggedIn, tabs, setTabs, activeTabId, setActiveTabId, removeTabLocally, onFilesLoaded, onUpload, onDownload, externalAction }: FileExplorerProps) {
  const [serverFiles, setServerFiles] = useState<CodeTab[]>([]);
  const [localFiles, setLocalFiles] = useState<CodeTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(() => {
    try { const v = localStorage.getItem('explorer_examples_open'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(readCollapsedFolders);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [creatingFileAt, setCreatingFileAt] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [creatingFolderAt, setCreatingFolderAt] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderPaths, setFolderPaths] = useState<Set<string>>(() => new Set(readSavedFolders()));
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const dragNodeRef = React.useRef<TreeNode | null>(null);

  useEffect(() => {
    try { localStorage.setItem('explorer_examples_open', String(examplesExpanded)); } catch {}
  }, [examplesExpanded]);

  useEffect(() => { writeCollapsedFolders(collapsedFolders); }, [collapsedFolders]);
  useEffect(() => { writeSavedFolders([...folderPaths]); }, [folderPaths]);

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
    setSelectedFolderPath(null);
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
    const newTab: CodeTab = { id, name, code: ex.code, isDirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    if (!isLoggedIn) {
      const updated = [...localFiles, newTab];
      setLocalFiles(updated);
      writeSavedFiles(updated);
    }
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

  const updateUserFiles = useCallback((updater: (files: CodeTab[]) => CodeTab[]) => {
    if (isLoggedIn) {
      setServerFiles(updater);
    } else {
      setLocalFiles(prev => {
        const next = updater(prev);
        writeSavedFiles(next);
        return next;
      });
    }
    setTabs(updater);
  }, [isLoggedIn, setTabs, setServerFiles, setLocalFiles]);

  const startNewFile = useCallback((folderPath: string) => {
    setCreatingFileAt(folderPath);
    setNewFileName('');
    setSelectedFolderPath(folderPath || null);
    setCollapsedFolders(prev => { const next = new Set(prev); next.delete(folderPath); return next; });
  }, []);

  const commitNewFile = useCallback((folderPath: string) => {
    const name = newFileName.trim();
    setCreatingFileAt(null);
    setNewFileName('');
    if (!name) return;
    const id = String(Date.now());
    const newTab: CodeTab = { id, name, path: folderPath, code: '', isDirty: false };
    updateUserFiles(files => [...files, newTab]);
    setActiveTabId(id);
    setSelectedFolderPath(folderPath || null);
  }, [newFileName, updateUserFiles, setActiveTabId]);

  const deleteFolder = useCallback((node: Extract<TreeNode, { kind: 'folder' }>) => {
    const userFiles = isLoggedIn ? serverFiles : localFiles;
    const affected = userFiles.filter(
      f => f.path === node.fullPath || (f.path ?? '').startsWith(node.fullPath + '/'),
    );

    const doDelete = () => {
      const affectedIds = new Set(affected.map(f => f.id));
      if (affectedIds.has(activeTabId)) {
        const remaining = tabs.filter(t => !affectedIds.has(t.id));
        setActiveTabId(remaining[0]?.id ?? '');
      }
      updateUserFiles(files => files.filter(f => !affectedIds.has(f.id)));
      const prunePrefix = (prev: Set<string>) => {
        const next = new Set(prev);
        for (const f of [...next]) {
          if (f === node.fullPath || f.startsWith(node.fullPath + '/')) next.delete(f);
        }
        return next;
      };
      setCollapsedFolders(prunePrefix);
      setFolderPaths(prunePrefix);
      setSelectedFolderPath(prev => prev && (prev === node.fullPath || prev.startsWith(node.fullPath + '/')) ? null : prev);
    };

    if (affected.length > 0) {
      setConfirmModal({
        message: `Delete folder "${node.name}" and all ${affected.length} file${affected.length === 1 ? '' : 's'} inside?`,
        onConfirm: doDelete,
      });
    } else {
      doDelete();
    }
  }, [isLoggedIn, serverFiles, localFiles, activeTabId, tabs, updateUserFiles, setActiveTabId]);

  const commitNewFolder = useCallback((parentPath: string) => {
    const name = newFolderName.trim();
    setCreatingFolderAt(null);
    setNewFolderName('');
    if (!name) return;
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    setFolderPaths(prev => new Set([...prev, folderPath]));
    setSelectedFolderPath(folderPath);
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.delete(folderPath);
      return next;
    });
  }, [newFolderName]);

  const startRenameFolder = useCallback((fullPath: string, currentName: string) => {
    setEditingFolderPath(fullPath);
    setEditFolderName(currentName);
  }, []);

  const commitRenameFolder = useCallback(() => {
    if (!editingFolderPath) return;
    const newName = editFolderName.trim();
    setEditingFolderPath(null);
    setEditFolderName('');
    if (!newName) return;

    const parentPath = editingFolderPath.includes('/')
      ? editingFolderPath.slice(0, editingFolderPath.lastIndexOf('/'))
      : '';
    const newFullPath = parentPath ? `${parentPath}/${newName}` : newName;
    if (newFullPath === editingFolderPath) return;

    updateUserFiles(files => renameFolderPrefix(files, editingFolderPath, newFullPath));
    const rewritePrefix = (prev: Set<string>) => {
      const next = new Set<string>();
      for (const p of prev) {
        if (p === editingFolderPath) next.add(newFullPath);
        else if (p.startsWith(editingFolderPath + '/'))
          next.add(newFullPath + p.slice(editingFolderPath.length));
        else next.add(p);
      }
      return next;
    };
    setCollapsedFolders(rewritePrefix);
    setFolderPaths(rewritePrefix);
    setSelectedFolderPath(prev => {
      if (!prev) return prev;
      if (prev === editingFolderPath) return newFullPath;
      if (prev.startsWith(editingFolderPath + '/')) return newFullPath + prev.slice(editingFolderPath.length);
      return prev;
    });
  }, [editingFolderPath, editFolderName, updateUserFiles]);

  const cancelRenameFolder = useCallback(() => {
    setEditingFolderPath(null);
    setEditFolderName('');
  }, []);

  const onDragStart = useCallback((e: React.DragEvent, item: TreeNode) => {
    dragNodeRef.current = item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.kind === 'file' ? item.tab.id : item.fullPath);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(targetPath);
  }, []);

  const onDragLeave = useCallback((e?: React.DragEvent) => {
    setDragOverPath(null);
  }, []);

  const applyDrop = useCallback((targetFolderPath: string) => {
    const dragged = dragNodeRef.current;
    dragNodeRef.current = null;
    setDragOverPath(null);
    if (!dragged) return;

    if (dragged.kind === 'file') {
      const currentFolder = tabFolder(dragged.tab);
      if (currentFolder === targetFolderPath) return;
      updateUserFiles(files => moveFile(files, dragged.tab.id, targetFolderPath));
    } else {
      const src = dragged.fullPath;
      if (src === targetFolderPath) return;
      if (targetFolderPath === src || targetFolderPath.startsWith(src + '/')) return;
      const folderName = src.includes('/') ? src.slice(src.lastIndexOf('/') + 1) : src;
      const newPath = targetFolderPath ? `${targetFolderPath}/${folderName}` : folderName;
      if (newPath === src) return;
      updateUserFiles(files => renameFolderPrefix(files, src, newPath));
      const rewriteDrag = (prev: Set<string>) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (p === src) next.add(newPath);
          else if (p.startsWith(src + '/')) next.add(newPath + p.slice(src.length));
          else next.add(p);
        }
        return next;
      };
      setCollapsedFolders(rewriteDrag);
      setFolderPaths(rewriteDrag);
      setSelectedFolderPath(prev => {
        if (!prev) return prev;
        if (prev === src) return newPath;
        if (prev.startsWith(src + '/')) return newPath + prev.slice(src.length);
        return prev;
      });
    }
  }, [updateUserFiles]);

  const onDrop = useCallback((e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    applyDrop(targetFolderPath);
  }, [applyDrop]);

  const startNewFolder = useCallback((parentPath: string) => {
    setCreatingFolderAt(parentPath);
    setNewFolderName('');
    setSelectedFolderPath(parentPath || null);
    setCollapsedFolders(prev => { const next = new Set(prev); next.delete(parentPath); return next; });
  }, []);

  useEffect(() => {
    if (!externalAction) return;
    if (externalAction.type === 'new-file') startNewFile('');
    else startNewFolder('');
  }, [externalAction, startNewFile, startNewFolder]);

  const openTabIds = new Set(tabs.map(t => t.id));
  const userFiles = isLoggedIn ? serverFiles : localFiles;

  const handleDelete = (file: CodeTab) =>
    isLoggedIn ? handleDeleteCloud(file) : handleDeleteLocal(file);

  const treeCtx: FileTreeCtx = {
    theme, activeTabId, openTabIds, deletingId, collapsedFolders,
    hoveredPath: hoveredId, dragOverPath, selectedFolderPath,
    editingFolderPath, editFolderName,
    creatingFileAt, newFileName,
    creatingFolderAt, newFolderName,
    toggleCollapse: (path) => setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    }),
    selectFolder: setSelectedFolderPath,
    setHoveredPath: setHoveredId,
    startRenameFolder,
    setEditFolderName,
    commitRenameFolder,
    cancelRenameFolder,
    setCreatingFileAt,
    setNewFileName,
    commitNewFile,
    setCreatingFolderAt,
    setNewFolderName,
    commitNewFolder,
    newFileInFolder: startNewFile,
    newSubfolder: startNewFolder,
    deleteFolder,
    openFile: handleOpen,
    deleteFile: handleDelete,
    onDragStart, onDragOver, onDragLeave, onDrop,
  };

  const hdrBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: theme.subText, padding: 4, display: 'flex', alignItems: 'center',
    borderRadius: 4, flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          theme={theme}
          onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {/* Header action buttons */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 2, padding: '3px 6px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
      }}>
        <button type="button" onClick={() => startNewFile(selectedFolderPath ?? '')} title="New File" style={hdrBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="12" x2="12" y2="18" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        <button type="button"
          onClick={() => startNewFolder(selectedFolderPath ?? '')}
          title="New Folder"
          style={hdrBtn}
        >
          <NewFolderIcon />
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
            {/* !isLoggedIn && (
              <div style={{ padding: '2px 24px 6px', fontSize: 11, color: theme.subText, lineHeight: '16px' }}>
                <Link to="/login" style={{ color: theme.linkColor, fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
                {' '}to sync files to the cloud.
              </div>
            ) */}
            {loading ? (
              <div style={{ padding: '0 8px' }}>
                <FileRowSkeleton theme={theme} count={3} />
              </div>
            ) : userFiles.length === 0 && folderPaths.size === 0 && creatingFileAt === null && creatingFolderAt === null ? (
              <div style={{ padding: '4px 24px', color: theme.subText, fontSize: 12, lineHeight: '18px' }}>
                Nothing saved yet.<br />Save a file to keep it here.
              </div>
            ) : (
              <TreeCtx.Provider value={treeCtx}>
                <FolderTree nodes={buildTree(userFiles, folderPaths)} depth={0} />
                {creatingFileAt === '' && <NewFileInput folderPath="" depth={0} />}
                {creatingFolderAt === '' && <NewFolderInput parentPath="" depth={0} />}
                <div
                  style={{ flex: 1, minHeight: 16 }}
                  onClick={() => setSelectedFolderPath(null)}
                  onDragOver={e => { e.preventDefault(); setDragOverPath('__root__'); }}
                  onDragLeave={() => setDragOverPath(null)}
                  onDrop={e => { e.preventDefault(); applyDrop(''); setDragOverPath(null); }}
                />
              </TreeCtx.Provider>
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
