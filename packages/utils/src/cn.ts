import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx
 *
 * @param inputs - Class names to merge
 * @returns Merged class string
 *
 * @example
 * cn("px-4 py-2", "bg-blue-500") // => "px-4 py-2 bg-blue-500"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
