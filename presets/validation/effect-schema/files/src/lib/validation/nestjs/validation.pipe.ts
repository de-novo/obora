import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import { Schema as S, Either } from "effect";
import { getErrors } from "../utils/schema-helpers.js";

/**
 * NestJS Validation Pipe for effect/Schema
 *
 * @example
 * ```typescript
 * @Post()
 * async create(@Body(new EffectValidationPipe(CreateUserSchema)) dto: CreateUser) {
 *   return this.userService.create(dto);
 * }
 * ```
 */
@Injectable()
export class EffectValidationPipe<A, I> implements PipeTransform<unknown, A> {
  constructor(private readonly schema: S.Schema<A, I>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): A {
    const result = S.decodeUnknownEither(this.schema)(value);

    if (Either.isLeft(result)) {
      const errors = getErrors(result.left);
      throw new BadRequestException({
        message: "Validation failed",
        errors,
      });
    }

    return result.right;
  }
}

/**
 * Factory function for creating validation pipes
 *
 * @example
 * ```typescript
 * const validateCreateUser = createValidationPipe(CreateUserSchema);
 *
 * @Post()
 * async create(@Body(validateCreateUser) dto: CreateUser) {
 *   return this.userService.create(dto);
 * }
 * ```
 */
export function createValidationPipe<A, I>(schema: S.Schema<A, I>) {
  return new EffectValidationPipe(schema);
}
