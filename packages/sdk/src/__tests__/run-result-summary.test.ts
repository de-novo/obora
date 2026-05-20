import { describe, expect, it } from "vitest";

import { buildWorkflowRunSummary } from "../execution/run-result-summary.js";
import type { ExecutionTrace, RuntimeExecution } from "../runtime-types.js";

const createTrace = (overrides: Partial<ExecutionTrace> = {}): ExecutionTrace => ({
  step: "collect",
  agent: "researcher",
  timestamp: "2026-05-21T00:00:00.000Z",
  version: "1.0",
  task_summary: "Collect release notes",
  methodology: "Standard agent execution",
  tools_used: ["file_read"],
  key_decisions: ["Use the release checklist"],
  decision_rationale: "The checklist is the source of truth.",
  alternatives_considered: [],
  assumptions: [],
  constraints: [],
  risks_identified: [],
  inputs_processed: [],
  dependencies_used: [],
  output_summary: "Collected release notes and checklist state.",
  output_format: "markdown",
  artifacts_created: ["release-notes.md"],
  issues_encountered: [],
  workarounds_applied: [],
  confidence_level: "high",
  known_limitations: [],
  implications_for_next: ["Review can use the collected notes."],
  recommended_next: [],
  open_questions: [],
  context_for_successors: "Step 'collect' completed by researcher.",
  ...overrides,
});

describe("buildWorkflowRunSummary", () => {
  it("summarizes completed workflow steps with trace, model, tool, and artifact details", () => {
    const execution: RuntimeExecution = {
      id: "exec-1",
      workflowName: "release-readiness",
      status: "completed",
      input: { message: "prepare release" },
      startedAt: new Date("2026-05-21T00:00:00.000Z"),
      endedAt: new Date("2026-05-21T00:00:05.000Z"),
      stepOrder: ["collect", "handoff"],
      completedSteps: ["collect", "handoff"],
      outputs: {
        collect: "# Release notes\nReady for review.",
        handoff: { status: "ready", next: "publish" },
      },
      traces: {
        collect: createTrace(),
        handoff: createTrace({
          step: "handoff",
          agent: "dispatcher",
          task_summary: "Prepare final handoff",
          tools_used: [],
          output_summary: "Prepared final handoff.",
          output_format: "json",
          artifacts_created: [],
          dependencies_used: [{ step: "collect", purpose: "release notes" }],
        }),
      },
      stepRecords: {
        collect: {
          raw: {
            model: "openrouter/owl-alpha",
            message: {
              toolCalls: [
                { function: { name: "file_read" } },
                { function: { name: "file_write" } },
              ],
            },
          },
        },
        handoff: {
          raw: { model: "openrouter/owl-alpha" },
        },
      },
    };

    const summary = buildWorkflowRunSummary(execution);

    expect(summary).toMatchObject({
      executionId: "exec-1",
      workflowName: "release-readiness",
      status: "completed",
      completedStepCount: 2,
      totalStepCount: 2,
      durationMs: 5000,
      message: "Workflow completed: 2/2 steps completed.",
    });
    expect(summary.steps[0]).toMatchObject({
      name: "collect",
      status: "completed",
      agent: "researcher",
      model: "openrouter/owl-alpha",
      outputPreview: "Collected release notes and checklist state.",
      outputFormat: "markdown",
      toolsUsed: ["file_read", "file_write"],
      artifacts: ["release-notes.md"],
      task: "Collect release notes",
      decisions: ["Use the release checklist"],
      rationale: "The checklist is the source of truth.",
    });
    expect(summary.steps[1]?.dependencies).toEqual(["collect"]);
  });

  it("keeps missing step and workflow error details visible", () => {
    const execution: RuntimeExecution = {
      id: "exec-2",
      workflowName: "release-readiness",
      status: "failed",
      input: {},
      startedAt: new Date("2026-05-21T00:00:00.000Z"),
      endedAt: new Date("2026-05-21T00:00:01.000Z"),
      error: "Provider returned error",
      stepOrder: ["collect", "handoff"],
      completedSteps: ["collect"],
      outputs: { collect: "done" },
      stepRecords: { collect: { raw: { model: "openrouter/owl-alpha" } } },
    };

    const summary = buildWorkflowRunSummary(execution);

    expect(summary.message).toBe("Workflow failed: 1/2 steps completed.");
    expect(summary.error).toBe("Provider returned error");
    expect(summary.steps).toEqual([
      expect.objectContaining({
        name: "collect",
        status: "completed",
        outputPreview: "done",
      }),
      expect.objectContaining({
        name: "handoff",
        status: "missing",
        outputPreview: "No output recorded.",
      }),
    ]);
  });

  it("falls back across sparse runtime data without hiding malformed raw details", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const execution = {
      id: "exec-3",
      workflowName: "sparse-flow",
      status: "waiting",
      input: {},
      startedAt: undefined,
      endedAt: "2026-05-21T00:00:01.000Z",
      stepOrder: ["sparse", "object-output", "record-trace"],
      completedSteps: ["sparse", "object-output", "record-trace"],
      outputs: {
        sparse: "x".repeat(260),
        "object-output": circular,
        "record-trace": { ok: true },
      },
      stepRecords: {
        sparse: {
          raw: {
            toolCalls: [
              {
                function: {
                  name: "file_write",
                  arguments: JSON.stringify({ path: "sparse.txt", content: "sparse" }),
                },
              },
            ],
            message: {
              toolCalls: [
                { function: {} },
                { function: { name: "file_list" } },
              ],
            },
          },
        },
        "object-output": {},
        "record-trace": {
          trace: createTrace({
            step: "record-trace",
            agent: "",
            output_summary: "",
            output_format: "json",
            artifacts_created: ["record.json", "record.json"],
            tools_used: ["file_read"],
          }),
        },
      },
    } as unknown as RuntimeExecution;

    const summary = buildWorkflowRunSummary(execution);

    expect(summary).toMatchObject({
      status: "waiting",
      startedAt: "1970-01-01T00:00:00.000Z",
      endedAt: "2026-05-21T00:00:01.000Z",
      message: "Workflow waiting: 3/3 steps completed.",
    });
    expect(summary.durationMs).toBeUndefined();
    expect(summary.steps[0]).toMatchObject({
      name: "sparse",
      outputFormat: "text",
      toolsUsed: ["file_write", "file_list"],
      artifacts: ["sparse.txt"],
    });
    expect(summary.steps[0]?.outputPreview.endsWith("…")).toBe(true);
    expect(summary.steps[1]).toMatchObject({
      name: "object-output",
      outputPreview: "[object Object]",
      outputFormat: "structured",
    });
    expect(summary.steps[2]).toMatchObject({
      name: "record-trace",
      outputPreview: "{\"ok\":true}",
      outputFormat: "json",
      artifacts: ["record.json"],
    });
  });
});
