"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * Generic form hook factory
 * Creates a typed form hook for any Zod schema
 */
export function createFormHook<T extends z.ZodSchema>(schema: T) {
  return function useTypedForm(defaultValues?: Partial<z.infer<T>>) {
    return useForm<z.infer<T>>({
      resolver: zodResolver(schema),
      defaultValues: defaultValues as z.infer<T>,
    });
  };
}

/**
 * Example: Login Form Hook
 */
import { loginSchema, type LoginFormData } from "./schemas";

export function useLoginForm(defaultValues?: Partial<LoginFormData>) {
  return useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      ...defaultValues,
    },
  });
}

/**
 * Example: Register Form Hook
 */
import { registerSchema, type RegisterFormData } from "./schemas";

export function useRegisterForm(defaultValues?: Partial<RegisterFormData>) {
  return useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      ...defaultValues,
    },
  });
}

/**
 * Example: Profile Form Hook
 */
import { profileSchema, type ProfileFormData } from "./schemas";

export function useProfileForm(defaultValues?: Partial<ProfileFormData>) {
  return useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      bio: "",
      website: "",
      ...defaultValues,
    },
  });
}

/**
 * Example: Contact Form Hook
 */
import { contactSchema, type ContactFormData } from "./schemas";

export function useContactForm(defaultValues?: Partial<ContactFormData>) {
  return useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
      ...defaultValues,
    },
  });
}

/**
 * Usage Example:
 *
 * ```tsx
 * "use client";
 *
 * import { useLoginForm } from "@/lib/form/use-form";
 *
 * export function LoginForm() {
 *   const {
 *     register,
 *     handleSubmit,
 *     formState: { errors, isSubmitting },
 *   } = useLoginForm();
 *
 *   const onSubmit = async (data: LoginFormData) => {
 *     // Handle login
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit(onSubmit)}>
 *       <input {...register("email")} />
 *       {errors.email && <span>{errors.email.message}</span>}
 *
 *       <input type="password" {...register("password")} />
 *       {errors.password && <span>{errors.password.message}</span>}
 *
 *       <label>
 *         <input type="checkbox" {...register("rememberMe")} />
 *         Remember me
 *       </label>
 *
 *       <button type="submit" disabled={isSubmitting}>
 *         {isSubmitting ? "Logging in..." : "Login"}
 *       </button>
 *     </form>
 *   );
 * }
 * ```
 */
