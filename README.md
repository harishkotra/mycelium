# mycelium

Multi-agent memory mesh — a TypeScript framework for agents that remember,
share, trust, and reconcile knowledge through a Cognee-backed graph memory
engine.

```
                     ┌──────────────┐
                     │   Dashboard  │  Next.js 15 / React 19
                     │  (visualize) │  d3-force · recharts
                     └──────┬───────┘
                            │ HTTP / mock data
              ┌─────────────┼──────────────┐
              │             │              │
        ┌─────▼─────┐ ┌────▼────┐ ┌───────▼───┐
        │   Agent   │ │  Agent  │ │  Agent    │  …
        │ (alice)   │ │ (bob)   │ │ (carol)   │
        │ dataset_a │ │dataset_b│ │ dataset_c │
        └─────┬─────┘ └────┬────┘ └───────┬───┘
              │             │              │
              ▼             ▼              ▼
        ┌──────────────────────────────────────┐
        │            Sync Engine               │
        │  provenance · subscription · trust   │
        │  structural-diff · contradiction     │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼───────────────────────┐
        │           Cognee Backend             │
        │  Kuzu graph · brute-force vectors    │
        │  mock embeddings · Groq / OpenAI     │
        └──────────────────────────────────────┘
```

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@mycelium/core` | `packages/core/` | Memory engine: Agent, CogneeClient, diff, trust, sync, LLM config |
| `@mycelium/cli` | `packages/cli/` | CLI scripts: spawn agents, simulate sync, inspect diffs |
| `@mycelium/dashboard` | `packages/dashboard/` | Next.js 15 dashboard: network graph, sync review, agent detail |

## Lifecycle Operations

| Phase | Operation | Module | Description |
|-------|-----------|--------|-------------|
| **Create** | `agent.remember(text)` | `agent.ts` | Ingest a fact with optional provenance prefix. Calls Cognee's add+cognify pipeline. |
| **Create** | `CogneeClient.add()` | `cogneeClient.ts` | Raw ingest — stores text without running the graph extraction pipeline. |
| **Read** | `agent.recall(query)` | `agent.ts` | Session-first recall; falls back to graph search for relevant facts. |
| **Read** | `takeSnapshot(client, ds)` | `snapshot.ts` | Dump the full graph (nodes + edges) from a dataset as a `GraphSnapshot`. |
| **Read** | `search(query, opts)` | `cogneeClient.ts` | Raw Cognee search (GRAPH_COMPLETION, CHUNKS, RAG, etc.). |
| **Diff** | `diffSnapshots(a, b)` | `structuralDiff.ts` | Pure set-diff on node/edge IDs with property-change detection. |
| **Diff** | `detectDrift(a, b)` | `driftDetector.ts` | Cosine-distance between before/after embeddings. |
| **Diff** | `runDiff(a, b, client, ds)` | `diff.ts` | Orchestrates structural diff + drift + contradiction into one `MemoryDiffResult`. |
| **Contradict** | `detectContradictions(client, ds, incoming, existing)` | `contradictionDetector.ts` | LLM-based contradiction judge (OpenAI-compatible API call). |
| **Contradict** | `resolveContradictions(list, opts)` | `contradictionResolver.ts` | Pure decision engine: `flag_all`, `keep_newer`, `keep_higher_trust`. |
| **Improve** | `agent.improve(opts)` | `agent.ts` | Cognee improve pipeline wrapped with before/after snapshot diff + auto-resolve. |
| **Sync** | `SyncEngine.syncFromSource(…)` | `sync-engine.ts` | Pull facts from a source dataset into a subscriber, with provenance tagging and trust-based auto-merge. |
| **Sync** | `acceptSync(id)`, `rejectSync(id)` | `acceptReject.ts` | Accept or reject a pending sync run; updates trust accordingly. |
| **Sync** | `revokeSource(id)` | `revoke.ts` | Forget all facts from a given source agent and restore prior snapshot. |
| **Trust** | `adjustTrust(score, action)` | `trustStore.ts` | Asymmetric trust nudges: accept = +0.05, reject = -0.2, clamped [0, 1]. |
| **Provenance** | `tagWithProvenance(text, prov)` | `provenance.ts` | Embed `__provenance__:{json}` prefix so fact origin survives round-trip through Cognee. |
| **Subscribe** | `SubscriptionRegistry.add(sub)` | `subscription.ts` | Register which agent subscribes to which source for sync. |
| **Configure** | `resolveLlmConfig(input)` | `llm.ts` | Resolve LLM provider, model, endpoint, and key from input + env + built-in presets. |
| **Forget** | `agent.forget(target)` | `agent.ts` | Delete an item, a dataset, or everything. |
| **Visualize** | Dashboard `/network` | `NetworkGraph.tsx` | Force-directed graph of agents with trust-weighted edges and drill-down. |

## Diff Engine

The three-pass diff pipeline (`packages/core/src/diff.ts`):

1. **Structural diff** (`structuralDiff.ts`) — set-diff on node/edge IDs; detects additions, removals, and property-level modifications.
2. **Drift detection** (`driftDetector.ts`) — cosine distance between before/after embedding vectors; flags nodes whose meaning has shifted beyond a threshold.
3. **Contradiction detection** (`contradictionDetector.ts`) — for each node present in both snapshots with differing properties, a direct LLM call (OpenAI-compatible) judges whether the statements contradict. Output is structured JSON with confidence score.

The pipeline runs on every `agent.improve()` call and is available standalone via `runDiff()`.

```ts
const result = await runDiff(beforeSnapshot, afterSnapshot, client, datasetName);
// result.structural.nodes.added    → GraphNodeSnapshot[]
// result.drifts                    → DriftResult[]
// result.contradictions            → ContradictionResult[]
// result.summary                   → { nodesAdded, nodesModified, contradictionsDetected, … }
```

## LLM Provider Configuration

Built-in presets in `llm.ts`:

| Provider | Default Model | Default Endpoint | Needs Key |
|----------|--------------|------------------|-----------|
| `openai` | `gpt-4o-mini` | `https://api.openai.com/v1` | yes |
| `groq` | `llama-3.1-8b-instant` | `https://api.groq.com/openai/v1` | yes |
| `lm-studio` | `local-model` | `http://localhost:1234/v1` | no |
| `ollama` | `llama3.2` | `http://localhost:11434/v1` | no |
| `custom-openai-compatible` | `gpt-4o-mini` | (user-set) | optional |

Override via env vars:
```
LLM_PROVIDER=groq
LLM_ENDPOINT=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_…
LLM_MODEL=llama-3.1-8b-instant
```

Legacy aliases `OPENAI_URL` and `OPENAI_TOKEN` still work as fallbacks.

## Quick Start

```bash
pnpm install
cp packages/core/.env.example packages/core/.env   # set your API key
pnpm --filter travel-assistant-demo demo
```

The demo:
1. Resets both datasets
2. Seeds a Travel Planner (3 facts) and a Personal Assistant (3 facts with a deliberate contradiction about flying)
3. Runs contradiction detection via LLM
4. Syncs the Assistant's facts into the Planner's dataset with provenance
5. Runs `agent.improve()` with diff + contradiction detection
6. Accepts the sync, bumping trust

## Tests

```bash
# LLM provider config (pure, no Cognee backend needed)
npx tsx packages/core/test-llm.mjs

# Diff engine (structural, drift, contradiction with mock LLM)
npx tsx packages/core/test-diff.mjs

# Sync protocol (trust, provenance, subscriptions, accept/reject)
npx tsx packages/core/test-sync.mjs

# Improve wrapper (resolver + mock Cognee client)
npx tsx packages/core/test-improve.ts
```

## Dashboard

```bash
pnpm dashboard
```

Opens `http://localhost:3000` with three screens:
- **`/`** — summary stats (agents, subscriptions, pending/accepted syncs)
- **`/network`** — force-directed agent graph (node size = fact count, edge thickness = trust)
- **`/review`** — sync run review with DiffCard, contradiction highlighting, Accept/Reject
- **`/agent/[id]`** — stored facts, trust sparkline, subscription tables, sync history

Currently uses mock data (`packages/dashboard/src/mock/`). Swap individual screens to real
`CogneeClient` calls as the backend is wired up.
