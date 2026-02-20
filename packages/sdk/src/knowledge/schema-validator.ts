import { parse } from "yaml";

export interface KnowledgeSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface KnowledgeSchema {
  version: string;
  name: string;
  tagRules: {
    depth: number;
    separator: string;
    pattern: string;
  };
  fields: {
    required: string[];
    optional?: string[];
  };
  limits: {
    maxTagsPerEntry: number;
    maxBodyChars: number;
    maxTitleChars: number;
  };
}

export function validateKnowledgeTag(tag: string, pattern: RegExp): boolean {
  return pattern.test(tag);
}

export function parseKnowledgeSchema(yamlContent: string): KnowledgeSchema {
  return parse(yamlContent) as KnowledgeSchema;
}

export function validateKnowledgeSchema(schema: KnowledgeSchema): KnowledgeSchemaValidationResult {
  const errors: string[] = [];

  if (!schema.version) errors.push("version is required");
  if (!schema.name) errors.push("name is required");

  if (!schema.tagRules) {
    errors.push("tagRules is required");
  } else {
    if (schema.tagRules.depth !== 3) errors.push("tagRules.depth must be 3");
    if (!schema.tagRules.separator) errors.push("tagRules.separator is required");
    if (!schema.tagRules.pattern) errors.push("tagRules.pattern is required");
  }

  if (!schema.fields?.required || schema.fields.required.length === 0) {
    errors.push("fields.required must contain at least 1 item");
  }

  if (!schema.limits) {
    errors.push("limits is required");
  } else {
    if (schema.limits.maxTagsPerEntry <= 0) errors.push("limits.maxTagsPerEntry must be > 0");
    if (schema.limits.maxBodyChars <= 0) errors.push("limits.maxBodyChars must be > 0");
    if (schema.limits.maxTitleChars <= 0) errors.push("limits.maxTitleChars must be > 0");
  }

  return { valid: errors.length === 0, errors };
}

export function validateKnowledgeSchemaContent(yamlContent: string): KnowledgeSchemaValidationResult {
  try {
    const schema = parseKnowledgeSchema(yamlContent);
    return validateKnowledgeSchema(schema);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
