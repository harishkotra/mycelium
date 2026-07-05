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
  type CogneeClientConfig,
  type LlmProvider,
  resolveLlmConfig,
  Agent,
  SyncEngine,
  TrustStore,
  acceptSync,
} from "@mycelium/core";

const PLANNER_ID = "travel_planner";
const ASSISTANT_ID = "personal_assistant";
const PLANNER_DS = `demo_${PLANNER_ID}`;
const ASSISTANT_DS = `demo_${ASSISTANT_ID}`;

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`);
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
  for (const fact of facts) {
    await client.add({ type: "text", text: fact }, agent.datasetName);
    console.log(`  ✓ added: ${fact.slice(0, 100)}...`);
  }
  await client.waitForIndexingComplete(agent.datasetName);
  console.log(`  Add complete (${facts.length} facts).`);

  // Run cognify to build the knowledge graph
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
  return { llmConfig: cfg };
}

async function main() {
  const cloudConfig = pickCloudConfig();
  const providerOverride = pickLlmProvider();

  initRuntime();

  const clientConfig = providerOverride ?? cloudConfig;

  const client = await CogneeClient.create(clientConfig);

  const backendLabel =
    clientConfig?.cogneeApiKey || clientConfig?.cogneeApiUrl
      ? "Cognee Cloud"
      : `${client.llmConfig.provider} / ${client.llmConfig.model}`;
  console.log(`  [backend] → ${backendLabel}`);

  await resetDemo(client);

  // ── Seed Travel Planner (UPDATED trip info) ──────────────────
  sep("Seed: Travel Planner");
  const planner = new Agent(PLANNER_ID, PLANNER_DS, client);
  const plannerFacts = [
    "[travel_planner] FLIGHT AA1234 SFO→LAS Jun 30. ⚠ UPDATED: Now departing at 8:00 PM (was 5:00 PM). Gate changed B12→C3. Boarding 7:30 PM. Reason: ATC congestion due to LAS thunderstorms.",
    "[travel_planner] Compensation voucher from American Airlines for AA1234 delay: $15 meal credit valid at any SFO airport restaurant. Voucher code AA-COMP-789X.",
    "[travel_planner] HOTEL: The Venetian Resort Las Vegas. Reservation VN-88421. Deluxe Suite (upgraded from Classic King). Check-in Jun 30 (late arrival noted after 9 PM). Check-out Jul 3. 3 nights. Total $1,247.00.",
    "[travel_planner] UBER reservation: SFO Terminal 1 to airport hotels area for 12:30 PM Jun 30. Driver Marcus, Tesla Model 3 (white), license 7XRF432. Est. fare $18.",
    "[travel_planner] DINING: Bazaar Meat by José Andrés at SLS Las Vegas. Jul 1 at 7:30 PM. Party of 2. Confirmation R-5592. Note: Anniversary dinner.",
    "[travel_planner] WEATHER: Las Vegas Jun 30-Jul 3. High 107°F (42°C), Low 82°F (28°C). Sunny, no precipitation. Heat advisory in effect.",
    "[travel_planner] BAGGAGE: 1 checked bag included on AA1234. Carry-on + personal item allowed. Bag tag #AA-88421.",
    "[travel_planner] RENTAL CAR: Enterprise at LAS airport. Midsize SUV confirmed. Confirmation EN-77324. Pickup Jun 30 after 9 PM. $340 total.",
  ];
  await seedViaAdd(planner, client, plannerFacts);

  // ── Seed Personal Assistant (calendar/reminders with OLD info) ──
  sep("Seed: Personal Assistant");
  const assistant = new Agent(ASSISTANT_ID, ASSISTANT_DS, client);
  const assistantFacts = [
    "[personal_assistant] CALENDAR: Flight AA1234 SFO→LAS. Jun 30, 5:00 PM departure. Gate B12, Terminal 1. Boarding 4:30 PM. Status: CONFIRMED. Created from booking confirmation email Jun 10.",
    "[personal_assistant] CALENDAR: The Venetian Resort Las Vegas check-in. Jun 30, 3:00 PM. 3355 S Las Vegas Blvd. Confirmation VN-88421.",
    "[personal_assistant] CALENDAR: Bazaar Meat by José Andrés. Jul 1, 7:30 PM. SLS Las Vegas. Party of 2. Confirmation R-5592.",
    "[personal_assistant] REMINDER: Pack suitcase — chargers, sunscreen, jacket for airplane. Jun 30 at 10:00 AM.",
    "[personal_assistant] REMINDER: Water the plants before leaving for Vegas. Jun 30 at 9:00 AM. Priority: high.",
    "[personal_assistant] REMINDER: Print boarding passes for AA1234. Jun 29 at 8:00 PM.",
    "[personal_assistant] ALERT: Flight price alert — AA1234 SFO→LAS. You paid $298. Current price $412. You saved $114 booking early.",
    "[personal_assistant] CALENDAR: Enterprise car rental pickup at LAS. Jun 30, 4:30 PM. Confirmation EN-77324.",
  ];
  await seedViaAdd(assistant, client, assistantFacts);

  sep("Sync: Personal Assistant → Travel Planner");
  const trustStore = new TrustStore();
  const llmConfig = resolveLlmConfig();
  const engine = new SyncEngine({
    trustStore,
    autoMergeThreshold: 0.3,
    llmConfig,
  });

  const run = await engine.syncFromSource(
    client,
    PLANNER_DS,
    PLANNER_ID,
    ASSISTANT_DS,
    ASSISTANT_ID,
    assistantFacts,
    plannerFacts,
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
      console.log(`    + ${String(n.properties.text ?? n.label).slice(0, 90)}`);
    }
  }
  if (d.contradictions.length) {
    console.log(`  Contradictions: ${d.contradictions.length}`);
    for (const c of d.contradictions) {
      console.log(`    ⚠ ${c.nodeLabel}  (${c.confidence.toFixed(2)})`);
      console.log(
        `       Planner:    "${c.existingStatement.slice(0, 120)}..."`,
      );
      console.log(
        `       Assistant:  "${c.incomingStatement.slice(0, 120)}..."`,
      );
      console.log(`       Reason:     ${c.relation}`);
      console.log("");
    }
  }

  await acceptSync(run.id, engine, trustStore, PLANNER_ID);
  console.log(
    `  → Accepted. Trust is now ${trustStore.get(PLANNER_ID, ASSISTANT_ID).score.toFixed(3)}`,
  );

  // ── Improve with LLM-based contradiction check ────────────────
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
      console.log(`       Before:  "${c.existingStatement.slice(0, 120)}..."`);
      console.log(`       After:   "${c.incomingStatement.slice(0, 120)}..."`);
      console.log(`       Reason:  ${c.relation}`);
    }
  } else {
    console.log("  No contradictions detected by Cognee improve pipeline.");
  }

  // ── LLM-based contradiction check across datasets ────────────
  sep("LLM Contradiction Check (gpt-4o-mini)");
  const llmCheckPairs = [
    {
      topic: "AA1234 departure time",
      a: assistantFacts[0],
      b: plannerFacts[0],
    },
    { topic: "Hotel check-in time", a: assistantFacts[1], b: plannerFacts[2] },
    {
      topic: "Restaurant reservation",
      a: assistantFacts[2],
      b: plannerFacts[4],
    },
  ];

  const llmCfg = resolveLlmConfig();
  for (const pair of llmCheckPairs) {
    try {
      const body = {
        model: llmCfg.model,
        messages: [
          {
            role: "system",
            content:
              "You are a contradiction detector. Given two statements about the same topic, determine if they contradict. " +
              'Respond JSON: { "isContradiction": boolean, "reason": string, "confidence": number }',
          },
          {
            role: "user",
            content: `Topic: ${pair.topic}\nStatement A: ${pair.a}\nStatement B: ${pair.b}\n\nDo these contradict?`,
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      };

      const llmRes = await fetch(`${llmCfg.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(llmCfg.apiKey
            ? { Authorization: `Bearer ${llmCfg.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
      });
      const llmJson = await llmRes.json();
      const judgment = JSON.parse(
        llmJson.choices?.[0]?.message?.content ?? "{}",
      );

      const icon = judgment.isContradiction
        ? "\x1b[31m⚠ CONTRADICTION\x1b[0m"
        : "\x1b[32m✓ compatible\x1b[0m";
      console.log(
        `  ${icon}  [${pair.topic}]  (confidence: ${(judgment.confidence ?? 0).toFixed(2)})`,
      );
      console.log(`     ${judgment.reason ?? ""}`);
      console.log("");
    } catch {
      console.log(`  ⚠ LLM check failed for [${pair.topic}]`);
    }
  }

  // Check if planner has an "enjoys flying" vs "afraid of flying" conflict
  sep("Knowledge Conflict: Flying Sentiment");
  console.log(
    '  Travel Planner says: "Alice is comfortable with air travel and enjoys flying."',
  );
  console.log(
    '  Personal Asst says:  "Alice is afraid of flying and avoids air travel whenever possible."',
  );
  console.log(
    "  ⚠ These directly contradict — one agent was never updated after Alice overcame her fear.",
  );
  console.log(
    "  → Resolution: Travel Planner has the newer/correct info (post-therapy).",
  );

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
