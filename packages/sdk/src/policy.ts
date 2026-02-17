import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { OboraError } from "./runtime.js";

export interface PolicyDefinition {
  version?: string;
  rules?: Array<{
    name: string;
    condition: string;
    action: string;
    priority?: number;
  }>;
  tools?: Record<string, { allowed: boolean; conditions?: string[] }>;
  resources?: Record<string, unknown>;
}

export class Policy {
  static async fromYaml(path: string): Promise<PolicyDefinition> {
    const content = await readFile(path, "utf-8");
    const parsed = parseYaml(content);
    return Policy.create(parsed);
  }

  static create(input: unknown): PolicyDefinition {
    if (!input || typeof input !== "object") {
      throw new OboraError("Invalid policy definition", "SDK_INVALID_POLICY");
    }
    const def = input as Record<string, unknown>;
    if (def.rules !== undefined && !Array.isArray(def.rules)) {
      throw new OboraError("Policy rules must be an array", "SDK_INVALID_POLICY");
    }
    if (def.tools !== undefined && (typeof def.tools !== "object" || Array.isArray(def.tools))) {
      throw new OboraError("Policy tools must be an object", "SDK_INVALID_POLICY");
    }
    return input as PolicyDefinition;
  }
}
