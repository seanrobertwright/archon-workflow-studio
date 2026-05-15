import { create } from 'zustand';

const STORAGE_KEY = 'archon-studio:connection';

export interface ConnectionSettings {
  archonUrl: string;
  cwd: string;
  /** Empty string means no auth header. */
  token: string;
}

interface ConnectionState {
  settings: ConnectionSettings | null;
  /** null = never tested; 'ok' = last ping succeeded; 'error' = last ping failed. */
  pingStatus: 'ok' | 'error' | null;
  save: (s: ConnectionSettings) => void;
  clear: () => void;
  setPingStatus: (s: 'ok' | 'error') => void;
  hydrate: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  settings: null,
  pingStatus: null,

  save: (s) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // private mode / quota exceeded — non-fatal
    }
    set({ settings: s, pingStatus: null });
  },

  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal
    }
    set({ settings: null, pingStatus: null });
  },

  setPingStatus: (s) => set({ pingStatus: s }),

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
      if (parsed.archonUrl && typeof parsed.cwd === 'string') {
        set({
          settings: { archonUrl: parsed.archonUrl, cwd: parsed.cwd, token: parsed.token ?? '' },
        });
      }
    } catch {
      // corrupt storage — ignore
    }
  },
}));
