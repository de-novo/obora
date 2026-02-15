import type { Action } from "../types/action";
import {
  Actor,
  ActorId,
  ActorRole,
  ActorStatus,
  ActorLifecycleStatus,
  isValidTransition,
} from "../types/actor";
import type { IBlackboard } from "../types/blackboard";
import type { IMessageBus, Message, MessageId } from "../types/message";
import { createMessageId } from "../types/message";
import { MessageType } from "../types/message";
import { createActorMetrics, ActorMetrics } from "../types/metrics";
import type { Observation } from "../types/observation";
import type { Result } from "../types/result";

/**
 * Actor 구현을 위한 추상 기본 클래스 (스펙 기준)
 *
 * 구체적인 Actor 구현 시 이 클래스를 상속받아 필요한 메서드를 구현합니다.
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export abstract class BaseActor implements Actor {
  readonly id: ActorId;
  readonly name: string;
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  private _status: ActorStatus;
  lastActivity: Date;
  createdAt: Date;
  metrics: ActorMetrics;
  private subscriptions: (() => void)[] = [];

  constructor(
    id: ActorId,
    name: string,
    role: ActorRole,
    board: IBlackboard,
    messageBus: IMessageBus
  ) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this.createdAt = new Date();
    this.lastActivity = this.createdAt;
    this.metrics = createActorMetrics();
    this._status = {
      id: this.id,
      name: this.name,
      role: this.role,
      status: ActorLifecycleStatus.CREATED,
      messageQueue: {
        pending: 0,
        processing: false,
      },
      metrics: {
        totalMessagesProcessed: 0,
        totalActionsExecuted: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        uptime: 0,
      },
      lastSeen: this.createdAt,
      errorCount: 0,
    };
  }

  get status(): ActorStatus {
    return this._status;
  }

  protected setStatus(newStatus: ActorLifecycleStatus): void {
    if (!isValidTransition(this._status.status, newStatus)) {
      throw new Error(`Invalid status transition: ${this._status.status} → ${newStatus}`);
    }
    this._status.status = newStatus;
    this.lastActivity = new Date();
    this._status.lastSeen = this.lastActivity;
  }

  /**
   * 하위 클래스에서 observe()를 구현해야 합니다.
   * 동기 또는 비동기 구현 모두 가능합니다.
   */
  abstract observe(): Observation | Promise<Observation>;

  /**
   * 하위 클래스에서 think()를 구현해야 합니다.
   * 동기 또는 비동기 구현 모두 가능합니다.
   */
  abstract think(observation: Observation): Action | Promise<Action>;

  /**
   * 하위 클래스에서 act()를 구현해야 합니다.
   * 동기 또는 비동기 구현 모두 가능합니다.
   */
  abstract act(action: Action): Result | Promise<Result>;

  /**
   * receive()의 기본 구현 - 메시지 처리
   */
  async receive(message: Message): Promise<void> {
    this.updateLastActivity();

    switch (message.type) {
      case MessageType.PING:
        this.handlePing(message);
        break;
      case MessageType.TASK_ASSIGN:
        await this.handleTaskAssign(message);
        break;
      case MessageType.STATUS_REQUEST:
        this.handleStatusRequest(message);
        break;
      case MessageType.STOP:
        await this.stop();
        break;
      case MessageType.RESTART:
        await this.restart();
        break;
      default:
        this.handleCustomMessage(message);
    }
  }

  /**
   * report()의 기본 구현 - Blackboard에 결과 기록
   * 동기 또는 비동기 구현 모두 가능합니다.
   */
  report(result: Result): void | Promise<void> {
    if (result.toRecord) {
      const { section, data } = result.toRecord;
      this.board.write(section, data);
    }

    this.updateMetrics(result);

    // 이벤트 발행
    this.messageBus.broadcast({
      id: createMessageId(`msg-${crypto.randomUUID()}`),
      type: MessageType.TASK_COMPLETE,
      from: this.id,
      payload: { taskId: result.actionId, result },
      timestamp: new Date(),
    });
  }

  /**
   * start()의 기본 구현
   */
  async start(): Promise<void> {
    if (this.isAlive()) return;

    this.setStatus(ActorLifecycleStatus.STARTING);

    try {
      // 메시지 수신 시작
      this.setupMessageHandlers();

      // 상태 변경
      this.setStatus(ActorLifecycleStatus.RUNNING);

      // 하트비트 시작
      this.startHeartbeat();
    } catch (error) {
      this.setStatus(ActorLifecycleStatus.ERROR);
      throw error;
    }
  }

  /**
   * stop()의 기본 구현
   */
  async stop(): Promise<void> {
    if (this._status.status === ActorLifecycleStatus.STOPPED) return;

    const canStop = [
      ActorLifecycleStatus.RUNNING,
      ActorLifecycleStatus.IDLE,
      ActorLifecycleStatus.ERROR,
    ].includes(this._status.status);

    if (!canStop) {
      throw new Error(
        `Cannot stop from ${this._status.status} state - valid states for stop: RUNNING, IDLE, ERROR`
      );
    }

    this.setStatus(ActorLifecycleStatus.STOPPING);

    // 구독 해제
    this.teardownMessageHandlers();

    // 하트비트 정지
    this.stopHeartbeat();

    this.setStatus(ActorLifecycleStatus.STOPPED);
  }

  /**
   * restart()의 기본 구현
   */
  async restart(): Promise<void> {
    const currentStatus = this._status.status;

    // STOPPED is a terminal state, cannot restart
    if (currentStatus === ActorLifecycleStatus.STOPPED) {
      throw new Error("Cannot restart from STOPPED state - it is a terminal state");
    }

    // Direct restart via RESTARTING state (for alive states and ERROR)
    if (
      [
        ActorLifecycleStatus.RUNNING,
        ActorLifecycleStatus.IDLE,
        ActorLifecycleStatus.BUSY,
        ActorLifecycleStatus.ERROR,
      ].includes(currentStatus)
    ) {
      this.setStatus(ActorLifecycleStatus.RESTARTING);

      try {
        this.stopHeartbeat();
        this.setupMessageHandlers();
        this.setStatus(ActorLifecycleStatus.RUNNING);
        this.startHeartbeat();
      } catch (error) {
        this.setStatus(ActorLifecycleStatus.ERROR);
        throw error;
      }
    }
    // For other states (CREATED, STARTING, STOPPING, RESTARTING), just start
    else {
      await this.start();
    }
  }

  /**
   * isAlive() 기본 구현
   */
  isAlive(): boolean {
    return (
      this._status.status === ActorLifecycleStatus.RUNNING ||
      this._status.status === ActorLifecycleStatus.IDLE ||
      this._status.status === ActorLifecycleStatus.BUSY
    );
  }

  /**
   * getStatus() 기본 구현
   */
  getStatus(): ActorStatus {
    const statusCopy = { ...this._status };
    statusCopy.metrics = { ...this._status.metrics };
    statusCopy.metrics.uptime = Date.now() - this.createdAt.getTime();
    return statusCopy;
  }

  /**
   * 메트릭 업데이트
   */
  protected updateMetrics(result: Result): void {
    this.metrics.totalRuns++;
    if (result.status === "success") {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
      this.metrics.lastError = result.error ? new Error(result.error) : null;
    }
    this.metrics.lastExecutionTime = result.metrics?.duration ?? null;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalRuns - 1) +
        (result.metrics?.duration ?? 0)) /
      this.metrics.totalRuns;

    // 내부 status 메트릭도 동기화
    this._status.metrics.totalActionsExecuted++;
    this._status.metrics.uptime = Date.now() - this.createdAt.getTime();
    if (result.status !== "success") {
      this._status.metrics.totalErrors++;
    }
  }

  // ==================== 핸들러 ====================

  private async handleTaskAssign(_message: Message): Promise<void> {
    // 작업 수행
    const observation = await this.observe();
    const action = await this.think(observation);
    const result = await this.act(action);
    await this.report(result);
  }

  private handlePing(message: Message): void {
    this.messageBus.sendTo(message.from, {
      id: createMessageId(`msg-${crypto.randomUUID()}`),
      type: MessageType.PONG,
      from: this.id,
      payload: {},
      timestamp: new Date(),
    });
  }

  private handleStatusRequest(message: Message): void {
    const status = this.getStatus();

    this.messageBus.sendTo(message.from, {
      id: createMessageId(`msg-${crypto.randomUUID()}`),
      type: MessageType.STATUS_RESPONSE,
      from: this.id,
      payload: { status },
      timestamp: new Date(),
    });
  }

  protected handleCustomMessage(_message: Message): void {
    // 서브클래스에서 오버라이드
  }

  private teardownMessageHandlers(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
  }

  private setupMessageHandlers(): void {
    // 기존 구독 해제
    this.teardownMessageHandlers();

    // 새로운 구독 등록
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.PING, (msg) => this.receive(msg))
    );
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.TASK_ASSIGN, (msg) => this.receive(msg))
    );
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.STATUS_REQUEST, (msg) => this.receive(msg))
    );
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.STOP, (msg) => this.receive(msg))
    );
    this.subscriptions.push(
      this.messageBus.subscribe(MessageType.RESTART, (msg) => this.receive(msg))
    );
  }

  private heartbeatTimer?: ReturnType<typeof setInterval>;

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.messageBus.broadcast({
        id: createMessageId(`msg-${crypto.randomUUID()}`),
        type: MessageType.HEARTBEAT,
        from: this.id,
        payload: {
          timestamp: new Date(),
          status: this._status.status,
        },
        timestamp: new Date(),
      });
    }, 30000); // 30초마다
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private updateLastActivity(): void {
    this.lastActivity = new Date();
    this._status.lastSeen = this.lastActivity;
  }
}
