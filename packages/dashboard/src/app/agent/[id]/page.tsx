"use client";

import { use, useState } from "react";
import { getSubscriptionsForAgent, getAgent } from "@/mock/mockAgents";
import { getSyncRunsForAgent } from "@/mock/mockSyncRuns";
import TrustSparkline from "@/components/TrustSparkline";
import SyncHistoryList from "@/components/SyncHistoryList";

function generateTrustHistory(agentId: string): number[] {
  const base =
    agentId === "alice"
      ? 0.65
      : agentId === "bob"
        ? 0.5
        : agentId === "carol"
          ? 0.55
          : agentId === "dave"
            ? 0.4
            : 0.7;
  const history: number[] = [0.5];
  for (let i = 1; i < 10; i++) {
    const delta = Math.random() * 0.12 - 0.02;
    history.push(Math.max(0, Math.min(1, history[i - 1] + delta)));
  }
  return history;
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [showRevokePreview, setShowRevokePreview] = useState(false);

  const agent = getAgent(id);
  if (!agent) return <p className="text-muted-foreground">Agent not found.</p>;

  const subscriptions = getSubscriptionsForAgent(id);
  const syncRuns = getSyncRunsForAgent(id);
  const trustHistory = generateTrustHistory(id);
  const outgoing = subscriptions.filter((s) => s.subscriberId === id);
  const incoming = subscriptions.filter((s) => s.sourceAgentId === id);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
          {agent.agentId[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{agent.agentId}</h1>
          <p className="text-sm text-muted-foreground">
            {agent.datasetName} &middot; {agent.facts.length} facts
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="font-semibold text-sm">Stored Facts</h2>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5">
          {agent.facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-1">
        <h2 className="font-semibold text-sm">Trust History</h2>
        <div className="border border-border rounded-lg p-3">
          <TrustSparkline data={trustHistory} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0.00</span>
            <span>
              Current: {trustHistory[trustHistory.length - 1].toFixed(2)}
            </span>
            <span>1.00</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-sm">Subscribes To</h2>
          {outgoing.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {outgoing.map((s) => (
                <li
                  key={s.sourceAgentId}
                  className="text-sm flex items-center gap-2"
                >
                  <a
                    href={`/agent/${s.sourceAgentId}`}
                    className="text-primary hover:underline"
                  >
                    {s.sourceAgentId}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    ({s.active ? "active" : "inactive"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <h2 className="font-semibold text-sm">Subscribed By</h2>
          {incoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {incoming.map((s) => (
                <li
                  key={s.subscriberId}
                  className="text-sm flex items-center gap-2"
                >
                  <a
                    href={`/agent/${s.subscriberId}`}
                    className="text-primary hover:underline"
                  >
                    {s.subscriberId}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    ({s.active ? "active" : "inactive"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-sm">Sync History</h2>
        <SyncHistoryList runs={syncRuns} />
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-sm text-red-700">Danger Zone</h2>
        <p className="text-xs text-muted-foreground">
          Revoke all incoming subscriptions and remove facts synced from this
          agent.
        </p>
        <button
          onClick={() => setShowRevokePreview(!showRevokePreview)}
          className="text-xs px-3 py-1.5 rounded border border-red-400 text-red-700 hover:bg-red-50 transition-colors"
        >
          {showRevokePreview ? "Hide Preview" : "Revoke & Forget — Dry Run"}
        </button>
        {showRevokePreview && (
          <div className="border border-red-200 bg-red-50 rounded p-3 text-xs space-y-1">
            <div className="font-medium text-red-800">Dry-Run Preview</div>
            <div>Subscriptions to revoke: {incoming.length}</div>
            <div>
              Facts to forget: {agent.facts.length} from {agent.datasetName}
            </div>
            <div>Sync runs affected: {syncRuns.length}</div>
            <div className="text-muted-foreground italic">
              This action cannot be undone. Click again to confirm.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
