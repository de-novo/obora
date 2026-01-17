import {
  Controller,
  Post,
  Body,
  Headers,
  Get,
  Param,
  Query,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from "@nestjs/swagger";
import { PaymentService } from "./payment.service.js";
import { FastifyRequest } from "fastify";

/**
 * Paddle webhook event structure
 */
interface PaddleWebhookEvent {
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

@ApiTags("Payment")
@Controller("payment")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("transactions")
  @ApiOperation({ summary: "Create a transaction for checkout" })
  async createTransaction(
    @Body()
    body: {
      priceId: string;
      customerId?: string;
      customerEmail?: string;
    }
  ) {
    return this.paymentService.createTransaction(
      body.priceId,
      body.customerId,
      body.customerEmail
    );
  }

  @Get("transactions/:id")
  @ApiOperation({ summary: "Get transaction by ID" })
  @ApiParam({ name: "id", description: "Transaction ID" })
  async getTransaction(@Param("id") id: string) {
    return this.paymentService.getTransaction(id);
  }

  @Get("products")
  @ApiOperation({ summary: "List all products" })
  async listProducts() {
    return this.paymentService.listProducts();
  }

  @Get("prices")
  @ApiOperation({ summary: "List prices" })
  @ApiQuery({ name: "productId", required: false })
  async listPrices(@Query("productId") productId?: string) {
    return this.paymentService.listPrices(productId);
  }

  @Post("customers")
  @ApiOperation({ summary: "Create a customer" })
  async createCustomer(@Body() body: { email: string; name?: string }) {
    return this.paymentService.createCustomer(body.email, body.name);
  }

  @Get("customers/:id")
  @ApiOperation({ summary: "Get customer by ID" })
  @ApiParam({ name: "id", description: "Customer ID" })
  async getCustomer(@Param("id") id: string) {
    return this.paymentService.getCustomer(id);
  }

  @Get("subscriptions")
  @ApiOperation({ summary: "List subscriptions" })
  @ApiQuery({ name: "customerId", required: false })
  async listSubscriptions(@Query("customerId") customerId?: string) {
    return this.paymentService.listSubscriptions(customerId);
  }

  @Post("subscriptions/:id/cancel")
  @ApiOperation({ summary: "Cancel a subscription" })
  @ApiParam({ name: "id", description: "Subscription ID" })
  async cancelSubscription(
    @Param("id") id: string,
    @Body() body: { effectiveFrom?: "immediately" | "next_billing_period" }
  ) {
    return this.paymentService.cancelSubscription(id, body.effectiveFrom);
  }

  @Post("webhook")
  @ApiOperation({ summary: "Handle Paddle webhook" })
  async handleWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers("paddle-signature") signature: string
  ) {
    const rawBody =
      typeof req.rawBody === "string"
        ? req.rawBody
        : req.rawBody?.toString() || "";

    const isValid = this.paymentService.verifyWebhookSignature(
      rawBody,
      signature
    );

    if (!isValid) {
      return { error: "Invalid signature" };
    }

    const event = req.body as PaddleWebhookEvent;

    // Handle different event types
    switch (event.event_type) {
      case "transaction.completed":
        // Handle successful payment
        break;
      case "subscription.created":
        // Handle new subscription
        break;
      case "subscription.updated":
        // Handle subscription update
        break;
      case "subscription.canceled":
        // Handle subscription cancellation
        break;
      default:
        // Log unknown event type
        break;
    }

    return { received: true };
  }
}
