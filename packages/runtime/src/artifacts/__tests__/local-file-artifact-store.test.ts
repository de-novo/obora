import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalFileArtifactStore } from "../local-file-artifact-store.js";

describe("LocalFileArtifactStore", () => {
  const tempDirs: string[] = [];

  async function createBasePath(): Promise<string> {
    const basePath = await mkdtemp(join(tmpdir(), "obora-artifacts-"));
    tempDirs.push(basePath);
    return basePath;
  }

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("rejects path traversal segments", async () => {
    const basePath = await createBasePath();
    const store = new LocalFileArtifactStore({ basePath });

    await expect(
      store.save("run-1", "../evil", "out.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
    await expect(store.save("", "step-a", "out.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid artifact runId",
    );
    await expect(store.save("run.1", "step-a", "out.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid artifact runId: dots are not allowed",
    );
    await expect(store.save("run-1", "step/a", "out.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid artifact stepName: path separators are not allowed",
    );
    await expect(store.save("run-1", "step-a", "../out.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid artifact name: path separators are not allowed",
    );
    await expect(store.save("run-1", "step-a", "bad..txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      "Invalid artifact name",
    );
  });

  it("saves, gets, lists, and deletes artifact blobs", async () => {
    const basePath = await createBasePath();
    const store = new LocalFileArtifactStore({ basePath });

    const saved = await store.save("run-1", "step-a", "output.json", Buffer.from('{"ok":true}'), "application/json");
    expect(saved.path).toContain("run-1");
    const second = await store.save("run-1", "step-b", "notes.txt", Buffer.from("notes"), "text/plain");

    const listed = await store.list("run-1", "step-a");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);
    expect(await store.list("run-1")).toEqual([saved, second]);
    expect(await store.list("missing-run")).toEqual([]);

    const loaded = await store.get(saved.id);
    expect(loaded.record.name).toBe("output.json");
    expect(loaded.data.toString("utf-8")).toBe('{"ok":true}');
    await expect(store.get("missing-artifact")).rejects.toThrow("Artifact not found: missing-artifact");

    await store.delete("missing-artifact");

    await store.delete(saved.id);
    const afterDelete = await store.list("run-1", "step-a");
    expect(afterDelete).toEqual([]);
  });

  it("ignores missing base paths and corrupted metadata while preserving valid records", async () => {
    const basePath = await createBasePath();
    const store = new LocalFileArtifactStore({ basePath });

    expect(await new LocalFileArtifactStore({ basePath: join(basePath, "missing") }).list("run-1")).toEqual([]);

    const saved = await store.save("run-1", "step-a", "output.txt", Buffer.from("ok"), "text/plain");
    const corruptDir = join(basePath, "run-1", "step-a");
    await mkdir(corruptDir, { recursive: true });
    await writeFile(join(corruptDir, "corrupt.meta.json"), "{not-json", "utf-8");

    expect(await store.list("run-1", "step-a")).toEqual([saved]);
  });
});
