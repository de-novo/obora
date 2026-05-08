import { describe, expect, it, beforeEach, vi } from "vitest";
import { ExecutionController, type ExecutionControllerOptions } from "../execution-controller.js";
import type { WorkflowRunner } from "../workflow-runner.js";
import type { TKGService } from "../tkg-service.js";
import type { EventBus } from "../../events/event-bus.js";
import type { PersistenceManager } from "../../persistence/persistence-manager.js";
import type { OboraRuntimeConfig, RuntimeExecution, AgentFactory } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";
import { OboraError, OboraErrorCode } from "../../runtime-types.js";
import { BudgetExceededError } from "../../cost-tracker.js";

// ── Mocks ──────────────────────────────────────────────────────────────────

function makeMockRunner(): WorkflowRunner {
  return {
    executeRun: vi.fn().mockResolvedValue(undefined),
    getPersistedRepairLoopSummary: vi.fn().mockReturnValue(undefined),
    clearPersistedRepairLoopSummary: vi.fn(),
  } as unknown as WorkflowRunner;
}

function makeMockTKGService() {
  return {
    rollbackTKGOnExecutionFailure: vi.fn().mockResolvedValue({ restored: false, restoredFactCount: 0, scope: "" }),
  };
}

function makeMockEventBus(): EventBus {
  return {
    on: vi.fn().mockReturnValue(() => {}),
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus;
}

function makeMockPersistenceManager(): PersistenceManager {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
  } as unknown as PersistenceManager;
}

function makeBaseConfig(): OboraRuntimeConfig {
  return {
    llm: { provider: "mock", apiKey: "test-key", model: "mock-model" },
    verbose: false,
  };
}

function makeWorkflow(name: string): WorkflowDef {
  return { name, steps: [] };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ExecutionController", () => {
  let controller: ExecutionController;
  let runner: WorkflowRunner;
  let eventBus: EventBus;
  let persistenceManager: PersistenceManager;
  let executions: Map<string, RuntimeExecution>;
  let opts: ExecutionControllerOptions;

  beforeEach(() => {
    runner = makeMockRunner();
    eventBus = makeMockEventBus();
    persistenceManager = makeMockPersistenceManager();
    executions = new Map();

    opts = {
      config: makeBaseConfig(),
      runner,
      tkgService: makeMockTKGService() as unknown as TKGService,
      eventBus,
      persistenceManager,
      executions,
    };

    controller = new ExecutionController(opts);
  });

  describe("start", () => {
    it("creates a RunHandle and completes successfully", async () => {
      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, {}, agents, workflows);

      expect(handle).toBeDefined();
      expect(handle.executionId).toBeDefined();

      const result = await handle.wait();
      expect(result.status).toBe("completed");
    });

    it("calls runner.executeRun with correct arguments", async () => {
      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, {}, agents, workflows);
      await handle.wait();

      expect(runner.executeRun).toHaveBeenCalledTimes(1);
      const call = vi.mocked(runner.executeRun).mock.calls[0];
      if (!call) throw new Error("Expected executeRun to be called");
      const [, workflowName, wf, execution] = call;
      expect(workflowName).toBe("test");
      expect(wf.name).toBe("test");
      // execution object status at call time was running, but by now it's completed
      expect(execution.status).toBe("completed");
    });

    it("marks as failed and triggers rollback when runner throws", async () => {
      vi.mocked(runner.executeRun).mockRejectedValueOnce(new Error("step failed"));

      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, {}, agents, workflows);
      await expect(handle.wait()).rejects.toThrow("step failed");
      expect(handle.status).toBe("failed");
      expect(opts.tkgService.rollbackTKGOnExecutionFailure).toHaveBeenCalledTimes(1);
    });

    it("marks as suspended when BudgetExceededError is thrown", async () => {
      vi.mocked(runner.executeRun).mockRejectedValueOnce(
        new BudgetExceededError("budget exceeded")
      );

      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, {}, agents, workflows);
      await expect(handle.wait()).rejects.toThrow("budget exceeded");
      expect(handle.status).toBe("suspended");
      expect(opts.tkgService.rollbackTKGOnExecutionFailure).not.toHaveBeenCalled();
    });

    it("rejects wait when cancel() is called", async () => {
      // Delay runner so we can cancel mid-flight
      vi.mocked(runner.executeRun).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, {}, agents, workflows);

      // Wait a tick for execution to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      handle.cancel();

      await expect(handle.wait()).rejects.toThrow("Execution cancelled");
      expect(handle.status).toBe("aborted");
    });

    it("rejects wait when external AbortSignal fires", async () => {
      const abortController = new AbortController();

      vi.mocked(runner.executeRun).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const workflow = makeWorkflow("test");
      const agents = new Map<string, AgentFactory>();
      const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

      const handle = await controller.start("test", workflow, { signal: abortController.signal }, agents, workflows);

      await new Promise((resolve) => setTimeout(resolve, 10));
      abortController.abort();

      await expect(handle.wait()).rejects.toThrow("Execution cancelled");
      expect(handle.status).toBe("aborted");
    });
  });
});
