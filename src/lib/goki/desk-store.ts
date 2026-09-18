import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DeskSign } from "./desk";
import type { Ticket } from "./workflow";

const memory = new Map<string, string>();
const safeStorage = {
  getItem: (name: string) => {
    try {
      if (typeof window === "undefined") return memory.get(name) ?? null;
      return window.localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      if (typeof window === "undefined") {
        memory.set(name, value);
        return;
      }
      window.localStorage.setItem(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem: (name: string) => {
    try {
      if (typeof window === "undefined") {
        memory.delete(name);
        return;
      }
      window.localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

interface DeskState {
  ticker: string;
  signs: Record<string, DeskSign>;
  esgSigns: Record<string, DeskSign>;
  tickets: Ticket[];
  verifier: string;
  setTicker: (ticker: string) => void;
  setVerifier: (verifier: string) => void;
  putSign: (sign: DeskSign) => void;
  putEsgSign: (sign: DeskSign) => void;
  clearSign: (ticker: string) => void;
  putTicket: (ticket: Ticket) => void;
}

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      ticker: "00005",
      signs: {},
      esgSigns: {},
      tickets: [],
      verifier: "",
      setTicker: (ticker) => set({ ticker }),
      setVerifier: (verifier) => set({ verifier }),
      putSign: (sign) => set((s) => ({ signs: { ...s.signs, [sign.ticker]: sign } })),
      putEsgSign: (sign) => set((s) => ({ esgSigns: { ...s.esgSigns, [sign.ticker]: sign } })),
      clearSign: (ticker) =>
        set((s) => {
          const next = { ...s.signs };
          delete next[ticker];
          return { signs: next };
        }),
      putTicket: (ticket) => set((s) => ({ tickets: [...s.tickets, ticket] })),
    }),
    {
      name: "goki-desk",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        ticker: s.ticker,
        signs: s.signs,
        esgSigns: s.esgSigns,
        tickets: s.tickets,
        verifier: s.verifier,
      }),
    },
  ),
);
