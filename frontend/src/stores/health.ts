import { create } from "zustand";

interface HealthState {
  backendOnline: boolean;
  lastCheck: number;
  checkHealth: () => Promise<void>;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const useHealthStore = create<HealthState>((set) => ({
  backendOnline: true, // assume online until proven otherwise
  lastCheck: 0,
  checkHealth: async () => {
    try {
      const res = await fetch(`${BASE}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      set({ backendOnline: res.ok, lastCheck: Date.now() });
    } catch {
      set({ backendOnline: false, lastCheck: Date.now() });
    }
  },
}));
