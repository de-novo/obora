import { Injectable } from "@nestjs/common";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

@Injectable()
export class AiService {
  async generateText(prompt: string) {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
    });
    return text;
  }

  async *streamText(prompt: string) {
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      prompt,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
