/**
 * @module events/event-bus
 * @description Event Bus 구현 - Pub/Sub 패턴, 와일드카드 구독, 이벤트 필터링 지원
 */

import type {
  Event,
  EventType,
  EventByType,
  BaseEvent,
  EventCategory,
} from './types';
import type { AgentId } from '../types';

/**
 * 이벤트 핸들러 타입
 */
export type EventHandler<T extends Event = Event> = (
  event: T
) => void | Promise<void>;

/**
 * 구독 정보 인터페이스
 */
interface Subscription<T extends Event = Event> {
  handler: EventHandler<T>;
  eventType: string;
  once: boolean;
  filter?: EventFilter;
}

/**
 * 구독 해제 함수
 */
export type Unsubscribe = () => void;

/**
 * 이벤트 필터 조건
 */
export interface EventFilter {
  /** 소스 에이전트 ID */
  source?: AgentId | 'system';
  /** 상관 ID */
  correlationId?: string;
  /** 커스텀 필터 함수 */
  predicate?: (event: Event) => boolean;
}

/**
 * Event Bus 설정
 */
export interface EventBusOptions {
  /** 최대 리스너 수 (기본: 100) */
  maxListeners?: number;
  /** 비동기 핸들러 에러 시 throw 여부 (기본: false) */
  throwOnAsyncError?: boolean;
  /** 비동기 핸들러 에러 시 에러 이벤트 발행 여부 (기본: true) */
  emitErrorEvent?: boolean;
  /** 이벤트 히스토리 유지 개수 (기본: 0 = 유지 안함) */
  historySize?: number;
  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * Event Bus 통계
 */
export interface EventBusStats {
  /** 총 발행된 이벤트 수 */
  totalEmitted: number;
  /** 타입별 발행 수 */
  emittedByType: Map<string, number>;
  /** 현재 구독자 수 */
  subscriberCount: number;
  /** 타입별 구독자 수 */
  subscribersByType: Map<string, number>;
}

/**
 * 이벤트 대기용 타임아웃 에러
 */
export class EventTimeoutError extends Error {
  constructor(eventType: string, timeout: number) {
    super(`Timeout waiting for event '${eventType}' after ${timeout}ms`);
    this.name = 'EventTimeoutError';
  }
}

/**
 * Event Bus
 * @description Blackboard 이벤트를 위한 Pub/Sub 시스템
 * @description EventEmitter 상속하지 않고 자체 구현 (브라우저 호환)
 *
 * @example
 * ```typescript
 * const bus = new EventBus({ historySize: 100 });
 *
 * // 특정 이벤트 구독
 * const unsub = bus.subscribe('task.completed', (event) => {
 *   console.log('Task completed:', event.payload.taskId);
 * });
 *
 * // 와일드카드 구독
 * bus.subscribe('task.*', (event) => {
 *   console.log('Task event:', event.type);
 * });
 *
 * // 모든 이벤트 구독
 * bus.subscribe('*', (event) => {
 *   console.log('Any event:', event.type);
 * });
 *
 * // 필터와 함께 구독
 * bus.subscribeWithFilter('decision.*',
 *   { source: createAgentId('ceo') },
 *   (event) => console.log('CEO decision event')
 * );
 *
 * // 이벤트 발행
 * bus.emit({
 *   id: generateId(),
 *   type: 'task.completed',
 *   timestamp: new Date(),
 *   source: 'system',
 *   payload: { taskId: createTaskId('task-1'), result: {}, duration: 5000 }
 * });
 *
 * // 구독 해제
 * unsub();
 * ```
 */
export class EventBus {
  private readonly options: Required<EventBusOptions>;
  private history: Event[];
  private stats: EventBusStats;
  private subscriptions: Set<Subscription<Event>>;
  private nextSubscriptionId = 0;
  /** 에러 이벤트 발행 중인지 체크 (재귀 방지) */
  private isEmittingError = false;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      maxListeners: options.maxListeners ?? 100,
      throwOnAsyncError: options.throwOnAsyncError ?? false,
      emitErrorEvent: options.emitErrorEvent ?? true,
      historySize: options.historySize ?? 0,
      debug: options.debug ?? false,
    };
    this.history = [];
    this.stats = this.createInitialStats();
    this.subscriptions = new Set();
  }

  // === 구독 API ===

  /**
   * 이벤트 구독
   * @param eventType - 이벤트 타입 (와일드카드 지원: 'task.*', '*')
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribe<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe {
    this.debugLog(`Subscribing to event type: ${eventType}`);

    const subscription: Subscription<Event> = {
      handler: handler as EventHandler<Event>,
      eventType,
      once: false,
    };

    this.subscriptions.add(subscription);
    this.updateSubscriberStats();

    return () => {
      this.subscriptions.delete(subscription);
      this.updateSubscriberStats();
      this.debugLog(`Unsubscribed from event type: ${eventType}`);
    };
  }

  /**
   * 필터와 함께 구독
   * @param eventType - 이벤트 타입
   * @param filter - 필터 조건
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribeWithFilter<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    filter: EventFilter,
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe {
    this.debugLog(
      `Subscribing with filter to event type: ${eventType}`,
      filter
    );

    const subscription: Subscription<Event> = {
      handler: handler as EventHandler<Event>,
      eventType,
      once: false,
      filter,
    };

    this.subscriptions.add(subscription);
    this.updateSubscriberStats();

    return () => {
      this.subscriptions.delete(subscription);
      this.updateSubscriberStats();
      this.debugLog(
        `Unsubscribed (with filter) from event type: ${eventType}`
      );
    };
  }

  /**
   * 일회성 구독
   * @param eventType - 이벤트 타입
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribeOnce<T extends EventType>(
    eventType: T,
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe {
    this.debugLog(`Subscribing once to event type: ${eventType}`);

    const subscription: Subscription<Event> = {
      handler: handler as EventHandler<Event>,
      eventType,
      once: true,
    };

    this.subscriptions.add(subscription);
    this.updateSubscriberStats();

    return () => {
      this.subscriptions.delete(subscription);
      this.updateSubscriberStats();
    };
  }

  /**
   * 구독 해제
   * @param eventType - 이벤트 타입
   * @param handler - 제거할 핸들러
   */
  unsubscribe<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    handler: EventHandler<EventByType<T>>
  ): void {
    for (const sub of this.subscriptions) {
      if (sub.eventType === eventType && sub.handler === handler) {
        this.subscriptions.delete(sub);
        this.updateSubscriberStats();
        this.debugLog(`Unsubscribed from event type: ${eventType}`);
        return;
      }
    }
  }

  /**
   * 모든 구독 해제
   * @param eventType - 특정 이벤트 타입만 해제 (선택)
   */
  unsubscribeAll<T extends EventType>(
    eventType?: T | `${EventCategory}.*` | '*'
  ): void {
    if (eventType) {
      // 특정 타입의 구독만 해제
      const toRemove: Subscription<Event>[] = [];
      for (const sub of this.subscriptions) {
        if (sub.eventType === eventType) {
          toRemove.push(sub);
        }
      }
      for (const sub of toRemove) {
        this.subscriptions.delete(sub);
      }
      this.debugLog(`Unsubscribed all from event type: ${eventType}`);
    } else {
      // 모든 구독 해제
      this.subscriptions.clear();
      this.debugLog('Unsubscribed all subscribers');
    }
    this.updateSubscriberStats();
  }

  /**
   * 이벤트 버스 초기화 (히스토리만 지움, 구독자는 유지)
   */
  clear(): void {
    this.history = [];
    this.stats = this.createInitialStats();
    this.updateSubscriberStats();
    this.debugLog('EventBus history cleared');
  }

  // === 발행 API ===

  /**
   * 이벤트 발행
   * @param event - 발행할 이벤트
   */
  emit<T extends Event>(event: T): void {
    this.debugLog(`Emitting event: ${event.type}`, event);

    // 통계 업데이트
    this.updateStats(event);

    // 히스토리에 추가
    this.addToHistory(event);

    // 구독자들에게 이벤트 전달
    const toRemove: Subscription<Event>[] = [];

    for (const sub of this.subscriptions) {
      // 패턴 매칭 확인
      if (!this.matchesPattern(sub.eventType, event.type)) {
        continue;
      }

      // 필터 확인
      if (sub.filter && !this.applyFilter(event, sub.filter)) {
        continue;
      }

      // 핸들러 실행
      try {
        const result = sub.handler(event);

        // 비동기 핸들러 처리
        if (result instanceof Promise) {
          result.catch((error) => {
            // 에러 이벤트 핸들러 실패 시 별도 경고 로그 (에러 이벤트 재발행 방지)
            if (event.type === 'system.error') {
              console.warn('[EventBus] Error handler failed:', error);
              // 에러 이벤트의 에러는 재발행하지 않음 (무한 루프 방지)
            } else {
              if (this.options.throwOnAsyncError) {
                throw error;
              }
              console.error(`Error in async event handler:`, error);

              // 에러 이벤트 발행
              if (this.options.emitErrorEvent) {
                this.emitError(error, event, sub.eventType);
              }
            }
          });
        }
      } catch (error) {
        console.error(`Error in event handler:`, error);

        // 에러 이벤트 발행
        if (this.options.emitErrorEvent) {
          this.emitError(error, event, sub.eventType);
        }
      }

      // 일회성 구독인 경우 제거 대기열에 추가
      if (sub.once) {
        toRemove.push(sub);
      }
    }

    // 일회성 구독 제거
    for (const sub of toRemove) {
      this.subscriptions.delete(sub);
      this.updateSubscriberStats();
    }
  }

  /**
   * 이벤트 발행 (비동기 핸들러 완료 대기)
   * @param event - 발행할 이벤트
   * @returns 모든 핸들러 완료 시 resolve
   */
  async emitAsync<T extends Event>(event: T): Promise<void> {
    this.debugLog(`Emitting async event: ${event.type}`, event);

    // 통계 업데이트
    this.updateStats(event);

    // 히스토리에 추가
    this.addToHistory(event);

    // 구독자들에게 이벤트 전달 (비동기)
    const promises: Promise<unknown>[] = [];
    const toRemove: Subscription<Event>[] = [];

    for (const sub of this.subscriptions) {
      // 패턴 매칭 확인
      if (!this.matchesPattern(sub.eventType, event.type)) {
        continue;
      }

      // 필터 확인
      if (sub.filter && !this.applyFilter(event, sub.filter)) {
        continue;
      }

      // 핸들러 실행
      try {
        const result = sub.handler(event);

        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`Error in event handler:`, error);
      }

      // 일회성 구독인 경우 제거 대기열에 추가
      if (sub.once) {
        toRemove.push(sub);
      }
    }

    // 일회성 구독 제거
    for (const sub of toRemove) {
      this.subscriptions.delete(sub);
      this.updateSubscriberStats();
    }

    // 모든 비동기 핸들러 완료 대기
    await Promise.allSettled(promises);
  }

  /**
   * 배치 이벤트 발행
   * @param events - 발행할 이벤트 목록
   */
  emitBatch(events: Event[]): void {
    this.debugLog(`Emitting batch of ${events.length} events`);

    for (const event of events) {
      this.emit(event);
    }
  }

  // === 히스토리 API ===

  /**
   * 이벤트 히스토리 조회
   * @param filter - 필터 조건
   * @param limit - 최대 개수
   * @returns 필터링된 이벤트 목록
   */
  getHistory(
    filter?: {
      type?: EventType | `${EventCategory}.*`;
      source?: AgentId | 'system';
      since?: Date;
      until?: Date;
      limit?: number;
    },
    limitArg?: number
  ): Event[] {
    let events = this.history;

    // 타입 필터링
    if (filter?.type) {
      events = events.filter((e) => this.matchesPattern(filter.type!, e.type));
    }

    // 소스 필터링
    if (filter?.source) {
      events = events.filter((e) => e.source === filter.source);
    }

    // 시간 필터링
    if (filter?.since) {
      events = events.filter((e) => e.timestamp >= filter.since!);
    }

    if (filter?.until) {
      events = events.filter((e) => e.timestamp <= filter.until!);
    }

    // 제한 (filter.limit 또는 두 번째 인자 사용)
    const limit = filter?.limit ?? limitArg;
    if (limit !== undefined && limit > 0) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * 히스토리 재생
   * @description 지정된 이벤트들을 다시 발행
   * @param events - 재생할 이벤트 목록
   */
  replay(events: Event[]): void {
    this.debugLog(`Replaying ${events.length} events`);

    for (const event of events) {
      this.emit(event);
    }
  }

  /**
   * 히스토리 클리어
   */
  clearHistory(): void {
    this.history = [];
    this.debugLog('History cleared');
  }

  // === 유틸리티 API ===

  /**
   * 통계 조회
   */
  getStats(): Readonly<EventBusStats> & { eventsByType: Record<string, number> } {
    const eventsByType: Record<string, number> = {};
    for (const [type, count] of this.stats.emittedByType.entries()) {
      eventsByType[type] = count;
    }

    return {
      totalEmitted: this.stats.totalEmitted,
      emittedByType: new Map(this.stats.emittedByType),
      subscriberCount: this.stats.subscriberCount,
      subscribersByType: new Map(this.stats.subscribersByType),
      eventsByType,
    };
  }

  /**
   * 모든 구독 해제
   */
  removeAllSubscribers(): void {
    this.subscriptions.clear();
    this.stats.subscriberCount = 0;
    this.stats.subscribersByType.clear();
    this.debugLog('All subscribers removed');
  }

  /**
   * 특정 타입의 모든 구독 해제
   */
  removeSubscribersForType(
    eventType: EventType | `${EventCategory}.*` | '*'
  ): void {
    const toRemove: Subscription<Event>[] = [];

    for (const sub of this.subscriptions) {
      if (sub.eventType === eventType) {
        toRemove.push(sub);
      }
    }

    for (const sub of toRemove) {
      this.subscriptions.delete(sub);
    }

    this.updateSubscriberStats();
    this.debugLog(`Removed all subscribers for event type: ${eventType}`);
  }

  /**
   * 이벤트 대기 (Promise 기반)
   * @param eventType - 대기할 이벤트 타입
   * @param timeout - 타임아웃 (ms)
   * @returns 발생한 이벤트
   */
  waitFor<T extends EventType>(
    eventType: T,
    timeout: number = 30000,
    predicate?: (event: EventByType<T>) => boolean
  ): Promise<EventByType<T>> {
    return new Promise((resolve, reject) => {
      let unsubscribe: Unsubscribe | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      if (predicate) {
        // 필터가 있는 경우 subscribe 사용 (한 번만 호출)
        unsubscribe = this.subscribe(eventType, (event) => {
          if (predicate(event as EventByType<T>)) {
            cleanup();
            resolve(event as EventByType<T>);
          }
        });
      } else {
        // 필터가 없는 경우 subscribeOnce 사용
        unsubscribe = this.subscribeOnce(eventType, (event) => {
          cleanup();
          resolve(event as EventByType<T>);
        });
      }

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new EventTimeoutError(eventType, timeout));
      }, timeout);
    });
  }

  /**
   * 이벤트 대기 (조건 충족 시)
   * @param eventType - 대기할 이벤트 타입
   * @param predicate - 조건 함수
   * @param timeout - 타임아웃 (ms)
   */
  waitForCondition<T extends EventType>(
    eventType: T,
    predicate: (event: EventByType<T>) => boolean,
    timeout: number = 30000
  ): Promise<EventByType<T>> {
    return new Promise((resolve, reject) => {
      let unsubscribe: Unsubscribe | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      unsubscribe = this.subscribe(eventType, (event) => {
        const typedEvent = event as EventByType<T>;
        if (predicate(typedEvent)) {
          cleanup();
          resolve(typedEvent);
        }
      });

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new EventTimeoutError(eventType, timeout));
      }, timeout);
    });
  }

  // === 내부 메서드 ===

  /**
   * 에러 이벤트 발행
   * @description 핸들러 에러 발생 시 시스템 에러 이벤트 발행
   * @private
   */
  private emitError(error: unknown, originalEvent: Event, handlerEventType: string): void {
    // 재귀 방지: 이미 에러 이벤트 발행 중이면 추가 발행을 막음
    if (this.isEmittingError) {
      console.error('Suppressing recursive error event:', error);
      return;
    }

    this.isEmittingError = true;
    try {
      // 에러 객체 정제 (민감 데이터 노출 방지)
      const sanitizedError = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack : undefined,
      };

      const errorEvent = {
        id: `evt-error-${crypto.randomUUID()}`,
        type: 'system.error' as const,
        timestamp: new Date(),
        source: 'system' as const,
        payload: {
          code: 'EVENT_HANDLER_ERROR',
          message: sanitizedError.message,
          details: {
            originalEventType: originalEvent.type,
            handlerEventType,
            error: sanitizedError,
          },
        },
      };

      // emit()을 통해서만 발행 (emit() 내에서 히스토리/통계 처리)
      this.emit(errorEvent as Event);
    } catch (e) {
      // 에러 이벤트 발행 자체가 실패하면 무시
      console.error('Failed to emit error event:', e);
    } finally {
      this.isEmittingError = false;
    }
  }

  /**
   * 와일드카드 패턴 매칭
   * @param pattern - 패턴 (예: 'task.*')
   * @param eventType - 실제 이벤트 타입
   */
  private matchesPattern(pattern: string, eventType: string): boolean {
    if (pattern === '*') {
      return true;
    }

    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1); // '*' 제거
      return eventType.startsWith(prefix);
    }

    return pattern === eventType;
  }

  /**
   * 필터 적용
   * @param event - 이벤트
   * @param filter - 필터 조건
   */
  private applyFilter(event: Event, filter: EventFilter): boolean {
    if (filter.source && event.source !== filter.source) {
      return false;
    }

    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }

    if (filter.predicate && !filter.predicate(event)) {
      return false;
    }

    return true;
  }

  /**
   * 히스토리에 이벤트 추가
   */
  private addToHistory(event: Event): void {
    if (this.options.historySize === 0) {
      return;
    }

    this.history.push(event);

    // 제한 초과 시 오래된 이벤트 제거
    if (this.history.length > this.options.historySize) {
      this.history.shift();
    }
  }

  /**
   * 통계 업데이트
   */
  private updateStats(event: Event): void {
    this.stats.totalEmitted++;

    const current = this.stats.emittedByType.get(event.type) ?? 0;
    this.stats.emittedByType.set(event.type, current + 1);
  }

  /**
   * 구독자 통계 업데이트
   */
  private updateSubscriberStats(): void {
    this.stats.subscriberCount = this.subscriptions.size;

    // 타입별 구독자 수 계산
    const countByType = new Map<string, number>();
    for (const sub of this.subscriptions) {
      const current = countByType.get(sub.eventType) ?? 0;
      countByType.set(sub.eventType, current + 1);
    }

    this.stats.subscribersByType = countByType;
  }

  /**
   * 초기 통계 생성
   */
  private createInitialStats(): EventBusStats {
    return {
      totalEmitted: 0,
      emittedByType: new Map(),
      subscriberCount: 0,
      subscribersByType: new Map(),
    };
  }

  /**
   * 디버그 로그
   */
  private debugLog(message: string, data?: unknown): void {
    if (this.options.debug) {
      if (data !== undefined) {
        console.debug(`[EventBus] ${message}`, data);
      } else {
        console.debug(`[EventBus] ${message}`);
      }
    }
  }
}
