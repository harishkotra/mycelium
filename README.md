<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-yellow" alt="Status: Alpha">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/tests-68%20passing-brightgreen" alt="Tests: 68 passing">
</p>

<h1 align="center">🍄 mycelium</h1>
<p align="cemter"><em>Multi-agent memory mesh — agents that remember, share, trust, and reconcile knowledge.</em></p>

---

> **Why mycelium?** In nature, mycelium networks connect individual fungi into a shared information web — nutrients, warnings, and signals flow between organisms through underground threads. This project applies the same idea to AI agents: each agent has its own memory (dataset) but can sync, share, and reconcile facts with peers through a trust-weighted protocol.

---

## Overview

Mycelium is a TypeScript framework for building AI agents with **persistent shared memory** backed by a knowledge graph (Cognee + Kuzu). Agents don't just respond to prompts — they remember facts, sync with peer agents via a provenance-tracked protocol, detect and resolve contradictions through LLM calls, and build trust over time.

```
                       ┌──────────────────┐
                       │    Dashboard     │  Next.js 15 / React 19
                       │  d3-force viz   │
                       └────────┬─────────┘
                                │ HTTP / mock data
                ┌───────────────┼────────────────┐
                │               │                │
          ┌─────▼─────────┐ ┌──▼───────────┐ ┌──▼───────────┐
          │  Agent Alpha  │ │ Agent Beta   │ │ Agent Gamma  │  …
          │  dataset_a    │ │ dataset_b    │ │ dataset_c    │
          └─────┬─────────┘ └──────┬────────┘ └──────┬────────┘
                │                  │                  │
                ▼                  ▼                  ▼
          ┌──────────────────────────────────────────────┐
          │            Sync Engine                       │
          │  provenance · subscription · trust            │
          │  structural-diff · contradiction detection   │
          │  LLM-based batched contradiction checking    │
          └────────────────────┬─────────────────────────┘
                               │
          ┌────────────────────▼─────────────────────────┐
          │         Cognee Backend (Rust SDK)            │
          │  Kuzu graph DB · ONNX embeddings             │
          │  OpenAI-compatible LLM routing               │
          └──────────────────────────────────────────────┘
```

---

## Quick Start

```bash
pnpm install
cp packages/core/.env.example packages/core/.env   # set LLM_API_KEY / OPENAI_API_KEY
```

Run any of the 5 end-to-end demos:

```bash
# Travel Assistant — flight delay contradiction (5 PM vs 8 PM)
pnpm --filter travel-assistant-demo demo

# Healthcare — medication dosage contradiction (5 mg vs 10 mg)
pnpm --filter healthcare-demo demo

# Supply Chain — inventory count contradiction (500 units vs 200 units)
pnpm --filter supply-chain-demo demo

# Smart Home — motion sensor contradiction (motion detected vs no motion)
pnpm --filter smart-home-demo demo

# News Verification — project type contradiction (park vs library)
pnpm --filter news-verification-demo demo
```

**No Cognee Cloud needed** — runs locally with embedded Kuzu graph DB and ONNX embeddings (bge-small-en-v1.5 auto-downloads to `./target/models/`).

---

## Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript (ES2022) | Type-safe graph data structures |
| Runtime | Node.js via `tsx` | Zero-config TypeScript execution (no build step) |
| Monorepo | pnpm workspaces | Independent packages, shared types |
| Graph Memory | Cognee Rust addon (`@cognee/cognee-ts`) | Graph extraction, entity resolution, triplet indexing |
| Graph DB | Kuzu (embedded, via Cognee) | Native graph storage, no external server |
| Embeddings | ONNX (bge-small-en-v1.5, via Cognee) | Local embedding, auto-downloaded on first use |
| LLM | OpenAI / Groq / LM Studio / Ollama / custom | Pluggable via single `LLM_PROVIDER` env var |
| Dashboard | Next.js 15 / React 19 / d3-force / Recharts | Network viz, sync review, agent detail |

---

## Architecture

### Packages

| Package | Path | Status |
|---------|------|--------|
| `@mycelium/core` | `packages/core/` | Active — Agent, CogneeClient, diff engine, LLM config, trust, sync, contradiction detection |
| `@mycelium/cli` | `packages/cli/` | Active — `inspectDiff`, `simulateSync`, `spawnAgent` |
| `@mycelium/dashboard` | `packages/dashboard/` | Active — Next.js 15 visualization layer |
| `@mycelium/diff-engine` | `packages/diff-engine/` | Scaffold — standalone npm package (planned) |
| `@mycelium/sync-protocol` | `packages/sync-protocol/` | Scaffold — standalone npm package (planned) |
| `@mycelium/trust` | `packages/trust/` | Scaffold — standalone npm package (planned) |

### Example Demos

| Example | Path | Agents | Contradiction | Domain |
|---------|------|--------|---------------|--------|
| Travel Assistant | `examples/travel-assistant-demo/` | Planner ↔ Assistant | Flight time 5 PM vs 8 PM | Personal travel |
| Healthcare | `examples/healthcare-demo/` | Clinic ↔ Pharmacy | Drug dosage, allergy status | Medical records |
| Supply Chain | `examples/supply-chain-demo/` | Warehouse Alpha ↔ Beta | Inventory count, unit cost | Logistics |
| Smart Home | `examples/smart-home-demo/` | Living Room Hub ↔ Security Hub | Temperature, motion, window | IoT sensors |
| News Verification | `examples/news-verification-demo/` | NewsWire ↔ CityPress | Project type, budget, location | Journalism |

Each demo follows the same lifecycle: **reset → seed + cognify → sync (automatic LLM contradiction detection → trust penalty) → improve → narrative summary**.

---

## Core Concepts

### 1. Agent

Each agent wraps a Cognee dataset and exposes a high-level API. Agents are created with an ID, a dataset name, and a `CogneeClient` backend.

```ts
import { CogneeClient, Agent } from "@mycelium/core";

const client = await CogneeClient.create({
  llmConfig: { provider: "groq", model: "llama-3.1-8b-instant" },
});

const alpha = new Agent("warehouse_alpha", "demo_warehouse_alpha", client);
```

**Agent.remember()** — Ingest a fact with optional provenance:

```ts
await alpha.remember(
  { type: "text", text: "SKU WX-1001: 500 units in stock." },
  { provenance: { sourceAgentId: "warehouse_alpha", factId: "f1", timestamp: Date.now() } },
);
```

**Agent.recall()** — Query the graph:

```ts
const results = await alpha.recall("How many Widget Pro units do we have?");
```

**Agent.improve()** — Run Cognee's improve pipeline wrapped with before/after snapshot diff, contradiction detection, and optional auto-resolution:

```ts
const result = await alpha.improve({
  autoResolve: true,
  resolutionStrategy: "keep_newer",
});

console.log(result.diff.summary);
// → { nodesAdded: 2, contradictionsDetected: 1, ... }
console.log(result.resolvedContradictions);
// → [{ nodeLabel: "Widget Pro", resolution: "kept_incoming", ... }]
```

### 2. CogneeClient

A configurable wrapper around Cognee's Rust SDK. Cognee internally reads `process.env.LLM_PROVIDER` and only accepts `"openai"` or `"mock"` — CogneeClient handles this by deleting the user's provider and rewriting env vars, seamlessly routing requests through OpenAI-compatible endpoints.

```ts
const client = await CogneeClient.create({
  llmConfig: { provider: "ollama", endpoint: "http://localhost:11434/v1", model: "llama3.2" },
});

console.log(client.llmConfig);
// → { provider: "ollama", model: "llama3.2", endpoint: "http://localhost:11434/v1", ... }
```

Key methods:

```ts
await client.add({ type: "text", text: "fact" }, "dataset_name");

await client.cognify("dataset_name");                       // extract graph entities + edges
await client.search("query", { datasets: ["ds"], searchType: "GRAPH_COMPLETION" });

await client.forget({ kind: "dataset", dataset: { name: "ds" } });  // delete dataset
await client.resetDatasetPipeline("dataset_name");          // unstick stuck pipeline runs
```

### 3. Snapshot

A point-in-time dump of an agent's knowledge graph (nodes + edges). Used as the before/after inputs for diff and contradiction detection.

```ts
import { takeSnapshot } from "@mycelium/core";

export interface GraphSnapshot {
  nodes: GraphNodeSnapshot[];   // { id, label, type, properties }
  edges: GraphEdgeSnapshot[];   // { id, sourceNodeId, targetNodeId, relationship, properties }
}

const before = await takeSnapshot(client, "demo_warehouse_alpha");
// cognify / improve / add facts ...
const after = await takeSnapshot(client, "demo_warehouse_alpha");
// compare with runDiff()
```

### 4. Diff Engine (Three-Pass)

The `runDiff()` function runs three passes over two snapshots:

**Pass 1 — Structural Diff** (`structuralDiff.ts`):
Pure set-diff on node/edge IDs with property-change detection. No I/O, no LLM.

```ts
const structural = diffSnapshots(before, after);
// → { nodes: { added: [...], removed: [...], modified: [...] },
//     edges: { added: [...], removed: [...], modified: [...] } }
```

**Pass 2 — Embedding Drift** (`driftDetector.ts`):
Cosine distance between before/after embedding vectors. Flags nodes whose semantic meaning drifted beyond a configurable threshold (default: 0.15).

```ts
import { cosineDistance } from "@mycelium/core";
const dist = cosineDistance(embeddingA, embeddingB);
// → 0.0 (identical) ... 1.0 (opposite)
```

**Pass 3 — Graph-Level Contradiction Detection** (`contradictionDetector.ts`):
For each node that changed between snapshots, sends a structured prompt to an LLM to judge whether the statements contradict.

```ts
const contradictions = await detectContradictions(client, dataset, afterSnapshot, beforeSnapshot);
// → [{ nodeLabel, existingStatement, incomingStatement, isContradiction, confidence }]
```

### 5. Contradiction Detection During Sync

In addition to the graph-level check above, `SyncEngine.syncFromSource()` runs a **separate batched LLM contradiction scan** between the raw fact strings of the source and subscriber agents. This catches text-level contradictions that the graph-level diff might miss (e.g., conflicting times, prices, or quantities).

```ts
const engine = new SyncEngine({
  trustStore,
  autoMergeThreshold: 0.3,
  llmConfig: resolveLlmConfig(),         // required for LLM-based detection
});

const run = await engine.syncFromSource(
  client,                                 // Cognee backend
  "demo_warehouse_alpha",                 // subscriber dataset
  "warehouse_alpha",                      // subscriber agent ID
  "demo_warehouse_beta",                  // source dataset
  "warehouse_beta",                       // source agent ID
  betaFacts,                              // source fact strings
  alphaFacts,                             // subscriber fact strings (optional, enables detection)
);
```

The method:
1. Sends all source + subscriber facts in a **single batched LLM prompt**
2. Parses the response: `{ contradictions: [{ sIndex, tIndex, reason, confidence }] }`
3. Deduplicates by pair index
4. Populates `run.diff.contradictions` with the results
5. If contradictions are found → decision is `"pending_review"` → trust receives a `reject` penalty (-0.2)

This is the primary contradiction detection path used by the demo examples.

### 6. Contradiction Resolution

A pure decision engine — no side effects, no graph calls.

```ts
import { resolveContradictions } from "@mycelium/core";

const resolved = resolveContradictions(contradictions, {
  strategy: "keep_newer",              // "flag_all" | "keep_newer" | "keep_higher_trust"
  confidenceThreshold: 0.8,
});
// → [{ nodeLabel, existingStatement, incomingStatement, resolution, confidence }]
```

Strategies:
- **`flag_all`** (default) — keep both, flag for human review
- **`keep_newer`** — incoming fact wins (above confidence threshold)
- **`keep_higher_trust`** — existing fact wins (above confidence threshold)

Below the confidence threshold, all contradictions are flagged regardless of strategy.

### 7. Sync Protocol

The `SyncEngine` brokers fact exchange between agents with provenance tracking and trust-based auto-merge.

```ts
import { SyncEngine, TrustStore, acceptSync } from "@mycelium/core";

const trustStore = new TrustStore();
const engine = new SyncEngine({
  trustStore,
  autoMergeThreshold: 0.6,      // trust ≥ 0.6 → auto-merge without review
});

const run = await engine.syncFromSource(
  client, "dataset_a", "agent_a", "dataset_b", "agent_b",
  ["Fact 1", "Fact 2"],
  ["Existing fact 1", "Existing fact 2"],   // enables contradiction check
);

await acceptSync(run.id, engine, trustStore, "agent_a");
// Trust: 0.5 → 0.55 (auto_merged) or 0.5 → 0.3 (pending_review due to contradictions)
```

**Trust model**: Starting at 0.5.
- Auto-merge (no contradictions + trust ≥ threshold) → +0.05
- Pending review (contradictions found) → -0.2
- Manual accept → +0.05 (applied after review)
- Manual reject → -0.2
- Clamped to [0, 1]

Contradictions are weighted heavily — one contradiction is enough to flip `auto_merged` to `pending_review` regardless of trust level.

### 8. Provenance

Facts are tagged with their origin before storage, and the tag survives round-trips through Cognee. This enables traceability back to the source agent after facts are merged into another agent's dataset.

```ts
import { tagWithProvenance, extractProvenance, ProvenanceRegistry } from "@mycelium/core";

const tagged = tagWithProvenance(
  "Alice enjoys flying.",
  { sourceAgentId: "assistant", factId: "f123", timestamp: 1700000000000 },
);
// → '__provenance__:{"sourceAgentId":"assistant","factId":"f123","timestamp":1700000000000}\nAlice enjoys flying.'

const { provenance, cleanText } = extractProvenance(tagged);
// → { provenance: { sourceAgentId: "assistant", ... }, cleanText: "Alice enjoys flying." }
```

The `ProvenanceRegistry` tracks all tagged facts in memory and supports lookup by source agent, deletion by source, and full enumeration.

### 9. LLM Provider Configuration

Swap providers with a single env var — no code changes.

```bash
# Using .env or export
LLM_PROVIDER=groq
LLM_ENDPOINT=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.1-8b-instant

# Or override at runtime per example
USE_LLM_PROVIDER=openai pnpm --filter healthcare-demo demo
USE_LLM_PROVIDER=lm-studio pnpm --filter supply-chain-demo demo
USE_LLM_PROVIDER=ollama pnpm --filter smart-home-demo demo
```

| Provider | Default Model | Default Endpoint | Needs Key |
|----------|--------------|------------------|-----------|
| `openai` | `gpt-4o-mini` | `https://api.openai.com/v1` | yes |
| `groq` | `llama-3.1-8b-instant` | `https://api.groq.com/openai/v1` | yes |
| `lm-studio` | `local-model` | `http://localhost:1234/v1` | no |
| `ollama` | `llama3.2` | `http=http://localhost:11434/v1` | no |
| `custom-openai-compatible` | `gpt-4o-mini` | (user-set) | optional |

Resolution order: **explicit input > env vars > provider presets > hard defaults**.

---

## Lifecycle Operations

| Phase | Operation | Module | Description |
|-------|-----------|--------|-------------|
| **Create** | `agent.remember(text)` | `agent.ts` | Ingest a fact with optional provenance prefix |
| **Create** | `client.add(text, ds)` | `cogneeClient.ts` | Raw ingest (no graph extraction) |
| **Cognify** | `client.cognify(ds)` | `cogneeClient.ts` | Run graph extraction pipeline (entities, edges, chunks) |
| **Cognify** | `client.resetDatasetPipeline(ds)` | `cogneeClient.ts` | Unstick a stuck pipeline run status |
| **Read** | `agent.recall(query)` | `agent.ts` | Session-first recall with graph fallback |
| **Read** | `takeSnapshot(client, ds)` | `snapshot.ts` | Full graph dump as `GraphSnapshot` |
| **Read** | `client.search(query, opts)` | `cogneeClient.ts` | Raw Cognee search (GRAPH_COMPLETION, CHUNKS, RAG) |
| **Diff** | `diffSnapshots(a, b)` | `structuralDiff.ts` | Pure set-diff with property-change detection |
| **Diff** | `detectDrift(a, b)` | `driftDetector.ts` | Cosine-distance on embedding vectors |
| **Diff** | `detectContradictions(client, ds, incoming, existing)` | `contradictionDetector.ts` | LLM-based contradiction judge on graph nodes |
| **Diff** | `runDiff(a, b, client, ds)` | `diff.ts` | Orchestrates all three passes into `MemoryDiffResult` |
| **Improve** | `agent.improve(opts)` | `agent.ts` | Cognee improve + before/after diff + auto-resolve |
| **Resolve** | `resolveContradictions(list, opts)` | `contradictionResolver.ts` | Pure decision engine (no side effects) |
| **Sync** | `SyncEngine.syncFromSource(…)` | `syncEngine.ts` | Pull facts with provenance + batched LLM contradiction detection + trust-based decision |
| **Sync** | `acceptSync(id)` | `acceptReject.ts` | Accept pending sync, bump trust |
| **Sync** | `rejectSync(id)` | `acceptReject.ts` | Reject pending sync, drop trust |
| **Sync** | `revokeSource(id)` | `revoke.ts` | Forget all facts from a source; restore prior snapshot |
| **Trust** | `adjustTrust(score, action)` | `trustStore.ts` | Asymmetric nudges (+0.05 / -0.2), clamped [0, 1] |
| **Trust** | `TrustStore.get(source, target)` | `trustStore.ts` | Look up current trust between two agents |
| **Provenance** | `tagWithProvenance(text, prov)` | `provenance.ts` | Embed source metadata in fact text |
| **Provenance** | `ProvenanceRegistry` | `provenance.ts` | In-memory registry with lookup, delete, enumerate |
| **Subscribe** | `SubscriptionRegistry.add(sub)` | `subscription.ts` | Register agent-to-source subscriptions |
| **Configure** | `resolveLlmConfig(input)` | `llm.ts` | Resolve provider config from input + env + presets |
| **Forget** | `agent.forget(target)` | `agent.ts` | Delete item / dataset / everything |
| **Visualize** | Dashboard `/network` | `NetworkGraph.tsx` | Force-directed graph with trust-weighted edges |

---

## CLI Tools

```bash
npx tsx packages/cli/src/spawnAgent.ts       # Create and seed a new agent
npx tsx packages/cli/src/simulateSync.ts     # Simulate a sync between agents
npx tsx packages/cli/src/inspectDiff.ts      # Inspect a diff from a sync run
```

---

## Dashboard

```bash
pnpm dashboard
# → http://localhost:3000
```

| Route | Description |
|-------|-------------|
| `/` | Summary stats: agents, subscriptions, pending/accepted syncs |
| `/network` | Force-directed graph (d3-force); node size = fact count, edge thickness = trust |
| `/review` | Sync run review with DiffCard, contradiction highlighting, Accept/Reject |
| `/agent/[id]` | Stored facts, trust sparkline, subscriptions, sync history |

Currently uses mock data. Swap screens to real `CogneeClient` calls as the backend is wired up.

---

## Tests

```bash
# LLM provider config (pure, no Cognee backend needed)
npx tsx packages/core/test-llm.mjs
# → 36 tests: provider presets, overrides, env vars, legacy fallbacks, URL detection

# Improve wrapper + contradiction resolver
npx tsx packages/core/test-improve.ts
# → 32 tests: resolver strategies, mock Cognee client, snapshot diff
```

---

## How to Contribute

### Getting Started

```bash
git clone https://github.com/harishkotra/mycelium
cd mycelium
pnpm install
cp packages/core/.env.example packages/core/.env    # set your API key
pnpm --filter travel-assistant-demo demo             # verify it works
```

### Design Principles

- **No hidden side-effects** — pure functions (`diffSnapshots`, `resolveContradictions`, `cosineDistance`) are explicitly separated from I/O-bound code
- **Env-var-first config** — one `LLM_PROVIDER` env var changes the entire LLM stack
- **Provider abstraction** — the contradiction detector calls raw `fetch()` to OpenAI-compatible APIs rather than importing per-provider SDKs
- **Cognee as implementation detail** — the `Agent` class wraps Cognee internally; consumers don't import Cognee types directly
- **Batched LLM detection** — contradiction scans send all facts in a single prompt, not one LLM call per pair, keeping costs low (~$0.01 per demo run on gpt-4o-mini)

### Codebase Tour

| Directory | What's Inside |
|-----------|---------------|
| `packages/core/src/` | `CogneeClient`, `Agent`, diff engine, trust, sync protocol, contradiction detection, LLM config |
| `packages/core/src/sync-protocol/` | `SyncEngine`, provenance tagging, subscription registry, accept/reject, revoke |
| `packages/core/src/trust/` | `TrustStore` with asymmetric accept/reject adjustment |
| `packages/core/src/contradictionDetector.ts` | LLM-based graph node contradiction check |
| `packages/core/src/contradictionResolver.ts` | Pure strategy-based resolution engine |
| `packages/core/src/llm.ts` | Provider presets, `resolveLlmConfig()`, env var resolution |
| `packages/cli/src/` | `spawnAgent`, `simulateSync`, `inspectDiff` CLIs |
| `packages/dashboard/` | Next.js 15 visualization (mock data currently) |
| `examples/*/src/demo.ts` | 5 end-to-end demos (see Architecture table above) |

### Feature Ideas

| Feature | Difficulty | Area | Description |
|---------|-----------|------|-------------|
| **Persist sync run history** | Easy | Sync | Currently in-memory only (`Map<string, SyncRun>`); write to JSON or SQLite |
| **Agent.sync() method** | Medium | Agent | Add `agent.sync(peerAgent, engine)` that exchanges diffs with a peer |
| **WebSocket live sync** | Medium | Sync | Replace polling with real-time sync events between agents |
| **Dashboard → real backend** | Medium | Dashboard | Swap mock data with `CogneeClient` API calls, one screen at a time |
| **Diff engine npm package** | Easy | Publishing | Extract `@mycelium/diff-engine` as standalone, framework-agnostic package |
| **Sync protocol npm package** | Easy | Publishing | Extract `@mycelium/sync-protocol` |
| **Cross-dataset contradiction scan** | Medium | Diff | Scan all connected datasets for contradictions, not just before/after improve |
| **Vector DB persistence** | Medium | Cognee | Brute-force vector DB loses index after restart; add proper persistence |
| **CLI: interactive agent management** | Medium | CLI | `mycelium agent create`, `mycelium agent feed`, `mycelium agent status` |
| **Ollama embeddings** | Hard | Cognee | Cognee only supports OpenAI-compatible embeddings; add Ollama embedding path |
| **Trust decay** | Medium | Trust | Trust scores decay over time (e.g., -0.01/day) if no recent sync |
| **Fact expiry / TTL** | Medium | Agent | Facts auto-expire after configurable TTL with notification webhook |
| **Git-like 3-pane merge UI** | Hard | Dashboard | Three-pane diff view for sync review in dashboard |
| **Constitutional memory** | Hard | Agent | Agents reject facts that violate a predefined constitution / rule set |
| **Multi-hop trust** | Medium | Trust | A trusts B, B trusts C → should A partially trust C? |
| **Batch fact ingestion** | Easy | Agent | `agent.rememberAll([...])` with single provenance batch ID |
| **Fact deduplication on sync** | Medium | Sync | Detect and skip already-known facts during `syncFromSource` |
| **Contradiction evidence citation** | Medium | Sync | LLM returns specific conflicting snippet instead of full statement |
| **Configurable contradiction threshold** | Easy | Sync | Expose `confidenceThreshold` in `SyncEngineOptions` |
| **Human-in-the-loop contradiction review** | Medium | Dashboard | Dashboard review page calls `acceptSync`/`rejectSync` from the UI |

### PR Guidelines

1. Run the existing test suite before submitting
2. Pure functions = no async, no side effects; I/O-bound = clearly separated
3. New provider support needs a preset in `llm.ts` + tests in `test-llm.mjs`
4. Types go in `types.ts` (or near the module if domain-specific)
5. Keep `index.ts` barrel exports in sync
6. New example demos should follow the existing pattern: reset → seed + cognify → sync → improve → narrative summary
7. All demo facts should use the `[agent_id]` prefix convention for topic extraction

---

## License

MIT

---

<div align="center">
  <p>Built by <a href="https://harishkotra.me">Harish Kotra</a></p>
  <p>Check out other builds at <a href="https://dailybuild.xyz">dailybuild.xyz</a></p>
</div>
