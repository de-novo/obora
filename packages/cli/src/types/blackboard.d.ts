declare module "@obora-kit/blackboard" {
  export class Blackboard {
    version: number;
    constructor(config?: { sessionId?: string });
    read<T = unknown>(path: string, options?: { strict?: boolean }): T;
    write(path: string, value: unknown): void;
  }

  export function createSessionId(id?: string): string;
}
