import { Effect } from "effect";
import { resolve } from "node:path";

import { fileExists } from "../project/yaml-utils.js";
import { workflowFileBaseName, withShadowingMetadata } from "./locator.js";
import { resolveWorkflowScopeRoots } from "./paths.js";
import { readWorkflowLocatorFromPath, scanWorkflowDirs } from "./scanner.js";
import type {
  WorkflowDiscoveryResult,
  WorkflowLocator,
  WorkflowResolveRequest,
  WorkflowResolveResult,
} from "./types.js";

const targetLooksLikePath = (target: string): boolean =>
  target.endsWith(".yaml") ||
  target.endsWith(".yml") ||
  target.includes("/") ||
  target.includes("\\");

const candidateMatchesTarget = (locator: WorkflowLocator, target: string): boolean => {
  const normalizedTarget = workflowFileBaseName(target);
  return (
    locator.name === target ||
    locator.name === normalizedTarget ||
    workflowFileBaseName(locator.path) === normalizedTarget
  );
};

const candidatesForScope = (
  discovery: WorkflowDiscoveryResult,
  scope: WorkflowResolveRequest["scope"]
): ReadonlyArray<WorkflowLocator> =>
  scope === "project" ? discovery.project : scope === "global" ? discovery.global : discovery.all;

const resolveAmbiguousCandidates = (
  request: WorkflowResolveRequest,
  candidates: ReadonlyArray<WorkflowLocator>
): WorkflowResolveResult => {
  const intent = request.intent ?? "run";
  const projectCandidate = candidates.find((candidate) => candidate.scope === "project");

  return intent === "view" && projectCandidate
    ? {
        status: "resolved",
        locator: projectCandidate,
        candidates,
        diagnostics: [
          `Workflow "${request.target}" exists in project and global scopes; the project workflow shadows the global workflow for view. Pass --scope global to view the global workflow.`,
        ],
      }
    : {
        status: "ambiguous",
        candidates,
        diagnostics: [
          `Workflow "${request.target}" exists in multiple scopes. Pass --scope project, --scope global, or an exact file path.`,
        ],
      };
};

const resolveWorkflowTargetPromise = async (
  request: WorkflowResolveRequest
): Promise<WorkflowResolveResult> => {
  const roots = await resolveWorkflowScopeRoots(request);
  const target = request.target?.trim();
  const exactPath = target ? resolve(roots.cwd, target) : undefined;

  if (!target) {
    return {
      status: "not-found",
      candidates: [],
      diagnostics: ["No workflow target was provided."],
    };
  }

  if (exactPath && targetLooksLikePath(target) && (await fileExists(exactPath))) {
    const locator = await readWorkflowLocatorFromPath(exactPath, roots);
    return locator
      ? { status: "resolved", locator, candidates: [locator], diagnostics: [] }
      : {
          status: "not-found",
          candidates: [],
          diagnostics: [`Workflow file could not be parsed: ${exactPath}`],
        };
  }

  if (targetLooksLikePath(target)) {
    return {
      status: "not-found",
      candidates: [],
      diagnostics: [`Workflow file not found: ${exactPath}`],
    };
  }

  const discovery = await discoverWorkflowLocators(request);
  const candidates = candidatesForScope(discovery, request.scope).filter((candidate) =>
    candidateMatchesTarget(candidate, target)
  );

  return candidates.length === 0
    ? {
        status: "not-found",
        candidates: [],
        diagnostics: [`Workflow not found: ${target}`],
      }
    : candidates.length === 1
      ? { status: "resolved", locator: candidates[0], candidates, diagnostics: [] }
      : resolveAmbiguousCandidates(request, candidates);
};

export const discoverWorkflowLocatorsEffect = (
  request: WorkflowResolveRequest
): Effect.Effect<WorkflowDiscoveryResult> =>
  Effect.promise(async () => {
    const roots = await resolveWorkflowScopeRoots(request);
    const [project, global] = await Promise.all([
      scanWorkflowDirs("project", roots.projectWorkflowDirs, roots),
      scanWorkflowDirs("global", [roots.globalWorkflowDir], roots),
    ]);
    return withShadowingMetadata(roots, project, global);
  });

export const discoverWorkflowLocators = (
  request: WorkflowResolveRequest
): Promise<WorkflowDiscoveryResult> => Effect.runPromise(discoverWorkflowLocatorsEffect(request));

export const resolveWorkflowTargetEffect = (
  request: WorkflowResolveRequest
): Effect.Effect<WorkflowResolveResult> =>
  Effect.promise(() => resolveWorkflowTargetPromise(request));

export const resolveWorkflowTarget = (
  request: WorkflowResolveRequest
): Promise<WorkflowResolveResult> => Effect.runPromise(resolveWorkflowTargetEffect(request));
