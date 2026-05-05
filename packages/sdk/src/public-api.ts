import type { z } from "zod";

import { OboraError } from "./runtime-errors.js";
import type { PluginToolHandler, RunHandle, RunOptions, RuntimeExecution } from "./runtime-types.js";
import { Workflow, type WorkflowDef } from "./workflow.js";

export type InferSchemaInput<TSchema extends z.ZodType> = z.input<TSchema>;
export type InferSchemaOutput<TSchema extends z.ZodType> = z.output<TSchema>;

export type TypedRuntimeExecution<
  TInput = unknown,
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
  TStepRecords extends Record<string, unknown> = Record<string, unknown>,
> = RuntimeExecution<TInput, TOutputs, TStepRecords>;

export type TypedRunHandle<
  TInput = unknown,
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
  TStepRecords extends Record<string, unknown> = Record<string, unknown>,
> = RunHandle<TypedRuntimeExecution<TInput, TOutputs, TStepRecords>>;

export type TypedRunOptions<
  TInput = unknown,
  TVariables extends Record<string, unknown> = Record<string, unknown>,
> = RunOptions<TInput, TVariables>;

export interface DefineSchemaToolOptions {
  name?: string;
}

export function defineWorkflow<
  TVariables extends Record<string, unknown> = Record<string, unknown>,
  TAgents extends Record<string, unknown> = Record<string, unknown>,
  TDefinition extends WorkflowDef<TVariables, TAgents> = WorkflowDef<TVariables, TAgents>,
>(definition: TDefinition): TDefinition {
  return Workflow.create(definition) as TDefinition;
}

export function defineTool<TParams = unknown, TContext = unknown, TResult = unknown>(
  handler: PluginToolHandler<TParams, TContext, TResult>,
): PluginToolHandler<TParams, TContext, TResult> {
  return handler;
}

export function defineSchemaTool<TSchema extends z.ZodType, TContext = unknown, TResult = unknown>(
  schema: TSchema,
  handler: (
    params: InferSchemaOutput<TSchema>,
    context?: TContext
  ) => TResult | Promise<TResult>,
  options: DefineSchemaToolOptions = {},
): PluginToolHandler<InferSchemaInput<TSchema>, TContext, TResult> {
  return (params, context) => {
    const parsed = schema.safeParse(params);
    if (!parsed.success) {
      throw OboraError.toolInputInvalid(options.name, parsed.error);
    }

    return handler(parsed.data, context);
  };
}
