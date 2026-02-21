/**
 * Status file utilities
 * @module @obora/cli/utils/status
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import yaml from "yaml";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Status file structure
 */
export interface StatusFile {
  feature: {
    name: string;
    created_at: string;
    workflow: string;
  };
  status: string;
  progress: {
    current_stage: string;
    completed_stages: string[];
  };
  metadata: {
    last_updated: string;
    notes: string;
    /** Error code from the last failed run (e.g. "E4005") */
    last_error_code?: string;
  };
}

/**
 * Read and parse status.yaml using YAML parser
 */
export function readStatus(featurePath: string): StatusFile | null {
  const statusPath = join(featurePath, "status.yaml");
  if (!existsSync(statusPath)) {
    return null;
  }

  try {
    const content = readFileSync(statusPath, "utf-8");
    const parsed = asRecord(yaml.parse(content));
    const feature = asRecord(parsed.feature);
    const progress = asRecord(parsed.progress);
    const metadata = asRecord(parsed.metadata);
    const completedStages = progress.completed_stages;

    return {
      feature: {
        name: asString(feature.name),
        created_at: asString(feature.created_at),
        workflow: asString(feature.workflow),
      },
      status: asString(parsed.status, "pending"),
      progress: {
        current_stage: asString(progress.current_stage, "planning"),
        completed_stages: Array.isArray(completedStages)
          ? completedStages.filter((s): s is string => typeof s === "string")
          : [],
      },
      metadata: {
        last_updated: asString(metadata.last_updated),
        notes: asString(metadata.notes),
        last_error_code:
          typeof metadata.last_error_code === "string" ? metadata.last_error_code : undefined,
      },
    };
  } catch {
    // If YAML parsing fails, return null
    return null;
  }
}
