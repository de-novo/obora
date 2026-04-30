import { deepFreeze } from "./utils.js";
import type { StepErrorMetadata } from "./types.js";

export interface StepRuntimeRecord {
  success: boolean;
  output: string | null;
  error: string | null;
  errorMeta?: StepErrorMetadata | null;
  diagnosisCode: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

export interface RuntimeState {
  state: {
    context: {
      workflow?: Record<string, unknown>;
      steps: Record<string, StepRuntimeRecord>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class Blackboard {
  #state: RuntimeState;
  #version = 1;

  constructor(initialState?: Partial<RuntimeState>) {
    this.#state = {
      state: {
        context: {
          steps: {},
        },
      },
    };

    if (initialState) {
      this.#state = {
        ...this.#state,
        ...structuredClone(initialState),
        state: {
          ...this.#state.state,
          ...structuredClone(initialState.state ?? {}),
          context: {
            ...this.#state.state.context,
            ...structuredClone(initialState.state?.context ?? {}),
            steps: {
              ...this.#state.state.context.steps,
              ...(structuredClone(initialState.state?.context?.steps ?? {}) as Record<
                string,
                StepRuntimeRecord
              >),
            },
          },
        },
      };
    }
  }

  get version(): number {
    return this.#version;
  }

  #write(path: string, value: unknown): void {
    const parts = path.split(".");
    let cursor: Record<string, unknown> = this.#state as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const next = cursor[key];
      if (next == null || typeof next !== "object") {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = structuredClone(value);
    this.#version += 1;
  }

  read<T = unknown>(path: string, options?: { strict?: boolean }): T {
    const parts = path.split(".");
    let cursor: unknown = this.#state;
    for (const key of parts) {
      if (cursor == null || typeof cursor !== "object" || !(key in (cursor as object))) {
        if (options?.strict === false) {
          return undefined as T;
        }
        throw new Error(`Path not found: ${path}`);
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return structuredClone(cursor) as T;
  }

  exists(path: string): boolean {
    return this.read(path, { strict: false }) !== undefined;
  }


  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  off(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  once(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  emit(_event: string, ..._args: unknown[]): boolean {
    return false;
  }

  removeAllListeners(_event?: string): this {
    return this;
  }

  listenerCount(_event: string): number {
    return 0;
  }
  recordStepResult(name: string, result: StepRuntimeRecord): void {
    this.#write(`state.context.steps.${name}`, result);
  }

  recordStepError(
    name: string,
    error: Omit<StepErrorMetadata, "code"> & { code?: StepErrorMetadata["code"] },
  ): void {
    this.#write(`state.context.steps.${name}`, {
      success: false,
      output: null,
      error: error.message,
      errorMeta: error.code ? (error as StepErrorMetadata) : null,
      diagnosisCode: error.code ?? null,
      completedAt: null,
      failedAt: error.failedAt ?? new Date().toISOString(),
    } satisfies StepRuntimeRecord);
  }

  getSnapshot(): Readonly<RuntimeState> {
    return deepFreeze(structuredClone(this.#state));
  }
}
