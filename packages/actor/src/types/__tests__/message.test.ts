import { describe, it, expect } from "vitest";
import {
  createMessageId,
  isValidMessageId,
  createMessage,
  type MessageId,
  MessageType,
  MessagePriority,
} from "../message";

describe("createMessageId", () => {
  it("should create a valid MessageId with correct prefix", () => {
    const id = createMessageId("msg-001");
    expect(id).toBe("msg-001");
    expect(isValidMessageId(id)).toBe(true);
  });

  it("should throw error for id without 'msg-' prefix", () => {
    expect(() => createMessageId("invalid-001")).toThrow("MessageId must start with 'msg-'");
    expect(() => createMessageId("001")).toThrow("MessageId must start with 'msg-'");
    expect(() => createMessageId("msg")).toThrow("MessageId must start with 'msg-'");
  });

  it("should accept various valid message IDs", () => {
    const validIds = [
      "msg-1",
      "msg-123",
      "msg-test",
      "msg-with-hyphens",
      "msg-with_underscores",
      "msg-with.multiple.parts",
    ];
    validIds.forEach((id) => {
      expect(createMessageId(id)).toBe(id);
    });
  });
});

describe("isValidMessageId", () => {
  it("should validate correct MessageId format", () => {
    expect(isValidMessageId("msg-001")).toBe(true);
    expect(isValidMessageId("msg-test-123")).toBe(true);
    expect(isValidMessageId("msg-with-hyphens")).toBe(true);
  });

  it("should reject invalid MessageId formats", () => {
    expect(isValidMessageId("invalid")).toBe(false);
    expect(isValidMessageId("test-001")).toBe(false);
    expect(isValidMessageId("msg")).toBe(false);
    expect(isValidMessageId("")).toBe(false);
    expect(isValidMessageId(123)).toBe(false);
    expect(isValidMessageId(null)).toBe(false);
    expect(isValidMessageId(undefined)).toBe(false);
    expect(isValidMessageId({})).toBe(false);
  });

  it("should type narrow correctly", () => {
    const value: unknown = "msg-123";
    if (isValidMessageId(value)) {
      expect(value.startsWith("msg-")).toBe(true);
      expect(value).toStrictEqual(expect.any(String));
    } else {
      expect(true).toBe(false);
    }
  });
});

describe("createMessage", () => {
  const mockActorId = "actor-123" as any;

  it("should create a message with required properties", () => {
    const message = createMessage({
      id: createMessageId("msg-001"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: {},
    });

    expect(message.id).toBe("msg-001");
    expect(message.type).toBe(MessageType.PING);
    expect(message.from).toBe(mockActorId);
    expect(message.to).toBe(mockActorId);
    expect(message.payload).toEqual({});
    expect(message.timestamp).toBeInstanceOf(Date);
  });

  it("should create message with broadcast destination", () => {
    const message = createMessage({
      id: createMessageId("msg-002"),
      type: MessageType.PING,
      from: mockActorId,
      to: "broadcast",
      payload: { data: "test" },
    });

    expect(message.to).toBe("broadcast");
    expect(message.payload).toEqual({ data: "test" });
  });

  it("should create message with optional properties", () => {
    const message = createMessage({
      id: createMessageId("msg-003"),
      type: MessageType.TASK_ASSIGN,
      from: mockActorId,
      to: mockActorId,
      payload: { task: "test" },
      correlationId: "correlation-123",
      replyTo: mockActorId,
      priority: MessagePriority.HIGH,
      ttl: 5000,
      deliveryReceipt: true,
    });

    expect(message.correlationId).toBe("correlation-123");
    expect(message.replyTo).toBe(mockActorId);
    expect(message.priority).toBe(MessagePriority.HIGH);
    expect(message.ttl).toBe(5000);
    expect(message.deliveryReceipt).toBe(true);
  });

  it("should create message with different message types", () => {
    const types = [
      MessageType.PING,
      MessageType.PONG,
      MessageType.HEARTBEAT,
      MessageType.TASK_ASSIGN,
      MessageType.TASK_COMPLETE,
      MessageType.TASK_FAILED,
      MessageType.STATE_READ,
      MessageType.STATE_WRITE,
      MessageType.OPINION_SUBMIT,
      MessageType.VOTE_SUBMIT,
      MessageType.ERROR,
      MessageType.START,
      MessageType.STOP,
      MessageType.RESTART,
    ];

    types.forEach((type) => {
      const message = createMessage({
        id: createMessageId(`msg-${type}`),
        type,
        from: mockActorId,
        to: mockActorId,
        payload: { type },
      });

      expect(message.type).toBe(type);
      expect(message.payload).toEqual({ type });
    });
  });

  it("should create message with different payload types", () => {
    const stringPayload = createMessage({
      id: createMessageId("msg-str"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: "string payload",
    });
    expect(stringPayload.payload).toBe("string payload");

    const numberPayload = createMessage({
      id: createMessageId("msg-num"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: 42,
    });
    expect(numberPayload.payload).toBe(42);

    const arrayPayload = createMessage({
      id: createMessageId("msg-arr"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: [1, 2, 3],
    });
    expect(arrayPayload.payload).toEqual([1, 2, 3]);

    const objectPayload = createMessage({
      id: createMessageId("msg-obj"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: { key: "value", nested: { data: "test" } },
    });
    expect(objectPayload.payload).toEqual({ key: "value", nested: { data: "test" } });

    const nullPayload = createMessage({
      id: createMessageId("msg-null"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: null,
    });
    expect(nullPayload.payload).toBeNull();
  });

  it("should create message with different priority levels", () => {
    const priorities = [
      MessagePriority.LOW,
      MessagePriority.NORMAL,
      MessagePriority.HIGH,
      MessagePriority.CRITICAL,
    ];

    priorities.forEach((priority) => {
      const message = createMessage({
        id: createMessageId(`msg-prio-${priority}`),
        type: MessageType.PING,
        from: mockActorId,
        to: mockActorId,
        payload: {},
        priority,
      });

      expect(message.priority).toBe(priority);
    });
  });

  it("should generate unique timestamps for each message", async () => {
    const message1 = createMessage({
      id: createMessageId("msg-1"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const message2 = createMessage({
      id: createMessageId("msg-2"),
      type: MessageType.PING,
      from: mockActorId,
      to: mockActorId,
      payload: {},
    });

    expect(message1.timestamp).not.toEqual(message2.timestamp);
    expect(message2.timestamp.getTime()).toBeGreaterThan(message1.timestamp.getTime());
  });

  it("should handle generic type parameter correctly", () => {
    interface TaskPayload {
      taskId: string;
      taskData: string;
    }

    const message = createMessage<TaskPayload>({
      id: createMessageId("msg-task"),
      type: MessageType.TASK_ASSIGN,
      from: mockActorId,
      to: mockActorId,
      payload: {
        taskId: "task-123",
        taskData: "test data",
      },
    });

    expect(message.payload.taskId).toBe("task-123");
    expect(message.payload.taskData).toBe("test data");

    const payload: TaskPayload = message.payload;
    expect(payload).toBeDefined();
  });
});

describe("Message type behavior", () => {
  it("should distinguish between different message types", () => {
    const ping = createMessage({
      id: createMessageId("msg-ping"),
      type: MessageType.PING,
      from: "actor-1" as any,
      to: "actor-2" as any,
      payload: {},
    });

    const error = createMessage({
      id: createMessageId("msg-error"),
      type: MessageType.ERROR,
      from: "actor-1" as any,
      to: "actor-2" as any,
      payload: { error: "test error" },
    });

    expect(ping.type).toBe(MessageType.PING);
    expect(error.type).toBe(MessageType.ERROR);
    expect(ping.type).not.toBe(error.type);
  });

  it("should handle optional properties gracefully", () => {
    const minimalMessage = createMessage({
      id: createMessageId("msg-min"),
      type: MessageType.PING,
      from: "actor-1" as any,
      to: "actor-2" as any,
      payload: {},
    });

    expect(minimalMessage.correlationId).toBeUndefined();
    expect(minimalMessage.replyTo).toBeUndefined();
    expect(minimalMessage.priority).toBeUndefined();
    expect(minimalMessage.ttl).toBeUndefined();
    expect(minimalMessage.deliveryReceipt).toBeUndefined();

    const fullMessage = createMessage({
      id: createMessageId("msg-full"),
      type: MessageType.PING,
      from: "actor-1" as any,
      to: "actor-2" as any,
      payload: {},
      correlationId: "test",
      replyTo: "actor-1" as any,
      priority: MessagePriority.HIGH,
      ttl: 1000,
      deliveryReceipt: true,
    });

    expect(fullMessage.correlationId).toBeDefined();
    expect(fullMessage.replyTo).toBeDefined();
    expect(fullMessage.priority).toBeDefined();
    expect(fullMessage.ttl).toBeDefined();
    expect(fullMessage.deliveryReceipt).toBeDefined();
  });
});
