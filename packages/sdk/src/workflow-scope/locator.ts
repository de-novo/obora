import { createHash } from "node:crypto";
import { basename, extname, resolve } from "node:path";

import type {
  WorkflowDiscoveryResult,
  WorkflowLocator,
  WorkflowScope,
  WorkflowScopeRoots,
} from "./types.js";
import { displayWorkflowPath, isPathInside } from "./paths.js";

interface CreateWorkflowLocatorInput {
  readonly scope: WorkflowScope;
  readonly name: string;
  readonly path: string;
  readonly sourceDir: string;
  readonly roots: WorkflowScopeRoots;
  readonly stepCount: number;
  readonly description?: string;
}

export const workflowFileBaseName = (path: string): string => {
  const ext = extname(path);
  return ext.length > 0 ? basename(path, ext) : basename(path);
};

export const createWorkflowLocator = ({
  scope,
  name,
  path,
  sourceDir,
  roots,
  stepCount,
  description,
}: CreateWorkflowLocatorInput): WorkflowLocator => {
  const absolutePath = resolve(path);
  const idHash = createHash("sha1").update(`${scope}:${absolutePath}`).digest("hex").slice(0, 16);

  return {
    id: `${scope}:${idHash}`,
    scope,
    name,
    path: absolutePath,
    displayPath: displayWorkflowPath(absolutePath, roots),
    editable: scope !== "external",
    sourceDir,
    stepCount,
    ...(description ? { description } : {}),
    ...(scope === "project" ? { projectRoot: roots.projectRoot } : {}),
  };
};

export const sourceDirForPath = (path: string, roots: WorkflowScopeRoots): string | undefined =>
  roots.projectWorkflowDirs.find((dir) => isPathInside(dir, path)) ??
  (isPathInside(roots.globalWorkflowDir, path) ? roots.globalWorkflowDir : undefined);

export const scopeForPath = (path: string, roots: WorkflowScopeRoots): WorkflowScope =>
  roots.projectWorkflowDirs.some((dir) => isPathInside(dir, path))
    ? "project"
    : isPathInside(roots.globalWorkflowDir, path)
      ? "global"
      : "external";

const shadowedGlobalPathFor = (
  locator: WorkflowLocator,
  globalByName: ReadonlyMap<string, WorkflowLocator>
): string | undefined => globalByName.get(locator.name)?.path;

const shadowingProjectPathFor = (
  locator: WorkflowLocator,
  projectByName: ReadonlyMap<string, WorkflowLocator>
): string | undefined => projectByName.get(locator.name)?.path;

export const withShadowingMetadata = (
  roots: WorkflowScopeRoots,
  project: ReadonlyArray<WorkflowLocator>,
  global: ReadonlyArray<WorkflowLocator>
): WorkflowDiscoveryResult => {
  const projectByName = new Map(project.map((locator) => [locator.name, locator] as const));
  const globalByName = new Map(global.map((locator) => [locator.name, locator] as const));
  const markedProject = project.map((locator) => {
    const shadows = shadowedGlobalPathFor(locator, globalByName);
    return shadows ? { ...locator, shadows } : locator;
  });
  const markedGlobal = global.map((locator) => {
    const shadowedBy = shadowingProjectPathFor(locator, projectByName);
    return shadowedBy ? { ...locator, shadowedBy } : locator;
  });

  return {
    roots,
    project: markedProject,
    global: markedGlobal,
    all: [...markedProject, ...markedGlobal],
    diagnostics: [],
  };
};
