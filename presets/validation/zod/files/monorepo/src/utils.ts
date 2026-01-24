import { z, ZodError, ZodSchema } from "zod";

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FormattedError[] };

/**
 * Formatted error for API responses
 */
export interface FormattedError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Format Zod errors into a consistent structure
 */
export function formatZodErrors(error: ZodError): FormattedError[] {
  return error.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Safe parse with formatted errors
 */
export function safeParse<T extends ZodSchema>(
  schema: T,
  data: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Async safe parse with formatted errors
 */
export async function safeParseAsync<T extends ZodSchema>(
  schema: T,
  data: unknown
): Promise<ValidationResult<z.infer<T>>> {
  const result = await schema.safeParseAsync(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: formatZodErrors(result.error) };
}

/**
 * Create a validation function for a schema
 */
export function createValidator<T extends ZodSchema>(schema: T) {
  return (data: unknown) => safeParse(schema, data);
}

/**
 * Assert that data matches schema, throw if not
 */
export function assertValid<T extends ZodSchema>(
  schema: T,
  data: unknown,
  message?: string
): asserts data is z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(message ?? `Validation failed: ${result.error.message}`);
  }
}

/**
 * Check if data matches schema (type guard)
 */
export function isValid<T extends ZodSchema>(
  schema: T,
  data: unknown
): data is z.infer<T> {
  return schema.safeParse(data).success;
}

/**
 * Coerce and validate query parameters
 */
export function parseQueryParams<T extends ZodSchema>(
  schema: T,
  params: Record<string, string | string[] | undefined>
): ValidationResult<z.infer<T>> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    normalized[key] = Array.isArray(value) ? value : value;
  }

  return safeParse(schema, normalized);
}
