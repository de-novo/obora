/**
 * M6-02: CheckpointableFactory registry
 *
 * Manages type→factory mappings for restoring checkpointed state.
 */

import type { CheckpointableFactory } from "../storage/types.js";

export class CheckpointFactoryNotFoundError extends Error {
  constructor(public readonly typeName: string) {
    super(`CheckpointableFactory not registered for type: ${typeName}`);
    this.name = "CheckpointFactoryNotFoundError";
  }
}

export class CheckpointFactoryRegistry {
  private readonly factories = new Map<string, CheckpointableFactory<unknown>>();

  register<T>(typeName: string, factory: CheckpointableFactory<T>): void {
    this.factories.set(typeName, factory as CheckpointableFactory<unknown>);
  }

  get<T>(typeName: string): CheckpointableFactory<T> {
    const factory = this.factories.get(typeName);
    if (!factory) {
      throw new CheckpointFactoryNotFoundError(typeName);
    }
    return factory as CheckpointableFactory<T>;
  }

  has(typeName: string): boolean {
    return this.factories.has(typeName);
  }
}
