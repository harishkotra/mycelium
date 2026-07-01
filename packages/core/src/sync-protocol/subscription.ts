import type { AgentId, Subscription } from "../types";

export class SubscriptionRegistry {
  private subs: Subscription[] = [];

  add(sub: Subscription): void {
    const existing = this.subs.findIndex(
      (s) =>
        s.subscriberId === sub.subscriberId &&
        s.sourceAgentId === sub.sourceAgentId,
    );
    if (existing !== -1) {
      this.subs[existing] = sub;
    } else {
      this.subs.push(sub);
    }
  }

  remove(subscriberId: AgentId, sourceAgentId: AgentId): void {
    const idx = this.subs.findIndex(
      (s) =>
        s.subscriberId === subscriberId && s.sourceAgentId === sourceAgentId,
    );
    if (idx !== -1) this.subs.splice(idx, 1);
  }

  getForSubscriber(subscriberId: AgentId): Subscription[] {
    return this.subs.filter((s) => s.subscriberId === subscriberId && s.active);
  }

  getSourcesForSubscriber(subscriberId: AgentId): AgentId[] {
    return this.getForSubscriber(subscriberId).map((s) => s.sourceAgentId);
  }

  getSubscribersForSource(sourceAgentId: AgentId): Subscription[] {
    return this.subs.filter(
      (s) => s.sourceAgentId === sourceAgentId && s.active,
    );
  }

  all(): Subscription[] {
    return this.subs;
  }

  reset(): void {
    this.subs = [];
  }
}
