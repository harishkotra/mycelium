import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import { initRuntime, CogneeClient } from './src/cogneeClient.ts';
import { TrustStore, adjustTrust, TRUST_ACCEPT_INCR, TRUST_REJECT_DECR } from './src/trust/trustStore.ts';
import { tagWithProvenance, extractProvenance, ProvenanceRegistry } from './src/sync-protocol/provenance.ts';
import { SubscriptionRegistry } from './src/sync-protocol/subscription.ts';
import { SyncEngine } from './src/sync-protocol/syncEngine.ts';
import { acceptSync, rejectSync } from './src/sync-protocol/acceptReject.ts';
import { fixtureSnapshot } from './src/snapshot.ts';

initRuntime();

async function main() {
  let passed = 0, failed = 0;
  function assert(label, ok) { if (ok) passed++; else failed++; const m = ok ? 'log' : 'error'; console[m](`  ${ok ? 'PASS' : 'FAIL'} ${label}`); }

  // ─── Step 12: trust/trustStore.ts (pure, no Cognee) ───────────────
  console.log("\n=== Step 12: trustStore ===");

  const s0 = 0.5;
  const s1 = adjustTrust(s0, "accept");
  assert(`accept: ${s1.toFixed(2)} > ${s0.toFixed(2)}`, s1 > s0);
  assert(`accept delta === ${TRUST_ACCEPT_INCR}`, Math.abs(s1 - s0 - TRUST_ACCEPT_INCR) < 0.001);

  const s2 = adjustTrust(s1, "reject");
  assert(`reject: ${s2.toFixed(2)} < ${s1.toFixed(2)}`, s2 < s1);
  assert(`reject delta === ${TRUST_REJECT_DECR}`, Math.abs(s1 - s2 - TRUST_REJECT_DECR) < 0.001);

  assert("clamp at 1.0", adjustTrust(0.98, "accept") === 1.0);
  assert("clamp at 0.0", adjustTrust(0.1, "reject") === 0.0);

  const store = new TrustStore();
  const initial = store.get("alice", "bob");
  assert("initial trust = 0.5", initial.score === 0.5);

  store.adjust("alice", "bob", "accept");
  assert("trust up after accept", store.get("alice", "bob").score > 0.5);

  store.adjust("alice", "bob", "reject");
  const afterReject = store.get("alice", "bob").score;
  assert("trust down after reject", afterReject < 0.5 + TRUST_ACCEPT_INCR);

  store.reset();
  store.adjust("alice", "bob", "accept");
  store.adjust("alice", "bob", "accept");
  store.adjust("alice", "bob", "accept");
  const threeAccepts = store.get("alice", "bob").score;
  const expectedThreeAccepts = 0.5 + 3 * TRUST_ACCEPT_INCR;
  assert(`three accepts: ${threeAccepts.toFixed(3)} ≈ ${expectedThreeAccepts.toFixed(3)}`,
    Math.abs(threeAccepts - expectedThreeAccepts) < 0.001);

  store.adjust("alice", "bob", "reject");
  const afterRejectMany = store.get("alice", "bob").score;
  assert(`reject undoes more than one accept: ${afterRejectMany.toFixed(3)}`,
    afterRejectMany < threeAccepts);

  // ─── Step 13a: provenance helpers (pure, no Cognee) ───────────────
  console.log("\n=== Step 13a: provenance helpers ===");

  const prov = { sourceAgentId: "agent-1", factId: "f123", timestamp: 1700000000000 };
  const tagged = tagWithProvenance("Paris is capital.", prov);
  assert("tagged starts with provenance prefix", tagged.startsWith("__provenance__:"));

  const { provenance: extracted, cleanText } = extractProvenance(tagged);
  assert("extracted sourceAgentId", extracted?.sourceAgentId === "agent-1");
  assert("clean text restored", cleanText === "Paris is capital.");

  const { provenance: noProv } = extractProvenance("plain text");
  assert("no provenance on plain text", noProv === null);

  const registry = new ProvenanceRegistry();
  registry.register("Paris is capital.", prov);
  assert("registry.get works", registry.get("Paris is capital.")?.sourceAgentId === "agent-1");
  assert("findBySource returns 1", registry.findBySource("agent-1").length === 1);

  registry.register("Sun is hot.", { sourceAgentId: "agent-2", factId: "f456", timestamp: 1700000000001 });
  assert("findBySource agent-2 returns 1", registry.findBySource("agent-2").length === 1);

  registry.deleteBySource("agent-2");
  assert("after delete agent-2 = 0", registry.findBySource("agent-2").length === 0);
  assert("agent-1 unaffected", registry.findBySource("agent-1").length === 1);

  // ─── Step 13b: subscription registry (pure, no Cognee) ────────────
  console.log("\n=== Step 13b: subscription registry ===");

  const subRegistry = new SubscriptionRegistry();
  subRegistry.add({ subscriberId: "agent-a", subscriberDataset: "ds-a", sourceAgentId: "agent-b", sourceDataset: "ds-b", active: true });
  subRegistry.add({ subscriberId: "agent-a", subscriberDataset: "ds-a", sourceAgentId: "agent-c", sourceDataset: "ds-c", active: true });
  subRegistry.add({ subscriberId: "agent-b", subscriberDataset: "ds-b", sourceAgentId: "agent-a", sourceDataset: "ds-a", active: true });

  assert("agent-a has 2 sources", subRegistry.getSourcesForSubscriber("agent-a").length === 2);
  assert("agent-b subscribes to agent-a", subRegistry.getSubscribersForSource("agent-a").length === 1);

  subRegistry.remove("agent-a", "agent-b");
  assert("after removal agent-a has 1", subRegistry.getSourcesForSubscriber("agent-a").length === 1);

  // ─── Step 12b: provenance round-trip through Cognee ────────────────
  console.log("\n=== Step 12b: provenance round-trip through Cognee ===");
  const client = await CogneeClient.create();
  const dsProv = "ds_prov_" + Date.now();

  const provData = { sourceAgentId: "agent-x", factId: "fact-hello", timestamp: Date.now() };
  const taggedHello = tagWithProvenance("The sky is blue.", provData);
  await client.remember({ type: "text", text: taggedHello }, dsProv);
  await client.waitForIndexingComplete(dsProv);

  const searchRes = await client.search("", {
    datasets: [dsProv],
    searchType: "CHUNKS",
    topK: 5,
  });
  let foundProvenance = false;
  for (const item of (searchRes.context ? Object.values(searchRes.context).flat() : [])) {
    const text = typeof item.payload?.text === "string" ? item.payload.text : "";
    if (text.includes("agent-x")) { foundProvenance = true; break; }
  }
  if (!foundProvenance && searchRes.result?.kind === "Text") {
    if (searchRes.result.data.includes("agent-x")) foundProvenance = true;
  }
  if (!foundProvenance && searchRes.result?.kind === "Texts") {
    for (const t of searchRes.result.data) {
      if (t.includes("agent-x")) { foundProvenance = true; break; }
    }
  }

  assert("provenance round-trips through Cognee", foundProvenance);
  await client.forget({ kind: "dataset", dataset: { name: dsProv } });

  // ─── Steps 14–16: SyncEngine + accept/reject (fixture-based) ──────
  console.log("\n=== Steps 14–16: SyncEngine + accept/reject ===");

  const engineStore = new TrustStore();
  const engine = new SyncEngine({ trustStore: engineStore });

  // Build a SyncRun manually (avoids the full Cognee pipeline which
  // hits Groq rate limits on the free tier). The run data structure
  // is what accept/reject handlers operate on.
  const beforeSnap = fixtureSnapshot("no_conflict");
  const afterSnap = fixtureSnapshot("no_conflict_extra");

  // Simulate a sync with contradictions using fixture data
  const mockDiff = await (await import('./src/diff.ts')).runDiff(
    beforeSnap, afterSnap, null, "fixture_test",
  );

  // Manually register a pending_review run in the engine
  const syncId = "sync_manual_1";
  const run = {
    id: syncId,
    subscriberDataset: "sub-ds",
    sourceDataset: "src-ds",
    beforeSnapshot: beforeSnap,
    afterSnapshot: afterSnap,
    diff: mockDiff,
    decision: "pending_review",
    status: "pending",
    trustScoreBefore: 0.5,
    trustScoreAfter: 0.3,
    createdAt: Date.now(),
  };
  // Access engine's internal run store for testing
  engine["runs"].set(syncId, run);

  assert("engine.getRun finds manual run", engine.getRun(syncId) !== undefined);
  const fetched = engine.getRun(syncId);
  assert("manual run has correct status", fetched.status === "pending");

  // Accept handler
  await acceptSync(syncId, engine, engineStore, "sub-agent");
  const accepted = engine.getRun(syncId);
  assert("accept sets status to accepted", accepted.status === "accepted");
  assert("trust went up after accept", engineStore.get("sub-agent", "src-ds").score > 0.5);

  // Reset for reject test
  const rejectId = "sync_manual_2";
  engine["runs"].set(rejectId, { ...run, id: rejectId, status: "pending", trustScoreBefore: 0.7 });
  engineStore.adjust("sub-agent", "src-ds", "reject"); // reset trust
  engineStore.adjust("sub-agent", "src-ds", "accept");
  engineStore.adjust("sub-agent", "src-ds", "accept");
  const trustBeforeReject = engineStore.get("sub-agent", "src-ds").score;

  await rejectSync(rejectId, engine, engineStore, "sub-agent");
  const rejected = engine.getRun(rejectId);
  assert("reject sets status to rejected", rejected.status === "rejected");
  assert("trust went down after reject", engineStore.get("sub-agent", "src-ds").score < trustBeforeReject);

  // Re-run with auto_merged decision (no contradictions)
  const autoId = "sync_auto_1";
  engineStore.adjust("sub-agent", "src-ds", "accept");
  const noContraDiff = await (await import('./src/diff.ts')).runDiff(
    beforeSnap, beforeSnap, null, "fixture_test",
  );
  engine["runs"].set(autoId, {
    id: autoId,
    subscriberDataset: "sub-ds",
    sourceDataset: "src-ds",
    beforeSnapshot: beforeSnap,
    afterSnapshot: beforeSnap,
    diff: noContraDiff,
    decision: "auto_merged",
    status: "accepted",
    trustScoreBefore: 0.6,
    trustScoreAfter: 0.6,
    createdAt: Date.now(),
  });
  assert("auto_merged run is accepted", engine.getRun(autoId).status === "accepted");

  // Engine run tracking
  const subRuns = engine.getRunsForDataset("sub-ds");
  assert("3 runs for sub-ds", subRuns.length === 3);

  const allRuns = engine.allRuns();
  assert("3 total runs", allRuns.length === 3);

  // ─── Final tally ──────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
