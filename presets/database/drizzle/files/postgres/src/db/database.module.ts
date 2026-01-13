import { Module, Global } from "@nestjs/common";
import { db } from "./client.js";

export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useValue: db,
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
