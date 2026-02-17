/**
 * Valid plugin types as defined in SCHEMAS.md PluginType.
 * package.json `obora.type` MUST use these exact strings.
 */
export const PLUGIN_TYPES = [
  "pattern",
  "policy-rule",
  "tool",
  "agent",
  "audit-store",
  "recovery-strategy",
  "consensus-rule",
  "state-transform",
] as const;

export type PluginType = (typeof PLUGIN_TYPES)[number];

/**
 * Plugin metadata from package.json `obora` field.
 */
export interface PluginMetadata {
  /** Plugin type — must be a valid SCHEMAS.md PluginType */
  type: PluginType;
  /** Module export path (relative to package root) */
  exports: string;
  /** Plugin display name (unique within type) */
  name: string;
}

/**
 * Resolved plugin descriptor after discovery.
 */
export interface PluginDescriptor {
  /** npm package name */
  packageName: string;
  /** Package version */
  version: string;
  /** Resolved absolute path to package */
  packagePath: string;
  /** Plugin metadata from package.json */
  metadata: PluginMetadata;
}

/**
 * Loaded plugin instance ready for registration.
 */
export interface LoadedPlugin {
  descriptor: PluginDescriptor;
  /** The actual plugin module exports */
  module: unknown;
}
