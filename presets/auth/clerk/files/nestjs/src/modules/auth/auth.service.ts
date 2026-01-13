import { Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../../common/decorators/current-user.decorator.js";

export interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name?: string;
    last_name?: string;
    image_url?: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async getCurrentUser(authUser: AuthUser) {
    // Return the user info from the auth guard
    // For database operations, inject your database service here
    return {
      id: authUser.id,
      email: authUser.email,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      imageUrl: authUser.imageUrl,
    };
  }

  async handleWebhook(payload: unknown) {
    // TODO: Verify webhook signature from Clerk using CLERK_WEBHOOK_SECRET
    const event = payload as ClerkWebhookEvent;

    this.logger.log(`Received Clerk webhook: ${event.type}`);

    switch (event.type) {
      case "user.created":
        await this.onUserCreated(event.data);
        break;
      case "user.updated":
        await this.onUserUpdated(event.data);
        break;
      case "user.deleted":
        await this.onUserDeleted(event.data.id);
        break;
      default:
        this.logger.warn(`Unhandled webhook event: ${event.type}`);
    }

    return { received: true };
  }

  private async onUserCreated(data: ClerkWebhookEvent["data"]) {
    // TODO: Implement user creation in your database
    // Example with Prisma:
    // await this.prisma.user.create({
    //   data: {
    //     id: data.id,
    //     email: data.email_addresses[0]?.email_address ?? "",
    //     name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
    //     imageUrl: data.image_url,
    //   },
    // });
    this.logger.log(`User created: ${data.id}`);
  }

  private async onUserUpdated(data: ClerkWebhookEvent["data"]) {
    // TODO: Implement user update in your database
    this.logger.log(`User updated: ${data.id}`);
  }

  private async onUserDeleted(id: string) {
    // TODO: Implement user deletion in your database
    this.logger.log(`User deleted: ${id}`);
  }
}
