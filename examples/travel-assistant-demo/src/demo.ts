#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEnv = resolve(__dirname, "../../packages/core/.env");
if (existsSync(coreEnv)) dotenv.config({ path: coreEnv });

import {
  initRuntime,
  CogneeClient,
  type CogneeClientConfig,
  type GraphSnapshot,
  type LlmProvider,
  resolveLlmConfig,
  Agent,
  SyncEngine,
  TrustStore,
  acceptSync,
  detectContradictions,
  resolveContradictions,
} from "@mycelium/core";

const PLANNER_ID = "travel_planner";
const ASSISTANT_ID = "personal_assistant";
const PLANNER_DS = `demo_${PLANNER_ID}`;
const ASSISTANT_DS = `demo_${ASSISTANT_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
}

function toSnapshot(texts: string[]): GraphSnapshot {
  return {
    nodes: texts.map((t, i) => ({
      id: `fact_${i}`,
      label: "Fact",
      type: "synced_fact",
      properties: { text: t },
    })),
    edges: [],
  };
}

async function resetDemo(client: CogneeClient) {
  sep("Reset");
  for (const ds of [PLANNER_DS, ASSISTANT_DS]) {
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
  // Use add() (no pipeline) then skip cognify — graph extraction fails with
  // Groq's tool-call output. Data is stored; contradiction detection runs
  // independently via direct LLM call.
  for (const fact of facts) {
    await client.add({ type: "text", text: fact }, agent.datasetName);
    console.log(`  ✓ added: ${fact}`);
  }
  await client.waitForIndexingComplete(agent.datasetName);
  console.log(`  Add complete (${facts.length} facts).`);
}

/**
 * Pick a Cognee backend config. Returns `undefined` for local (Kuzu + brute-force),
 * or a Cognee Cloud config for production.
 */
function pickCloudConfig(): CogneeClientConfig | undefined {
  if (process.env.COGNEE_CLOUD_AUTH !== "1") return undefined;
  return {
    cogneeApiKey: process.env.COGNEE_CLOUD_API_KEY,
    cogneeApiUrl: process.env.COGNEE_CLOUD_API_URL ?? "https://api.cognee.ai",
    llmConfig: { provider: "openai", model: "gpt-4o-mini" },
    embeddingProvider: "openai",
    vectorDbProvider: "pinecone",
    graphDbProvider: "cognee-cloud",
  };
}

/**
 * Build an explicit LLM config for a specific provider.
 * Set USE_LLM_PROVIDER=groq|openai|lm-studio|ollama to override.
 */
function pickLlmProvider(): CogneeClientConfig | undefined {
  const provider = process.env["USE_LLM_PROVIDER"] as LlmProvider | undefined;
  if (!provider) return undefined;
  const cfg = resolveLlmConfig({ provider });
  return {
    llmConfig: cfg,
    llmModel: cfg.model,
    llmApiKey: cfg.apiKey,
    llmEndpoint: cfg.endpoint,
  };
}

async function main() {
  const cloudConfig = pickCloudConfig();
  const providerOverride = pickLlmProvider();

  initRuntime();

  // Merge: explicit provider override wins over cloud config
  const plannerConfig = providerOverride ?? cloudConfig;
  const assistantConfig = providerOverride ?? cloudConfig;

  const plannerClient = await CogneeClient.create(plannerConfig);
  const assistantClient =
    plannerConfig === assistantConfig
      ? plannerClient
      : await CogneeClient.create(assistantConfig);

  if (plannerConfig?.cogneeApiKey) console.log("  [planner] → Cognee Cloud");
  else
    console.log(
      `  [planner] → ${plannerClient.llmConfig.provider} / ${plannerClient.llmConfig.model}`,
    );
  if (assistantConfig?.cogneeApiKey)
    console.log("  [assistant] → Cognee Cloud");
  else
    console.log(
      `  [assistant] → ${assistantClient.llmConfig.provider} / ${assistantClient.llmConfig.model}`,
    );

  await resetDemo(plannerClient);

  // ── Seed Travel Planner ──────────────────────────────────────
  sep("Seed: Travel Planner");
  const planner = new Agent(PLANNER_ID, PLANNER_DS, plannerClient);
  const plannerFacts = [
    "[travel_planner] Alice has a business trip to Paris on June 15th.",
    "[travel_planner] Alice prefers direct flights over layovers.",
    "[travel_planner] Alice is comfortable with air travel and enjoys flying.",
  ];
  await seedViaAdd(planner, plannerClient, plannerFacts);

  // ── Seed Personal Assistant ──────────────────────────────────
  sep("Seed: Personal Assistant");
  const assistant = new Agent(ASSISTANT_ID, ASSISTANT_DS, assistantClient);
  const assistantFacts = [
    "[personal_assistant] Alice has a conference in Paris on June 14th.",
    "[personal_assistant] Alice always requests a window seat on flights.",
    "[personal_assistant] Alice is afraid of flying and avoids air travel whenever possible.",
  ];
  await seedViaAdd(assistant, assistantClient, assistantFacts);

  // ── Detect contradiction ─────────────────────────────────────
  sep("Contradiction Detection");
  const contradictions = await detectContradictions(
    null,
    PLANNER_DS,
    toSnapshot(assistantFacts),
    toSnapshot(plannerFacts),
  );
  if (contradictions.length > 0) {
    for (const c of contradictions) {
      const certainty = c.isContradiction ? "CONTRADICTION" : "compatible";
      const icon = c.isContradiction ? "⚠" : "✓";
      console.log(
        `  ${icon} [${certainty}] ${c.nodeLabel}  (confidence: ${c.confidence.toFixed(2)})`,
      );
      console.log(`     Existing: "${c.existingStatement}"`);
      console.log(`     Incoming: "${c.incomingStatement}"`);
      if (c.relation) console.log(`     Relation:  ${c.relation}`);
    }
  } else {
    console.log("  No contradictions detected.");
  }

  // ── Sync ─────────────────────────────────────────────────────
  sep("Sync: Personal Assistant → Travel Planner");
  const trustStore = new TrustStore();
  const engine = new SyncEngine({ trustStore, autoMergeThreshold: 0.3 });

  const run = await engine.syncFromSource(
    plannerClient,
    PLANNER_DS,
    PLANNER_ID,
    ASSISTANT_DS,
    ASSISTANT_ID,
    assistantFacts,
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
    for (const n of d.structural.nodes.added) {
      console.log(`    + ${String(n.properties.text ?? n.label).slice(0, 80)}`);
    }
  }
  if (d.contradictions.length) {
    console.log(`  Contradictions: ${d.contradictions.length}`);
    for (const c of d.contradictions) {
      const icon = c.isContradiction ? "⚠" : "↔";
      console.log(`    ${icon} ${c.nodeLabel}  (${c.confidence.toFixed(2)})`);
      console.log(`       Existing: "${c.existingStatement}"`);
      console.log(`       Incoming: "${c.incomingStatement}"`);
    }
  }

  await acceptSync(run.id, engine, trustStore, PLANNER_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(PLANNER_ID, ASSISTANT_ID).score.toFixed(3)}`,
  );

  // ── Improve with diff + contradiction detection ─────────────────
  sep("Improve: Travel Planner (with contradiction detection)");
  const improveResult = await planner.improve({
    autoResolve: true,
    resolutionStrategy: "keep_newer",
    resolutionConfidenceThreshold: 0.8,
  });
  console.log(
    `  Cognee stages: ${improveResult.improveResult.stagesRun.join(", ")}`,
  );
  console.log(
    `  Diff summary: ${improveResult.diff.summary.nodesAdded} nodes added, ${improveResult.diff.summary.nodesModified} modified, ${improveResult.diff.summary.nodesRemoved} removed`,
  );
  if (improveResult.diff.contradictions.length > 0) {
    console.log(
      `  Contradictions detected: ${improveResult.diff.contradictions.length}`,
    );
    for (const c of improveResult.diff.contradictions) {
      console.log(
        `    ⚠  ${c.nodeLabel}  (confidence: ${c.confidence.toFixed(2)})`,
      );
      console.log(`       Existing: "${c.existingStatement}"`);
      console.log(`       Incoming: "${c.incomingStatement}"`);
    }
  } else {
    console.log("  No contradictions detected.");
  }
  if (improveResult.resolvedContradictions.length > 0) {
    console.log(
      `  Auto-resolved: ${improveResult.resolvedContradictions.length}`,
    );
    for (const r of improveResult.resolvedContradictions) {
      console.log(
        `    → ${r.nodeLabel}: ${r.resolution}  (confidence: ${r.confidence.toFixed(2)})`,
      );
    }
  }

  // Show standalone resolver too
  const resolved = resolveContradictions(improveResult.diff.contradictions, {
    strategy: "flag_all",
  });
  console.log(`  Resolver (flag_all): ${resolved.length} would be flagged`);

  sep("Done");
  console.log("  Run the demo again with:");
  console.log("    pnpm demo");
  if (!cloudConfig) {
    console.log("\n  To test Cognee Cloud:");
    console.log("    COGNEE_CLOUD_AUTH=1 COGNEE_CLOUD_API_KEY=xxx pnpm demo");
  }
  if (!providerOverride) {
    console.log(
      "\n  To use a different LLM provider (openai, lm-studio, ollama):",
    );
    console.log("    USE_LLM_PROVIDER=openai pnpm demo");
  }
}

main().catch((e) => {
  console.error("\n  Demo failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
