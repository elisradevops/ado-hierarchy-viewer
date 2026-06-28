const NS = 'ado-hierarchy-viewer';

function key(name: string): string {
  return `${NS}:${name}`;
}

export const storage = {
  local: {
    get(name: string): string | null {
      try { return localStorage.getItem(key(name)); } catch { return null; }
    },
    set(name: string, value: string): boolean {
      try { localStorage.setItem(key(name), value); return true; } catch { return false; }
    },
    remove(name: string): void {
      try { localStorage.removeItem(key(name)); } catch { /* ignore */ }
    },
  },
  session: {
    get(name: string): string | null {
      try { return sessionStorage.getItem(key(name)); } catch { return null; }
    },
    set(name: string, value: string): boolean {
      try { sessionStorage.setItem(key(name), value); return true; } catch { return false; }
    },
    remove(name: string): void {
      try { sessionStorage.removeItem(key(name)); } catch { /* ignore */ }
    },
  },
};
