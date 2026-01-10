import { Injectable, Logger } from "@nestjs/common";
import { Paddle, Environment } from "@paddle/paddle-node-sdk";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paddle: Paddle;

  constructor() {
    this.paddle = new Paddle(process.env.PADDLE_API_KEY!, {
      environment:
        process.env.PADDLE_ENVIRONMENT === "production"
          ? Environment.production
          : Environment.sandbox,
    });
  }

  /**
   * Create a checkout session for a price
   */
  async createCheckout(priceId: string, customerId?: string) {
    // Paddle Billing uses a different flow - typically client-side
    // This returns the price details for client-side checkout
    const price = await this.paddle.prices.get(priceId);
    return {
      priceId,
      price: price,
      checkoutSettings: {
        displayMode: "overlay",
        theme: "light",
        locale: "en",
      },
    };
  }

  /**
   * Get customer's subscriptions
   */
  async getSubscriptions(customerId: string) {
    const subscriptions = await this.paddle.subscriptions.list({
      customerId: [customerId],
    });
    return subscriptions;
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string) {
    const subscription = await this.paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: "next_billing_period",
    });
    return subscription;
  }

  /**
   * Get customer portal URL
   */
  async getPortalUrl(customerId: string) {
    // Paddle doesn't have a built-in portal like Stripe
    // You typically build your own or use Paddle's cancel/update APIs
    return {
      message: "Use Paddle Retain or build custom portal",
      customerId,
    };
  }
}
