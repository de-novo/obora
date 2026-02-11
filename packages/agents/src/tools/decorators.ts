import { Tool, ToolParameterSchema, PropertySchema } from './types';
import { globalToolRegistry } from './registry';

interface ToolMetadata {
  name: string;
  description: string;
  parameters?: ToolParameterSchema;
  category?: string;
  version?: string;
  hasSideEffects?: boolean;
  requiredPermissions?: string[];
}

export function tool(metadata: ToolMetadata) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    const toolDef: Tool = {
      name: metadata.name,
      description: metadata.description,
      parameters: metadata.parameters ?? { type: 'object', properties: {} },
      category: metadata.category,
      version: metadata.version,
      hasSideEffects: metadata.hasSideEffects ?? true,
      requiredPermissions: metadata.requiredPermissions,
      async execute(params, context) {
        return originalMethod.call(target, params, context);
      },
    };

    globalToolRegistry.register(toolDef);

    return descriptor;
  };
}

export class ParameterSchemaBuilder {
  private schema: ToolParameterSchema = {
    type: 'object',
    properties: {},
    required: [],
  };

  string(name: string, description: string, options?: {
    required?: boolean;
    enum?: string[];
    default?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  }): this {
    const { required, ...restOptions } = options ?? {};
    this.schema.properties![name] = { type: 'string', description, ...restOptions };
    if (required) this.schema.required!.push(name);
    return this;
  }

  number(name: string, description: string, options?: {
    required?: boolean;
    minimum?: number;
    maximum?: number;
    default?: number;
  }): this {
    const { required, ...restOptions } = options ?? {};
    this.schema.properties![name] = { type: 'number', description, ...restOptions };
    if (required) this.schema.required!.push(name);
    return this;
  }

  boolean(name: string, description: string, options?: {
    required?: boolean;
    default?: boolean;
  }): this {
    const { required, ...restOptions } = options ?? {};
    this.schema.properties![name] = { type: 'boolean', description, ...restOptions };
    if (required) this.schema.required!.push(name);
    return this;
  }

  array(name: string, description: string, items: PropertySchema, options?: {
    required?: boolean;
  }): this {
    const { required, ...restOptions } = options ?? {};
    this.schema.properties![name] = { type: 'array', description, items, ...restOptions };
    if (required) this.schema.required!.push(name);
    return this;
  }

  object(name: string, description: string, properties: Record<string, PropertySchema>, options?: {
    required?: boolean;
  }): this {
    const { required, ...restOptions } = options ?? {};
    this.schema.properties![name] = { type: 'object', description, properties, ...restOptions };
    if (required) this.schema.required!.push(name);
    return this;
  }

  build(): ToolParameterSchema {
    return this.schema;
  }
}

export function params(): ParameterSchemaBuilder {
  return new ParameterSchemaBuilder();
}
