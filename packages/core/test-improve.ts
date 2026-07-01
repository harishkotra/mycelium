import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env") });

import { initRuntime } from "./src/cogneeClient.ts";
import { resolveContradictions } from "./src/contradictionResolver.ts";
import type { ContradictionResult } from "./src/types.ts";

initRuntime();

async function main() {
  let passed = 0,
    failed = 0;
  function assert(label, ok) {
    if (ok) passed++;
    else failed++;
    const m = ok ? "log" : "error";
    console[m](`  ${ok ? "PASS" : "FAIL"} ${label}`);
  }

  // ─── Contradiction resolver (pure function) ──────────────────────
  console.log("\n=== Contradiction resolver ===");

  const sampleContradictions: ContradictionResult[] = [
    {
      nodeLabel: "Alice",
      sourceDataset: "ds-test",
      targetDataset: "ds-test",
      existingStatement: "Alice is afraid of flying.",
      incomingStatement: "Alice enjoys flying.",
      isContradiction: true,
      relation: "contradicts",
      confidence: 0.92,
    },
    {
      nodeLabel: "Paris",
      sourceDataset: "ds-test",
      targetDataset: "ds-test",
      existingStatement: "Paris is in France.",
      incomingStatement: "Paris is in Texas.",
      isContradiction: true,
      relation: "contradicts",
      confidence: 0.45,
    },
  ];

  // flag_all (default) — both flagged regardless of confidence
  const flagged = resolveContradictions(sampleContradictions);
  assert("flag_all returns 2 resolutions", flagged.length === 2);
  assert(
    "flag_all: high confidence is kept_both_flagged",
    flagged[0].resolution === "kept_both_flagged",
  );
  assert(
    "flag_all: low confidence is kept_both_flagged",
    flagged[1].resolution === "kept_both_flagged",
  );

  // keep_newer — above threshold wins incoming
  const newer = resolveContradictions(sampleContradictions, {
    strategy: "keep_newer",
    confidenceThreshold: 0.8,
  });
  assert("keep_newer returns 2 resolutions", newer.length === 2);
  assert(
    "keep_newer: high confidence -> kept_incoming",
    newer[0].resolution === "kept_incoming",
  );
  assert(
    "keep_newer: low confidence -> kept_both_flagged",
    newer[1].resolution === "kept_both_flagged",
  );

  // keep_higher_trust — above threshold wins existing
  const existing = resolveContradictions(sampleContradictions, {
    strategy: "keep_higher_trust",
    confidenceThreshold: 0.8,
  });
  assert("keep_higher_trust returns 2", existing.length === 2);
  assert(
    "keep_higher_trust: high confidence -> kept_existing",
    existing[0].resolution === "kept_existing",
  );
  assert(
    "keep_higher_trust: low confidence -> kept_both_flagged",
    existing[1].resolution === "kept_both_flagged",
  );

  // Empty contradictions
  const empty = resolveContradictions([]);
  assert("empty list returns []", empty.length === 0);

  // Resolution with custom threshold (all above 0.4, none above 0.9)
  const customThreshold = resolveContradictions(sampleContradictions, {
    strategy: "keep_newer",
    confidenceThreshold: 0.4,
  });
  assert(
    "threshold 0.4: both resolved as incoming",
    customThreshold.every((c) => c.resolution === "kept_incoming"),
  );

  // ─── Agent.improve() wrapper (mock Cognee client) ───────────────
  console.log("\n=== Agent.improve() wrapper ===");
  const { CogneeClient } = await import("./src/cogneeClient.ts");
  const { Agent } = await import("./src/agent.ts");

  // Create a real CogneeClient but use an empty dataset that won't trigger
  // complex pipelines. improve() on an empty dataset is a safe no-op.
  const client = await CogneeClient.create();
  const dsImprove = "ds_improve_" + Date.now();

  // Add a single fact so the dataset exists
  await client.add(
    { type: "text", text: "[test] Alice is a test subject." },
    dsImprove,
  );
  await client.waitForIndexingComplete(dsImprove);

  const agent = new Agent("test-agent", dsImprove, client);

  // Call improve() with diff but no auto-resolve (default)
  const result1 = await agent.improve();
  assert(
    "improve() returns improveResult",
    result1.improveResult !== undefined,
  );
  assert("improve() returns diff", result1.diff !== undefined);
  assert(
    "improve() returns resolvedContradictions array",
    Array.isArray(result1.resolvedContradictions),
  );
  assert("diff has structural field", result1.diff.structural !== undefined);
  assert("diff has summary field", result1.diff.summary !== undefined);
  assert(
    "no auto-resolve by default",
    result1.resolvedContradictions.length === 0,
  );

  // Call improve() with autoResolve
  const result2 = await agent.improve({
    autoResolve: true,
    resolutionStrategy: "keep_newer",
    resolutionConfidenceThreshold: 0.8,
  });
  assert("autoResolve: structure is same", result2.improveResult !== undefined);
  assert("autoResolve: diff is present", result2.diff !== undefined);
  assert(
    "autoResolve: resolvedContradictions is array",
    Array.isArray(result2.resolvedContradictions),
  );

  // Cleanup
  await client.forget({ kind: "dataset", dataset: { name: dsImprove } });

  // ─── Agent.improve() with fixture-based mock ─────────────────────
  console.log("\n=== Agent.improve() with fixture mock ===");

  // Build a mock CogneeClient that returns fixture snapshots
  const { fixtureSnapshot } = await import("./src/snapshot.ts");

  let mockImproveCallCount = 0;
  let mockSearchCallCount = 0;

  class MockCogneeClient {
    async improve(opts) {
      mockImproveCallCount++;
      return {
        stagesRun: ["mock"],
        memifyResult: null,
        feedbackEntriesProcessed: 0,
        feedbackEntriesApplied: 0,
        sessionsPersisted: 0,
        edgesSynced: 0,
      };
    }
    async search(query, opts) {
      mockSearchCallCount++;
      // Return the fixture data for the dataset name
      const snap = fixtureSnapshot(opts?.datasets?.[0] ?? "no_conflict");
      return {
        search_type: "GRAPH_COMPLETION",
        result: { kind: "Text", data: "" },
        context: null,
        graphs: {
          default: {
            nodes: snap.nodes.map((n) => ({ id: n.id, label: n.label })),
            edges: snap.edges.map((e) => ({
              source: e.sourceNodeId,
              target: e.targetNodeId,
              relationship: e.relationship,
              weight: null,
            })),
          },
        },
        diagnostics: null,
        datasets: opts?.datasets ?? null,
        only_context: true,
        use_combined_context: false,
        verbose: false,
      };
    }
    async forget() {
      return {};
    }
    async datasets() {
      return [];
    }
    async waitForIndexingComplete() {}
    async recall() {
      return {
        items: [],
        searchTypeUsed: null,
        autoRouted: false,
        searchResponse: null,
      };
    }
    async remember() {
      return {};
    }
    async add() {
      return {};
    }
    async cognify() {
      return {
        chunks: 0,
        entities: 0,
        edges: 0,
        summaries: 0,
        embeddings: 0,
        alreadyCompleted: false,
        priorPipelineRunId: null,
      };
    }
  }

  const mockClient = new MockCogneeClient();
  const mockAgent = new Agent("mock-agent", "no_conflict", mockClient);

  const mockResult = await mockAgent.improve({
    diffOptions: {},
    autoResolve: true,
    resolutionStrategy: "flag_all",
  });

  assert("mock improve was called", mockImproveCallCount >= 1);
  assert("mock search was called (snapshots)", mockSearchCallCount >= 2);
  assert(
    "mock improve returns improveResult",
    mockResult.improveResult?.stagesRun?.[0] === "mock",
  );
  assert("mock improve returns diff", mockResult.diff?.summary !== undefined);
  assert(
    "mock diff has before/after nodes",
    mockResult.diff.before.nodes.length > 0,
  );
  assert("mock diff has after nodes", mockResult.diff.after.nodes.length > 0);
  // no_conflict snapshot has the same data in before and after → no diff
  assert(
    "mock diff: no contradictions",
    mockResult.diff.contradictions.length === 0,
  );
  assert(
    "mock diff: no nodes added (same snapshot)",
    mockResult.diff.summary.nodesAdded === 0,
  );
  assert(
    "mock auto-resolve: no contradictions to resolve",
    mockResult.resolvedContradictions.length === 0,
  );

  // Test with different before/after snapshots
  class MockCogneeClientDiffSnapshots {
    private callCount = 0;
    async improve(opts) {
      return {
        stagesRun: ["mock"],
        memifyResult: null,
        feedbackEntriesProcessed: 0,
        feedbackEntriesApplied: 0,
        sessionsPersisted: 0,
        edgesSynced: 0,
      };
    }
    async search(query, opts) {
      this.callCount++;
      // Return different fixture for before vs after
      // First call = before (wedding_a), second call = after (wedding_b)
      const name = this.callCount === 1 ? "wedding_a" : "wedding_b";
      const snap = fixtureSnapshot(name);
      return {
        search_type: "GRAPH_COMPLETION",
        result: { kind: "Text", data: "" },
        context: null,
        graphs: {
          default: {
            nodes: snap.nodes.map((n) => ({ id: n.id, label: n.label })),
            edges: snap.edges.map((e) => ({
              source: e.sourceNodeId,
              target: e.targetNodeId,
              relationship: e.relationship,
              weight: null,
            })),
          },
        },
        diagnostics: null,
        datasets: opts?.datasets ?? null,
        only_context: true,
        use_combined_context: false,
        verbose: false,
      };
    }
    async forget() {
      return {};
    }
    async datasets() {
      return [];
    }
    async waitForIndexingComplete() {}
    async recall() {
      return {
        items: [],
        searchTypeUsed: null,
        autoRouted: false,
        searchResponse: null,
      };
    }
    async remember() {
      return {};
    }
    async add() {
      return {};
    }
    async cognify() {
      return {
        chunks: 0,
        entities: 0,
        edges: 0,
        summaries: 0,
        embeddings: 0,
        alreadyCompleted: false,
        priorPipelineRunId: null,
      };
    }
  }

  const diffMockClient = new MockCogneeClientDiffSnapshots();
  const diffMockAgent = new Agent(
    "diff-mock-agent",
    "wedding_a",
    diffMockClient,
  );

  const diffMockResult = await diffMockAgent.improve();
  assert(
    "diff mock: nodes added (Mike is new)",
    diffMockResult.diff.summary.nodesAdded === 1,
  );
  assert(
    "diff mock: edges added",
    diffMockResult.diff.summary.edgesAdded === 1,
  );
  assert(
    "diff mock: edges removed",
    diffMockResult.diff.summary.edgesRemoved === 1,
  );

  // ─── Final tally ──────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
