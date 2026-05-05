import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLIError } from "../../errors.js";
import { ensureSafeDir, safePathJoin, validatePath, validatePathComponent } from "../path-utils.js";

let tempDir: string;

describe("path utils", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-cli-path-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("validates paths inside the base directory", () => {
    expect(validatePath("nested/file.txt", tempDir)).toBe(join(tempDir, "nested/file.txt"));
    expect(validatePath(".", tempDir)).toBe(tempDir);
  });

  it("rejects traversal outside the base directory", () => {
    expect(() => validatePath("../outside.txt", tempDir)).toThrow(CLIError);
  });

  it("validates individual path components", () => {
    expect(() => validatePathComponent("feature-a")).not.toThrow();
    expect(() => validatePathComponent("../feature")).toThrow(CLIError);
    expect(() => validatePathComponent("feature/name")).toThrow(CLIError);
    expect(() => validatePathComponent(join(tempDir, "absolute"))).toThrow(CLIError);
  });

  it("joins paths only when the result remains inside the base directory", () => {
    expect(safePathJoin(tempDir, "a", "b")).toBe(join(tempDir, "a", "b"));
    expect(() => safePathJoin(tempDir, "..", "outside")).toThrow(CLIError);
  });

  it("creates safe directories recursively", () => {
    const created = ensureSafeDir(tempDir, "a/b");

    expect(created).toBe(join(tempDir, "a/b"));
    expect(existsSync(created)).toBe(true);
  });
});
