import type {
  AgentId,
  GraphSnapshot,
  GraphNodeSnapshot,
  Provenance,
  SyncRun,
  SyncDecision,
  MemoryDiffResult,
  StructuralDiff,
  ContradictionResult,
} from "../types";
import type { CogneeClient } from "../cogneeClient";
import { resolveLlmConfig, type LlmConfigInput } from "../llm";
import { takeSnapshot } from "../snapshot";
import { TrustStore } from "../trust/trustStore";
import { tagWithProvenance } from "./provenance";

export interface SyncEngineOptions {
  trustStore: TrustStore;
  autoMergeThreshold?: number;
  llmConfig?: LlmConfigInput;
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
  private llmConfig: LlmConfigInput | undefined;

  constructor(opts: SyncEngineOptions) {
    this.trustStore = opts.trustStore;
    this.autoMergeThreshold = opts.autoMergeThreshold ?? 0.6;
    this.llmConfig = opts.llmConfig;
  }

  async syncFromSource(
    client: CogneeClient,
    subscriberDataset: string,
    subscriberAgentId: AgentId,
    sourceDataset: string,
    sourceAgentId: AgentId,
    sourceFacts: string[],
    subscriberFacts?: string[],
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

    // Detect text-level contradictions between source and subscriber facts
    let contradictions: ContradictionResult[] = [];
    if (
      subscriberFacts &&
      subscriberFacts.length > 0 &&
      sourceFacts.length > 0
    ) {
      contradictions = await this.detectTextContradictions(
        sourceFacts,
        subscriberFacts,
        subscriberDataset,
        sourceDataset,
      );
    }
    diff.contradictions = contradictions;
    diff.summary.contradictionsDetected = contradictions.length;

    const hasContradictions = contradictions.length > 0;
    const trustScore = trustBefore.score;
    const trustHighEnough = trustScore >= this.autoMergeThreshold;

    const decision: SyncDecision =
      !hasContradictions && trustHighEnough ? "auto_merged" : "pending_review";

    const run: SyncRun = {
      id: `sync_${++this.runCounter}`,
      subscriberDataset,
      sourceDataset,
      sourceAgentId,
      beforeSnapshot: before,
      afterSnapshot: after,
      diff,
      decision,
      status: "pending",
      trustScoreBefore: trustBefore.score,
      trustScoreAfter: trustBefore.score,
      createdAt: Date.now(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  private async detectTextContradictions(
    sourceFacts: string[],
    subscriberFacts: string[],
    subscriberDataset: string,
    sourceDataset: string,
  ): Promise<ContradictionResult[]> {
    const results: ContradictionResult[] = [];
    const { endpoint, apiKey, model } = resolveLlmConfig(this.llmConfig);
    if (!apiKey) return results;

    // Batch all facts into a single LLM call for efficiency
    const numberedSub = subscriberFacts.map((f, i) => `S${i}: ${f}`).join("\n");
    const numberedSrc = sourceFacts.map((f, i) => `T${i}: ${f}`).join("\n");

    try {
      const body = {
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a contradiction detector for a multi-agent knowledge system. " +
              "Given two lists of facts (S = subscriber's existing facts, T = incoming source facts), " +
              "identify any pairs (S_i, T_j) that directly contradict each other. " +
              "Contradictions are factual conflicts where both statements cannot be simultaneously true " +
              "(e.g., different times for the same flight, different prices for the same item). " +
              'Respond with valid JSON only: { "contradictions": [{ "sIndex": number, "tIndex": number, "reason": string, "confidence": number }] }. ' +
              "Return an empty array if no contradictions exist.",
          },
          {
            role: "user",
            content:
              `Subscriber existing facts:\n${numberedSub}\n\n` +
              `Incoming source facts:\n${numberedSrc}\n\n` +
              "Which pairs (by index) contradict each other?",
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      };

      const res = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return results;

      const json = await res.json();
      const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
      const contradictions: Array<{
        sIndex: number;
        tIndex: number;
        reason: string;
        confidence: number;
      }> = parsed.contradictions ?? [];

      const seen = new Set<string>();
      for (const c of contradictions) {
        const key = `${c.sIndex}-${c.tIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const subFact = subscriberFacts[c.sIndex];
        const srcFact = sourceFacts[c.tIndex];
        if (!subFact || !srcFact) continue;
        if ((c.confidence ?? 0) < 0.6) continue;

        results.push({
          nodeLabel: `pair: S${c.sIndex}↔T${c.tIndex}`,
          sourceDataset: subscriberDataset,
          targetDataset: sourceDataset,
          existingStatement: subFact,
          incomingStatement: srcFact,
          isContradiction: true,
          relation: c.reason ?? "",
          confidence: c.confidence ?? 0,
        });
      }
    } catch {
      // LLM call failed — no contradictions detected
    }

    return results;
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
