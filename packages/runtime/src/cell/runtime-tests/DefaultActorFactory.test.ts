import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Observation, Action, Result } from "../actor-types";
import { createActionId } from "../actor-types/action";
import {
  Actor,
  ActorRole,
  ActorLifecycleStatus,
  createActorId,
  type ActorId,
} from "../actor-types/actor";
import type { IBlackboard } from "../actor-types/actor";
import type { IMessageBus } from "../actor-types/message";
import { createActorMetrics } from "../actor-types/metrics";
import { createResultId } from "../actor-types/result";
import { DefaultActorFactory } from "../internal/CellActorFactory";

class TestActor implements Actor {
  readonly id: ActorId;
  readonly name: string;
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  readonly status: {
    id: ActorId;
    name: string;
    role: ActorRole;
    status: ActorLifecycleStatus;
    messageQueue: { pending: number; processing: boolean };
    metrics: {
      totalMessagesProcessed: number;
      totalActionsExecuted: number;
      totalErrors: number;
      averageResponseTime: number;
      uptime: number;
    };
    lastSeen: Date;
    errorCount: number;
  };
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics = createActorMetrics();

  constructor(
    id: ActorId,
    name: string,
    role: ActorRole,
    board: IBlackboard,
    messageBus: IMessageBus
  ) {
    this.id = id;
    this.role = role;
    this.name = name;
    this.board = board;
    this.messageBus = messageBus;
    this.status = {
      id: this.id,
      name: this.name,
      role: this.role,
      status: ActorLifecycleStatus.RUNNING,
      messageQueue: { pending: 0, processing: false },
      metrics: {
        totalMessagesProcessed: 0,
        totalActionsExecuted: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        uptime: 0,
      },
      lastSeen: new Date(),
      errorCount: 0,
    };
  }

  observe(): Observation {
    return { actorId: this.id, timestamp: new Date() };
  }

  think(observation: Observation): Action {
    return {
      id: createActionId("action-1"),
      actorId: this.id,
      type: "execute",
      timestamp: new Date(),
    };
  }

  act(action: Action): Result {
    return {
      id: createResultId("result-1"),
      actionId: action.id,
      actorId: this.id,
      timestamp: new Date(),
      status: "success",
    };
  }

  report(): void {
    /* mock */
  }

  receive(): void {
    /* mock */
  }

  async start(): Promise<void> {
    /* mock */
  }

  async stop(): Promise<void> {
    /* mock */
  }

  async restart(): Promise<void> {
    /* mock */
  }

  getStatus() {
    return this.status;
  }

  isAlive(): boolean {
    return true;
  }
}

describe("DefaultActorFactory", () => {
  let factory: DefaultActorFactory;
  let board: IBlackboard;
  let messageBus: IMessageBus;

  beforeEach(() => {
    factory = new DefaultActorFactory();
    board = {
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
      keys: vi.fn(() => []),
      find: vi.fn(() => []),
      version: 1,
    };
    messageBus = {
      send: vi.fn(),
      sendTo: vi.fn(),
      broadcast: vi.fn(),
      receive: vi.fn(),
      request: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      getQueueSize: vi.fn(() => 0),
      clearQueue: vi.fn(),
      filter: vi.fn(() => []),
    };
  });

  it("should register and create actor", async () => {
    factory.register("test", TestActor);

    const actorId = createActorId("analyst");
    const actor = await factory.create(
      { id: actorId, name: "test", role: "analyst" as ActorRole, type: "test" },
      board,
      messageBus
    );

    expect(actor).toBeInstanceOf(TestActor);
    expect(actor.id).toBe(actorId);
  });

  it("should auto-generate actor id if not provided", async () => {
    factory.register("test", TestActor);

    const actor = await factory.create(
      { name: "test", role: "analyst" as ActorRole, type: "test" },
      board,
      messageBus
    );

    expect(actor.id).toMatch(
      /^analyst-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should throw for unknown actor type", async () => {
    await expect(
      factory.create(
        { name: "test", role: "analyst" as ActorRole, type: "unknown" },
        board,
        messageBus
      )
    ).rejects.toThrow("Unknown actor type: unknown");
  });

  it("should unregister actor type", async () => {
    factory.register("test", TestActor);
    factory.unregister("test");

    await expect(
      factory.create(
        { name: "test", role: "analyst" as ActorRole, type: "test" },
        board,
        messageBus
      )
    ).rejects.toThrow("Unknown actor type: test");
  });
});
