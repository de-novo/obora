import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Request, Response } from "express";
import YAML from "yaml";

import type { FeatureStatus } from "../types.js";

function readFeatureStatus(projectRoot: string, name: string): FeatureStatus | null {
  const statusPath = join(projectRoot, ".obora", "features", name, "status.yaml");
  if (!existsSync(statusPath)) {
    return null;
  }

  const raw = readFileSync(statusPath, "utf-8");
  const parsed = YAML.parse(raw) as Record<string, any>;

  return {
    name,
    workflow: String(parsed?.feature?.workflow ?? "simple"),
    status: String(parsed?.status ?? "unknown"),
    currentStage:
      typeof parsed?.progress?.current_stage === "string"
        ? parsed.progress.current_stage
        : undefined,
    updatedAt:
      typeof parsed?.metadata?.last_updated === "string"
        ? parsed.metadata.last_updated
        : undefined,
    notes: typeof parsed?.metadata?.notes === "string" ? parsed.metadata.notes : undefined,
  };
}

export function listFeatures(projectRoot: string): FeatureStatus[] {
  const featuresDir = join(projectRoot, ".obora", "features");
  if (!existsSync(featuresDir)) {
    return [];
  }

  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => readFeatureStatus(projectRoot, entry.name))
    .filter((item): item is FeatureStatus => item !== null);
}

export function getFeaturesHandler(projectRoot: string) {
  return (_req: Request, res: Response): void => {
    const features = listFeatures(projectRoot);
    res.json({ features });
  };
}

export function getFeatureStatusHandler(projectRoot: string) {
  return (req: Request, res: Response): void => {
    const { name } = req.params;
    const feature = readFeatureStatus(projectRoot, name);
    if (!feature) {
      res.status(404).json({ error: `Feature '${name}' not found` });
      return;
    }

    res.json({ feature });
  };
}
