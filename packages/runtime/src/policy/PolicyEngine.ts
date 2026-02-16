import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "./types.js";

export interface PolicyEngine {
  load(path: string): Promise<void>;
  loadInline(policies: PolicySet): void;
  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision;
  reload(): Promise<void>;
  version(): string;
}
