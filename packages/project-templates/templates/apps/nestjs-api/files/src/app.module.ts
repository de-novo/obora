import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
// @obora:imports

@Module({
  imports: [
    HealthModule,
    // @obora:modules
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
