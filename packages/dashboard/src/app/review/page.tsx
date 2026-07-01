"use client";

import { mockSyncRuns } from "@/mock/mockSyncRuns";
import DiffCard from "@/components/DiffCard";
import { useState } from "react";

export default function ReviewPage() {
  const [runs, setRuns] = useState(mockSyncRuns);

  const pending = runs.filter((r) => r.status === "pending");
  const history = runs.filter((r) => r.status !== "pending");

  const handleAccept = (id: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "accepted" as const,
              trustScoreAfter: r.trustScoreAfter + 0.05,
            }
          : r,
      ),
    );
    console.log(`Accepted sync ${id}`);
  };

  const handleReject = (id: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "rejected" as const,
              trustScoreAfter: Math.max(0, r.trustScoreAfter - 0.2),
            }
          : r,
      ),
    );
    console.log(`Rejected sync ${id}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Review Queue</h1>

      {pending.length === 0 ? (
        <p className="text-muted-foreground">No pending sync runs.</p>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Pending Review ({pending.length})
          </h2>
          {pending.map((run) => (
            <DiffCard
              key={run.id}
              run={run}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">History</h2>
          {history.map((run) => (
            <DiffCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
