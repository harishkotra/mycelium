import type { AgentId, GraphSnapshot } from "../types";
import type { CogneeClient } from "../cogneeClient";
import {
  ProvenanceRegistry,
  tagWithProvenance,
  extractProvenance,
} from "./provenance";
import { TrustStore } from "../trust/trustStore";

export async function revokeSource(
  client: CogneeClient,
  sourceAgentId: AgentId,
  subscriberDataset: string,
  subscriberAgentId: AgentId,
  registry: ProvenanceRegistry,
  trustStore: TrustStore,
  snapshotBefore?: GraphSnapshot | null,
): Promise<void> {
  const records = registry.findBySource(sourceAgentId);

  for (const { cleanText } of records) {
    const searchRes = await client.search(cleanText, {
      datasets: [subscriberDataset],
      searchType: "GRAPH_COMPLETION",
      topK: 1,
    });
    const resultText =
      searchRes.result?.kind === "Text" ? searchRes.result.data : null;
    if (resultText && resultText.includes(cleanText)) {
      const { provenance } = extractProvenance(resultText);
      if (provenance && provenance.sourceAgentId === sourceAgentId) {
        const findResult = await client.search(provenance.factId, {
          datasets: [subscriberDataset],
          searchType: "NATURAL_LANGUAGE",
          topK: 5,
        });
        if (findResult.result?.kind === "Text") {
          // Note: Cognee's search API returns graph context (nodes/edges), not
          // original itemIds, so individual fact deletion is not implemented yet.
          // The registry is cleaned up below and trust is adjusted, but the
          // actual graph nodes remain in the dataset.
        }
      }
    }
  }

  registry.deleteBySource(sourceAgentId);

  if (snapshotBefore) {
    for (const node of snapshotBefore.nodes) {
      const text = tagWithProvenance(
        `${node.label} has properties ${JSON.stringify(node.properties)}`,
        { sourceAgentId, factId: `restore_${node.id}`, timestamp: Date.now() },
      );
      await client.remember({ type: "text", text }, subscriberDataset);
    }
    await client.waitForIndexingComplete(subscriberDataset);
  }

  trustStore.adjust(subscriberAgentId, sourceAgentId, "reject");
}
