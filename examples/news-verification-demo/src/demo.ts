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

const ALPHA_ID = "newswire_alpha";
const CITYPRESS_ID = "citypress";
const ALPHA_DS = `demo_${ALPHA_ID}`;
const CITYPRESS_DS = `demo_${CITYPRESS_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
}

async function resetDemo(client: CogneeClient) {
  sep("Reset");
  for (const ds of [ALPHA_DS, CITYPRESS_DS]) {
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

  // ── Seed NewsWire Alpha (wire service report) ─────────────
  sep("Seed: NewsWire Alpha");
  const alpha = new Agent(ALPHA_ID, ALPHA_DS, client);
  const alphaFacts = [
    "[newswire_alpha] BREAKING: Mayor Torres announced 'Elm Street Community Park' project at 10 AM press conference. $2M budget. Groundbreaking Sep 1. Park will include playground, dog run, and community garden on 2-acre lot at 1200 Elm St.",
    "[newswire_alpha] The park project will be funded by a mix of city bonds ($1.2M) and state grant ($800K from CA Prop 68). Construction by GreenScape Corp. Expected completion: Mar 2026.",
    "[newswire_alpha] Mayor Torres: 'This park has been a decade in the making. Our families deserve green space in the downtown core.' Council voted 7-2 in favor.",
    "[newswire_alpha] TIMELINE: Groundbreaking Sep 1 at 10 AM. Construction phase 1 (grading/utilities) Sep-Nov. Phase 2 (playground/garden) Dec-Feb. Grand opening Mar 15.",
    "[newswire_alpha] REACTION: Elm Street Neighborhood Association president Maria Santos called it 'a victory for our community.' Opponents cited traffic concerns during construction.",
  ];
  await seedViaAdd(alpha, client, alphaFacts);

  // ── Seed CityPress (local newspaper with DIFFERENT story) ──
  sep("Seed: CityPress");
  const citypress = new Agent(CITYPRESS_ID, CITYPRESS_DS, client);
  const citypressFacts = [
    "[citypress] EXCLUSIVE: Mayor Torres unveils 'Oak Avenue Public Library' project. $5M budget. Groundbreaking Oct 15. Library to span 15,000 sq ft at 450 Oak Ave. Includes reading rooms, computer lab, and community meeting space.",
    "[citypress] Library funding: $3M from city surplus, $1.5M from state library bond, $500K private donation from Torres Family Foundation. Architect: Studio BSA. Completion: Q3 2026.",
    "[citypress] Mayor Torres: 'This library will be a cornerstone of our downtown revitalization. Every resident deserves access to knowledge and technology.' Council voted 9-0 in favor.",
    "[citypress] TIMELINE: Groundbreaking Oct 15 at 11 AM. Design phase already 60% complete. Construction Q4 2025-Q3 2026. Soft opening Aug 2026.",
    "[citypress] CONTROVERSY: Some residents question $5M price tag. Councilmember Rivera: 'We should be fixing potholes, not building monuments.' City spokesperson says budget includes 15% contingency.",
  ];
  await seedViaAdd(citypress, client, citypressFacts);

  // ── Sync ────────────────────────────────────────────────────
  sep("Sync: CityPress → NewsWire Alpha");
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
    CITYPRESS_DS,
    CITYPRESS_ID,
    citypressFacts,
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
      console.log(
        `       NewsWire Alpha: "${c.existingStatement.slice(0, 120)}..."`,
      );
      console.log(
        `       CityPress:      "${c.incomingStatement.slice(0, 120)}..."`,
      );
      console.log(`       Reason: ${c.relation}`);
      console.log("");
    }
  }

  await acceptSync(run.id, engine, trustStore, ALPHA_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(ALPHA_ID, CITYPRESS_ID).score.toFixed(3)}`,
  );

  // ── Improve ────────────────────────────────────────────────
  sep("Improve: NewsWire Alpha");
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
  sep("Fact-Check Reconciliation Summary");
  console.log("  Scenario: Two news outlets covered the Mayor's 10 AM");
  console.log("  press conference but report completely different stories:");
  console.log("    NewsWire Alpha: Elm Street Community Park, $2M, Sep 1");
  console.log("    CityPress:       Oak Avenue Public Library, $5M, Oct 15");
  console.log("");
  console.log("  Key contradictions flagged:");
  console.log("    • Project type (park vs library)");
  console.log("    • Location (Elm St vs Oak Ave)");
  console.log("    • Budget ($2M vs $5M)");
  console.log("    • Groundbreaking date (Sep 1 vs Oct 15)");
  console.log("    • Council vote (7-2 vs 9-0)");
  console.log("");
  console.log("  Possible scenario: Mayor announced BOTH projects,");
  console.log("  each outlet only reported what aligned with their beat.");
  console.log("  → Resolution: Merge both into unified civic agenda.");

  sep("Done");
  console.log("  Run: pnpm demo");
}

main().catch((e) => {
  console.error("\n  Demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
