import type { Actor } from "../types/actor";
import { ActorLifecycleStatus } from "../types/actor";

import { delay } from "./utils/delay";

/**
 * Actor 실행 루프 옵션
 */
export interface RunnerOptions {
  /** 실행 간격 (ms) */
  interval?: number;

  /** 최대 연속 실행 횟수 */
  maxIterations?: number;

  /** 에러 발생 시 중지 여부 */
  stopOnError?: boolean;

  /** 종료 조건 콜백 */
  stopCondition?: () => boolean | Promise<boolean>;

  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * Actor 실행 루프
 *
 * Actor의 observe-think-act-report 사이클을 반복 실행합니다.
 */
export class ActorRunner {
  private readonly actor: Actor;
  private readonly options: Required<RunnerOptions>;
  private isRunning: boolean = false;
  private iterationCount: number = 0;
  private abortController: AbortController | null = null;

  constructor(actor: Actor, options?: RunnerOptions) {
    this.actor = actor;
    this.options = {
      interval: 1000,
      maxIterations: Infinity,
      stopOnError: true,
      stopCondition: () => false,
      debug: false,
      ...options,
    };
  }

  /**
   * 실행 루프 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Runner is already running");
    }

    this.isRunning = true;
    this.iterationCount = 0;
    this.abortController = new AbortController();

    while (this.isRunning) {
      // 종료 조건 확인
      if (await this.shouldStop()) {
        break;
      }

      // 최대 반복 횟수 확인
      if (this.iterationCount >= this.options.maxIterations) {
        break;
      }

      // Actor 상태 확인
      if (this.actor.status.status !== ActorLifecycleStatus.RUNNING) {
        break;
      }

      try {
        // 한 사이클 실행
        await this.runCycle();
        this.iterationCount++;
      } catch (error) {
        // 에러 로깅 (debug 모드와 무관하게 항상 로그)
        this.log(`Cycle error`, error);
        if (this.options.stopOnError) {
          throw error;
        }
        // 에러 무시하고 계속
      }

      // 대기 (AbortSignal 연동)
      try {
        await delay(this.options.interval, this.abortController?.signal);
      } catch {
        // abort 시 무시하고 루프 종료
        break;
      }
    }

    this.isRunning = false;
    this.abortController = null;
  }

  /**
   * 실행 루프 중지
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.abortController?.abort();
  }

  /**
   * 현재 실행 중인지 확인
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * 현재 반복 횟수
   */
  getIterationCount(): number {
    return this.iterationCount;
  }

  // ==================== 내부 메서드 ====================

  private async runCycle(): Promise<void> {
    // 1. Observe
    const obs = await Promise.resolve(this.actor.observe());

    // 2. Think
    const action = await Promise.resolve(this.actor.think(obs));

    // 3. Act
    const result = await Promise.resolve(this.actor.act(action));

    // 4. Report
    await Promise.resolve(this.actor.report(result));
  }

  private async shouldStop(): Promise<boolean> {
    // AbortController 확인
    if (this.abortController?.signal.aborted) {
      return true;
    }

    // 종료 조건 확인 (sync/async 모두 지원)
    return Promise.resolve(this.options.stopCondition());
  }

  /**
   * 내부 로그 출력.
   *
   * - `error`가 전달되면 `debug` 옵션과 무관하게 `console.error`로 항상 출력합니다.
   * - 일반 로그는 `debug: true`일 때만 `console.log`로 출력합니다.
   */
  private log(message: string, error?: unknown): void {
    if (error) {
      console.error(`[ActorRunner] ${message}`, error);
    } else if (this.options.debug) {
      console.log(`[ActorRunner] ${message}`);
    }
  }
}
