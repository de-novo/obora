import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Resolver, FieldValues } from "react-hook-form";

/**
 * Create a zod resolver for react-hook-form
 */
export function createResolver<T extends z.ZodSchema>(
  schema: T
): Resolver<z.infer<T>> {
  return zodResolver(schema);
}

/**
 * Format Zod errors for display
 */
export function formatZodErrors<T extends FieldValues>(
  errors: Record<string, { message?: string }>
): Record<keyof T, string | undefined> {
  const formatted: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(errors)) {
    formatted[key] = value?.message;
  }
  return formatted as Record<keyof T, string | undefined>;
}

/**
 * Check if form has any errors
 */
export function hasFormErrors<T extends FieldValues>(
  errors: Record<string, unknown>
): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Get first error message from form errors
 */
export function getFirstError<T extends FieldValues>(
  errors: Record<string, { message?: string }>
): string | undefined {
  const firstKey = Object.keys(errors)[0];
  return firstKey ? errors[firstKey]?.message : undefined;
}

/**
 * Create default values from a Zod schema
 */
export function createDefaultValues<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T
): z.infer<T> {
  const shape = schema.shape;
  const defaults: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(shape)) {
    const zodValue = value as z.ZodTypeAny;

    if (zodValue._def.typeName === "ZodString") {
      defaults[key] = "";
    } else if (zodValue._def.typeName === "ZodNumber") {
      defaults[key] = 0;
    } else if (zodValue._def.typeName === "ZodBoolean") {
      defaults[key] = false;
    } else if (zodValue._def.typeName === "ZodArray") {
      defaults[key] = [];
    } else if (zodValue._def.typeName === "ZodObject") {
      defaults[key] = {};
    } else if (zodValue._def.typeName === "ZodOptional") {
      defaults[key] = undefined;
    } else if (zodValue._def.typeName === "ZodDefault") {
      defaults[key] = zodValue._def.defaultValue();
    } else {
      defaults[key] = undefined;
    }
  }

  return defaults as z.infer<T>;
}

/**
 * Merge form data with defaults
 */
export function mergeWithDefaults<T extends Record<string, unknown>>(
  defaults: T,
  values: Partial<T>
): T {
  return { ...defaults, ...values };
}
