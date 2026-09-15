import { createContext, useContext } from "react";
import compact from "./compact.json";
import { EMPTY_BOOKS } from "./statements";
import type { Engagement, ErrorKind, Industry, InjectKind, ScoredIssuer, SizeTier } from "./types";

type CompactRow = (typeof compact.rows)[number] & {
  ticker?: string;
  name?: string;
  industry?: Industry;
  size?: SizeTier;
  inject?: InjectKind;
  errorKinds?: ErrorKind[];
  maxRel?: number;
};

function hydrate(): Engagement {
  const issuers: ScoredIssuer[] = compact.rows.map((raw) => {
    const row = raw as CompactRow;
    return {
      issuer: {
        id: row.id,
        ticker: row.ticker ?? row.id,
        name: row.name ?? row.id,
        industry: row.industry ?? "mfg",
        size: row.size ?? "mid",
        inject: row.inject ?? "clean",
        errorKinds: row.errorKinds ?? [],
        prior: EMPTY_BOOKS,
        curr: EMPTY_BOOKS,
      },
      rules: [],
      features: [],
      pError: row.pError,
      aeErr: row.aeErr,
      cashPred: row.cashPred,
      cashResidual: row.cashResidual,
      attribution: row.attribution,
      band: row.band as ScoredIssuer["band"],
      maxRel: row.maxRel ?? 0,
    };
  });
  return {
    seed: compact.seed,
    backend: compact.backend,
    logs: compact.logs,
    metrics: compact.metrics,
    routine: compact.routine,
    golden: compact.golden,
    featureNames: compact.featureNames,
    issuers,
  };
}

export const SNAPSHOT: Engagement = hydrate();

export const EngagementCtx = createContext<Engagement>(SNAPSHOT);

export function useEngagement(): Engagement {
  return useContext(EngagementCtx) ?? SNAPSHOT;
}
