import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCLI } from "../../cli.js";

describe("CLI quickstart integration", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  let workDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "obora-quickstart-e2e-"));
    process.chdir(workDir);
    process.exitCode = undefined;

    delete process.env.OPENAI_API_KEY;
    delete process.env.OBORA_LLM_PROVIDER;
    delete process.env.OBORA_LLM_MODEL;
    delete process.env.OBORA_LLM_API_KEY;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    process.exitCode = undefined;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function lastJsonCall(): Record<string, unknown> {
    const call = logSpy.mock.calls.at(-1);
    expect(call).toBeDefined();
    return JSON.parse(String(call?.[0] ?? "{}")) as Record<string, unknown>;
  }

  it("supports init -> doctor -> dry-run quickstart flow", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "demo");

    await cli.parseAsync(["--json", "init", projectDir, "--quickstart"], { from: "user" });

    const initPayload = lastJsonCall();
    expect(initPayload).toEqual(
      expect.objectContaining({
        initialized: true,
        template: "quickstart",
        path: projectDir,
      })
    );

    const judgeYaml = await readFile(join(projectDir, "judge.yaml"), "utf-8");
    expect(judgeYaml).toContain("name: quickstart-judge");

    process.chdir(projectDir);
    logSpy.mockClear();

    await cli.parseAsync(["--json", "doctor"], { from: "user" });

    const doctorPayload = lastJsonCall();
    expect(doctorPayload).toEqual(
      expect.objectContaining({
        checks: expect.objectContaining({
          projectConfig: true,
          projectConfigPath: expect.stringContaining(".obora/config.yaml"),
        }),
        status: expect.any(Object),
        recommendations: expect.any(Array),
        resolution: expect.objectContaining({
          configSource: expect.stringContaining(projectDir),
        }),
      })
    );

    logSpy.mockClear();

    await cli.parseAsync(["--json", "run", "judge.yaml", "--dry-run"], { from: "user" });

    const dryRunPayload = lastJsonCall();
    expect(dryRunPayload).toEqual(
      expect.objectContaining({
        workflow: "quickstart-judge",
        validated: true,
        elapsedMs: expect.any(Number),
        resolution: expect.objectContaining({
          provider: null,
          authSource: "none",
          modelSource: "none",
          chosenByPrecedence: "none",
          fallbackStub: true,
          nextPlaceToEdit: expect.stringContaining(".obora/config.yaml"),
        }),
        bindingPreview: expect.arrayContaining([
          expect.objectContaining({
            stepName: "judge",
            bindingName: "input",
            path: "artifacts/submission.json",
            kind: "json",
          }),
        ]),
        outputPreview: expect.arrayContaining([
          expect.objectContaining({
            stepName: "judge",
            path: "artifacts/result.json",
            schema: "artifacts/result.schema.json",
          }),
        ]),
      })
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("supports dedicated quickstart command as a shorter alias", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "alias-demo");

    await cli.parseAsync(["--json", "quickstart", projectDir], { from: "user" });

    const payload = lastJsonCall();
    expect(payload).toEqual(
      expect.objectContaining({
        initialized: true,
        template: "quickstart",
        path: projectDir,
      })
    );

    const judgeYaml = await readFile(join(projectDir, "judge.yaml"), "utf-8");
    expect(judgeYaml).toContain("name: quickstart-judge");
  });

  it("prints provider-aware next steps in quickstart stdout", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "stdout-demo");

    await cli.parseAsync(["quickstart", projectDir], { from: "user" });

    const stdout = logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
    expect(stdout).toContain("Obora project initialized. Path:");
    expect(stdout).toContain("Next steps:");
    expect(stdout).toContain(`cd ${projectDir}`);
    expect(stdout).toContain("This template defaults to openai");
    expect(stdout).toContain("export OPENAI_API_KEY=***");
    expect(stdout).toContain("obora doctor");
    expect(stdout).toContain("obora run judge.yaml --dry-run");
    expect(stdout).toContain("obora run judge.yaml");
  });

  it("tracks onboarding state transitions across auth, mismatch, and model setup", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "contract-demo");

    await cli.parseAsync(["--json", "quickstart", projectDir], { from: "user" });

    process.chdir(projectDir);

    logSpy.mockClear();
    await cli.parseAsync(["--json", "doctor"], { from: "user" });
    const noAuthPayload = lastJsonCall();
    expect(noAuthPayload).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({
          status: "needs_config",
          message: "Needs auth: no provider credential detected",
        }),
        auth: expect.objectContaining({
          configuredProvider: "openai",
          recommendedProvider: "openai",
          recommendedAuthEnvKey: "OPENAI_API_KEY",
        }),
      })
    );

    process.env.OPENAI_API_KEY = "test-openai-key";
    logSpy.mockClear();
    await cli.parseAsync(["--json", "doctor"], { from: "user" });
    const missingModelPayload = lastJsonCall();
    expect(missingModelPayload).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({
          status: "needs_config",
          message: "Needs model: provider auth detected but no model is resolved",
        }),
        recommendations: expect.arrayContaining([
          "Set a default model in .obora/config.yaml or export OPENAI_MODEL=***",
        ]),
      })
    );

    const configPath = join(projectDir, ".obora", "config.yaml");
    const configRaw = await readFile(configPath, "utf-8");
    await writeFile(
      configPath,
      configRaw
        .replace("provider: openai", "provider: anthropic")
        .replace("openai: {}", "anthropic: {}"),
      "utf-8"
    );

    logSpy.mockClear();
    await cli.parseAsync(["--json", "doctor"], { from: "user" });
    const mismatchPayload = lastJsonCall();
    expect(mismatchPayload).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({
          configuredProvider: "anthropic",
          resolvedProvider: "openai",
          providerMismatchWarning:
            "Configured provider 'anthropic' differs from detected env auth providers: openai",
          resolvedModelEnvExample: "export OPENAI_MODEL=gpt-4o-mini",
        }),
        recommendations: expect.arrayContaining([
          "Resolved provider does not match configured provider. Either export ANTHROPIC_API_KEY=*** or switch defaults.provider to openai",
          "Resolved provider model env example: export OPENAI_MODEL=gpt-4o-mini",
        ]),
      })
    );

    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.ANTHROPIC_MODEL = "claude-3-7-sonnet-latest";
    delete process.env.OPENAI_API_KEY;

    logSpy.mockClear();
    await cli.parseAsync(["--json", "doctor"], { from: "user" });
    const readyPayload = lastJsonCall();
    expect(readyPayload).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({
          status: "ready",
          message: "Ready: anthropic/claude-3-7-sonnet-latest",
        }),
      })
    );

    logSpy.mockClear();
    await cli.parseAsync(["--json", "run", "judge.yaml", "--dry-run"], { from: "user" });
    const dryRunPayload = lastJsonCall();
    expect(dryRunPayload).toEqual(
      expect.objectContaining({
        workflow: "quickstart-judge",
        validated: true,
        resolution: expect.objectContaining({
          provider: "anthropic",
          model: "claude-3-7-sonnet-latest",
          authSource: "env(ANTHROPIC_API_KEY)",
          modelSource: "env(ANTHROPIC_MODEL)",
          chosenByPrecedence: "env > config",
        }),
        bindingPreview: expect.arrayContaining([
          expect.objectContaining({
            stepName: "judge",
            bindingName: "input",
            path: "artifacts/submission.json",
            kind: "json",
          }),
        ]),
        outputPreview: expect.arrayContaining([
          expect.objectContaining({
            stepName: "judge",
            path: "artifacts/result.json",
            schema: "artifacts/result.schema.json",
          }),
        ]),
      })
    );
  });

  it("prints configured and resolved provider context in doctor stdout for mismatch", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "doctor-stdout-demo");

    await cli.parseAsync(["quickstart", projectDir], { from: "user" });

    process.chdir(projectDir);
    process.env.OPENAI_API_KEY = "test-openai-key";

    const configPath = join(projectDir, ".obora", "config.yaml");
    const configRaw = await readFile(configPath, "utf-8");
    await writeFile(
      configPath,
      configRaw
        .replace("provider: openai", "provider: anthropic")
        .replace("openai: {}", "anthropic: {}"),
      "utf-8"
    );

    logSpy.mockClear();
    errorSpy.mockClear();

    await cli.parseAsync(["doctor"], { from: "user" });

    const stdout = logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");
    const stderr = errorSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");

    expect(stdout).toContain("Status");
    expect(stdout).toContain("Configuration");
    expect(stdout).toContain("Resolution");
    expect(stdout).toContain("Configured provider: anthropic");
    expect(stdout).toContain("Resolved provider: openai");
    expect(stdout).toContain(
      "Resolved provider model env example: export OPENAI_MODEL=gpt-4o-mini"
    );
    expect(stderr).toContain(
      "Configured provider 'anthropic' differs from detected env auth providers: openai"
    );
  });

  it("prints configured and resolved model context in doctor stdout", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "doctor-model-stdout-demo");

    await cli.parseAsync(["quickstart", projectDir], { from: "user" });

    process.chdir(projectDir);
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    logSpy.mockClear();
    errorSpy.mockClear();

    await cli.parseAsync(["doctor"], { from: "user" });

    const stdout = logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");

    expect(stdout).toContain("Configured provider: openai");
    expect(stdout).toContain("Configured model: gpt-4o-mini");
    expect(stdout).toContain("Resolved provider: openai");
    expect(stdout).toContain("Resolved model: gpt-4o-mini");
    expect(stdout).toContain("Model source: env(OPENAI_MODEL)");
  });

  it("shows env source precedence in run dry-run preview", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "run-preview-demo");

    await cli.parseAsync(["quickstart", projectDir], { from: "user" });

    process.chdir(projectDir);
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    logSpy.mockClear();
    errorSpy.mockClear();

    await cli.parseAsync(["run", "judge.yaml", "--dry-run"], { from: "user" });

    const stdout = logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");

    expect(stdout).toContain("- auth source: env(OPENAI_API_KEY)");
    expect(stdout).toContain("- model source: env(OPENAI_MODEL)");
    expect(stdout).toContain("- chosen by precedence: env > config");
  });

  it("prints binding and output previews for quickstart one-file judge dry-runs", async () => {
    const cli = createCLI();
    const projectDir = join(workDir, "run-preview-contract-demo");

    await cli.parseAsync(["quickstart", projectDir], { from: "user" });

    process.chdir(projectDir);

    logSpy.mockClear();
    errorSpy.mockClear();

    await cli.parseAsync(["run", "judge.yaml", "--dry-run"], { from: "user" });

    const stdout = logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n");

    expect(stdout).toContain("Binding Preview");
    expect(stdout).toContain("judge.input: json <- artifacts/submission.json [resolved]");
    expect(stdout).toContain("judge.schema: schema <- artifacts/submission.schema.json [resolved]");
    expect(stdout).toContain("Output Preview");
    expect(stdout).toContain("path <- artifacts/result.json [pending]");
    expect(stdout).toContain("schema <- artifacts/result.schema.json [resolved]");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
