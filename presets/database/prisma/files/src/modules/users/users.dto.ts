import { Schema } from "effect";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Effect Schema definitions
export const CreateUserSchema = Schema.Struct({
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.optional(Schema.String),
});

export const UpdateUserSchema = Schema.Struct({
  email: Schema.optional(
    Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
  ),
  name: Schema.optional(Schema.String),
});

// DTO classes for Swagger
export class CreateUserDto {
  @ApiProperty({ example: "user@example.com" })
  email!: string;

  @ApiPropertyOptional({ example: "John Doe" })
  name?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: "user@example.com" })
  email?: string;

  @ApiPropertyOptional({ example: "John Doe" })
  name?: string;
}
