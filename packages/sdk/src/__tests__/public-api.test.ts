import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { OboraError, OboraErrorCode } from "../runtime-errors.js";
import {
  defineSchemaTool,
  defineTool,
  defineWorkflow,
  type InferSchemaInput,
  type InferSchemaOutput,
  type TypedRunHandle,
} from "../public-api.js";
import type { RuntimeExecution } from "../runtime-types.js";

describe("public typed SDK helpers", () => {
  it("defines a workflow while preserving variable types", () => {
    const workflow = defineWorkflow({
      name: "typed-workflow",
      variables: { topic: "sdk-hardening" },
      steps: [{ name: "plan", agent: "architect", input: { task: "Plan" } }],
    });

    expect(workflow.name).toBe("typed-workflow");
    expect(workflow.steps[0]?.name).toBe("plan");
    expectTypeOf(workflow.variables).toMatchTypeOf<{ topic: string } | undefined>();
  });

  it("keeps defineTool as a typed identity helper", async () => {
    const tool = defineTool<{ topic: string }, { runId: string }, { summary: string }>(
      async (params, context) => ({
        summary: `${context?.runId ?? "unknown"}:${params.topic}`,
      }),
    );

    const result = await tool({ topic: "public-api" }, { runId: "run-1" });

    expect(result).toEqual({ summary: "run-1:public-api" });
    expectTypeOf(result).toEqualTypeOf<{ summary: string }>();
  });

  it("parses schema tool input and exposes inferred schema types", async () => {
    const schema = z.object({ topic: z.string().min(1), count: z.number().int().default(1) });
    type Input = InferSchemaInput<typeof schema>;
    type Output = InferSchemaOutput<typeof schema>;
    expectTypeOf<Input>().toEqualTypeOf<{ topic: string; count?: number | undefined }>();
    expectTypeOf<Output>().toEqualTypeOf<{ topic: string; count: number }>();

    const tool = defineSchemaTool(
      schema,
      async (params) => `${params.topic}:${params.count}`,
      { name: "summarize" },
    );

    await expect(tool({ topic: "sdk" })).resolves.toBe("sdk:1");
  });

  it("wraps schema validation failures in OboraError", async () => {
    const tool = defineSchemaTool(
      z.object({ topic: z.string().min(1) }),
      async (params) => params.topic,
      { name: "typed-tool" },
    );

    let caught: unknown;
    try {
      await tool({ topic: "" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OboraError);
    expect(caught).toMatchObject({
      name: "OboraError",
      code: OboraErrorCode.SDK_TOOL_INPUT_INVALID,
      message: "Tool input failed schema validation for tool 'typed-tool'",
    } satisfies Partial<OboraError>);
  });

  it("supports typed run handles for public call sites", () => {
    type Input = { topic: string };
    type Outputs = { plan: string };
    type Execution = RuntimeExecution<Input, Outputs>;
    type Handle = TypedRunHandle<Input, Outputs>;

    expectTypeOf<Handle["wait"]>().returns.resolves.toEqualTypeOf<Execution>();
  });
});
