import type { IMessageBus, Message, MessageType, UnsubscribeFn } from "../types/message";
import type { ActorId } from "../types/actor";

/**
 * No-Op MessageBus - 기본값으로 사용되는 빈 구현
 */
export class NoOpMessageBus implements IMessageBus {
  send(message: Message): void {}
  sendTo(to: ActorId, message: Omit<Message, "to">): void {}
  broadcast(message: Omit<Message, "to">): void {}
  receive(handler: (message: Message) => void): void {}
  request<T>(message: Message, timeoutMs?: number): Promise<Message<T>> {
    return Promise.resolve(message as Message<T>);
  }
  subscribe(messageType: MessageType, handler: (message: Message) => void): UnsubscribeFn {
    return () => {};
  }
  getQueueSize(actorId: ActorId): number {
    return 0;
  }
  clearQueue(actorId: ActorId): void {}
  filter(predicate: (message: Message) => boolean): Message[] {
    return [];
  }
}
