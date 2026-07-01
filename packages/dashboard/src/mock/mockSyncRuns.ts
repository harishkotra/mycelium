import type { SyncRun, MemoryDiffResult, GraphSnapshot } from "@/lib/types";

const emptySnapshot: GraphSnapshot = { nodes: [], edges: [] };

function snapshotFromFacts(facts: string[]): GraphSnapshot {
  return {
    nodes: facts.map((t, i) => ({
      id: `fact_${i}`,
      label: "Fact",
      type: "synced_fact",
      properties: { text: t },
    })),
    edges: [],
  };
}

function diffWith(
  before: GraphSnapshot,
  after: GraphSnapshot,
  contradictions?: MemoryDiffResult["contradictions"],
): MemoryDiffResult {
  const beforeIds = new Set(before.nodes.map((n) => n.id));
  const added = after.nodes.filter((n) => !beforeIds.has(n.id));
  return {
    before,
    after,
    structural: {
      nodes: { added, removed: [], modified: [] },
      edges: { added: [], removed: [], modified: [] },
    },
    contradictions: contradictions ?? [],
    drifts: [],
    summary: {
      totalNodesBefore: before.nodes.length,
      totalNodesAfter: after.nodes.length,
      totalEdgesBefore: before.edges.length,
      totalEdgesAfter: after.edges.length,
      nodesAdded: added.length,
      nodesRemoved: 0,
      nodesModified: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
      edgesModified: 0,
      driftsDetected: 0,
      contradictionsDetected: contradictions?.length ?? 0,
    },
  };
}

export const mockSyncRuns: SyncRun[] = [
  {
    id: "sync_1",
    subscriberDataset: "agent_alice",
    sourceDataset: "agent_bob",
    beforeSnapshot: emptySnapshot,
    afterSnapshot: snapshotFromFacts(["[bob] Bob likes dogs."]),
    diff: diffWith(emptySnapshot, snapshotFromFacts(["[bob] Bob likes dogs."])),
    decision: "auto_merged",
    status: "accepted",
    trustScoreBefore: 0.5,
    trustScoreAfter: 0.55,
    createdAt: Date.now() - 86400000,
  },
  {
    id: "sync_2",
    subscriberDataset: "agent_carol",
    sourceDataset: "agent_dave",
    beforeSnapshot: emptySnapshot,
    afterSnapshot: snapshotFromFacts(["[dave] Dave runs a bakery."]),
    diff: diffWith(
      emptySnapshot,
      snapshotFromFacts(["[dave] Dave runs a bakery."]),
    ),
    decision: "auto_merged",
    status: "pending",
    trustScoreBefore: 0.55,
    trustScoreAfter: 0.6,
    createdAt: Date.now() - 43200000,
  },
  {
    id: "sync_3",
    subscriberDataset: "agent_alice",
    sourceDataset: "agent_carol",
    beforeSnapshot: snapshotFromFacts([
      "[alice] Alice likes cats.",
      "[bob] Bob likes dogs.",
    ]),
    afterSnapshot: snapshotFromFacts([
      "[alice] Alice likes cats.",
      "[bob] Bob likes dogs.",
      "[carol] Carol studies astronomy.",
    ]),
    diff: diffWith(
      snapshotFromFacts(["[alice] Alice likes cats.", "[bob] Bob likes dogs."]),
      snapshotFromFacts([
        "[alice] Alice likes cats.",
        "[bob] Bob likes dogs.",
        "[carol] Carol studies astronomy.",
      ]),
      [
        {
          nodeLabel: "astronomy_preference",
          sourceDataset: "agent_carol",
          targetDataset: "agent_alice",
          existingStatement: "Alice prefers biology over astronomy.",
          incomingStatement:
            "Carol studies astronomy and finds it fascinating.",
          isContradiction: true,
          relation: "conflicts_with",
          confidence: 0.87,
        },
      ],
    ),
    decision: "pending_review",
    status: "pending",
    trustScoreBefore: 0.55,
    trustScoreAfter: 0.35,
    createdAt: Date.now() - 600000,
  },
  {
    id: "sync_4",
    subscriberDataset: "agent_eve",
    sourceDataset: "agent_bob",
    beforeSnapshot: emptySnapshot,
    afterSnapshot: snapshotFromFacts([
      "[bob] Bob likes dogs.",
      "[bob] Bob is a musician.",
    ]),
    diff: diffWith(
      emptySnapshot,
      snapshotFromFacts(["[bob] Bob likes dogs.", "[bob] Bob is a musician."]),
    ),
    decision: "pending_review",
    status: "pending",
    trustScoreBefore: 0.6,
    trustScoreAfter: 0.4,
    createdAt: Date.now() - 300000,
  },
];

export function getSyncRunsForAgent(agentId: string): SyncRun[] {
  const ds = `agent_${agentId}`;
  return mockSyncRuns.filter(
    (r) => r.subscriberDataset === ds || r.sourceDataset === ds,
  );
}
