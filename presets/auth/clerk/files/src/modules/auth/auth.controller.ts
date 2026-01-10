import { Controller, Get, Post, Body } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator.js";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user" })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getCurrentUser(user);
  }

  @Post("webhook")
  @Public()
  @ApiOperation({ summary: "Clerk webhook handler" })
  async webhook(@Body() payload: unknown) {
    // Handle Clerk webhooks (user.created, user.updated, etc.)
    return this.authService.handleWebhook(payload);
  }
}
