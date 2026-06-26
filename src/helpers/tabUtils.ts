import type { CodeTab } from '../types';

export const normalizeTab = (item: any): CodeTab => ({
  ...item,
  id: item?.id ?? item?._id ?? String(Date.now() + Math.random()),
  _id: item?._id ? String(item._id) : undefined,
  name: item?.name || 'untitled.asm',
  code: item?.code || '',
  isDirty: Boolean(item?.isDirty),
});

export function readSavedFiles(): CodeTab[] {
  try {
    const raw = localStorage.getItem('saved_files');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.map(normalizeTab);
  } catch {}
  return [];
}

export function writeSavedFiles(files: CodeTab[]): void {
  try { localStorage.setItem('saved_files', JSON.stringify(files)); } catch {}
}

// ---------------------------------------------------------------------------
// Folder tree utilities
// ---------------------------------------------------------------------------

export type TreeNode =
  | { kind: 'folder'; name: string; fullPath: string; children: TreeNode[] }
  | { kind: 'file'; tab: CodeTab };

/** Folder prefix of a tab ('') for root files */
export function tabFolder(tab: CodeTab): string {
  return tab.path ?? '';
}

/** Build a recursive tree from a flat CodeTab array.
 *  explicitFolders lets empty folders (no files) appear in the tree.
 *  Folders always precede files; both groups sorted alphabetically. */
export function buildTree(tabs: CodeTab[], explicitFolders?: Set<string>): TreeNode[] {
  // Collect all folder paths and their ancestors
  const folderSet = new Set<string>();
  for (const tab of tabs) {
    if (tab.path) {
      const parts = tab.path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        folderSet.add(parts.slice(0, i).join('/'));
      }
    }
  }
  if (explicitFolders) {
    for (const f of explicitFolders) {
      if (!f) continue;
      const parts = f.split('/');
      for (let i = 1; i <= parts.length; i++) {
        folderSet.add(parts.slice(0, i).join('/'));
      }
    }
  }

  const sortedFolders = [...folderSet].sort((a, b) => a.localeCompare(b));

  function buildLevel(parentPath: string): TreeNode[] {
    const nodes: TreeNode[] = [];

    // Direct child folders
    const childFolders = sortedFolders.filter(f => {
      const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
      return parent === parentPath;
    });

    for (const folder of childFolders) {
      const name = folder.includes('/')
        ? folder.slice(folder.lastIndexOf('/') + 1)
        : folder;
      nodes.push({ kind: 'folder', name, fullPath: folder, children: buildLevel(folder) });
    }

    // Files directly in this folder
    const filesHere = tabs
      .filter(t => (t.path ?? '') === parentPath)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const tab of filesHere) {
      nodes.push({ kind: 'file', tab });
    }

    return nodes;
  }

  return buildLevel('');
}

/** Rewrite every tab whose path starts with oldPrefix to newPrefix. */
export function renameFolderPrefix(
  tabs: CodeTab[],
  oldPrefix: string,
  newPrefix: string,
): CodeTab[] {
  return tabs.map(tab => {
    if (!tab.path) return tab;
    if (tab.path === oldPrefix)
      return { ...tab, path: newPrefix || undefined };
    if (tab.path.startsWith(oldPrefix + '/')) {
      const remainder = tab.path.slice(oldPrefix.length); // starts with '/'
      const newPath = newPrefix ? newPrefix + remainder : remainder.slice(1);
      return { ...tab, path: newPath || undefined };
    }
    return tab;
  });
}

/** Move a single file to a new folder. */
export function moveFile(tabs: CodeTab[], tabId: string, newFolder: string): CodeTab[] {
  return tabs.map(t =>
    t.id === tabId ? { ...t, path: newFolder === '' ? undefined : newFolder } : t,
  );
}

export function readSavedFolders(): string[] {
  try {
    const raw = localStorage.getItem('saved_folders');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {}
  return [];
}

export function writeSavedFolders(paths: string[]): void {
  try { localStorage.setItem('saved_folders', JSON.stringify(paths)); } catch {}
}

export function readCollapsedFolders(): Set<string> {
  try {
    const raw = localStorage.getItem('collapsed_folders');
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

export function writeCollapsedFolders(collapsed: Set<string>): void {
  try {
    localStorage.setItem('collapsed_folders', JSON.stringify([...collapsed]));
  } catch {}
}
