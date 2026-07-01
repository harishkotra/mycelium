"use client";

import type { SyncRun } from "@/lib/types";

interface Props {
  runs: SyncRun[];
}

export default function SyncHistoryList({ runs }: Props) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No sync history.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-center justify-between border border-border rounded p-3 text-sm"
        >
          <div className="space-y-0.5">
            <div className="font-medium">
              {run.sourceDataset} → {run.subscriberDataset}
            </div>
            <div className="text-xs text-muted-foreground">
              {run.id} &middot; {new Date(run.createdAt).toLocaleString()}{" "}
              &middot;{" "}
              <span className="capitalize">
                {run.decision.replace("_", " ")}
              </span>
              &middot; +{run.diff.summary.nodesAdded} nodes
            </div>
          </div>
          <span
            className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${run.status === "accepted" ? "bg-green-100 text-green-700" : run.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
          >
            {run.status}
          </span>
        </div>
      ))}
    </div>
  );
}
