import { Controller, Post, Body, Headers, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PaymentService } from "./payment.service.js";

/**
 * Polar webhook payload structure
 */
interface PolarWebhookPayload {
  type: string;
  data: Record<string, unknown>;
}

@ApiTags("Payment")
@Controller("payment")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("checkout")
  @ApiOperation({ summary: "Create checkout session" })
  async createCheckout(
    @Body() body: { productId: string; successUrl: string }
  ) {
    return this.paymentService.createCheckout(body.productId, body.successUrl);
  }

  @Post("webhook")
  @ApiOperation({ summary: "Handle Polar webhook" })
  async handleWebhook(
    @Body() payload: PolarWebhookPayload,
    @Headers("polar-signature") signature: string
  ) {
    await this.paymentService.verifyWebhook(JSON.stringify(payload), signature);
    // Handle webhook events
    return { received: true };
  }
}
