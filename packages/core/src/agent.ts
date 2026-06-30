import { CogneeClient } from "./cogneeClient";
import type { AgentId, AgentRef, AgentStatus } from "./types";
import type {
  CogneeDataInput,
  CogneeSearchOptions,
  CogneeSearchResponse,
  CogneeRecallOptions,
  CogneeRecallResult,
  CogneeRememberOptions,
  CogneeRememberResult,
  CogneeImproveOptions,
  CogneeImproveResult,
  CogneeForgetTarget,
  CogneeForgetResult,
  CogneeDataset,
} from "@cognee/cognee-ts";

export class Agent {
  readonly agentId: AgentId;
  readonly datasetName: string;
  private client: CogneeClient;

  constructor(agentId: AgentId, datasetName: string, client: CogneeClient) {
    this.agentId = agentId;
    this.datasetName = datasetName;
    this.client = client;
  }

  get ref(): AgentRef {
    return { agentId: this.agentId, datasetName: this.datasetName };
  }

  async remember(
    data: CogneeDataInput | CogneeDataInput[],
    opts?: CogneeRememberOptions,
  ): Promise<CogneeRememberResult> {
    return this.client.remember(data, this.datasetName, opts);
  }

  async recall(
    query: string,
    opts?: Omit<CogneeRecallOptions, "datasets">,
  ): Promise<CogneeRecallResult> {
    return this.client.recall(query, { ...opts, datasets: [this.datasetName] });
  }

  async search(
    query: string,
    opts?: Omit<CogneeSearchOptions, "datasets">,
  ): Promise<CogneeSearchResponse> {
    return this.client.search(query, { ...opts, datasets: [this.datasetName] });
  }

  async improve(
    opts?: Omit<CogneeImproveOptions, "datasetName">,
  ): Promise<CogneeImproveResult> {
    return this.client.improve({ ...opts, datasetName: this.datasetName });
  }

  async forget(
    target: Omit<CogneeForgetTarget, "kind" | "dataset"> & {
      kind: "item" | "dataset" | "all";
    },
  ): Promise<CogneeForgetResult> {
    if (target.kind === "all") {
      return this.client.forget({ kind: "all" });
    }
    return this.client.forget({
      kind: target.kind,
      dataset: { name: this.datasetName },
    } as CogneeForgetTarget);
  }

  async status(): Promise<AgentStatus> {
    const datasets = await this.client.datasets();
    const ds = datasets.find((d) => d.name === this.datasetName);
    return {
      agentId: this.agentId,
      datasetName: this.datasetName,
      lastSeen: Date.now(),
      graphHash: ds?.id ?? "",
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  async waitForIndexingComplete(options?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<void> {
    return this.client.waitForIndexingComplete(this.datasetName, options);
  }
}
