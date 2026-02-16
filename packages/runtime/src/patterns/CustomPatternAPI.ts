import type { PatternRegistry } from "./PatternRegistry.js";
import {
  CollaborationPatternBase,
  type CollaborationPattern,
  type CustomPatternDefinition,
  type PatternConfig,
  type PatternPayloadResult,
  type PatternRuntimeContext,
} from "./types.js";

export type { CustomPatternDefinition } from "./types.js";

export interface RegisterCustomPatternOptions {
  replace?: boolean;
  logger?: Pick<Console, "warn">;
}

class ConfigBackedCustomPattern extends CollaborationPatternBase {
  readonly name: string;
  readonly kind: string;
  readonly version: string;
  readonly description?: string;

  constructor(private readonly definition: CustomPatternDefinition) {
    super();
    this.name = definition.name;
    this.kind = definition.kind ?? definition.name;
    this.version = definition.version ?? "1.0.0";
    this.description = definition.description;
  }

  validateConfig(config: PatternConfig): void {
    this.definition.validateConfig?.(config);
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    return this.definition.execute(context);
  }
}

export function registerCustomPattern(
  registry: PatternRegistry,
  pattern: CollaborationPattern,
  options: RegisterCustomPatternOptions = {}
): void {
  validatePatternContract(pattern);

  const existing = registry.has(pattern.name) ? registry.get(pattern.name) : undefined;

  if (existing && !options.replace) {
    throw new Error(`Custom pattern '${pattern.name}' is already registered`);
  }

  if (existing && options.replace) {
    if ((existing.version ?? "1.0.0") === (pattern.version ?? "1.0.0")) {
      (options.logger ?? console).warn(
        `Custom pattern '${pattern.name}' is being replaced with the same version '${pattern.version ?? "1.0.0"}'`
      );
    }
    registry.unregister(pattern.name);
  }

  registry.register(pattern);
}

export function registerCustomPatternFromConfig(
  registry: PatternRegistry,
  config: CustomPatternDefinition,
  options: RegisterCustomPatternOptions = {}
): void {
  validateCustomPatternDefinition(config);
  registerCustomPattern(registry, new ConfigBackedCustomPattern(config), options);
}

function validatePatternContract(pattern: CollaborationPattern): void {
  if (!pattern || typeof pattern !== "object") {
    throw new Error("Custom pattern must be an object");
  }

  if (typeof pattern.name !== "string" || pattern.name.trim().length === 0) {
    throw new Error("Custom pattern name is required");
  }

  if (typeof pattern.kind !== "string" || pattern.kind.trim().length === 0) {
    throw new Error("Custom pattern kind is required");
  }

  if (typeof pattern.run !== "function") {
    throw new Error("Custom pattern must implement run(context)");
  }

  if (typeof pattern.execute !== "function") {
    throw new Error("Custom pattern must implement execute(context)");
  }
}

function validateCustomPatternDefinition(config: CustomPatternDefinition): void {
  if (!config || typeof config !== "object") {
    throw new Error("Custom pattern definition must be an object");
  }

  if (typeof config.name !== "string" || config.name.trim().length === 0) {
    throw new Error("Custom pattern definition name is required");
  }

  if (typeof config.execute !== "function") {
    throw new Error("Custom pattern definition execute(context) is required");
  }

  if (config.validateConfig !== undefined && typeof config.validateConfig !== "function") {
    throw new Error("Custom pattern definition validateConfig must be a function");
  }
}
