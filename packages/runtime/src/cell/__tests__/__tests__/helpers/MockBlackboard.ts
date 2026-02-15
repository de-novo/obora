import { IBlackboard } from "../../../actor-types/blackboard";

export class MockBlackboard implements IBlackboard {
  private readonly data: Map<string, unknown>;
  readonly version: number = 1;

  constructor() {
    this.data = new Map();
  }

  read(key: string): unknown | undefined {
    return this.data.get(key);
  }

  write(key: string, value: unknown): void {
    this.data.set(key, value);
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
