import { runChatSession } from "../../chat/session.js";
import { listChatSessionSummaries, loadChatSessionState } from "../../chat/store.js";
import { createCLI } from "../../cli.js";
import { createChatCommand } from "../chat.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../chat/session.js", () => ({
  runChatSession: vi.fn(),
}));

vi.mock("../../chat/store.js", () => ({
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
        messageCount: 2,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(["--list-sessions"], { from: "user" });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledWith([
      expect.objectContaining({ sessionId: "session-a" }),
    ]);
  });

  it("shows a persisted chat session selected by --session", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(["--show-session", "--session", "session-a"], {
      from: "user",
    });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
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
