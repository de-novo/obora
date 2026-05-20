import { resolveWorkflowTarget, type WorkflowLocator, type WorkflowResolveScope } from "@obora/sdk";
import { resolve } from "node:path";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import type { ChatRunInput, ChatWorkflowResolveOptions } from "./types.js";

export const parseChatWorkflowScope = (
  scope: string | undefined
): WorkflowResolveScope | undefined => {
  if (!scope) return undefined;
  if (scope === "project" || scope === "global" || scope === "all") return scope;
  throw new CLIError(
    `Invalid workflow scope: ${scope}. Expected project, global, or all.`,
    ExitCode.VALIDATION_ERROR
  );
};

export const parseChatTimeout = (timeout: string | undefined): number | undefined => {
  if (!timeout) return undefined;
  const parsed = Number(timeout);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new CLIError(`Invalid chat execution timeout: ${timeout}`, ExitCode.VALIDATION_ERROR);
};

export const resolveChatWorkflow = async ({
  target,
  cwd,
  scope,
  projectRoot,
  globalWorkflowDir,
}: ChatWorkflowResolveOptions): Promise<WorkflowLocator> => {
  const result = await resolveWorkflowTarget({
    target,
    intent: "run",
    cwd,
    scope,
    ...(projectRoot ? { projectRoot: resolve(projectRoot) } : {}),
    ...(globalWorkflowDir ? { globalWorkflowDir: resolve(globalWorkflowDir) } : {}),
  });

  if (result.status !== "resolved" || !result.locator) {
    throw new CLIError(
      result.diagnostics.join("\n") || `Workflow not found: ${target}`,
      ExitCode.VALIDATION_ERROR
    );
  }

  return result.locator;
};

export const createChatRunInput = ({
  message,
  sessionId,
  workflowName,
  workflowPath,
}: ChatRunInput): string =>
  JSON.stringify({
    message,
    sessionId,
    workflow: {
      name: workflowName,
      path: workflowPath,
    },
  });
