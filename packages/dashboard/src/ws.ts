import { WebSocketServer } from "ws";
import type { Server as HttpServer } from "node:http";

import type { RealtimeEvent } from "./types.js";

export interface DashboardWs {
  broadcast: (event: RealtimeEvent) => void;
  close: () => void;
}

let singletonBroadcast: ((event: RealtimeEvent) => void) | null = null;

export function createDashboardWsServer(server: HttpServer): DashboardWs {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const broadcast = (event: RealtimeEvent): void => {
    const data = JSON.stringify(event);

    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  };

  singletonBroadcast = broadcast;

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "feature",
        payload: { message: "dashboard connected" },
        timestamp: new Date().toISOString(),
      } satisfies RealtimeEvent)
    );
  });

  return {
    broadcast,
    close: () => {
      wss.close();
      if (singletonBroadcast === broadcast) {
        singletonBroadcast = null;
      }
    },
  };
}

export function publishRealtimeEvent(event: RealtimeEvent): void {
  singletonBroadcast?.(event);
}
