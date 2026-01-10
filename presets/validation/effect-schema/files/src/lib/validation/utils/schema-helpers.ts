import { Schema as S, Effect, Either, ParseResult } from "effect";

// ============================================
// Schema Helper Utilities
// ============================================

/**
 * Parse data and return Either (sync)
 */
export function parseEither<A, I>(
  schema: S.Schema<A, I>,
  data: unknown
): Either.Either<A, ParseResult.ParseError> {
  return S.decodeUnknownEither(schema)(data);
}

/**
 * Parse data or throw (sync)
 */
export function parseSync<A, I>(schema: S.Schema<A, I>, data: unknown): A {
  return S.decodeUnknownSync(schema)(data);
}

/**
 * Parse data with Effect (async-safe)
 */
export function parse<A, I>(
  schema: S.Schema<A, I>,
  data: unknown
): Effect.Effect<A, ParseResult.ParseError> {
  return S.decodeUnknown(schema)(data);
}

/**
 * Validate data (returns boolean)
 */
export function isValid<A, I>(schema: S.Schema<A, I>, data: unknown): boolean {
  return Either.isRight(S.decodeUnknownEither(schema)(data));
}

/**
 * Get formatted error messages
 */
export function getErrors(error: ParseResult.ParseError): string[] {
  // Use TreeFormatter for simple error messages
  return [ParseResult.TreeFormatter.formatErrorSync(error)];
}

/**
 * Parse with formatted error result
 */
export function safeParse<A, I>(
  schema: S.Schema<A, I>,
  data: unknown
): { success: true; data: A } | { success: false; errors: string[] } {
  const result = S.decodeUnknownEither(schema)(data);

  if (Either.isRight(result)) {
    return { success: true, data: result.right };
  }

  return {
    success: false,
    errors: getErrors(result.left),
  };
}

/**
 * Create a NestJS-compatible validation pipe transform function
 */
export function createValidator<A, I>(schema: S.Schema<A, I>) {
  return (data: unknown): A => {
    const result = safeParse(schema, data);
    if (!result.success) {
      throw new Error(result.errors.join(", "));
    }
    return result.data;
  };
}
