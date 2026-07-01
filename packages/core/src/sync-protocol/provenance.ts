import type { AgentId, Provenance } from "../types";

const PROVENANCE_PREFIX = "__provenance__:";

export function tagWithProvenance(text: string, prov: Provenance): string {
  return `${PROVENANCE_PREFIX}${JSON.stringify(prov)}\n${text}`;
}

export function extractProvenance(text: string): {
  provenance: Provenance | null;
  cleanText: string;
} {
  if (!text.startsWith(PROVENANCE_PREFIX)) {
    return { provenance: null, cleanText: text };
  }
  const newlineIdx = text.indexOf("\n", PROVENANCE_PREFIX.length);
  if (newlineIdx === -1) {
    return { provenance: null, cleanText: text };
  }
  const raw = text.slice(PROVENANCE_PREFIX.length, newlineIdx);
  try {
    const provenance = JSON.parse(raw) as Provenance;
    return { provenance, cleanText: text.slice(newlineIdx + 1) };
  } catch {
    return { provenance: null, cleanText: text };
  }
}

export function extractAllProvenance(
  texts: string[],
): Map<string, Provenance | null> {
  const map = new Map<string, Provenance | null>();
  for (const t of texts) {
    const { provenance, cleanText } = extractProvenance(t);
    map.set(cleanText, provenance);
  }
  return map;
}

export class ProvenanceRegistry {
  private store = new Map<string, Provenance>(); // cleanText hash -> provenance

  register(cleanText: string, prov: Provenance): void {
    this.store.set(cleanText, prov);
  }

  get(cleanText: string): Provenance | undefined {
    return this.store.get(cleanText);
  }

  findBySource(
    sourceAgentId: AgentId,
  ): { cleanText: string; provenance: Provenance }[] {
    const results: { cleanText: string; provenance: Provenance }[] = [];
    for (const [text, prov] of this.store) {
      if (prov.sourceAgentId === sourceAgentId) {
        results.push({ cleanText: text, provenance: prov });
      }
    }
    return results;
  }

  deleteBySource(sourceAgentId: AgentId): void {
    for (const [text, prov] of this.store) {
      if (prov.sourceAgentId === sourceAgentId) {
        this.store.delete(text);
      }
    }
  }

  all(): [string, Provenance][] {
    return Array.from(this.store.entries());
  }

  reset(): void {
    this.store.clear();
  }
}
