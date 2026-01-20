import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(connectionString);

/**
 * Drizzle database client.
 * Shared across the monorepo.
 */
export const db = drizzle(sql, { schema });

export type Database = typeof db;
