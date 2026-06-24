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
