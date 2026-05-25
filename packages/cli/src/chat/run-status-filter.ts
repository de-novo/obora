import type { RunStatus } from "@obora/sdk";

export const runStatusFilterValues = [
  "queued",
  "running",
  "waiting",
  "suspended",
  "completed",
  "failed",
  "aborted",
] as const satisfies ReadonlyArray<RunStatus>;

export const isRunStatusFilter = (status: string | undefined): status is RunStatus =>
  typeof status === "string" && (runStatusFilterValues as ReadonlyArray<string>).includes(status);

export const runStatusFilterUsage = (): string => runStatusFilterValues.join("|");
