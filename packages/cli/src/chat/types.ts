import type { WorkflowLocator, WorkflowResolveScope, WorkflowRunSummary } from "@obora/sdk";

import type { ChatSessionSummary } from "./store.js";

export type ChatMessageRole = "system" | "user" | "assistant";
export type ChatSessionStatus = "idle" | "resolving" | "ready" | "running" | "completed" | "failed";

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly createdAt: string;
  readonly workflowTarget?: string;
  readonly runTask?: string;
  readonly runWorkflowLocator?: WorkflowLocator;
  readonly runOptions?: ChatRunOptions;
  readonly runSummary?: WorkflowRunSummary;
}

export interface ChatRunOptions {
  readonly provider?: string;
  readonly model?: string;
  readonly config?: string;
  readonly agents?: string;
  readonly policy?: string;
  readonly timeout?: number;
}

export interface ChatRunChoice {
  readonly runSummary: WorkflowRunSummary;
  readonly sessionId?: string;
  readonly projectRoot?: string;
  readonly messageId?: string;
  readonly source?: string;
  readonly runTask?: string;
  readonly runWorkflowLocator?: WorkflowLocator;
  readonly runOptions?: ChatRunOptions;
}

export interface ChatSessionState {
  readonly sessionId: string;
  readonly status: ChatSessionStatus;
  readonly cwd: string;
  readonly projectRoot?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly dryRun: boolean;
  readonly providerName?: string;
  readonly modelName?: string;
  readonly workflowTarget?: string;
  readonly workflowLocator?: WorkflowLocator;
  readonly workflowChoices?: ReadonlyArray<WorkflowLocator>;
  readonly selectedWorkflowChoiceIndex?: number;
  readonly sessionChoices?: ReadonlyArray<ChatSessionSummary>;
  readonly selectedSessionChoiceIndex?: number;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly lastError?: string;
  readonly lastRunCommand?: string;
  readonly lastRunTask?: string;
  readonly lastRunProjectRoot?: string;
  readonly lastRunWorkflowLocator?: WorkflowLocator;
  readonly lastRunOptions?: ChatRunOptions;
  readonly lastRunSummary?: WorkflowRunSummary;
  readonly inspectedRunSummary?: WorkflowRunSummary;
  readonly runChoices?: ReadonlyArray<ChatRunChoice>;
  readonly selectedRunChoiceIndex?: number;
  readonly showHelpPanel?: boolean;
}

export interface ChatRunInput {
  readonly message: string;
  readonly sessionId: string;
  readonly workflowName: string;
  readonly workflowPath: string;
}

export interface ChatWorkflowResolveOptions {
  readonly target: string;
  readonly cwd: string;
  readonly scope?: WorkflowResolveScope;
  readonly projectRoot?: string;
  readonly globalWorkflowDir?: string;
}

export interface ChatCommandOptions {
  readonly workflow?: string;
  readonly once?: string;
  readonly listSessions?: boolean;
  readonly listRuns?: boolean;
  readonly showSession?: boolean;
  readonly showRun?: string;
  readonly groupSessions?: string;
  readonly filterTag?: string;
  readonly filterProject?: string;
  readonly filterRunStatus?: string;
  readonly tags?: string;
  readonly dryRun?: boolean;
  readonly scope?: string;
  readonly project?: string;
  readonly globalWorkflowsDir?: string;
  readonly session?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly config?: string;
  readonly agents?: string;
  readonly policy?: string;
  readonly timeout?: string;
}
