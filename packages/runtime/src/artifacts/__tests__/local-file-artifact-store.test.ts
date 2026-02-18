import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalFileArtifactStore } from "../local-file-artifact-store.js";

describe("LocalFileArtifactStore", () => {
  it("rejects path traversal segments", async () => {
    const basePath = await mkdtemp(join(tmpdir(), "obora-artifacts-"));
    const store = new LocalFileArtifactStore({ basePath });

    await expect(
      store.save("run-1", "../evil", "out.txt", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow();
  });

  it("saves, gets, lists, and deletes artifact blobs", async () => {
    const basePath = await mkdtemp(join(tmpdir(), "obora-artifacts-"));
    const store = new LocalFileArtifactStore({ basePath });

    const saved = await store.save("run-1", "step-a", "output.json", Buffer.from('{"ok":true}'), "application/json");
    expect(saved.path).toContain("run-1");

    const listed = await store.list("run-1", "step-a");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);

    const loaded = await store.get(saved.id);
    expect(loaded.record.name).toBe("output.json");
    expect(loaded.data.toString("utf-8")).toBe('{"ok":true}');

    await store.delete(saved.id);
    const afterDelete = await store.list("run-1", "step-a");
    expect(afterDelete).toEqual([]);
  });
});
