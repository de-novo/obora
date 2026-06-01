import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { WorkflowRunFileChange, WorkflowRunRepositoryChanges } from "@obora/sdk";

const execFileAsync = promisify(execFile);

export interface RepositorySnapshot {
  readonly root: string;
  readonly files: ReadonlyArray<WorkflowRunFileChange>;
}

const statusPath = (line: string): string => line.slice(3).trim();

const parseStatusLine = (line: string): WorkflowRunFileChange | undefined =>
  line.length >= 4
    ? {
        status: line.slice(0, 2).trim() || line.slice(0, 2),
        path: statusPath(line),
      }
    : undefined;

const parseStatus = (stdout: string): ReadonlyArray<WorkflowRunFileChange> =>
  stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(parseStatusLine)
    .filter((entry): entry is WorkflowRunFileChange => Boolean(entry));

const changeKey = (change: WorkflowRunFileChange): string => `${change.status}\u0000${change.path}`;

const statusLabel = (status: string): string =>
  status === "??"
    ? "untracked"
    : status.includes("A")
      ? "added"
      : status.includes("M")
        ? "modified"
        : status.includes("D")
          ? "deleted"
          : status.includes("R")
            ? "renamed"
            : status;

const summarizeRepositoryChanges = (
  files: ReadonlyArray<WorkflowRunFileChange>
): string =>
  files.length === 0
    ? "No repository file changes were detected for this run."
    : `${files.length} file${files.length === 1 ? "" : "s"} changed: ${files
        .map((file) => `${statusLabel(file.status)} ${file.path}`)
        .join(", ")}`;

export const captureRepositorySnapshot = async (
  cwd: string
): Promise<RepositorySnapshot | undefined> =>
  execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd })
    .then(({ stdout }) => stdout.trim())
    .then((root) =>
      root.length === 0
        ? undefined
        : execFileAsync("git", ["status", "--short", "--untracked-files=all"], {
            cwd: root,
          }).then(({ stdout }) => ({
            root,
            files: parseStatus(stdout),
          }))
    )
    .catch(() => undefined);

export const detectRepositoryChanges = async (
  cwd: string,
  before: RepositorySnapshot | undefined
): Promise<WorkflowRunRepositoryChanges | undefined> =>
  before
    ? captureRepositorySnapshot(cwd).then((after) => {
        const beforeKeys = new Set(before.files.map(changeKey));
        const files = (after?.files ?? []).filter((file) => !beforeKeys.has(changeKey(file)));
        return files.length > 0
          ? {
              root: after?.root ?? before.root,
              files,
              summary: summarizeRepositoryChanges(files),
            }
          : undefined;
      })
    : undefined;
