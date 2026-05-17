import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { OboraError, OboraErrorCode } from "../runtime-errors.js";
import type { WorkflowDef } from "../workflow.js";
import { MockAgent } from "./mock-agent.js";
import { MockTool } from "./mock-tool.js";
import type { WorkflowTestCase } from "./test-runner.js";

export interface YamlFixture {
  name: string;
  workflow: string | WorkflowDef;
  input?: unknown;
  mocks?: {
    agents?: Array<{ name: string; responses: Record<string, unknown> }>;
    tools?: Array<{ name: string; responses: Record<string, unknown> }>;
  };
  expect: {
    status: "completed" | "failed" | "waiting";
    events?: Array<{ type: string; contains?: Record<string, unknown> }>;
    errors?: Array<{ code: string }>;
  };
}

const VALID_STATUS = new Set(["completed", "failed", "waiting"]);

export function validateFixture(data: unknown): YamlFixture {
  if (!isRecord(data)) {
    throw fixtureError("Fixture must be an object");
  }

  if (typeof data.name !== "string" || data.name.trim().length === 0) {
    throw fixtureError("Fixture 'name' is required and must be a non-empty string");
  }

  if (typeof data.workflow === "string") {
    if (data.workflow.trim().length === 0) {
      throw fixtureError("Fixture 'workflow' is required and must be a non-empty string or object");
    }
  } else if (!isWorkflowDef(data.workflow)) {
    throw fixtureError("Fixture 'workflow' is required and must be a non-empty string or object");
  }

  if (!isRecord(data.expect)) {
    throw fixtureError("Fixture 'expect' is required and must be an object");
  }

  if (typeof data.expect.status !== "string" || !VALID_STATUS.has(data.expect.status)) {
    throw fixtureError("Fixture 'expect.status' must be one of: completed, failed, waiting");
  }

  if (data.expect.events !== undefined) {
    if (!Array.isArray(data.expect.events)) {
      throw fixtureError("Fixture 'expect.events' must be an array");
    }

    data.expect.events.forEach((event) => {
      if (!isRecord(event) || typeof event.type !== "string" || event.type.trim().length === 0) {
        throw fixtureError("Each item in 'expect.events' must include a non-empty string 'type'");
      }

      if (event.contains !== undefined && !isRecord(event.contains)) {
        throw fixtureError("'expect.events[].contains' must be an object when provided");
      }
    });
  }

  if (data.expect.errors !== undefined) {
    if (!Array.isArray(data.expect.errors)) {
      throw fixtureError("Fixture 'expect.errors' must be an array");
    }

    data.expect.errors.forEach((error) => {
      if (!isRecord(error) || typeof error.code !== "string" || error.code.trim().length === 0) {
        throw fixtureError("Each item in 'expect.errors' must include a non-empty string 'code'");
      }
    });
  }

  if (data.mocks !== undefined) {
    if (!isRecord(data.mocks)) {
      throw fixtureError("Fixture 'mocks' must be an object");
    }

    validateMockEntries(data.mocks.agents, "agents");
    validateMockEntries(data.mocks.tools, "tools");
  }

  return {
    name: data.name,
    workflow: data.workflow,
    ...(data.input !== undefined ? { input: data.input } : {}),
    ...(data.mocks !== undefined ? { mocks: data.mocks as YamlFixture["mocks"] } : {}),
    expect: data.expect as YamlFixture["expect"],
  };
}

export async function loadFixture(path: string): Promise<YamlFixture> {
  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw);
  return validateFixture(parsed);
}

export async function loadFixtures(dirPath: string): Promise<YamlFixture[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const fixtureFiles = entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")))
    .map((entry) => join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(fixtureFiles.map((filePath) => loadFixture(filePath)));
}

export function fixtureToTestCase(fixture: YamlFixture): WorkflowTestCase {
  const agents = fixture.mocks?.agents?.map((spec) => {
    const agent = new MockAgent(spec.name);

    Object.entries(spec.responses).forEach(([stepName, output]) => {
      agent.onStep(stepName, () => ({ output }));
    });

    return agent;
  });

  const tools = fixture.mocks?.tools?.map(
    (spec) =>
      new MockTool(spec.name, (_params, ctx) => {
        return spec.responses[ctx.stepName] ?? null;
      }),
  );

  return {
    name: fixture.name,
    workflow: fixture.workflow,
    input: fixture.input,
    mocks: {
      ...(agents ? { agents } : {}),
      ...(tools ? { tools } : {}),
    },
    expect: fixture.expect,
  };
}

function validateMockEntries(entries: unknown, kind: "agents" | "tools"): void {
  if (entries === undefined) {
    return;
  }

  if (!Array.isArray(entries)) {
    throw fixtureError(`Fixture 'mocks.${kind}' must be an array`);
  }

  entries.forEach((item) => {
    if (!isRecord(item)) {
      throw fixtureError(`Each item in 'mocks.${kind}' must be an object`);
    }

    if (typeof item.name !== "string" || item.name.trim().length === 0) {
      throw fixtureError(`Each item in 'mocks.${kind}' must include a non-empty string 'name'`);
    }

    if (!isRecord(item.responses)) {
      throw fixtureError(`Each item in 'mocks.${kind}' must include an object 'responses'`);
    }
  });
}

function isWorkflowDef(value: unknown): value is WorkflowDef {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.name === "string" && Array.isArray(value.steps);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fixtureError(message: string): OboraError {
  return OboraError.fixtureInvalid(message);
}
