import fs from "node:fs/promises";
import path from "node:path";

import { InMemoryAuditStore } from "../audit/InMemoryAuditStore.js";
import type { AuditEvent, AuditFilter } from "../audit/types.js";
import { PipelinePattern } from "../patterns/builtin/PipelinePattern.js";
import { DiscussionPattern } from "../patterns/builtin/DiscussionPattern.js";
import { ConsensusPattern } from "../patterns/builtin/ConsensusPattern.js";
import { BrainstormPattern } from "../patterns/builtin/BrainstormPattern.js";
import { PeerReviewPattern } from "../patterns/builtin/PeerReviewPattern.js";
import { SupervisorPattern } from "../patterns/builtin/SupervisorPattern.js";
import { FanOutFanInPattern } from "../patterns/builtin/FanOutFanInPattern.js";
import { RedBluePattern } from "../patterns/builtin/RedBluePattern.js";
import { CompositePattern } from "../patterns/builtin/CompositePattern.js";
import type { PatternRegistry } from "../patterns/PatternRegistry.js";
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

const isPathInside = (root: string, target: string): boolean => {
  const relativePath = path.relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

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

    if (!isPathInside(sandbox, resolved)) {
      throw new Error(`Path '${input.path}' is outside sandbox root`);
    }

    await fs.mkdir(sandbox, { recursive: true });
    await this.assertResolvedPathStaysInsideSandbox(sandbox, resolved, input.path);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, input.content, "utf8");
    await this.assertWrittenPathStaysInsideSandbox(sandbox, resolved, input.path);

    return {
      path: resolved,
      bytes: Buffer.byteLength(input.content, "utf8"),
    };
  }

  private async assertResolvedPathStaysInsideSandbox(
    sandbox: string,
    resolved: string,
    inputPath: string
  ): Promise<void> {
    const nearestExistingAncestor = await this.findNearestExistingAncestor(path.dirname(resolved));
    const [realSandbox, realAncestor] = await Promise.all([
      fs.realpath(sandbox),
      fs.realpath(nearestExistingAncestor),
    ]);

    if (!isPathInside(realSandbox, realAncestor)) {
      throw new Error(`Path '${inputPath}' is outside sandbox root`);
    }
  }

  private async assertWrittenPathStaysInsideSandbox(
    sandbox: string,
    resolved: string,
    inputPath: string
  ): Promise<void> {
    const [realSandbox, realWrittenPath] = await Promise.all([
      fs.realpath(sandbox),
      fs.realpath(resolved),
    ]);

    if (!isPathInside(realSandbox, realWrittenPath)) {
      await fs.rm(resolved, { force: true }).catch(() => undefined);
      throw new Error(`Path '${inputPath}' is outside sandbox root`);
    }
  }

  private async findNearestExistingAncestor(candidate: string): Promise<string> {
    const found = await fs.stat(candidate).then(
      () => candidate,
      async (error: unknown) => {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }

        const parent = path.dirname(candidate);
        if (parent === candidate) {
          throw new Error("No existing sandbox ancestor found");
        }

        return await this.findNearestExistingAncestor(parent);
      }
    );

    return found;
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

export class ConsensusPatternPlugin extends ConsensusPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "consensus";
  readonly version = "1.0.0";
}

export class BrainstormPatternPlugin extends BrainstormPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "brainstorming";
  readonly version = "1.0.0";
}

export class PeerReviewPatternPlugin extends PeerReviewPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "peer-review";
  readonly version = "1.0.0";
}

export class SupervisorPatternPlugin extends SupervisorPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "supervisor";
  readonly version = "1.0.0";
}

export class FanOutFanInPatternPlugin extends FanOutFanInPattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "fan-out-fan-in";
  readonly version = "1.0.0";
}

export class RedBluePatternPlugin extends RedBluePattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "red-blue";
  readonly version = "1.0.0";
}

export class CompositePatternPlugin extends CompositePattern implements PatternPlugin {
  readonly type = "pattern" as const;
  readonly name = "composite";
  readonly version = "1.0.0";

  constructor(registry: PatternRegistry) {
    super(registry);
  }
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

export class InMemoryAuditStorePlugin implements AuditStorePlugin {
  readonly type = "audit-store" as const;
  readonly name = "in-memory-audit-store";
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

export function createBuiltinPlugins(options: { sandboxRoot?: string; patternRegistry?: PatternRegistry } = {}): AnyPlugin[] {
  const patternRegistry = options.patternRegistry;

  return [
    new BuiltinAgentPlugin(),
    new FileWriteToolPlugin(options.sandboxRoot),
    new PipelinePatternPlugin(),
    new DiscussionPatternPlugin(),
    new ConsensusPatternPlugin(),
    new BrainstormPatternPlugin(),
    new PeerReviewPatternPlugin(),
    new SupervisorPatternPlugin(),
    new FanOutFanInPatternPlugin(),
    new RedBluePatternPlugin(),
    ...(patternRegistry ? [new CompositePatternPlugin(patternRegistry)] : []),
    new AllowAllPolicyRulePlugin(),
    new RetryRecoveryStrategyPlugin(),
    new MajorityConsensusRulePlugin(),
    new InMemoryAuditStorePlugin(),
    new IdentityStateTransformPlugin(),
  ];
}

export async function registerBuiltinPlugins(
  registry: PluginRegistry,
  options: { sandboxRoot?: string; replace?: boolean; patternRegistry?: PatternRegistry } = {}
): Promise<void> {
  const builtins = createBuiltinPlugins({
    sandboxRoot: options.sandboxRoot,
    patternRegistry: options.patternRegistry,
  });
  await builtins.reduce<Promise<void>>(
    (previous, plugin) => previous.then(() => registry.register(plugin, { replace: options.replace })),
    Promise.resolve()
  );
}
