import { applyDecorators, UsePipes } from "@nestjs/common";
import { Schema as S } from "effect";
import { EffectValidationPipe } from "./validation.pipe.js";

/**
 * Method decorator that applies effect/Schema validation
 *
 * @example
 * ```typescript
 * @Post()
 * @ValidateBody(CreateUserSchema)
 * async create(@Body() dto: CreateUser) {
 *   return this.userService.create(dto);
 * }
 * ```
 */
export function ValidateBody<A, I>(schema: S.Schema<A, I>) {
  return applyDecorators(UsePipes(new EffectValidationPipe(schema)));
}

/**
 * Create a reusable validation decorator
 *
 * @example
 * ```typescript
 * const ValidateCreateUser = createSchemaDecorator(CreateUserSchema);
 *
 * @Post()
 * @ValidateCreateUser()
 * async create(@Body() dto: CreateUser) {
 *   return this.userService.create(dto);
 * }
 * ```
 */
export function createSchemaDecorator<A, I>(schema: S.Schema<A, I>) {
  return () => ValidateBody(schema);
}
