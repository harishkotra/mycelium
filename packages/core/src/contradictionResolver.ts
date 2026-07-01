import type {
  ContradictionResult,
  ResolvedContradiction,
  ResolutionStrategy,
} from "./types";

export interface ResolveContradictionsOptions {
  strategy?: ResolutionStrategy;
  /** Only auto-resolve contradictions above this confidence (0-1). */
  confidenceThreshold?: number;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Given a list of detected contradictions, decide how to resolve each one.
 * This is a pure decision function — no Cognee calls. The caller is
 * responsible for executing the resolution (e.g., forgetting losing facts).
 *
 * Strategies:
 * - `"flag_all"` — keep both, mark all as flagged (default).
 * - `"keep_newer"` — incoming fact wins.
 * - `"keep_higher_trust"` — existing fact wins.
 */
export function resolveContradictions(
  contradictions: ContradictionResult[],
  opts?: ResolveContradictionsOptions,
): ResolvedContradiction[] {
  const strategy = opts?.strategy ?? "flag_all";
  const threshold = opts?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  return contradictions.map((c) => {
    const confident = c.confidence >= threshold;

    if (strategy === "flag_all" || !confident) {
      return {
        nodeLabel: c.nodeLabel,
        existingStatement: c.existingStatement,
        incomingStatement: c.incomingStatement,
        resolution: "kept_both_flagged" as const,
        confidence: c.confidence,
      };
    }

    if (strategy === "keep_newer") {
      return {
        nodeLabel: c.nodeLabel,
        existingStatement: c.existingStatement,
        incomingStatement: c.incomingStatement,
        resolution: "kept_incoming" as const,
        confidence: c.confidence,
      };
    }

    return {
      nodeLabel: c.nodeLabel,
      existingStatement: c.existingStatement,
      incomingStatement: c.incomingStatement,
      resolution: "kept_existing" as const,
      confidence: c.confidence,
    };
  });
}
