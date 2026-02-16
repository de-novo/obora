import type { CollaborationPattern } from "./types.js";

export class PatternRegistry {
  private readonly patterns = new Map<string, CollaborationPattern>();

  register(pattern: CollaborationPattern): void {
    if (!pattern.name || pattern.name.trim().length === 0) {
      throw new Error("Pattern name is required");
    }

    this.patterns.set(pattern.name, pattern);
  }

  unregister(name: string): void {
    this.patterns.delete(name);
  }

  get(name: string): CollaborationPattern {
    const pattern = this.patterns.get(name);
    if (!pattern) {
      throw new Error(`Pattern '${name}' was not found`);
    }

    return pattern;
  }

  has(name: string): boolean {
    return this.patterns.has(name);
  }

  list(): CollaborationPattern[] {
    return [...this.patterns.values()];
  }
}
