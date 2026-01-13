import { Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../../common/decorators/current-user.decorator.js";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async getCurrentUser(authUser: AuthUser) {
    this.logger.debug(`Getting current user: ${authUser.id}`);
    return {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      image: authUser.image,
    };
  }
}
