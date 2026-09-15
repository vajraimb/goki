import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { NoteBooks } from "./types";

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

interface CloserNotesState {
  byId: Record<string, Partial<NoteBooks>>;
  setField: (id: string, key: keyof NoteBooks, value: number) => void;
  setAll: (id: string, notes: Partial<NoteBooks>) => void;
  clear: (id: string) => void;
}

export const useCloserNotes = create<CloserNotesState>()(
  persist(
    (set) => ({
      byId: {},
      setField: (id, key, value) =>
        set((s) => ({
          byId: { ...s.byId, [id]: { ...s.byId[id], [key]: value } },
        })),
      setAll: (id, notes) => set((s) => ({ byId: { ...s.byId, [id]: { ...s.byId[id], ...notes } } })),
      clear: (id) =>
        set((s) => {
          const next = { ...s.byId };
          delete next[id];
          return { byId: next };
        }),
    }),
    {
      name: "goki-closer-notes",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
