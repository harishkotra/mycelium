import type {
  GraphSnapshot,
  GraphNodeSnapshot,
  GraphEdgeSnapshot,
} from "./types";
import type { CogneeClient } from "./cogneeClient";

/**
 * Build a GraphSnapshot from a dataset by querying Cognee's graph.
 * Falls back to a hand-crafted fixture when called without a client.
 */
export async function takeSnapshot(
  client: CogneeClient | null,
  datasetName: string,
): Promise<GraphSnapshot> {
  if (!client) return fixtureSnapshot(datasetName);

  const response = await client.search("", {
    searchType: "GRAPH_COMPLETION",
    datasets: [datasetName],
    onlyContext: true,
    topK: 500,
  });

  // Graph entries may be keyed by "default" or the dataset name
  const entries = response.graphs ? Object.values(response.graphs) : [];
  const graph =
    entries.find((g) => g.nodes.length > 0 || g.edges.length > 0) ?? entries[0];
  if (!graph) return { nodes: [], edges: [] };

  const nodes: GraphNodeSnapshot[] = (graph.nodes ?? []).map((n) => ({
    id: n.id,
    label: n.label,
    type: "entity",
    properties: {},
  }));

  const edges: GraphEdgeSnapshot[] = (graph.edges ?? []).map((e, i) => ({
    id: `${e.source}→${e.target}`,
    sourceNodeId: e.source,
    targetNodeId: e.target,
    relationship: e.relationship,
    properties: { weight: e.weight },
  }));

  return { nodes, edges };
}

/** Hand-crafted fixture so the rest of the engine is testable without Cognee. */
export function fixtureSnapshot(name: string): GraphSnapshot {
  const fixtures: Record<string, GraphSnapshot> = {
    wedding_a: {
      nodes: [
        {
          id: "n1",
          label: "Doug",
          type: "person",
          properties: { role: "groom" },
        },
        {
          id: "n2",
          label: "Sarah",
          type: "person",
          properties: { role: "bride" },
        },
        { id: "n3", label: "St. John's Church", type: "place", properties: {} },
      ],
      edges: [
        {
          id: "e1",
          sourceNodeId: "n1",
          targetNodeId: "n2",
          relationship: "marries",
          properties: {},
        },
        {
          id: "e2",
          sourceNodeId: "n1",
          targetNodeId: "n3",
          relationship: "wedding_at",
          properties: {},
        },
      ],
    },
    wedding_b: {
      nodes: [
        {
          id: "n1",
          label: "Doug",
          type: "person",
          properties: { role: "best man" },
        },
        {
          id: "n2",
          label: "Sarah",
          type: "person",
          properties: { role: "bride" },
        },
        { id: "n3", label: "St. John's Church", type: "place", properties: {} },
        {
          id: "n4",
          label: "Mike",
          type: "person",
          properties: { role: "groom" },
        },
      ],
      edges: [
        {
          id: "e1",
          sourceNodeId: "n1",
          targetNodeId: "n2",
          relationship: "best_man_for",
          properties: {},
        },
        {
          id: "e3",
          sourceNodeId: "n4",
          targetNodeId: "n2",
          relationship: "marries",
          properties: {},
        },
      ],
    },
    no_conflict: {
      nodes: [
        {
          id: "n1",
          label: "Doug",
          type: "person",
          properties: { role: "groom" },
        },
        {
          id: "n2",
          label: "Sarah",
          type: "person",
          properties: { role: "bride" },
        },
      ],
      edges: [
        {
          id: "e1",
          sourceNodeId: "n1",
          targetNodeId: "n2",
          relationship: "marries",
          properties: {},
        },
      ],
    },
    no_conflict_extra: {
      nodes: [
        {
          id: "n1",
          label: "Doug",
          type: "person",
          properties: { role: "groom" },
        },
        {
          id: "n2",
          label: "Sarah",
          type: "person",
          properties: { role: "bride" },
        },
        {
          id: "n3",
          label: "Flowers",
          type: "decor",
          properties: { type: "roses" },
        },
      ],
      edges: [
        {
          id: "e1",
          sourceNodeId: "n1",
          targetNodeId: "n2",
          relationship: "marries",
          properties: {},
        },
      ],
    },
  };
  return fixtures[name] ?? { nodes: [], edges: [] };
}
