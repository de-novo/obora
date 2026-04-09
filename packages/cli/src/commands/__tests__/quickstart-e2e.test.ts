import { mkdtemp, readFile } from "node:fs/promises";
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

});
