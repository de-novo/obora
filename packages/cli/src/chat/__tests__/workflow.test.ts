import { resolveWorkflowTarget } from "@obora/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatRunInput,
  parseChatTimeout,
  parseChatWorkflowScope,
  resolveChatWorkflow,
} from "../workflow.js";

vi.mock("@obora/sdk", () => ({
  resolveWorkflowTarget: vi.fn(),
}));

const locator = {
  id: "project:abc",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 1,
  projectRoot: "/repo",
} as const;

describe("chat workflow helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses scope and timeout options", () => {
    expect(parseChatWorkflowScope("project")).toBe("project");
    expect(parseChatWorkflowScope(undefined)).toBeUndefined();
    expect(parseChatTimeout("1500")).toBe(1500);
    expect(() => parseChatWorkflowScope("workspace")).toThrow("Invalid workflow scope");
    expect(() => parseChatTimeout("bad")).toThrow("Invalid chat execution timeout");
  });

  it("resolves a chat workflow through the SDK resolver", async () => {
    vi.mocked(resolveWorkflowTarget).mockResolvedValue({
      status: "resolved",
      locator,
      candidates: [locator],
      diagnostics: [],
    });

    await expect(
      resolveChatWorkflow({
        target: "release-readiness",
        cwd: "/repo",
        scope: "project",
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      })
    ).resolves.toBe(locator);

    expect(resolveWorkflowTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "release-readiness",
        intent: "run",
        cwd: "/repo",
        scope: "project",
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      })
    );
  });

  it("throws a CLI error for unresolved workflows", async () => {
    vi.mocked(resolveWorkflowTarget).mockResolvedValue({
      status: "ambiguous",
      candidates: [locator],
      diagnostics: ["choose scope"],
    });

    await expect(
      resolveChatWorkflow({ target: "release-readiness", cwd: "/repo" })
    ).rejects.toThrow("choose scope");
  });

  it("creates a structured run input payload", () => {
    expect(
      JSON.parse(
        createChatRunInput({
          message: "ship it",
          sessionId: "session-a",
          workflowName: "release-readiness",
          workflowPath: "/repo/workflow.yaml",
        })
      )
    ).toEqual({
      message: "ship it",
      sessionId: "session-a",
      workflow: {
        name: "release-readiness",
        path: "/repo/workflow.yaml",
      },
    });
  });
});
