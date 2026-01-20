/**
 * Centralized database package for monorepo
 *
 * Usage in other packages:
 * ```typescript
 * import { prisma, disconnect } from "@yourorg/database";
 *
 * const users = await prisma.user.findMany();
 * ```
 */

export { prisma, createPrismaClient, disconnect } from "./client.js";
export type { PrismaClient } from "./client.js";
