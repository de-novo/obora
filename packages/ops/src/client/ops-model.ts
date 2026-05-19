export type OpsMode = "workflows" | "graph" | "prompt" | "runs" | "settings";

export type WorkflowNodeKind = "input" | "agent" | "tool" | "decision" | "handoff";

export type WorkflowNodeStatus = "draft" | "ready" | "blocked";

export type RunStatus = "running" | "passed" | "failed";

export type RunStepStatus = "queued" | "running" | "passed" | "failed";

export type TraceConfidenceLevel = "high" | "medium" | "low";

export type TraceSeverity = "info" | "warning" | "critical";

export type TraceFilter = "all" | TraceSeverity | "with-risks";

export type WorkflowDiagnosticSeverity = "critical" | "warning";

export type WorkflowLibraryStatus = "ready" | "draft" | "blocked";

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
  readonly inputPrompt: string;
  readonly inputPayload: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly steps: ReadonlyArray<ExecutionRunStep>;
}

export interface ExecutionRunSubmission {
  readonly inputPrompt: string;
  readonly inputPayload: string;
  readonly startedAt: string;
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

export interface WorkflowRecord {
  readonly id: string;
  readonly description: string;
  readonly updatedAt: string;
  readonly state: OpsWorkbenchState;
}

export interface OpsWorkspaceState {
  readonly selectedWorkflowId: string | undefined;
  readonly workflows: ReadonlyArray<WorkflowRecord>;
}

export interface OpsRoute {
  readonly mode: OpsMode;
  readonly workflowId: string | undefined;
}

export interface WorkflowMetadataPatch {
  readonly workflowName?: string;
  readonly description?: string;
}

export interface WorkflowDraftInput {
  readonly workflowName: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly firstStepTitle: string;
}

export interface OpsSummary {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly readyCount: number;
  readonly activeRuns: number;
  readonly failedRuns: number;
  readonly criticalDiagnostics: number;
  readonly warningDiagnostics: number;
}

export interface WorkflowDiagnostic {
  readonly id: string;
  readonly severity: WorkflowDiagnosticSeverity;
  readonly title: string;
  readonly detail: string;
  readonly nodeIds: ReadonlyArray<string>;
  readonly edgeIds: ReadonlyArray<string>;
}

export interface WorkflowLibrarySummary {
  readonly id: string;
  readonly workflowName: string;
  readonly description: string;
  readonly updatedAt: string;
  readonly stepCount: number;
  readonly readyCount: number;
  readonly reviewCount: number;
  readonly status: WorkflowLibraryStatus;
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

export const opsModes = [
  "workflows",
  "graph",
  "prompt",
  "runs",
  "settings",
] as const satisfies ReadonlyArray<OpsMode>;

export const defaultOpsRoute: OpsRoute = {
  mode: "workflows",
  workflowId: undefined,
};

const routeSegmentByMode: Record<OpsMode, string> = {
  workflows: "workflows",
  graph: "builder",
  prompt: "instructions",
  runs: "runs",
  settings: "settings",
};

const modeFromRouteSegment = (segment: string | undefined): OpsMode =>
  segment === routeSegmentByMode.graph
    ? "graph"
    : segment === routeSegmentByMode.prompt
      ? "prompt"
      : segment === routeSegmentByMode.runs
        ? "runs"
        : segment === routeSegmentByMode.settings
          ? "settings"
          : "workflows";

const decodeRouteSegment = (segment: string | undefined): string | undefined => {
  if (segment === undefined || segment.length === 0) {
    return undefined;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const hashRouteSegments = (hash: string): ReadonlyArray<string> =>
  hash.replace(/^#\/?/, "").split("/").filter(Boolean);

export const parseOpsRoute = (hash: string): OpsRoute => {
  const [root, workflowSegment, modeSegment] = hashRouteSegments(hash);
  const workflowId = root === "workflows" ? decodeRouteSegment(workflowSegment) : undefined;

  return {
    mode: workflowId === undefined ? defaultOpsRoute.mode : modeFromRouteSegment(modeSegment),
    workflowId,
  };
};

export const hashForOpsRoute = (route: OpsRoute): string => {
  const workflowId =
    route.workflowId === undefined ? undefined : encodeURIComponent(route.workflowId);

  return route.mode === "workflows"
    ? workflowId === undefined
      ? "#/workflows"
      : `#/workflows/${workflowId}`
    : workflowId === undefined
      ? "#/workflows"
      : `#/workflows/${workflowId}/${routeSegmentByMode[route.mode]}`;
};

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

export const traceFilters = [
  "all",
  "critical",
  "warning",
  "info",
  "with-risks",
] as const satisfies ReadonlyArray<TraceFilter>;

export const traceFilterLabels: Record<TraceFilter, string> = {
  all: "All steps",
  critical: "Critical traces",
  warning: "Warning traces",
  info: "Info traces",
  "with-risks": "With risks",
};

export const traceSeverityLabels: Record<TraceSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export const workflowDiagnosticSeverityLabels: Record<WorkflowDiagnosticSeverity, string> = {
  critical: "Fix",
  warning: "Review",
};

export const workflowLibraryStatusLabels: Record<WorkflowLibraryStatus, string> = {
  ready: "Ready",
  draft: "Review",
  blocked: "Blocked",
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
  inputPrompt: "",
  inputPayload: "",
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
      inputPrompt: "Review a new operator request for contract completeness and policy routing.",
      inputPayload: JSON.stringify({ source: "ops-console", priority: "normal" }, null, 2),
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
      inputPrompt: "Triage the failed release validation and prepare a narrow retry plan.",
      inputPayload: JSON.stringify({ failingGate: "verify:smoke", attempt: 2 }, null, 2),
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
      inputPrompt: "Check whether the latest release gates are sufficient for handoff.",
      inputPayload: JSON.stringify({ release: "2026.05.14", gates: ["typecheck", "smoke"] }, null, 2),
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

const runsForWorkflow = (
  runs: ReadonlyArray<ExecutionRun>,
  workflowName: string
): ReadonlyArray<ExecutionRun> => runs.filter((run) => run.workflowName === workflowName);

const repairLoopWorkflowState: OpsWorkbenchState = {
  workflowName: "repair-loop-triage",
  systemPrompt: [
    "You are the repair workflow operator.",
    "Collect failure evidence, produce a patch plan, and stop when confidence is low.",
  ].join("\n"),
  selectedNodeId: "generate-patch-plan",
  selectedRunId: "run-2026-05-15-b",
  nodes: [
    {
      id: "collect-artifacts",
      title: "Collect artifacts",
      kind: "input",
      agent: "repair-intake",
      model: "rule",
      policy: "evidence-required",
      systemPrompt: "Collect failing logs, changed files, and command output for repair triage.",
      status: "ready",
      x: 40,
      y: 220,
    },
    {
      id: "generate-patch-plan",
      title: "Generate patch plan",
      kind: "agent",
      agent: "repair-planner",
      model: "gpt-5.4",
      policy: "trace-required",
      systemPrompt: "Generate a narrow repair plan with assumptions, risks, and verification steps.",
      status: "blocked",
      x: 340,
      y: 120,
    },
    {
      id: "handoff-retry",
      title: "Handoff retry",
      kind: "handoff",
      agent: "ops-dispatch",
      model: "rule",
      policy: "operator-approval",
      systemPrompt: "Prepare a retry handoff after the plan is approved by the operator.",
      status: "draft",
      x: 640,
      y: 260,
    },
  ],
  edges: [
    {
      id: "collect-artifacts-to-generate-patch-plan",
      source: "collect-artifacts",
      target: "generate-patch-plan",
      label: "evidence",
    },
    {
      id: "generate-patch-plan-to-handoff-retry",
      source: "generate-patch-plan",
      target: "handoff-retry",
      label: "planned",
    },
  ],
  runs: runsForWorkflow(initialOpsState.runs, "repair-loop-triage"),
};

const releaseReadinessWorkflowState: OpsWorkbenchState = {
  workflowName: "release-readiness",
  systemPrompt: [
    "You are the release readiness operator.",
    "Load required gates, inspect smoke results, and hand off only verified release status.",
  ].join("\n"),
  selectedNodeId: "evaluate-smoke",
  selectedRunId: "run-2026-05-14-a",
  nodes: [
    {
      id: "load-gates",
      title: "Load gates",
      kind: "input",
      agent: "release-intake",
      model: "rule",
      policy: "gate-list-required",
      systemPrompt: "Load release gates and normalize their latest command outputs.",
      status: "ready",
      x: 40,
      y: 220,
    },
    {
      id: "evaluate-smoke",
      title: "Evaluate smoke",
      kind: "agent",
      agent: "release-reviewer",
      model: "gpt-5.4",
      policy: "strict-evidence",
      systemPrompt: "Evaluate smoke evidence and flag missing or stale verification results.",
      status: "ready",
      x: 340,
      y: 120,
    },
    {
      id: "release-handoff",
      title: "Release handoff",
      kind: "handoff",
      agent: "release-dispatch",
      model: "rule",
      policy: "audit-required",
      systemPrompt: "Prepare an auditable release handoff with final status and next action.",
      status: "ready",
      x: 640,
      y: 260,
    },
  ],
  edges: [
    {
      id: "load-gates-to-evaluate-smoke",
      source: "load-gates",
      target: "evaluate-smoke",
      label: "gates",
    },
    {
      id: "evaluate-smoke-to-release-handoff",
      source: "evaluate-smoke",
      target: "release-handoff",
      label: "verified",
    },
  ],
  runs: runsForWorkflow(initialOpsState.runs, "release-readiness"),
};

export const initialWorkflowLibrary: ReadonlyArray<WorkflowRecord> = [
  {
    id: "workflow-intake-to-decision",
    description: "Operator intake, contract validation, policy route, and handoff.",
    updatedAt: "2026-05-15 17:20",
    state: {
      ...initialOpsState,
      runs: runsForWorkflow(initialOpsState.runs, "intake-to-decision"),
    },
  },
  {
    id: "workflow-repair-loop-triage",
    description: "Failure evidence collection and retry planning.",
    updatedAt: "2026-05-15 16:10",
    state: repairLoopWorkflowState,
  },
  {
    id: "workflow-release-readiness",
    description: "Release gate loading, smoke evaluation, and final handoff.",
    updatedAt: "2026-05-15 04:40",
    state: releaseReadinessWorkflowState,
  },
];

export const initialOpsWorkspaceState: OpsWorkspaceState = {
  selectedWorkflowId: initialWorkflowLibrary[0]?.id,
  workflows: initialWorkflowLibrary,
};

export const parseWorkflowNodeKind = (value: string): WorkflowNodeKind =>
  workflowNodeKinds.find((kind) => kind === value) ?? "agent";

export const parseWorkflowNodeStatus = (value: string): WorkflowNodeStatus =>
  workflowNodeStatuses.find((status) => status === value) ?? "draft";

export const parseTraceFilter = (value: string): TraceFilter =>
  traceFilters.find((filter) => filter === value) ?? "all";

export const getTraceSeverity = (trace: ExecutionStepTrace): TraceSeverity =>
  trace.confidence_level === "low"
    ? "critical"
    : trace.risks_identified.length > 0 || trace.confidence_level === "medium"
      ? "warning"
      : "info";

export const filterRunStepsByTraceFilter = (
  steps: ReadonlyArray<ExecutionRunStep>,
  filter: TraceFilter
): ReadonlyArray<ExecutionRunStep> =>
  filter === "all"
    ? steps
    : steps.filter((step) =>
        step.trace === undefined
          ? false
          : filter === "with-risks"
            ? step.trace.risks_identified.length > 0
            : getTraceSeverity(step.trace) === filter
      );

const traceFilenameSegment = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "trace";

const runIdForSubmission = (state: OpsWorkbenchState): string =>
  `run-${traceFilenameSegment(state.workflowName)}-${String(state.runs.length + 1).padStart(3, "0")}`;

const runStepStatusForIndex = (index: number): RunStepStatus =>
  index === 0 ? "running" : "queued";

const executionRunStepForNode =
  (runId: string) =>
  (node: WorkflowNode, index: number): ExecutionRunStep => ({
    id: `${runId}-step-${index + 1}`,
    title: node.title,
    status: runStepStatusForIndex(index),
    durationMs: 0,
  });

export const addExecutionRun = (
  state: OpsWorkbenchState,
  submission: ExecutionRunSubmission
): OpsWorkbenchState => {
  const inputPrompt = submission.inputPrompt.trim();
  const inputPayload = submission.inputPayload.trim();
  const runId = runIdForSubmission(state);
  const nextRun: ExecutionRun = {
    id: runId,
    workflowName: state.workflowName,
    inputPrompt,
    inputPayload,
    status: "running",
    startedAt: submission.startedAt,
    durationMs: 0,
    steps: state.nodes.map(executionRunStepForNode(runId)),
  };

  return inputPrompt.length === 0
    ? state
    : {
        ...state,
        selectedRunId: runId,
        runs: [nextRun, ...state.runs],
      };
};

export const traceExportFilenameForStep = (runId: string, step: ExecutionRunStep): string =>
  `${traceFilenameSegment(runId)}-${traceFilenameSegment(step.title)}-trace.json`;

export const serializeTraceForInspection = (
  run: ExecutionRun,
  step: ExecutionRunStep
): string =>
  JSON.stringify(
    {
      run: {
        id: run.id,
        workflowName: run.workflowName,
        inputPrompt: run.inputPrompt,
        inputPayload: run.inputPayload,
        status: run.status,
        startedAt: run.startedAt,
      },
      step: {
        id: step.id,
        title: step.title,
        status: step.status,
        durationMs: step.durationMs,
      },
      trace: step.trace ?? null,
    },
    null,
    2
  );

export const getSelectedNode = (state: OpsWorkbenchState): WorkflowNode =>
  state.nodes.find((node) => node.id === state.selectedNodeId) ??
  state.nodes[0] ??
  emptyWorkflowNode;

export const getSelectedRun = (state: OpsWorkbenchState): ExecutionRun =>
  state.runs.find((run) => run.id === state.selectedRunId) ?? state.runs[0] ?? emptyExecutionRun;

const emptyWorkflowRecord: WorkflowRecord = {
  id: "empty-workflow",
  description: "No workflow selected.",
  updatedAt: "",
  state: {
    workflowName: "No workflow selected",
    systemPrompt: "",
    selectedNodeId: undefined,
    selectedRunId: undefined,
    nodes: [],
    edges: [],
    runs: [],
  },
};

export const getSelectedWorkflow = (workspace: OpsWorkspaceState): WorkflowRecord =>
  workspace.workflows.find((workflow) => workflow.id === workspace.selectedWorkflowId) ??
  workspace.workflows[0] ??
  emptyWorkflowRecord;

export const selectWorkflow = (
  workspace: OpsWorkspaceState,
  selectedWorkflowId: string
): OpsWorkspaceState => ({
  ...workspace,
  selectedWorkflowId: workspace.workflows.some((workflow) => workflow.id === selectedWorkflowId)
    ? selectedWorkflowId
    : workspace.selectedWorkflowId,
});

export const updateSelectedWorkflowState = (
  workspace: OpsWorkspaceState,
  updateState: (state: OpsWorkbenchState) => OpsWorkbenchState
): OpsWorkspaceState => ({
  ...workspace,
  workflows: workspace.workflows.map((workflow) =>
    workflow.id === workspace.selectedWorkflowId
      ? { ...workflow, state: updateState(workflow.state) }
      : workflow
  ),
});

export const updateSelectedWorkflowMetadata = (
  workspace: OpsWorkspaceState,
  patch: WorkflowMetadataPatch
): OpsWorkspaceState => ({
  ...workspace,
  workflows: workspace.workflows.map((workflow) =>
    workflow.id === workspace.selectedWorkflowId
      ? {
          ...workflow,
          description: patch.description ?? workflow.description,
          state:
            patch.workflowName === undefined
              ? workflow.state
              : { ...workflow.state, workflowName: patch.workflowName },
        }
      : workflow
  ),
});

const draftWorkflowIndexFor = (workspace: OpsWorkspaceState): number => workspace.workflows.length + 1;

const defaultWorkflowDraftInputFor = (index: number): WorkflowDraftInput => ({
  workflowName: `draft-workflow-${index}`,
  description: "New local workflow draft.",
  systemPrompt: "Operate this workflow with auditable decisions and clear handoffs.",
  firstStepTitle: "Start request",
});

const normalizeDraftText = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const draftWorkflowStateFor = (draft: WorkflowDraftInput): OpsWorkbenchState => ({
  workflowName: draft.workflowName,
  systemPrompt: draft.systemPrompt,
  selectedNodeId: "start-request",
  selectedRunId: undefined,
  nodes: [
    {
      id: "start-request",
      title: draft.firstStepTitle,
      kind: "input",
      agent: "ops-intake",
      model: "rule",
      policy: "schema-required",
      systemPrompt: "Collect the initial operator request and normalize the required fields.",
      status: "draft",
      x: 40,
      y: 220,
    },
  ],
  edges: [],
  runs: [],
});

const normalizeWorkflowDraftInput = (
  input: WorkflowDraftInput | undefined,
  index: number
): WorkflowDraftInput => {
  const fallback = defaultWorkflowDraftInputFor(index);

  return input === undefined
    ? fallback
    : {
        workflowName: normalizeDraftText(input.workflowName, fallback.workflowName),
        description: normalizeDraftText(input.description, fallback.description),
        systemPrompt: normalizeDraftText(input.systemPrompt, fallback.systemPrompt),
        firstStepTitle: normalizeDraftText(input.firstStepTitle, fallback.firstStepTitle),
      };
};

export const addDraftWorkflow = (
  workspace: OpsWorkspaceState,
  input?: WorkflowDraftInput
): OpsWorkspaceState => {
  const nextIndex = draftWorkflowIndexFor(workspace);
  const draft = normalizeWorkflowDraftInput(input, nextIndex);
  const nextWorkflow: WorkflowRecord = {
    id: `workflow-draft-${nextIndex}`,
    description: draft.description,
    updatedAt: "Draft",
    state: draftWorkflowStateFor(draft),
  };

  return {
    selectedWorkflowId: nextWorkflow.id,
    workflows: [...workspace.workflows, nextWorkflow],
  };
};

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

const isBlank = (value: string): boolean => value.trim().length === 0;

const uniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((value, index, allValues) => allValues.indexOf(value) === index);

const nodeFieldDiagnostics = (node: WorkflowNode): ReadonlyArray<WorkflowDiagnostic> =>
  [
    { field: "title", label: "title", value: node.title },
    { field: "agent", label: "agent", value: node.agent },
    { field: "model", label: "model", value: node.model },
    { field: "policy", label: "policy", value: node.policy },
    { field: "systemPrompt", label: "instructions", value: node.systemPrompt },
  ].flatMap(({ field, label, value }) =>
    isBlank(value)
      ? [
          {
            id: `${node.id}-${field}-missing`,
            severity: node.status === "ready" ? "critical" : "warning",
            title: `${node.title || node.id} is missing ${label}`,
            detail:
              node.status === "ready"
                ? "Ready steps must compile with every execution field populated."
                : "Draft steps should define this field before release.",
            nodeIds: [node.id],
            edgeIds: [],
          },
        ]
      : []
  );

export const getWorkflowDiagnostics = (
  state: OpsWorkbenchState
): ReadonlyArray<WorkflowDiagnostic> => {
  const nodeIds = state.nodes.map((node) => node.id);
  const duplicateNodeIds = uniqueStrings(
    nodeIds.filter((nodeId, index, allNodeIds) => allNodeIds.indexOf(nodeId) !== index)
  );
  const resolvedEdges = resolveGraphEdges(state.nodes, state.edges);
  const invalidEdges = state.edges.filter(
    (edge) =>
      !state.nodes.some((node) => node.id === edge.source) ||
      !state.nodes.some((node) => node.id === edge.target)
  );
  const incomingCountFor = (nodeId: string): number =>
    resolvedEdges.filter((edge) => edge.target === nodeId).length;
  const outgoingCountFor = (nodeId: string): number =>
    resolvedEdges.filter((edge) => edge.source === nodeId).length;

  return [
    ...(isBlank(state.workflowName)
      ? [
          {
            id: "workflow-name-missing",
            severity: "critical" as const,
            title: "Workflow name is missing",
            detail: "Compiled workflows need a stable name before execution.",
            nodeIds: [],
            edgeIds: [],
          },
        ]
      : []),
    ...(state.nodes.length === 0
      ? [
          {
            id: "workflow-empty",
            severity: "critical" as const,
            title: "Workflow has no steps",
            detail: "Add at least one step before testing the workflow.",
            nodeIds: [],
            edgeIds: [],
          },
        ]
      : []),
    ...(isBlank(state.systemPrompt)
      ? [
          {
            id: "workflow-system-prompt-missing",
            severity: "warning" as const,
            title: "Workflow instructions are empty",
            detail: "Add short instructions so runs follow the expected policy.",
            nodeIds: [],
            edgeIds: [],
          },
        ]
      : []),
    ...duplicateNodeIds.map((nodeId) => ({
      id: `${nodeId}-duplicate`,
      severity: "critical" as const,
      title: `Duplicate node id: ${nodeId}`,
      detail: "Node ids must be unique so graph edges resolve deterministically.",
      nodeIds: [nodeId],
      edgeIds: [],
    })),
    ...invalidEdges.map((edge) => ({
      id: `${edge.id}-dangling`,
      severity: "critical" as const,
      title: `Dangling edge: ${edge.label || edge.id}`,
      detail: "Every edge must connect two existing workflow nodes.",
      nodeIds: [],
      edgeIds: [edge.id],
    })),
    ...state.edges.flatMap((edge) =>
      isBlank(edge.label)
        ? [
            {
              id: `${edge.id}-label-missing`,
              severity: "warning" as const,
              title: `Edge ${edge.id} has no label`,
              detail: "Edge labels should describe the branch condition or payload.",
              nodeIds: [edge.source, edge.target],
              edgeIds: [edge.id],
            },
          ]
        : []
    ),
    ...state.nodes.flatMap(nodeFieldDiagnostics),
    ...state.nodes.flatMap((node) =>
      node.kind !== "input" && incomingCountFor(node.id) === 0
        ? [
            {
              id: `${node.id}-no-incoming-edge`,
              severity: "warning" as const,
              title: `${node.title} has no incoming edge`,
              detail: "Non-input steps should be reachable from an upstream step.",
              nodeIds: [node.id],
              edgeIds: [],
            },
          ]
        : []
    ),
    ...state.nodes.flatMap((node) =>
      node.kind !== "handoff" && outgoingCountFor(node.id) === 0
        ? [
            {
              id: `${node.id}-no-outgoing-edge`,
              severity: "warning" as const,
              title: `${node.title} has no outgoing edge`,
              detail: "Non-handoff steps should define where execution continues.",
              nodeIds: [node.id],
              edgeIds: [],
            },
          ]
        : []
    ),
    ...state.nodes.flatMap((node) =>
      node.status === "blocked"
        ? [
            {
              id: `${node.id}-blocked`,
              severity: "warning" as const,
              title: `${node.title} is blocked`,
              detail: "Blocked steps should be resolved before running this workflow.",
              nodeIds: [node.id],
              edgeIds: [],
            },
          ]
        : []
    ),
  ];
};

export const summarizeOpsState = (state: OpsWorkbenchState): OpsSummary => {
  const diagnostics = getWorkflowDiagnostics(state);

  return {
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
    readyCount: state.nodes.filter((node) => node.status === "ready").length,
    activeRuns: state.runs.filter((run) => run.status === "running").length,
    failedRuns: state.runs.filter((run) => run.status === "failed").length,
    criticalDiagnostics: diagnostics.filter((diagnostic) => diagnostic.severity === "critical")
      .length,
    warningDiagnostics: diagnostics.filter((diagnostic) => diagnostic.severity === "warning")
      .length,
  };
};

const workflowLibraryStatusFor = (summary: OpsSummary): WorkflowLibraryStatus =>
  summary.criticalDiagnostics > 0
    ? "blocked"
    : summary.warningDiagnostics > 0
      ? "draft"
      : "ready";

export const summarizeWorkflowRecord = (workflow: WorkflowRecord): WorkflowLibrarySummary => {
  const summary = summarizeOpsState(workflow.state);

  return {
    id: workflow.id,
    workflowName: workflow.state.workflowName,
    description: workflow.description,
    updatedAt: workflow.updatedAt,
    stepCount: summary.nodeCount,
    readyCount: summary.readyCount,
    reviewCount: summary.criticalDiagnostics + summary.warningDiagnostics,
    status: workflowLibraryStatusFor(summary),
  };
};

export const summarizeWorkflowLibrary = (
  workflows: ReadonlyArray<WorkflowRecord>
): ReadonlyArray<WorkflowLibrarySummary> => workflows.map(summarizeWorkflowRecord);

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
