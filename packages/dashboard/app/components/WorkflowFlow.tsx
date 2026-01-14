"use client";

import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";

import "@xyflow/react/dist/style.css";

import { AgentNode, TriggerNode, PlannerNode, OutputNode } from "./flow/FlowNodes";
import type { WorkflowStep, Workflow } from "@/lib/types";

// Layout constants (4x grid)
const NODE_WIDTH = 200;
const NODE_HEIGHT = 100; // Increased for iteration badge

// Custom node types
const nodeTypes = {
  trigger: TriggerNode,
  planner: PlannerNode,
  agent: AgentNode,
  result: OutputNode,
};

// ============================================================================
// Feedback Loop Detection & Grouping
// ============================================================================

interface CollapsedAgent {
  id: string;
  agentType: string;
  iterations: number;
  steps: WorkflowStep[];
  totalTokens: number;
  status: string;
  isInLoop: boolean;
  loopId?: string;
}

interface FeedbackLoop {
  id: string;
  agents: string[]; // Agent types in this loop (e.g., ["implementer", "reviewer"])
  iterations: number;
}

/**
 * Analyze steps to detect feedback loops and group repeated agents
 */
function analyzeWorkflowStructure(steps: WorkflowStep[]): {
  collapsedAgents: CollapsedAgent[];
  feedbackLoops: FeedbackLoop[];
  agentOrder: string[]; // Unique agent order (first occurrence)
} {
  const agentOccurrences = new Map<string, WorkflowStep[]>();
  const agentOrder: string[] = [];

  // Group steps by agent type, preserving first occurrence order
  steps.forEach((step) => {
    const existing = agentOccurrences.get(step.agentType);
    if (existing) {
      existing.push(step);
    } else {
      agentOccurrences.set(step.agentType, [step]);
      agentOrder.push(step.agentType);
    }
  });

  // Detect feedback loops
  const feedbackLoops: FeedbackLoop[] = [];
  const reviewerSteps = steps.filter(s => s.agentType === "reviewer");

  if (reviewerSteps.length > 0) {
    // Find agents that run multiple times (indicates feedback loop)
    const loopAgents: string[] = [];
    agentOccurrences.forEach((stepList, agentType) => {
      if (stepList.length > 1 && agentType !== "reviewer") {
        loopAgents.push(agentType);
      }
    });

    if (loopAgents.length > 0 || reviewerSteps.length > 1) {
      // Create a feedback loop containing the repeated agents and reviewer
      feedbackLoops.push({
        id: "loop-1",
        agents: [...loopAgents, "reviewer"],
        iterations: Math.max(
          ...Array.from(agentOccurrences.entries())
            .filter(([type]) => loopAgents.includes(type) || type === "reviewer")
            .map(([, steps]) => steps.length)
        ),
      });
    }
  }

  // Create collapsed agents
  const collapsedAgents: CollapsedAgent[] = agentOrder.map((agentType) => {
    const agentSteps = agentOccurrences.get(agentType)!;
    const isInLoop = feedbackLoops.some(loop => loop.agents.includes(agentType));

    return {
      id: `agent-${agentType}`,
      agentType,
      iterations: agentSteps.length,
      steps: agentSteps,
      totalTokens: agentSteps.reduce((sum, s) => sum + s.tokensUsed, 0),
      status: agentSteps[agentSteps.length - 1].status, // Use last iteration status
      isInLoop,
      loopId: isInLoop ? "loop-1" : undefined,
    };
  });

  return { collapsedAgents, feedbackLoops, agentOrder };
}

// ============================================================================
// Layout Helpers
// ============================================================================

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
) {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === "LR";

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100, // Increased for loop visualization
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function mapStatus(status: string): "pending" | "running" | "completed" | "failed" {
  switch (status) {
    case "running":
    case "planning":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}

function getEdgeStyle(status: "pending" | "running" | "completed" | "failed") {
  const baseStyle = { strokeWidth: 2 };
  switch (status) {
    case "running":
      return { ...baseStyle, stroke: "#0ea5e9" };
    case "completed":
      return { ...baseStyle, stroke: "#22c55e" };
    case "failed":
      return { ...baseStyle, stroke: "#f43f5e" };
    default:
      return { ...baseStyle, stroke: "#52525b" };
  }
}

function getMarkerColor(status: "pending" | "running" | "completed" | "failed") {
  switch (status) {
    case "running": return "#0ea5e9";
    case "completed": return "#22c55e";
    case "failed": return "#f43f5e";
    default: return "#52525b";
  }
}

// ============================================================================
// Main Component
// ============================================================================

interface WorkflowFlowProps {
  workflow: Workflow;
  steps: WorkflowStep[];
  onStepClick?: (step: WorkflowStep) => void;
}

export function WorkflowFlow({ workflow, steps, onStepClick }: WorkflowFlowProps) {
  const workflowStatus = mapStatus(workflow.status);
  const workflowInput = workflow.input as Record<string, unknown> | null;

  // Analyze workflow structure (detect loops, group agents)
  const { collapsedAgents, feedbackLoops } = useMemo(
    () => analyzeWorkflowStructure(steps),
    [steps]
  );

  // Build nodes and edges with loop structure
  const { initialNodes, normalEdges, loopEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const loopEdgeList: Edge[] = [];

    // Trigger node
    nodes.push({
      id: "trigger",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: {
        label: "Task Input",
        status: workflowStatus === "pending" ? "pending" : "completed",
        description: workflowInput?.task
          ? String(workflowInput.task).slice(0, 80)
          : workflow.name,
      },
    });

    let prevNodeId = "trigger";

    // Planner node (if not custom workflow)
    if (workflow.type !== "custom") {
      nodes.push({
        id: "planner",
        type: "planner",
        position: { x: 0, y: 0 },
        data: {
          label: "Planner",
          status:
            workflowStatus === "pending"
              ? "pending"
              : workflow.status === "planning"
              ? "running"
              : "completed",
          description: `Workflow: ${workflow.type}`,
        },
      });

      const triggerStatus = workflowStatus === "pending" ? "pending" : "completed";
      edges.push({
        id: "edge-trigger-planner",
        source: "trigger",
        target: "planner",
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "smoothstep",
        style: getEdgeStyle(triggerStatus),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: getMarkerColor(triggerStatus),
        },
      });

      prevNodeId = "planner";
    }

    // Add collapsed agent nodes
    collapsedAgents.forEach((agent) => {
      const nodeId = agent.id;
      const status = mapStatus(agent.status);
      const lastStep = agent.steps[agent.steps.length - 1];

      nodes.push({
        id: nodeId,
        type: "agent",
        position: { x: 0, y: 0 },
        data: {
          label: agent.agentType,
          status,
          description: lastStep.taskDescription.slice(0, 80),
          tokens: agent.totalTokens,
          iterations: agent.iterations,
          isInLoop: agent.isInLoop,
          steps: agent.steps,
          onClick: () => onStepClick?.(lastStep),
        },
      });

      // Connect to previous node
      edges.push({
        id: `edge-${prevNodeId}-${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "smoothstep",
        style: getEdgeStyle(status),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: getMarkerColor(status),
        },
      });

      prevNodeId = nodeId;
    });

    // Add feedback loop edges (from reviewer back to first loop agent)
    feedbackLoops.forEach((loop) => {
      const reviewerAgent = collapsedAgents.find(a => a.agentType === "reviewer" && a.isInLoop);
      const firstLoopAgent = collapsedAgents.find(a =>
        a.isInLoop &&
        a.agentType !== "reviewer" &&
        a.iterations > 1
      );

      if (reviewerAgent && firstLoopAgent) {
        loopEdgeList.push({
          id: `loop-${loop.id}`,
          source: `agent-reviewer`,
          target: firstLoopAgent.id,
          sourceHandle: "right",
          targetHandle: "right-in",
          type: "smoothstep",
          animated: true,
          style: {
            stroke: "#f59e0b",
            strokeWidth: 2,
            strokeDasharray: "5 5",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "#f59e0b",
          },
          label: `${loop.iterations - 1}회 반복`,
          labelStyle: { fill: "#f59e0b", fontSize: 11, fontWeight: 600 },
          labelBgStyle: { fill: "#121215", fillOpacity: 0.95 },
          labelBgPadding: [6, 10] as [number, number],
          labelBgBorderRadius: 6,
        });
      }
    });

    // Output node
    if (collapsedAgents.length > 0) {
      nodes.push({
        id: "output",
        type: "result",
        position: { x: 0, y: 0 },
        data: {
          label: "Result",
          status: workflowStatus,
          description:
            workflowStatus === "completed"
              ? "Workflow completed"
              : workflowStatus === "failed"
              ? workflow.error || "Workflow failed"
              : "Waiting...",
          tokens: workflow.tokensUsed,
        },
      });

      edges.push({
        id: `edge-${prevNodeId}-output`,
        source: prevNodeId,
        target: "output",
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "smoothstep",
        style: getEdgeStyle(workflowStatus),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: getMarkerColor(workflowStatus),
        },
      });
    }

    return { initialNodes: nodes, normalEdges: edges, loopEdges: loopEdgeList };
  }, [workflow, workflowStatus, workflowInput, collapsedAgents, feedbackLoops, onStepClick]);

  // Apply dagre layout (only to normal edges)
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, normalEdges, "TB"),
    [initialNodes, normalEdges]
  );

  // Combine all edges
  const allEdges = useMemo(
    () => [...layoutedEdges, ...loopEdges],
    [layoutedEdges, loopEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(allEdges);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(
      initialNodes,
      normalEdges,
      "TB"
    );
    setNodes(newNodes);
    setEdges([...newEdges, ...loopEdges]);
  }, [initialNodes, normalEdges, loopEdges, setNodes, setEdges]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="hsl(var(--muted-foreground) / 0.15)"
        />
      </ReactFlow>

      {/* Feedback Loop Legend */}
      {feedbackLoops.length > 0 && (
        <div className="absolute left-4 top-4 z-10 rounded-lg border border-warning/30 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warning">
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            피드백 루프
          </div>
          {feedbackLoops.map((loop) => (
            <div key={loop.id} className="text-xs text-muted-foreground">
              <span className="text-foreground">{loop.iterations}회</span> 반복 실행
              <div className="mt-1 flex flex-wrap gap-1">
                {loop.agents.map((agent) => (
                  <span
                    key={agent}
                    className={`rounded px-1.5 py-0.5 ${
                      agent === "reviewer"
                        ? "bg-warning/20 text-warning"
                        : "bg-primary/20 text-primary"
                    }`}
                  >
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Workflow List Item (unchanged)
// ============================================================================

interface WorkflowListItemProps {
  workflow: {
    id: string;
    name: string;
    type: string;
    status: string;
    startedAt: Date | null;
    tokensUsed: number;
    stepCount: number;
    sessionId?: string;
    projectId?: string;
    projectName: string;
    projectColor: string;
  };
  onClick?: () => void;
}

export function WorkflowListItem({ workflow, onClick }: WorkflowListItemProps) {
  const status = mapStatus(workflow.status);
  const statusClasses: Record<string, string> = {
    pending: "bg-muted-foreground",
    running: "bg-info",
    completed: "bg-success",
    failed: "bg-error",
  };

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg bg-card p-4 transition-colors hover:bg-muted"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <div
              className="size-2.5 rounded-full"
              style={{ backgroundColor: workflow.projectColor }}
            />
            <span className="text-xs text-muted-foreground">
              {workflow.projectName}
            </span>
          </div>
          <h3 className="mb-1 font-medium text-foreground">
            {workflow.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">
              {workflow.type}
            </span>
            <span>{workflow.stepCount} steps</span>
            {workflow.tokensUsed > 0 && (
              <span>{workflow.tokensUsed.toLocaleString()} tokens</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`size-2.5 rounded-full ${statusClasses[status]} ${
              status === "running" ? "animate-pulse" : ""
            }`}
          />
          <span className="text-xs capitalize text-muted-foreground">
            {workflow.status}
          </span>
        </div>
      </div>
      {workflow.startedAt && (
        <div className="mt-2 text-xs text-muted-foreground">
          {new Date(workflow.startedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
