import { Schema as S } from "effect";

// ============================================
// Common Schema Definitions
// ============================================

// ID Schemas
export const Id = S.String.pipe(S.brand("Id"));
export type Id = S.Schema.Type<typeof Id>;

export const Cuid2 = S.String.pipe(
  S.pattern(/^[a-z0-9]{24,}$/),
  S.brand("Cuid2")
);
export type Cuid2 = S.Schema.Type<typeof Cuid2>;

// URL & Slug
export const Url = S.String.pipe(S.pattern(/^https?:\/\/.+/));
export const Slug = S.String.pipe(
  S.pattern(/^[a-z0-9-]+$/),
  S.brand("Slug")
);
export type Slug = S.Schema.Type<typeof Slug>;

// Email
export const Email = S.String.pipe(
  S.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  S.brand("Email")
);
export type Email = S.Schema.Type<typeof Email>;

// Money/Price (cents)
export const Price = S.Number.pipe(
  S.int(),
  S.nonNegative(),
  S.brand("Price")
);
export type Price = S.Schema.Type<typeof Price>;

// Timestamps
export const Timestamp = S.Date;
export const DateString = S.transform(
  S.String,
  S.DateFromSelf,
  {
    strict: true,
    decode: (s) => new Date(s),
    encode: (d) => d.toISOString(),
  }
);
