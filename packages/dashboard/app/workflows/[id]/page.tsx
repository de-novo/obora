"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MarkdownView } from "@/app/components/MarkdownView";
import { fetchWorkflow, queryKeys } from "@/lib/api";
import { useWorkflowStream } from "@/lib/useWorkflowStream";
import type { WorkflowStep } from "@/lib/types";
import { toast } from "sonner";

// Dynamic import for heavy ReactFlow component (bundle-dynamic-imports)
const WorkflowFlow = dynamic(
  () => import("@/app/components/WorkflowFlow").then((m) => m.WorkflowFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
);

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = params.id as string;

  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  const { data: workflow, isLoading, error } = useQuery({
    queryKey: queryKeys.workflow(workflowId),
    queryFn: () => fetchWorkflow(workflowId),
    enabled: !!workflowId,
  });

  // Use SSE for real-time updates when workflow is running
  const isRunning = workflow?.status === "running" || workflow?.status === "planning";
  const { isConnected, isConnecting } = useWorkflowStream(workflowId, {
    enabled: isRunning,
    onComplete: (finalStatus) => {
      if (finalStatus === "completed") {
        toast.success("워크플로우가 완료되었습니다", {
          description: workflow?.name,
        });
      } else if (finalStatus === "failed") {
        toast.error("워크플로우가 실패했습니다", {
          description: workflow?.error || "알 수 없는 오류",
        });
      }
    },
    onError: (error) => {
      toast.error("연결 오류", {
        description: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-xl border border-border bg-card/90 p-6 text-center backdrop-blur-sm">
          <svg
            className="mx-auto mb-4 size-12 text-error"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-muted-foreground">{error?.message || "Workflow not found"}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-success";
      case "running":
      case "planning": return "bg-info";
      case "failed": return "bg-error";
      default: return "bg-muted-foreground";
    }
  };

  const workflowInput = workflow.input as Record<string, unknown> | null;
  const workflowOutput = workflow.output as Record<string, unknown> | null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Full-screen Canvas */}
      <WorkflowFlow
        workflow={workflow}
        steps={workflow.steps}
        agentRuns={workflow.agentRuns}
        onStepClick={setSelectedStep}
      />

      {/* Floating Header */}
      <div className="absolute left-4 top-4 z-10">
        <div className="rounded-xl border border-border bg-card/90 px-4 py-3 shadow-lg backdrop-blur-sm">
          {/* Breadcrumb */}
          <nav className="mb-2 flex items-center gap-2 text-xs">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              href={`/sessions/${workflow.sessionId}`}
              className="text-muted-foreground hover:text-foreground"
            >
              Session
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground">Workflow</span>
          </nav>

          {/* Title */}
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-foreground">
              {workflow.name}
            </h1>
            <div className="flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5">
              <div
                className={`size-2 rounded-full ${getStatusColor(workflow.status)} ${
                  workflow.status === "running" || workflow.status === "planning"
                    ? "animate-pulse"
                    : ""
                }`}
              />
              <span className="text-xs capitalize text-muted-foreground">
                {workflow.status}
              </span>
            </div>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {workflow.type}
            </span>
            {/* SSE Connection Indicator */}
            {isRunning && (
              <div className="flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5">
                <div
                  className={`size-2 rounded-full ${
                    isConnected
                      ? "bg-success"
                      : isConnecting
                        ? "bg-warning animate-pulse"
                        : "bg-muted-foreground"
                  }`}
                />
                <span className="text-xs text-muted-foreground">
                  {isConnected ? "실시간" : isConnecting ? "연결 중..." : "연결 끊김"}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            {workflow.tokensUsed > 0 && (
              <span>{workflow.tokensUsed.toLocaleString()} tokens</span>
            )}
            <span>{workflow.steps.length} steps</span>
            {workflow.startedAt && (
              <span>{new Date(workflow.startedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Floating Info Panel (Right) */}
      <div className="absolute right-4 top-4 z-10">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="flex size-10 items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground"
          title={showInfo ? "Hide info" : "Show info"}
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {showInfo && (
          <div className="mt-2 w-72 rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur-sm">
            {/* Input */}
            <div className="border-b border-border p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-success">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Input
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {workflowInput?.task ? String(workflowInput.task) : "No input recorded"}
              </p>
            </div>

            {/* Output */}
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-info">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Output
              </h3>
              {workflow.status === "completed" && workflowOutput ? (
                <pre className="max-h-32 overflow-auto rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
                  {JSON.stringify(workflowOutput, null, 2)}
                </pre>
              ) : workflow.status === "failed" ? (
                <p className="text-sm text-error">
                  {workflow.error || "Workflow failed"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for completion...</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Step Detail Panel (when selected) */}
      {selectedStep && (() => {
        // Find related agent run
        const relatedRun = workflow.agentRuns.find(
          run => run.workflowStepId === selectedStep.id
        );
        const outputText = relatedRun?.output ||
          (selectedStep.output as { result?: string })?.result ||
          (typeof selectedStep.output === 'string' ? selectedStep.output : null);

        return (
          <div className="absolute bottom-4 left-4 right-4 z-10 max-h-[60vh]">
            <div className="mx-auto flex max-w-3xl flex-col rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-sm">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{selectedStep.agentType}</h4>
                    <p className="text-xs text-muted-foreground">Step {selectedStep.stepNumber + 1}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {relatedRun && (
                    <>
                      {relatedRun.model && (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {relatedRun.model}
                        </span>
                      )}
                      {relatedRun.tokensUsed > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {relatedRun.tokensUsed.toLocaleString()} tokens
                        </span>
                      )}
                      {relatedRun.toolCallCount != null && relatedRun.toolCallCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {relatedRun.toolCallCount} tools
                        </span>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setSelectedStep(null)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Task Description */}
                <div className="mb-4 rounded-lg bg-secondary/50 p-3">
                  <h5 className="mb-1 text-xs font-medium text-muted-foreground">Task</h5>
                  <p className="text-sm text-foreground">{selectedStep.taskDescription}</p>
                </div>

                {/* Error */}
                {selectedStep.error && (
                  <div className="mb-4 rounded-lg bg-error/10 p-3 text-sm text-error">
                    <strong>Error:</strong> {selectedStep.error}
                  </div>
                )}

                {/* Output as Markdown */}
                {outputText && (
                  <div>
                    <h5 className="mb-2 text-xs font-medium text-muted-foreground">Output</h5>
                    <div className="rounded-lg border border-border bg-background p-4">
                      <MarkdownView content={outputText} />
                    </div>
                  </div>
                )}

                {/* No output */}
                {!outputText && !selectedStep.error && (
                  <p className="text-sm text-muted-foreground">No output recorded</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
