import { useCallback, useEffect, useRef, useState } from 'react';
import { clearAuthToken, getApiHeaders, getAuthToken } from '../helpers/authStorage';
import { readSavedFiles, writeSavedFiles } from '../helpers/tabUtils';

interface CodeTab {
  id: string;
  name: string;
  code: string;
  isDirty?: boolean;
  _id?: string;
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface UseAutosaveOptions {
  tabsRef: React.RefObject<CodeTab[]>;
  isLoggedIn: boolean;
  setTabs: React.Dispatch<React.SetStateAction<CodeTab[]>>;
  setIsLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  apiBase: string;
  debounceMs?: number;
}

export function useAutosave({
  tabsRef,
  isLoggedIn,
  setTabs,
  setIsLoggedIn,
  apiBase,
  debounceMs = 1500,
}: UseAutosaveOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastPayloadRef = useRef('');
  const isLoggedInRef = useRef(isLoggedIn);
  useEffect(() => { isLoggedInRef.current = isLoggedIn; }, [isLoggedIn]);

  const doSaveRef = useRef<(() => Promise<void>) | undefined>(undefined);

  doSaveRef.current = async () => {
    const currentTabs = tabsRef.current ?? [];
    const clean = currentTabs.map(t => ({ ...t, isDirty: false }));

    // Guest path — synchronous localStorage write, no network needed
    if (!isLoggedInRef.current) {
      const existing = readSavedFiles();
      const openIds = new Set(clean.map(t => t.id));
      const merged = [...existing.filter(f => !openIds.has(f.id)), ...clean];
      writeSavedFiles(merged);
      setTabs(prev => prev.map(t => ({ ...t, isDirty: false })));
      setStatus('saved');
      setLastSavedAt(Date.now());
      return;
    }

    // Server path
    const token = getAuthToken();
    if (!token) return;

    if (!currentTabs.some(t => t.isDirty)) {
      setStatus('saved');
      return;
    }

    const payload = JSON.stringify(clean);
    if (payload === lastPayloadRef.current) {
      setStatus('saved');
      return;
    }

    inFlightRef.current = true;
    setStatus('saving');

    try {
      const getRes = await fetch(`${apiBase}/auth/tabs`, { headers: getApiHeaders(token) });
      if (getRes.status === 401) {
        clearAuthToken();
        setIsLoggedIn(false);
        setStatus('error');
        inFlightRef.current = false;
        return;
      }
      const serverTabs: CodeTab[] = getRes.ok ? await getRes.json() : [];
      const openIds = new Set(clean.map(t => t.id));
      const merged = [...serverTabs.filter(t => !openIds.has(t.id)), ...clean];

      const postRes = await fetch(`${apiBase}/auth/tabs`, {
        method: 'POST',
        headers: getApiHeaders(token, true),
        body: JSON.stringify({ tabs: merged }),
      });

      if (postRes.status === 401) {
        clearAuthToken();
        setIsLoggedIn(false);
        setStatus('error');
        inFlightRef.current = false;
        return;
      }

      if (postRes.status === 413) {
        setStatus('error');
        inFlightRef.current = false;
        return;
      }

      if (!postRes.ok) throw new Error(`HTTP ${postRes.status}`);

      lastPayloadRef.current = payload;
      retryCountRef.current = 0;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setTabs(prev => prev.map(t => ({ ...t, isDirty: false })));
      setStatus('saved');
      setLastSavedAt(Date.now());
      inFlightRef.current = false;

      if (pendingRef.current) {
        pendingRef.current = false;
        doSaveRef.current?.();
      }
    } catch {
      inFlightRef.current = false;
      setStatus(!navigator.onLine ? 'offline' : 'error');

      if (retryTimerRef.current !== null) return;
      const delays = [2000, 5000, 15000, 30000];
      const delay = delays[Math.min(retryCountRef.current, delays.length - 1)];
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        doSaveRef.current?.();
      }, delay);
    }
  };

  useEffect(() => {
    const onOnline = () => {
      if (inFlightRef.current) return;
      const hasDirty = (tabsRef.current ?? []).some(t => t.isDirty);
      if (hasDirty) doSaveRef.current?.();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tabsRef]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Synchronous path for guests — writes to localStorage before the page closes
      if (!isLoggedInRef.current) {
        doSaveRef.current?.();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Guests get 300ms debounce (localStorage is sync — just batches rapid keystrokes)
  const scheduleSave = useCallback(() => {
    if (inFlightRef.current && isLoggedInRef.current) { pendingRef.current = true; return; }
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    const delay = isLoggedInRef.current ? debounceMs : 300;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      doSaveRef.current?.();
    }, delay);
  }, [debounceMs]);

  const flushNow = useCallback((): Promise<void> => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (inFlightRef.current && isLoggedInRef.current) {
      pendingRef.current = true;
      return Promise.resolve();
    }
    return doSaveRef.current?.() ?? Promise.resolve();
  }, []);

  // Expose so callers that do their own localStorage write (e.g. file import) can
  // update the status indicator without triggering a redundant save.
  const markSaved = useCallback(() => {
    setStatus('saved');
    setLastSavedAt(Date.now());
  }, []);

  return { status, lastSavedAt, scheduleSave, flushNow, markSaved };
}
