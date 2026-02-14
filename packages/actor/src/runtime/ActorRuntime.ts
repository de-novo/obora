import { ActorLifecycleStatus } from "../types/actor";
import type { Actor, ActorId, ActorRole } from "../types/actor";
import type { IBlackboard } from "../types/actor";
import type { IMessageBus } from "../types/message";

import type { ActorFactory, ActorConfig } from "./types";
import { delay } from "./utils/delay";

export class ActorStopTimeoutError extends Error {
  constructor(actorId: ActorId) {
    super(`Actor stop timeout: ${actorId}`);
    this.name = "ActorStopTimeoutError";
  }
}

/**
 * Actor runtime configuration.
 */
export interface RuntimeConfig {
  /** Maximum number of concurrent actors. */
  maxActors?: number;

  /** Default timeout for actor spawn/start in milliseconds. */
  spawnTimeout?: number;

  /** Default timeout for actor stop in milliseconds. */
  stopTimeout?: number;

  /** Maximum number of restart attempts. */
  maxRestarts?: number;

  /** Initial restart backoff in milliseconds. */
  initialBackoff?: number;

  /** Maximum restart backoff in milliseconds. */
  maxBackoff?: number;

  /** Enables debug logging. */
  debug?: boolean;
}

/**
 * Actor runtime.
 *
 * Responsible for actor creation, management, and shutdown.
 */
export interface RuntimeStopResult {
  stopped: ActorId[];
  failed: Array<{ id: ActorId; error: unknown }>;
}

export class ActorRuntime {
  private readonly actors: Map<ActorId, Actor>;
  private readonly actorConfigs: Map<ActorId, ActorConfig>;
  private readonly spawningActorIds: Set<ActorId>;
  private readonly zombies: Set<ActorId>;
  private readonly board: IBlackboard;
  private readonly messageBus: IMessageBus;
  private readonly config: Required<RuntimeConfig>;
  private readonly factory: ActorFactory;
  private isRunning: boolean;

  constructor(
    board: IBlackboard,
    messageBus: IMessageBus,
    factory: ActorFactory,
    config?: RuntimeConfig
  ) {
    this.board = board;
    this.messageBus = messageBus;
    this.factory = factory;
    this.actors = new Map();
    this.actorConfigs = new Map();
    this.spawningActorIds = new Set();
    this.zombies = new Set();
    this.isRunning = false;

    // Default configuration
    const defaults: Required<RuntimeConfig> = {
      maxActors: 100,
      spawnTimeout: 5000,
      stopTimeout: 5000,
      maxRestarts: 3,
      initialBackoff: 1000,
      maxBackoff: 30000,
      debug: false,
    };
    this.config = { ...defaults, ...config };

    // Validate RuntimeConfig
    this.validateRuntimeConfig(this.config);
  }

  /**
   * Starts the runtime.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Runtime is already running");
    }
    this.isRunning = true;
    this.log("Runtime started");
  }

  /**
   * Stops the runtime.
   */
  async stop(): Promise<RuntimeStopResult> {
    // Runtime shutdown is idempotent
    if (!this.isRunning) {
      return { stopped: [], failed: [] };
    }

    this.log("Stopping runtime...");

    const actorIds = Array.from(this.actors.keys());
    const settled = await Promise.allSettled(actorIds.map((actorId) => this.stopActor(actorId)));

    const stopped: ActorId[] = [];
    const failed: Array<{ id: ActorId; error: unknown }> = [];

    settled.forEach((result, index) => {
      const actorId = actorIds[index]!;
      if (result.status === "fulfilled") {
        stopped.push(actorId);
      } else {
        failed.push({ id: actorId, error: result.reason });
      }
    });

    const failedIds = new Set(failed.map((entry) => entry.id));
    for (const zombieId of this.zombies) {
      if (!failedIds.has(zombieId)) {
        failed.push({ id: zombieId, error: new ActorStopTimeoutError(zombieId) });
      }
    }

    this.actors.clear();
    this.isRunning = false;
    this.log("Runtime stopped");

    return { stopped, failed };
  }

  /**
   * Stops a specific actor by ID.
   * @param actorId Actor ID.
   */
  async stopById(actorId: ActorId): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const actor = this.getActor(actorId);
    await this.stopActor(actor.id);
  }

  /**
   * Spawns a new actor.
   * @param config Actor configuration.
   * @returns The created actor.
   */
  async spawn(config: ActorConfig): Promise<Actor> {
    if (!this.isRunning) {
      throw new Error("Runtime is not running");
    }

    // Validate ActorConfig input
    this.validateConfig(config);

    // Check maximum actor count (including in-flight spawns)
    if (this.actors.size + this.spawningActorIds.size >= this.config.maxActors) {
      throw new Error(`Maximum actors limit reached: ${this.config.maxActors}`);
    }

    // Node.js는 단일 스레드이므로 await 이전 구간은 원자적으로 실행됩니다.
    // 다만 await 경계 사이에서는 interleaving이 발생할 수 있으므로,
    // 명시 ID는 spawn 시작 시 placeholder(Set)로 선점하여 TOCTOU를 방지합니다.
    const reservedId = config.id;
    if (reservedId) {
      if (this.actors.has(reservedId) || this.spawningActorIds.has(reservedId)) {
        throw new Error(`Actor already exists: ${reservedId}`);
      }
      this.spawningActorIds.add(reservedId);
    }

    this.log(`Spawning actor: ${config.id || "auto-generated"} (${config.role})`);

    const startTime = Date.now();
    let actor: Actor | null = null;

    try {
      const spawnAbort = new AbortController();
      const createAbort = new AbortController();
      const createPromise = this.factory.create(config, this.board, this.messageBus, {
        signal: createAbort.signal,
      });
      createPromise.catch(() => {});

      try {
        actor = await Promise.race([
          createPromise,
          delay(this.config.spawnTimeout, spawnAbort.signal).then(() => {
            createAbort.abort();
            throw new Error(`Actor spawn timeout: ${config.id || "unknown"}`);
          }),
        ]);
        createAbort.abort();
        spawnAbort.abort();
      } catch (error) {
        spawnAbort.abort();
        createAbort.abort();
        throw error;
      }

      // Protect auto-generated IDs during in-flight start/registration window
      const hadSpawningActorId = this.spawningActorIds.has(actor.id);
      if (hadSpawningActorId && actor.id !== reservedId) {
        throw new Error(`Actor already exists: ${actor.id}`);
      }
      this.spawningActorIds.add(actor.id);

      const startAbort = new AbortController();
      const startPromise = Promise.resolve(actor!.start());
      startPromise.catch(() => {});

      try {
        await Promise.race([
          startPromise,
          delay(this.config.spawnTimeout, startAbort.signal).then(() => {
            throw new Error(`Actor start timeout: ${actor!.id}`);
          }),
        ]);
        startAbort.abort();
      } catch (error) {
        startAbort.abort();
        throw error;
      }

      // Check duplication before registration (including auto-generated IDs)
      if (this.actors.has(actor.id)) {
        throw new Error(`Actor ID collision: ${actor.id}`);
      }

      this.actors.set(actor.id, actor);
      this.actorConfigs.set(actor.id, config);
      this.spawningActorIds.delete(actor.id);
      this.zombies.delete(actor.id);

      const duration = Date.now() - startTime;
      this.log(`Actor spawned: ${actor.id} (${duration}ms)`);

      return actor;
    } catch (error) {
      // Cleanup on timeout or error
      if (actor) {
        const cleanupAbort = new AbortController();
        const cleanupStopPromise = Promise.resolve(actor.stop());
        cleanupStopPromise.catch(() => {});

        try {
          const cleanupResult = await Promise.race<"stopped" | "timeout">([
            cleanupStopPromise.then(() => "stopped"),
            delay(this.config.stopTimeout ?? this.config.spawnTimeout, cleanupAbort.signal).then(
              () => "timeout"
            ),
          ]);

          cleanupAbort.abort();

          if (cleanupResult === "timeout") {
            this.zombies.add(actor.id);
            this.log(`Spawn cleanup timeout, actor ${actor.id} added to zombies`);
          }
        } catch (cleanupError) {
          cleanupAbort.abort();
          this.zombies.add(actor.id);
          this.log(`Spawn cleanup failed, actor ${actor.id} added to zombies`, cleanupError);
        }
      }
      const duration = Date.now() - startTime;
      this.log(`Actor spawn failed: ${config.id || "unknown"} (${duration}ms)`, error);
      throw error;
    } finally {
      if (reservedId) {
        this.spawningActorIds.delete(reservedId);
      }
      if (actor) {
        this.spawningActorIds.delete(actor.id);
      }
    }
  }

  /**
   * Restarts an actor.
   *
   * Total restart attempts are capped at `maxRestarts`.
   * @param actorId Actor ID.
   * @param restartCount Current restart attempt count (internal use).
   * @internal
   */
  async restart(actorId: ActorId, restartCount = 0): Promise<Actor> {
    if (restartCount >= this.config.maxRestarts) {
      throw new Error(`Max restarts (${this.config.maxRestarts}) exceeded for actor: ${actorId}`);
    }

    const actor = this.actors.get(actorId);
    const config = this.actorConfigs.get(actorId);

    if (!actor || !config) {
      throw new Error(`Actor or config not found: ${actorId}`);
    }

    const savedConfig = { ...config, id: actorId };

    this.log(`Restarting actor: ${actorId} (attempt ${restartCount + 1})`);

    try {
      await this.stopActor(actor.id);
      return this.retryRestart(actorId, savedConfig, restartCount);
    } catch (error) {
      this.log(`Actor restart failed: ${actorId}`, error);
      throw error;
    }
  }

  /**
   * Retries actor spawn with exponential backoff.
   * @param actorId Actor ID.
   * @param config Actor configuration.
   * @param restartCount Current restart attempt count.
   */
  private async retryRestart(
    actorId: ActorId,
    config: ActorConfig,
    restartCount: number
  ): Promise<Actor> {
    let attempt = restartCount;

    while (attempt < this.config.maxRestarts) {
      this.log(`Retrying actor restart: ${actorId} (attempt ${attempt + 1})`);

      const backoff = this.calculateBackoff(attempt);
      if (backoff > 0) {
        await delay(backoff);
      }

      try {
        const newActor = await this.spawn(config);
        this.log(`Actor restarted: ${actorId}`);
        return newActor;
      } catch (error) {
        this.log(`Actor retry restart failed: ${actorId}`, error);
        attempt += 1;
      }
    }

    throw new Error(`Max restarts (${this.config.maxRestarts}) exceeded for actor: ${actorId}`);
  }

  /**
   * Gets an actor by ID.
   * @param actorId Actor ID.
   * @returns Actor instance.
   */
  getActor(actorId: ActorId): Actor {
    const actor = this.actors.get(actorId);
    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }
    return actor;
  }

  /**
   * Checks whether an actor exists.
   * @param actorId Actor ID.
   * @returns True if the actor exists.
   */
  hasActor(actorId: ActorId): boolean {
    return this.actors.has(actorId);
  }

  /**
   * Returns all actor IDs.
   * @returns Array of actor IDs.
   */
  listActors(): ActorId[] {
    return Array.from(this.actors.keys());
  }

  /**
   * Returns actors filtered by role.
   * @param role Actor role.
   * @returns Array of actor IDs.
   */
  listActorsByRole(role: ActorRole): ActorId[] {
    return Array.from(this.actors.values())
      .filter((actor) => actor.role === role)
      .map((actor) => actor.id);
  }

  /**
   * Returns actors filtered by lifecycle status.
   * @param status Actor lifecycle status.
   * @returns Array of actor IDs.
   */
  listActorsByStatus(status: ActorLifecycleStatus): ActorId[] {
    return Array.from(this.actors.values())
      .filter((actor) => actor.status.status === status)
      .map((actor) => actor.id);
  }

  /**
   * Returns the current number of actors.
   */
  size(): number {
    return this.actors.size;
  }

  /**
   * Returns runtime status.
   */
  getStatus(): { running: boolean; actorCount: number } {
    return {
      running: this.isRunning,
      actorCount: this.actors.size,
    };
  }

  /**
   * Returns actor IDs that timed out during stop and may still be running.
   */
  getZombies(): ActorId[] {
    return Array.from(this.zombies);
  }

  // ==================== Internal methods ====================

  /**
   * Stops a managed actor and releases runtime references.
   *
   * Timeout trade-off:
   * - `actor.stop()` is raced against `stopTimeout`.
   * - In `finally`, the runtime always removes actor/config map entries, even when
   *   stop fails or times out.
   *
   * Why: keeping stale map entries blocks respawn/restart paths and leaks management state.
   * Trade-off: the underlying actor implementation might still be running after timeout
   * ("zombie" actor) because JavaScript promises are not force-cancelled.
   */
  private async stopActor(actorId: ActorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return;

    this.log(`Stopping actor: ${actorId}`);

    let timedOut = false;

    try {
      const stopAbort = new AbortController();
      const stopPromise = Promise.resolve(actor.stop());
      stopPromise.catch(() => {});

      try {
        await Promise.race([
          stopPromise,
          delay(this.config.stopTimeout, stopAbort.signal).then(() => {
            throw new ActorStopTimeoutError(actorId);
          }),
        ]);
        stopAbort.abort();
      } catch (error) {
        stopAbort.abort();
        if (this.isStopTimeoutError(error, actorId)) {
          timedOut = true;
          this.zombies.add(actorId);
        }
        throw error;
      }

      this.zombies.delete(actorId);
      this.log(`Actor stopped: ${actorId}`);
    } catch (error) {
      this.log(`Actor stop failed or timed out: ${actorId}`, error);
      throw error;
    } finally {
      this.actors.delete(actorId);
      this.actorConfigs.delete(actorId);
      if (timedOut) {
        this.log(`Actor marked as zombie: ${actorId}`);
      }
      this.log(`Actor removed: ${actorId}`);
    }
  }

  private isStopTimeoutError(error: unknown, _actorId: ActorId): boolean {
    return error instanceof ActorStopTimeoutError;
  }

  /**
   * Calculates exponential backoff for restart attempts.
   * @param restartCount Current restart attempt count.
   * @returns Backoff duration in milliseconds.
   */
  private calculateBackoff(restartCount: number): number {
    const factor = Math.pow(2, restartCount);
    const backoff = this.config.initialBackoff * factor;
    return Math.min(backoff, this.config.maxBackoff);
  }

  /**
   * Validates ActorConfig input.
   * @param config ActorConfig to validate.
   */
  private validateConfig(config: ActorConfig): void {
    if (!config.name || config.name.trim() === "") {
      throw new Error("Actor name is required");
    }
    if (!config.role) {
      throw new Error("Actor role is required");
    }
    if (!config.type || config.type.trim() === "") {
      throw new Error("Actor type is required");
    }
  }

  /**
   * Validates RuntimeConfig input.
   * @param config RuntimeConfig to validate.
   */
  private validateRuntimeConfig(config: Required<RuntimeConfig>): void {
    if (config.maxActors <= 0) {
      throw new Error("maxActors must be positive");
    }
    if (config.spawnTimeout <= 0) {
      throw new Error("spawnTimeout must be positive");
    }
    if (config.stopTimeout <= 0) {
      throw new Error("stopTimeout must be positive");
    }
    if (config.maxRestarts < 0) {
      throw new Error("maxRestarts must be non-negative");
    }
    if (config.initialBackoff <= 0) {
      throw new Error("initialBackoff must be positive");
    }
    if (config.maxBackoff <= 0) {
      throw new Error("maxBackoff must be positive");
    }
  }

  private log(message: string, error?: unknown): void {
    if (!this.config.debug) return;

    if (error) {
      console.error(`[ActorRuntime] ${message}`, error);
    } else {
      console.log(`[ActorRuntime] ${message}`);
    }
  }
}
