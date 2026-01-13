import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: BetterAuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
