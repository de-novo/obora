import { spawn } from "node:child_process";

import type { HookDefinition, WorkflowHooks } from "./workflow.js";

export const WORKFLOW_HOOK_LIFECYCLES = [
  "pre_step",
  "post_step",
  "pre_validation",
  "post_cycle",
] as const;

export type WorkflowHookLifecycle = (typeof WORKFLOW_HOOK_LIFECYCLES)[number];

export interface HookExecutionResult {
  lifecycle: WorkflowHookLifecycle;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  success: boolean;
  durationMs: number;
}

export function resolveWorkflowHook(
  workflowHooks: WorkflowHooks | undefined,
  stepHooks: WorkflowHooks | undefined,
  lifecycle: WorkflowHookLifecycle
): HookDefinition | undefined {
  return stepHooks?.[lifecycle] ?? workflowHooks?.[lifecycle];
}

export async function executeWorkflowHook(
  hook: HookDefinition,
  lifecycle: WorkflowHookLifecycle,
  options: { cwd?: string; signal?: AbortSignal } = {}
): Promise<HookExecutionResult> {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = Date.now();

  return await new Promise<HookExecutionResult>((resolve) => {
    const child = spawn(hook.shell, {
      cwd,
      env: process.env,
      shell: true,
      signal: options.signal,
    });

    let stdout = "";
    let stderr = "";
    let spawnError: Error | undefined;

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (exitCode, signal) => {
      const errorText = spawnError ? `${spawnError.message}${stderr ? `\n${stderr}` : ""}` : stderr;
      resolve({
        lifecycle,
        command: hook.shell,
        cwd,
        stdout,
        stderr: errorText,
        exitCode,
        signal,
        success: spawnError === undefined && exitCode === 0,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
