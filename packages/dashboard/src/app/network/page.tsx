import { mockAgents, mockSubscriptions, mockTrust } from "@/mock/mockAgents";
import NetworkGraph from "@/components/NetworkGraph";

export default function NetworkPage() {
  const minTrust = Math.min(...mockTrust.map((t) => t.score));
  const maxTrust = Math.max(...mockTrust.map((t) => t.score));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Network View</h1>
      <p className="text-sm text-muted-foreground">
        Force-directed graph of agents and subscriptions. Node size = fact
        count, edge thickness = trust score. Click a node to view agent details.
        Hover for connections.
      </p>

      <div className="flex gap-4 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-[#6366f1]" />{" "}
          Agent
        </span>
        <span>
          Trust range: {minTrust.toFixed(2)} – {maxTrust.toFixed(2)}
        </span>
        <span>
          {mockAgents.length} agents,{" "}
          {mockSubscriptions.filter((s) => s.active).length} active
          subscriptions
        </span>
      </div>

      <NetworkGraph agents={mockAgents} subscriptions={mockSubscriptions} />
    </div>
  );
}
