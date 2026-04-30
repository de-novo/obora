import type { ActionId } from "../../actor-types/action";
import type { ActorId, TaskId } from "../../actor-types/actor";

export function actionId(value: `action-${string}`): ActionId {
  return value as ActionId;
}

export function actorId(value: string): ActorId {
  return value as ActorId;
}

export function taskId(value: `task-${string}`): TaskId {
  return value as TaskId;
}
