import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { auth } from "../../modules/auth/auth.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

@Injectable()
export class BetterAuthGuard implements CanActivate {
  private readonly logger = new Logger(BetterAuthGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    try {
      // Convert IncomingHttpHeaders to Headers object for better-auth
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }

      const session = await auth.api.getSession({ headers });

      if (!session?.user) {
        throw new UnauthorizedException("Invalid or expired session");
      }

      const { user } = session;
      request.user = {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
      };

      return true;
    } catch (error) {
      this.logger.debug(`Session validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw new UnauthorizedException("Invalid or expired session");
    }
  }
}
