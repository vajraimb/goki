import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TrainSign, TrainedHead } from "./train-desk";

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

interface TrainState {
  modelId: string;
  signs: Record<string, TrainSign>;
  lastHead: Record<string, TrainedHead>;
  setModelId: (id: string) => void;
  putSign: (sign: TrainSign) => void;
  putHead: (id: string, head: TrainedHead) => void;
}

export const useTrain = create<TrainState>()(
  persist(
    (set) => ({
      modelId: "esg-net",
      signs: {},
      lastHead: {},
      setModelId: (modelId) => set({ modelId }),
      putSign: (sign) => set((s) => ({ signs: { ...s.signs, [sign.modelId]: sign } })),
      putHead: (id, head) => set((s) => ({ lastHead: { ...s.lastHead, [id]: head } })),
    }),
    {
      name: "goki-train",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ modelId: s.modelId, signs: s.signs }),
    },
  ),
);
