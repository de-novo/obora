import { Lucia } from "lucia";
import { DrizzleSQLiteAdapter } from "@lucia-auth/adapter-drizzle";

// TODO: Import your database instance and schema
// import { db } from "@workspace/db";
// import { users, sessions } from "@workspace/db/schema";

// const adapter = new DrizzleSQLiteAdapter(db, sessions, users);

// Placeholder adapter - replace with your actual adapter
const adapter = {} as any;

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  email: string;
}
