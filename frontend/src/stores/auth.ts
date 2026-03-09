import { create } from "zustand";

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  subscription_status: "admin" | "active" | "trial" | "expired";
  has_access: boolean;
  days_remaining: number;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string, firstName: string, lastName: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const TOKEN_KEY = "vision_token";
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // re-check token every 5 min
let _revalidateTimer: ReturnType<typeof setInterval> | null = null;

/** Decode JWT payload without library (browser-safe). Returns null on failure. */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

/** Check if a JWT token is expired (with 60s grace buffer). */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // can't determine — assume valid
  return Date.now() >= (payload.exp - 60) * 1000; // expire 60s early
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  // Proactively remove expired tokens
  if (token && isTokenExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getStoredToken(),
  isAuthenticated: false,
  loading: true,
  error: null,

  login: async (username, password) => {
    set({ error: null });
    try {
      const data = await apiFetch<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      storeToken(data.access_token);
      set({ token: data.access_token });
      await get().checkAuth();
      return true;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      return false;
    }
  },

  register: async (email, username, password, firstName, lastName) => {
    set({ error: null });
    try {
      const data = await apiFetch<{ access_token: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, username, password, first_name: firstName, last_name: lastName }),
      });
      storeToken(data.access_token);
      set({ token: data.access_token });
      await get().checkAuth();
      return true;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      return false;
    }
  },

  logout: () => {
    removeToken();
    if (_revalidateTimer) {
      clearInterval(_revalidateTimer);
      _revalidateTimer = null;
    }
    set({ user: null, token: null, isAuthenticated: false, loading: false, error: null });
  },

  checkAuth: async () => {
    const token = get().token ?? getStoredToken();
    if (!token || isTokenExpired(token)) {
      removeToken();
      set({ user: null, token: null, isAuthenticated: false, loading: false });
      return;
    }
    try {
      const user = await apiFetch<User>("/api/v1/auth/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      set({ user, token, isAuthenticated: true, loading: false });

      // Start periodic revalidation timer (only once)
      if (!_revalidateTimer && typeof window !== "undefined") {
        _revalidateTimer = setInterval(() => {
          const currentToken = get().token;
          if (!currentToken || isTokenExpired(currentToken)) {
            removeToken();
            set({ user: null, token: null, isAuthenticated: false, loading: false });
            if (_revalidateTimer) {
              clearInterval(_revalidateTimer);
              _revalidateTimer = null;
            }
          }
        }, REVALIDATE_INTERVAL_MS);
      }
    } catch {
      removeToken();
      set({ user: null, token: null, isAuthenticated: false, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
