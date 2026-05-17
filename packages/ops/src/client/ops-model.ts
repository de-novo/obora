export type OpsMode = "graph" | "prompt" | "runs";

export type WorkflowNodeKind = "input" | "agent" | "tool" | "decision" | "handoff";

export type WorkflowNodeStatus = "draft" | "ready" | "blocked";

export type RunStatus = "running" | "passed" | "failed";

export type RunStepStatus = "queued" | "running" | "passed" | "failed";

export type TraceConfidenceLevel = "high" | "medium" | "low";

export interface WorkflowNode {
  readonly id: string;
  readonly title: string;
  readonly kind: WorkflowNodeKind;
  readonly agent: string;
  readonly model: string;
  readonly policy: string;
  readonly systemPrompt: string;
  readonly status: WorkflowNodeStatus;
  readonly x: number;
  readonly y: number;
}

export interface WorkflowNodePosition {
  readonly x: number;
  readonly y: number;
}

export interface WorkflowNodePositionPatch {
  readonly id: string;
  readonly position: WorkflowNodePosition;
}

export interface WorkflowEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface EdgeConnectionInput {
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface ResolvedGraphEdge extends WorkflowEdge {
  readonly sourceNode: WorkflowNode;
  readonly targetNode: WorkflowNode;
}

export interface ExecutionRunStep {
  readonly id: string;
  readonly title: string;
  readonly status: RunStepStatus;
  readonly durationMs: number;
  readonly trace?: ExecutionStepTrace;
}

export interface ExecutionStepTrace {
  readonly task_summary: string;
  readonly methodology: string;
  readonly key_decisions: ReadonlyArray<string>;
  readonly assumptions: ReadonlyArray<string>;
  readonly risks_identified: ReadonlyArray<string>;
  readonly artifacts_created: ReadonlyArray<string>;
  readonly confidence_level: TraceConfidenceLevel;
  readonly context_for_successors: string;
}

export interface ExecutionRun {
  readonly id: string;
  readonly workflowName: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly steps: ReadonlyArray<ExecutionRunStep>;
}

export interface OpsWorkbenchState {
  readonly workflowName: string;
  readonly systemPrompt: string;
  readonly selectedNodeId: string | undefined;
  readonly selectedRunId: string | undefined;
  readonly nodes: ReadonlyArray<WorkflowNode>;
  readonly edges: ReadonlyArray<WorkflowEdge>;
  readonly runs: ReadonlyArray<ExecutionRun>;
}

export interface OpsSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly readyCount: number;
  readonly activeRuns: number;
  readonly failedRuns: number;
}

export const workflowNodeKinds = [
  "input",
  "agent",
  "tool",
  "decision",
  "handoff",
] as const satisfies ReadonlyArray<WorkflowNodeKind>;

export const workflowNodeStatuses = [
  "draft",
  "ready",
  "blocked",
] as const satisfies ReadonlyArray<WorkflowNodeStatus>;

export const opsModes = ["graph", "prompt", "runs"] as const satisfies ReadonlyArray<OpsMode>;

export const nodeKindLabels: Record<WorkflowNodeKind, string> = {
  input: "Input",
  agent: "Agent",
  tool: "Tool",
  decision: "Decision",
  handoff: "Handoff",
};

export const nodeStatusLabels: Record<WorkflowNodeStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  blocked: "Blocked",
};

export const runStatusLabels: Record<RunStatus, string> = {
  running: "Running",
  passed: "Passed",
  failed: "Failed",
};

export const runStepStatusLabels: Record<RunStepStatus, string> = {
  queued: "Queued",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
};

const emptyWorkflowNode: WorkflowNode = {
  id: "empty-node",
  title: "No node selected",
  kind: "agent",
  agent: "operator",
  model: "default",
  policy: "none",
  systemPrompt: "",
  status: "draft",
  x: 50,
  y: 50,
};

const emptyExecutionRun: ExecutionRun = {
  id: "empty-run",
  workflowName: "No run selected",
  status: "running",
  startedAt: "",
  durationMs: 0,
  steps: [],
};

export const initialOpsState: OpsWorkbenchState = {
  workflowName: "intake-to-decision",
  systemPrompt: [
    "You are the workflow operator.",
    "Validate inputs, keep decisions auditable, and pause when policy confidence is low.",
  ].join("\n"),
  selectedNodeId: "validate-input",
  selectedRunId: "run-2026-05-15-a",
  nodes: [
    {
      id: "ingest-request",
      title: "Ingest request",
      kind: "input",
      agent: "ops-intake",
      model: "rule",
      policy: "schema-required",
      systemPrompt: "Accept an operator request and normalize it into the workflow input contract.",
      status: "ready",
      x: 40,
      y: 220,
    },
    {
      id: "validate-input",
      title: "Validate input",
      kind: "agent",
      agent: "contract-reviewer",
      model: "gpt-5.4",
      policy: "strict-json",
      systemPrompt:
        "Validate the request against the graph contract and report missing fields before execution.",
      status: "ready",
      x: 340,
      y: 120,
    },
    {
      id: "route-policy",
      title: "Route policy",
      kind: "decision",
      agent: "policy-router",
      model: "rule",
      policy: "human-review-on-risk",
      systemPrompt:
        "Route the workflow according to policy state and pause when approval is required.",
      status: "draft",
      x: 640,
      y: 260,
    },
    {
      id: "handoff-result",
      title: "Handoff result",
      kind: "handoff",
      agent: "ops-dispatch",
      model: "rule",
      policy: "audit-required",
      systemPrompt: "Prepare the operator handoff with an auditable final status and next action.",
      status: "blocked",
      x: 940,
      y: 160,
    },
  ],
  edges: [
    {
      id: "ingest-request-to-validate-input",
      source: "ingest-request",
      target: "validate-input",
      label: "payload",
    },
    {
      id: "validate-input-to-route-policy",
      source: "validate-input",
      target: "route-policy",
      label: "valid",
    },
    {
      id: "route-policy-to-handoff-result",
      source: "route-policy",
      target: "handoff-result",
      label: "approved",
    },
  ],
  runs: [
    {
      id: "run-2026-05-15-a",
      workflowName: "intake-to-decision",
      status: "running",
      startedAt: "2026-05-15T08:20:00.000Z",
      durationMs: 184000,
      steps: [
        {
          id: "run-a-step-1",
          title: "Ingest request",
          status: "passed",
          durationMs: 12000,
          trace: {
            task_summary: "Normalize the operator request into the workflow input contract.",
            methodology: "Schema intake with request metadata preservation",
            key_decisions: ["Preserved the raw request payload", "Attached source metadata for validation"],
            assumptions: ["The operator request was authenticated upstream"],
            risks_identified: [],
            artifacts_created: ["inputs/request.json"],
            confidence_level: "high",
            context_for_successors:
              "Validate input can rely on the normalized payload and original request metadata.",
          },
        },
        {
          id: "run-a-step-2",
          title: "Validate input",
          status: "running",
          durationMs: 172000,
          trace: {
            task_summary: "Validate required fields and policy routing inputs.",
            methodology: "Strict JSON validation with policy preflight",
            key_decisions: ["Kept the run open while optional metadata is checked"],
            assumptions: ["Schema normalization already succeeded"],
            risks_identified: ["Policy routing may pause if risk metadata is incomplete"],
            artifacts_created: [],
            confidence_level: "medium",
            context_for_successors:
              "Route policy should wait for the validation status before choosing a branch.",
          },
        },
        { id: "run-a-step-3", title: "Route policy", status: "queued", durationMs: 0 },
      ],
    },
    {
      id: "run-2026-05-15-b",
      workflowName: "repair-loop-triage",
      status: "failed",
      startedAt: "2026-05-15T07:10:00.000Z",
      durationMs: 440000,
      steps: [
        { id: "run-b-step-1", title: "Collect artifacts", status: "passed", durationMs: 90000 },
        {
          id: "run-b-step-2",
          title: "Generate patch plan",
          status: "failed",
          durationMs: 350000,
          trace: {
            task_summary: "Generate a repair plan from validation failures.",
            methodology: "Heuristic trace enrichment over repair-loop failures",
            key_decisions: ["Selected the CSS import repair path"],
            assumptions: ["The failing validation signature matches the latest build output"],
            risks_identified: ["Previous validation history may be too large for the prompt"],
            artifacts_created: ["plans/repair-plan.md"],
            confidence_level: "low",
            context_for_successors:
              "Retry should use compacted validation history and avoid replaying stale failures.",
          },
        },
      ],
    },
    {
      id: "run-2026-05-14-a",
      workflowName: "release-readiness",
      status: "passed",
      startedAt: "2026-05-14T19:40:00.000Z",
      durationMs: 620000,
      steps: [
        { id: "run-c-step-1", title: "Load gates", status: "passed", durationMs: 120000 },
        { id: "run-c-step-2", title: "Evaluate smoke", status: "passed", durationMs: 500000 },
      ],
    },
  ],
};

export const parseWorkflowNodeKind = (value: string): WorkflowNodeKind =>
  workflowNodeKinds.find((kind) => kind === value) ?? "agent";

export const parseWorkflowNodeStatus = (value: string): WorkflowNodeStatus =>
  workflowNodeStatuses.find((status) => status === value) ?? "draft";

export const getSelectedNode = (state: OpsWorkbenchState): WorkflowNode =>
  state.nodes.find((node) => node.id === state.selectedNodeId) ??
  state.nodes[0] ??
  emptyWorkflowNode;

export const getSelectedRun = (state: OpsWorkbenchState): ExecutionRun =>
  state.runs.find((run) => run.id === state.selectedRunId) ?? state.runs[0] ?? emptyExecutionRun;

export const selectNode = (
  state: OpsWorkbenchState,
  selectedNodeId: string
): OpsWorkbenchState => ({
  ...state,
  selectedNodeId: state.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : state.selectedNodeId,
});

export const selectRun = (state: OpsWorkbenchState, selectedRunId: string): OpsWorkbenchState => ({
  ...state,
  selectedRunId: state.runs.some((run) => run.id === selectedRunId)
    ? selectedRunId
    : state.selectedRunId,
});

export const updateWorkflowPrompt = (
  state: OpsWorkbenchState,
  systemPrompt: string
): OpsWorkbenchState => ({
  ...state,
  systemPrompt,
});

export const updateSelectedNode = (
  state: OpsWorkbenchState,
  patch: Partial<
    Pick<WorkflowNode, "agent" | "kind" | "model" | "policy" | "status" | "systemPrompt" | "title">
  >
): OpsWorkbenchState => {
  const selectedNodeId = state.selectedNodeId ?? state.nodes[0]?.id;

  return selectedNodeId === undefined
    ? state
    : {
        ...state,
        selectedNodeId,
        nodes: state.nodes.map((node) =>
          node.id === selectedNodeId ? { ...node, ...patch } : node
        ),
      };
};

export const getNextAgentNodeId = (state: OpsWorkbenchState): string =>
  `agent-step-${state.nodes.length + 1}`;

export const addAgentNode = (state: OpsWorkbenchState): OpsWorkbenchState => {
  const nextIndex = state.nodes.length + 1;
  const nodeId = getNextAgentNodeId(state);
  const nextNode: WorkflowNode = {
    id: nodeId,
    title: `Agent step ${nextIndex}`,
    kind: "agent",
    agent: `agent-${nextIndex}`,
    model: "gpt-5.4",
    policy: "operator-review",
    systemPrompt: "Describe the system behavior for this workflow step.",
    status: "draft",
    x: 40 + nextIndex * 250,
    y: nextIndex % 2 === 0 ? 420 : 120,
  };

  return {
    ...state,
    selectedNodeId: nodeId,
    nodes: [...state.nodes, nextNode],
  };
};

export const updateNodePositions = (
  state: OpsWorkbenchState,
  patches: ReadonlyArray<WorkflowNodePositionPatch>
): OpsWorkbenchState =>
  patches.length === 0
    ? state
    : {
        ...state,
        nodes: state.nodes.map((node) => {
          const patch = patches.find((candidate) => candidate.id === node.id);

          return patch === undefined
            ? node
            : {
                ...node,
                x: Math.round(patch.position.x),
                y: Math.round(patch.position.y),
              };
        }),
      };

const normalizeEdgeLabel = (label: string): string => {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : "next";
};

const edgeIdFor = (source: string, target: string): string => `${source}-to-${target}`;

const hasNode = (state: OpsWorkbenchState, nodeId: string): boolean =>
  state.nodes.some((node) => node.id === nodeId);

export const connectNodes = (
  state: OpsWorkbenchState,
  input: EdgeConnectionInput
): OpsWorkbenchState => {
  const source = input.source;
  const target = input.target;
  const label = normalizeEdgeLabel(input.label);
  const id = edgeIdFor(source, target);
  const isValid = source !== target && hasNode(state, source) && hasNode(state, target);

  if (!isValid) {
    return state;
  }

  const nextEdge: WorkflowEdge = { id, source, target, label };
  const hasExistingEdge = state.edges.some((edge) => edge.id === id);

  return {
    ...state,
    edges: hasExistingEdge
      ? state.edges.map((edge) => (edge.id === id ? nextEdge : edge))
      : [...state.edges, nextEdge],
  };
};

export const disconnectEdge = (state: OpsWorkbenchState, edgeId: string): OpsWorkbenchState => ({
  ...state,
  edges: state.edges.filter((edge) => edge.id !== edgeId),
});

export const resolveGraphEdges = (
  nodes: ReadonlyArray<WorkflowNode>,
  edges: ReadonlyArray<WorkflowEdge>
): ReadonlyArray<ResolvedGraphEdge> =>
  edges.flatMap((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);

    return sourceNode === undefined || targetNode === undefined
      ? []
      : [{ ...edge, sourceNode, targetNode }];
  });

export const summarizeOpsState = (state: OpsWorkbenchState): OpsSummary => ({
  nodeCount: state.nodes.length,
  edgeCount: state.edges.length,
  readyCount: state.nodes.filter((node) => node.status === "ready").length,
  activeRuns: state.runs.filter((run) => run.status === "running").length,
  failedRuns: state.runs.filter((run) => run.status === "failed").length,
});

const quoteYaml = (value: string): string => JSON.stringify(value);

const renderYamlBlock = (key: string, value: string, indent: string): ReadonlyArray<string> => {
  const lines = value.split("\n");

  return value.trim().length === 0
    ? [`${indent}${key}: ""`]
    : [`${indent}${key}: |`, ...lines.map((line) => `${indent}  ${line}`)];
};

const renderNodeYaml = (node: WorkflowNode): ReadonlyArray<string> => [
  `    - id: ${quoteYaml(node.id)}`,
  `      title: ${quoteYaml(node.title)}`,
  `      kind: ${quoteYaml(node.kind)}`,
  `      agent: ${quoteYaml(node.agent)}`,
  `      model: ${quoteYaml(node.model)}`,
  `      policy: ${quoteYaml(node.policy)}`,
  `      status: ${quoteYaml(node.status)}`,
  ...renderYamlBlock("systemPrompt", node.systemPrompt, "      "),
];

const renderEdgeYaml = (edge: WorkflowEdge): ReadonlyArray<string> => [
  `    - from: ${quoteYaml(edge.source)}`,
  `      to: ${quoteYaml(edge.target)}`,
  `      label: ${quoteYaml(edge.label)}`,
];

export const compileWorkflowYaml = (state: OpsWorkbenchState): string =>
  [
    `name: ${quoteYaml(state.workflowName)}`,
    ...renderYamlBlock("systemPrompt", state.systemPrompt, ""),
    "graph:",
    "  nodes:",
    ...state.nodes.flatMap(renderNodeYaml),
    "  edges:",
    ...(state.edges.length > 0 ? state.edges.flatMap(renderEdgeYaml) : ["    []"]),
  ].join("\n");
