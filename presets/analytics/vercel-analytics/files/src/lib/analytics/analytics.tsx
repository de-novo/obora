"use client";

import { Analytics } from "@vercel/analytics/react";

interface VercelAnalyticsProps {
  debug?: boolean;
  beforeSend?: (event: { type: string; url: string }) => { type: string; url: string } | null;
}

export function VercelAnalytics({ debug, beforeSend }: VercelAnalyticsProps = {}) {
  return (
    <Analytics
      debug={debug}
      beforeSend={beforeSend}
    />
  );
}
