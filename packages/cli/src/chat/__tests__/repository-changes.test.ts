import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  captureRepositorySnapshot,
  detectRepositoryChanges,
  summarizeRepositoryChanges,
} from "../repository-changes.js";

const execFileAsync = promisify(execFile);

describe("repository change snapshots", () => {
  it("summarizes empty and fallback repository statuses", () => {
    expect(summarizeRepositoryChanges([])).toBe(
      "No repository file changes were detected for this run."
    );
    expect(
      summarizeRepositoryChanges([
        { status: "UU", path: "conflict.txt" },
        { status: "M", path: "partial.txt", deletions: 2 },
      ])
    ).toBe("2 files changed: UU conflict.txt, modified partial.txt (+0/-2)");
  });

  it("returns no snapshot or changes outside a git repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-missing-"));

    await expect(captureRepositorySnapshot(dir)).resolves.toBeUndefined();
    await expect(detectRepositoryChanges(dir, undefined)).resolves.toBeUndefined();
  });

  it("captures files that appear after a workflow run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-changes-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    const before = await captureRepositorySnapshot(dir);

    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "generated.js"), "console.log('generated');\n", "utf8");

    const changes = await detectRepositoryChanges(dir, before);

    expect(changes).toMatchObject({
      root: await realpath(dir),
      files: [{ status: "??", path: "src/generated.js", additions: 1 }],
      summary: "1 file changed: untracked src/generated.js (+1/-0)",
    });
  });

  it("ignores dirty files that were already present before a workflow run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-existing-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    await writeFile(join(dir, "existing.md"), "already dirty\n", "utf8");
    const before = await captureRepositorySnapshot(dir);

    const changes = await detectRepositoryChanges(dir, before);

    expect(changes).toBeUndefined();
  });

  it("captures empty untracked files with zero additions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-empty-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    const before = await captureRepositorySnapshot(dir);

    await writeFile(join(dir, "empty.txt"), "", "utf8");

    const changes = await detectRepositoryChanges(dir, before);

    expect(changes).toMatchObject({
      files: [{ status: "??", path: "empty.txt", additions: 0 }],
      summary: "1 file changed: untracked empty.txt (+0/-0)",
    });
  });

  it("keeps untracked files when line counts cannot be read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-unreadable-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    const before = await captureRepositorySnapshot(dir);

    await symlink("missing-target.txt", join(dir, "broken-link"));

    const changes = await detectRepositoryChanges(dir, before);

    expect(changes).toMatchObject({
      files: [{ status: "??", path: "broken-link" }],
      summary: "1 file changed: untracked broken-link",
    });
    expect(changes?.files[0]).not.toHaveProperty("additions");
  });

  it("summarizes tracked added, modified, deleted, and renamed files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-statuses-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    await execFileAsync("git", ["config", "user.name", "Obora Test"], { cwd: dir });
    await writeFile(join(dir, "modified.md"), "before\n", "utf8");
    await writeFile(join(dir, "deleted.md"), "before\n", "utf8");
    await writeFile(join(dir, "renamed.md"), "before\n", "utf8");
    await execFileAsync("git", ["add", "."], { cwd: dir });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: dir });
    const before = await captureRepositorySnapshot(dir);

    await writeFile(join(dir, "modified.md"), "after\n", "utf8");
    await writeFile(join(dir, "added.md"), "after\n", "utf8");
    await rm(join(dir, "deleted.md"));
    await execFileAsync("git", ["mv", "renamed.md", "renamed-next.md"], { cwd: dir });
    await execFileAsync("git", ["add", "added.md"], { cwd: dir });

    const changes = await detectRepositoryChanges(dir, before);
    const files = changes?.files.map((file) => `${file.status} ${file.path}`);

    expect(files).toEqual(
      expect.arrayContaining([
        "A added.md",
        "D deleted.md",
        "M modified.md",
        "R renamed.md -> renamed-next.md",
      ])
    );
    expect(changes?.summary).toContain("4 files changed:");
    expect(changes?.summary).toContain("added added.md (+1/-0)");
    expect(changes?.summary).toContain("modified modified.md (+1/-1)");
    expect(changes?.summary).toContain("deleted deleted.md (+0/-1)");
    expect(changes?.summary).toContain("renamed renamed.md -> renamed-next.md");
  });
});
