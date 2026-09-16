import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { canonicalizeGate, evaluateGate, type Verdict } from "./verdict";
import { ENGINE_VERSION, RULE_LIB_VERSION, type RuleConfig } from "./library";
import { vouchIssuer } from "./vouch";
import type { Issuer } from "./types";

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface Evidence {
  page?: string;
  table?: string;
  row?: string;
  extractor?: "primary" | "secondary";
  lang?: "zh" | "en";
}

export interface ExtractConflict {
  ticker: string;
  target: string;
  a: number;
  b: number;
  label: string;
}

const conflicts: ExtractConflict[] = [];

export function recordConflict(c: ExtractConflict) {
  const i = conflicts.findIndex((x) => x.ticker === c.ticker && x.target === c.target);
  if (i >= 0) conflicts[i] = c;
  else conflicts.push(c);
}

export function extractConflicts(): ExtractConflict[] {
  return [...conflicts];
}

export interface RunRow {
  issuerId: string;
  ticker: string;
  name: string;
  verdict: Verdict;
  canonical: string;
  vouchOpen: number;
}

export interface Run {
  id: string;
  rcId: string;
  at: string;
  mappingHash: string;
  rows: RunRow[];
}

export interface Manifest {
  runId: string;
  rcId: string;
  ruleLibVersion: string;
  engineVersion: string;
  mappingHash: string;
  checksum: string;
  preparedBy?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface RunDiffRow {
  ticker: string;
  a: Verdict;
  b: Verdict;
  changed: boolean;
}

export interface RunDiff {
  a: string;
  b: string;
  nChanged: number;
  rows: RunDiffRow[];
}

function mappingHash(writes: { ticker: string; target: string; million: number }[]): string {
  const s = writes
    .map((w) => `${w.ticker}:${w.target}:${w.million}`)
    .sort()
    .join("|");
  return djb2(s || "empty");
}

export function freezeRun(
  rc: RuleConfig,
  issuers: Issuer[],
  writes: { ticker: string; target: string; million: number }[],
): { run: Run; manifest: Manifest } {
  const rows: RunRow[] = issuers.map((iss) => {
    const gate = evaluateGate(iss);
    return {
      issuerId: iss.id,
      ticker: iss.ticker,
      name: iss.name,
      verdict: gate.verdict,
      canonical: canonicalizeGate(iss),
      vouchOpen: vouchIssuer(iss).filter((v) => v.verdict !== "pass").length,
    };
  });
  const run: Run = {
    id: `run-${Date.now().toString(36)}`,
    rcId: rc.id,
    at: new Date().toISOString(),
    mappingHash: mappingHash(writes),
    rows,
  };
  const body = JSON.stringify({ rc: rc.id, rows: rows.map((r) => ({ t: r.ticker, c: r.canonical })) });
  const manifest: Manifest = {
    runId: run.id,
    rcId: rc.id,
    ruleLibVersion: rc.ruleLibVersion || RULE_LIB_VERSION,
    engineVersion: rc.engineVersion || ENGINE_VERSION,
    mappingHash: run.mappingHash,
    checksum: djb2(body),
  };
  return { run, manifest };
}

export function diffRuns(a: Run, b: Run): RunDiff {
  const rows: RunDiffRow[] = a.rows.map((r) => {
    const o = b.rows.find((x) => x.ticker === r.ticker);
    return {
      ticker: r.ticker,
      a: r.verdict,
      b: o?.verdict ?? r.verdict,
      changed: o ? o.canonical !== r.canonical || o.verdict !== r.verdict : false,
    };
  });
  return { a: a.id, b: b.id, nChanged: rows.filter((r) => r.changed).length, rows };
}

interface RunState {
  runs: Run[];
  manifests: Manifest[];
  preparedBy: string;
  reviewedBy: string;
  put: (run: Run, manifest: Manifest) => void;
  review: (runId: string, reviewer: string, note: string) => void;
  setNames: (prep: string, rev: string) => void;
}

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
      if (typeof window === "undefined") memory.delete(name);
      else window.localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

export const useRuns = create<RunState>()(
  persist(
    (set) => ({
      runs: [],
      manifests: [],
      preparedBy: "",
      reviewedBy: "",
      put: (run, manifest) =>
        set((s) => ({
          runs: [run, ...s.runs].slice(0, 24),
          manifests: [manifest, ...s.manifests].slice(0, 24),
        })),
      review: (runId, reviewer, note) =>
        set((s) => ({
          manifests: s.manifests.map((m) =>
            m.runId === runId ? { ...m, reviewedBy: reviewer, reviewNote: note } : m,
          ),
        })),
      setNames: (preparedBy, reviewedBy) => set({ preparedBy, reviewedBy }),
    }),
    { name: "goki-runs", storage: createJSONStorage(() => safeStorage) },
  ),
);
