import type { ReactNode } from "react";
import { EngagementCtx, SNAPSHOT } from "./engagement-context";

export function EngagementProvider({ children }: { children: ReactNode }) {
  return <EngagementCtx.Provider value={SNAPSHOT}>{children}</EngagementCtx.Provider>;
}

export { useEngagement } from "./engagement-context";
