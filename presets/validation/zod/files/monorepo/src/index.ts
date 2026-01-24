// Re-export zod
export { z } from "zod";
export type { ZodSchema, ZodError, ZodIssue, ZodType } from "zod";

// Schemas
export {
  // Primitives
  emailSchema,
  passwordSchema,
  uuidSchema,
  slugSchema,
  urlSchema,
  phoneSchema,
  nonEmptyString,
  positiveNumber,
  nonNegativeNumber,
  // Pagination & Search
  paginationSchema,
  searchSchema,
  dateRangeSchema,
  idSchema,
  // Schema factories
  createApiResponseSchema,
  createPaginatedResponseSchema,
} from "./schemas";

export type {
  PaginationInput,
  SearchInput,
  DateRangeInput,
  IdInput,
} from "./schemas";

// Utils
export {
  formatZodErrors,
  safeParse,
  safeParseAsync,
  createValidator,
  assertValid,
  isValid,
  parseQueryParams,
} from "./utils";

export type { ValidationResult, FormattedError } from "./utils";
