"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type NodeStatus = "pending" | "running" | "completed" | "failed";

// Base data interface for all nodes
interface BaseNodeData extends Record<string, unknown> {
  label: string;
  status: NodeStatus;
  description?: string;
  tokens?: number;
  onClick?: () => void;
}

// Extended data for Agent nodes
interface AgentNodeData extends BaseNodeData {
  iterations?: number;
  isInLoop?: boolean;
  currentTool?: string | null;
}

// Node type definitions (for proper typing without casting)
export type TriggerNodeType = Node<BaseNodeData, "trigger">;
export type PlannerNodeType = Node<BaseNodeData, "planner">;
export type AgentNodeType = Node<AgentNodeData, "agent">;
export type OutputNodeType = Node<BaseNodeData, "result">;

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: "bg-muted-foreground",
  running: "bg-info animate-pulse",
  completed: "bg-success",
  failed: "bg-error",
};

const STATUS_BORDER_COLORS: Record<NodeStatus, string> = {
  pending: "border-border",
  running: "border-info",
  completed: "border-success/40",
  failed: "border-error/40",
};

const NODE_WIDTH = 200;

// ============================================================================
// Trigger Node - Task Input
// ============================================================================

export const TriggerNode = memo(function TriggerNode({
  data,
}: NodeProps<TriggerNodeType>) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-4 py-3 shadow-md transition-all hover:shadow-lg",
        STATUS_BORDER_COLORS[data.status]
      )}
      style={{ width: NODE_WIDTH }}
    >
      <div className="mb-1 flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded bg-success/20 text-success">
          <svg
            className="size-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Trigger
        </span>
        <div
          className={cn("ml-auto size-2 rounded-full", STATUS_COLORS[data.status])}
        />
      </div>
      <div className="font-medium text-foreground">{data.label}</div>
      {data.description && (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.description}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-3 !w-3 !border-2 !border-background !bg-success"
      />
    </div>
  );
});

// ============================================================================
// Planner Node
// ============================================================================

export const PlannerNode = memo(function PlannerNode({
  data,
}: NodeProps<PlannerNodeType>) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-4 py-3 shadow-md transition-all hover:shadow-lg",
        STATUS_BORDER_COLORS[data.status]
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-3 !w-3 !border-2 !border-background !bg-info"
      />
      <div className="mb-1 flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded bg-info/20 text-info">
          <svg
            className="size-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Planner
        </span>
        <div
          className={cn("ml-auto size-2 rounded-full", STATUS_COLORS[data.status])}
        />
      </div>
      <div className="font-medium text-foreground">{data.label}</div>
      {data.description && (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.description}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-3 !w-3 !border-2 !border-background !bg-info"
      />
    </div>
  );
});

// ============================================================================
// Agent Node
// ============================================================================

export const AgentNode = memo(function AgentNode({
  data,
}: NodeProps<AgentNodeType>) {
  const hasMultipleIterations = data.iterations && data.iterations > 1;
  const isReviewer = data.label === "reviewer";

  const borderClass = data.isInLoop
    ? "border-warning/50 hover:border-warning"
    : STATUS_BORDER_COLORS[data.status];

  return (
    <div
      onClick={data.onClick}
      className={cn(
        "relative rounded-lg border-2 bg-card px-4 py-3 shadow-md transition-all",
        borderClass,
        data.onClick && "cursor-pointer hover:shadow-lg"
      )}
      style={{ width: NODE_WIDTH }}
    >
      {/* Iteration Badge */}
      {hasMultipleIterations && (
        <div className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground shadow-md">
          ×{data.iterations}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />

      {/* Feedback loop handles (only show for loop participants) */}
      {data.isInLoop && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            className="!h-2.5 !w-2.5 !border-2 !border-background !bg-warning"
          />
          <Handle
            type="target"
            position={Position.Right}
            id="right-in"
            className="!h-2.5 !w-2.5 !border-2 !border-background !bg-warning opacity-0"
          />
        </>
      )}

      <div className="mb-1 flex items-center gap-2">
        <div
          className={cn(
            "flex size-6 items-center justify-center rounded",
            data.isInLoop
              ? "bg-warning/20 text-warning"
              : "bg-primary/20 text-primary"
          )}
        >
          {isReviewer ? (
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          ) : (
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {data.isInLoop ? "Loop" : "Agent"}
        </span>
        <div
          className={cn("ml-auto size-2 rounded-full", STATUS_COLORS[data.status])}
        />
      </div>

      <div className="font-medium text-foreground">{data.label}</div>
      {data.description && (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.description}
        </div>
      )}
      {/* Current Tool Indicator (when running) */}
      {data.status === "running" && data.currentTool && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-info/10 px-2 py-1">
          <div className="size-1.5 animate-pulse rounded-full bg-info" />
          <span className="text-xs font-medium text-info">
            {data.currentTool}
          </span>
        </div>
      )}

      {/* Running without specific tool */}
      {data.status === "running" && !data.currentTool && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-info/10 px-2 py-1">
          <div className="size-1.5 animate-pulse rounded-full bg-info" />
          <span className="text-xs text-info">Processing...</span>
        </div>
      )}

      {data.tokens && data.tokens > 0 && data.status !== "running" && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <svg
            className="size-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          {data.tokens.toLocaleString()} tokens
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
});

// ============================================================================
// Output Node - Result
// ============================================================================

export const OutputNode = memo(function OutputNode({
  data,
}: NodeProps<OutputNodeType>) {
  const iconBgColor =
    data.status === "completed"
      ? "bg-success/20"
      : data.status === "failed"
        ? "bg-error/20"
        : "bg-muted";
  const iconColor =
    data.status === "completed"
      ? "text-success"
      : data.status === "failed"
        ? "text-error"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-4 py-3 shadow-md transition-all hover:shadow-lg",
        STATUS_BORDER_COLORS[data.status]
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-3 !w-3 !border-2 !border-background !bg-success"
      />
      <div className="mb-1 flex items-center gap-2">
        <div className={cn("flex size-6 items-center justify-center rounded", iconBgColor, iconColor)}>
          {data.status === "completed" ? (
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : data.status === "failed" ? (
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Output
        </span>
        <div
          className={cn("ml-auto size-2 rounded-full", STATUS_COLORS[data.status])}
        />
      </div>
      <div className="font-medium text-foreground">{data.label}</div>
      {data.description && (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.description}
        </div>
      )}
      {data.tokens && data.tokens > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <svg
            className="size-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          Total: {data.tokens.toLocaleString()} tokens
        </div>
      )}
    </div>
  );
});
