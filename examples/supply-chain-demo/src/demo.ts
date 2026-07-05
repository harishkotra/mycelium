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

const ALPHA_ID = "warehouse_alpha";
const BETA_ID = "warehouse_beta";
const ALPHA_DS = `demo_${ALPHA_ID}`;
const BETA_DS = `demo_${BETA_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
}

async function resetDemo(client: CogneeClient) {
  sep("Reset");
  for (const ds of [ALPHA_DS, BETA_DS]) {
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

  // ── Seed Warehouse Alpha (HQ inventory system) ────────────
  sep("Seed: Warehouse Alpha");
  const alpha = new Agent(ALPHA_ID, ALPHA_DS, client);
  const alphaFacts = [
    "[warehouse_alpha] SKU WX-1001 'Widget Pro'. On-hand: 500 units. Location: Aisle 7, Bay 12. Received Jun 28 from supplier Acme Corp (PO-8842). Unit cost $14.50.",
    "[warehouse_alpha] SKU WX-1001 reorder threshold: 200 units. Status: OK. Last count: Jun 27 (physical inventory). No discrepancies.",
    "[warehouse_alpha] SKU WX-1001 outgoing: Order #ORD-5512 for 50 units to RetailCo (ship Jul 1). Order #ORD-5518 for 120 units to DistributorPlus (ship Jul 2).",
    "[warehouse_alpha] SKU WX-1001 supplier lead time: 5-7 business days. Acme Corp contract #ACM-2024-443. Next scheduled delivery: Jul 10.",
    "[warehouse_alpha] WAREHOUSE CONDITIONS: Temp 64°F, Humidity 35%. All climate-sensitive SKUs within spec. No damage reported for WX-1001 batch.",
  ];
  await seedViaAdd(alpha, client, alphaFacts);

  // ── Seed Warehouse Beta (regional distribution center) ────
  sep("Seed: Warehouse Beta");
  const beta = new Agent(BETA_ID, BETA_DS, client);
  const betaFacts = [
    "[warehouse_beta] SKU WX-1001 'Widget Pro'. On-hand: 200 units. Location: Section C, Rack 8. Received Jun 25 from Acme Corp (PO-8842). Unit cost $16.20.",
    "[warehouse_beta] SKU WX-1001 reorder threshold: 300 units. Status: REORDER NEEDED — below threshold. Flagged Jun 29.",
    "[warehouse_beta] SKU WX-1001 incoming: Transfer from Warehouse Alpha — 250 units requested (inter-warehouse req IWR-331). Status: AWAITING FULFILLMENT.",
    "[warehouse_beta] DAMAGE REPORT: 15 units of WX-1001 damaged during Jun 25 receiving. Condemned. Remaining: 200 sellable units.",
    "[warehouse_beta] SYSTEM NOTE: Unit cost discrepancy flagged — Alpha shows $14.50, Beta shows $16.20. Finance investigating.",
  ];
  await seedViaAdd(beta, client, betaFacts);

  // ── Sync ────────────────────────────────────────────────────
  sep("Sync: Warehouse Beta → Warehouse Alpha");
  const trustStore = new TrustStore();
  const llmConfig = resolveLlmConfig();
  const engine = new SyncEngine({
    trustStore,
    autoMergeThreshold: 0.3,
    llmConfig,
  });

  const run = await engine.syncFromSource(
    client,
    ALPHA_DS,
    ALPHA_ID,
    BETA_DS,
    BETA_ID,
    betaFacts,
    alphaFacts,
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
      console.log(`       Alpha: "${c.existingStatement.slice(0, 120)}..."`);
      console.log(`       Beta:  "${c.incomingStatement.slice(0, 120)}..."`);
      console.log(`       Reason: ${c.relation}`);
      console.log("");
    }
  }

  await acceptSync(run.id, engine, trustStore, ALPHA_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(ALPHA_ID, BETA_ID).score.toFixed(3)}`,
  );

  // ── Improve ────────────────────────────────────────────────
  sep("Improve: Warehouse Alpha");
  const improveResult = await alpha.improve({
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
  sep("Inventory Reconciliation Summary");
  console.log("  Scenario: Two warehouse systems disagree on:");
  console.log("    • On-hand quantity (500 vs 200 units)");
  console.log("    • Received date (Jun 28 vs Jun 25)");
  console.log("    • Unit cost ($14.50 vs $16.20)");
  console.log("    • Reorder threshold (200 vs 300)");
  console.log("");
  console.log("  Root cause: Beta received damaged batch (15 units),");
  console.log("  has inter-warehouse transfer pending, and supplier");
  console.log("  invoiced at different price points.");
  console.log("  → Resolution: Alpha is HQ system — authoritative.");
  console.log("    Beta flagged for price correction & stock sync.");

  sep("Done");
  console.log("  Run: pnpm demo");
}

main().catch((e) => {
  console.error("\n  Demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
