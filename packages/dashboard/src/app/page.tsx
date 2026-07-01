import { mockAgents, mockSubscriptions } from "@/mock/mockAgents";
import { mockSyncRuns } from "@/mock/mockSyncRuns";

export default function Home() {
  const pendingCount = mockSyncRuns.filter(
    (r) => r.status === "pending" && r.decision === "pending_review",
  ).length;
  const acceptedCount = mockSyncRuns.filter(
    (r) => r.status === "accepted",
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Agents" value={mockAgents.length} />
        <StatCard
          label="Active Subscriptions"
          value={mockSubscriptions.filter((s) => s.active).length}
        />
        <StatCard label="Pending Review" value={pendingCount} highlight />
        <StatCard label="Accepted Syncs" value={acceptedCount} />
        <StatCard label="Total Sync Runs" value={mockSyncRuns.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickLink
          href="/network"
          title="Network View"
          desc="Force-directed graph of agents and subscriptions"
        />
        <QuickLink
          href="/review"
          title="Review Queue"
          desc={`${pendingCount} sync run(s) awaiting decision`}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border ${highlight ? "border-amber-400 bg-amber-50" : "border-border"} p-4`}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border border-border p-4 hover:border-primary transition-colors"
    >
      <div className="font-semibold text-primary">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
    </a>
  );
}
