export type AgentId = string;

export interface AgentRef {
  agentId: AgentId;
  datasetName: string;
}

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

export interface SyncEvent {
  eventType:
    "graph_change" | "agent_join" | "agent_leave" | "sync_request" | "sync_ack";
  sourceAgentId: AgentId;
  datasetName: string;
  timestamp: number;
  payload: unknown;
}

export interface AgentStatus {
  agentId: AgentId;
  datasetName: string;
  lastSeen: number;
  graphHash: string;
  nodeCount: number;
  edgeCount: number;
}
