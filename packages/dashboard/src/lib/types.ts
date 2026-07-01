export type AgentId = string;
export type SyncDecision = "auto_merged" | "pending_review";

export interface GraphNodeSnapshot {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdgeSnapshot {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: string;
  properties: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphNodeSnapshot[];
  edges: GraphEdgeSnapshot[];
}

export interface StructuralDiff {
  nodes: {
    added: GraphNodeSnapshot[];
    removed: GraphNodeSnapshot[];
    modified: GraphNodeSnapshot[];
  };
  edges: {
    added: GraphEdgeSnapshot[];
    removed: GraphEdgeSnapshot[];
    modified: GraphEdgeSnapshot[];
  };
}

export interface DriftResult {
  nodeId: string;
  label: string;
  beforeEmbedding: number[];
  afterEmbedding: number[];
  cosineDistance: number;
}

export interface ContradictionResult {
  nodeLabel: string;
  sourceDataset: string;
  targetDataset: string;
  existingStatement: string;
  incomingStatement: string;
  isContradiction: boolean;
  relation: string;
  confidence: number;
}

export interface MemoryDiffResult {
  before: GraphSnapshot;
  after: GraphSnapshot;
  structural: StructuralDiff;
  drifts: DriftResult[];
  contradictions: ContradictionResult[];
  summary: {
    totalNodesBefore: number;
    totalNodesAfter: number;
    totalEdgesBefore: number;
    totalEdgesAfter: number;
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
    driftsDetected: number;
    contradictionsDetected: number;
  };
}

export interface TrustRecord {
  sourceAgentId: AgentId;
  targetAgentId: AgentId;
  score: number;
  lastUpdated: number;
}

export type TrustAction = "accept" | "reject";

export interface Provenance {
  sourceAgentId: AgentId;
  factId: string;
  timestamp: number;
}

export interface SyncRun {
  id: string;
  subscriberDataset: string;
  sourceDataset: string;
  beforeSnapshot: GraphSnapshot;
  afterSnapshot: GraphSnapshot;
  diff: MemoryDiffResult;
  decision: SyncDecision;
  status: "pending" | "accepted" | "rejected";
  trustScoreBefore: number;
  trustScoreAfter: number;
  createdAt: number;
}

export interface AgentRecord {
  agentId: string;
  datasetName: string;
  facts: string[];
}

export interface Subscription {
  subscriberId: AgentId;
  subscriberDataset: string;
  sourceAgentId: AgentId;
  sourceDataset: string;
  active: boolean;
}
