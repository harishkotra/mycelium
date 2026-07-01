"use client";

import type { SyncRun } from "@/lib/types";
import ContradictionRow from "./ContradictionRow";

interface Props {
  run: SyncRun;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
}

function fmt(val: unknown): string {
  return JSON.stringify(val, null, 1);
}

export default function DiffCard({ run, onAccept, onReject }: Props) {
  const d = run.diff;
  const s = d.structural;
  const hasChanges =
    s.nodes.added.length > 0 ||
    s.nodes.removed.length > 0 ||
    s.nodes.modified.length > 0 ||
    s.edges.added.length > 0 ||
    s.edges.removed.length > 0;

  const statusColor: Record<string, string> = {
    pending: "border-amber-400",
    accepted: "border-green-400",
    rejected: "border-red-400",
  };

  return (
    <div
      className={`rounded-lg border ${statusColor[run.status] ?? "border-border"} p-4 space-y-3`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="font-semibold">
            {run.sourceDataset} → {run.subscriberDataset}
          </div>
          <div className="text-xs text-muted-foreground">
            {run.id} &middot; {new Date(run.createdAt).toLocaleString()}{" "}
            &middot;{" "}
            <span className="capitalize">{run.decision.replace("_", " ")}</span>
            &middot; Trust: {run.trustScoreBefore.toFixed(2)} →{" "}
            {run.trustScoreAfter.toFixed(2)}
          </div>
        </div>
        <span
          className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${run.status === "accepted" ? "bg-green-100 text-green-700" : run.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
        >
          {run.status}
        </span>
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          Nodes: {d.summary.totalNodesBefore} → {d.summary.totalNodesAfter}
        </span>
        <span>
          Added: {d.summary.nodesAdded} nodes / {d.summary.edgesAdded} edges
        </span>
        {d.summary.contradictionsDetected > 0 && (
          <span className="text-red-600 font-semibold">
            ⚠ {d.summary.contradictionsDetected} contradiction(s)
          </span>
        )}
      </div>

      {/* Structural changes */}
      {hasChanges && (
        <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
          {s.nodes.added.map((n, i) => (
            <div key={i} className="text-green-700">
              + node {n.label} {fmt(n.properties)}
            </div>
          ))}
          {s.nodes.removed.map((n, i) => (
            <div key={i} className="text-red-700">
              - node {n.label} {fmt(n.properties)}
            </div>
          ))}
          {s.edges.added.map((e, i) => (
            <div key={i} className="text-green-600">
              + edge {e.sourceNodeId} → {e.targetNodeId} [{e.relationship}]
            </div>
          ))}
          {s.edges.removed.map((e, i) => (
            <div key={i} className="text-red-600">
              - edge {e.sourceNodeId} → {e.targetNodeId} [{e.relationship}]
            </div>
          ))}
        </div>
      )}

      {/* Contradictions */}
      {d.contradictions.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-red-700">
            Contradictions ({d.contradictions.length})
          </div>
          {d.contradictions.map((c, i) => (
            <ContradictionRow key={i} contradiction={c} />
          ))}
        </div>
      )}

      {/* Drifts */}
      {d.drifts.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {d.drifts.length} drift(s) detected
        </div>
      )}

      {/* Actions */}
      {run.status === "pending" && onAccept && onReject && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAccept(run.id)}
            className="text-xs px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onReject(run.id)}
            className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
