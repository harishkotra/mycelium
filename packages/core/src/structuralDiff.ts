import type {
  GraphSnapshot,
  GraphNodeSnapshot,
  GraphEdgeSnapshot,
  StructuralDiff,
} from "./types";

function nodeKey(n: GraphNodeSnapshot): string {
  return n.id;
}

function edgeKey(e: GraphEdgeSnapshot): string {
  return e.id;
}

function nodesEqual(a: GraphNodeSnapshot, b: GraphNodeSnapshot): boolean {
  return (
    a.label === b.label &&
    a.type === b.type &&
    JSON.stringify(a.properties) === JSON.stringify(b.properties)
  );
}

function edgesEqual(a: GraphEdgeSnapshot, b: GraphEdgeSnapshot): boolean {
  return (
    a.sourceNodeId === b.sourceNodeId &&
    a.targetNodeId === b.targetNodeId &&
    a.relationship === b.relationship &&
    JSON.stringify(a.properties) === JSON.stringify(b.properties)
  );
}

export function diffSnapshots(
  before: GraphSnapshot,
  after: GraphSnapshot,
): StructuralDiff {
  const beforeNodeMap = new Map<string, GraphNodeSnapshot>();
  for (const n of before.nodes) beforeNodeMap.set(nodeKey(n), n);

  const afterNodeMap = new Map<string, GraphNodeSnapshot>();
  for (const n of after.nodes) afterNodeMap.set(nodeKey(n), n);

  const beforeEdgeMap = new Map<string, GraphEdgeSnapshot>();
  for (const e of before.edges) beforeEdgeMap.set(edgeKey(e), e);

  const afterEdgeMap = new Map<string, GraphEdgeSnapshot>();
  for (const e of after.edges) afterEdgeMap.set(edgeKey(e), e);

  const addedNodes: GraphNodeSnapshot[] = [];
  const removedNodes: GraphNodeSnapshot[] = [];
  const modifiedNodes: GraphNodeSnapshot[] = [];

  for (const [id, node] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) {
      addedNodes.push(node);
    } else if (!nodesEqual(beforeNodeMap.get(id)!, node)) {
      modifiedNodes.push(node);
    }
  }

  for (const [id, node] of beforeNodeMap) {
    if (!afterNodeMap.has(id)) {
      removedNodes.push(node);
    }
  }

  const addedEdges: GraphEdgeSnapshot[] = [];
  const removedEdges: GraphEdgeSnapshot[] = [];
  const modifiedEdges: GraphEdgeSnapshot[] = [];

  for (const [id, edge] of afterEdgeMap) {
    if (!beforeEdgeMap.has(id)) {
      addedEdges.push(edge);
    } else if (!edgesEqual(beforeEdgeMap.get(id)!, edge)) {
      modifiedEdges.push(edge);
    }
  }

  for (const [id, edge] of beforeEdgeMap) {
    if (!afterEdgeMap.has(id)) {
      removedEdges.push(edge);
    }
  }

  return {
    nodes: {
      added: addedNodes,
      removed: removedNodes,
      modified: modifiedNodes,
    },
    edges: {
      added: addedEdges,
      removed: removedEdges,
      modified: modifiedEdges,
    },
  };
}
