import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const toCount = (value: string | undefined): number | undefined =>
  value && /^\d+$/u.test(value) ? Number.parseInt(value, 10) : undefined;

const parseNumstatLine = (
  line: string
): readonly [string, Pick<WorkflowRunFileChange, "additions" | "deletions">] | undefined => {
  const [additions, deletions, ...pathParts] = line.split("\t");
  const path = pathParts.join("\t").trim();
  return path
    ? [
        path,
        {
          ...(toCount(additions) !== undefined ? { additions: toCount(additions) } : {}),
          ...(toCount(deletions) !== undefined ? { deletions: toCount(deletions) } : {}),
        },
      ]
    : undefined;
};

const parseNumstat = (
  stdout: string
): ReadonlyArray<readonly [string, Pick<WorkflowRunFileChange, "additions" | "deletions">]> =>
  stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(parseNumstatLine)
    .filter(
      (
        entry
      ): entry is readonly [
        string,
        Pick<WorkflowRunFileChange, "additions" | "deletions">,
      ] => Boolean(entry)
    );

const mergeNumstats = (
  entries: ReadonlyArray<readonly [string, Pick<WorkflowRunFileChange, "additions" | "deletions">]>
): ReadonlyMap<string, Pick<WorkflowRunFileChange, "additions" | "deletions">> =>
  new Map(
    Array.from(new Set(entries.map(([path]) => path))).map((path) => {
      const stats = entries
        .filter(([entryPath]) => entryPath === path)
        .reduce(
          (acc, [, entry]) => ({
            additions: acc.additions + (entry.additions ?? 0),
            deletions: acc.deletions + (entry.deletions ?? 0),
          }),
          { additions: 0, deletions: 0 }
        );
      return [
        path,
        {
          ...(stats.additions > 0 ? { additions: stats.additions } : {}),
          ...(stats.deletions > 0 ? { deletions: stats.deletions } : {}),
        },
      ] as const;
    })
  );

const captureNumstat = (root: string): Promise<ReadonlyMap<string, Pick<WorkflowRunFileChange, "additions" | "deletions">>> =>
  Promise.all([
    execFileAsync("git", ["diff", "--numstat"], { cwd: root }).then(({ stdout }) => parseNumstat(stdout)),
    execFileAsync("git", ["diff", "--cached", "--numstat"], { cwd: root }).then(({ stdout }) => parseNumstat(stdout)),
  ])
    .then((entries) => mergeNumstats(entries.flat()))
    .catch(() => new Map());

const textLineCount = (value: string): number =>
  value.length === 0 ? 0 : value.split(/\r\n|\r|\n/u).length - (value.endsWith("\n") ? 1 : 0);

const untrackedFileStats = (
  root: string,
  change: WorkflowRunFileChange
): Promise<Pick<WorkflowRunFileChange, "additions" | "deletions">> =>
  change.status === "??"
    ? readFile(join(root, change.path), "utf8")
        .then((content) => ({ additions: textLineCount(content) }))
        .catch(() => ({}))
    : Promise.resolve({});

const attachStats = async (
  root: string,
  files: ReadonlyArray<WorkflowRunFileChange>
): Promise<ReadonlyArray<WorkflowRunFileChange>> =>
  captureNumstat(root).then((numstat) =>
    Promise.all(
      files.map((file) =>
        untrackedFileStats(root, file).then((untrackedStats) => ({
          ...file,
          ...(numstat.get(file.path) ?? {}),
          ...untrackedStats,
        }))
      )
    )
  );

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

export const summarizeRepositoryChanges = (
  files: ReadonlyArray<WorkflowRunFileChange>
): string =>
  files.length === 0
    ? "No repository file changes were detected for this run."
    : `${files.length} file${files.length === 1 ? "" : "s"} changed: ${files
        .map((file) => `${statusLabel(file.status)} ${file.path}${formatStat(file)}`)
        .join(", ")}`;

const formatStat = (file: WorkflowRunFileChange): string =>
  file.additions !== undefined || file.deletions !== undefined
    ? ` (+${file.additions ?? 0}/-${file.deletions ?? 0})`
    : "";

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
        const root = after?.root ?? before.root;
        return files.length > 0
          ? attachStats(root, files).then((filesWithStats) => ({
              root,
              files: filesWithStats,
              summary: summarizeRepositoryChanges(filesWithStats),
            }))
          : undefined;
      })
    : undefined;
