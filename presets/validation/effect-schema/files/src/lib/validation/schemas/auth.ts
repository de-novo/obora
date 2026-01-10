import { Schema as S } from "effect";
import { Email } from "./common.js";

// ============================================
// Auth Schemas
// ============================================

// Password with validation rules
export const Password = S.String.pipe(
  S.minLength(8, { message: () => "비밀번호는 8자 이상이어야 합니다" }),
  S.pattern(/[A-Z]/, { message: () => "대문자를 포함해야 합니다" }),
  S.pattern(/[a-z]/, { message: () => "소문자를 포함해야 합니다" }),
  S.pattern(/[0-9]/, { message: () => "숫자를 포함해야 합니다" }),
  S.brand("Password")
);
export type Password = S.Schema.Type<typeof Password>;

// Sign In
export const SignInInput = S.Struct({
  email: Email,
  password: S.String.pipe(S.minLength(1, { message: () => "비밀번호를 입력하세요" })),
});
export type SignInInput = S.Schema.Type<typeof SignInInput>;

// Sign Up
export const SignUpInput = S.Struct({
  email: Email,
  password: Password,
  confirmPassword: S.String,
}).pipe(
  S.filter((data) => data.password === data.confirmPassword, {
    message: () => "비밀번호가 일치하지 않습니다",
  })
);
export type SignUpInput = S.Schema.Type<typeof SignUpInput>;

// User Profile
export const UserProfile = S.Struct({
  id: S.String,
  email: Email,
  name: S.String.pipe(
    S.minLength(2, { message: () => "이름은 2자 이상이어야 합니다" }),
    S.maxLength(50)
  ),
  bio: S.optional(S.String.pipe(S.maxLength(500))),
  createdAt: S.Date,
  updatedAt: S.Date,
});
export type UserProfile = S.Schema.Type<typeof UserProfile>;

// Update Profile Input
export const UpdateProfileInput = S.Struct({
  name: S.optional(S.String.pipe(S.minLength(2), S.maxLength(50))),
  bio: S.optional(S.String.pipe(S.maxLength(500))),
});
export type UpdateProfileInput = S.Schema.Type<typeof UpdateProfileInput>;
