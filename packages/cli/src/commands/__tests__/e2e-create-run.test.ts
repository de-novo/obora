import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { runInit } from "../init.js";
import { runNew } from "../new.js";
import { runRun } from "../run.js";

const setAgentResolver = (_resolver?: unknown) => undefined;

describe.skip("CLI E2E: init -> new -> run", () => {
  let originalCwd: string;
  let workDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workDir = await mkdtemp(join(tmpdir(), "obora-e2e-"));
    process.chdir(workDir);

    process.env.OBORA_LLM_PROVIDER = "mock";
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    setAgentResolver(null);
    process.chdir(originalCwd);

    await rm(workDir, { recursive: true, force: true });

    delete process.env.OBORA_LLM_PROVIDER;
  });

  it(
    "creates project/feature and executes workflow without real API key",
    async () => {
      const featureName = "task-047-e2e";

      await runInit({ workflow: "simple" });
      expect(existsSync(join(workDir, ".obora", "config.yaml"))).toBe(true);
      expect(existsSync(join(workDir, ".obora", "workflows", "simple.yaml"))).toBe(true);

      await runNew(featureName, { workflow: "simple" });
      const featureDir = join(workDir, ".obora", "features", featureName);
      expect(existsSync(join(featureDir, "proposal.md"))).toBe(true);
      expect(existsSync(join(featureDir, "status.yaml"))).toBe(true);

      const e2eWorkflow = `name: simple
version: "1.0"
mode: auto
steps:
  - name: analyze
    agent: analyst
  - name: execute
    agent: executor
    depends_on:
      - analyze
  - name: verify
    agent: verifier
    depends_on:
      - execute
`;
      await writeFile(join(workDir, ".obora", "workflows", "simple.yaml"), e2eWorkflow, "utf-8");

      await runRun(featureName, {});

      const statusYaml = readFileSync(join(featureDir, "status.yaml"), "utf-8");
      expect(statusYaml).toContain("status: completed");

      const outputDir = join(featureDir, ".obora", "outputs");
      expect(existsSync(outputDir)).toBe(true);
      expect(existsSync(join(outputDir, "analyze.md"))).toBe(true);
      expect(existsSync(join(outputDir, "execute.md"))).toBe(true);
      expect(existsSync(join(outputDir, "verify.md"))).toBe(true);

      expect(existsSync(join(featureDir, ".obora", "obora.db"))).toBe(true);
    },
    20_000
  );
});
