/**
 * Project Configuration
 *
 * Re-exports from @obora/project-config for backward compatibility.
 * New code should import directly from @obora/project-config.
 */

export * from "@obora/project-config";

// Legacy re-export: APP_MODULES for path resolution
import { APP_MODULES } from "./constants";
import type { AppPathResolver } from "@obora/project-config";

/**
 * App path resolver that uses APP_MODULES from constants
 */
export const resolveAppPath: AppPathResolver = (
  projectPath: string,
  base: string,
  appName: string,
  module: string
): string => {
  const { join } = require("pathe");
  const moduleConfig = APP_MODULES[module as keyof typeof APP_MODULES];
  if (base === "single") {
    return projectPath;
  }
  if (moduleConfig?.targetDir) {
    const root = moduleConfig.targetDir.split("/")[0];
    if (root === "packages") {
      return join(projectPath, "packages", appName);
    }
    if (root === "apps") {
      return join(projectPath, "apps", appName);
    }
  }
  if (module === "shared-database" || module === "shared-ui") {
    return join(projectPath, "packages", appName);
  }
  return join(projectPath, "apps", appName);
};
