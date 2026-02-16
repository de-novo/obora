import fs from "node:fs/promises";
import path from "node:path";

import { InMemoryAuditStore } from "../audit/InMemoryAuditStore.js";
import type { AuditEvent, AuditFilter } from "../audit/types.js";
import { PipelinePattern } from "../patterns/builtin/PipelinePattern.js";
import { DiscussionPattern } from "../patterns/builtin/DiscussionPattern.js";
import type {
  AgentPlugin,
  AnyPlugin,
  AuditStorePlugin,
  ConsensusRulePlugin,
  PatternPlugin,
  PolicyRulePlugin,
  RecoveryStrategyPlugin,
  StateTransformPlugin,
  ToolPlugin,
} from "./types.js";
import type { PluginRegistry } from "./PluginRegistry.js";

export class BuiltinAgentPlugin implements AgentPlugin {
  readonly type = "agent" as const;
  readonly name = "builtin-agent";
  readonly version = "1.0.0";

  createAgent(config: unknown): unknown {
    return { kind: "builtin-agent", config };
  }
}

export class FileWriteToolPlugin implements ToolPlugin {
  readonly type = "tool" as const;
  readonly name = "file-write";
  readonly version = "1.0.0";
  readonly schema = {
    type: "object",
    required: ["path", "content"],
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
  };

  constructor(private readonly sandboxRoot = process.cwd()) {}

  async execute(params: unknown): Promise<{ path: string; bytes: number }> {
    if (!params || typeof params !== "object") {
      throw new Error("file-write params must be an object");
    }

    const input = params as { path?: unknown; content?: unknown };
    if (typeof input.path !== "string" || input.path.trim().length === 0) {
      throw new Error("file-write params.path must be a non-empty string");
    }

    if (typeof input.content !== "string") {
      throw new Error("file-write params.content must be a string");
    }

    const resolved = path.resolve(this.sandboxRoot, input.path);
    const sandbox = path.resolve(this.sandboxRoot);

    if (!resolved.startsWith(`${sandbox}${path.sep}`) && resolved !== sandbox) {
      throw new Error(`Path '${input.path}' is outside sandbox root`);
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, input.content, "utf8");

    return {
      path: resolved,
      bytes: Buffer.byteLength(input.content, "utf8"),
    };
  }
}

export class PipelinePatternPlugin extends PipelinePattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "pipeline";
  readonly version = "1.0.0";
}

export class DiscussionPatternPlugin extends DiscussionPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "discussion";
  readonly version = "1.0.0";
}

export class AllowAllPolicyRulePlugin implements PolicyRulePlugin {
  readonly type = "policy-rule" as const;
  readonly name = "allow-all-policy";
  readonly version = "1.0.0";

  evaluate(): { type: "allow" } {
    return { type: "allow" };
  }
}

export class RetryRecoveryStrategyPlugin implements RecoveryStrategyPlugin {
  readonly type = "recovery-strategy" as const;
  readonly name = "retry-recovery";
  readonly version = "1.0.0";

  async handle(): Promise<{ status: "recovered" }> {
    return { status: "recovered" };
  }
}

export class MajorityConsensusRulePlugin implements ConsensusRulePlugin {
  readonly type = "consensus-rule" as const;
  readonly name = "majority-consensus";
  readonly version = "1.0.0";

  evaluate(votes: unknown[]): { status: "pass" | "fail"; approved: number; total: number } {
    const total = votes.length;
    const approved = votes.filter((vote) => !!vote && typeof vote === "object" && (vote as { approved?: boolean }).approved === true).length;

    return {
      status: approved >= Math.ceil(total / 2) ? "pass" : "fail",
      approved,
      total,
    };
  }
}

export class DuckDBAuditStorePlugin implements AuditStorePlugin {
  readonly type = "audit-store" as const;
  readonly name = "duckdb-audit-store";
  readonly version = "1.0.0";

  private readonly store = new InMemoryAuditStore();

  async record(event: AuditEvent): Promise<void> {
    await this.store.record(event);
  }

  async query(filter: AuditFilter): Promise<AuditEvent[]> {
    return this.store.query(filter);
  }
}

export class IdentityStateTransformPlugin implements StateTransformPlugin {
  readonly type = "state-transform" as const;
  readonly name = "identity-transform";
  readonly version = "1.0.0";

  transform(value: unknown): unknown {
    return value;
  }
}

export function createBuiltinPlugins(options: { sandboxRoot?: string } = {}): AnyPlugin[] {
  return [
    new BuiltinAgentPlugin(),
    new FileWriteToolPlugin(options.sandboxRoot),
    new PipelinePatternPlugin(),
    new DiscussionPatternPlugin(),
    new AllowAllPolicyRulePlugin(),
    new RetryRecoveryStrategyPlugin(),
    new MajorityConsensusRulePlugin(),
    new DuckDBAuditStorePlugin(),
    new IdentityStateTransformPlugin(),
  ];
}

export async function registerBuiltinPlugins(
  registry: PluginRegistry,
  options: { sandboxRoot?: string; replace?: boolean } = {}
): Promise<void> {
  const builtins = createBuiltinPlugins({ sandboxRoot: options.sandboxRoot });
  for (const plugin of builtins) {
    await registry.register(plugin, { replace: options.replace });
  }
}
