import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  captureRepositorySnapshot,
  detectRepositoryChanges,
} from "../repository-changes.js";

const execFileAsync = promisify(execFile);

describe("repository change snapshots", () => {
  it("captures files that appear after a workflow run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-repo-changes-"));
    await execFileAsync("git", ["init"], { cwd: dir });
    const before = await captureRepositorySnapshot(dir);

    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "generated.js"), "console.log('generated');\n", "utf8");

    const changes = await detectRepositoryChanges(dir, before);

    expect(changes).toMatchObject({
      root: await realpath(dir),
      files: [{ status: "??", path: "src/generated.js" }],
      summary: "1 file changed: untracked src/generated.js",
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
    expect(changes?.summary).toContain("added added.md");
    expect(changes?.summary).toContain("modified modified.md");
    expect(changes?.summary).toContain("deleted deleted.md");
    expect(changes?.summary).toContain("renamed renamed.md -> renamed-next.md");
  });
});
