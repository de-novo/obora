import type { AuthUser } from "../common/decorators/current-user.decorator.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
