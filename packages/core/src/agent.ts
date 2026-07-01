import { CogneeClient } from "./cogneeClient";
import type {
  AgentId,
  AgentRef,
  AgentStatus,
  Provenance,
  ImprovedMemoryResult,
  ResolutionStrategy,
} from "./types";
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
import { tagWithProvenance } from "./sync-protocol/provenance";
import { takeSnapshot } from "./snapshot";
import { runDiff, type RunDiffOptions } from "./diff";
import { resolveContradictions } from "./contradictionResolver";

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
    opts?: CogneeRememberOptions & { provenance?: Provenance },
  ): Promise<CogneeRememberResult> {
    const prov = opts?.provenance;
    if (prov && data && !Array.isArray(data) && data.type === "text") {
      data = { type: "text", text: tagWithProvenance(data.text, prov) };
    }
    if (prov && data && Array.isArray(data)) {
      data = data.map((d) =>
        d.type === "text"
          ? { type: "text" as const, text: tagWithProvenance(d.text, prov) }
          : d,
      );
    }
    const { provenance: _p, ...restOpts } = (opts ??
      {}) as CogneeRememberOptions & { provenance?: Provenance };
    return this.client.remember(data, this.datasetName, restOpts);
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
    opts?: Omit<CogneeImproveOptions, "datasetName"> & {
      diffOptions?: RunDiffOptions;
      autoResolve?: boolean;
      resolutionStrategy?: ResolutionStrategy;
      resolutionConfidenceThreshold?: number;
    },
  ): Promise<ImprovedMemoryResult> {
    const {
      diffOptions,
      autoResolve,
      resolutionStrategy,
      resolutionConfidenceThreshold,
      ...improveOpts
    } = opts ?? {};

    const before = await takeSnapshot(this.client, this.datasetName);
    const improveResult = await this.client.improve({
      ...improveOpts,
      datasetName: this.datasetName,
    });
    const after = await takeSnapshot(this.client, this.datasetName);

    const diff = await runDiff(
      before,
      after,
      this.client,
      this.datasetName,
      diffOptions,
    );

    const resolved =
      autoResolve && diff.contradictions.length > 0
        ? resolveContradictions(diff.contradictions, {
            strategy: resolutionStrategy,
            confidenceThreshold: resolutionConfidenceThreshold,
          })
        : [];

    return {
      improveResult,
      diff,
      resolvedContradictions: resolved,
    };
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
