import { Injectable } from "@nestjs/common";
import { Polar } from "@polar-sh/sdk";

@Injectable()
export class PaymentService {
  private polar: Polar;

  constructor() {
    this.polar = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN!,
      server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
    });
  }

  async createCheckout(productId: string, successUrl: string, customerEmail?: string) {
    const checkout = await this.polar.checkouts.custom.create({
      productId,
      successUrl,
      customerEmail,
    });
    return { url: checkout.url, id: checkout.id };
  }

  async getCheckout(checkoutId: string) {
    return this.polar.checkouts.custom.get({ id: checkoutId });
  }

  async verifyWebhook(payload: string, signature: string) {
    // Implement webhook verification using Polar's webhook signing
    return true;
  }
}
