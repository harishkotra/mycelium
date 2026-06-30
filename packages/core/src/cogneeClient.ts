import {
  init,
  Cognee,
  type CogneeDataInput,
  type SearchTypeString,
  type CogneeSearchOptions,
  type CogneeSearchResponse,
  type CogneeRecallOptions,
  type CogneeRecallResult,
  type CogneeRememberOptions,
  type CogneeRememberResult,
  type CogneeImproveOptions,
  type CogneeImproveResult,
  type CogneeForgetTarget,
  type CogneeForgetResult,
  type CogneeDataset,
  type CogneeCognifyOptions,
} from "@cognee/cognee-ts";

export interface CogneeClientConfig {
  llmModel?: string;
  llmApiKey?: string;
  llmEndpoint?: string;
  embeddingProvider?: string;
  vectorDbProvider?: string;
  graphDbProvider?: string;
}

export class CogneeClient {
  private cog: Cognee;

  constructor(config?: CogneeClientConfig) {
    this.cog = new Cognee({
      llmModel: config?.llmModel,
      llmApiKey: config?.llmApiKey,
      llmEndpoint: config?.llmEndpoint,
      embeddingProvider: config?.embeddingProvider ?? "mock",
      vectorDbProvider: config?.vectorDbProvider ?? "brute-force",
      graphDbProvider: config?.graphDbProvider ?? "kuzu",
    });
  }

  static async create(config?: CogneeClientConfig): Promise<CogneeClient> {
    const client = new CogneeClient(config);
    await client.cog.warm();
    return client;
  }

  async remember(
    data: CogneeDataInput | CogneeDataInput[],
    datasetName: string,
    opts?: CogneeRememberOptions,
  ): Promise<CogneeRememberResult> {
    return this.cog.remember(data, datasetName, opts);
  }

  async recall(
    query: string,
    opts?: CogneeRecallOptions,
  ): Promise<CogneeRecallResult> {
    return this.cog.recall(query, opts);
  }

  async search(
    query: string,
    opts?: CogneeSearchOptions,
  ): Promise<CogneeSearchResponse> {
    return this.cog.search(query, opts);
  }

  async improve(opts: CogneeImproveOptions): Promise<CogneeImproveResult> {
    return this.cog.improve(opts);
  }

  async forget(
    target: CogneeForgetTarget,
    opts?: { tenant?: string },
  ): Promise<CogneeForgetResult> {
    return this.cog.forget(target, opts);
  }

  async datasets(): Promise<CogneeDataset[]> {
    return this.cog.datasets.list();
  }

  async waitForIndexingComplete(
    datasetName: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    },
  ): Promise<void> {
    const pollInterval = options?.pollIntervalMs ?? 500;
    const timeout = options?.timeoutMs ?? 30_000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const datasets = await this.cog.datasets.list();
      const match = datasets.find((d) => d.name === datasetName);
      if (!match) {
        throw new Error(`Dataset "${datasetName}" not found`);
      }
      const statusMap = await this.cog.datasets.status([match.id]);
      const status = statusMap[match.id];
      if (status !== "running") return;
      await new Promise((r) => setTimeout(r, pollInterval));
    }
    throw new Error(
      `Timed out waiting for dataset "${datasetName}" to finish indexing`,
    );
  }
}

export function initRuntime(): void {
  init();
}
