import { z } from "zod";

/**
 * Common Validation Patterns
 */
export const emailSchema = z.string().email("Invalid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number");

/**
 * Login Form Schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Registration Form Schema
 */
export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Profile Form Schema
 */
export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("")),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  avatar: z.string().url("Invalid avatar URL").optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

/**
 * Contact Form Schema
 */
export const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: emailSchema,
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(1000, "Message must be 1000 characters or less"),
});

export type ContactFormData = z.infer<typeof contactSchema>;

/**
 * Address Schema (reusable)
 */
export const addressSchema = z.object({
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
  country: z.string().min(1, "Country is required"),
});

export type AddressFormData = z.infer<typeof addressSchema>;

/**
 * Checkout Form Schema
 */
export const checkoutSchema = z.object({
  email: emailSchema,
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  sameAsShipping: z.boolean().default(true),
  paymentMethod: z.enum(["card", "paypal", "bank"]),
  cardNumber: z
    .string()
    .regex(/^\d{16}$/, "Invalid card number")
    .optional(),
  cardExpiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiry date (MM/YY)")
    .optional(),
  cardCvc: z
    .string()
    .regex(/^\d{3,4}$/, "Invalid CVC")
    .optional(),
});

export type CheckoutFormData = z.infer<typeof checkoutSchema>;
