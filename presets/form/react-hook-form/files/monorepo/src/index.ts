// Types
export type {
  FormHook,
  FormSubmitHandler,
  FormErrorHandler,
  FormFieldErrors,
  FormFieldPath,
  FormRegisterOptions,
  InferFormData,
  FormState,
  FormResult,
} from "./types";

// Common schemas
export {
  emailSchema,
  passwordSchema,
  phoneSchema,
  urlSchema,
  uuidSchema,
  loginSchema,
  registerSchema,
  profileSchema,
  contactSchema,
  addressSchema,
} from "./schemas";

export type {
  LoginFormData,
  RegisterFormData,
  ProfileFormData,
  ContactFormData,
  AddressFormData,
} from "./schemas";

// Utility functions
export {
  createResolver,
  formatZodErrors,
  hasFormErrors,
  getFirstError,
  createDefaultValues,
  mergeWithDefaults,
} from "./utils";

// Re-export react-hook-form core
export { useForm, useFormContext, useWatch, useFieldArray, useController } from "react-hook-form";
export { zodResolver } from "@hookform/resolvers/zod";
export { z } from "zod";

export type {
  UseFormReturn,
  FieldValues,
  FieldErrors,
  FieldPath,
  RegisterOptions,
  SubmitHandler,
  SubmitErrorHandler,
  Control,
  UseFormRegister,
  UseFormSetValue,
  UseFormGetValues,
  UseFormReset,
} from "react-hook-form";
