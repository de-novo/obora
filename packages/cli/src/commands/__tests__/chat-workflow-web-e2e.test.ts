import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WorkflowRunSummary } from "@obora/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialChatState } from "../../chat/state.js";
import { saveChatSessionState } from "../../chat/store.js";
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

interface ChatSessionJson {
  readonly sessionId?: string;
  readonly projectRoot?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly lastRunWorkflowName?: string;
}

interface ChatSessionGroupJson {
  readonly group?: string;
  readonly sessions?: ReadonlyArray<ChatSessionJson>;
}

interface ChatRunDetailJson {
  readonly sessionId?: string;
  readonly runTask?: string;
  readonly runWorkflowLocator?: {
    readonly name?: string;
    readonly displayPath?: string;
  };
  readonly runSummary?: WorkflowRunSummary;
}

const lastJsonOutput = (): ChatCommandJson =>
  JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? "{}")) as unknown as ChatCommandJson;

const lastJsonArrayOutput = <T>(): ReadonlyArray<T> =>
  JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? "[]")) as unknown as ReadonlyArray<T>;

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

  it("lists persisted chat sessions by project, tag, and grouped views", async () => {
    await withTempProject(async ({ root, globalDir }) => {
      const serviceRoot = join(root, "services", "api");
      const serviceWorkflowDir = join(serviceRoot, ".obora", "workflows");
      const serviceWorkflowPath = join(serviceWorkflowDir, "release-readiness.yaml");
      await mkdir(serviceWorkflowDir, { recursive: true });
      await writeNamedWorkflow(
        serviceWorkflowPath,
        "release-readiness",
        "Service release workflow"
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
          "release-session",
          "--tags",
          "release,ops",
          "--json",
        ],
        { from: "user" }
      );

      await createCLI().parseAsync(
        [
          "chat",
          "release-readiness",
          "--once",
          "review service",
          "--dry-run",
          "--scope",
          "project",
          "--project",
          serviceRoot,
          "--global-workflows-dir",
          globalDir,
          "--session",
          "service-session",
          "--tags",
          "review",
          "--json",
        ],
        { from: "user" }
      );

      await createCLI().parseAsync(["chat", "--list-sessions", "--filter-tag", "release", "--json"], {
        from: "user",
      });
      const releaseSessions = lastJsonArrayOutput<ChatSessionJson>();

      await createCLI().parseAsync(
        ["chat", "--list-sessions", "--filter-project", serviceRoot, "--json"],
        { from: "user" }
      );
      const serviceSessions = lastJsonArrayOutput<ChatSessionJson>();

      await createCLI().parseAsync(["chat", "--list-sessions", "--group-sessions", "project", "--json"], {
        from: "user",
      });
      const projectGroups = lastJsonArrayOutput<ChatSessionGroupJson>();

      await createCLI().parseAsync(["chat", "--list-sessions", "--group-sessions", "tag", "--json"], {
        from: "user",
      });
      const tagGroups = lastJsonArrayOutput<ChatSessionGroupJson>();

      await createCLI().parseAsync(["chat", "--list-sessions", "--group-sessions", "day", "--json"], {
        from: "user",
      });
      const dayGroups = lastJsonArrayOutput<ChatSessionGroupJson>();

      expect(releaseSessions.map((session) => session.sessionId)).toEqual(["release-session"]);
      expect(releaseSessions.at(0)?.tags).toEqual(["release", "ops"]);
      expect(serviceSessions.map((session) => session.sessionId)).toEqual(["service-session"]);
      expect(serviceSessions.at(0)?.projectRoot).toBe(serviceRoot);
      expect(projectGroups.map((group) => group.group).sort()).toEqual([root, serviceRoot].sort());
      expect(
        projectGroups.find((group) => group.group === serviceRoot)?.sessions?.map(
          (session) => session.sessionId
        )
      ).toEqual(["service-session"]);
      expect(tagGroups.map((group) => group.group).sort()).toEqual(["ops", "release", "review"]);
      expect(
        tagGroups.find((group) => group.group === "ops")?.sessions?.map(
          (session) => session.sessionId
        )
      ).toEqual(["release-session"]);
      expect(dayGroups).toHaveLength(1);
      expect(dayGroups.at(0)?.group).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(dayGroups.at(0)?.sessions?.map((session) => session.sessionId).sort()).toEqual([
        "release-session",
        "service-session",
      ]);
    });
  });

  it("lists and shows persisted chat run details with step metadata", async () => {
    await withTempProject(async ({ root, workflowPath }) => {
      const workflowLocator = {
        id: "project:release-readiness",
        scope: "project" as const,
        name: "release-readiness",
        path: workflowPath,
        displayPath: ".obora/workflows/release-readiness.yaml",
        editable: true,
        sourceDir: join(root, ".obora", "workflows"),
        stepCount: 2,
        projectRoot: root,
      };
      const runSummary: WorkflowRunSummary = {
        executionId: "exec-chat-e2e",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-25T09:00:00.000Z",
        endedAt: "2026-05-25T09:00:02.000Z",
        durationMs: 2000,
        completedStepCount: 2,
        totalStepCount: 2,
        message: "Workflow completed: 2/2 steps completed.",
        steps: [
          {
            name: "collect",
            status: "completed",
            agent: "developer",
            model: "openrouter/owl-alpha",
            outputPreview: "Collected repository context.",
            outputFormat: "text",
            toolsUsed: ["file_read"],
            artifacts: ["README.md"],
            task: "Collect context",
            methodology: "Standard agent execution",
            decisions: ["Use project workflow"],
            issues: [],
            dependencies: [],
          },
          {
            name: "decide",
            status: "completed",
            agent: "reviewer",
            model: "openrouter/owl-alpha",
            outputPreview: "Approved the release handoff.",
            outputFormat: "json",
            toolsUsed: ["shell"],
            artifacts: ["release.json"],
            task: "Decide readiness",
            methodology: "Policy check",
            decisions: ["Ready"],
            issues: [],
            dependencies: ["collect"],
          },
        ],
      };
      const baseState = createInitialChatState({
        sessionId: "run-session",
        cwd: root,
        projectRoot: root,
        tags: ["release"],
        dryRun: false,
        workflowTarget: "release-readiness",
      });
      await saveChatSessionState({
        cwd: root,
        state: {
          ...baseState,
          status: "ready",
          workflowLocator,
          lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
          lastRunTask: "ship release",
          lastRunWorkflowLocator: workflowLocator,
          lastRunSummary: runSummary,
          messages: [
            ...baseState.messages,
            {
              id: "user:run",
              role: "user",
              content: "ship release",
              createdAt: "2026-05-25T09:00:00.000Z",
            },
            {
              id: "assistant:run",
              role: "assistant",
              content: runSummary.message,
              createdAt: "2026-05-25T09:00:02.000Z",
              runSummary,
            },
          ],
        },
      });

      await createCLI().parseAsync(["chat", "--list-runs", "--session", "run-session", "--json"], {
        from: "user",
      });
      const runs = lastJsonArrayOutput<ChatRunDetailJson>();

      await createCLI().parseAsync(
        ["chat", "--show-run", "exec-chat-e2e", "--session", "run-session", "--json"],
        { from: "user" }
      );
      const detail = JSON.parse(
        String(vi.mocked(console.log).mock.calls.at(-1)?.[0] ?? "{}")
      ) as unknown as ChatRunDetailJson;

      expect(runs).toHaveLength(1);
      expect(runs.at(0)).toMatchObject({
        sessionId: "run-session",
        runTask: "ship release",
        runWorkflowLocator: {
          name: "release-readiness",
          displayPath: ".obora/workflows/release-readiness.yaml",
        },
        runSummary: {
          executionId: "exec-chat-e2e",
          workflowName: "release-readiness",
          completedStepCount: 2,
          totalStepCount: 2,
        },
      });
      expect(detail.runSummary?.steps.at(0)).toMatchObject({
        name: "collect",
        toolsUsed: ["file_read"],
        artifacts: ["README.md"],
        decisions: ["Use project workflow"],
      });
      expect(detail.runSummary?.steps.at(1)).toMatchObject({
        name: "decide",
        outputFormat: "json",
        dependencies: ["collect"],
      });
    });
  });
});
