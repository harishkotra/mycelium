import type {
  GraphSnapshot,
  GraphNodeSnapshot,
  ContradictionResult,
} from "./types";
import type { CogneeClient } from "./cogneeClient";
import { type LlmConfigInput, resolveLlmConfig } from "./llm";

export interface ContradictionDetectorOptions {
  /** Pass LLM config inline (endpoint, apiKey, model). */
  llmEndpoint?: string;
  llmApiKey?: string;
  llmModel?: string;
  /** Or pass a full LlmConfigInput object (takes precedence over individual fields). */
  llmConfig?: LlmConfigInput;
  confidenceThreshold?: number;
}

function resolveDetectorOpts(opts: ContradictionDetectorOptions): {
  endpoint: string;
  apiKey: string;
  model: string;
} {
  if (opts.llmConfig) {
    const c = resolveLlmConfig(opts.llmConfig);
    return { endpoint: c.endpoint, apiKey: c.apiKey, model: c.model };
  }
  const c = resolveLlmConfig({
    endpoint: opts.llmEndpoint,
    apiKey: opts.llmApiKey,
    model: opts.llmModel,
  });
  return { endpoint: c.endpoint, apiKey: c.apiKey, model: c.model };
}

async function callLlm(
  prompt: string,
  opts: ContradictionDetectorOptions,
): Promise<{ isContradiction: boolean; relation: string; confidence: number }> {
  const { endpoint, apiKey, model } = resolveDetectorOpts(opts);

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a contradiction detector for a knowledge graph. " +
          "Given an existing statement and an incoming statement about the same entity, " +
          "determine if they contradict each other. " +
          'Respond with valid JSON only: { "isContradiction": boolean, "relation": string, "confidence": number (0-1) }.',
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM call failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(raw);
}

/**
 * Compare every node in `incoming` against the knowledge stored in
 * `client`'s dataset. Returns any contradictions found.
 */
export async function detectContradictions(
  client: CogneeClient | null,
  datasetName: string,
  incoming: GraphSnapshot,
  existing: GraphSnapshot,
  opts?: ContradictionDetectorOptions,
): Promise<ContradictionResult[]> {
  if (!client) return [];

  const threshold = opts?.confidenceThreshold ?? 0.6;
  const results: ContradictionResult[] = [];

  const existingNodeMap = new Map(existing.nodes.map((n) => [n.label, n]));

  for (const node of incoming.nodes) {
    const existingNode = existingNodeMap.get(node.label);
    if (!existingNode) continue;

    // Skip if node is identical in both snapshots
    if (
      JSON.stringify(existingNode.properties) ===
        JSON.stringify(node.properties) &&
      existingNode.type === node.type
    ) {
      continue;
    }

    const existingRole = existingNode.properties.role ?? existingNode.type;
    const incomingRole = node.properties.role ?? node.type;

    const prompt =
      `Existing statement: "${node.label}" has role "${existingRole}" in dataset "${datasetName}".\n` +
      `Incoming statement: "${node.label}" has role "${incomingRole}".\n` +
      `Do these contradict each other?`;

    let judgment: {
      isContradiction: boolean;
      relation: string;
      confidence: number;
    };
    try {
      judgment = await callLlm(prompt, opts ?? {});
    } catch {
      continue;
    }

    if (judgment.isContradiction && judgment.confidence >= threshold) {
      results.push({
        nodeLabel: node.label,
        sourceDataset: datasetName,
        targetDataset: datasetName,
        existingStatement: `role: ${existingRole}`,
        incomingStatement: `role: ${incomingRole}`,
        isContradiction: true,
        relation: judgment.relation,
        confidence: judgment.confidence,
      });
    }
  }

  return results;
}

/**
 * First-pass: quick check using graph search (no LLM call).
 * Returns potential conflicts based on differing property values.
 */
export async function detectContradictionsLight(
  client: CogneeClient,
  datasetName: string,
  incoming: GraphSnapshot,
): Promise<ContradictionResult[]> {
  const results: ContradictionResult[] = [];

  for (const node of incoming.nodes) {
    const label = node.label;
    if (!label) continue;

    const searchRes = await client.search(label, {
      datasets: [datasetName],
      searchType: "GRAPH_COMPLETION",
      topK: 3,
    });

    const answer =
      searchRes.result?.kind === "Text" ? searchRes.result.data : null;
    if (!answer || answer.toLowerCase().includes("no information")) continue;

    const role = node.properties.role ?? node.type;
    results.push({
      nodeLabel: label,
      sourceDataset: datasetName,
      targetDataset: datasetName,
      existingStatement: answer,
      incomingStatement: `role: ${role}`,
      isContradiction: false,
      relation: "needs_judgment",
      confidence: 0,
    });
  }

  return results;
}
