import { runChatSession } from "../../chat/session.js";
import { createCLI } from "../../cli.js";
import { createChatCommand } from "../chat.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../chat/session.js", () => ({
  runChatSession: vi.fn(),
}));

describe("chat command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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
});
