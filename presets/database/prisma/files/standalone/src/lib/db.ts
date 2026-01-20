import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

let pool: Pool | null = null;
let prismaClient: PrismaClient | null = null;

/**
 * Creates and returns a Prisma client for standalone/CLI usage.
 * Use disconnect() when done to properly close connections.
 */
export function createPrismaClient(): PrismaClient {
  if (prismaClient) {
    return prismaClient;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prismaClient = new PrismaClient({ adapter });

  return prismaClient;
}

/**
 * Disconnects the Prisma client and closes the connection pool.
 * Call this before your CLI/script exits.
 */
export async function disconnect(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Registers signal handlers for graceful shutdown.
 * Call this at the start of your CLI/script.
 */
export function registerShutdownHandlers(): void {
  const shutdown = async () => {
    await disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("beforeExit", disconnect);
}

// Lazy singleton - use this for simple scripts
export const prisma = createPrismaClient();

export type { PrismaClient } from "../../generated/prisma/client.js";
