#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEnv = resolve(__dirname, "../../core/.env");
if (existsSync(coreEnv)) dotenv.config({ path: coreEnv });

import {
  initRuntime,
  CogneeClient,
  Agent,
  SyncEngine,
  TrustStore,
  acceptSync,
  rejectSync,
  fixtureSnapshot,
} from "@mycelium/core";

const AGENTS_FILE = resolve(
  __dirname,
  "../../../.mycelium/agents/registry.json",
);
const RUNS_DIR = resolve(__dirname, "../../../.mycelium/sync-runs");

interface AgentRecord {
  agentId: string;
  datasetName: string;
  facts: string[];
}

function loadAgents(): Map<string, AgentRecord> {
  const map = new Map<string, AgentRecord>();
  try {
    const raw = readFileSync(AGENTS_FILE, "utf-8");
    const arr: AgentRecord[] = JSON.parse(raw);
    for (const r of arr) map.set(r.agentId, r);
  } catch {}
  return map;
}

function fmt(val: unknown): string {
  return JSON.stringify(val, null, 2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: pnpm tsx packages/cli/src/simulateSync.ts <subscriber-agent> <source-agent>\n" +
        "  [--conflict <text>]    Optional conflicting fact to remember on source before sync\n" +
        "  [--accept]             Automatically accept the sync\n" +
        "  [--reject]             Automatically reject the sync",
    );
    process.exit(1);
  }

  const subscriberName = args[0];
  const sourceName = args[1];
  const conflictIdx = args.indexOf("--conflict");
  const conflictFacts = conflictIdx !== -1 ? args.slice(conflictIdx + 1) : [];
  const doAccept = args.includes("--accept");
  const doReject = args.includes("--reject");

  initRuntime();

  const agents = loadAgents();
  const subRec = agents.get(subscriberName);
  const srcRec = agents.get(sourceName);

  if (!subRec) {
    console.error(
      `Agent "${subscriberName}" not found. Run spawnAgent.ts first.`,
    );
    console.error(
      `  → pnpm tsx packages/cli/src/spawnAgent.ts ${subscriberName}`,
    );
    process.exit(1);
  }
  if (!srcRec) {
    console.error(`Agent "${sourceName}" not found. Run spawnAgent.ts first.`);
    console.error(`  → pnpm tsx packages/cli/src/spawnAgent.ts ${sourceName}`);
    process.exit(1);
  }

  const client = await CogneeClient.create();

  const subscriber = new Agent(subscriberName, subRec.datasetName, client);
  const source = new Agent(sourceName, srcRec.datasetName, client);

  // Optionally add a conflicting fact to the source
  if (conflictFacts.length > 0) {
    for (const fact of conflictFacts) {
      await source.remember({ type: "text", text: fact });
      console.log(`  Source remembers: "${fact}"`);
    }
    await source.waitForIndexingComplete();
    console.log(`  Source indexing complete.`);
  }

  console.log(`\nSyncing from "${sourceName}" → "${subscriberName}" ...`);
  const trustStore = new TrustStore();
  const engine = new SyncEngine({ trustStore, autoMergeThreshold: 0.6 });

  const sourceFacts: string[] = srcRec.facts ?? [];

  const run = await engine.syncFromSource(
    client,
    subRec.datasetName,
    subscriberName,
    srcRec.datasetName,
    sourceName,
    sourceFacts,
  );

  // Save run to disk
  await mkdir(RUNS_DIR, { recursive: true });
  const runPath = resolve(RUNS_DIR, `${run.id}.json`);
  await writeFile(runPath, JSON.stringify(run, null, 2));

  // ─── Pretty-print diff ────────────────────────────────────────────
  const d = run.diff;
  const sep = "─".repeat(60);

  console.log(`\n${sep}`);
  console.log(`  Sync Run: ${run.id}`);
  console.log(`  Decision: ${run.decision}`);
  console.log(`  Status:   ${run.status}`);
  console.log(
    `  Trust:    ${run.trustScoreBefore.toFixed(3)} → ${run.trustScoreAfter.toFixed(3)}`,
  );
  console.log(`${sep}\n`);

  // Structural diff
  const s = d.structural;
  console.log("  ── Structural Changes ──");
  if (s.nodes.added.length) {
    console.log(`\n  Nodes added (${s.nodes.added.length}):`);
    for (const n of s.nodes.added) {
      console.log(`    + ${n.label} (${n.type}) ${fmt(n.properties)}`);
    }
  }
  if (s.nodes.removed.length) {
    console.log(`\n  Nodes removed (${s.nodes.removed.length}):`);
    for (const n of s.nodes.removed) {
      console.log(`    - ${n.label} (${n.type}) ${fmt(n.properties)}`);
    }
  }
  if (s.nodes.modified.length) {
    console.log(`\n  Nodes modified (${s.nodes.modified.length}):`);
    for (const n of s.nodes.modified) {
      console.log(`    ~ ${n.label} (${n.type}) ${fmt(n.properties)}`);
    }
  }
  if (s.edges.added.length) {
    console.log(`\n  Edges added (${s.edges.added.length}):`);
    for (const e of s.edges.added) {
      console.log(
        `    + ${e.sourceNodeId} ─${e.relationship}→ ${e.targetNodeId}`,
      );
    }
  }
  if (s.edges.removed.length) {
    console.log(`\n  Edges removed (${s.edges.removed.length}):`);
    for (const e of s.edges.removed) {
      console.log(
        `    - ${e.sourceNodeId} ─${e.relationship}→ ${e.targetNodeId}`,
      );
    }
  }
  if (s.edges.modified.length) {
    console.log(`\n  Edges modified (${s.edges.modified.length}):`);
    for (const e of s.edges.modified) {
      console.log(
        `    ~ ${e.sourceNodeId} ─${e.relationship}→ ${e.targetNodeId}`,
      );
    }
  }
  if (
    s.nodes.added.length === 0 &&
    s.nodes.removed.length === 0 &&
    s.nodes.modified.length === 0 &&
    s.edges.added.length === 0 &&
    s.edges.removed.length === 0 &&
    s.edges.modified.length === 0
  ) {
    console.log("    (no structural changes)");
  }

  // Contradictions
  if (d.contradictions.length > 0) {
    console.log(`\n  ── Contradictions (${d.contradictions.length}) ──`);
    for (const c of d.contradictions) {
      console.log(`    ⚠  ${c.nodeLabel}`);
      console.log(`       Existing: ${c.existingStatement}`);
      console.log(`       Incoming: ${c.incomingStatement}`);
      console.log(`       Confidence: ${c.confidence.toFixed(2)}`);
    }
  }

  // Drift
  if (d.drifts.length > 0) {
    console.log(`\n  ── Drift (${d.drifts.length}) ──`);
    for (const dr of d.drifts) {
      console.log(
        `    ~ ${dr.label}  cosine distance: ${dr.cosineDistance.toFixed(4)}`,
      );
    }
  }

  // Summary
  console.log(`\n  ── Summary ──`);
  console.log(
    `    Nodes:  ${d.summary.totalNodesBefore} → ${d.summary.totalNodesAfter}`,
  );
  console.log(
    `    Edges:  ${d.summary.totalEdgesBefore} → ${d.summary.totalEdgesAfter}`,
  );
  console.log(
    `    Added:    ${d.summary.nodesAdded} nodes, ${d.summary.edgesAdded} edges`,
  );
  console.log(
    `    Removed:  ${d.summary.nodesRemoved} nodes, ${d.summary.edgesRemoved} edges`,
  );
  console.log(
    `    Modified: ${d.summary.nodesModified} nodes, ${d.summary.edgesModified} edges`,
  );
  console.log(`    Drifts:   ${d.summary.driftsDetected}`);
  console.log(`    Contradictions: ${d.summary.contradictionsDetected}`);
  console.log(`${sep}\n`);

  // Auto accept/reject
  if (doAccept) {
    await acceptSync(run.id, engine, trustStore, subscriberName);
    console.log(`✓ Accepted sync run ${run.id}`);
  } else if (doReject) {
    await rejectSync(run.id, engine, trustStore, subscriberName);
    console.log(`✗ Rejected sync run ${run.id}`);
  }

  console.log(`Run saved to: ${runPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
