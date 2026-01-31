import type { AuthUser } from "../common/decorators/current-user.decorator.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export {};
