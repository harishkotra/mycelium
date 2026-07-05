#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEnv = resolve(__dirname, "../../../packages/core/.env");
if (existsSync(coreEnv)) dotenv.config({ path: coreEnv });

import {
  initRuntime,
  CogneeClient,
  resolveLlmConfig,
  Agent,
  SyncEngine,
  TrustStore,
  acceptSync,
} from "@mycelium/core";

const HUB_ID = "living_room_hub";
const SECURITY_ID = "security_hub";
const HUB_DS = `demo_${HUB_ID}`;
const SECURITY_DS = `demo_${SECURITY_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
}

async function resetDemo(client: CogneeClient) {
  sep("Reset");
  for (const ds of [HUB_DS, SECURITY_DS]) {
    try {
      const result = await client.forget({
        kind: "dataset",
        dataset: { name: ds },
      });
      console.log(
        `  Forgotten dataset "${ds}" (${result.deleteResult.deleted_graph_nodes} graph nodes)`,
      );
    } catch {
      console.log(`  Dataset "${ds}" did not exist.`);
    }
  }
}

async function seedViaAdd(agent: Agent, client: CogneeClient, facts: string[]) {
  for (const fact of facts) {
    await client.add({ type: "text", text: fact }, agent.datasetName);
    console.log(`  ✓ added: ${fact.slice(0, 100)}...`);
  }
  await client.waitForIndexingComplete(agent.datasetName);
  console.log(`  Add complete (${facts.length} facts).`);

  try {
    await client.resetDatasetPipeline(agent.datasetName);
    const result = await client.cognify(agent.datasetName);
    console.log(
      `  Cognify: ${result.chunks} chunks, ${result.entities} entities, ${result.edges} edges`,
    );
  } catch (e) {
    console.log(
      `  Cognify skipped: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function main() {
  initRuntime();

  const client = await CogneeClient.create();
  console.log(
    `  [provider] → ${client.llmConfig.provider} / ${client.llmConfig.model}`,
  );

  await resetDemo(client);

  // ── Seed Living Room Hub (climate + presence sensors) ────
  sep("Seed: Living Room Hub");
  const hub = new Agent(HUB_ID, HUB_DS, client);
  const hubFacts = [
    "[living_room_hub] TEMP: 72°F steady. Thermostat setpoint 72°F. AC running: OFF. Humidity 42%. Last reading: 10:47 PM. Forecast: cooling to 68°F overnight.",
    "[living_room_hub] MOTION: Motion detected in kitchen at 2:31 AM (sensor K4). Duration 45 seconds. Likely: person getting water. Confidence: 0.88.",
    "[living_room_hub] MOTION: Motion detected in hallway at 2:32 AM (sensor H2). Direction: toward bedroom. Duration 30 seconds. Confidence: 0.91.",
    "[living_room_hub] WINDOW: Living room window (sensor W1) reported OPEN at 10:15 PM. No close event recorded. Alert: window still open.",
    "[living_room_hub] ENERGY: Current draw 540W. Baseline 320W. Spike at 2:31 AM consistent with kitchen lights + refrigerator compressor.",
  ];
  await seedViaAdd(hub, client, hubFacts);

  // ── Seed Security Hub (perimeter + alarm system) ─────────
  sep("Seed: Security Hub");
  const security = new Agent(SECURITY_ID, SECURITY_DS, client);
  const securityFacts = [
    "[security_hub] TEMP: All zones 68°F. Front door sensor: 68°F. Back door: 67°F. Garage: 65°F. No unusual readings. System nominal.",
    "[security_hub] MOTION: No motion detected between 10:00 PM and 6:00 AM. All 8 motion sensors: CLEAR. System ARMED (stay mode) from 10:15 PM.",
    "[security_hub] WINDOW: All windows CLOSED and SECURE as of 10:15 PM night check. Living room window W1: CLOSED and LOCKED. No alerts.",
    "[security_hub] ALARM LOG: System disarmed at 10:15 PM by user code 7721 (John). ARMED STAY activated 10:16 PM. No events until 6:50 AM disarm.",
    "[security_hub] DOOR: Front door: CLOSED and LOCKED all night. No open events logged. Last front door event: 9:30 PM (guest departure).",
  ];
  await seedViaAdd(security, client, securityFacts);

  // ── Sync ────────────────────────────────────────────────────
  sep("Sync: Security Hub → Living Room Hub");
  const trustStore = new TrustStore();
  const llmConfig = resolveLlmConfig();
  const engine = new SyncEngine({
    trustStore,
    autoMergeThreshold: 0.3,
    llmConfig,
  });

  const run = await engine.syncFromSource(
    client,
    HUB_DS,
    HUB_ID,
    SECURITY_DS,
    SECURITY_ID,
    securityFacts,
    hubFacts,
  );

  console.log(`  Run:        ${run.id}`);
  console.log(`  Decision:   ${run.decision}`);
  console.log(`  Status:     ${run.status}`);
  console.log(
    `  Trust:      ${run.trustScoreBefore.toFixed(3)} → ${run.trustScoreAfter.toFixed(3)}`,
  );
  console.log(
    `  Nodes:      ${run.diff.summary.totalNodesBefore} → ${run.diff.summary.totalNodesAfter}`,
  );
  const d = run.diff;
  if (d.structural.nodes.added.length) {
    console.log(`  Added:      ${d.structural.nodes.added.length} facts`);
  }
  if (d.contradictions.length) {
    console.log(`  Contradictions: ${d.contradictions.length}`);
    for (const c of d.contradictions) {
      console.log(
        `    \x1b[31m⚠\x1b[0m ${c.nodeLabel}  (${c.confidence.toFixed(2)})`,
      );
      console.log(
        `       Living Room Hub: "${c.existingStatement.slice(0, 120)}..."`,
      );
      console.log(
        `       Security Hub:    "${c.incomingStatement.slice(0, 120)}..."`,
      );
      console.log(`       Reason: ${c.relation}`);
      console.log("");
    }
  }

  await acceptSync(run.id, engine, trustStore, HUB_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(HUB_ID, SECURITY_ID).score.toFixed(3)}`,
  );

  // ── Improve ────────────────────────────────────────────────
  sep("Improve: Living Room Hub");
  const improveResult = await hub.improve({
    autoResolve: true,
    resolutionStrategy: "keep_newer",
    resolutionConfidenceThreshold: 0.8,
  });
  console.log(
    `  Cognee stages: ${improveResult.improveResult.stagesRun.join(", ")}`,
  );
  console.log(
    `  Diff summary: ${improveResult.diff.summary.nodesAdded} added, ${improveResult.diff.summary.nodesModified} modified`,
  );

  // ── Narrative summary ───────────────────────────────────────
  sep("Home Sensor Reconciliation Summary");
  console.log("  Scenario: Living Room Hub detected motion at 2:31 AM");
  console.log("  and an open window, but Security Hub reports:");
  console.log("    • No motion all night (ARMED STAY mode)");
  console.log("    • All windows CLOSED and LOCKED");
  console.log("    • Temperature 68°F (not 72°F)");
  console.log("");
  console.log("  Possible explanations:");
  console.log("    • Security hub sensor battery failure");
  console.log("    • Living Room temp sensor near heat source");
  console.log("    • Window sensor misalignment on W1");
  console.log("  → Resolution: Security hub data is newer but");
  console.log("    contradicts physical evidence — manual check required.");

  sep("Done");
  console.log("  Run: pnpm demo");
}

main().catch((e) => {
  console.error("\n  Demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
