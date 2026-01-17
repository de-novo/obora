/**
 * SSE Hook for real-time workflow updates
 *
 * Uses EventSource to receive server-sent events for workflow changes
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./api";
import type { WorkflowWithDetails } from "./api";

interface StreamEvent {
  type: "workflow" | "step" | "heartbeat" | "complete" | "error";
  data: unknown;
  timestamp: string;
}

interface UseWorkflowStreamOptions {
  /** Called when workflow data is updated */
  onUpdate?: (workflow: WorkflowWithDetails) => void;
  /** Called when streaming completes */
  onComplete?: (finalStatus: string) => void;
  /** Called on connection error */
  onError?: (error: Error) => void;
  /** Enable/disable streaming */
  enabled?: boolean;
}

/**
 * Hook to stream real-time workflow updates via SSE
 *
 * @example
 * ```tsx
 * const { isConnected, error } = useWorkflowStream(workflowId, {
 *   enabled: workflow?.status === "running",
 *   onUpdate: (data) => console.log("Updated:", data.status),
 *   onComplete: (status) => console.log("Completed:", status),
 * });
 * ```
 */
export function useWorkflowStream(
  workflowId: string | undefined,
  options: UseWorkflowStreamOptions = {}
) {
  const { onUpdate, onComplete, onError, enabled = true } = options;
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  // Reconnection config
  const MAX_RETRIES = 5;
  const BASE_DELAY = 3000; // 3 seconds
  const MAX_DELAY = 30000; // 30 seconds

  // Store callbacks in refs to avoid reconnecting when they change (advanced-use-latest)
  const callbacksRef = useRef({ onUpdate, onComplete, onError });
  callbacksRef.current = { onUpdate, onComplete, onError };

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnectionState("disconnected");
  }, []);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (!workflowId || !enabled) return;

    cleanup();
    setConnectionState("connecting");

    const eventSource = new EventSource(`/api/workflows/${workflowId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionState("connected");
      retryCountRef.current = 0; // Reset retry count on successful connection
    };

    // Handle workflow updates
    eventSource.addEventListener("workflow", (event) => {
      try {
        const parsed: StreamEvent = JSON.parse(event.data);
        const workflow = parsed.data as WorkflowWithDetails;

        // Update TanStack Query cache
        queryClient.setQueryData(queryKeys.workflow(workflowId), workflow);

        // Also invalidate the workflows list to update status indicators
        queryClient.invalidateQueries({ queryKey: ["workflows"] });

        callbacksRef.current.onUpdate?.(workflow);
      } catch (e) {
        console.error("Failed to parse workflow event:", e);
      }
    });

    // Handle heartbeat (keep-alive)
    eventSource.addEventListener("heartbeat", () => {
      // Heartbeat received, connection is alive
    });

    // Handle completion
    eventSource.addEventListener("complete", (event) => {
      try {
        const parsed: StreamEvent = JSON.parse(event.data);
        const { finalStatus } = parsed.data as { finalStatus: string };
        callbacksRef.current.onComplete?.(finalStatus);
        cleanup();
      } catch (e) {
        console.error("Failed to parse complete event:", e);
      }
    });

    // Handle errors from server
    eventSource.addEventListener("error", (event) => {
      // Check if it's a custom error event or connection error
      if (event instanceof MessageEvent) {
        try {
          const parsed: StreamEvent = JSON.parse(event.data);
          const { message } = parsed.data as { message: string };
          callbacksRef.current.onError?.(new Error(message));
        } catch {
          // Not a custom error, likely connection issue
        }
      }
    });

    // Handle connection errors
    eventSource.onerror = () => {
      // Only reconnect if still enabled and not deliberately closed
      if (enabled && eventSource.readyState !== EventSource.CLOSED) {
        retryCountRef.current += 1;

        // Check if max retries exceeded
        if (retryCountRef.current > MAX_RETRIES) {
          callbacksRef.current.onError?.(
            new Error(`SSE connection failed after ${MAX_RETRIES} retries`)
          );
          cleanup();
          return;
        }

        setConnectionState("connecting");
        cleanup();

        // Exponential backoff: 3s -> 6s -> 12s -> 24s -> 30s (capped)
        const backoffDelay = Math.min(
          BASE_DELAY * Math.pow(2, retryCountRef.current - 1),
          MAX_DELAY
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffDelay);
      } else {
        setConnectionState("disconnected");
      }
    };
  }, [workflowId, enabled, queryClient, cleanup]); // Callbacks stored in ref, no need in deps

  // Effect to manage connection
  useEffect(() => {
    if (enabled && workflowId) {
      connect();
    } else {
      cleanup();
    }

    return cleanup;
  }, [enabled, workflowId, connect, cleanup]);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    isConnecting: connectionState === "connecting",
    disconnect: cleanup,
  };
}
