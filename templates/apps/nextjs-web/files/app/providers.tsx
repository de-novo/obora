"use client";

import type { ReactNode } from "react";
// @obora:providers-imports

const wrappers: Array<(children: ReactNode) => ReactNode> = [
  // @obora:providers
];

export function Providers({ children }: { children: ReactNode }) {
  if (wrappers.length === 0) {
    return <>{children}</>;
  }
  return wrappers.reduceRight((acc, wrap) => wrap(acc), children);
}
