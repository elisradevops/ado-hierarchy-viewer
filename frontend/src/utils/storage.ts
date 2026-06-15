const NS = 'ado-hierarchy-viewer';
const COOKIE_EXPIRY_DAYS = 365;

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

export const cookies = {
  get(name: string): string | null {
    try {
      const match = document.cookie.match(
        new RegExp('(?:^|; )' + encodeURIComponent(key(name)) + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : null;
    } catch { return null; }
  },
  set(name: string, value: string): void {
    try {
      const expires = new Date(Date.now() + COOKIE_EXPIRY_DAYS * 864e5).toUTCString();
      document.cookie = `${encodeURIComponent(key(name))}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch { /* ignore */ }
  },
  remove(name: string): void {
    try {
      document.cookie = `${encodeURIComponent(key(name))}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    } catch { /* ignore */ }
  },
};
