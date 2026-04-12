declare module "@obora/dashboard" {
  export function createDashboardServer(overrides?: {
    host?: string;
    port?: number;
    staticDir?: string;
    apiBasePath?: string;
    wsPath?: string;
    corsOrigin?: string;
  }): Promise<{
    app: {
      listen(options: { host: string; port: number }): Promise<void>;
      close(): Promise<void>;
    };
    config: {
      host: string;
      port: number;
      staticDir: string;
      apiBasePath: string;
      wsPath: string;
      corsOrigin: string;
    };
    wsBridge: unknown;
    notificationEngine: unknown;
  }>;
}

declare module "@mariozechner/pi-tui" {
  export const TUI: unknown;
  export const Text: unknown;
  export const Loader: unknown;
  export const SelectList: unknown;
}
