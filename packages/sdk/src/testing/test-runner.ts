import { randomUUID } from "node:crypto";

import { OboraErrorCode } from "../runtime.js";
import { Workflow, type WorkflowDef, type WorkflowStep } from "../workflow.js";
import type { MockAgent } from "./mock-agent.js";
import type { MockTool } from "./mock-tool.js";

export interface WorkflowTestCase {
  name: string;
  /** Inline workflow definition or YAML path */
  workflow: WorkflowDef | string;
  input?: unknown;
  mocks?: {
    agents?: MockAgent[];
    tools?: MockTool[];
  };
  expect: {
    status: "completed" | "failed" | "waiting";
    events?: Array<{ type: string; contains?: Record<string, unknown> }>;
    errors?: Array<{ code: string }>;
  };
}

export interface TestFailure {
  field: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface TestResult {
  passed: boolean;
  name: string;
  duration: number;
  failures: TestFailure[];
  events: Array<{ type: string; payload?: unknown }>;
}

interface CollectedError {
  code: string;
  message: string;
  stepName?: string;
}

export async function runWorkflowTest(caseDef: WorkflowTestCase): Promise<TestResult> {
  const startTime = Date.now();
  const failures: TestFailure[] = [];
  const collectedEvents: Array<{ type: string; payload?: unknown }> = [];
  const collectedErrors: CollectedError[] = [];

  const executionId = randomUUID();

  const emit = (type: string, payload?: unknown) => {
    collectedEvents.push({ type, payload });
  };

  const addError = (error: CollectedError) => {
    collectedErrors.push(error);
    emit("error", error);
  };

  const workflow = await resolveWorkflow(caseDef.workflow);
  const agents = new Map((caseDef.mocks?.agents ?? []).map((agent) => [agent.name, agent]));
  const tools = new Map((caseDef.mocks?.tools ?? []).map((tool) => [tool.name, tool]));

  let status: "completed" | "failed" | "waiting" = "completed";
  const outputs = new Map<string, unknown>();

  emit("execution_start", {
    name: caseDef.name,
    workflow: workflow.name,
    executionId,
    input: caseDef.input,
  });

  for (const step of workflow.steps) {
    if (status !== "completed") {
      break;
    }

    const dependencyError = validateDependencies(step, outputs);
    if (dependencyError) {
      status = "failed";
      addError(dependencyError);
      break;
    }

    emit("step_start", {
      stepName: step.name,
      agent: step.agent,
      tool: step.tool,
    });

    if (step.gate) {
      status = "waiting";
      emit("gate_wait", {
        stepName: step.name,
        gate: step.gate,
      });
      break;
    }

    try {
      if (step.agent) {
        const agent = agents.get(step.agent);
        if (!agent) {
          status = "failed";
          addError({
            code: OboraErrorCode.ORCH_STEP_NOT_FOUND,
            message: `Mock agent not registered: ${step.agent}`,
            stepName: step.name,
          });
          break;
        }

        const result = await agent.execute({
          executionId,
          stepName: step.name,
          input: caseDef.input,
          variables: workflow.variables,
        });

        outputs.set(step.name, result.output);
      }

      if (step.tool) {
        const tool = tools.get(step.tool);
        if (!tool) {
          status = "failed";
          addError({
            code: OboraErrorCode.ADAPTER_TOOL_NOT_FOUND,
            message: `Mock tool not registered: ${step.tool}`,
            stepName: step.name,
          });
          break;
        }

        const toolInput = extractToolInput(step, caseDef.input, outputs);
        emit("tool_call", {
          stepName: step.name,
          tool: step.tool,
          params: toolInput,
        });

        const toolOutput = await tool.execute(toolInput, {
          executionId,
          stepName: step.name,
        });

        outputs.set(step.name, toolOutput);
        emit("tool_result", {
          stepName: step.name,
          tool: step.tool,
          result: toolOutput,
        });
      }

      emit("step_end", {
        stepName: step.name,
        status: "completed",
        output: outputs.get(step.name),
      });
    } catch (error) {
      status = "failed";
      addError({
        code: OboraErrorCode.SDK_UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : "Unknown test runner error",
        stepName: step.name,
      });
      break;
    }
  }

  emit("execution_end", {
    workflow: workflow.name,
    executionId,
    status,
  });

  if (caseDef.expect.status !== status) {
    failures.push({
      field: "status",
      expected: caseDef.expect.status,
      actual: status,
      message: `Expected status '${caseDef.expect.status}' but got '${status}'`,
    });
  }

  for (const expectedEvent of caseDef.expect.events ?? []) {
    const actual = collectedEvents.find(
      (event) => event.type === expectedEvent.type && containsSubset(event.payload, expectedEvent.contains),
    );

    if (!actual) {
      failures.push({
        field: `events.${expectedEvent.type}`,
        expected: expectedEvent,
        actual: collectedEvents.filter((event) => event.type === expectedEvent.type),
        message: `Expected event '${expectedEvent.type}' with matching payload was not emitted`,
      });
    }
  }

  for (const expectedError of caseDef.expect.errors ?? []) {
    const actual = collectedErrors.find((error) => error.code === expectedError.code);
    if (!actual) {
      failures.push({
        field: `errors.${expectedError.code}`,
        expected: expectedError,
        actual: collectedErrors,
        message: `Expected error code '${expectedError.code}' was not produced`,
      });
    }
  }

  const duration = Date.now() - startTime;

  return {
    passed: failures.length === 0,
    name: caseDef.name,
    duration,
    failures,
    events: collectedEvents,
  };
}

async function resolveWorkflow(workflow: WorkflowDef | string): Promise<WorkflowDef> {
  if (typeof workflow === "string") {
    return Workflow.fromYaml(workflow);
  }

  return Workflow.create(workflow);
}

function validateDependencies(step: WorkflowStep, outputs: Map<string, unknown>): CollectedError | null {
  for (const dep of step.depends_on ?? []) {
    if (!outputs.has(dep)) {
      return {
        code: OboraErrorCode.ORCH_DEPENDENCY_FAILED,
        message: `Dependency not completed: ${dep}`,
        stepName: step.name,
      };
    }
  }

  return null;
}

function extractToolInput(
  step: WorkflowStep,
  workflowInput: unknown,
  outputs: Map<string, unknown>,
): unknown {
  const configured = step.config?.input ?? step.config?.params;
  if (configured !== undefined) {
    return configured;
  }

  if (step.depends_on && step.depends_on.length > 0) {
    return step.depends_on.map((name) => outputs.get(name));
  }

  return workflowInput;
}

function containsSubset(actual: unknown, contains?: Record<string, unknown>): boolean {
  if (!contains) {
    return true;
  }

  if (!actual || typeof actual !== "object") {
    return false;
  }

  const source = actual as Record<string, unknown>;
  return Object.entries(contains).every(([key, value]) => deepEqual(source[key], value));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => deepEqual(value, b[index]));
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
