import type { AgentId } from "../types";
import { SyncEngine } from "./syncEngine";
import { TrustStore } from "../trust/trustStore";

export async function acceptSync(
  runId: string,
  engine: SyncEngine,
  trustStore: TrustStore,
  subscriberAgentId: AgentId,
): Promise<void> {
  const run = engine.getRun(runId);
  if (!run) throw new Error(`Sync run ${runId} not found`);
  if (run.status !== "pending")
    throw new Error(`Sync run ${runId} already ${run.status}`);

  run.status = "accepted";

  trustStore.adjust(subscriberAgentId, run.sourceDataset, "accept");
}

export async function rejectSync(
  runId: string,
  engine: SyncEngine,
  trustStore: TrustStore,
  subscriberAgentId: AgentId,
): Promise<void> {
  const run = engine.getRun(runId);
  if (!run) throw new Error(`Sync run ${runId} not found`);
  if (run.status !== "pending")
    throw new Error(`Sync run ${runId} already ${run.status}`);

  run.status = "rejected";

  trustStore.adjust(subscriberAgentId, run.sourceDataset, "reject");
}
