import { fileExists } from "../project/yaml-utils.js";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

import type { WorkflowResolveRequest, WorkflowScopeRoots } from "./types.js";

export const defaultProjectWorkflowDirNames = [".obora/workflows", "workflows"] as const;

const resolveFrom = (root: string, path: string): string =>
  isAbsolute(path) ? resolve(path) : resolve(root, path);

const findNearestProjectRootFrom = async (currentDir: string): Promise<string | undefined> => {
  const candidate = join(currentDir, ".obora", "config.yaml");
  if (await fileExists(candidate)) {
    return currentDir;
  }

  const parentDir = dirname(currentDir);
  return parentDir === currentDir ? undefined : findNearestProjectRootFrom(parentDir);
};

export const findWorkflowProjectRoot = async (cwd: string): Promise<string> =>
  (await findNearestProjectRootFrom(resolve(cwd))) ?? resolve(cwd);

export const resolveWorkflowScopeRoots = async (
  request: WorkflowResolveRequest
): Promise<WorkflowScopeRoots> => {
  const cwd = resolve(request.cwd);
  const projectRoot = resolve(request.projectRoot ?? (await findWorkflowProjectRoot(cwd)));
  const projectWorkflowDirs = (request.projectWorkflowDirs ?? defaultProjectWorkflowDirNames).map(
    (dir) => resolveFrom(projectRoot, dir)
  );
  const globalWorkflowDir = resolve(
    request.globalWorkflowDir ?? join(homedir(), ".obora", "workflows")
  );

  return {
    cwd,
    projectRoot,
    projectWorkflowDirs,
    globalWorkflowDir,
  };
};

export const isPathInside = (root: string, path: string): boolean => {
  const relativePath = relative(resolve(root), resolve(path));
  return (
    relativePath === "" ||
    (relativePath.length > 0 && !relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
};

export const displayWorkflowPath = (path: string, roots: WorkflowScopeRoots): string => {
  const absolutePath = resolve(path);
  const home = homedir();
  const projectRelative = relative(roots.projectRoot, absolutePath);
  const homeRelative = relative(home, absolutePath);

  return isPathInside(roots.projectRoot, absolutePath)
    ? projectRelative
    : isPathInside(home, absolutePath)
      ? join("~", homeRelative)
      : absolutePath;
};
