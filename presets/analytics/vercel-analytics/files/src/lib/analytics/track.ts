import { track as vercelTrack } from "@vercel/analytics";

type EventProperties = Record<string, string | number | boolean | null>;

/**
 * Track custom events with Vercel Analytics
 *
 * @example
 * // Track a button click
 * track("button_clicked", { button_id: "cta-signup" });
 *
 * // Track a purchase
 * track("purchase_completed", { amount: 99.99, currency: "USD" });
 */
export function track(eventName: string, properties?: EventProperties): void {
  vercelTrack(eventName, properties);
}
