"use client";

import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";

interface SpeedInsightsProps {
  debug?: boolean;
  sampleRate?: number;
}

export function SpeedInsights({ debug, sampleRate }: SpeedInsightsProps = {}) {
  return (
    <VercelSpeedInsights
      debug={debug}
      sampleRate={sampleRate}
    />
  );
}
