import type { ActionId } from "../../actor-types/action";
import type { ActorId, TaskId } from "../../actor-types/actor";
import type { MessageId } from "../../actor-types/message";
import type { ResultId } from "../../actor-types/result";

export function actionId(value: `action-${string}`): ActionId {
  return value as ActionId;
}

export function actorId(value: string): ActorId {
  return value as ActorId;
}

export function messageId(value: `msg-${string}`): MessageId {
  return value as MessageId;
}

export function resultId(value: `result-${string}`): ResultId {
  return value as ResultId;
}

export function taskId(value: `task-${string}`): TaskId {
  return value as TaskId;
}
