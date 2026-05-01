/**
 * Path utilities for security
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { CLIError } from "../errors.js";

/**
 * Validate and resolve a path to prevent path traversal attacks
 * @param inputPath - User-provided path
 * @param baseDir - Base directory that the path must be within
 * @returns Resolved, validated absolute path
 * @throws {CLIError} If path traversal is detected
 */
export function validatePath(inputPath: string, baseDir: string): string {
  // Normalize the input path (resolve . and ..)
  const normalized = path.normalize(inputPath);

  // Resolve against the base directory
  const resolved = path.resolve(baseDir, normalized);
  const resolvedBase = path.resolve(baseDir);

  // Check if the resolved path is within the base directory
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new CLIError("Invalid path: path traversal detected", 1);
  }

  return resolved;
}

/**
 * Validate a feature name path component
 * @param name - Feature name to validate
 * @throws {CLIError} If name contains path traversal characters
 */
export function validatePathComponent(name: string): void {
  // Prevent path traversal in component names
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes(path.sep)) {
    throw new CLIError(`Invalid path component: '${name}' contains path separators`, 1);
  }

  // Prevent absolute paths
  if (path.isAbsolute(name)) {
    throw new CLIError(`Invalid path component: '${name}' is an absolute path`, 1);
  }
}

/**
 * Safe path join that validates the result
 * @param baseDir - Base directory
 * @param segments - Path segments to join
 * @returns Validated, joined path
 */
export function safePathJoin(baseDir: string, ...segments: string[]): string {
  const joined = path.join(baseDir, ...segments);
  const resolvedBase = path.resolve(baseDir);

  // Validate the result is within baseDir
  if (!joined.startsWith(resolvedBase + path.sep) && joined !== resolvedBase) {
    throw new CLIError("Invalid path: path traversal detected", 1);
  }

  return joined;
}

/**
 * Ensure a directory exists safely
 * @param basePath - Base directory (usually CWD)
 * @param relativePath - Relative path from base
 * @returns The validated, created path
 */
export function ensureSafeDir(basePath: string, relativePath: string): string {
  const validated = validatePath(relativePath, basePath);
  if (!fs.existsSync(validated)) {
    fs.mkdirSync(validated, { recursive: true });
  }
  return validated;
}
