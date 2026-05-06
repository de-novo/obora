import { describe, expect, it, vi } from "vitest";

import { NoOpMessageBus } from "../../actor/pool/NoOpMessageBus";
import type { ActorId } from "../../actor/types/actor";
import { createMessageId, MessageType, type Message } from "../../actor/types/message";

function actorId(value: string): ActorId {
  return value as ActorId;
}

function createMessage(): Message<{ ok: boolean }> {
  return {
    id: createMessageId("msg-noop"),
    type: MessageType.PING,
    from: actorId("actor-a"),
    to: actorId("actor-b"),
    payload: { ok: true },
    timestamp: new Date("2026-05-06T00:00:00.000Z"),
  };
}

describe("NoOpMessageBus", () => {
  it("accepts send-style calls without side effects", () => {
    const bus = new NoOpMessageBus();
    const message = createMessage();
    const { to: _to, ...messageWithoutTo } = message;
    const handler = vi.fn();

    expect(() => bus.send(message)).not.toThrow();
    expect(() => bus.sendTo(actorId("actor-b"), messageWithoutTo)).not.toThrow();
    expect(() => bus.broadcast(messageWithoutTo)).not.toThrow();
    expect(() => bus.receive(handler)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns empty queue and subscription operations", () => {
    const bus = new NoOpMessageBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe(MessageType.PING, handler);

    expect(bus.getQueueSize(actorId("actor-b"))).toBe(0);
    expect(bus.filter(() => true)).toEqual([]);
    expect(() => bus.clearQueue(actorId("actor-b"))).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("echoes request messages as resolved no-op responses", async () => {
    const bus = new NoOpMessageBus();
    const message = createMessage();

    await expect(bus.request<{ ok: boolean }>(message, 10)).resolves.toBe(message);
  });
});
