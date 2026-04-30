import { randomUUID } from "crypto";

/**
 * Unified Actor ID generation using cryptographically-secure UUIDs.
 * @param role Actor role to prefix the ID with
 * @returns ActorId-style string: `<role>-<uuid>`
 */
export function generateActorId(role: string): string {
  const uuid = randomUUID();
  return `${role}-${uuid}`;
}
