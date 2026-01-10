"use client";

import Script from "next/script";

interface UmamiScriptProps {
  websiteId?: string;
  src?: string;
}

export function UmamiScript({
  websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  src = process.env.NEXT_PUBLIC_UMAMI_URL || "https://cloud.umami.is/script.js",
}: UmamiScriptProps) {
  if (!websiteId) {
    console.warn("Umami: NEXT_PUBLIC_UMAMI_WEBSITE_ID is not set");
    return null;
  }

  return (
    <Script
      defer
      src={src}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
