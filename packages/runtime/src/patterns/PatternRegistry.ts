import type { PluginRegistry } from "../plugins/PluginRegistry.js";
import type { PatternPlugin } from "../plugins/types.js";
import type { CollaborationPattern } from "./types.js";

/**
 * PatternRegistry is a convenience facade over the pattern bucket in PluginRegistry.
 *
 * - Runtime implementations may register plain CollaborationPattern instances here.
 * - If a PluginRegistry facade is provided, lookup/list operations are type-linked to
 *   `type = "pattern"` plugin entries.
 */
export class PatternRegistry {
  private readonly patterns = new Map<string, CollaborationPattern>();

  constructor(
    private readonly pluginFacade?: Pick<PluginRegistry, "get" | "has" | "list">
  ) {}

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
    if (this.patterns.has(name)) {
      return this.patterns.get(name)!;
    }

    if (this.pluginFacade?.has("pattern", name)) {
      return this.pluginFacade.get<PatternPlugin>("pattern", name);
    }

    throw new Error(`Pattern '${name}' was not found`);
  }

  has(name: string): boolean {
    return this.patterns.has(name) || (this.pluginFacade?.has("pattern", name) ?? false);
  }

  list(): CollaborationPattern[] {
    if (!this.pluginFacade) {
      return [...this.patterns.values()];
    }

    const pluginPatterns = this.pluginFacade.list("pattern") as PatternPlugin[];
    const merged = new Map<string, CollaborationPattern>(pluginPatterns.map((pattern) => [pattern.name, pattern]));

    this.patterns.forEach((pattern, name) => {
      merged.set(name, pattern);
    });

    return [...merged.values()];
  }
}
