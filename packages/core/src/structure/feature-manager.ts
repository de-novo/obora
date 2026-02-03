/**
 * Feature folder structure manager
 * @module @obora/core/structure/feature-manager
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Feature lifecycle status
 */
export enum FeatureStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  BLOCKED = "blocked",
  PAUSED = "paused",
  CANCELLED = "cancelled",
}

/**
 * Feature status history entry
 */
export interface StatusHistory {
  /** Status value */
  status: FeatureStatus;
  /** When the status changed */
  changedAt: string;
  /** Optional reason for the status change */
  reason?: string;
}

/**
 * Status file content
 */
export interface StatusFile {
  /** Feature name */
  name: string;
  /** Current status */
  status: FeatureStatus;
  /** When the feature was created */
  createdAt: string;
  /** When the status was last updated */
  updatedAt: string;
  /** Status change history */
  history: StatusHistory[];
}

/**
 * Feature structure
 */
export interface FeatureStructure {
  /** Feature name */
  name: string;
  /** Path to the feature folder */
  path: string;
  /** Current status */
  status: FeatureStatus;
  /** When the feature was created */
  createdAt: Date;
  /** When the feature was last updated */
  updatedAt: Date;
}

/**
 * Options for creating a feature
 */
export interface CreateFeatureOptions {
  /** Skip creating proposal.md */
  skipProposal?: boolean;
  /** Skip creating design.md */
  skipDesign?: boolean;
  /** Skip creating tasks.md */
  skipTasks?: boolean;
  /** Custom content for files */
  templates?: Partial<Record<"proposal" | "design" | "tasks", string>>;
}

/**
 * Options for deleting a feature
 */
export interface DeleteFeatureOptions {
  /** Force delete without archiving */
  force?: boolean;
  /** Reason for deletion */
  reason?: string;
}

/**
 * Folder structure constants
 */
export const FOLDER_STRUCTURE = {
  ROOT: ".obora",
  FEATURES: ".obora/features",
  ARCHIVE: ".obora/archive",
  WORKFLOWS: ".obora/workflows",
} as const;

/**
 * Default file templates
 */
const DEFAULT_TEMPLATES = {
  proposal: `# Feature Proposal

## Overview
[Brief description of the feature]

## Goals
- [ ] Goal 1
- [ ] Goal 2

## Success Criteria
- [ ] Success criteria 1
- [ ] Success criteria 2

## Dependencies
- List any dependencies

## Timeline
- Estimated completion date
`,
  design: `# Design Document

## Architecture
[Describe the architecture]

## Data Model
[Describe the data model]

## API Design
[Describe the API]

## Security Considerations
[Describe security concerns]

## Edge Cases
- Edge case 1
- Edge case 2
`,
  tasks: `# Tasks

## Implementation Tasks
- [ ] Task 1
- [ ] Task 2

## Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
`,
} as const;

/**
 * Feature file names (used for documentation)
 */
const _FEATURE_FILES = ["proposal.md", "design.md", "tasks.md"] as const;
const FEATURE_FOLDERS = ["context"] as const;

/**
 * Validate feature name
 */
export function validateFeatureName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Feature name must be a non-empty string");
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error("Feature name must contain only lowercase letters, numbers, and hyphens");
  }

  if (name.startsWith("-") || name.endsWith("-")) {
    throw new Error("Feature name cannot start or end with a hyphen");
  }
}

/**
 * Check if a feature exists
 */
export function featureExists(name: string): boolean {
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);
  return fs.existsSync(featurePath);
}

/**
 * Get status file path for a feature
 */
function getStatusFilePath(featurePath: string): string {
  return path.join(featurePath, "status.yaml");
}

/**
 * Read status file
 */
export function readStatusFile(featurePath: string): StatusFile {
  const statusPath = getStatusFilePath(featurePath);

  if (!fs.existsSync(statusPath)) {
    // Return default status if file doesn't exist
    return {
      name: path.basename(featurePath),
      status: FeatureStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [],
    };
  }

  const content = fs.readFileSync(statusPath, "utf-8");
  return parseStatusFile(content);
}

/**
 * Parse status file content
 */
function parseStatusFile(content: string): StatusFile {
  // Simple YAML-like parser (for now - could use YAML parser)
  const lines = content.split("\n");
  const status: Partial<StatusFile> = {};
  let currentKey = "";
  const history: StatusHistory[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Check for history entries
    const historyMatch = trimmed.match(/^- (.+)$/);
    if (historyMatch && status.history) {
      const entry = historyMatch[1];
      const parts = entry.split(" | ");
      if (parts.length >= 2) {
        history.push({
          status: parts[0] as FeatureStatus,
          changedAt: parts[1],
          reason: parts[2],
        });
      }
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      currentKey = trimmed.slice(0, colonIndex).trim().toLowerCase();
      const value = trimmed.slice(colonIndex + 1).trim();

      switch (currentKey) {
        case "name":
          status.name = value;
          break;
        case "status":
          status.status = value as FeatureStatus;
          break;
        case "created_at":
          status.createdAt = value;
          break;
        case "updated_at":
          status.updatedAt = value;
          break;
      }
    }
  }

  return {
    name: status.name || "",
    status: status.status || FeatureStatus.PENDING,
    createdAt: status.createdAt || new Date().toISOString(),
    updatedAt: status.updatedAt || new Date().toISOString(),
    history,
  };
}

/**
 * Write status file
 */
function writeStatusFile(featurePath: string, status: StatusFile): void {
  const statusPath = getStatusFilePath(featurePath);

  const lines = [
    `# Feature Status`,
    ``,
    `name: ${status.name}`,
    `status: ${status.status}`,
    `created_at: ${status.createdAt}`,
    `updated_at: ${status.updatedAt}`,
    ``,
    `# History`,
    ...status.history.map(
      (h) => `- ${h.status} | ${h.changedAt}${h.reason ? ` | ${h.reason}` : ""}`
    ),
  ];

  fs.writeFileSync(statusPath, lines.join("\n"), "utf-8");
}

/**
 * Update feature status
 */
export function updateFeatureStatus(
  featurePath: string,
  newStatus: FeatureStatus,
  reason?: string
): void {
  const status = readStatusFile(featurePath);

  status.status = newStatus;
  status.updatedAt = new Date().toISOString();
  status.history.push({
    status: newStatus,
    changedAt: status.updatedAt,
    reason,
  });

  writeStatusFile(featurePath, status);
}

/**
 * Create a new feature
 */
export function createFeature(name: string, options: CreateFeatureOptions = {}): FeatureStructure {
  validateFeatureName(name);

  if (featureExists(name)) {
    throw new Error(`Feature '${name}' already exists`);
  }

  // Create feature path
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);
  fs.mkdirSync(featurePath, { recursive: true });

  // Create subfolders
  for (const folder of FEATURE_FOLDERS) {
    fs.mkdirSync(path.join(featurePath, folder), { recursive: true });
  }

  // Create files
  const filesToCreate = [];

  if (!options.skipProposal) {
    filesToCreate.push({
      name: "proposal.md",
      content: options.templates?.proposal || DEFAULT_TEMPLATES.proposal,
    });
  }

  if (!options.skipDesign) {
    filesToCreate.push({
      name: "design.md",
      content: options.templates?.design || DEFAULT_TEMPLATES.design,
    });
  }

  if (!options.skipTasks) {
    filesToCreate.push({
      name: "tasks.md",
      content: options.templates?.tasks || DEFAULT_TEMPLATES.tasks,
    });
  }

  for (const file of filesToCreate) {
    fs.writeFileSync(path.join(featurePath, file.name), file.content, "utf-8");
  }

  // Create initial status file
  const now = new Date().toISOString();
  const initialStatus: StatusFile = {
    name,
    status: FeatureStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        status: FeatureStatus.PENDING,
        changedAt: now,
        reason: "Feature created",
      },
    ],
  };
  writeStatusFile(featurePath, initialStatus);

  return {
    name,
    path: featurePath,
    status: FeatureStatus.PENDING,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/**
 * Archive a feature
 */
export function archiveFeature(name: string, reason?: string): FeatureStructure {
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);

  if (!fs.existsSync(featurePath)) {
    throw new Error(`Feature '${name}' not found`);
  }

  // Create archive path with date prefix
  const datePrefix = new Date().toISOString().split("T")[0];
  const archivePath = path.join(FOLDER_STRUCTURE.ARCHIVE, `${datePrefix}-${name}`);

  // Create archive directory
  fs.mkdirSync(path.join(FOLDER_STRUCTURE.ARCHIVE), { recursive: true });

  // Move feature folder
  fs.renameSync(featurePath, archivePath);

  // Update status
  updateFeatureStatus(archivePath, FeatureStatus.CANCELLED, reason);

  const status = readStatusFile(archivePath);

  return {
    name,
    path: archivePath,
    status: status.status,
    createdAt: new Date(status.createdAt),
    updatedAt: new Date(status.updatedAt),
  };
}

/**
 * Delete a feature
 */
export function deleteFeature(name: string, options: DeleteFeatureOptions = {}): void {
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);

  if (!fs.existsSync(featurePath)) {
    throw new Error(`Feature '${name}' not found`);
  }

  if (options.force) {
    // Force delete - remove completely
    fs.rmSync(featurePath, { recursive: true, force: true });
  } else {
    // Archive instead of delete
    archiveFeature(name, options.reason || "Feature deleted");
  }
}

/**
 * Get feature info
 */
export function getFeatureInfo(name: string): FeatureStructure | null {
  const featurePath = path.join(FOLDER_STRUCTURE.FEATURES, name);

  if (!fs.existsSync(featurePath)) {
    return null;
  }

  const status = readStatusFile(featurePath);

  return {
    name,
    path: featurePath,
    status: status.status,
    createdAt: new Date(status.createdAt),
    updatedAt: new Date(status.updatedAt),
  };
}

/**
 * List all features
 */
export function listFeatures(): FeatureStructure[] {
  const features: FeatureStructure[] = [];

  if (!fs.existsSync(FOLDER_STRUCTURE.FEATURES)) {
    return features;
  }

  const entries = fs.readdirSync(FOLDER_STRUCTURE.FEATURES, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const info = getFeatureInfo(entry.name);
      if (info) {
        features.push(info);
      }
    }
  }

  return features.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Restore an archived feature
 */
export function restoreFeature(archiveName: string): FeatureStructure {
  const archivePath = path.join(FOLDER_STRUCTURE.ARCHIVE, archiveName);

  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archived feature '${archiveName}' not found`);
  }

  // Extract original name (remove date prefix)
  const match = archiveName.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  const originalName = match ? match[1] : archiveName;

  // Check if feature already exists
  if (featureExists(originalName)) {
    throw new Error(`Feature '${originalName}' already exists`);
  }

  // Restore path
  const restorePath = path.join(FOLDER_STRUCTURE.FEATURES, originalName);

  // Move back
  fs.renameSync(archivePath, restorePath);

  // Update status
  updateFeatureStatus(restorePath, FeatureStatus.PENDING, "Feature restored");

  const status = readStatusFile(restorePath);

  return {
    name: originalName,
    path: restorePath,
    status: status.status,
    createdAt: new Date(status.createdAt),
    updatedAt: new Date(status.updatedAt),
  };
}
