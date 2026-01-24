import type { z } from "zod";
import type {
  UseFormReturn,
  FieldValues,
  FieldErrors,
  FieldPath,
  RegisterOptions,
  SubmitHandler,
  SubmitErrorHandler,
} from "react-hook-form";

/**
 * Generic form hook return type
 */
export type FormHook<T extends FieldValues> = UseFormReturn<T>;

/**
 * Form submission handler type
 */
export type FormSubmitHandler<T extends FieldValues> = SubmitHandler<T>;

/**
 * Form error handler type
 */
export type FormErrorHandler<T extends FieldValues> = SubmitErrorHandler<T>;

/**
 * Field error type
 */
export type FormFieldErrors<T extends FieldValues> = FieldErrors<T>;

/**
 * Field path type
 */
export type FormFieldPath<T extends FieldValues> = FieldPath<T>;

/**
 * Field register options type
 */
export type FormRegisterOptions<T extends FieldValues> = RegisterOptions<T>;

/**
 * Infer form data type from Zod schema
 */
export type InferFormData<T extends z.ZodSchema> = z.infer<T>;

/**
 * Form state for controlled components
 */
export interface FormState {
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  isValidating: boolean;
}

/**
 * Form result type for async submissions
 */
export type FormResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
