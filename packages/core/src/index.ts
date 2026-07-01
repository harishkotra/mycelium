export {
  CogneeClient,
  initRuntime,
  type CogneeClientConfig,
} from "./cogneeClient";
export { Agent } from "./agent";
export { takeSnapshot, fixtureSnapshot } from "./snapshot";
export { diffSnapshots } from "./structuralDiff";
export { detectDrift, cosineDistance } from "./driftDetector";
export {
  detectContradictions,
  detectContradictionsLight,
  type ContradictionDetectorOptions,
} from "./contradictionDetector";
export { runDiff, type RunDiffOptions } from "./diff";
export { TrustStore, adjustTrust } from "./trust/trustStore";
export {
  tagWithProvenance,
  extractProvenance,
  ProvenanceRegistry,
} from "./sync-protocol/provenance";
export { SubscriptionRegistry } from "./sync-protocol/subscription";
export { SyncEngine, type SyncEngineOptions } from "./sync-protocol/syncEngine";
export { acceptSync, rejectSync } from "./sync-protocol/acceptReject";
export { revokeSource } from "./sync-protocol/revoke";
export * from "./types";
