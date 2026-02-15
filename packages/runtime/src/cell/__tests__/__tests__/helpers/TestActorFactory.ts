import type { ActorFactory, ActorConfig } from "../../runtime/types";
import type { Actor } from "../../types/actor";
import type { IBlackboard } from "../../types/blackboard";
import type { IMessageBus } from "../../types/message";

import { createActorId } from "../../types/actor";
import { TestActor, TestActorConfig } from "./TestActor";

export class TestActorFactory implements ActorFactory {
  private actorConfig: TestActorConfig;
  private createdActors: Actor[] = [];

  constructor(config?: TestActorConfig) {
    this.actorConfig = config || {};
  }

  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const id = config.id || createActorId(config.role);
    const actor = new TestActor(id, config.name, config.role, board, messageBus, {
      ...this.actorConfig,
      ...(config.config as TestActorConfig),
    });
    this.createdActors.push(actor);
    return actor;
  }

  getCreatedActors(): Actor[] {
    return [...this.createdActors];
  }
  clearCreatedActors(): void {
    this.createdActors = [];
  }
  setActorConfig(config: TestActorConfig): void {
    this.actorConfig = config;
  }
}
