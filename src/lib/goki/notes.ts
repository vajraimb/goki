import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Disposition = "unset" | "cleared" | "rounding" | "reclass" | "escalate";

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  unset: "未处置",
  cleared: "已清除",
  rounding: "舍入可解释",
  reclass: "重分类",
  escalate: "上报经理",
};

interface NotesState {
  byId: Record<string, { status: Disposition; note: string }>;
  showAnswers: boolean;
  setShowAnswers: (v: boolean) => void;
  setStatus: (id: string, status: Disposition) => void;
  setNote: (id: string, note: string) => void;
}

/** Iframe / ITP: localStorage may throw. Never let that blank the preview. */
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

export const useNotes = create<NotesState>()(
  persist(
    (set) => ({
      byId: {},
      showAnswers: false,
      setShowAnswers: (showAnswers) => set({ showAnswers }),
      setStatus: (id, status) =>
        set((s) => ({
          byId: { ...s.byId, [id]: { status, note: s.byId[id]?.note ?? "" } },
        })),
      setNote: (id, note) =>
        set((s) => ({
          byId: {
            ...s.byId,
            [id]: { status: s.byId[id]?.status ?? "unset", note },
          },
        })),
    }),
    {
      name: "goki-notes",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
