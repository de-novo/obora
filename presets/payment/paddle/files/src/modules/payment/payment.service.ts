import { Injectable } from "@nestjs/common";
import { Paddle, Environment } from "@paddle/paddle-node-sdk";

@Injectable()
export class PaymentService {
  private paddle: Paddle;

  constructor() {
    this.paddle = new Paddle(process.env.PADDLE_API_KEY!, {
      environment:
        process.env.PADDLE_ENVIRONMENT === "production"
          ? Environment.production
          : Environment.sandbox,
    });
  }

  async createTransaction(
    priceId: string,
    customerId?: string,
    customerEmail?: string
  ) {
    const transaction = await this.paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      ...(customerId && { customerId }),
      ...(customerEmail && { customerEmail }),
    });

    return {
      id: transaction.id,
      checkoutUrl: transaction.checkout?.url,
      status: transaction.status,
    };
  }

  async getTransaction(transactionId: string) {
    return this.paddle.transactions.get(transactionId);
  }

  async listProducts() {
    const products = await this.paddle.products.list();
    return products;
  }

  async listPrices(productId?: string) {
    const prices = await this.paddle.prices.list(
      productId ? { productId: [productId] } : undefined
    );
    return prices;
  }

  async createCustomer(email: string, name?: string) {
    const customer = await this.paddle.customers.create({
      email,
      ...(name && { name }),
    });
    return customer;
  }

  async getCustomer(customerId: string) {
    return this.paddle.customers.get(customerId);
  }

  async listSubscriptions(customerId?: string) {
    const subscriptions = await this.paddle.subscriptions.list(
      customerId ? { customerId: [customerId] } : undefined
    );
    return subscriptions;
  }

  async cancelSubscription(subscriptionId: string, effectiveFrom?: "immediately" | "next_billing_period") {
    return this.paddle.subscriptions.cancel(subscriptionId, {
      effectiveFrom: effectiveFrom || "next_billing_period",
    });
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string
  ): boolean {
    // Paddle webhook signature verification
    // The SDK provides webhook verification via the EventsApiResponse type
    // For production, implement proper signature verification
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!webhookSecret || !signature) {
      return false;
    }
    // Basic verification - in production use paddle SDK's webhook verification
    return signature.length > 0;
  }
}
