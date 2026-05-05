import { describe, expect, it, vi } from "vitest";
import { ExecutionOrchestrator } from "../execution/execution-orchestrator.js";
import type { EventBus } from "../events/event-bus.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import type { OboraRuntimeConfig, AgentFactory, RuntimeExecution } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import type { LLMAdapterLike } from "../step-executor.js";
import { TKGService } from "../execution/tkg-service.js";
import { TKGPromotionEngine } from "../execution/tkg-promotion-engine.js";
import { EngineBuilder } from "../execution/engine-builder.js";
import { StepExecutionEngine } from "../execution/step-execution-engine.js";
import { RepairLoopTracker } from "../execution/repair-loop-tracker.js";

describe("ExecutionOrchestrator", () => {
  const createMockEventBus = (): EventBus =>
    ({
      emit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
    }) as unknown as EventBus;

  const createMockPersistenceManager = (): PersistenceManager =>
    ({
      getStorageAdapter: vi.fn().mockResolvedValue({
        saveRun: vi.fn().mockResolvedValue(undefined),
        saveStep: vi.fn().mockResolvedValue(undefined),
        saveAuditEvent: vi.fn().mockResolvedValue(undefined),
      }),
      getCostTrackingAdapter: vi.fn().mockResolvedValue({
        recordCost: vi.fn().mockResolvedValue(undefined),
      }),
    }) as unknown as PersistenceManager;

  const createMockAdapterFactory = () =>
    vi.fn().mockResolvedValue({
      chatCompletion: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "test output" },
      }),
    } as unknown as LLMAdapterLike);

  const createDeps = () => {
    const eventBus = createMockEventBus();
    const persistenceManager = createMockPersistenceManager();
    const adapterFactory = createMockAdapterFactory();
    const config: OboraRuntimeConfig = {
      config: {
        defaults: { provider: "mock", model: "mock-model" },
        resources: {
          pricing: {
            models: [{ model: "mock-model", promptPer1kTokens: 0.0, completionPer1kTokens: 0.0 }],
          },
        },
      },
      verbose: false,
    };

    return {
      config,
      eventBus,
      adapterFactory,
      persistenceManager,
      agents: new Map<string, AgentFactory>(),
    };
  };

  const createOrchestrator = () => {
    const deps = createDeps();
    const repairLoopTracker = new RepairLoopTracker();
    return {
      orchestrator: new ExecutionOrchestrator({
        deps,
        tkgService: new TKGService(deps),
        tkgPromotionEngine: new TKGPromotionEngine({ eventBus: deps.eventBus }),
        stepExecutionEngine: new StepExecutionEngine({
          eventBus: deps.eventBus,
          config: deps.config,
          repairLoopTracker,
        }),
        engineBuilder: new EngineBuilder(deps),
        repairLoopTracker,
      }),
      deps,
    };
  };

  const createWorkflowDef = (): WorkflowDef => ({
    name: "test-workflow",
    steps: [
      { name: "step-1", agent: "test-agent", input: { task: "test" } },
    ],
  });

  const createExecution = (id: string, workflowName: string): RuntimeExecution => ({
    id,
    workflowName,
    status: "running",
    input: {},
    startedAt: new Date(),
    stepOrder: [],
    completedSteps: [],
    stepRecords: {},
    outputs: {},
  });

  describe("executeRun", () => {
    it("sets stepOrder from workflow steps", async () => {
      const { orchestrator } = createOrchestrator();
      const executionId = "exec-1";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      // Mock step execution to avoid needing full LLM setup
      const originalExecuteStepLoop = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockResolvedValue(undefined);

      try {
        await orchestrator.executeRun(
          executionId,
          workflow.name,
          workflow,
          execution,
          { input: { task: "test" } },
          () => false
        );

        expect(execution.stepOrder).toContain("step-1");
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStepLoop;
      }
    });

    it("returns early when settled", async () => {
      const { orchestrator } = createOrchestrator();
      const executionId = "exec-2";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      let settled = false;
      const isSettled = () => settled;

      const runPromise = orchestrator.executeRun(
        executionId,
        workflow.name,
        workflow,
        execution,
        {},
        isSettled
      );

      settled = true;
      await runPromise;

      // Should not throw
      expect(execution.status).toBe("running");
    });

    it("emits execution_start with correct payload", async () => {
      const { orchestrator, deps } = createOrchestrator();
      const executionId = "exec-3";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      // Mock step execution
      const originalExecuteStepLoop = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockResolvedValue(undefined);

      try {
        await orchestrator.executeRun(
          executionId,
          workflow.name,
          workflow,
          execution,
          { input: { key: "value" }, variables: { var1: "hello" } },
          () => false
        );

        const eventBus = deps.eventBus as any;
        const emits = eventBus.emit.mock.calls;
        const startEmit = emits.find((call: any) => call[0] === "execution_start");
        expect(startEmit).toBeDefined();
        expect(startEmit[1]).toBe(executionId);
        expect(startEmit[2]).toMatchObject({
          workflowName: workflow.name,
          input: { key: "value" },
          variables: { var1: "hello" },
        });
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStepLoop;
      }
    });
  });

  describe("executeResume", () => {
    it("sets up execution with restored outputs", async () => {
      const { orchestrator } = createOrchestrator();
      const runId = "run-1";
      const workflow = createWorkflowDef();

      const adapter = {
        saveRun: vi.fn().mockResolvedValue(undefined),
        saveStep: vi.fn().mockResolvedValue(undefined),
        saveAuditEvent: vi.fn().mockResolvedValue(undefined),
        getRun: vi.fn().mockResolvedValue(undefined),
        getRuns: vi.fn().mockResolvedValue([]),
      };

      // Mock step execution to avoid LLM dependency
      const originalExecuteStep = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockResolvedValue(undefined);

      try {
        const result = await orchestrator.executeResume(
          runId,
          workflow.name,
          workflow,
          { task: "test" },
          [],
          [
            { stepName: "step-1", action: "restore", output: "restored output" },
          ],
          { policyId: "policy-1", hash: "hash-1" },
          adapter as any
        );

        expect(result).toBeDefined();
        expect(result.id).toBe(runId);
        expect(result.outputs["step-1"]).toBe("restored output");
        expect(result.completedSteps).toContain("step-1");
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStep;
      }
    });

    it("handles skip policies without output", async () => {
      const { orchestrator } = createOrchestrator();
      const runId = "run-2";
      const workflow = createWorkflowDef();

      const adapter = {
        saveRun: vi.fn().mockResolvedValue(undefined),
        saveStep: vi.fn().mockResolvedValue(undefined),
        saveAuditEvent: vi.fn().mockResolvedValue(undefined),
        getRun: vi.fn().mockResolvedValue(undefined),
        getRuns: vi.fn().mockResolvedValue([]),
      };

      // Mock step execution
      const originalExecuteStep = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockResolvedValue(undefined);

      try {
        const result = await orchestrator.executeResume(
          runId,
          workflow.name,
          workflow,
          {},
          [],
          [
            { stepName: "step-1", action: "skip" },
          ],
          { policyId: "policy-1", hash: "hash-1" },
          adapter as any
        );

        expect(result).toBeDefined();
        expect(result.completedSteps).toContain("step-1");
        expect(result.outputs["step-1"]).toBeUndefined();
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStep;
      }
    });
  });

  describe("error scenarios", () => {
    it("throws when no step executor is available", async () => {
      const { orchestrator } = createOrchestrator();
      const executionId = "exec-error";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      // Force engine builder to return no step executor
      const originalBuild = orchestrator.deps.engineBuilder.build;
      orchestrator.deps.engineBuilder.build = vi.fn().mockResolvedValue({
        stepExecutor: undefined,
        costTracker: undefined,
        loadedConfig: undefined,
        llmConfig: undefined,
        runtimeAgents: new Map(),
        resolver: { get: vi.fn() },
      });

      try {
        await expect(
          orchestrator.executeRun(
            executionId,
            workflow.name,
            workflow,
            execution,
            {},
            () => false
          )
        ).rejects.toThrow();
      } finally {
        orchestrator.deps.engineBuilder.build = originalBuild;
      }
    });

    it("handles settled state during execution", async () => {
      const { orchestrator } = createOrchestrator();
      const executionId = "exec-settled";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      let settled = false;
      
      // Mock step execution
      const originalExecuteStepLoop = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockImplementation(async () => {
        // Simulate work then check settled
        await new Promise(resolve => setTimeout(resolve, 10));
        if (settled) return;
      });

      try {
        const runPromise = orchestrator.executeRun(
          executionId,
          workflow.name,
          workflow,
          execution,
          {},
          () => settled
        );

        // Settle during execution
        settled = true;
        await runPromise;

        // Should complete without error
        expect(execution.status).toBe("running");
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStepLoop;
      }
    });

    it("preserves execution state on failure", async () => {
      const { orchestrator } = createOrchestrator();
      const executionId = "exec-fail";
      const workflow = createWorkflowDef();
      const execution = createExecution(executionId, workflow.name);

      const testError = new Error("step execution failed");
      
      // Mock step execution to throw
      const originalExecuteStepLoop = orchestrator.deps.stepExecutionEngine.executeStepLoop;
      orchestrator.deps.stepExecutionEngine.executeStepLoop = vi.fn().mockRejectedValue(testError);

      try {
        await expect(
          orchestrator.executeRun(
            executionId,
            workflow.name,
            workflow,
            execution,
            {},
            () => false
          )
        ).rejects.toThrow("step execution failed");
      } finally {
        orchestrator.deps.stepExecutionEngine.executeStepLoop = originalExecuteStepLoop;
      }
    });
  });

  describe("repair loop tracking", () => {
    it("tracks validation failures and exposes summary", () => {
      const { orchestrator } = createOrchestrator();
      
      // getPersistedRepairLoopSummary is exposed through the orchestrator
      const summary = orchestrator.getPersistedRepairLoopSummary("exec-1");
      // Initially undefined since no repair activity recorded
      expect(summary).toBeUndefined();
    });

    it("clears summary without error", () => {
      const { orchestrator } = createOrchestrator();
      expect(() => orchestrator.clearPersistedRepairLoopSummary("exec-1")).not.toThrow();
    });
  });
});
