import { discoverWorkflowLocators, resolveWorkflowTarget } from "@obora/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatRunInput,
  listChatWorkflowLocators,
  parseChatTimeout,
  parseChatWorkflowScope,
  resolveChatWorkflow,
} from "../workflow.js";

vi.mock("@obora/sdk", () => ({
  discoverWorkflowLocators: vi.fn(),
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

const globalLocator = {
  ...locator,
  id: "global:review",
  scope: "global",
  name: "code-review",
  path: "/home/.obora/workflows/code-review.yaml",
  displayPath: "~/.obora/workflows/code-review.yaml",
  sourceDir: "/home/.obora/workflows",
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

  it.each([
    ["project", [locator]],
    ["global", [globalLocator]],
    ["all", [locator, globalLocator]],
    [undefined, [locator, globalLocator]],
  ] as const)("lists chat workflow locators for %s scope", async (scope, expected) => {
    vi.mocked(discoverWorkflowLocators).mockResolvedValue({
      roots: {
        project: ["/repo/.obora/workflows"],
        global: "/home/.obora/workflows",
      },
      project: [locator],
      global: [globalLocator],
      all: [locator, globalLocator],
      diagnostics: [],
    });

    await expect(
      listChatWorkflowLocators({
        cwd: "/repo",
        scope,
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      })
    ).resolves.toEqual(expected);

    expect(discoverWorkflowLocators).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/repo",
        scope: scope ?? "all",
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      })
    );
  });

  it("lists chat workflow locators with default roots", async () => {
    vi.mocked(discoverWorkflowLocators).mockResolvedValue({
      roots: {
        cwd: "/repo",
        projectRoot: "/repo",
        projectWorkflowDirs: ["/repo/.obora/workflows"],
        globalWorkflowDir: "/home/.obora/workflows",
      },
      project: [locator],
      global: [],
      all: [locator],
      diagnostics: [],
    });

    await expect(
      listChatWorkflowLocators({
        cwd: "/repo",
      })
    ).resolves.toEqual([locator]);

    expect(discoverWorkflowLocators).toHaveBeenCalledWith({
      cwd: "/repo",
      scope: "all",
    });
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
