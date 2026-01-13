import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException("User not authenticated");
    }
    return request.user;
  }
);
