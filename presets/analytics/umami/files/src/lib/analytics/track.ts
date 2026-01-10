// Umami tracking utilities

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Track a custom event in Umami
 * @param eventName - Name of the event to track
 * @param eventData - Optional data to include with the event
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, unknown>
): void {
  if (typeof window !== "undefined" && window.umami) {
    window.umami.track(eventName, eventData);
  }
}

/**
 * Track a page view manually (usually handled automatically by Umami)
 * @param url - URL to track
 * @param referrer - Referrer URL
 */
export function trackPageView(url?: string, referrer?: string): void {
  if (typeof window !== "undefined" && window.umami) {
    window.umami.track("pageview", {
      url: url || window.location.pathname,
      referrer: referrer || document.referrer,
    });
  }
}
