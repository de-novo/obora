import { readFileSync } from "node:fs";

export type MinimalJsonSchema = Record<string, unknown>;

export function loadMinimalJsonSchema(schemaPath: string): MinimalJsonSchema | undefined {
  try {
    const raw = readFileSync(schemaPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function findSchemaMismatchReason(
  candidate: unknown,
  schema?: MinimalJsonSchema,
): string | undefined {
  return findSchemaMismatchReasonAtPath(candidate, schema, "");
}

function findSchemaMismatchReasonAtPath(
  candidate: unknown,
  schema: MinimalJsonSchema | undefined,
  path: string,
): string | undefined {
  const location = path ? `field '${path}'` : "value";

  if (schema && Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    );
    const matched = options.some((option) => findSchemaMismatchReasonAtPath(candidate, option, path) === undefined);
    if (!matched) {
      return `${location} did not match any allowed schema option`;
    }
    return undefined;
  }

  if (schema && Array.isArray(schema.oneOf)) {
    const options = schema.oneOf.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    );
    const matchCount = options.filter(
      (option) => findSchemaMismatchReasonAtPath(candidate, option, path) === undefined,
    ).length;
    if (matchCount !== 1) {
      return `${location} did not match exactly one schema option`;
    }
    return undefined;
  }

  if (schema && Array.isArray(schema.allOf)) {
    const options = schema.allOf.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    );
    const failed = options.some(
      (option) => findSchemaMismatchReasonAtPath(candidate, option, path) !== undefined,
    );
    if (failed) {
      return `${location} did not satisfy all schema requirements`;
    }
    return undefined;
  }

  const expectedType = typeof schema?.type === "string" ? schema.type : undefined;
  if (expectedType && !matchesJsonType(candidate, expectedType)) {
    const location = path ? `field '${path}'` : "declared schema";
    if (!path && expectedType === "object") {
      return "declared schema expects a top-level JSON object payload";
    }
    return `${location} should be ${expectedType}, got ${describeJsonType(candidate)}`;
  }

  if (schema && Array.isArray(schema.enum)) {
    const allowed = schema.enum;
    const matched = allowed.some((entry) => JSON.stringify(entry) === JSON.stringify(candidate));
    if (!matched) {
      const location = path ? `field '${path}'` : "value";
      const rendered = allowed.map((entry) => String(entry)).join(", ");
      return `${location} should be one of: ${rendered}; got ${JSON.stringify(candidate)}`;
    }
  }

  if (expectedType === "array" && Array.isArray(candidate)) {
    const items = schema?.items;
    const itemSchema = items && typeof items === "object" && !Array.isArray(items)
      ? (items as Record<string, unknown>)
      : undefined;
    if (itemSchema) {
      for (const [index, item] of candidate.entries()) {
        const reason = findSchemaMismatchReasonAtPath(item, itemSchema, `${path}[${index}]`);
        if (reason) return reason;
      }
    }
    return undefined;
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }

  const candidateRecord = candidate as Record<string, unknown>;
  const required = Array.isArray(schema?.required)
    ? schema.required.filter((entry): entry is string => typeof entry === "string")
    : [];
  const missing = required.filter((key) => candidateRecord[key] === undefined);
  if (missing.length > 0) {
    const qualified = missing.map((key) => (path ? `${path}.${key}` : key));
    return `missing required field(s): ${qualified.join(", ")}`;
  }

  const properties = schema?.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, rawProp] of Object.entries(properties as Record<string, unknown>)) {
      if (candidateRecord[key] === undefined) continue;
      if (!rawProp || typeof rawProp !== "object" || Array.isArray(rawProp)) continue;
      const prop = rawProp as Record<string, unknown>;
      const nextPath = path ? `${path}.${key}` : key;
      const reason = findSchemaMismatchReasonAtPath(candidateRecord[key], prop, nextPath);
      if (reason) return reason;
    }
  }

  return undefined;
}

function matchesJsonType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function describeJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}
