import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { PaymentService } from "./payment.service.js";

@Controller("payment")
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Get checkout info for a price
   */
  @Post("checkout")
  async createCheckout(
    @Body() body: { priceId: string; customerId?: string }
  ) {
    return this.paymentService.createCheckout(body.priceId, body.customerId);
  }

  /**
   * Get customer subscriptions
   */
  @Get("subscriptions/:customerId")
  async getSubscriptions(@Param("customerId") customerId: string) {
    return this.paymentService.getSubscriptions(customerId);
  }

  /**
   * Cancel subscription
   */
  @Post("subscriptions/:subscriptionId/cancel")
  async cancelSubscription(
    @Param("subscriptionId") subscriptionId: string
  ) {
    return this.paymentService.cancelSubscription(subscriptionId);
  }

  /**
   * Paddle webhook handler
   */
  @Post("webhook")
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("paddle-signature") signature: string
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new HttpException("Missing raw body", HttpStatus.BAD_REQUEST);
    }

    // Verify webhook signature
    // Note: Implement proper signature verification in production
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET!;

    try {
      const event = JSON.parse(rawBody.toString());
      this.logger.log(`Received Paddle webhook: ${event.event_type}`);

      switch (event.event_type) {
        case "subscription.created":
          // Handle new subscription
          this.logger.log(`New subscription: ${event.data.id}`);
          break;

        case "subscription.updated":
          // Handle subscription update
          this.logger.log(`Subscription updated: ${event.data.id}`);
          break;

        case "subscription.canceled":
          // Handle cancellation
          this.logger.log(`Subscription canceled: ${event.data.id}`);
          break;

        case "transaction.completed":
          // Handle completed payment
          this.logger.log(`Transaction completed: ${event.data.id}`);
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.event_type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error("Webhook processing error:", error);
      throw new HttpException(
        "Webhook processing failed",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
