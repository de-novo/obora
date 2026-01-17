/**
 * SSE (Server-Sent Events) endpoint for real-time workflow updates
 *
 * Streams workflow status changes, step updates, and agent run progress
 */

import { getWorkflowWithDetails } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StreamEvent {
  type: "workflow" | "step" | "heartbeat" | "complete" | "error";
  data: unknown;
  timestamp: string;
}

function formatSSE(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check if workflow exists
  const initialWorkflow = getWorkflowWithDetails(id);
  if (!initialWorkflow) {
    return new Response(
      JSON.stringify({ error: "Workflow not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastHash = "";
      let isRunning = true;

      // Helper to compute a simple hash for change detection
      const computeHash = (workflow: typeof initialWorkflow): string => {
        return JSON.stringify({
          status: workflow.status,
          tokensUsed: workflow.tokensUsed,
          endedAt: workflow.endedAt,
          steps: workflow.steps.map((s) => ({
            id: s.id,
            status: s.status,
            tokensUsed: s.tokensUsed,
          })),
          agentRuns: workflow.agentRuns.map((r) => ({
            id: r.id,
            status: r.status,
            currentTool: r.currentTool,
            tokensUsed: r.tokensUsed,
          })),
        });
      };

      // Send initial state
      const sendEvent = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          isRunning = false;
        }
      };

      // Send initial workflow data
      sendEvent({
        type: "workflow",
        data: initialWorkflow,
        timestamp: new Date().toISOString(),
      });
      lastHash = computeHash(initialWorkflow);

      // Polling interval (500ms for responsive updates)
      const pollInterval = 500;
      let heartbeatCounter = 0;

      const poll = async () => {
        if (!isRunning) return;

        try {
          const workflow = getWorkflowWithDetails(id);

          if (!workflow) {
            sendEvent({
              type: "error",
              data: { message: "Workflow not found" },
              timestamp: new Date().toISOString(),
            });
            controller.close();
            return;
          }

          const currentHash = computeHash(workflow);

          // Send update if changed
          if (currentHash !== lastHash) {
            sendEvent({
              type: "workflow",
              data: workflow,
              timestamp: new Date().toISOString(),
            });
            lastHash = currentHash;
          }

          // Send heartbeat every 10 polls (5 seconds)
          heartbeatCounter++;
          if (heartbeatCounter >= 10) {
            sendEvent({
              type: "heartbeat",
              data: { status: workflow.status },
              timestamp: new Date().toISOString(),
            });
            heartbeatCounter = 0;
          }

          // Stop streaming if workflow is complete
          if (workflow.status === "completed" || workflow.status === "failed") {
            sendEvent({
              type: "complete",
              data: { finalStatus: workflow.status },
              timestamp: new Date().toISOString(),
            });
            controller.close();
            return;
          }

          // Continue polling
          setTimeout(poll, pollInterval);
        } catch (error) {
          sendEvent({
            type: "error",
            data: { message: error instanceof Error ? error.message : "Unknown error" },
            timestamp: new Date().toISOString(),
          });
          controller.close();
        }
      };

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        isRunning = false;
      });

      // Start polling after initial send
      setTimeout(poll, pollInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
