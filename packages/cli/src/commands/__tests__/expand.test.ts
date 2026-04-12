import { readFile } from "node:fs/promises";

import { Workflow } from "@obora/sdk";
import type { OneFileStopSemantics, WorkflowDef } from "@obora/sdk";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@obora/sdk", () => ({
  Workflow: {
    fromYaml: vi.fn(),
    getStopSemantics: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("yaml", () => ({
  default: { parse: vi.fn(() => ({ mode: "validation-repair" })) },
}));

vi.mock("../../utils/formatter.js", () => ({
  formatter: {
    json: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../../utils/error-handler.js", () => ({
  handleCommandAction: vi.fn((fn: () => Promise<void>) => fn),
}));

vi.mock("../../utils/global-opts.js", () => ({
  getGlobalOpts: vi.fn(() => ({})),
}));

import { formatter } from "../../utils/formatter.js";
import { createExpandCommand, runExpand } from "../expand.js";

describe("expand command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockResolvedValue("name: wf\nmode: validation-repair\n" as never);
    vi.mocked(Workflow.fromYaml).mockResolvedValue({
      name: "wf",
      steps: [{ name: "build_or_repair" }, { name: "validate" }],
    } as WorkflowDef);
    vi.mocked(Workflow.getStopSemantics).mockReturnValue({
      mode: "validation-repair",
      outcomes: [
        "continue",
        "success",
        "exhausted",
        "no_progress",
        "repeated_critical_issue",
        "aborted",
      ],
      thresholds: {
        max_iterations: 3,
        no_progress_ceiling: undefined,
        repeated_critical_issue_ceiling: undefined,
      },
      output: { root: undefined },
      archive: { enabled: false },
      notes: [],
    } satisfies OneFileStopSemantics);
  });

  it("creates expand command", () => {
    const cmd = createExpandCommand();
    expect(cmd.name()).toBe("expand");
  });

  it("prints JSON payload in json mode", async () => {
    await runExpand("demo.yaml", { json: true });
    expect(formatter.json).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "demo.yaml",
        workflow: "wf",
        expandedWorkflow: expect.objectContaining({ name: "wf" }),
        stopSemantics: expect.objectContaining({ mode: "validation-repair" }),
      })
    );
  });
});
