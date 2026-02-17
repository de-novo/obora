export class OboraRuntime {
  constructor(_options?: unknown) {}

  define(_name: string, _workflow: unknown): this {
    throw new Error('not implemented');
  }

  run(_name: string, _options?: unknown): Promise<unknown> {
    throw new Error('not implemented');
  }

  registerAgent(_name: string, _factory: unknown): this {
    throw new Error('not implemented');
  }

  registerTool(_name: string, _tool: unknown): this {
    throw new Error('not implemented');
  }

  registerPattern(_pattern: unknown): this {
    throw new Error('not implemented');
  }

  registerPlugin(_plugin: unknown): this {
    throw new Error('not implemented');
  }
}
