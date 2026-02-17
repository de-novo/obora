import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { OboraError } from "./runtime.js";

export interface WorkflowStep {
  name: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  config?: Record<string, unknown>;
  depends_on?: string[];
  gate?: string | { type: string; [key: string]: unknown };
}

export interface WorkflowDef {
  name: string;
  version?: string;
  steps: WorkflowStep[];
  variables?: Record<string, unknown>;
}

export class Workflow {
  static async fromYaml(path: string): Promise<WorkflowDef> {
    const content = await readFile(path, "utf-8");
    const parsed = parseYaml(content);
    return Workflow.create(parsed);
  }

  static create(input: unknown): WorkflowDef {
    if (!input || typeof input !== "object") {
      throw new OboraError("Invalid workflow definition", "SDK_INVALID_WORKFLOW");
    }

    const def = input as Record<string, unknown>;
    if (!def.name || typeof def.name !== "string") {
      throw new OboraError("Workflow must have a name", "SDK_INVALID_WORKFLOW");
    }

    if (!Array.isArray(def.steps)) {
      throw new OboraError("Workflow must have steps array", "SDK_INVALID_WORKFLOW");
    }

    return input as WorkflowDef;
  }
}
