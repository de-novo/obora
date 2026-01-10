import posthog from "posthog-js";

export const posthogClient =
  typeof window !== "undefined"
    ? posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        person_profiles: "identified_only",
        capture_pageview: false, // Disable automatic pageview capture, we capture manually
        capture_pageleave: true,
      })
    : null;

export { posthog };
