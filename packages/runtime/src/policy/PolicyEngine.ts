import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet, PolicySnapshot, PolicyVersion } from "./types.js";

export interface PolicyEngine {
  load(path: string): Promise<PolicyVersion>;
  loadInline(policies: PolicySet, source?: string): PolicyVersion;
  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision;
  reload(): Promise<PolicyVersion | undefined>;
  version(): string;
  currentVersion(): PolicyVersion | undefined;
  history(): readonly PolicyVersion[];
  snapshot(): PolicySnapshot;
}
