// effect/Schema preset
// Re-export everything for easy importing

// Core schemas
export * from "./schemas/common.js";
export * from "./schemas/api.js";
export * from "./schemas/auth.js";

// Utilities
export * from "./utils/schema-helpers.js";

// NestJS integration
export * from "./nestjs/index.js";

// Re-export Schema for convenience
export { Schema as S } from "effect";
