export const runStatusFilterValues: ReadonlyArray<string> = [
  "queued",
  "running",
  "waiting",
  "suspended",
  "completed",
  "failed",
  "aborted",
];

export const isRunStatusFilter = (status: string | undefined): status is string =>
  typeof status === "string" && runStatusFilterValues.includes(status);

export const runStatusFilterUsage = (): string => runStatusFilterValues.join("|");
