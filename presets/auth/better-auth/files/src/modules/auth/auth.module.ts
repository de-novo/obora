import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";

@Module({
  controllers: [AuthController],
  exports: [],
})
export class AuthModule {}
