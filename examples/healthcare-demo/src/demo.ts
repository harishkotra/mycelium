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

const CLINIC_ID = "northside_clinic";
const PHARMACY_ID = "downtown_pharmacy";
const CLINIC_DS = `demo_${CLINIC_ID}`;
const PHARMACY_DS = `demo_${PHARMACY_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
}

async function resetDemo(client: CogneeClient) {
  sep("Reset");
  for (const ds of [CLINIC_DS, PHARMACY_DS]) {
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

  // ── Seed Northside Clinic (updated patient record) ─────────
  sep("Seed: Northside Clinic");
  const clinic = new Agent(CLINIC_ID, CLINIC_DS, client);
  const clinicFacts = [
    "[northside_clinic] PATIENT Alice Chen (DOB 1991-04-12, MRN 44829). Diagnosis: Stage 1 hypertension (ICD-10 I10). Prescribed Drug X 10mg daily. Note: patient reports mild headaches — monitor.",
    "[northside_clinic] ALLERGIES: Shellfish (anaphylactic reaction history). Listed in EPIC as severe allergy. EpiPen prescribed Jun 1.",
    "[northside_clinic] LAB RESULTS: Lipid Panel — LDL 145 mg/dL (high), HDL 52 mg/dL, Triglycerides 168 mg/dL. Ordered statin therapy discussion for next visit.",
    "[northside_clinic] IMMUNIZATION: Influenza vaccine administered Nov 15. Next due: Nov (annual). COVID-19 bivalent booster: Oct 20.",
    "[northside_clinic] VITALS Jun 28: BP 138/92, HR 78, Temp 98.4°F, Weight 164 lbs. BP elevated — consistent with hypertension diagnosis.",
    "[northside_clinic] NOTE: Alice reports family history of heart disease (father, MI at 55). Recommended cardiac screening within 6 months.",
  ];
  await seedViaAdd(clinic, client, clinicFacts);

  // ── Seed Downtown Pharmacy (dispensing record with OLD info) ──
  sep("Seed: Downtown Pharmacy");
  const pharmacy = new Agent(PHARMACY_ID, PHARMACY_DS, client);
  const pharmacyFacts = [
    "[downtown_pharmacy] PATIENT Alice Chen (DOB 1991-04-12). Filled: Drug X 5mg tablets, #30, 1 refill. Prescriber: Dr. Patel. Note: patient requested generic. Filled May 20.",
    "[downtown_pharmacy] ALLERGY SCREENING: No known allergies on file. Patient denied allergies during intake Mar 15.",
    "[downtown_pharmacy] INSURANCE: BlueCross PPO plan BX-7721. Copay $15 for generic tier. Prior auth NOT required for Drug X 5mg.",
    "[downtown_pharmacy] INTERACTION CHECK: Drug X 5mg + patient's existing ibuprofen PRN — no significant interaction flagged.",
    "[downtown_pharmacy] PATIENT CONTACT: Phone (415) 555-0192, email alice.chen@example.com. Preferred pharmacy confirmed.",
  ];
  await seedViaAdd(pharmacy, client, pharmacyFacts);

  // ── Sync ────────────────────────────────────────────────────
  sep("Sync: Downtown Pharmacy → Northside Clinic");
  const trustStore = new TrustStore();
  const llmConfig = resolveLlmConfig();
  const engine = new SyncEngine({
    trustStore,
    autoMergeThreshold: 0.3,
    llmConfig,
  });

  const run = await engine.syncFromSource(
    client,
    CLINIC_DS,
    CLINIC_ID,
    PHARMACY_DS,
    PHARMACY_ID,
    pharmacyFacts,
    clinicFacts,
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
      console.log(`       Clinic:  "${c.existingStatement.slice(0, 120)}..."`);
      console.log(`       Pharmacy:"${c.incomingStatement.slice(0, 120)}..."`);
      console.log(`       Reason:  ${c.relation}`);
      console.log("");
    }
  }

  await acceptSync(run.id, engine, trustStore, CLINIC_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(CLINIC_ID, PHARMACY_ID).score.toFixed(3)}`,
  );

  // ── Improve ────────────────────────────────────────────────
  sep("Improve: Northside Clinic");
  const improveResult = await clinic.improve({
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
  sep("Clinical Reconciliation Summary");
  console.log("  Scenario: Pharmacy filled Drug X 5mg (old prescription)");
  console.log("  while Clinic had updated the dosage to 10mg.");
  console.log("  The contradiction was surfaced during sync.");
  console.log("");
  console.log("  Allergy conflict: Clinic records shellfish allergy,");
  console.log("  Pharmacy has 'no known allergies' from intake.");
  console.log("  → Resolution: Clinic record is authoritative (specialist).");

  sep("Done");
  console.log("  Run: pnpm demo");
}

main().catch((e) => {
  console.error("\n  Demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
