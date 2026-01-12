/**
 * Fastify SSE (Server-Sent Events) Routes
 *
 * Provides real-time streaming endpoints for agent activity dashboard
 * Uses EventSource-compatible format with DB polling
 */

import type {
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { getCurrentActivity, getRecentActions } from "../db/index";

/**
 * SSE message format helper
 * Formats data in EventSource-compatible format: data: {...}\n\n
 */
function formatSSEMessage(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Fastify plugin for SSE routes
 */
export const sseRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/stream/activity
   * Real-time stream of currently running activities
   *
   * Polls database every 1 second and sends updates
   * Connection automatically closes when client disconnects
   */
  fastify.get(
    "/api/stream/activity",
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let lastActivityHash = "";
      let intervalId: NodeJS.Timeout | null = null;

      const sendActivity = () => {
        try {
          const activity = getCurrentActivity();
          const activityHash = JSON.stringify(activity);

          if (activityHash !== lastActivityHash) {
            lastActivityHash = activityHash;
            reply.raw.write(
              formatSSEMessage({
                type: "activity",
                data: activity,
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          reply.raw.write(
            formatSSEMessage({
              type: "error",
              error: errorMessage,
              timestamp: new Date().toISOString(),
            })
          );
        }
      };

      sendActivity();

      intervalId = setInterval(sendActivity, 1000);

      request.raw.on("close", () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        reply.raw.end();
      });
    }
  );

  /**
   * GET /api/stream/logs
   * Real-time stream of action logs
   *
   * Polls database every 1 second for new actions
   * Uses timestamp-based incremental updates to avoid duplicate data
   */
  fastify.get(
    "/api/stream/logs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      let lastTimestamp = new Date(0).toISOString();
      let intervalId: NodeJS.Timeout | null = null;

      const sendLogs = () => {
        try {
          const actions = getRecentActions(100);

          const newActions = actions.filter(
            (action) => action.timestamp > lastTimestamp
          );

          if (newActions.length > 0) {
            lastTimestamp = newActions[0].timestamp;

            reply.raw.write(
              formatSSEMessage({
                type: "logs",
                data: newActions,
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          reply.raw.write(
            formatSSEMessage({
              type: "error",
              error: errorMessage,
              timestamp: new Date().toISOString(),
            })
          );
        }
      };

      sendLogs();

      intervalId = setInterval(sendLogs, 1000);

      request.raw.on("close", () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        reply.raw.end();
      });
    }
  );
};
