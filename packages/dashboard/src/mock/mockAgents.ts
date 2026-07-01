import type {
  AgentId,
  AgentRecord,
  Subscription,
  TrustRecord,
} from "@/lib/types";

export const mockAgents: AgentRecord[] = [
  {
    agentId: "alice",
    datasetName: "agent_alice",
    facts: ["Alice likes cats.", "Alice lives in Paris."],
  },
  {
    agentId: "bob",
    datasetName: "agent_bob",
    facts: ["Bob likes dogs.", "Bob is a musician."],
  },
  {
    agentId: "carol",
    datasetName: "agent_carol",
    facts: ["Carol studies astronomy.", "Carol has a telescope."],
  },
  {
    agentId: "dave",
    datasetName: "agent_dave",
    facts: ["Dave runs a bakery.", "Dave makes sourdough."],
  },
  {
    agentId: "eve",
    datasetName: "agent_eve",
    facts: ["Eve is a software engineer.", "Eve contributes to open source."],
  },
];

export const mockSubscriptions: Subscription[] = [
  {
    subscriberId: "alice",
    subscriberDataset: "agent_alice",
    sourceAgentId: "bob",
    sourceDataset: "agent_bob",
    active: true,
  },
  {
    subscriberId: "alice",
    subscriberDataset: "agent_alice",
    sourceAgentId: "carol",
    sourceDataset: "agent_carol",
    active: true,
  },
  {
    subscriberId: "bob",
    subscriberDataset: "agent_bob",
    sourceAgentId: "alice",
    sourceDataset: "agent_alice",
    active: true,
  },
  {
    subscriberId: "carol",
    subscriberDataset: "agent_carol",
    sourceAgentId: "dave",
    sourceDataset: "agent_dave",
    active: true,
  },
  {
    subscriberId: "carol",
    subscriberDataset: "agent_carol",
    sourceAgentId: "eve",
    sourceDataset: "agent_eve",
    active: true,
  },
  {
    subscriberId: "dave",
    subscriberDataset: "agent_dave",
    sourceAgentId: "alice",
    sourceDataset: "agent_alice",
    active: true,
  },
  {
    subscriberId: "eve",
    subscriberDataset: "agent_eve",
    sourceAgentId: "alice",
    sourceDataset: "agent_alice",
    active: true,
  },
  {
    subscriberId: "eve",
    subscriberDataset: "agent_eve",
    sourceAgentId: "bob",
    sourceDataset: "agent_bob",
    active: true,
  },
];

export const mockTrust: TrustRecord[] = [
  {
    sourceAgentId: "alice",
    targetAgentId: "bob",
    score: 0.72,
    lastUpdated: Date.now() - 3600000,
  },
  {
    sourceAgentId: "alice",
    targetAgentId: "carol",
    score: 0.55,
    lastUpdated: Date.now() - 7200000,
  },
  {
    sourceAgentId: "bob",
    targetAgentId: "alice",
    score: 0.65,
    lastUpdated: Date.now() - 1800000,
  },
  {
    sourceAgentId: "carol",
    targetAgentId: "dave",
    score: 0.48,
    lastUpdated: Date.now() - 5400000,
  },
  {
    sourceAgentId: "carol",
    targetAgentId: "eve",
    score: 0.81,
    lastUpdated: Date.now() - 900000,
  },
  {
    sourceAgentId: "dave",
    targetAgentId: "alice",
    score: 0.33,
    lastUpdated: Date.now() - 10800000,
  },
  {
    sourceAgentId: "eve",
    targetAgentId: "alice",
    score: 0.92,
    lastUpdated: Date.now() - 600000,
  },
  {
    sourceAgentId: "eve",
    targetAgentId: "bob",
    score: 0.6,
    lastUpdated: Date.now() - 3000000,
  },
];

export function getAgent(id: string): AgentRecord | undefined {
  return mockAgents.find((a) => a.agentId === id);
}

export function getSubscriptionsForAgent(agentId: string): Subscription[] {
  return mockSubscriptions.filter(
    (s) => s.subscriberId === agentId || s.sourceAgentId === agentId,
  );
}

export function getTrustForPair(sub: AgentId, src: AgentId): number {
  const t = mockTrust.find(
    (r) => r.sourceAgentId === sub && r.targetAgentId === src,
  );
  return t?.score ?? 0.5;
}
