import {
  init,
  Cognee,
  type CogneeDataInput,
  type SearchTypeString,
  type CogneeSearchOptions,
  type CogneeSearchResponse,
  type CogneeRecallOptions,
  type CogneeRecallResult,
  type CogneeAddOptions,
  type CogneeAddResult,
  type CogneeCognifyOptions,
  type CogneeCognifyResult,
  type CogneeRememberOptions,
  type CogneeRememberResult,
  type CogneeImproveOptions,
  type CogneeImproveResult,
  type CogneeForgetTarget,
  type CogneeForgetResult,
  type CogneeDataset,
} from "@cognee/cognee-ts";
import {
  type LlmProvider,
  type LlmConfigInput,
  resolveLlmConfig,
  isLocalProvider,
} from "./llm";

export interface CogneeClientConfig {
  /** Shorthand — picks a built-in preset. Overrides endpoint / model defaults. */
  llmProvider?: LlmProvider;
  /** Override model name. */
  llmModel?: string;
  /** Override API key. */
  llmApiKey?: string;
  /** Override endpoint URL. */
  llmEndpoint?: string;
  /** Pass the full LLM config object directly (overrides individual fields). */
  llmConfig?: LlmConfigInput;
  embeddingProvider?: string;
  vectorDbProvider?: string;
  graphDbProvider?: string;
  /** Cognee Cloud API key (sets COGNEE_API_KEY). */
  cogneeApiKey?: string;
  /** Cognee Cloud API URL (sets COGNEE_API_URL). */
  cogneeApiUrl?: string;
}

export class CogneeClient {
  readonly llmConfig: ReturnType<typeof resolveLlmConfig>;
  private cog: Cognee;

  constructor(config?: CogneeClientConfig) {
    if (config?.cogneeApiKey) process.env.COGNEE_API_KEY = config.cogneeApiKey;
    if (config?.cogneeApiUrl) process.env.COGNEE_API_URL = config.cogneeApiUrl;

    this.llmConfig = resolveLlmConfig(
      config?.llmConfig ?? {
        provider: config?.llmProvider,
        model: config?.llmModel,
        apiKey: config?.llmApiKey,
        endpoint: config?.llmEndpoint,
      },
    );

    const cogneeKey =
      config?.llmApiKey ?? config?.llmConfig?.apiKey ?? this.llmConfig.apiKey;

    // Cognee's Rust SDK reads LLM_PROVIDER and LLM_API_KEY from env
    // and only supports "openai" / "mock" provider names.  We use our
    // own config resolution but must set the env var so Cognee's warm()
    // doesn't fail with "llm_api_key must be configured".
    delete process.env.LLM_PROVIDER;
    if (cogneeKey) process.env.LLM_API_KEY = cogneeKey;

    this.cog = new Cognee({
      llmModel: this.llmConfig.model,
      llmApiKey: cogneeKey || undefined,
      llmEndpoint: this.llmConfig.endpoint,
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

  async add(
    data: CogneeDataInput | CogneeDataInput[],
    datasetName: string,
    opts?: CogneeAddOptions,
  ): Promise<CogneeAddResult> {
    return this.cog.add(data, datasetName, opts);
  }

  async cognify(
    datasetName: string,
    opts?: CogneeCognifyOptions,
  ): Promise<CogneeCognifyResult> {
    return this.cog.cognify(datasetName, opts);
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
