"use client";

import { parseAsString, useQueryState } from "nuqs";

export function useTabQueryState(defaultValue = "overview") {
  return useQueryState("tab", parseAsString.withDefault(defaultValue));
}
