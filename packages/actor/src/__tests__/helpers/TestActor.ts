import type { Actor, ActorId, ActorRole, ActorStatus } from "../../types/actor";
import { ActorLifecycleStatus } from "../../types/actor";
import type { IBlackboard } from "../../types/blackboard";
import type { IMessageBus, MessageType, Message } from "../../types/message";
import type { Observation } from "../../types/observation";
import type { Action, ActionType } from "../../types/action";
import type { Result } from "../../types/result";
import type { ActorMetrics } from "../../types/metrics";
import { createActorMetrics } from "../../types/metrics";
import { createObservation } from "../../types/observation";
import { createAction } from "../../types/action";
import { createSuccessResult, createFailureResult } from "../../types/result";

export interface TestActorConfig {
  failureRate?: number;
  executionTime?: number;
  maxExecutions?: number;
}

export class TestActor implements Actor {
  readonly id: ActorId;
  readonly name: string;
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics: ActorMetrics;
  status: ActorStatus;

  private readonly config: Required<TestActorConfig>;
  private executionCount = 0;
  private currentLifecycleStatus: ActorLifecycleStatus = ActorLifecycleStatus.CREATED;
  private subscriptions: Array<() => void> = [];

  constructor(
    id: ActorId,
    name: string,
    role: ActorRole,
    board: IBlackboard,
    messageBus: IMessageBus,
    config?: TestActorConfig
  ) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this.metrics = createActorMetrics();
    this.status = this.createStatus(ActorLifecycleStatus.CREATED);
    this.config = {
      failureRate: config?.failureRate ?? 0,
      executionTime: config?.executionTime ?? 10,
      maxExecutions: config?.maxExecutions ?? Infinity,
    };
  }

  private createStatus(status: ActorLifecycleStatus): ActorStatus {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      status,
      messageQueue: {
        pending: 0,
        processing: false,
      },
      metrics: {
        totalMessagesProcessed: 0,
        totalActionsExecuted: this.metrics.totalRuns,
        totalErrors: this.metrics.failureCount,
        averageResponseTime: this.metrics.averageExecutionTime,
        uptime: Date.now() - this.createdAt.getTime(),
      },
      lastSeen: this.lastActivity,
      errorCount: this.metrics.failureCount,
    };
  }

  private updateStatus(status: ActorLifecycleStatus): void {
    this.currentLifecycleStatus = status;
    this.status = this.createStatus(status);
    this.lastActivity = new Date();
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  resetExecutionCount(): void {
    this.executionCount = 0;
  }

  async observe(): Promise<Observation> {
    const data = this.board.read("state");
    this.updateStatus(ActorLifecycleStatus.RUNNING);
    return createObservation({
      actorId: this.id,
      state:
        typeof data === "object" && data !== null
          ? {
              context: data as Record<string, unknown>,
              agents: [],
              tasks: [],
            }
          : undefined,
    });
  }

  async think(observation: Observation): Promise<Action> {
    this.updateStatus(ActorLifecycleStatus.RUNNING);
    return createAction(this.id, "analyze" as ActionType, {
      section: "results",
      data: { processed: observation.state },
    });
  }

  async act(action: Action): Promise<Result> {
    this.executionCount++;
    this.lastActivity = new Date();

    if (this.executionCount > this.config.maxExecutions) {
      this.updateStatus(ActorLifecycleStatus.ERROR);
      return createFailureResult(action.id, this.id, "Max executions exceeded", 0);
    }

    await this.delay(this.config.executionTime);

    if (Math.random() < this.config.failureRate) {
      this.updateStatus(ActorLifecycleStatus.ERROR);
      return createFailureResult(action.id, this.id, "Random failure", this.config.executionTime);
    }

    if (action.params?.section && action.params?.data) {
      this.board.write(action.params.section as string, action.params.data);
    }

    this.updateStatus(ActorLifecycleStatus.IDLE);
    return createSuccessResult(action.id, this.id, { written: true }, this.config.executionTime);
  }

  async report(result: Result): Promise<void> {
    this.lastActivity = new Date();

    if (result.status === "success") {
      this.metrics.successCount++;
      this.metrics.totalRuns++;
      this.metrics.totalExecutionTimeMs += result.metrics?.duration || 0;
      this.metrics.lastExecutionTime = result.metrics?.duration || 0;
      this.metrics.averageExecutionTime =
        this.metrics.totalExecutionTimeMs / this.metrics.totalRuns;
    } else {
      this.metrics.failureCount++;
      this.metrics.totalRuns++;
      this.metrics.lastError = new Error(result.error || "Unknown error");
      this.updateStatus(ActorLifecycleStatus.ERROR);
    }

    this.metrics.updatedAt = new Date();
    this.status = this.createStatus(this.currentLifecycleStatus);

    if (result.toRecord) {
      this.board.write(result.toRecord.section, result.toRecord.data);
    }
  }

  async start(): Promise<void> {
    this.updateStatus(ActorLifecycleStatus.STARTING);
    await this.delay(1);
    this.updateStatus(ActorLifecycleStatus.RUNNING);
  }

  async stop(): Promise<void> {
    this.updateStatus(ActorLifecycleStatus.STOPPING);
    this.subscriptions.forEach((unsub) => unsub());
    this.subscriptions = [];
    await this.delay(1);
    this.updateStatus(ActorLifecycleStatus.STOPPED);
  }

  async restart(): Promise<void> {
    this.updateStatus(ActorLifecycleStatus.RESTARTING);
    this.resetExecutionCount();
    await this.delay(1);
    this.updateStatus(ActorLifecycleStatus.RUNNING);
  }

  getStatus(): ActorStatus {
    this.status = this.createStatus(this.currentLifecycleStatus);
    this.status.lastSeen = new Date();
    return this.status;
  }

  isAlive(): boolean {
    return this.currentLifecycleStatus !== ActorLifecycleStatus.STOPPED;
  }

  async receive(message: Message<unknown>): Promise<void> {
    this.lastActivity = new Date();
    this.status.metrics.totalMessagesProcessed++;

    const messageType = message.type as MessageType;

    if (messageType === ("start" as MessageType)) {
      await this.start();
    } else if (messageType === ("stop" as MessageType)) {
      await this.stop();
    } else if (messageType === ("restart" as MessageType)) {
      await this.restart();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
