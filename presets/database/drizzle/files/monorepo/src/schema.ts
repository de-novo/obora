import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

/**
 * Example users table.
 * Modify or add more tables as needed.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Add more tables here
// export const posts = pgTable("posts", { ... });
