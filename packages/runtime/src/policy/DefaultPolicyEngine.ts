import { createHash } from "node:crypto";
import { Effect } from "effect";
import { OboraErrorCode } from "../errors/OboraErrorCode.js";
import { parseExpression } from "./expressions/ExpressionParser.js";
import type { PolicyEngine } from "./PolicyEngine.js";
import { loadPolicyFromYamlEffect } from "./PolicyLoader.js";
import { GateRule, ResourceRule, SandboxRule, ToolRule, type PolicyConditionAuditEvent } from "./rules/index.js";
import type {
  PolicyAction,
  PolicyContext,
  PolicyDecision,
  PolicyRulePlugin,
  PolicySet,
  PolicySnapshot,
  PolicyVersion,
} from "./types.js";

export interface PolicyLifecycleEvent {
  type: "load" | "reload_success" | "reload_failure";
  version?: PolicyVersion;
  source: string;
  error?: string;
}

export interface PolicySnapshotPinnedAuditEvent {
  type: "policy_snapshot_pinned";
  executionId: string;
  version: string;
}

export interface DefaultPolicyEngineOptions {
  onLifecycleEvent?: (event: PolicyLifecycleEvent) => void | Promise<void>;
  onAuditEvent?: (event: PolicyConditionAuditEvent | PolicySnapshotPinnedAuditEvent) => void | Promise<void>;
}

export class DefaultPolicyEngine implements PolicyEngine {
  private policyPath?: string;
  private policySet: PolicySet = {};
  private policyVersion?: PolicyVersion;
  private readonly versions: PolicyVersion[] = [];
  private readonly rules: readonly PolicyRulePlugin[];
  private readonly onLifecycleEvent?: (event: PolicyLifecycleEvent) => void | Promise<void>;
  private readonly onAuditEvent?: (event: PolicyConditionAuditEvent | PolicySnapshotPinnedAuditEvent) => void | Promise<void>;
  private readonly pinnedSnapshots = new Map<string, PolicySnapshot>();

  constructor(rules?: readonly PolicyRulePlugin[], options?: DefaultPolicyEngineOptions) {
    this.rules = rules ?? [new ToolRule({ onAuditEvent: options?.onAuditEvent }), new SandboxRule(), new ResourceRule(), new GateRule()];
    this.onLifecycleEvent = options?.onLifecycleEvent;
    this.onAuditEvent = options?.onAuditEvent;
  }

  async load(pathToPolicy: string): Promise<PolicyVersion> {
    return Effect.runPromise(this.loadEffect(pathToPolicy));
  }

  loadEffect(pathToPolicy: string): Effect.Effect<PolicyVersion, unknown> {
    return loadPolicyFromYamlEffect(pathToPolicy).pipe(
      Effect.flatMap((loaded) =>
        Effect.tryPromise({
          try: async () => {
            this.policyPath = pathToPolicy;
            const version = this.applyPolicy(loaded, pathToPolicy);
            await this.emit({ type: "load", source: pathToPolicy, version });
            return version;
          },
          catch: (error) => error,
        }),
      ),
    );
  }

  loadInline(policies: PolicySet, source = "inline"): PolicyVersion {
    return Effect.runSync(this.loadInlineEffect(policies, source));
  }

  loadInlineEffect(policies: PolicySet, source = "inline"): Effect.Effect<PolicyVersion, unknown> {
    return Effect.try({
      try: () => {
        this.policyPath = undefined;
        const version = this.applyPolicy(policies, source);
        void this.emit({ type: "load", source, version });
        return version;
      },
      catch: (error) => error,
    });
  }

  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision {
    return Effect.runSync(this.enforceEffect(action, context));
  }

  enforceEffect(action: PolicyAction, context: PolicyContext): Effect.Effect<PolicyDecision> {
    const pinned = context.executionId ? this.pinnedSnapshots.get(context.executionId) : undefined;
    if (pinned) {
      return Effect.sync(() => pinned.enforce(action, context));
    }

    return this.enforceWithPolicyEffect(this.policySet, action, context);
  }

  async reload(): Promise<PolicyVersion | undefined> {
    return Effect.runPromise(this.reloadEffect());
  }

  reloadEffect(): Effect.Effect<PolicyVersion | undefined, unknown> {
    if (!this.policyPath) {
      return Effect.succeed(undefined);
    }

    const policyPath = this.policyPath;
    return loadPolicyFromYamlEffect(policyPath).pipe(
      Effect.flatMap((reloaded) =>
        Effect.tryPromise({
          try: async () => {
            const version = this.applyPolicy(reloaded, policyPath);
            await this.emit({ type: "reload_success", source: policyPath, version });
            return version;
          },
          catch: (error) => error,
        }),
      ),
      Effect.catchAll((error) =>
        Effect.tryPromise({
          try: async () => {
            await this.emit({
              type: "reload_failure",
              source: policyPath,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          },
          catch: (caught) => caught,
        }),
      ),
    );
  }

  version(): string {
    return this.policyVersion?.version ?? "unknown";
  }

  currentVersion(): PolicyVersion | undefined {
    return this.policyVersion;
  }

  history(): readonly PolicyVersion[] {
    return [...this.versions];
  }

  snapshot(): PolicySnapshot {
    return Effect.runSync(this.snapshotEffect());
  }

  snapshotEffect(): Effect.Effect<PolicySnapshot> {
    return Effect.sync(() => {
      const snapPolicy = clonePolicy(this.policySet);
      const snapVersion = this.policyVersion ?? buildVersion(this.policySet, this.policyPath ?? "inline");

      return {
        version: snapVersion,
        enforce: (action, context) => Effect.runSync(this.enforceWithPolicyEffect(snapPolicy, action, context)),
      };
    });
  }

  pinForExecution(executionId: string): PolicySnapshot {
    const snapshot = this.snapshot();
    this.pinnedSnapshots.set(executionId, snapshot);
    void this.onAuditEvent?.({
      type: "policy_snapshot_pinned",
      executionId,
      version: snapshot.version.version,
    });
    return snapshot;
  }

  unpinExecution(executionId: string): void {
    this.pinnedSnapshots.delete(executionId);
  }

  getPinnedSnapshot(executionId: string): PolicySnapshot | undefined {
    return this.pinnedSnapshots.get(executionId);
  }

  private enforceWithPolicyEffect(
    policySet: PolicySet,
    action: PolicyAction,
    context: PolicyContext,
  ): Effect.Effect<PolicyDecision> {
    return Effect.sync(() => {
      const decision = this.rules.reduce<PolicyDecision | undefined>(
        (matched, rule) => matched ?? rule.evaluate(action, context, policySet) ?? undefined,
        undefined
      );

      return decision ?? { type: "allow" };
    });
  }

  private applyPolicy(policySet: PolicySet, source: string): PolicyVersion {
    Effect.runSync(validatePolicyConditionsEffect(policySet));
    this.policySet = clonePolicy(policySet);
    this.policyVersion = buildVersion(this.policySet, source);
    this.versions.push(this.policyVersion);
    return this.policyVersion;
  }

  private async emit(event: PolicyLifecycleEvent): Promise<void> {
    await Promise.resolve(this.onLifecycleEvent?.(event));
  }
}

export const validatePolicyConditionsEffect = (policySet: PolicySet): Effect.Effect<void, unknown> =>
  Effect.try({
    try: () => validatePolicyConditions(policySet),
    catch: (error) => error,
  });

function validatePolicyConditions(policySet: PolicySet): void {
  (policySet.tools ?? []).forEach((tool) => {
    const condition = tool.when?.condition;
    if (!condition) {
      return;
    }

    try {
      parseExpression(condition);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(
        `[${OboraErrorCode.POLICY_LOAD_FAILED}] Invalid tool condition at tools.${tool.name}: ${details}`,
      ) as Error & { code?: OboraErrorCode };
      wrapped.code = OboraErrorCode.POLICY_LOAD_FAILED;
      throw wrapped;
    }
  });

  (policySet.dynamicToolRules ?? []).forEach((rule) => {
    try {
      parseExpression(rule.condition);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(
        `[${OboraErrorCode.POLICY_LOAD_FAILED}] Invalid dynamic tool condition at dynamicToolRules.${rule.name}: ${details}`,
      ) as Error & { code?: OboraErrorCode };
      wrapped.code = OboraErrorCode.POLICY_LOAD_FAILED;
      throw wrapped;
    }
  });

  (policySet.resources?.dynamicQuota?.limits ?? []).forEach((limit) => {
    try {
      parseExpression(limit.condition);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(
        `[${OboraErrorCode.POLICY_LOAD_FAILED}] Invalid dynamic quota condition at resources.dynamicQuota.${limit.field}: ${details}`,
      ) as Error & { code?: OboraErrorCode };
      wrapped.code = OboraErrorCode.POLICY_LOAD_FAILED;
      throw wrapped;
    }
  });
}

function buildVersion(policySet: PolicySet, source: string): PolicyVersion {
  const hash = createHash("sha256").update(stableStringify(policySet)).digest("hex");
  return {
    version: policySet.version ?? hash.slice(0, 12),
    source,
    hash,
    loadedAt: new Date(),
  };
}

function clonePolicy(policySet: PolicySet): PolicySet {
  return structuredClone(policySet);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
