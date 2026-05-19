import type { WorkflowDiscoveryResult, WorkflowLocator, WorkflowResolveResult } from "@obora/sdk";
import { discoverWorkflowLocators, listWorkflows, resolveWorkflowTarget } from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openWorkflowUrl } from "../../workflow-web/browser.js";
import { startWorkflowWebBridge } from "../../workflow-web/server.js";
import { createWorkflowCommand } from "../workflow.js";

vi.mock("@obora/sdk", () => ({
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  },
  OboraErrorCode: {
    POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
    CELL_ABORTED: "CELL_ABORTED",
  },
  addStep: vi.fn(),
  createWorkflow: vi.fn(),
  discoverWorkflowLocators: vi.fn(),
  listWorkflows: vi.fn(),
  readWorkflow: vi.fn(),
  removeStep: vi.fn(),
  resolveWorkflowTarget: vi.fn(),
  updateStep: vi.fn(),
  validateWorkflow: vi.fn(),
}));

vi.mock("../../workflow-web/browser.js", () => ({
  openWorkflowUrl: vi.fn(),
}));

vi.mock("../../workflow-web/server.js", () => ({
  startWorkflowWebBridge: vi.fn(),
}));

const projectLocator: WorkflowLocator = {
  id: "project:release-readiness",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 7,
  projectRoot: "/repo",
  shadows: "/home/.obora/workflows/release-readiness.yaml",
};

const globalLocator: WorkflowLocator = {
  id: "global:code-review",
  scope: "global",
  name: "code-review",
  path: "/home/.obora/workflows/code-review.yaml",
  displayPath: "~/.obora/workflows/code-review.yaml",
  editable: true,
  sourceDir: "/home/.obora/workflows",
  stepCount: 5,
};

const discovery: WorkflowDiscoveryResult = {
  roots: {
    cwd: "/repo",
    projectRoot: "/repo",
    projectWorkflowDirs: ["/repo/.obora/workflows", "/repo/workflows"],
    globalWorkflowDir: "/home/.obora/workflows",
  },
  project: [projectLocator],
  global: [globalLocator],
  all: [projectLocator, globalLocator],
  diagnostics: [],
};

const resolvedProject: WorkflowResolveResult = {
  status: "resolved",
  locator: projectLocator,
  candidates: [projectLocator],
  diagnostics: ["using project workflow"],
};

const parseJsonLog = (spy: ReturnType<typeof vi.spyOn>): unknown =>
  JSON.parse(String(spy.mock.calls.at(-1)?.[0] ?? "{}"));

const createRootCommand = (): Command => {
  const root = new Command("obora").option("--json").exitOverride();
  root.addCommand(createWorkflowCommand());
  return root;
};

describe("workflow scope commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(discoverWorkflowLocators).mockResolvedValue(discovery);
    vi.mocked(resolveWorkflowTarget).mockResolvedValue(resolvedProject);
    vi.mocked(startWorkflowWebBridge).mockResolvedValue({
      url: "http://127.0.0.1:5199/#/workflows/project%3Arelease-readiness/builder",
      apiBaseUrl: "http://127.0.0.1:5199",
      token: "test-token",
      close: vi.fn().mockResolvedValue(undefined),
      waitUntilClosed: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(openWorkflowUrl).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists project and global workflow scopes as grouped JSON", async () => {
    const logSpy = vi.spyOn(console, "log");

    await createRootCommand().parseAsync(["workflow", "list", "--scope", "all", "--json"], {
      from: "user",
    });

    expect(discoverWorkflowLocators).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: process.cwd(),
        scope: "all",
      })
    );
    expect(parseJsonLog(logSpy)).toMatchObject({
      project: [expect.objectContaining({ name: "release-readiness", scope: "project" })],
      global: [expect.objectContaining({ name: "code-review", scope: "global" })],
    });
  });

  it("prints scoped workflow groups in text mode", async () => {
    await createRootCommand().parseAsync(["workflow", "list", "--scope", "all"], {
      from: "user",
    });

    expect(console.log).toHaveBeenCalledWith("Project workflows");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("release-readiness (7 steps)")
    );
    expect(console.log).toHaveBeenCalledWith("Global workflows");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("code-review (5 steps)"));
  });

  it("filters scoped workflow groups by project or global scope", async () => {
    const logSpy = vi.spyOn(console, "log");

    await createRootCommand().parseAsync(["workflow", "list", "--scope", "project", "--json"], {
      from: "user",
    });
    const projectPayload = parseJsonLog(logSpy);

    await createRootCommand().parseAsync(["workflow", "list", "--scope", "global", "--json"], {
      from: "user",
    });
    const globalPayload = parseJsonLog(logSpy);

    expect(projectPayload).toMatchObject({
      project: [expect.objectContaining({ scope: "project" })],
      global: [],
    });
    expect(globalPayload).toMatchObject({
      project: [],
      global: [expect.objectContaining({ scope: "global" })],
    });
  });

  it("passes explicit workflow roots into scoped JSON discovery", async () => {
    const logSpy = vi.spyOn(console, "log");

    await createRootCommand().parseAsync(
      [
        "workflow",
        "list",
        "--project",
        "/repo",
        "--global-workflows-dir",
        "/home/.obora/workflows",
        "--json",
      ],
      { from: "user" }
    );

    expect(discoverWorkflowLocators).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
        scope: "all",
      })
    );
    expect(parseJsonLog(logSpy)).toMatchObject({
      roots: expect.objectContaining({
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      }),
    });
  });

  it("prints an empty scoped workflow message", async () => {
    vi.mocked(discoverWorkflowLocators).mockResolvedValue({
      ...discovery,
      project: [],
      global: [],
      all: [],
    });

    await createRootCommand().parseAsync(["workflow", "list"], {
      from: "user",
    });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("No workflows found in project or global workflow roots")
    );
  });

  it("preserves positional directory listing", async () => {
    vi.mocked(listWorkflows).mockResolvedValue([
      {
        name: "directory-workflow",
        path: "/repo/workflows/directory-workflow.yaml",
        stepCount: 1,
      },
    ]);

    await createRootCommand().parseAsync(["workflow", "list", "workflows"], {
      from: "user",
    });

    expect(listWorkflows).toHaveBeenCalledWith(expect.stringContaining("workflows"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("directory-workflow (1 steps)")
    );
  });

  it("preserves positional directory JSON and empty messaging", async () => {
    const logSpy = vi.spyOn(console, "log");
    vi.mocked(listWorkflows).mockResolvedValueOnce([
      {
        name: "directory-json",
        path: "/repo/workflows/directory-json.yaml",
        stepCount: 2,
      },
    ]);

    await createRootCommand().parseAsync(["workflow", "list", "workflows", "--json"], {
      from: "user",
    });
    const jsonPayload = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0] ?? "[]"));

    vi.mocked(listWorkflows).mockResolvedValueOnce([]);
    await createRootCommand().parseAsync(["workflow", "list", "workflows"], {
      from: "user",
    });

    expect(jsonPayload).toEqual([
      {
        name: "directory-json",
        path: "/repo/workflows/directory-json.yaml",
        stepCount: 2,
      },
    ]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No workflows found in"));
  });

  it("opens workflow build through the local web bridge without launching a browser in JSON mode", async () => {
    const logSpy = vi.spyOn(console, "log");

    await createRootCommand().parseAsync(
      [
        "workflow",
        "build",
        "release-readiness",
        "--scope",
        "project",
        "--project",
        "/repo",
        "--global-workflows-dir",
        "/home/.obora/workflows",
        "--port",
        "5199",
        "--no-open",
        "--json",
      ],
      { from: "user" }
    );

    expect(resolveWorkflowTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "release-readiness",
        scope: "project",
        intent: "build",
        projectRoot: "/repo",
        globalWorkflowDir: "/home/.obora/workflows",
      })
    );
    expect(startWorkflowWebBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: projectLocator,
        mode: "build",
        port: 5199,
      })
    );
    expect(openWorkflowUrl).not.toHaveBeenCalled();
    expect(parseJsonLog(logSpy)).toMatchObject({
      status: "resolved",
      mode: "build",
      locator: { name: "release-readiness", scope: "project" },
      url: "http://127.0.0.1:5199/#/workflows/project%3Arelease-readiness/builder",
    });
  });

  it("opens workflow view in text mode and keeps the bridge lifecycle explicit", async () => {
    const waitUntilClosed = vi.fn().mockResolvedValue(undefined);
    vi.mocked(startWorkflowWebBridge).mockResolvedValue({
      url: "http://127.0.0.1:5199/#/workflows/project%3Arelease-readiness/view",
      apiBaseUrl: "http://127.0.0.1:5199",
      token: "test-token",
      close: vi.fn().mockResolvedValue(undefined),
      waitUntilClosed,
    });

    await createRootCommand().parseAsync(["workflow", "view", "release-readiness"], {
      from: "user",
    });

    expect(startWorkflowWebBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: projectLocator,
        mode: "view",
        open: true,
      })
    );
    expect(openWorkflowUrl).toHaveBeenCalledWith(
      "http://127.0.0.1:5199/#/workflows/project%3Arelease-readiness/view"
    );
    expect(waitUntilClosed).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("using project workflow"));
  });

  it("fails build when the resolver reports an ambiguous workflow name", async () => {
    vi.mocked(resolveWorkflowTarget).mockResolvedValue({
      status: "ambiguous",
      candidates: [projectLocator, globalLocator],
      diagnostics: ["pass --scope"],
    });

    await createRootCommand().parseAsync(["workflow", "build", "release-readiness"], {
      from: "user",
    });

    expect(startWorkflowWebBridge).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("pass --scope"));
  });

  it("rejects invalid workflow scope and bridge port values", async () => {
    await createRootCommand().parseAsync(["workflow", "list", "--scope", "workspace"], {
      from: "user",
    });
    await createRootCommand().parseAsync(
      ["workflow", "build", "release-readiness", "--scope", "project", "--port", "bad"],
      { from: "user" }
    );

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Invalid workflow scope"));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid workflow web port")
    );
  });
});
