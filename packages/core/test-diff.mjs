import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import { initRuntime, CogneeClient } from './src/cogneeClient.ts';
import { fixtureSnapshot } from './src/snapshot.ts';
import { diffSnapshots } from './src/structuralDiff.ts';
import { detectDrift, cosineDistance } from './src/driftDetector.ts';
import { runDiff } from './src/diff.ts';
import { detectContradictions } from './src/contradictionDetector.ts';

initRuntime();

async function main() {
  let passed = 0, failed = 0;
  function assert(label, ok) { if (ok) passed++; else failed++; const m = ok ? 'log' : 'error'; console[m](`  ${ok ? 'PASS' : 'FAIL'} ${label}`); }

  // ─── Step 7: snapshot.ts (fixture path) ──────────────────────────
  console.log("\n=== Step 7: snapshot.ts ===");
  const snap = fixtureSnapshot("wedding_a");
  assert("returns 3 nodes", snap.nodes.length === 3);
  assert("returns 2 edges", snap.edges.length === 2);
  assert("node has expected label", snap.nodes[0].label === "Doug");
  assert("edge has expected relation", snap.edges[0].relationship === "marries");

  // ─── Step 8: structuralDiff.ts ────────────────────────────────────
  console.log("\n=== Step 8: structuralDiff.ts ===");
  const before = fixtureSnapshot("wedding_a");
  const after = fixtureSnapshot("wedding_b");
  const sd = diffSnapshots(before, after);

  assert("node added (Mike)", sd.nodes.added.length === 1 && sd.nodes.added[0].label === "Mike");
  assert("edge added (e3)", sd.edges.added.length === 1 && sd.edges.added[0].id === "e3");
  assert("edge removed (e2)", sd.edges.removed.length === 1 && sd.edges.removed[0].id === "e2");
  assert("node modified (Doug role change)", sd.nodes.modified.length === 1 && sd.nodes.modified[0].label === "Doug");
  assert("edge modified (e1 relation change)", sd.edges.modified.length === 1 && sd.edges.modified[0].id === "e1");

  const noDiff = diffSnapshots(before, before);
  assert("no-op: nothing changed", noDiff.nodes.added.length + noDiff.nodes.removed.length + noDiff.nodes.modified.length === 0);

  // ─── Step 9: driftDetector.ts ─────────────────────────────────────
  console.log("\n=== Step 9: driftDetector.ts ===");
  assert("near-identical < 0.02", cosineDistance([1, 0, 0], [0.99, 0.01, 0.01]) < 0.02);
  assert("far-apart > 0.5", cosineDistance([1, 0, 0], [0, 1, 0]) > 0.5);

  const drifts = detectDrift(before, before, {
    threshold: 0.15,
    embeddings: {
      n1: { before: [1, 0, 0], after: [0.99, 0.01, 0.01] },
      n2: { before: [1, 0, 0], after: [0, 1, 0] },
    },
  });
  assert("one drift flagged", drifts.length === 1);
  assert("flagged node is far-apart one", drifts[0].nodeId === "n2");

  // ─── Step 10: contradiction detector ──────────────────────────────
  console.log("\n=== Step 10: contradiction detector ===");
  // detectContradictions only checks `client` for truthiness, never calls it.
  // Passing a mock object avoids triggering the Cognee native addon (which
  // can segfault when the Node.js runtime has been heavily exercised).
  const mockClient = {};

  const contraExisting = {
    nodes: [
      { id: "d1", label: "Doug", type: "Person", properties: { role: "groom" } },
    ],
    edges: [],
  };
  const contraIncoming = fixtureSnapshot("wedding_b"); // Doug role=best man

  const contraResults = await detectContradictions(
    mockClient, "contra_test", contraIncoming, contraExisting,
  );
  console.log("  Contradictions found:", contraResults.length);
  for (const cr of contraResults) {
    assert("contradiction for Doug node", cr.nodeLabel === "Doug");
    assert(`confidence ${cr.confidence.toFixed(2)} >= 0.6`, cr.confidence >= 0.6);
  }

  // Non-contradiction: existing and incoming agree
  const noConflictExisting = {
    nodes: [
      { id: "f1", label: "Flowers", type: "decor", properties: { type: "roses" } },
    ],
    edges: [],
  };
  const noConflictIncoming = fixtureSnapshot("no_conflict_extra");
  const noConflictResults = await detectContradictions(
    mockClient, "contra_test", noConflictIncoming, noConflictExisting,
  );
  assert("no false-positive on non-contradiction", noConflictResults.length === 0);

  // Also verify: same exact node in existing+incoming → no contradiction
  const sameNode = {
    nodes: [
      { id: "x1", label: "Flowers", type: "decor", properties: { type: "roses" } },
    ],
    edges: [],
  };
  const sameNodeResults = await detectContradictions(
    mockClient, "contra_test", sameNode, noConflictExisting,
  );
  assert("identical nodes produce no contradiction", sameNodeResults.length === 0);

  // ─── Step 11: runDiff with fixtures ───────────────────────────────
  console.log("\n=== Step 11: runDiff (fixtures) ===");
  const diffResult = await runDiff(before, after, null, "fixture_test", {});
  assert("summary.nodesAdded === 1", diffResult.summary.nodesAdded === 1);
  assert("summary.nodesModified === 1", diffResult.summary.nodesModified === 1);
  assert("summary.edgesAdded === 1", diffResult.summary.edgesAdded === 1);
  assert("summary.edgesRemoved === 1", diffResult.summary.edgesRemoved === 1);
  assert("structural diff wired", diffResult.structural.nodes.added.length === 1);
  assert("no drifts w/o embeddings", diffResult.drifts.length === 0);
  assert("no contradictions w/o client", diffResult.contradictions.length === 0);

  // ─── Step 7+11: live Cognee snapshot ──────────────────────────────
  console.log("\n=== Step 7+11: live Cognee snapshot ===");
  const { takeSnapshot } = await import('./src/snapshot.ts');
  const client2 = await CogneeClient.create();
  const dsLive = "ds_live_" + Date.now();
  await client2.remember({ type: "text", text: "Paris is the capital of France." }, dsLive);
  await client2.waitForIndexingComplete(dsLive);
  const liveSnap = await takeSnapshot(client2, dsLive);
  console.log("  Live snapshot nodes:", liveSnap.nodes.length, "edges:", liveSnap.edges.length);
  if (liveSnap.nodes.length > 0) {
    console.log("  Node labels:", liveSnap.nodes.map(n => n.label).join(", "));
  }
  assert("live snapshot has nodes", liveSnap.nodes.length > 0);

  await client2.forget({ kind: "dataset", dataset: { name: dsLive } });

  // ─── Final tally ──────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
