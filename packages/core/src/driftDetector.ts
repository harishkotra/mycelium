import type { GraphSnapshot, DriftResult } from "./types";

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  if (mag === 0) return 1;
  return 1 - dot / mag;
}

export interface DriftDetectorOptions {
  threshold?: number;
  embeddings?: Record<string, { before: number[]; after: number[] }>;
}

/**
 * Detect embedding drift for nodes that exist in both snapshots.
 * When `embeddings` is not provided, returns an empty array (the caller
 * is expected to provide embedding data separately).
 */
export function detectDrift(
  before: GraphSnapshot,
  after: GraphSnapshot,
  options?: DriftDetectorOptions,
): DriftResult[] {
  const threshold = options?.threshold ?? 0.15;
  const embeddings = options?.embeddings;
  if (!embeddings) return [];

  const results: DriftResult[] = [];
  const beforeIds = new Set(before.nodes.map((n) => n.id));
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]));

  for (const nodeId of beforeIds) {
    const pair = embeddings[nodeId];
    const afterNode = afterNodeMap.get(nodeId);
    if (!pair || !afterNode) continue;

    const dist = cosineDistance(pair.before, pair.after);
    if (dist > threshold) {
      results.push({
        nodeId,
        label: afterNode.label,
        beforeEmbedding: pair.before,
        afterEmbedding: pair.after,
        cosineDistance: dist,
      });
    }
  }

  return results.sort((a, b) => b.cosineDistance - a.cosineDistance);
}

export { cosineDistance };
