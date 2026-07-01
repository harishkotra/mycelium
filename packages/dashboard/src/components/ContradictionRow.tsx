import type { ContradictionResult } from "@/lib/types";

interface Props {
  contradiction: ContradictionResult;
}

export default function ContradictionRow({ contradiction: c }: Props) {
  return (
    <div className="border border-red-200 bg-red-50 rounded p-3 text-xs space-y-1">
      <div className="font-medium text-red-800">
        {c.nodeLabel} &middot; confidence {c.confidence.toFixed(2)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-white rounded p-2 border border-border">
          <div className="text-muted-foreground mb-1">
            Existing ({c.targetDataset})
          </div>
          <div>{c.existingStatement}</div>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <div className="text-muted-foreground mb-1">
            Incoming ({c.sourceDataset})
          </div>
          <div>{c.incomingStatement}</div>
        </div>
      </div>
      {c.relation && (
        <div className="text-muted-foreground mt-1">
          Relation: <span className="italic">{c.relation}</span>
        </div>
      )}
    </div>
  );
}
