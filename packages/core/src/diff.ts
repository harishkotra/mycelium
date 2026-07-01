import type { GraphSnapshot, MemoryDiffResult } from "./types";
import { diffSnapshots } from "./structuralDiff";
import { detectDrift, type DriftDetectorOptions } from "./driftDetector";
import {
  detectContradictions,
  type ContradictionDetectorOptions,
} from "./contradictionDetector";
import type { CogneeClient } from "./cogneeClient";

export interface RunDiffOptions {
  drift?: DriftDetectorOptions;
  contradiction?: ContradictionDetectorOptions;
}

/**
 * Run the full diff pipeline: structural diff, drift detection,
 * contradiction detection. Both snapshots must already be resolved.
 */
export async function runDiff(
  before: GraphSnapshot,
  after: GraphSnapshot,
  client: CogneeClient | null,
  datasetName: string,
  opts?: RunDiffOptions,
): Promise<MemoryDiffResult> {
  const structural = diffSnapshots(before, after);
  const drifts = detectDrift(before, after, opts?.drift);
  const contradictions = await detectContradictions(
    client,
    datasetName,
    after,
    before,
    opts?.contradiction,
  );

  return {
    before,
    after,
    structural,
    drifts,
    contradictions,
    summary: {
      totalNodesBefore: before.nodes.length,
      totalNodesAfter: after.nodes.length,
      totalEdgesBefore: before.edges.length,
      totalEdgesAfter: after.edges.length,
      nodesAdded: structural.nodes.added.length,
      nodesRemoved: structural.nodes.removed.length,
      nodesModified: structural.nodes.modified.length,
      edgesAdded: structural.edges.added.length,
      edgesRemoved: structural.edges.removed.length,
      edgesModified: structural.edges.modified.length,
      driftsDetected: drifts.length,
      contradictionsDetected: contradictions.length,
    },
  };
}
