import type { WorkflowLocator } from "@obora/sdk";

export type WorkflowWebMode = "view" | "build";

export interface WorkflowWebBridgeOptions {
  readonly locator: WorkflowLocator;
  readonly mode: WorkflowWebMode;
  readonly host?: string;
  readonly port?: number;
  readonly token?: string;
  readonly open?: boolean;
}

export interface WorkflowWebBridgeHandle {
  readonly url: string;
  readonly apiBaseUrl: string;
  readonly token: string;
  readonly close: () => Promise<void>;
  readonly waitUntilClosed: () => Promise<void>;
}
