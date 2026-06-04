import Cookies from 'js-cookie';

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

    // Union: open tabs + saved files not already represented as an open tab
    const openIds = new Set(openTabs.map((t: any) => t.id));
    const guestFiles = [...openTabs, ...savedFiles.filter((f: any) => !openIds.has(f.id))];

    if (guestFiles.length === 0) return;

    const headers = getApiHeaders(token);

    // Fetch existing server files
    const getRes = await fetch(`${apiBase}/auth/tabs`, { headers });
    const serverTabs: any[] = getRes.ok ? await getRes.json() : [];

    // Merge: keep all server files, append guest files whose IDs aren't in the server set
    const serverIds = new Set(serverTabs.map((t: any) => t.id));
    const toAdd = guestFiles.filter((g: any) => !serverIds.has(g.id));

    if (toAdd.length === 0) return;

    const merged = [...serverTabs, ...toAdd.map((t: any) => ({ ...t, isDirty: false }))];

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
