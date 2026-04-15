import { mkdtemp, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as oboraSdk from "@obora/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCLI } from "../../cli.js";
import { ExitCode } from "../../utils/exit-codes.js";
import { runInit } from "../init.js";
import { createPolicyCommand } from "../policy.js";
import { runRun } from "../run.js";

describe("M3 CLI command IA", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("creates CLI without errors", () => {
    const cli = createCLI();
    expect(cli).toBeDefined();
  });

  it("registers top-level commands", () => {
    const cli = createCLI();
    const names = cli.commands.map((command) => command.name());

    expect(names).toEqual(
      expect.arrayContaining([
        "run",
        "status",
        "validate",
        "test",
        "plugin",
        "audit",
        "policy",
        "dlq",
        "init",
        "quickstart",
        "judge",
        "models",
        "artifact",
        "resume",
        "inspect",
        "knowledge",
      ])
    );
  });

  it("has run command options", () => {
    const cli = createCLI();

    const run = cli.commands.find((command) => command.name() === "run");
    expect(run).toBeDefined();

    const optionNames = (run?.options ?? []).map((option) => option.long);
    expect(optionNames).toEqual(
      expect.arrayContaining([
        "--input",
        "--var",
        "--policy",
        "--agents",
        "--model",
        "--output-dir",
        "--dry-run",
        "--timeout",
      ])
    );
  });

  it("has plugin subcommands", () => {
    const cli = createCLI();
    const plugin = cli.commands.find((command) => command.name() === "plugin");
    const names = plugin?.commands.map((command) => command.name()) ?? [];

    expect(names).toEqual(expect.arrayContaining(["list", "install", "remove", "inspect"]));
  });

  it("has audit subcommands", () => {
    const cli = createCLI();
    const audit = cli.commands.find((command) => command.name() === "audit");
    const names = audit?.commands.map((command) => command.name()) ?? [];

    expect(names).toEqual(expect.arrayContaining(["query", "tail", "replay"]));
  });

  it("--json global option propagates to subcommands", async () => {
    const cli = createCLI();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await cli.parseAsync(["--json", "plugin", "list"], { from: "user" });

    expect(log).toHaveBeenCalled();
    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain('"command": "plugin list"');
    expect(output).toContain('"plugins"');
  });

  it("runRun executes workflow from YAML in dry-run mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-cli-run-"));
    const workflowPath = join(dir, "workflow.yaml");

    await writeFile(
      workflowPath,
      `name: temp-workflow\nversion: "1.0"\nsteps:\n  - name: greet\n    agent: default\n`
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runSpy = vi.spyOn(oboraSdk.OboraRuntime.prototype, "run");

    await runRun(workflowPath, { dryRun: true });

    expect(runSpy).not.toHaveBeenCalled();
    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain('✅ Workflow "temp-workflow" validated successfully.');
  });

  it("runRun detects OBORA_LLM_* env via SDK helper", async () => {
    const prevProvider = process.env.OBORA_LLM_PROVIDER;
    const prevApiKey = process.env.OBORA_LLM_API_KEY;
    const prevModel = process.env.OBORA_LLM_MODEL;
    process.env.OBORA_LLM_PROVIDER = "custom-provider";
    process.env.OBORA_LLM_API_KEY = "custom-key";
    process.env.OBORA_LLM_MODEL = "custom-model";

    const runSpy = vi.spyOn(oboraSdk.OboraRuntime.prototype, "run").mockResolvedValue({
      executionId: "test-exec",
      status: "completed",
      wait: async () => ({
        id: "test-exec",
        workflowName: "inline-workflow",
        status: "completed",
        input: undefined,
        startedAt: new Date(),
        endedAt: new Date(),
        stepOrder: [],
        completedSteps: [],
        stepRecords: {},
        outputs: {},
      }),
      cancel: async () => undefined,
    });

    const workflow = "inline-workflow";
    const runtimeDefineSpy = vi.spyOn(oboraSdk.OboraRuntime.prototype, "define");

    try {
      await runRun(workflow, {});
    } finally {
      if (prevProvider === undefined) delete process.env.OBORA_LLM_PROVIDER;
      else process.env.OBORA_LLM_PROVIDER = prevProvider;
      if (prevApiKey === undefined) delete process.env.OBORA_LLM_API_KEY;
      else process.env.OBORA_LLM_API_KEY = prevApiKey;
      if (prevModel === undefined) delete process.env.OBORA_LLM_MODEL;
      else process.env.OBORA_LLM_MODEL = prevModel;
    }

    expect(runtimeDefineSpy).not.toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalledWith(workflow, expect.any(Object));
  });

  it("policy validate handles valid and invalid YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-cli-policy-"));
    const validPolicyPath = join(dir, "policy.yaml");
    const invalidPath = join(dir, "invalid.yaml");

    await writeFile(validPolicyPath, `version: "1.0"\nrules: []\n`);
    await writeFile(invalidPath, `rules: not-an-array\n`);

    const command = createPolicyCommand();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await command.parseAsync(["validate", validPolicyPath], { from: "user" });
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
    const validOutput = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(validOutput).toContain(`✅ Policy "${validPolicyPath}" is valid.`);

    process.exitCode = undefined;
    await command.parseAsync(["validate", invalidPath], { from: "user" });
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("init creates project scaffold in current directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-cli-init-"));
    process.chdir(dir);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInit({});

    await access(join(dir, "workflows", "example.yaml"));
    await access(join(dir, "policies", "default.yaml"));
    await access(join(dir, "tests"));

    const config = await readFile(join(dir, "obora.config.yaml"), "utf-8");
    expect(config).toContain("workflows: ./workflows");
    const initOutput = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(initOutput).toContain("✅ Obora project initialized.");
  });
});
