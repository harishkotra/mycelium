#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEnv = resolve(__dirname, "../../core/.env");
if (existsSync(coreEnv)) dotenv.config({ path: coreEnv });

const RUNS_DIR = resolve(__dirname, "../../../.mycelium/sync-runs");

function fmt(val: unknown): string {
  return JSON.stringify(val, null, 2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: pnpm tsx packages/cli/src/inspectDiff.ts <run-id>");
    console.error(
      "       pnpm tsx packages/cli/src/inspectDiff.ts <path-to-json>",
    );
    process.exit(1);
  }

  const input = args[0];
  let runPath = input;

  // If it's not an existing path, look in the runs directory
  if (!existsSync(runPath)) {
    const candidate = resolve(RUNS_DIR, `${input}.json`);
    if (existsSync(candidate)) {
      runPath = candidate;
    } else {
      console.error(`Run "${input}" not found at:`);
      console.error(`  ${runPath}`);
      console.error(`  ${candidate}`);
      process.exit(1);
    }
  }

  let run: any;
  try {
    const raw = readFileSync(runPath, "utf-8");
    run = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read run file: ${e}`);
    process.exit(1);
  }

  const d = run.diff;
  const sep = "─".repeat(60);

  console.log(`\n${sep}`);
  console.log(`  Sync Run: ${run.id}`);
  console.log(`  Source:   ${run.sourceDataset}`);
  console.log(`  Subscriber: ${run.subscriberDataset}`);
  console.log(`  Decision: ${run.decision}`);
  console.log(`  Status:   ${run.status}`);
  console.log(
    `  Trust:    ${run.trustScoreBefore?.toFixed(3) ?? "?"} → ${run.trustScoreAfter?.toFixed(3) ?? "?"}`,
  );
  console.log(`  Created:  ${new Date(run.createdAt).toISOString()}`);
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
  console.log(
    `  Before snapshot: ${run.beforeSnapshot?.nodes?.length ?? 0} nodes, ${run.beforeSnapshot?.edges?.length ?? 0} edges`,
  );
  console.log(
    `  After snapshot:  ${run.afterSnapshot?.nodes?.length ?? 0} nodes, ${run.afterSnapshot?.edges?.length ?? 0} edges`,
  );
  console.log(`${sep}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
