import { resolve } from "node:path";

import { listWorkflows, readWorkflow } from "../project/workflow-manager.js";
import { fileExists } from "../project/yaml-utils.js";
import type { WorkflowDef } from "../workflow.js";
import {
  createWorkflowLocator,
  scopeForPath,
  sourceDirForPath,
  workflowFileBaseName,
} from "./locator.js";
import type { WorkflowLocator, WorkflowScope, WorkflowScopeRoots } from "./types.js";

const compareLocator = (left: WorkflowLocator, right: WorkflowLocator): number =>
  left.name.localeCompare(right.name) || left.path.localeCompare(right.path);

const locatorsForDir = async (
  scope: Exclude<WorkflowScope, "external">,
  sourceDir: string,
  roots: WorkflowScopeRoots
): Promise<ReadonlyArray<WorkflowLocator>> => {
  const entries = await listWorkflows(sourceDir);
  return entries
    .map((entry) =>
      createWorkflowLocator({
        scope,
        name: entry.name,
        path: entry.path,
        sourceDir,
        roots,
        stepCount: entry.stepCount,
        description: entry.description,
      })
    )
    .sort(compareLocator);
};

export const scanWorkflowDirs = async (
  scope: Exclude<WorkflowScope, "external">,
  sourceDirs: ReadonlyArray<string>,
  roots: WorkflowScopeRoots
): Promise<ReadonlyArray<WorkflowLocator>> => {
  const nested = await Promise.all(
    sourceDirs.map((sourceDir) => locatorsForDir(scope, sourceDir, roots))
  );
  return nested.flat();
};

export const readWorkflowLocatorFromPath = async (
  path: string,
  roots: WorkflowScopeRoots
): Promise<WorkflowLocator | undefined> => {
  const absolutePath = resolve(path);
  const workflow = (await readWorkflow(absolutePath)) as WorkflowDef | undefined;
  const sourceDir = sourceDirForPath(absolutePath, roots);
  const scope = scopeForPath(absolutePath, roots);

  return workflow && (await fileExists(absolutePath))
    ? createWorkflowLocator({
        scope,
        name: workflow.name ?? workflowFileBaseName(absolutePath),
        path: absolutePath,
        sourceDir: sourceDir ?? absolutePath,
        roots,
        stepCount: workflow.steps?.length ?? 0,
        description: workflow.description,
      })
    : undefined;
};
