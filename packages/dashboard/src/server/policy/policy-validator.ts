import { load } from 'js-yaml';

import type { PolicyValidationResult } from '../types.js';

type PolicySet = {
  version?: string;
  tools?: Array<{ name?: unknown; effect?: unknown }>;
  gates?: unknown[];
  sandbox?: Record<string, unknown>;
  resources?: Record<string, unknown>;
};

const EFFECTS = new Set(['allow', 'deny', 'transform', 'gate']);

const asErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validatePolicySchema = (policySet: unknown): string[] => {
  const errors: string[] = [];

  if (!isObject(policySet)) {
    return ['Invalid policy YAML: expected object'];
  }

  if (policySet.version !== undefined && typeof policySet.version !== 'string') {
    errors.push('Invalid version: expected string');
  }

  if (policySet.tools !== undefined) {
    if (!Array.isArray(policySet.tools)) {
      errors.push('Invalid tools: expected array');
    } else {
      policySet.tools.forEach((tool, index) => {
        if (!isObject(tool)) {
          errors.push(`Invalid tools[${index}]: expected object`);
          return;
        }

        if (typeof tool.name !== 'string' || tool.name.length === 0) {
          errors.push(`Invalid tools[${index}].name: expected non-empty string`);
        }

        if (!EFFECTS.has(String(tool.effect))) {
          errors.push(`Invalid tools[${index}].effect: ${String(tool.effect)}`);
        }
      });
    }
  }

  if (policySet.gates !== undefined && !Array.isArray(policySet.gates)) {
    errors.push('Invalid gates: expected array');
  }

  if (policySet.sandbox !== undefined && !isObject(policySet.sandbox)) {
    errors.push('Invalid sandbox: expected object');
  }

  if (policySet.resources !== undefined && !isObject(policySet.resources)) {
    errors.push('Invalid resources: expected object');
  }

  return errors;
};

export const parsePolicyYaml = (content: string): { parsed: unknown; policySet?: PolicySet; errors: string[] } => {
  try {
    const parsed = load(content);
    const schemaErrors = validatePolicySchema(parsed);

    if (schemaErrors.length > 0) {
      return {
        parsed,
        errors: schemaErrors,
      };
    }

    return {
      parsed,
      policySet: parsed as PolicySet,
      errors: [],
    };
  } catch (error) {
    return {
      parsed: null,
      errors: [asErrorMessage(error)],
    };
  }
};

export const validatePolicyYaml = (content: string): PolicyValidationResult => {
  const result = parsePolicyYaml(content);

  return {
    valid: result.errors.length === 0,
    errors: result.errors,
  };
};
