import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveChatWorkflow } from "../../chat/workflow.js";
import { createCLI } from "../../cli.js";
import { startWorkflowWebBridge } from "../../workflow-web/server.js";

const writeWorkflow = (path: string): Promise<void> =>
  writeFile(
    path,
    [
      "name: release-readiness",
      "version: '1.0'",
      "steps:",
      "  - name: start",
      "    agent: worker",
      "",
    ].join("\n"),
    "utf-8"
  );

const writeNamedWorkflow = (path: string, name: string, description: string): Promise<void> =>
  writeFile(
    path,
    [
      `name: ${name}`,
      "version: '1.0'",
      `description: ${description}`,
      "steps:",
      "  - name: prepare",
      "    agent: worker",
      "  - name: decide",
      "    agent: reviewer",
      "",
    ].join("\n"),
    "utf-8"
  );

interface ChatCommandJson {
  readonly workflowLocator?: {
    readonly name?: string;
    readonly description?: string;
    readonly stepCount?: number;
  };
  readonly lastRunWorkflowLocator?: {
    readonly name?: string;
    readonly description?: string;
    readonly stepCount?: number;
  };
  readonly lastRunTask?: string;
  readonly lastRunCommand?: string;
  readonly messages?: ReadonlyArray<{ readonly content?: string }>;
}

const lastJsonOutput = (): ChatCommandJson =>
  JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? "{}")) as unknown as ChatCommandJson;

const withTempProject = async (
  testFn: (input: {
    readonly root: string;
    readonly globalDir: string;
    readonly workflowPath: string;
  }) => Promise<void>
): Promise<void> => {
  const originalCwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "obora-chat-web-command-"));
  const workflowDir = join(root, ".obora", "workflows");
  const globalDir = join(root, "global-workflows");
  const workflowPath = join(workflowDir, "release-readiness.yaml");

  try {
    await mkdir(workflowDir, { recursive: true });
    await mkdir(globalDir, { recursive: true });
    await writeWorkflow(workflowPath);
    process.chdir(root);
    await testFn({ root, globalDir, workflowPath });
  } finally {
    process.chdir(originalCwd);
    await rm(root, { recursive: true, force: true });
  }
};

beforeEach(() => {
  process.exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("chat command with workflow web saves", () => {
  it("runs a dry-run chat task against a workflow saved by the web bridge", async () => {
    await withTempProject(async ({ root, globalDir, workflowPath }) => {
      const locator = await resolveChatWorkflow({
        target: "release-readiness",
        cwd: root,
        projectRoot: root,
        globalWorkflowDir: globalDir,
        scope: "project",
      });
      const bridge = await startWorkflowWebBridge({
        locator,
        mode: "build",
        open: false,
        resolveRequest: {
          cwd: root,
          projectRoot: root,
          globalWorkflowDir: globalDir,
          scope: "all",
        },
      });

      try {
        const detailPayload = await fetch(
          `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent(locator.id)}?token=${bridge.token}`
        ).then((response) => response.json());
        const saveResponse = await fetch(
          `${bridge.apiBaseUrl}/api/workflows/${encodeURIComponent(locator.id)}?token=${bridge.token}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              revision: detailPayload.revision,
              yaml: [
                "name: release-readiness",
                "version: '1.0'",
                "description: CLI chat uses web saved workflow",
                "steps:",
                "  - name: prepare",
                "    agent: worker",
                "  - name: decide",
                "    agent: reviewer",
                "",
              ].join("\n"),
            }),
          }
        );

        await createCLI().parseAsync(
          [
            "chat",
            "release-readiness",
            "--once",
            "check readiness",
            "--dry-run",
            "--scope",
            "project",
            "--project",
            root,
            "--global-workflows-dir",
            globalDir,
            "--json",
          ],
          { from: "user" }
        );

        const jsonOutput = String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? "");

        expect(saveResponse.status).toBe(200);
        expect(process.exitCode).toBe(0);
        expect(jsonOutput).toContain('"content": "Dry-run completed.');
        expect(jsonOutput).toContain('"description": "CLI chat uses web saved workflow"');
        expect(jsonOutput).toContain('"stepCount": 2');
        expect(jsonOutput).toContain(`"path": "${workflowPath}`);
        expect(jsonOutput).toContain('"lastRunTask": "check readiness"');
        expect(jsonOutput).toContain('"lastRunCommand": "obora run .obora/workflows/release-readiness.yaml"');
      } finally {
        await bridge.close();
      }
    });
  });

  it("persists workflow switching across multiple chat commands in one session", async () => {
    await withTempProject(async ({ root, globalDir }) => {
      const codeReviewPath = join(root, ".obora", "workflows", "code-review.yaml");
      await writeNamedWorkflow(
        codeReviewPath,
        "code-review",
        "Review repository changes from the switched workflow"
      );

      await createCLI().parseAsync(
        [
          "chat",
          "release-readiness",
          "--once",
          "prepare release",
          "--dry-run",
          "--scope",
          "project",
          "--project",
          root,
          "--global-workflows-dir",
          globalDir,
          "--session",
          "switch-session",
          "--json",
        ],
        { from: "user" }
      );
      const releaseRun = lastJsonOutput();

      await createCLI().parseAsync(
        [
          "chat",
          "--once",
          "/workflow code-review",
          "--dry-run",
          "--scope",
          "project",
          "--project",
          root,
          "--global-workflows-dir",
          globalDir,
          "--session",
          "switch-session",
          "--json",
        ],
        { from: "user" }
      );
      const switched = lastJsonOutput();

      await createCLI().parseAsync(
        [
          "chat",
          "--once",
          "review changes",
          "--dry-run",
          "--scope",
          "project",
          "--project",
          root,
          "--global-workflows-dir",
          globalDir,
          "--session",
          "switch-session",
          "--json",
        ],
        { from: "user" }
      );
      const reviewRun = lastJsonOutput();

      await createCLI().parseAsync(["chat", "--show-session", "--session", "switch-session", "--json"], {
        from: "user",
      });
      const persisted = lastJsonOutput();

      expect(releaseRun.workflowLocator).toMatchObject({
        name: "release-readiness",
        stepCount: 1,
      });
      expect(releaseRun.lastRunTask).toBe("prepare release");
      expect(switched.workflowLocator).toMatchObject({
        name: "code-review",
        description: "Review repository changes from the switched workflow",
        stepCount: 2,
      });
      expect(switched.messages?.at(-1)?.content).toContain("Selected workflow code-review");
      expect(reviewRun.workflowLocator?.name).toBe("code-review");
      expect(reviewRun.lastRunWorkflowLocator).toMatchObject({
        name: "code-review",
        stepCount: 2,
      });
      expect(reviewRun.lastRunTask).toBe("review changes");
      expect(reviewRun.lastRunCommand).toBe("obora run .obora/workflows/code-review.yaml");
      expect(reviewRun.messages?.at(-1)?.content).toContain("Dry-run completed.");
      expect(persisted.workflowLocator?.name).toBe("code-review");
      expect(persisted.lastRunWorkflowLocator?.name).toBe("code-review");
      expect(persisted.lastRunTask).toBe("review changes");
    });
  });
});
