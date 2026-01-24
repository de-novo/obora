import { z } from "zod";

// ============================================================================
// Primitive Schemas
// ============================================================================

export const emailSchema = z.string().email("Invalid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const uuidSchema = z.string().uuid("Invalid UUID");

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");

export const urlSchema = z.string().url("Invalid URL");

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number");

export const nonEmptyString = z.string().min(1, "Required");

export const positiveNumber = z.number().positive("Must be positive");

export const nonNegativeNumber = z.number().nonnegative("Must be non-negative");

// ============================================================================
// Pagination
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ============================================================================
// Search
// ============================================================================

export const searchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  filters: z.record(z.string()).optional(),
});

export type SearchInput = z.infer<typeof searchSchema>;

// ============================================================================
// Date Range
// ============================================================================

export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be before or equal to end date",
    path: ["startDate"],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

// ============================================================================
// ID Schemas
// ============================================================================

export const idSchema = z.union([
  z.string().uuid(),
  z.coerce.number().int().positive(),
]);

export type IdInput = z.infer<typeof idSchema>;

// ============================================================================
// API Response
// ============================================================================

export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  });
}

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T
) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  });
}
