import type {
  AgentId,
  GraphSnapshot,
  GraphNodeSnapshot,
  Provenance,
  SyncRun,
  SyncDecision,
  MemoryDiffResult,
  StructuralDiff,
} from "../types";
import type { CogneeClient } from "../cogneeClient";
import { takeSnapshot } from "../snapshot";
import { TrustStore } from "../trust/trustStore";
import { tagWithProvenance } from "./provenance";

export interface SyncEngineOptions {
  trustStore: TrustStore;
  autoMergeThreshold?: number;
}

function snapshotFromTexts(texts: string[]): GraphSnapshot {
  const nodes: GraphNodeSnapshot[] = texts.map((t, i) => ({
    id: `fact_${i}`,
    label: `Fact`,
    type: "synced_fact",
    properties: { text: t },
  }));
  return { nodes, edges: [] };
}

export class SyncEngine {
  private runs = new Map<string, SyncRun>();
  private runCounter = 0;
  private trustStore: TrustStore;
  private autoMergeThreshold: number;

  constructor(opts: SyncEngineOptions) {
    this.trustStore = opts.trustStore;
    this.autoMergeThreshold = opts.autoMergeThreshold ?? 0.6;
  }

  async syncFromSource(
    client: CogneeClient,
    subscriberDataset: string,
    subscriberAgentId: AgentId,
    sourceDataset: string,
    sourceAgentId: AgentId,
    sourceFacts: string[],
  ): Promise<SyncRun> {
    const trustBefore = this.trustStore.get(subscriberAgentId, sourceAgentId);

    const beforeSnapshot: GraphSnapshot = await takeSnapshot(
      client,
      subscriberDataset,
    ).catch(() => ({ nodes: [], edges: [] }));

    const provenance: Provenance = {
      sourceAgentId,
      factId: `src_${Date.now()}`,
      timestamp: Date.now(),
    };

    for (const text of sourceFacts) {
      const tagged = tagWithProvenance(text, provenance);
      await client.add({ type: "text", text: tagged }, subscriberDataset);
    }

    const after = snapshotFromTexts(sourceFacts);
    const before = beforeSnapshot.nodes.length
      ? beforeSnapshot
      : { nodes: [], edges: [] };

    const beforeIds = new Set(before.nodes.map((n) => n.id));
    const addedNodes = after.nodes.filter((n) => !beforeIds.has(n.id));
    const structural: StructuralDiff = {
      nodes: { added: addedNodes, removed: [], modified: [] },
      edges: { added: [], removed: [], modified: [] },
    };

    const diff: MemoryDiffResult = {
      before,
      after,
      structural,
      contradictions: [],
      drifts: [],
      summary: {
        totalNodesBefore: before.nodes.length,
        totalNodesAfter: after.nodes.length,
        totalEdgesBefore: before.edges.length,
        totalEdgesAfter: after.edges.length,
        nodesAdded: addedNodes.length,
        nodesRemoved: 0,
        nodesModified: 0,
        edgesAdded: 0,
        edgesRemoved: 0,
        edgesModified: 0,
        driftsDetected: 0,
        contradictionsDetected: 0,
      },
    };

    const hasContradictions = diff.contradictions.length > 0;
    const trustScore = trustBefore.score;
    const trustHighEnough = trustScore >= this.autoMergeThreshold;

    const decision: SyncDecision =
      !hasContradictions && trustHighEnough ? "auto_merged" : "pending_review";
    const trustAction = decision === "auto_merged" ? "accept" : "reject";
    const updatedTrust = this.trustStore.adjust(
      subscriberAgentId,
      sourceAgentId,
      trustAction,
    );

    const run: SyncRun = {
      id: `sync_${++this.runCounter}`,
      subscriberDataset,
      sourceDataset,
      beforeSnapshot: before,
      afterSnapshot: after,
      diff,
      decision,
      status: "pending",
      trustScoreBefore: trustBefore.score,
      trustScoreAfter: updatedTrust.score,
      createdAt: Date.now(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  getRun(runId: string): SyncRun | undefined {
    return this.runs.get(runId);
  }

  getRunsForDataset(datasetName: string): SyncRun[] {
    return Array.from(this.runs.values()).filter(
      (r) => r.subscriberDataset === datasetName,
    );
  }

  allRuns(): SyncRun[] {
    return Array.from(this.runs.values());
  }

  reset(): void {
    this.runs.clear();
    this.runCounter = 0;
  }
}
