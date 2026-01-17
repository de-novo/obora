/**
 * SSE Hook for real-time workflow updates
 *
 * Uses EventSource to receive server-sent events for workflow changes
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
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
  const isConnectedRef = useRef(false);

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
    isConnectedRef.current = false;
  }, []);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (!workflowId || !enabled) return;

    cleanup();

    const eventSource = new EventSource(`/api/workflows/${workflowId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      isConnectedRef.current = true;
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

        onUpdate?.(workflow);
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
        onComplete?.(finalStatus);
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
          onError?.(new Error(message));
        } catch {
          // Not a custom error, likely connection issue
        }
      }
    });

    // Handle connection errors
    eventSource.onerror = () => {
      isConnectedRef.current = false;

      // Only reconnect if still enabled and not deliberately closed
      if (enabled && eventSource.readyState !== EventSource.CLOSED) {
        cleanup();

        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };
  }, [workflowId, enabled, queryClient, cleanup, onUpdate, onComplete, onError]);

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
    isConnected: isConnectedRef.current,
    disconnect: cleanup,
  };
}
