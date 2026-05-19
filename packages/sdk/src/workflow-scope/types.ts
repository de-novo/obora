export const workflowScopes = ["project", "global", "external"] as const;
export type WorkflowScope = (typeof workflowScopes)[number];

export const workflowResolveScopes = ["project", "global", "all"] as const;
export type WorkflowResolveScope = (typeof workflowResolveScopes)[number];

export const workflowResolveIntents = ["view", "build", "run"] as const;
export type WorkflowResolveIntent = (typeof workflowResolveIntents)[number];

export type WorkflowResolveStatus = "resolved" | "not-found" | "ambiguous";

export interface WorkflowLocator {
  readonly id: string;
  readonly scope: WorkflowScope;
  readonly name: string;
  readonly path: string;
  readonly displayPath: string;
  readonly editable: boolean;
  readonly sourceDir: string;
  readonly stepCount: number;
  readonly description?: string;
  readonly projectRoot?: string;
  readonly shadowedBy?: string;
  readonly shadows?: string;
}

export interface WorkflowScopeRoots {
  readonly cwd: string;
  readonly projectRoot: string;
  readonly projectWorkflowDirs: ReadonlyArray<string>;
  readonly globalWorkflowDir: string;
}

export interface WorkflowResolveRequest {
  readonly target?: string;
  readonly scope?: WorkflowResolveScope;
  readonly intent?: WorkflowResolveIntent;
  readonly cwd: string;
  readonly projectRoot?: string;
  readonly projectWorkflowDirs?: ReadonlyArray<string>;
  readonly globalWorkflowDir?: string;
}

export interface WorkflowDiscoveryResult {
  readonly roots: WorkflowScopeRoots;
  readonly project: ReadonlyArray<WorkflowLocator>;
  readonly global: ReadonlyArray<WorkflowLocator>;
  readonly all: ReadonlyArray<WorkflowLocator>;
  readonly diagnostics: ReadonlyArray<string>;
}

export interface WorkflowResolveResult {
  readonly status: WorkflowResolveStatus;
  readonly locator?: WorkflowLocator;
  readonly candidates: ReadonlyArray<WorkflowLocator>;
  readonly diagnostics: ReadonlyArray<string>;
}
