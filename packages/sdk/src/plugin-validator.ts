import { PLUGIN_TYPES, type PluginMetadata } from "./plugin-types.js";
import { OboraError, OboraErrorCode } from "./runtime.js";

/**
 * Validates the `obora` field from a package.json.
 * Throws OboraError if invalid.
 */
export function validatePluginMetadata(
  packageName: string,
  oboraField: unknown,
): PluginMetadata {
  if (!oboraField || typeof oboraField !== "object") {
    throw new OboraError(
      `Plugin "${packageName}": missing or invalid "obora" field in package.json`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  const meta = oboraField as Record<string, unknown>;

  if (!meta.type || typeof meta.type !== "string") {
    throw new OboraError(
      `Plugin "${packageName}": "obora.type" is required`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  if (!PLUGIN_TYPES.includes(meta.type as PluginMetadata["type"])) {
    throw new OboraError(
      `Plugin "${packageName}": invalid type "${meta.type}". Must be one of: ${PLUGIN_TYPES.join(", ")}`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  if (!meta.exports || typeof meta.exports !== "string") {
    throw new OboraError(
      `Plugin "${packageName}": "obora.exports" is required`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  if (!meta.name || typeof meta.name !== "string") {
    throw new OboraError(
      `Plugin "${packageName}": "obora.name" is required`,
      OboraErrorCode.SDK_INVALID_PLUGIN,
    );
  }

  return {
    type: meta.type as PluginMetadata["type"],
    exports: meta.exports,
    name: meta.name,
  };
}
