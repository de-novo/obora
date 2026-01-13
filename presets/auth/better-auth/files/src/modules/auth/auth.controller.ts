import { Controller, All, Req, Res } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "./auth.js";
import { Public } from "../../common/decorators/public.decorator.js";

@Controller("auth")
export class AuthController {
  @Public()
  @All("*")
  async handleAuth(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    // Convert Fastify request to Web Request
    const url = new URL(
      request.url,
      `${request.protocol}://${request.hostname}`
    );

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    const webRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" && request.body
        ? typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body)
        : undefined,
    });

    // Handle with better-auth
    const response = await auth.handler(webRequest);

    // Convert Web Response to Fastify response
    reply.status(response.status);

    response.headers.forEach((value: string, key: string) => {
      reply.header(key, value);
    });

    const body = await response.text();
    reply.send(body);
  }
}
