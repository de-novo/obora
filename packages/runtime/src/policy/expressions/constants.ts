export const MAX_EXPRESSION_DEPTH = 50;

export const ALLOWED_EXPRESSION_ROOTS = new Set([
  "action",
  "context",
  "state",
  "step",
  "execution",
  "actor",
  "metrics",
  "previousResults",
]);

export const BLOCKED_FIELD_NAMES = new Set(["__proto__", "prototype", "constructor"]);

export const ALLOWED_EXPRESSION_FUNCTIONS = new Set([
  "contains",
  "matches",
  "startsWith",
  "endsWith",
  "in",
]);

export const MAX_REGEX_PATTERN_LENGTH = 256;
