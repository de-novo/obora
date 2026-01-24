import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  cleanupRegistered: boolean | undefined;
};

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Reuse existing pool if available (HMR support)
  if (!globalForPrisma.pool || globalForPrisma.pool.ended) {
    globalForPrisma.pool = new Pool({ connectionString });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  return new PrismaClient({ adapter });
};

// Cleanup function for graceful shutdown
async function cleanup() {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
  }
  if (globalForPrisma.pool) {
    await globalForPrisma.pool.end();
  }
}

// Register cleanup handlers once
if (!globalForPrisma.cleanupRegistered) {
  globalForPrisma.cleanupRegistered = true;

  process.on("beforeExit", cleanup);

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from "../../generated/prisma/client.js";
