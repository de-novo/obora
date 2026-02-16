import path from "node:path";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet } from "../types.js";

function isPathOutsideRoot(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" ? false : relative.startsWith("..") || path.isAbsolute(relative);
}

export class SandboxRule implements PolicyRulePlugin {
  readonly name = "sandbox";
  readonly version = "1.0.0";
  readonly type = "policy-rule" as const;

  evaluate(action: PolicyAction, _context: PolicyContext, policies: PolicySet): PolicyDecision | null {
    if (action.type !== "file_access" || !policies.sandbox) {
      return null;
    }

    const filePath = (action.params as { path?: string } | undefined)?.path;
    if (!filePath) {
      return null;
    }

    const root = path.resolve(policies.sandbox.root);
    const resolvedPath = path.resolve(filePath);

    if (policies.sandbox.denyOutsideRoot && isPathOutsideRoot(root, resolvedPath)) {
      return {
        type: "deny",
        reason: `File path outside sandbox root: ${filePath}`,
        rule: "sandbox.denyOutsideRoot",
      };
    }

    for (const pattern of policies.sandbox.denyPatterns ?? []) {
      if (resolvedPath.includes(pattern)) {
        return {
          type: "deny",
          reason: `File path blocked by sandbox pattern: ${pattern}`,
          rule: "sandbox.denyPatterns",
        };
      }
    }

    return null;
  }
}
