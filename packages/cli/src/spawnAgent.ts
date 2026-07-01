#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreEnv = resolve(__dirname, "../../core/.env");
if (existsSync(coreEnv)) dotenv.config({ path: coreEnv });

import { initRuntime, CogneeClient, Agent } from "@mycelium/core";

const AGENTS_DIR = resolve(__dirname, "../../../.mycelium/agents");

interface AgentRecord {
  agentId: string;
  datasetName: string;
  facts: string[];
}

async function loadAgents(): Promise<Map<string, AgentRecord>> {
  const map = new Map<string, AgentRecord>();
  try {
    const raw = readFileSync(resolve(AGENTS_DIR, "registry.json"), "utf-8");
    const arr: AgentRecord[] = JSON.parse(raw);
    for (const r of arr) map.set(r.agentId, r);
  } catch {}
  return map;
}

async function saveAgents(agents: Map<string, AgentRecord>): Promise<void> {
  await mkdir(AGENTS_DIR, { recursive: true });
  await writeFile(
    resolve(AGENTS_DIR, "registry.json"),
    JSON.stringify(Array.from(agents.values()), null, 2),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(
      "Usage: pnpm tsx packages/cli/src/spawnAgent.ts <agent-name> [--fact <text>...]",
    );
    process.exit(1);
  }

  const name = args[0];
  const factIdx = args.indexOf("--fact");
  const facts = factIdx !== -1 ? args.slice(factIdx + 1) : [];

  initRuntime();
  const client = await CogneeClient.create();
  const datasetName = `agent_${name}`;
  const agent = new Agent(name, datasetName, client);

  const agents = await loadAgents();
  if (agents.has(name)) {
    console.log(`Agent "${name}" already exists (dataset: ${datasetName}).`);
  } else {
    agents.set(name, { agentId: name, datasetName, facts: [] });
    await saveAgents(agents);
    console.log(`Created agent "${name}" → dataset "${datasetName}".`);
  }

  if (facts.length > 0) {
    const storedTexts: string[] = [];
    for (const fact of facts) {
      const uniqueText = `[${name}] ${fact} (${Date.now()})`;
      await agent.remember({ type: "text", text: uniqueText });
      console.log(`  Remembered: "${uniqueText}"`);
      storedTexts.push(uniqueText);
    }
    await agent.waitForIndexingComplete();
    console.log(`  Indexing complete for ${facts.length} fact(s).`);

    // Update registry with stored texts
    agents.set(name, { agentId: name, datasetName, facts: storedTexts });
    await saveAgents(agents);
  }

  const datasets = await client.datasets();
  const ds = datasets.find((d) => d.name === datasetName);
  console.log(`\nAgent: ${name}`);
  console.log(`  Dataset ID: ${ds?.id ?? "unknown"}`);
  console.log(`  Dataset:   ${datasetName}`);
  console.log(
    `  Facts:     ${facts.length > 0 ? facts.join(" | ") : "(none yet)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
