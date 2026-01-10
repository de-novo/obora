import { Schema as S } from "effect";

// ============================================
// API Response Schemas
// ============================================

// Generic API Response
export const ApiResponse = <A, I, R>(dataSchema: S.Schema<A, I, R>) =>
  S.Struct({
    success: S.Boolean,
    data: S.optional(dataSchema),
    error: S.optional(S.String),
  });

// Paginated Response
export const PaginatedResponse = <A, I, R>(itemSchema: S.Schema<A, I, R>) =>
  S.Struct({
    data: S.Array(itemSchema),
    total: S.Number.pipe(S.int(), S.nonNegative()),
    page: S.Number.pipe(S.int(), S.positive()),
    pageSize: S.Number.pipe(S.int(), S.positive()),
    totalPages: S.Number.pipe(S.int(), S.nonNegative()),
  });

// API Error
export const ApiError = S.Struct({
  message: S.String,
  code: S.optional(S.String),
  details: S.optional(S.Unknown),
});
export type ApiError = S.Schema.Type<typeof ApiError>;

// Pagination Input
export const PaginationInput = S.Struct({
  page: S.optionalWith(S.Number.pipe(S.int(), S.positive()), { default: () => 1 }),
  pageSize: S.optionalWith(
    S.Number.pipe(S.int(), S.positive(), S.lessThanOrEqualTo(100)),
    { default: () => 20 }
  ),
});
export type PaginationInput = S.Schema.Type<typeof PaginationInput>;

// Search Input
export const SearchInput = S.Struct({
  q: S.optional(S.String),
  sort: S.optionalWith(S.Literal("asc", "desc"), { default: () => "desc" as const }),
  sortBy: S.optionalWith(S.String, { default: () => "createdAt" }),
});
export type SearchInput = S.Schema.Type<typeof SearchInput>;
