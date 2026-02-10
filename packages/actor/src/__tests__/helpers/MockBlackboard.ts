import { EventEmitter } from "events";
import { IBlackboard } from "../../types/blackboard";

export class MockBlackboard implements IBlackboard {
  private readonly data: Map<string, unknown>;
  private readonly events: EventEmitter;
  readonly version: number = 1;

  constructor() {
    this.data = new Map();
    this.events = new EventEmitter();
  }

  read(key: string): unknown | undefined {
    return this.data.get(key);
  }

  write(key: string, value: unknown): void {
    this.data.set(key, value);
    this.events.emit(`${key}.updated`, value);
  }

  subscribe(event: string, handler: (data: unknown) => void): () => void {
    this.events.on(event, handler);
    return () => this.events.off(event, handler);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  find(pattern: string): string[] {
    const regex = new RegExp(pattern.replace("*", ".*"));
    return this.keys().filter((key) => regex.test(key));
  }

  getData(key: string): unknown {
    return this.data.get(key);
  }

  setData(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  clear(): void {
    this.data.clear();
  }
}
