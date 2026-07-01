import type { AgentId, TrustRecord, TrustAction } from "../types";

export const TRUST_ACCEPT_INCR = 0.05;
export const TRUST_REJECT_DECR = 0.2;

export function adjustTrust(current: number, action: TrustAction): number {
  const delta = action === "accept" ? TRUST_ACCEPT_INCR : -TRUST_REJECT_DECR;
  return Math.max(0, Math.min(1, current + delta));
}

export class TrustStore {
  private records = new Map<string, TrustRecord>();

  private key(source: AgentId, target: AgentId): string {
    return `${source}::${target}`;
  }

  get(source: AgentId, target: AgentId): TrustRecord {
    const k = this.key(source, target);
    let r = this.records.get(k);
    if (!r) {
      r = {
        sourceAgentId: source,
        targetAgentId: target,
        score: 0.5,
        lastUpdated: Date.now(),
      };
      this.records.set(k, r);
    }
    return r;
  }

  adjust(source: AgentId, target: AgentId, action: TrustAction): TrustRecord {
    const current = this.get(source, target);
    const newScore = adjustTrust(current.score, action);
    const updated: TrustRecord = {
      ...current,
      score: newScore,
      lastUpdated: Date.now(),
    };
    this.records.set(this.key(source, target), updated);
    return updated;
  }

  all(): TrustRecord[] {
    return Array.from(this.records.values());
  }

  reset(): void {
    this.records.clear();
  }
}
