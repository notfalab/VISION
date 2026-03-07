import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ── Badge definitions ── */
export const BADGES = [
  { id: "foundation", label: "Foundation", description: "Complete chapters 1-2", icon: "BookOpen", color: "var(--color-neon-cyan)" },
  { id: "chart-reader", label: "Chart Reader", description: "Complete chapters 3-4", icon: "CandlestickChart", color: "var(--color-neon-green)" },
  { id: "indicator-master", label: "Indicator Master", description: "Complete chapters 5-6", icon: "Gauge", color: "var(--color-neon-amber)" },
  { id: "smart-money", label: "Smart Money", description: "Complete chapters 7-8", icon: "Brain", color: "var(--color-neon-purple)" },
  { id: "graduate", label: "Graduate", description: "Complete all chapters", icon: "GraduationCap", color: "var(--color-neon-cyan)" },
  { id: "quiz-master", label: "Quiz Master", description: "Score 90%+ on final quiz", icon: "Trophy", color: "var(--color-neon-amber)" },
  { id: "perfect-streak", label: "Perfect Streak", description: "5+ answer streak", icon: "Zap", color: "var(--color-neon-green)" },
  { id: "trader", label: "Paper Trader", description: "Complete 10 paper trades", icon: "TrendingUp", color: "var(--color-neon-cyan)" },
] as const;

export type BadgeId = (typeof BADGES)[number]["id"];

/* ── Paper trade ── */
export interface PaperTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  size: number;
  pnl: number | null;
  openedAt: number;
  closedAt: number | null;
}

/* ── Store state ── */
interface AcademyState {
  // Chapter progress
  completedChapters: string[];
  markChapterComplete: (chapterId: string) => void;

  // Quiz
  quizScore: number | null;
  quizMaxStreak: number;
  quizXp: number;
  setQuizResult: (score: number, maxStreak: number, xp: number) => void;

  // Badges
  earnedBadges: BadgeId[];
  earnBadge: (id: BadgeId) => void;

  // Paper trading
  balance: number;
  trades: PaperTrade[];
  openTrade: (trade: Omit<PaperTrade, "id" | "exitPrice" | "pnl" | "closedAt">) => string;
  closeTrade: (id: string, exitPrice: number) => void;
  resetPaperTrading: () => void;

  // Total XP
  totalXp: number;
  addXp: (amount: number) => void;
}

const INITIAL_BALANCE = 100_000;

export const useAcademyStore = create<AcademyState>()(
  persist(
    (set, get) => ({
      completedChapters: [],
      markChapterComplete: (chapterId) =>
        set((s) => ({
          completedChapters: s.completedChapters.includes(chapterId)
            ? s.completedChapters
            : [...s.completedChapters, chapterId],
        })),

      quizScore: null,
      quizMaxStreak: 0,
      quizXp: 0,
      setQuizResult: (score, maxStreak, xp) =>
        set({ quizScore: score, quizMaxStreak: maxStreak, quizXp: xp }),

      earnedBadges: [],
      earnBadge: (id) =>
        set((s) => ({
          earnedBadges: s.earnedBadges.includes(id)
            ? s.earnedBadges
            : [...s.earnedBadges, id],
        })),

      balance: INITIAL_BALANCE,
      trades: [],
      openTrade: (trade) => {
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({
          trades: [...s.trades, { ...trade, id, exitPrice: null, pnl: null, closedAt: null }],
        }));
        return id;
      },
      closeTrade: (id, exitPrice) =>
        set((s) => {
          const trade = s.trades.find((t) => t.id === id);
          if (!trade || trade.closedAt) return s;
          const pnl =
            trade.direction === "long"
              ? (exitPrice - trade.entryPrice) * trade.size
              : (trade.entryPrice - exitPrice) * trade.size;
          return {
            trades: s.trades.map((t) =>
              t.id === id ? { ...t, exitPrice, pnl, closedAt: Date.now() } : t,
            ),
            balance: s.balance + pnl,
          };
        }),
      resetPaperTrading: () => set({ balance: INITIAL_BALANCE, trades: [] }),

      totalXp: 0,
      addXp: (amount) => set((s) => ({ totalXp: s.totalXp + amount })),
    }),
    { name: "vision-academy" },
  ),
);
