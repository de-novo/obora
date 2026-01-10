import { Controller, Post, Body } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AiService } from "./ai.service.js";

@ApiTags("AI")
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("generate")
  @ApiOperation({ summary: "Generate text using AI" })
  async generateText(@Body() body: { prompt: string }) {
    const text = await this.aiService.generateText(body.prompt);
    return { text };
  }
}
