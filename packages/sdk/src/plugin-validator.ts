import { PLUGIN_TYPES, type PluginMetadata } from "./plugin-types.js";
import { OboraError, OboraErrorCode } from "./runtime-errors.js";

/**
 * Validates the `obora` field from a package.json.
 * Throws OboraError if invalid.
 */
export function validatePluginMetadata(
  packageName: string,
  oboraField: unknown,
): PluginMetadata {
  if (!oboraField || typeof oboraField !== "object") {
    throw OboraError.pluginInvalid(
      `Plugin "${packageName}": missing or invalid "obora" field in package.json`,
    );
  }

  const meta = oboraField as Record<string, unknown>;

  if (!meta.type || typeof meta.type !== "string") {
    throw OboraError.pluginInvalid(
      `Plugin "${packageName}": "obora.type" is required`,
    );
  }

  if (!PLUGIN_TYPES.includes(meta.type as PluginMetadata["type"])) {
    throw OboraError.pluginInvalid(
      `Plugin "${packageName}": invalid type "${meta.type}". Must be one of: ${PLUGIN_TYPES.join(", ")}`,
    );
  }

  if (!meta.exports || typeof meta.exports !== "string") {
    throw OboraError.pluginInvalid(
      `Plugin "${packageName}": "obora.exports" is required`,
    );
  }

  if (!meta.name || typeof meta.name !== "string") {
    throw OboraError.pluginInvalid(
      `Plugin "${packageName}": "obora.name" is required`,
    );
  }

  return {
    type: meta.type as PluginMetadata["type"],
    exports: meta.exports,
    name: meta.name,
  };
}
