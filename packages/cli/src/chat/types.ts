import type { WorkflowLocator, WorkflowResolveScope } from "@obora/sdk";

export type ChatMessageRole = "system" | "user" | "assistant";
export type ChatSessionStatus = "idle" | "resolving" | "ready" | "running" | "completed" | "failed";

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly createdAt: string;
}

export interface ChatSessionState {
  readonly sessionId: string;
  readonly status: ChatSessionStatus;
  readonly cwd: string;
  readonly dryRun: boolean;
  readonly workflowTarget?: string;
  readonly workflowLocator?: WorkflowLocator;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly lastError?: string;
  readonly lastRunCommand?: string;
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
