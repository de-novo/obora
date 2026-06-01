import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runChatSession } from "../../chat/session.js";
import {
  findChatRunDetail,
  groupChatSessionSummaries,
  listChatRunDetails,
  listChatSessionSummaries,
  loadChatSessionState,
} from "../../chat/store.js";
import { createCLI } from "../../cli.js";
import { createChatCommand } from "../chat.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../chat/session.js", () => ({
  runChatSession: vi.fn(),
}));

vi.mock("../../chat/store.js", () => ({
  findChatRunDetail: vi.fn(),
  groupChatSessionSummaries: vi.fn((sessions) => [{ group: "/repo", sessions }]),
  listChatRunDetails: vi.fn(),
  listChatSessionSummaries: vi.fn(),
  loadChatSessionState: vi.fn(),
}));

describe("chat command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("is registered as a top-level CLI command", () => {
    const names = createCLI().commands.map((command) => command.name());

    expect(names).toContain("chat");
  });

  it("starts a chat session with workflow argument and JSON output", async () => {
    vi.mocked(runChatSession).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: true,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(
      [
        "release-readiness",
        "--once",
        "ship it",
        "--dry-run",
        "--session",
        "session-a",
        "--scope",
        "project",
        "--json",
      ],
      { from: "user" }
    );

    expect(runChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: process.cwd(),
        commandOptions: expect.objectContaining({
          workflow: "release-readiness",
          once: "ship it",
          dryRun: true,
          session: "session-a",
          scope: "project",
        }),
      })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("lets --workflow override the positional workflow", async () => {
    vi.mocked(runChatSession).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "global-review",
      messages: [],
    });

    await createChatCommand().parseAsync(
      ["project-review", "--workflow", "global-review", "--once", "hello"],
      { from: "user" }
    );

    expect(runChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandOptions: expect.objectContaining({
          workflow: "global-review",
        }),
      })
    );
  });

  it("lists persisted chat sessions without starting the TUI", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        workflowTarget: "release-readiness",
        tags: ["release"],
        messageCount: 4,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(["--list-sessions", "--json"], { from: "user" });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("prints persisted chat sessions as a table without --json", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        projectRoot: "/repo/source-project",
        workflowTarget: "release-readiness",
        lastRunTask: "prepare release",
        lastRunWorkflowName: "release-readiness",
        tags: ["release"],
        messageCount: 2,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(["--list-sessions"], { from: "user" });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionId: "session-a",
        project: "/repo/source-project",
        workflow: "release-readiness",
        retry: "release-readiness",
        lastTask: "prepare release",
        tags: "release",
      }),
    ]);
  });

  it("groups and filters persisted chat sessions without starting the TUI", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        projectRoot: "/repo",
        tags: ["release"],
        messageCount: 4,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    vi.mocked(groupChatSessionSummaries).mockReturnValue([
      {
        group: "release",
        sessions: [
          {
            sessionId: "session-a",
            status: "ready",
            cwd: "/repo",
            projectRoot: "/repo",
            tags: ["release"],
            messageCount: 4,
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
    ]);

    await createChatCommand().parseAsync(
      ["--list-sessions", "--filter-tag", "release", "--group-sessions", "tag", "--json"],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), tag: "release" })
    );
    expect(groupChatSessionSummaries).toHaveBeenCalledWith(
      expect.any(Array),
      "tag",
      "release"
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"group": "release"'));
  });

  it("filters persisted chat sessions by project without starting the TUI", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        tags: [],
        messageCount: 4,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(
      ["--list-sessions", "--filter-project", "/repo/project-a", "--json"],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), projectRoot: "/repo/project-a" })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("filters persisted chat sessions by the current project alias", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      ["--list-sessions", "--filter-project", "current", "--json"],
      { from: "user" }
    );

    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), projectRoot: process.cwd() })
    );
  });

  it("uses --project as the persisted chat session store root", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      ["--list-sessions", "--project", "/repo/project-store", "--json"],
      { from: "user" }
    );

    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/project-store" })
    );
  });

  it("resolves the current project filter from the --project store root", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      [
        "--list-sessions",
        "--project",
        "/repo/project-store",
        "--filter-project",
        "current",
        "--json",
      ],
      { from: "user" }
    );

    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/project-store", projectRoot: "/repo/project-store" })
    );
  });

  it("fails clearly for invalid chat session grouping", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([]);

    await createChatCommand().parseAsync(["--list-sessions", "--group-sessions", "owner"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid session group: owner")
    );
  });

  it("shows a persisted chat session selected by --session", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      projectRoot: "/repo/source-project",
      dryRun: false,
      workflowTarget: "release-readiness",
      tags: ["release"],
      providerName: "openrouter",
      modelName: "openrouter/owl-alpha",
      lastRunTask: "prepare release",
      lastRunProjectRoot: "/repo/source-project",
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      },
      lastRunSummary: {
        executionId: "exec-session",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
        steps: [],
      },
      messages: [
        {
          id: "user:1",
          role: "user",
          content: "prepare release",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    });

    await createChatCommand().parseAsync(["--show-session", "--session", "session-a"], {
      from: "user",
    });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Session session-a"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Project: /repo/source-project")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Retry: release-readiness -> prepare release")
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Details: /details exec-session"));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('"sessionId"'));
  });

  it("prints persisted chat session JSON when requested", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(
      ["--show-session", "--session", "session-a", "--json"],
      {
        from: "user",
      }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("uses --project when showing a persisted chat session", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo/project-store",
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(
      ["--show-session", "--session", "session-a", "--project", "/repo/project-store", "--json"],
      { from: "user" }
    );

    expect(loadChatSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/project-store", sessionId: "session-a" })
    );
  });

  it("saves a persisted chat session export", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-session-export-"));
    const outputPath = join(dir, "exports", "session.md");
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: dir,
      projectRoot: dir,
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [
        {
          id: "user:1",
          role: "user",
          content: "prepare release",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      lastRunSummary: {
        executionId: "exec-session",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-session", "--session", "session-a", "--save-session", "exports/session.md"],
      { from: "user" }
    );

    await expect(readFile(outputPath, "utf-8")).resolves.toContain("# Chat Session Export");
    await expect(readFile(outputPath, "utf-8")).resolves.toContain("prepare release");
    expect(console.log).toHaveBeenCalledWith(`Saved chat session export: ${outputPath}`);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Session session-a"));
  });

  it("includes the saved session export path in JSON show-session output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-session-export-json-"));
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: dir,
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(
      [
        "--show-session",
        "--session",
        "session-a",
        "--project",
        dir,
        "--save-session",
        "exports/session.md",
        "--json",
      ],
      { from: "user" }
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"savedSessionPath"'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(join(dir, "exports", "session.md"))
    );
  });

  it("shows a persisted chat run selected by execution id", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: "/repo/source-project",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      workflowTarget: "release-readiness",
      runTask: "prepare release",
      runOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        timeout: 2500,
      },
      runWorkflowLocator: {
        id: "project:release-readiness",
        scope: "project",
        name: "release-readiness",
        path: "/repo/.obora/workflows/release-readiness.yaml",
        displayPath: ".obora/workflows/release-readiness.yaml",
        editable: true,
        sourceDir: "/repo/.obora/workflows",
        stepCount: 1,
        projectRoot: "/repo",
      },
      runSummary: {
        executionId: "exec-123",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        endedAt: "2026-05-24T00:00:01.000Z",
        durationMs: 1000,
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
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
            methodology: "Inspect persisted session",
            decisions: ["Use saved chat run"],
            issues: [],
            dependencies: [],
          },
        ],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-123", "--session", "session-a"],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(findChatRunDetail).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-123", sessionId: "session-a" })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Run exec-123"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Project: /repo/source-project")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Message: assistant:run at 2026-05-24T00:00:01.000Z")
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Task: prepare release"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Run options: provider openrouter · model openrouter/owl-alpha · config /repo/.obora/config.yaml · timeout 2500ms"
      )
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Workflow target: release-readiness")
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Retry: release-readiness"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Workflow locator: release-readiness (.obora/workflows/release-readiness.yaml)"
      )
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("tools: file_read"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("artifacts: README.md"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("decisions: Use saved chat run")
    );
  });

  it("saves a persisted chat run repository diff preview", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-diff-"));
    const outputPath = join(dir, "run.diff.md");
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: dir,
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runTask: "prepare release",
      runSummary: {
        executionId: "exec-diff",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        repositoryChanges: {
          root: dir,
          files: [
            {
              status: "M",
              path: "README.md",
              diffPreview: ["@@ -1 +1 @@", "-old", "+new"],
            },
          ],
          summary: "1 file changed: modified README.md",
        },
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-diff", "--session", "session-a", "--save-diff", "run.diff.md"],
      { from: "user" }
    );

    await expect(readFile(outputPath, "utf-8")).resolves.toContain("+new");
    expect(console.log).toHaveBeenCalledWith(
      `Saved repository diff preview: ${outputPath}`
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Run exec-diff"));
  });

  it("includes the saved diff path in JSON show-run output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-diff-json-"));
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: dir,
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-diff-json",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        repositoryChanges: {
          root: dir,
          files: [{ status: "M", path: "README.md", diffPreview: ["+json"] }],
          summary: "1 file changed: modified README.md",
        },
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-diff-json", "--save-diff", "audit/diff.md", "--json"],
      { from: "user" }
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"savedDiffPath"'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(join(dir, "audit", "diff.md"))
    );
  });

  it("saves a persisted chat run audit bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-audit-"));
    const outputPath = join(dir, "audit", "run.md");
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: dir,
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runTask: "prepare release",
      runSummary: {
        executionId: "exec-audit",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
        repositoryChanges: {
          root: dir,
          files: [{ status: "M", path: "README.md", diffPreview: ["+audit"] }],
          summary: "1 file changed: modified README.md",
        },
        steps: [
          {
            name: "collect",
            status: "completed",
            agent: "developer",
            model: "openrouter/owl-alpha",
            task: "Collect context",
            outputPreview: "Collected repository context.",
            outputFormat: "text",
            methodology: "Inspect persisted session",
            rationale: "The release needs audit context.",
            toolsUsed: ["file_read"],
            artifacts: ["README.md"],
            decisions: ["Use saved chat run"],
            dependencies: ["bootstrap"],
            issues: ["none"],
          },
        ],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-audit", "--save-audit", "audit/run.md"],
      { from: "user" }
    );

    await expect(readFile(outputPath, "utf-8")).resolves.toContain("# Chat Run Audit Bundle");
    await expect(readFile(outputPath, "utf-8")).resolves.toContain("- Tools: file_read");
    await expect(readFile(outputPath, "utf-8")).resolves.toContain("+audit");
    expect(console.log).toHaveBeenCalledWith(`Saved chat run audit bundle: ${outputPath}`);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Run exec-audit"));
  });

  it("includes the saved audit path in JSON show-run output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-audit-json-"));
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: dir,
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-audit-json",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-audit-json", "--save-audit", "audit/run.md", "--json"],
      { from: "user" }
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"savedAuditPath"'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(join(dir, "audit", "run.md"))
    );
  });

  it("includes saved diff and audit paths in JSON show-run output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-diff-audit-json-"));
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: dir,
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-diff-audit-json",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        repositoryChanges: {
          root: dir,
          files: [{ status: "M", path: "README.md", diffPreview: ["+both"] }],
          summary: "1 file changed: modified README.md",
        },
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      [
        "--show-run",
        "exec-diff-audit-json",
        "--save-diff",
        "audit/run.diff.md",
        "--save-audit",
        "audit/run.md",
        "--json",
      ],
      { from: "user" }
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"savedDiffPath"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"savedAuditPath"'));
  });

  it("uses --project when showing a persisted chat run", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-project",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-project", "--project", "/repo/project-store", "--json"],
      { from: "user" }
    );

    expect(findChatRunDetail).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/project-store", executionId: "exec-project" })
    );
  });

  it("saves a relative audit bundle path from the current directory without project metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-audit-cwd-"));
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-audit-cwd",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-audit-cwd", "--save-audit", "audit/run.md"],
      { from: "user" }
    );

    await expect(readFile(join(dir, "audit", "run.md"), "utf-8")).resolves.toContain(
      "Execution: exec-audit-cwd"
    );
    expect(cwdSpy).toHaveBeenCalled();
    cwdSpy.mockRestore();
  });

  it("saves a persisted chat run repository diff preview to an absolute path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-chat-show-run-diff-absolute-"));
    const outputPath = join(dir, "absolute.diff.md");
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-diff-absolute",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        repositoryChanges: {
          root: dir,
          files: [{ status: "A", path: "README.md", diffPreview: ["+absolute"] }],
          summary: "1 file changed: added README.md",
        },
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-diff-absolute", "--save-diff", outputPath],
      { from: "user" }
    );

    await expect(readFile(outputPath, "utf-8")).resolves.toContain("+absolute");
    expect(console.log).toHaveBeenCalledWith(
      `Saved repository diff preview: ${outputPath}`
    );
  });

  it("fails clearly when saving a show-run diff without repository changes", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-no-diff",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-no-diff", "--save-diff", "run.diff.md"],
      { from: "user" }
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Chat run has no repository changes to save: exec-no-diff")
    );
  });

  it("requires --show-run before saving a chat run diff", async () => {
    await createChatCommand().parseAsync(["--save-diff", "run.diff.md"], { from: "user" });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--save-diff requires --show-run <executionId>")
    );
  });

  it("requires --show-run before saving a chat run audit bundle", async () => {
    await createChatCommand().parseAsync(["--save-audit", "audit/run.md"], { from: "user" });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--save-audit requires --show-run <executionId>")
    );
  });

  it("requires --show-session before saving a chat session export", async () => {
    await createChatCommand().parseAsync(["--save-session", "exports/session.md"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--save-session requires --show-session --session <id>")
    );
  });

  it("prints persisted chat run details as JSON when requested", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-json",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(["--show-run", "exec-json", "--json"], {
      from: "user",
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"executionId": "exec-json"'));
  });

  it("shows retryable old run details without a workflow locator", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      projectRoot: "/repo/source-project",
      messageId: "assistant:old-run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runTask: "rerun old task",
      runSummary: {
        executionId: "exec-old",
        workflowName: "legacy-flow",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(["--show-run", "exec-old"], {
      from: "user",
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Task: rerun old task"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Retry: legacy-flow"));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Retry: not available"));
  });

  it("lists persisted chat runs without starting the TUI", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
    vi.mocked(listChatRunDetails).mockResolvedValue([
      {
        sessionId: "session-a",
        projectRoot: "/repo/source-project",
        messageId: "assistant:run",
        messageCreatedAt: "2026-05-24T00:00:01.000Z",
        workflowTarget: "release-readiness",
        runTask: "prepare release",
        runOptions: {
          provider: "openrouter",
          model: "openrouter/owl-alpha",
          config: "/repo/.obora/config.yaml",
          agents: "/repo/agents.yaml",
          policy: "/repo/policy.yaml",
          timeout: 2500,
        },
        runWorkflowLocator: {
          id: "project:release-readiness",
          scope: "project",
          name: "release-readiness",
          path: "/repo/.obora/workflows/release-readiness.yaml",
          displayPath: ".obora/workflows/release-readiness.yaml",
          editable: true,
          sourceDir: "/repo/.obora/workflows",
          stepCount: 1,
          projectRoot: "/repo",
        },
        runSummary: {
          executionId: "exec-123",
          workflowName: "release-readiness",
          status: "completed",
          startedAt: "2026-05-24T00:00:00.000Z",
          completedStepCount: 1,
          totalStepCount: 1,
          message: "Workflow completed: 1/1 steps completed.",
          steps: [],
        },
      },
      {
        sessionId: "session-a",
        projectRoot: "/repo/legacy-project",
        messageId: "assistant:old-run",
        messageCreatedAt: "2026-05-24T00:00:02.000Z",
        runTask: "rerun old task",
        runSummary: {
          executionId: "exec-old",
          workflowName: "legacy-flow",
          status: "completed",
          startedAt: "2026-05-24T00:00:02.000Z",
          completedStepCount: 1,
          totalStepCount: 1,
          message: "Workflow completed: 1/1 steps completed.",
          steps: [],
        },
      },
      {
        sessionId: "session-a",
        messageId: "assistant:no-task",
        messageCreatedAt: "2026-05-24T00:00:03.000Z",
        runSummary: {
          executionId: "exec-no-task",
          workflowName: "audit-flow",
          status: "completed",
          startedAt: "2026-05-24T00:00:03.000Z",
          completedStepCount: 1,
          totalStepCount: 1,
          message: "Workflow completed: 1/1 steps completed.",
          steps: [],
        },
      },
    ]);

    await createChatCommand().parseAsync(["--list-runs", "--session", "session-a"], {
      from: "user",
    });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(listChatRunDetails).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), sessionId: "session-a" })
    );
    expect(tableSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionId: "session-a",
        executionId: "exec-123",
        project: "/repo/source-project",
        workflowName: "release-readiness",
        task: "prepare release",
        retry: "release-readiness",
        options: "provider openrouter · model openrouter/owl-alpha · timeout 2500ms · files+3",
      }),
      expect.objectContaining({
        executionId: "exec-old",
        project: "/repo/legacy-project",
        task: "rerun old task",
        retry: "legacy-flow",
        options: "default",
      }),
      expect.objectContaining({
        executionId: "exec-no-task",
        project: "-",
        task: "-",
        retry: "-",
        options: "default",
      }),
    ]);
  });

  it("filters persisted chat runs by project, tag, and status", async () => {
    vi.mocked(listChatRunDetails).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      [
        "--list-runs",
        "--filter-project",
        "current",
        "--filter-tag",
        "release",
        "--filter-run-status",
        "failed",
        "--json",
      ],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(listChatRunDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: process.cwd(),
        projectRoot: process.cwd(),
        tag: "release",
        status: "failed",
      })
    );
  });

  it("uses --project when listing persisted chat runs", async () => {
    vi.mocked(listChatRunDetails).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      [
        "--list-runs",
        "--project",
        "/repo/project-store",
        "--filter-project",
        "current",
        "--json",
      ],
      { from: "user" }
    );

    expect(listChatRunDetails).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo/project-store", projectRoot: "/repo/project-store" })
    );
  });

  it("fails clearly for invalid persisted chat run status filters", async () => {
    vi.mocked(listChatRunDetails).mockResolvedValue([]);

    await createChatCommand().parseAsync(
      ["--list-runs", "--filter-run-status", "typo"],
      { from: "user" }
    );

    expect(listChatRunDetails).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid run status filter: typo. Expected one of queued|running|waiting|suspended|completed|failed|aborted."
      )
    );
  });

  it("prints persisted chat runs as JSON", async () => {
    vi.mocked(listChatRunDetails).mockResolvedValue([
      {
        sessionId: "session-a",
        messageId: "assistant:run",
        messageCreatedAt: "2026-05-24T00:00:01.000Z",
        runSummary: {
          executionId: "exec-123",
          workflowName: "release-readiness",
          status: "completed",
          startedAt: "2026-05-24T00:00:00.000Z",
          completedStepCount: 1,
          totalStepCount: 1,
          message: "Workflow completed: 1/1 steps completed.",
          steps: [],
        },
      },
    ]);

    await createChatCommand().parseAsync(["--list-runs", "--json"], { from: "user" });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"executionId": "exec-123"'));
  });

  it("fails clearly when a persisted chat run is missing", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue(undefined);

    await createChatCommand().parseAsync(["--show-run", "missing"], { from: "user" });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Chat run not found: missing")
    );
  });

  it("requires --session when showing a persisted chat session", async () => {
    await createChatCommand().parseAsync(["--show-session"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--show-session requires --session <id>")
    );
  });

  it("fails clearly when a persisted chat session is missing", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue(undefined);

    await createChatCommand().parseAsync(["--show-session", "--session", "missing"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Chat session not found: missing")
    );
  });
});
