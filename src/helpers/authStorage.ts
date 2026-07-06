import Cookies from 'js-cookie';

export function uniquifyName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext  = dot >= 0 ? name.slice(dot)  : '';
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${base} (${n})${ext}`;
    if (!existingNames.has(candidate)) return candidate;
    n++;
  }
}

const TOKEN_KEY = 'token';

export const getAuthToken = (): string | null =>
  Cookies.get(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);

export const saveAuthToken = (token: string) => {
  Cookies.set(TOKEN_KEY, token, { expires: 1, sameSite: 'lax' });
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  Cookies.remove(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
};

export const getApiHeaders = (token?: string | null, json = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['ngrok-skip-browser-warning'] = 'true';
  return headers;
};

// Merges all guest localStorage work into the user's server files right after login/register.
// Server files take precedence on ID conflicts; guest files fill the gaps.
// Non-fatal: if the migration fails the user still logs in successfully.
export async function migrateGuestFiles(token: string, apiBase: string): Promise<void> {
  try {
    // Collect open tabs
    const openRaw = localStorage.getItem('saved_tabs');
    const openParsed = openRaw ? JSON.parse(openRaw) : null;
    const openTabs: any[] = Array.isArray(openParsed?.tabs) ? openParsed.tabs
      : Array.isArray(openParsed) ? openParsed : [];

    // Collect saved-but-closed files
    const savedRaw = localStorage.getItem('saved_files');
    const savedFiles: any[] = savedRaw ? JSON.parse(savedRaw) : [];

    // Union: open tabs + saved files not already represented as an open tab.
    // Skip empty files (default blank file1 created on logout) — nothing worth migrating.
    const openIds = new Set(openTabs.map((t: any) => t.id));
    let guestFiles = [...openTabs, ...savedFiles.filter((f: any) => !openIds.has(f.id))]
      .filter((f: any) => f?.kind !== 'docs' && f?.kind !== 'welcome')
      .filter((f: any) => typeof f.code === 'string' && f.code.trim().length > 0);

    if (guestFiles.length === 0) return;

    const headers = getApiHeaders(token);

    // Fetch existing server files — abort if we can't verify server state to avoid overwriting
    const getRes = await fetch(`${apiBase}/auth/tabs`, { headers });
    if (!getRes.ok) return;
    let serverTabs: any[] = await getRes.json();

    // Special case: if server has an empty file1.asm and the guest has a non-empty file1.asm,
    // fill the server file's content rather than creating a duplicate "file1 (1).asm".
    let serverTabsModified = false;
    const serverFile1Idx = serverTabs.findIndex((t: any) => t.name === 'file1.asm');
    const guestFile1 = guestFiles.find((g: any) => g.name === 'file1.asm');
    if (serverFile1Idx >= 0 && !serverTabs[serverFile1Idx].code?.trim() && guestFile1) {
      serverTabs = serverTabs.map((t: any, i: number) =>
        i === serverFile1Idx ? { ...t, code: guestFile1.code, isDirty: false } : t
      );
      guestFiles = guestFiles.filter((g: any) => g !== guestFile1);
      serverTabsModified = true;
    }

    // Merge: keep all server files, append guest files whose IDs aren't in the server set.
    // Uniquify names so a guest file doesn't shadow an existing server file.
    const serverIds   = new Set(serverTabs.map((t: any) => t.id));
    const serverNames = new Set(serverTabs.map((t: any) => t.name));
    const toAdd = guestFiles
      .filter((g: any) => !serverIds.has(g.id))
      .map((g: any) => {
        const name = uniquifyName(g.name, serverNames);
        serverNames.add(name);
        return { ...g, isDirty: false, name };
      });

    if (toAdd.length === 0 && !serverTabsModified) return;

    const merged = [...serverTabs, ...toAdd];

    const postRes = await fetch(`${apiBase}/auth/tabs`, {
      method: 'POST',
      headers: getApiHeaders(token, true),
      body: JSON.stringify({ tabs: merged }),
    });

    if (postRes.ok) {
      localStorage.removeItem('saved_tabs');
      localStorage.removeItem('saved_files');
    }
  } catch {
    // Non-fatal
  }
}
