/**
 * Generate unique ID using timestamp + random suffix
 * Ensures uniqueness even with rapid creation
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  return `${timestamp}${randomSuffix}`;
}
