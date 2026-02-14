/**
 * Status file utilities
 * @module @obora/cli/utils/status
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import yaml from "yaml";

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
    const parsed = yaml.parse(content) as Record<string, any>;

    return {
      feature: {
        name: parsed.feature?.name || "",
        created_at: parsed.feature?.created_at || "",
        workflow: parsed.feature?.workflow || "",
      },
      status: parsed.status || "pending",
      progress: {
        current_stage: parsed.progress?.current_stage || "planning",
        completed_stages: Array.isArray(parsed.progress?.completed_stages)
          ? parsed.progress.completed_stages
          : [],
      },
      metadata: {
        last_updated: parsed.metadata?.last_updated || "",
        notes: parsed.metadata?.notes || "",
        last_error_code: parsed.metadata?.last_error_code || undefined,
      },
    };
  } catch (error) {
    // If YAML parsing fails, return null
    return null;
  }
}
