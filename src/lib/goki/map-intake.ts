import { create } from "zustand";
import { applyTargetWrites, sinkOf } from "./map-net";
import { recordConflict, type Evidence } from "./run";
import type { Issuer } from "./types";

export interface IntakeWrite {
  ticker: string;
  label: string;
  target: string;
  million: number;
  evidence?: Evidence;
}

interface IntakeState {
  writes: IntakeWrite[];
  put: (w: IntakeWrite) => void;
  putMany: (ws: IntakeWrite[]) => void;
  remove: (ticker: string, target: string) => void;
  clearTicker: (ticker: string) => void;
  clearAll: () => void;
}

function considerConflict(prev: IntakeWrite | undefined, w: IntakeWrite) {
  if (!prev) return;
  if (Math.abs(prev.million - w.million) < 1e-6) return;
  if (prev.evidence?.extractor && w.evidence?.extractor && prev.evidence.extractor !== w.evidence.extractor) {
    recordConflict({ ticker: w.ticker, target: w.target, a: prev.million, b: w.million, label: w.label });
  }
}

export const useMapIntake = create<IntakeState>()((set) => ({
  writes: [],
  put: (w) =>
    set((s) => {
      const prev = s.writes.find((x) => x.ticker === w.ticker && x.target === w.target);
      considerConflict(prev, w);
      return {
        writes: [...s.writes.filter((x) => !(x.ticker === w.ticker && x.target === w.target)), w],
      };
    }),
  putMany: (ws) =>
    set((s) => {
      let writes = s.writes;
      for (const w of ws) {
        const prev = writes.find((x) => x.ticker === w.ticker && x.target === w.target);
        considerConflict(prev, w);
        writes = [...writes.filter((x) => !(x.ticker === w.ticker && x.target === w.target)), w];
      }
      return { writes };
    }),
  remove: (ticker, target) => set((s) => ({ writes: s.writes.filter((x) => !(x.ticker === ticker && x.target === target)) })),
  clearTicker: (ticker) => set((s) => ({ writes: s.writes.filter((w) => w.ticker !== ticker) })),
  clearAll: () => set({ writes: [] }),
}));

export function liveIssuers(base: Issuer[]): Issuer[] {
  const writes = useMapIntake.getState().writes;
  if (writes.length === 0) return base;
  return base.map((i) => applyTargetWrites(i, writes));
}

export function liveIssuer(issuer: Issuer): Issuer {
  return applyTargetWrites(issuer, useMapIntake.getState().writes);
}

export function writesFor(ticker: string): IntakeWrite[] {
  return useMapIntake.getState().writes.filter((w) => w.ticker === ticker);
}

export function canWriteTarget(targetId: string): boolean {
  return sinkOf(targetId).book !== "none";
}
