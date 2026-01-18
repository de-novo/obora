import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required but not set. " +
      "Please check your .env file and ensure DATABASE_URL is defined."
  );
}

// Optional validation for production environments
if (process.env.NODE_ENV === "production") {
  if (!process.env.BETTER_AUTH_URL) {
    throw new Error(
      "BETTER_AUTH_URL environment variable is required in production. " +
        "Please set it to your API server URL."
    );
  }
  if (!process.env.WEB_URL) {
    throw new Error(
      "WEB_URL environment variable is required in production. " +
        "Please set it to your web application URL."
    );
  }
}

// Create Prisma client with PostgreSQL adapter (Prisma 7)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  basePath: "/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3001",
    process.env.WEB_URL || "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
