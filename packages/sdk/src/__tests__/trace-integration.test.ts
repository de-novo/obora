import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../events/event-bus.js";
import { RepairLoopTracker } from "../execution/repair-loop-tracker.js";
import { StepExecutionEngine } from "../execution/step-execution-engine.js";
import { StepExecutor, type LLMAdapterLike } from "../step-executor.js";
import type { ExecutionTrace, RuntimeExecution } from "../runtime-types.js";
import type { WorkflowDef, WorkflowStep } from "../workflow.js";

const createTrace = (overrides: Partial<ExecutionTrace> = {}): ExecutionTrace => ({
  step: "trace-step",
  agent: "agent",
  timestamp: "2026-05-17T00:00:00.000Z",
  version: "1.0",
  task_summary: "Trace task",
  methodology: "Standard agent execution",
  tools_used: [],
  key_decisions: [],
  decision_rationale: "",
  alternatives_considered: [],
  assumptions: [],
  constraints: [],
  risks_identified: [],
  inputs_processed: [],
  dependencies_used: [],
  output_summary: "Trace output",
  output_format: "text",
  artifacts_created: [],
  issues_encountered: [],
  workarounds_applied: [],
  confidence_level: "high",
  known_limitations: [],
  implications_for_next: [],
  recommended_next: [],
  open_questions: [],
  context_for_successors: "Trace context for successors.",
  ...overrides,
});

const createExecution = (id: string): RuntimeExecution => ({
  id,
  workflowName: "trace-workflow",
  status: "running",
  input: {},
  startedAt: new Date("2026-05-17T00:00:00.000Z"),
  stepOrder: ["persist"],
  completedSteps: [],
  stepRecords: {},
  outputs: {},
});

const createChatCompletion = (content: string) =>
  vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
    message: { role: "assistant", content },
  });

describe("execution trace integration", () => {
  it("fails invalid traces in strict validation mode", async () => {
    const chatCompletion = createChatCompletion("");
    const executor = new StepExecutor({ chatCompletion }, new Map(), { traceValidation: "strict" });

    await expect(
      executor.executeStep(
        { name: "invalid-trace", agent: "writer", input: { task: "Return empty output" } },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("[TRACE_1001]");
  });

  it("warns for invalid traces in warn validation mode", async () => {
    const chatCompletion = createChatCompletion("");
    const logger = { warn: vi.fn() };
    const executor = new StepExecutor(
      { chatCompletion },
      new Map(),
      { traceValidation: "warn", logger },
    );

    const result = await executor.executeStep(
      { name: "warn-trace", agent: "writer", input: { task: "Return empty output" } },
      { previousOutputs: {} },
    );

    expect(result.output).toBe("");
    expect(result.trace?.output_summary).toBe("");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[trace-validation]"));
  });

  it("skips invalid trace validation in off mode", async () => {
    const chatCompletion = createChatCompletion("");
    const logger = { warn: vi.fn() };
    const executor = new StepExecutor(
      { chatCompletion },
      new Map(),
      { traceValidation: "off", logger },
    );

    const result = await executor.executeStep(
      { name: "off-trace", agent: "writer", input: { task: "Return empty output" } },
      { previousOutputs: {} },
    );

    expect(result.trace?.output_summary).toBe("");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("injects compacted upstream traces by relevance score", async () => {
    const chatCompletion = createChatCompletion("done");
    const executor = new StepExecutor({ chatCompletion }, new Map(), {});
    const timestamp = "2026-05-17T00:00:00.000Z";

    await executor.requestForStep(
      {
        name: "successor",
        agent: "writer",
        input: { task: "Use compacted trace history" },
        depends_on: ["plain", "decision", "artifact", "issue"],
        config: { execution_traces: { maxHistorySteps: 2 } },
      },
      {
        previousOutputs: {},
        traces: {
          plain: createTrace({ step: "plain", timestamp, task_summary: "Plain trace" }),
          decision: createTrace({
            step: "decision",
            timestamp,
            task_summary: "Decision trace",
            key_decisions: ["selected a parser"],
          }),
          artifact: createTrace({
            step: "artifact",
            timestamp,
            task_summary: "Artifact trace",
            key_decisions: ["kept generated files"],
            artifacts_created: ["dist/result.json"],
          }),
          issue: createTrace({
            step: "issue",
            timestamp,
            task_summary: "Issue trace",
            issues_encountered: ["validation failed once"],
          }),
        },
      },
    );

    const prompt = String(chatCompletion.mock.calls[0]?.[0].messages[1]?.content ?? "");
    expect(prompt).toContain("### issue (agent)");
    expect(prompt).toContain("### artifact (agent)");
    expect(prompt).not.toContain("### decision (agent)");
    expect(prompt).not.toContain("### plain (agent)");
  });

  it("prioritizes relevant traces over newer unrelated traces", async () => {
    const chatCompletion = createChatCompletion("done");
    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await executor.requestForStep(
      {
        name: "successor",
        agent: "writer",
        input: { task: "Use the most useful trace" },
        depends_on: ["recent", "old-issue"],
        config: { execution_traces: { maxHistorySteps: 1 } },
      },
      {
        previousOutputs: {},
        traces: {
          recent: createTrace({
            step: "recent",
            timestamp: "2026-05-17T00:00:00.000Z",
            task_summary: "Recent plain trace",
          }),
          "old-issue": createTrace({
            step: "old-issue",
            timestamp: "2026-05-01T00:00:00.000Z",
            task_summary: "Old issue trace",
            issues_encountered: ["validation failed"],
          }),
        },
      },
    );

    const prompt = String(chatCompletion.mock.calls[0]?.[0].messages[1]?.content ?? "");
    expect(prompt).toContain("### old-issue (agent)");
    expect(prompt).not.toContain("### recent (agent)");
  });

  it("enriches traces with heuristic pattern matches", async () => {
    const chatCompletion = createChatCompletion(
      "Decided to use deterministic retries. Assuming that validators are stable. Risk is stale repair context.",
    );
    const executor = new StepExecutor(
      { chatCompletion },
      new Map(),
      { traceEnrichment: "heuristic" },
    );

    const result = await executor.executeStep(
      { name: "heuristic-trace", agent: "writer", input: { task: "Summarize decisions" } },
      { previousOutputs: {} },
    );

    expect(result.trace?.key_decisions).toContain("use deterministic retries");
    expect(result.trace?.assumptions).toContain("validators are stable");
    expect(result.trace?.risks_identified).toContain("stale repair context");
  });

  it("persists step traces under the default .obora/traces directory", async () => {
    const cwdBefore = process.cwd();
    const traceOutputDirBefore = process.env.OBORA_TRACE_OUTPUT_DIR;
    const workspace = await mkdtemp(join(tmpdir(), "obora-trace-persistence-"));
    delete process.env.OBORA_TRACE_OUTPUT_DIR;
    process.chdir(workspace);

    try {
      const eventBus = new EventBus();
      vi.spyOn(eventBus, "emit").mockResolvedValue(undefined);
      const engine = new StepExecutionEngine({
        eventBus,
        config: { logger: { warn: vi.fn() } },
        repairLoopTracker: new RepairLoopTracker(),
      });
      const step: WorkflowStep = { name: "persist", agent: "writer", input: { task: "Persist trace" } };
      const workflow: WorkflowDef = { name: "trace-workflow", steps: [step] };
      const execution = createExecution("exec-trace");
      const trace = createTrace({ step: "persist", task_summary: "Persist trace" });
      const stepExecutor = {
        executeStep: vi.fn().mockResolvedValue({ output: "ok", trace }),
      } as unknown as StepExecutor;

      await engine.executeStepLoop(
        [step],
        workflow,
        execution,
        stepExecutor,
        undefined,
        "exec-trace",
        false,
        null,
      );

      const persisted = JSON.parse(
        await readFile(join(workspace, ".obora", "traces", "exec-trace", "persist.json"), "utf-8"),
      ) as Partial<ExecutionTrace>;
      expect(persisted).toMatchObject({
        step: "persist",
        task_summary: "Persist trace",
        context_for_successors: "Trace context for successors.",
      });
    } finally {
      process.chdir(cwdBefore);
      if (traceOutputDirBefore) {
        process.env.OBORA_TRACE_OUTPUT_DIR = traceOutputDirBefore;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
