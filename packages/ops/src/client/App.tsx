import type { ChangeEvent, FormEvent, ReactElement } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import {
  Archive,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Columns3,
  Database,
  ExternalLink,
  Filter,
  Folder,
  Inbox,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Star,
  Users,
  X,
} from "lucide-react";

import "@xyflow/react/dist/style.css";
import "./styles.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  addAgentNode,
  addDraftWorkflow,
  addExecutionRun,
  connectNodes,
  disconnectEdge,
  filterRunStepsByTraceFilter,
  getNextAgentNodeId,
  getSelectedNode,
  getSelectedRun,
  getSelectedWorkflow,
  getTraceSeverity,
  getWorkflowDiagnostics,
  hashForOpsRoute,
  initialOpsWorkspaceState,
  nodeKindLabels,
  nodeStatusLabels,
  parseOpsRoute,
  parseTraceFilter,
  parseWorkflowNodeKind,
  parseWorkflowNodeStatus,
  resolveGraphEdges,
  runStatusLabels,
  runStepStatusLabels,
  selectNode,
  selectRun,
  selectWorkflow,
  serializeTraceForInspection,
  summarizeOpsState,
  traceExportFilenameForStep,
  traceFilterLabels,
  traceFilters,
  updateSelectedWorkflowState,
  updateSelectedWorkflowMetadata,
  updateSelectedNode,
  updateNodePositions,
  updateWorkflowPrompt,
  workflowNodeKinds,
  workflowNodeStatuses,
  type EdgeConnectionInput,
  type ExecutionRun,
  type ExecutionRunSubmission,
  type ExecutionRunStep,
  type OpsMode,
  type OpsRoute,
  type OpsSummary,
  type OpsWorkbenchState,
  type OpsWorkspaceState,
  type TraceFilter,
  type WorkflowDraftInput,
  type WorkflowDiagnostic,
  type WorkflowEdge,
  type WorkflowRecord,
  type WorkflowNode,
  type WorkflowNodePositionPatch,
  workflowDiagnosticSeverityLabels,
} from "./ops-model";
import { TraceSummary } from "./TraceSummary";

const statusClass = (status: string): string => `status-${status}`;

const formatDuration = (durationMs: number): string => `${Math.round(durationMs / 1000)}s`;

const nodeTitleFor = (nodes: ReadonlyArray<WorkflowNode>, nodeId: string): string =>
  nodes.find((node) => node.id === nodeId)?.title ?? nodeId;

type WorkflowDirectoryRunStatus = "successful" | "failed" | "running" | "never";

type WorkflowCategoryTone =
  | "finance"
  | "hr"
  | "it"
  | "sales"
  | "data"
  | "compliance"
  | "other";

interface WorkflowDirectoryRow {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly description: string;
  readonly category: string;
  readonly categoryTone: WorkflowCategoryTone;
  readonly ownerInitials: string;
  readonly ownerName: string;
  readonly lastRun: string;
  readonly lastRunStatus: WorkflowDirectoryRunStatus;
  readonly latestRunDuration: string;
  readonly successRate: number | undefined;
  readonly updatedAt: string;
  readonly favorite: boolean;
}

interface WorkflowLibraryNavItem {
  readonly label: string;
  readonly count: number;
  readonly icon: LucideIcon;
  readonly selected?: boolean;
}

interface WorkflowCategoryNavItem {
  readonly label: string;
  readonly count: number;
  readonly icon: LucideIcon;
}

interface WorkflowDirectoryProfile {
  readonly category: string;
  readonly categoryTone: WorkflowCategoryTone;
  readonly ownerInitials: string;
  readonly ownerName: string;
  readonly favorite: boolean;
}

interface WorkflowCategoryDefinition {
  readonly label: string;
  readonly icon: LucideIcon;
}

const emptyWorkflowDirectoryRow: WorkflowDirectoryRow = {
  id: "empty-workflow",
  workflowId: "empty-workflow",
  workflowName: "No workflow selected",
  description: "Create or select a workflow to inspect it.",
  category: "Other",
  categoryTone: "other",
  ownerInitials: "AK",
  ownerName: "Alex Kim",
  lastRun: "Never run",
  lastRunStatus: "never",
  latestRunDuration: "-",
  successRate: undefined,
  updatedAt: "",
  favorite: false,
};

const defaultWorkflowDirectoryProfile: WorkflowDirectoryProfile = {
  category: "Other",
  categoryTone: "other",
  ownerInitials: "AK",
  ownerName: "Alex Kim",
  favorite: false,
};

const workflowDirectoryProfiles: Record<string, WorkflowDirectoryProfile> = {
  "workflow-intake-to-decision": {
    category: "HR",
    categoryTone: "hr",
    ownerInitials: "AK",
    ownerName: "Alex Kim",
    favorite: true,
  },
  "workflow-repair-loop-triage": {
    category: "Finance",
    categoryTone: "finance",
    ownerInitials: "SC",
    ownerName: "Sam Carter",
    favorite: false,
  },
  "workflow-release-readiness": {
    category: "IT Operations",
    categoryTone: "it",
    ownerInitials: "JM",
    ownerName: "Jordan Miller",
    favorite: false,
  },
};

const workflowCategoryDefinitions = [
  { label: "Finance", icon: BriefcaseBusiness },
  { label: "HR", icon: Users },
  { label: "IT Operations", icon: Database },
  { label: "Sales", icon: BarChart3 },
  { label: "Data & Analytics", icon: Folder },
  { label: "Compliance", icon: ShieldCheck },
  { label: "Other", icon: MoreHorizontal },
] as const satisfies ReadonlyArray<WorkflowCategoryDefinition>;

const topNavigationItems = [
  { label: "Home", mode: "workflows" },
  { label: "Workflows", mode: "workflows" },
  { label: "Runs", mode: "runs" },
  { label: "Tasks", mode: "graph" },
  { label: "Connections", mode: "graph" },
  { label: "Settings", mode: "settings" },
] as const satisfies ReadonlyArray<{ readonly label: string; readonly mode: OpsMode }>;

const workflowDirectoryProfileFor = (record: WorkflowRecord): WorkflowDirectoryProfile =>
  workflowDirectoryProfiles[record.id] ?? defaultWorkflowDirectoryProfile;

const timestampForRun = (run: ExecutionRun): number => Date.parse(run.startedAt);

const latestRunForRecord = (record: WorkflowRecord): ExecutionRun | undefined =>
  record.state.runs.reduce<ExecutionRun | undefined>(
    (latestRun, run) =>
      latestRun === undefined || timestampForRun(run) > timestampForRun(latestRun)
        ? run
        : latestRun,
    undefined
  );

const runStatusForDirectory = (
  status: ExecutionRun["status"] | undefined
): WorkflowDirectoryRunStatus =>
  status === "passed"
    ? "successful"
    : status === "failed"
      ? "failed"
      : status === "running"
        ? "running"
        : "never";

const formatDateTimeLabel = (value: string): string => {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(timestamp));
};

const formatUpdatedDateLabel = (value: string): string => {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(new Date(timestamp));
};

const completedRunsFor = (record: WorkflowRecord): ReadonlyArray<ExecutionRun> =>
  record.state.runs.filter((run) => run.status !== "running");

const successRateForRecord = (record: WorkflowRecord): number | undefined => {
  const completedRuns = completedRunsFor(record);

  return completedRuns.length === 0
    ? undefined
    : Math.round(
        (completedRuns.filter((run) => run.status === "passed").length / completedRuns.length) *
          100
      );
};

const workflowDirectoryRowForRecord = (record: WorkflowRecord): WorkflowDirectoryRow => {
  const profile = workflowDirectoryProfileFor(record);
  const latestRun = latestRunForRecord(record);

  return {
    id: record.id,
    workflowId: record.id,
    workflowName: record.state.workflowName,
    description: record.description,
    category: profile.category,
    categoryTone: profile.categoryTone,
    ownerInitials: profile.ownerInitials,
    ownerName: profile.ownerName,
    lastRun: latestRun === undefined ? "Never run" : formatDateTimeLabel(latestRun.startedAt),
    lastRunStatus: runStatusForDirectory(latestRun?.status),
    latestRunDuration: latestRun === undefined ? "-" : formatDuration(latestRun.durationMs),
    successRate: successRateForRecord(record),
    updatedAt: formatUpdatedDateLabel(record.updatedAt),
    favorite: profile.favorite,
  };
};

const workflowDirectoryRowsFor = (
  records: ReadonlyArray<WorkflowRecord>
): ReadonlyArray<WorkflowDirectoryRow> => records.map(workflowDirectoryRowForRecord);

const workflowLibraryNavItemsFor = (
  rows: ReadonlyArray<WorkflowDirectoryRow>
): ReadonlyArray<WorkflowLibraryNavItem> => [
  { label: "All Workflows", count: rows.length, icon: Inbox, selected: true },
  { label: "Favorites", count: rows.filter((row) => row.favorite).length, icon: Star },
  { label: "Recently Updated", count: rows.length, icon: Clock3 },
  {
    label: "Owned by Me",
    count: rows.filter((row) => row.ownerName === "Alex Kim").length,
    icon: Users,
  },
  {
    label: "Shared with Me",
    count: rows.filter((row) => row.ownerName !== "Alex Kim").length,
    icon: Share2,
  },
  { label: "Archived", count: 0, icon: Archive },
];

const workflowCategoryNavItemsFor = (
  rows: ReadonlyArray<WorkflowDirectoryRow>
): ReadonlyArray<WorkflowCategoryNavItem> =>
  workflowCategoryDefinitions.map((definition) => ({
    ...definition,
    count: rows.filter((row) => row.category === definition.label).length,
  }));

const workflowDirectoryRowMatchesSearch = (
  workflow: WorkflowDirectoryRow,
  query: string
): boolean =>
  query.length === 0 ||
  workflow.workflowName.toLowerCase().includes(query) ||
  workflow.description.toLowerCase().includes(query) ||
  workflow.category.toLowerCase().includes(query) ||
  workflow.ownerName.toLowerCase().includes(query);

const visibleWorkflowDirectoryRows = (
  rows: ReadonlyArray<WorkflowDirectoryRow>,
  query: string
): ReadonlyArray<WorkflowDirectoryRow> => {
  const normalizedQuery = normalizeSearch(query);

  return rows.filter((workflow) => workflowDirectoryRowMatchesSearch(workflow, normalizedQuery));
};

const selectedWorkflowDirectoryRowFor = (
  rows: ReadonlyArray<WorkflowDirectoryRow>,
  selectedWorkflowId: string | undefined,
  selectedDirectoryRowId: string
): WorkflowDirectoryRow =>
  rows.find(
    (workflow) =>
      workflow.id === selectedDirectoryRowId && workflow.workflowId === selectedWorkflowId
  ) ??
  rows.find((workflow) => workflow.workflowId === selectedWorkflowId) ??
  rows[0] ??
  emptyWorkflowDirectoryRow;

const normalizeSearch = (value: string): string => value.trim().toLowerCase();

const firstTraceStepForRun = (run: ExecutionRun): ExecutionRunStep | undefined =>
  run.steps.find((step) => step.trace !== undefined);

const nodeIdForRunStepTitle = (
  nodes: ReadonlyArray<WorkflowNode>,
  title: string
): string | undefined => nodes.find((node) => node.title === title)?.id;

interface WorkflowCanvasNodeData extends Record<string, unknown> {
  readonly node: WorkflowNode;
}

export type WorkflowCanvasNodeType = Node<WorkflowCanvasNodeData, "workflowNode">;
export type WorkflowCanvasEdgeType = Edge<Record<string, never>, "smoothstep">;

export const workflowNodeToCanvasNode = (
  node: WorkflowNode,
  selectedNodeId: string | undefined
): WorkflowCanvasNodeType => ({
  id: node.id,
  type: "workflowNode",
  position: { x: node.x, y: node.y },
  data: { node },
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  draggable: true,
  selected: node.id === selectedNodeId,
  selectable: true,
  focusable: true,
  ariaRole: "button",
  ariaLabel: `Select ${node.title}`,
});

export const workflowEdgeToCanvasEdge = (edge: WorkflowEdge): WorkflowCanvasEdgeType => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: "smoothstep",
  label: edge.label,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
  },
  className: "workflow-flow-edge",
  labelShowBg: true,
  labelStyle: {
    fill: "#dfe8e1",
    fontSize: 12,
    fontWeight: 800,
  },
  labelBgStyle: {
    fill: "#202722",
    stroke: "#3a453f",
    strokeWidth: 1,
  },
  labelBgPadding: [8, 4],
  labelBgBorderRadius: 6,
});

export const canvasPositionPatchFromChange = (
  change: NodeChange<WorkflowCanvasNodeType>
): ReadonlyArray<WorkflowNodePositionPatch> =>
  change.type === "position" && change.position !== undefined
    ? [{ id: change.id, position: change.position }]
    : [];

export const canvasPositionPatchesFromChanges = (
  changes: ReadonlyArray<NodeChange<WorkflowCanvasNodeType>>
): ReadonlyArray<WorkflowNodePositionPatch> => changes.flatMap(canvasPositionPatchFromChange);

export const edgeConnectionInputFromCanvas = (connection: Connection): EdgeConnectionInput => ({
  source: connection.source,
  target: connection.target,
  label: "next",
});

export const edgeIdsFromDeletedCanvasEdges = (
  deletedEdges: ReadonlyArray<WorkflowCanvasEdgeType>
): ReadonlyArray<string> => deletedEdges.map((edge) => edge.id);

export const nodeColorForCanvasNode = (
  workflowNodes: ReadonlyArray<WorkflowNode>,
  canvasNode: Node
): string =>
  workflowNodes.find((workflowNode) => workflowNode.id === canvasNode.id)?.status === "ready"
    ? "#1f7a64"
    : "#b98925";

const WorkflowCanvasNode = memo(
  ({ data, selected }: NodeProps<WorkflowCanvasNodeType>): ReactElement => {
    const node = data.node;

    return (
      <div
        className={["workflow-canvas-node", statusClass(node.status), selected ? "selected" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="workflow-handle workflow-handle-input"
          id="input"
        />
        <div className="workflow-node-port-label input">input</div>
        <div className="workflow-node-header">
          <span>{nodeKindLabels[node.kind]}</span>
          <strong>{node.title}</strong>
        </div>
        <span className={["workflow-node-state", statusClass(node.status)].join(" ")}>
          {nodeStatusLabels[node.status]}
        </span>
        <Handle
          type="source"
          position={Position.Right}
          className="workflow-handle workflow-handle-output"
          id="next"
        />
        <div className="workflow-node-port-label output">next</div>
      </div>
    );
  }
);

WorkflowCanvasNode.displayName = "WorkflowCanvasNode";

const workflowNodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

interface WorkflowGraphProps {
  readonly state: OpsWorkbenchState;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onConnectNodes: (connection: Connection) => void;
  readonly onDeleteEdges: (edgeIds: ReadonlyArray<string>) => void;
  readonly onMoveNodes: (patches: ReadonlyArray<WorkflowNodePositionPatch>) => void;
}

const WorkflowGraph = ({
  onConnectNodes,
  onDeleteEdges,
  onMoveNodes,
  onSelectNode,
  state,
}: WorkflowGraphProps): ReactElement => {
  const nodes = useMemo(
    () => state.nodes.map((node) => workflowNodeToCanvasNode(node, state.selectedNodeId)),
    [state.nodes, state.selectedNodeId]
  );
  const edges = useMemo(
    () => resolveGraphEdges(state.nodes, state.edges).map(workflowEdgeToCanvasEdge),
    [state.edges, state.nodes]
  );
  const handleNodeClick = useCallback<NodeMouseHandler<WorkflowCanvasNodeType>>(
    (_event, node) => onSelectNode(node.id),
    [onSelectNode]
  );
  const handleEdgeClick = useCallback<EdgeMouseHandler<WorkflowCanvasEdgeType>>(
    (event) => event.currentTarget.classList.add("edge-click-pulse"),
    []
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowCanvasNodeType>[]): void =>
      onMoveNodes(canvasPositionPatchesFromChanges(changes)),
    [onMoveNodes]
  );

  return (
    <section className="graph-stage" aria-label="Workflow infinite canvas">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={workflowNodeTypes}
          onConnect={onConnectNodes}
          onEdgesDelete={(deletedEdges) =>
            onDeleteEdges(edgeIdsFromDeletedCanvasEdges(deletedEdges))
          }
          onEdgeClick={handleEdgeClick}
          onNodeClick={handleNodeClick}
          onNodesChange={handleNodesChange}
          fitView
          fitViewOptions={{ padding: 0.24, maxZoom: 1.1 }}
          minZoom={0.2}
          maxZoom={1.8}
          snapToGrid
          snapGrid={[24, 24]}
          connectionMode={ConnectionMode.Loose}
          panOnScroll
          selectionOnDrag
          multiSelectionKeyCode="Shift"
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <Background color="#d8d0c3" gap={24} size={1} />
          <MiniMap
            className="workflow-minimap"
            pannable
            zoomable
            nodeColor={(node) => nodeColorForCanvasNode(state.nodes, node)}
          />
          <Controls position="bottom-left" showInteractive={false} />
          <Panel className="canvas-status-panel" position="top-left">
            <span>Canvas</span>
            <strong>{state.nodes.length} steps</strong>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </section>
  );
};

interface WorkflowLibraryProps {
  readonly categoryNavItems: ReadonlyArray<WorkflowCategoryNavItem>;
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly libraryNavItems: ReadonlyArray<WorkflowLibraryNavItem>;
  readonly selectedDirectoryRow: WorkflowDirectoryRow;
  readonly selectedWorkflowId: string | undefined;
  readonly searchQuery: string;
  readonly totalWorkflowCount: number;
  readonly workflows: ReadonlyArray<WorkflowDirectoryRow>;
  readonly onCreateWorkflow: () => void;
  readonly onClearWorkflowFilters: () => void;
  readonly onEditWorkflow: (workflowId: string) => void;
  readonly onOpenWorkflowRuns: (workflowId: string) => void;
  readonly onOpenWorkflowSettings: (workflowId: string) => void;
  readonly onRequestWorkflowRun: (workflowId: string) => void;
  readonly onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onSelectWorkflow: (workflow: WorkflowDirectoryRow) => void;
}

interface WorkflowReviewPanelProps {
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly selectedDirectoryRow: WorkflowDirectoryRow;
  readonly onEditWorkflow: (workflowId: string) => void;
  readonly onOpenWorkflowRuns: (workflowId: string) => void;
  readonly onRequestWorkflowRun: (workflowId: string) => void;
}

const latestRunStatusLabel: Record<WorkflowDirectoryRunStatus, string> = {
  successful: "Successful",
  failed: "Failed",
  running: "Running",
  never: "Never run",
};

const WorkflowReviewPanel = ({
  diagnostics,
  onEditWorkflow,
  onOpenWorkflowRuns,
  onRequestWorkflowRun,
  selectedDirectoryRow,
}: WorkflowReviewPanelProps): ReactElement => {
  const successRateLabel =
    selectedDirectoryRow.successRate === undefined
      ? "Not available"
      : `${selectedDirectoryRow.successRate}%`;
  const reviewQueueItems = diagnostics.slice(0, 3);
  const reviewQueueCountLabel = `${diagnostics.length} ${
    diagnostics.length === 1 ? "item" : "items"
  }`;

  return (
    <aside className="workflow-review-panel" aria-label="Selected workflow review">
      <div className="workflow-review-topline">
        <span>{selectedDirectoryRow.workflowName.toUpperCase()}</span>
        <div>
          <Button type="button" variant="ghost" size="icon" aria-label="Favorite workflow">
            <Star aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Close workflow details">
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="workflow-review-header">
        <h2>{selectedDirectoryRow.workflowName}</h2>
        <p>{selectedDirectoryRow.description}</p>
      </div>

      <section className="workflow-next-action" aria-label="Next workflow action">
        <span>NEXT ACTION</span>
        <div className="workflow-action-split">
          <Button
            type="button"
            className="workflow-run-button"
            onClick={() => onRequestWorkflowRun(selectedDirectoryRow.workflowId)}
          >
            <Play aria-hidden="true" />
            Run workflow
          </Button>
          <Button
            type="button"
            className="workflow-run-chevron"
            aria-label="Run workflow options"
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="workflow-edit-button"
          aria-label={`Edit workflow ${selectedDirectoryRow.workflowName}`}
          onClick={() => onEditWorkflow(selectedDirectoryRow.workflowId)}
        >
          <Pencil aria-hidden="true" />
          Edit workflow
        </Button>
      </section>

      <section className="workflow-latest-run" aria-label="Latest run">
        <div className="panel-heading">
          <h2>LATEST RUN</h2>
          <Button
            type="button"
            variant="link"
            onClick={() => onOpenWorkflowRuns(selectedDirectoryRow.workflowId)}
          >
            View all runs
          </Button>
        </div>
        <div className={["latest-run-card", selectedDirectoryRow.lastRunStatus].join(" ")}>
          <div>
            <span>
              <CheckCircle2 aria-hidden="true" />
              {latestRunStatusLabel[selectedDirectoryRow.lastRunStatus]}
            </span>
            <strong>{selectedDirectoryRow.lastRun}</strong>
          </div>
          <small>{successRateLabel}</small>
        </div>
        <dl className="workflow-run-summary">
          <div>
            <dt>Duration</dt>
            <dd>{selectedDirectoryRow.latestRunDuration}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>Local draft</dd>
          </div>
          <div>
            <dt>Triggered by</dt>
            <dd>{selectedDirectoryRow.ownerName}</dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="link"
          className="workflow-run-detail-link"
          onClick={() => onOpenWorkflowRuns(selectedDirectoryRow.workflowId)}
        >
          View run details
          <ExternalLink aria-hidden="true" />
        </Button>
      </section>

      <section className="workflow-review-issues" aria-label="Workflow review issues">
        <div className="panel-heading">
          <h2>REVIEW QUEUE</h2>
          <span>{reviewQueueCountLabel}</span>
        </div>
        {reviewQueueItems.length === 0 ? (
          <p className="review-queue-empty">No pending review items.</p>
        ) : (
          <div className="review-queue-list">
            {reviewQueueItems.map((diagnostic) => (
              <div key={diagnostic.id}>
                <strong>{diagnostic.title}</strong>
                <span>{workflowDiagnosticSeverityLabels[diagnostic.severity]}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="link"
          className="workflow-run-detail-link"
          onClick={() => onEditWorkflow(selectedDirectoryRow.workflowId)}
        >
          Go to review queue
          <ExternalLink aria-hidden="true" />
        </Button>
      </section>
    </aside>
  );
};

interface WorkflowLibrarySidebarProps {
  readonly categoryNavItems: ReadonlyArray<WorkflowCategoryNavItem>;
  readonly filtersAreActive: boolean;
  readonly libraryNavItems: ReadonlyArray<WorkflowLibraryNavItem>;
  readonly searchQuery: string;
  readonly onClearWorkflowFilters: () => void;
  readonly onCreateWorkflow: () => void;
  readonly onSearchQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const WorkflowLibraryNavButton = ({
  item,
}: {
  readonly item: WorkflowLibraryNavItem;
}): ReactElement => {
  const Icon = item.icon;

  return (
    <Button
      type="button"
      variant="ghost"
      className={["workflow-library-nav-button", item.selected ? "selected" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={item.selected === true}
    >
      <span>
        <Icon aria-hidden="true" />
        {item.label}
      </span>
      <strong>{item.count}</strong>
    </Button>
  );
};

const WorkflowCategoryNavButton = ({
  item,
}: {
  readonly item: WorkflowCategoryNavItem;
}): ReactElement => {
  const Icon = item.icon;

  return (
    <Button type="button" variant="ghost" className="workflow-library-nav-button">
      <span>
        <Icon aria-hidden="true" />
        {item.label}
      </span>
      <strong>{item.count}</strong>
    </Button>
  );
};

const WorkflowLibrarySidebar = ({
  categoryNavItems,
  filtersAreActive,
  libraryNavItems,
  onClearWorkflowFilters,
  onCreateWorkflow,
  onSearchQueryChange,
  searchQuery,
}: WorkflowLibrarySidebarProps): ReactElement => (
  <Card role="complementary" className="workflow-library-sidebar" aria-label="Workflow filters">
    <CardHeader className="workflow-list-header">
      <CardTitle>Workflows</CardTitle>
      <Button type="button" onClick={onCreateWorkflow} aria-label="New workflow">
        <Plus aria-hidden="true" />
        New workflow
      </Button>
    </CardHeader>

    <CardContent className="workflow-library-sidebar-content">
      <div className="workflow-search-row" aria-label="Workflow list search">
        <label className="sr-only" htmlFor="workflow-search">
          Search
        </label>
        <div className="workflow-search-control">
          <Search aria-hidden="true" />
          <Input
            id="workflow-search"
            value={searchQuery}
            onChange={onSearchQueryChange}
            placeholder="Filter workflows..."
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Filter workflows"
          onClick={onClearWorkflowFilters}
          disabled={!filtersAreActive}
        >
          <Filter aria-hidden="true" />
        </Button>
      </div>

      <div className="workflow-library-nav" aria-label="Workflow library sections">
        {libraryNavItems.map((item) => (
          <WorkflowLibraryNavButton key={item.label} item={item} />
        ))}
      </div>

      <Separator />

      <div className="workflow-category-heading">
        <span>CATEGORIES</span>
        <Button type="button" variant="link">
          Manage
        </Button>
      </div>
      <div className="workflow-library-nav" aria-label="Workflow categories">
        {categoryNavItems.map((item) => (
          <WorkflowCategoryNavButton key={item.label} item={item} />
        ))}
      </div>

      <section className="workflow-sidebar-tip" aria-label="Workflow inspiration">
        <span>Explore templates</span>
        <strong>Start faster with proven operations flows.</strong>
        <Button type="button" variant="outline" size="sm">
          Browse
        </Button>
      </section>
    </CardContent>
  </Card>
);

const WorkflowTableHeading = (): ReactElement => (
  <CardHeader className="workflow-table-heading">
    <CardTitle>All Workflows</CardTitle>
    <div className="workflow-table-controls">
      <Button type="button" variant="outline" size="sm">
        <Columns3 aria-hidden="true" />
        Columns
      </Button>
      <Button type="button" variant="outline" size="sm">
        Sort: Updated (newest)
        <ChevronDown aria-hidden="true" />
      </Button>
    </div>
  </CardHeader>
);

interface WorkflowFilterNoticeProps {
  readonly onClearWorkflowFilters: () => void;
}

const WorkflowFilterNotice = ({
  onClearWorkflowFilters,
}: WorkflowFilterNoticeProps): ReactElement => (
  <div className="workflow-filter-notice" role="status">
    <span>Selected workflow is outside this filtered list.</span>
    <button type="button" className="compact-button" onClick={onClearWorkflowFilters}>
      Show selected
    </button>
  </div>
);

interface WorkflowEmptyStateProps {
  readonly filtersAreActive: boolean;
  readonly onClearWorkflowFilters: () => void;
  readonly onCreateWorkflow: () => void;
}

const WorkflowEmptyState = ({
  filtersAreActive,
  onClearWorkflowFilters,
  onCreateWorkflow,
}: WorkflowEmptyStateProps): ReactElement => (
  <div className="workflow-empty-state">
    <strong>No workflows match this view.</strong>
    <span>Clear the filters or start a new workflow draft.</span>
    <div>
      <button type="button" className="compact-button primary" onClick={onCreateWorkflow}>
        New workflow
      </button>
      <button
        type="button"
        className="compact-button"
        disabled={!filtersAreActive}
        onClick={onClearWorkflowFilters}
      >
        Clear filters
      </button>
    </div>
  </div>
);

interface WorkflowTableRowProps {
  readonly selectedDirectoryRowId: string;
  readonly selectedWorkflowId: string | undefined;
  readonly workflow: WorkflowDirectoryRow;
  readonly onOpenWorkflowSettings: (workflowId: string) => void;
  readonly onSelectWorkflow: (workflow: WorkflowDirectoryRow) => void;
}

const workflowRunStatusClass = (status: WorkflowDirectoryRunStatus): string =>
  status === "failed" ? "failed" : status === "never" ? "muted" : "successful";

const WorkflowCategoryBadge = ({
  workflow,
}: {
  readonly workflow: WorkflowDirectoryRow;
}): ReactElement => (
  <Badge className={["workflow-category-badge", workflow.categoryTone].join(" ")}>
    {workflow.category}
  </Badge>
);

const WorkflowOwnerCell = ({
  workflow,
}: {
  readonly workflow: WorkflowDirectoryRow;
}): ReactElement => (
  <div className="workflow-owner-cell">
    <span>{workflow.ownerInitials}</span>
    <strong>{workflow.ownerName}</strong>
  </div>
);

const WorkflowSuccessRate = ({
  workflow,
}: {
  readonly workflow: WorkflowDirectoryRow;
}): ReactElement =>
  workflow.successRate === undefined ? (
    <span className="workflow-success-empty">-</span>
  ) : (
    <div className="workflow-success-rate">
      <span>{workflow.successRate}%</span>
      <div aria-hidden="true">
        <strong style={{ width: `${workflow.successRate}%` }} />
      </div>
    </div>
  );

const WorkflowTableRow = ({
  onOpenWorkflowSettings,
  onSelectWorkflow,
  selectedDirectoryRowId,
  selectedWorkflowId,
  workflow,
}: WorkflowTableRowProps): ReactElement => (
  <TableRow
    className={[
      "workflow-table-row",
      workflow.id === selectedDirectoryRowId && workflow.workflowId === selectedWorkflowId
        ? "selected"
        : "",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    <TableCell className="workflow-name-cell">
      <Button
        type="button"
        variant="ghost"
        className="workflow-row-main"
        aria-pressed={workflow.id === selectedDirectoryRowId}
        aria-label={`Select workflow ${workflow.workflowName}`}
        onClick={() => onSelectWorkflow(workflow)}
      >
        <span>
          <strong>{workflow.workflowName}</strong>
          {workflow.favorite ? <Star aria-hidden="true" /> : null}
        </span>
        <small>{workflow.description}</small>
      </Button>
    </TableCell>
    <TableCell>
      <WorkflowCategoryBadge workflow={workflow} />
    </TableCell>
    <TableCell>
      <WorkflowOwnerCell workflow={workflow} />
    </TableCell>
    <TableCell>
      <div className={["workflow-last-run", workflowRunStatusClass(workflow.lastRunStatus)].join(" ")}>
        <span>{latestRunStatusLabel[workflow.lastRunStatus]}</span>
        <strong>{workflow.lastRun}</strong>
      </div>
    </TableCell>
    <TableCell>
      <WorkflowSuccessRate workflow={workflow} />
    </TableCell>
    <TableCell>{workflow.updatedAt}</TableCell>
    <TableCell>
      <div className="workflow-row-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Open workflow menu ${workflow.workflowName}`}
          onClick={() => onOpenWorkflowSettings(workflow.workflowId)}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </div>
    </TableCell>
  </TableRow>
);

interface WorkflowTableProps {
  readonly filtersAreActive: boolean;
  readonly selectedDirectoryRowId: string;
  readonly selectedWorkflowId: string | undefined;
  readonly totalWorkflowCount: number;
  readonly workflows: ReadonlyArray<WorkflowDirectoryRow>;
  readonly onClearWorkflowFilters: () => void;
  readonly onCreateWorkflow: () => void;
  readonly onOpenWorkflowSettings: (workflowId: string) => void;
  readonly onSelectWorkflow: (workflow: WorkflowDirectoryRow) => void;
}

const WorkflowTable = ({
  filtersAreActive,
  onClearWorkflowFilters,
  onCreateWorkflow,
  onOpenWorkflowSettings,
  onSelectWorkflow,
  selectedDirectoryRowId,
  selectedWorkflowId,
  totalWorkflowCount,
  workflows,
}: WorkflowTableProps): ReactElement => (
  <div className="workflow-table" aria-label="Saved workflows">
    {workflows.length === 0 ? (
      <WorkflowEmptyState
        filtersAreActive={filtersAreActive}
        onClearWorkflowFilters={onClearWorkflowFilters}
        onCreateWorkflow={onCreateWorkflow}
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Success rate</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.map((workflow) => (
            <WorkflowTableRow
              key={workflow.id}
              workflow={workflow}
              selectedDirectoryRowId={selectedDirectoryRowId}
              selectedWorkflowId={selectedWorkflowId}
              onSelectWorkflow={onSelectWorkflow}
              onOpenWorkflowSettings={onOpenWorkflowSettings}
            />
          ))}
        </TableBody>
      </Table>
    )}
    {workflows.length > 0 ? (
      <div className="workflow-table-footer">
        <span>
          Showing 1 to {workflows.length} of {totalWorkflowCount} workflows
        </span>
        <div>
          <Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled>
            <ChevronDown aria-hidden="true" />
          </Button>
          <Button type="button" variant="secondary" size="sm">
            1
          </Button>
          <Button type="button" variant="ghost" size="sm">
            2
          </Button>
          <Button type="button" variant="ghost" size="sm">
            3
          </Button>
          <span>...</span>
          <Button type="button" variant="ghost" size="sm">
            13
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Next page">
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </div>
    ) : null}
  </div>
);

const WorkflowListPage = ({
  categoryNavItems,
  diagnostics,
  libraryNavItems,
  onClearWorkflowFilters,
  onCreateWorkflow,
  onEditWorkflow,
  onOpenWorkflowRuns,
  onOpenWorkflowSettings,
  onRequestWorkflowRun,
  onSearchQueryChange,
  onSelectWorkflow,
  searchQuery,
  selectedDirectoryRow,
  selectedWorkflowId,
  totalWorkflowCount,
  workflows,
}: WorkflowLibraryProps): ReactElement => {
  const selectedWorkflowIsVisible = workflows.some(
    (workflow) => workflow.id === selectedDirectoryRow.id
  );
  const filtersAreActive = searchQuery.trim().length > 0;

  return (
    <section className="workflow-list-page" aria-label="Workflow list page">
      <WorkflowLibrarySidebar
        categoryNavItems={categoryNavItems}
        filtersAreActive={filtersAreActive}
        libraryNavItems={libraryNavItems}
        searchQuery={searchQuery}
        onClearWorkflowFilters={onClearWorkflowFilters}
        onCreateWorkflow={onCreateWorkflow}
        onSearchQueryChange={onSearchQueryChange}
      />

      <Card className="workflow-list-main">
        <WorkflowTableHeading />
        {!selectedWorkflowIsVisible && workflows.length > 0 ? (
          <WorkflowFilterNotice onClearWorkflowFilters={onClearWorkflowFilters} />
        ) : null}

        <CardContent className="workflow-table-content">
          <WorkflowTable
            filtersAreActive={filtersAreActive}
            workflows={workflows}
            selectedDirectoryRowId={selectedDirectoryRow.id}
            selectedWorkflowId={selectedWorkflowId}
            totalWorkflowCount={totalWorkflowCount}
            onClearWorkflowFilters={onClearWorkflowFilters}
            onCreateWorkflow={onCreateWorkflow}
            onOpenWorkflowSettings={onOpenWorkflowSettings}
            onSelectWorkflow={onSelectWorkflow}
          />
        </CardContent>
      </Card>
      <WorkflowReviewPanel
        diagnostics={diagnostics}
        selectedDirectoryRow={selectedDirectoryRow}
        onEditWorkflow={onEditWorkflow}
        onOpenWorkflowRuns={onOpenWorkflowRuns}
        onRequestWorkflowRun={onRequestWorkflowRun}
      />
    </section>
  );
};

interface NodeListProps {
  readonly nodes: ReadonlyArray<WorkflowNode>;
  readonly edges: ReadonlyArray<WorkflowEdge>;
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly selectedNodeId: string | undefined;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onAddNode: () => void;
  readonly onDisconnectEdge: (edgeId: string) => void;
}

const NodeList = ({
  diagnostics,
  edges,
  nodes,
  selectedNodeId,
  onAddNode,
  onDisconnectEdge,
  onSelectNode,
}: NodeListProps): ReactElement => (
  <aside className="ops-panel node-list" aria-label="Workflow nodes">
    <div className="panel-heading">
      <h2>Steps</h2>
      <button type="button" className="compact-button" onClick={onAddNode}>
        Add next step
      </button>
    </div>
    <div className="node-list-items">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={["node-list-item", node.id === selectedNodeId ? "selected" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={node.id === selectedNodeId}
          aria-label={`Open ${node.title}`}
          onClick={() => onSelectNode(node.id)}
        >
          <span>{nodeKindLabels[node.kind]}</span>
          <strong>{node.title}</strong>
          <small>{nodeStatusLabels[node.status]}</small>
        </button>
      ))}
    </div>

    <details className="connections-panel">
      <summary>Connections</summary>
      <div className="edge-list" aria-label="Connected edges">
        {edges.length === 0 ? (
          <p className="diagnostic-empty">No connections yet.</p>
        ) : (
          edges.map((edge) => (
            <div key={edge.id} className="edge-row">
              <button
                type="button"
                className="edge-open-button"
                onClick={() => onSelectNode(edge.source)}
                aria-label={`Open edge ${nodeTitleFor(nodes, edge.source)} to ${nodeTitleFor(nodes, edge.target)}`}
              >
                <strong>{nodeTitleFor(nodes, edge.source)}</strong>
                <span>{edge.label}</span>
                <strong>{nodeTitleFor(nodes, edge.target)}</strong>
              </button>
              <button
                type="button"
                className="edge-remove-button"
                onClick={() => onDisconnectEdge(edge.id)}
                aria-label={`Disconnect ${nodeTitleFor(nodes, edge.source)} to ${nodeTitleFor(nodes, edge.target)}`}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </details>
    <section className="diagnostics-section" aria-label="Workflow diagnostics">
      <div className="panel-heading">
        <h2>Review</h2>
        <span
          className={[
            "state-pill",
            diagnostics.some((diagnostic) => diagnostic.severity === "critical")
              ? "status-failed"
              : diagnostics.length > 0
                ? "status-draft"
                : "status-ready",
          ].join(" ")}
        >
          {diagnostics.length}
        </span>
      </div>
      {diagnostics.length === 0 ? (
        <p className="diagnostic-empty">Ready to test.</p>
      ) : (
        <div className="diagnostic-list">
          {diagnostics.map((diagnostic) => {
            const targetNodeId = diagnostic.nodeIds.find((nodeId) =>
              nodes.some((node) => node.id === nodeId)
            );

            return (
              <button
                key={diagnostic.id}
                type="button"
                className={["diagnostic-row", diagnostic.severity].join(" ")}
                disabled={targetNodeId === undefined}
                onClick={() =>
                  targetNodeId === undefined ? undefined : onSelectNode(targetNodeId)
                }
                aria-label={`Open diagnostic ${diagnostic.title}`}
              >
                <span>{workflowDiagnosticSeverityLabels[diagnostic.severity]}</span>
                <strong>{diagnostic.title}</strong>
                <small>{diagnostic.detail}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  </aside>
);

interface WorkflowReadinessProps {
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly summary: OpsSummary;
}

const readinessStatusFor = (
  summary: OpsSummary
): { readonly className: string; readonly label: string } =>
  summary.criticalDiagnostics > 0
    ? { className: "status-failed", label: "Fix required" }
    : summary.warningDiagnostics > 0
      ? { className: "status-draft", label: "Needs review" }
      : { className: "status-ready", label: "Ready to test" };

const nextReadinessActionFor = (diagnostics: ReadonlyArray<WorkflowDiagnostic>): string =>
  diagnostics[0]?.title ?? "Every required step is connected and ready.";

const WorkflowReadiness = ({ diagnostics, summary }: WorkflowReadinessProps): ReactElement => {
  const status = readinessStatusFor(summary);

  return (
    <section className="readiness-card" aria-label="Workflow readiness">
      <div className="panel-heading">
        <h2>Readiness</h2>
        <span className={["state-pill", status.className].join(" ")}>{status.label}</span>
      </div>
      <p>{nextReadinessActionFor(diagnostics)}</p>
    </section>
  );
};

interface NodeInspectorProps {
  readonly node: WorkflowNode;
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly summary: OpsSummary;
  readonly onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onModelChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPolicyChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onStepSystemPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onKindChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onStatusChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

const NodeInspector = ({
  diagnostics,
  node,
  summary,
  onAgentChange,
  onKindChange,
  onModelChange,
  onPolicyChange,
  onStatusChange,
  onStepSystemPromptChange,
  onTitleChange,
}: NodeInspectorProps): ReactElement => (
  <aside className="ops-panel inspector-panel" aria-label="Node inspector">
    <div className="panel-heading">
      <h2>Step details</h2>
      <span className={["state-pill", statusClass(node.status)].join(" ")}>
        {nodeStatusLabels[node.status]}
      </span>
    </div>

    <label>
      Step name
      <input value={node.title} onChange={onTitleChange} />
    </label>
    <label>
      Type
      <select value={node.kind} onChange={onKindChange}>
        {workflowNodeKinds.map((kind) => (
          <option key={kind} value={kind}>
            {nodeKindLabels[kind]}
          </option>
        ))}
      </select>
    </label>
    <label>
      State
      <select value={node.status} onChange={onStatusChange}>
        {workflowNodeStatuses.map((status) => (
          <option key={status} value={status}>
            {nodeStatusLabels[status]}
          </option>
        ))}
      </select>
    </label>

    <details className="advanced-panel">
      <summary>Advanced setup</summary>
      <label>
        Agent
        <input value={node.agent} onChange={onAgentChange} />
      </label>
      <label>
        Model
        <input value={node.model} onChange={onModelChange} />
      </label>
      <label>
        Policy
        <input value={node.policy} onChange={onPolicyChange} />
      </label>
      <label>
        Step instructions
        <textarea value={node.systemPrompt} onChange={onStepSystemPromptChange} rows={7} />
      </label>
    </details>

    <WorkflowReadiness diagnostics={diagnostics} summary={summary} />
  </aside>
);

interface InstructionsPageProps {
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly selectedWorkflow: WorkflowRecord;
  readonly summary: OpsSummary;
  readonly onDescriptionChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

const InstructionsPage = ({
  diagnostics,
  onDescriptionChange,
  onNameChange,
  onPromptChange,
  selectedWorkflow,
  summary,
}: InstructionsPageProps): ReactElement => (
  <section className="ops-page-grid instructions-page" aria-label="Workflow instructions page">
    <section className="ops-panel inspector-panel instructions-editor">
      <div className="panel-heading">
        <h2>Workflow identity</h2>
        <span className="state-pill status-ready">Draft</span>
      </div>
      <label>
        Workflow name
        <input value={selectedWorkflow.state.workflowName} onChange={onNameChange} />
      </label>
      <label>
        Description
        <input value={selectedWorkflow.description} onChange={onDescriptionChange} />
      </label>
      <label>
        Instructions
        <textarea value={selectedWorkflow.state.systemPrompt} onChange={onPromptChange} rows={15} />
      </label>
    </section>
    <aside className="ops-panel instructions-validation" aria-label="Instructions validation">
      <WorkflowReadiness diagnostics={diagnostics} summary={summary} />
      <section className="instruction-coverage" aria-label="Step instruction coverage">
        <div className="panel-heading">
          <h2>Step coverage</h2>
          <span className="state-pill">{selectedWorkflow.state.nodes.length}</span>
        </div>
        <div className="coverage-list">
          {selectedWorkflow.state.nodes.map((node) => (
            <div key={node.id} className="coverage-row">
              <strong>{node.title}</strong>
              <span>{node.systemPrompt.trim().length > 0 ? "Present" : "Missing"}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="validation-list" aria-label="Workflow validation issues">
        <div className="panel-heading">
          <h2>Validation</h2>
          <span className="state-pill">{diagnostics.length}</span>
        </div>
        {diagnostics.length === 0 ? (
          <p className="diagnostic-empty">Instructions are ready for a test run.</p>
        ) : (
          <div className="diagnostic-list">
            {diagnostics.map((diagnostic) => (
              <div
                key={diagnostic.id}
                className={["diagnostic-row", diagnostic.severity].join(" ")}
              >
                <span>{workflowDiagnosticSeverityLabels[diagnostic.severity]}</span>
                <strong>{diagnostic.title}</strong>
                <small>{diagnostic.detail}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  </section>
);

interface RunHistoryPanelProps {
  readonly nodes: ReadonlyArray<WorkflowNode>;
  readonly runs: ReadonlyArray<ExecutionRun>;
  readonly selectedRun: ExecutionRun;
  readonly onCreateRun: (submission: ExecutionRunSubmission) => void;
  readonly onOpenNodeInBuilder: (nodeId: string) => void;
  readonly onSelectRun: (runId: string) => void;
}

const RunHistoryPanel = ({
  nodes,
  onCreateRun,
  onOpenNodeInBuilder,
  onSelectRun,
  runs,
  selectedRun,
}: RunHistoryPanelProps): ReactElement => {
  const [traceFilter, setTraceFilter] = useState<TraceFilter>("all");
  const [runInputPrompt, setRunInputPrompt] = useState("");
  const [runInputPayload, setRunInputPayload] = useState("");
  const [runInputTouched, setRunInputTouched] = useState(false);
  const visibleSteps = useMemo(
    () => filterRunStepsByTraceFilter(selectedRun.steps, traceFilter),
    [selectedRun.steps, traceFilter]
  );
  const runInputPromptIsBlank = runInputPrompt.trim().length === 0;
  const runInputPromptError =
    runInputTouched && runInputPromptIsBlank ? "Add the operator request before running." : "";
  const handleTraceFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      setTraceFilter(parseTraceFilter(event.currentTarget.value)),
    []
  );
  const handleRunInputPromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setRunInputPrompt(event.currentTarget.value),
    []
  );
  const handleRunInputPayloadChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setRunInputPayload(event.currentTarget.value),
    []
  );
  const handleRunSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      setRunInputTouched(true);

      if (!runInputPromptIsBlank) {
        onCreateRun({
          inputPrompt: runInputPrompt,
          inputPayload: runInputPayload,
          startedAt: new Date().toISOString(),
        });
        setRunInputPrompt("");
        setRunInputPayload("");
        setRunInputTouched(false);
      }
    },
    [onCreateRun, runInputPayload, runInputPrompt, runInputPromptIsBlank]
  );
  const handleCopyRawTrace = useCallback((rawTrace: string): void => {
    void navigator.clipboard?.writeText(rawTrace);
  }, []);
  const highlightedTraceStep = firstTraceStepForRun(selectedRun);

  return (
    <section className="runs-page" aria-label="Execution history">
      <aside className="ops-panel run-setup-panel">
        <form className="run-composer" aria-label="Run request" onSubmit={handleRunSubmit}>
          <div className="panel-heading">
            <h2>Run workflow</h2>
            <span className="state-pill">Prompt required</span>
          </div>
          <label>
            Operator request
            <textarea
              value={runInputPrompt}
              onBlur={() => setRunInputTouched(true)}
              onChange={handleRunInputPromptChange}
              placeholder="Describe what this workflow should process in this run."
              rows={4}
            />
          </label>
          {runInputPromptError.length === 0 ? (
            <p className="run-composer-help">
              This prompt is stored with the run and passed into the input step.
            </p>
          ) : (
            <p className="run-composer-error">{runInputPromptError}</p>
          )}
          <label>
            Context payload
            <textarea
              value={runInputPayload}
              onChange={handleRunInputPayloadChange}
              placeholder='Optional JSON or notes, for example {"ticket":"OPS-42"}.'
              rows={3}
            />
          </label>
          <button type="submit" className="compact-button primary" disabled={runInputPromptIsBlank}>
            Run workflow
          </button>
        </form>
      </aside>

      <section className="ops-panel run-history-panel">
        <div className="panel-heading">
          <h2>Run history</h2>
          <span className={["state-pill", statusClass(selectedRun.status)].join(" ")}>
            {runStatusLabels[selectedRun.status]}
          </span>
        </div>
        <div className="run-list">
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className={[
                "run-row",
                run.id === selectedRun.id ? "selected" : "",
                statusClass(run.status),
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={run.id === selectedRun.id}
              onClick={() => onSelectRun(run.id)}
            >
              <strong>{run.workflowName}</strong>
              <span>{run.id}</span>
              <small>{formatDuration(run.durationMs)}</small>
            </button>
          ))}
        </div>

        <section className="run-timeline-section" aria-label="Selected run steps">
          <div className="run-detail-heading">
            <h3>{selectedRun.id}</h3>
            <span>
              {visibleSteps.length}/{selectedRun.steps.length} steps
            </span>
          </div>
          <label className="trace-filter-control">
            Trace filter
            <select value={traceFilter} onChange={handleTraceFilterChange}>
              {traceFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {traceFilterLabels[filter]}
                </option>
              ))}
            </select>
          </label>
          <div className="step-list">
            {visibleSteps.length === 0 ? (
              <p className="empty-trace-filter">No matching trace steps.</p>
            ) : (
              visibleSteps.map((step) => {
                const nodeId = nodeIdForRunStepTitle(nodes, step.title);
                const stepClassName = ["step-row", statusClass(step.status)].join(" ");
                const stepContent = (
                  <>
                    <span>{runStepStatusLabels[step.status]}</span>
                    <strong>{step.title}</strong>
                    <small>{formatDuration(step.durationMs)}</small>
                  </>
                );

                return (
                  <div key={step.id} className="step-item">
                    {nodeId === undefined ? (
                      <div className={stepClassName}>{stepContent}</div>
                    ) : (
                      <button
                        type="button"
                        className={stepClassName}
                        aria-label={`Open ${step.title}`}
                        onClick={() => onOpenNodeInBuilder(nodeId)}
                      >
                        {stepContent}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </section>

      <aside className="ops-panel run-detail-panel" aria-label="Selected run detail">
        <section className="run-request-card" aria-label="Selected run request">
          <span>Operator request</span>
          <p>
            {selectedRun.inputPrompt.trim().length === 0
              ? "No operator request recorded for this run."
              : selectedRun.inputPrompt}
          </p>
          {selectedRun.inputPayload.trim().length === 0 ? (
            <small>No context payload.</small>
          ) : (
            <pre>{selectedRun.inputPayload}</pre>
          )}
        </section>
        <section className="run-trace-panel" aria-label="Selected run trace summary">
          <div className="panel-heading">
            <h2>Trace summary</h2>
            <span className="state-pill">
              {highlightedTraceStep === undefined ? "No trace" : "Trace captured"}
            </span>
          </div>
          {highlightedTraceStep?.trace === undefined ? (
            <p className="diagnostic-empty">
              Select a traced step or run with captured execution data.
            </p>
          ) : (
            <TraceSummary
              exportFilename={traceExportFilenameForStep(selectedRun.id, highlightedTraceStep)}
              onCopyRawTrace={handleCopyRawTrace}
              rawTrace={serializeTraceForInspection(selectedRun, highlightedTraceStep)}
              severity={getTraceSeverity(highlightedTraceStep.trace)}
              trace={highlightedTraceStep.trace}
            />
          )}
        </section>
      </aside>
    </section>
  );
};

interface BuilderPageProps {
  readonly diagnostics: ReadonlyArray<WorkflowDiagnostic>;
  readonly selectedNode: WorkflowNode;
  readonly selectedWorkflow: WorkflowRecord;
  readonly state: OpsWorkbenchState;
  readonly summary: OpsSummary;
  readonly onAddNode: () => void;
  readonly onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onCanvasConnect: (connection: Connection) => void;
  readonly onCanvasEdgeDelete: (edgeIds: ReadonlyArray<string>) => void;
  readonly onCanvasNodeMove: (patches: ReadonlyArray<WorkflowNodePositionPatch>) => void;
  readonly onDisconnectEdge: (edgeId: string) => void;
  readonly onKindChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onModelChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onOpenInstructions: (workflowId: string) => void;
  readonly onOpenRuns: (workflowId: string) => void;
  readonly onOpenSettings: (workflowId: string) => void;
  readonly onPolicyChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onStatusChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onStepSystemPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const BuilderPage = ({
  diagnostics,
  onAddNode,
  onAgentChange,
  onCanvasConnect,
  onCanvasEdgeDelete,
  onCanvasNodeMove,
  onDisconnectEdge,
  onKindChange,
  onModelChange,
  onOpenInstructions,
  onOpenRuns,
  onOpenSettings,
  onPolicyChange,
  onSelectNode,
  onStatusChange,
  onStepSystemPromptChange,
  onTitleChange,
  selectedNode,
  selectedWorkflow,
  state,
  summary,
}: BuilderPageProps): ReactElement => {
  const readiness = readinessStatusFor(summary);

  return (
    <section className="builder-page" aria-label="Workflow builder page">
      <div className="page-actionbar">
        <div>
          <span>Builder</span>
          <strong>{state.workflowName}</strong>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="compact-button"
            onClick={() => onOpenInstructions(selectedWorkflow.id)}
          >
            Instructions
          </button>
          <button
            type="button"
            className="compact-button"
            onClick={() => onOpenSettings(selectedWorkflow.id)}
          >
            Settings
          </button>
          <button
            type="button"
            className="compact-button primary"
            onClick={() => onOpenRuns(selectedWorkflow.id)}
          >
            Run test
          </button>
        </div>
      </div>
      <section className="ops-workbench">
        <NodeList
          nodes={state.nodes}
          edges={state.edges}
          diagnostics={diagnostics}
          selectedNodeId={state.selectedNodeId}
          onAddNode={onAddNode}
          onDisconnectEdge={onDisconnectEdge}
          onSelectNode={onSelectNode}
        />
        <WorkflowGraph
          state={state}
          onConnectNodes={onCanvasConnect}
          onDeleteEdges={onCanvasEdgeDelete}
          onMoveNodes={onCanvasNodeMove}
          onSelectNode={onSelectNode}
        />
        <NodeInspector
          node={selectedNode}
          diagnostics={diagnostics}
          summary={summary}
          onAgentChange={onAgentChange}
          onKindChange={onKindChange}
          onModelChange={onModelChange}
          onPolicyChange={onPolicyChange}
          onStepSystemPromptChange={onStepSystemPromptChange}
          onStatusChange={onStatusChange}
          onTitleChange={onTitleChange}
        />
      </section>
      <section className="readiness-strip" aria-label="Workflow readiness summary">
        <span className={["state-pill", readiness.className].join(" ")}>{readiness.label}</span>
        <strong>{nextReadinessActionFor(diagnostics)}</strong>
        <small>
          {summary.nodeCount} steps, {summary.edgeCount} connections,{" "}
          {summary.criticalDiagnostics + summary.warningDiagnostics} issues
        </small>
      </section>
    </section>
  );
};

interface SettingsPageProps {
  readonly selectedWorkflow: WorkflowRecord;
  readonly summary: OpsSummary;
  readonly onDescriptionChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const SettingsPage = ({
  onDescriptionChange,
  onNameChange,
  selectedWorkflow,
  summary,
}: SettingsPageProps): ReactElement => {
  const defaultModel =
    selectedWorkflow.state.nodes.find((node) => node.model !== "rule")?.model ??
    selectedWorkflow.state.nodes[0]?.model ??
    "rule";
  const defaultPolicy =
    selectedWorkflow.state.nodes.find((node) => node.policy.length > 0)?.policy ?? "none";

  return (
    <section className="ops-page-grid settings-page" aria-label="Workflow settings page">
      <section className="ops-panel inspector-panel">
        <div className="panel-heading">
          <h2>Metadata</h2>
          <span className="state-pill">{summary.nodeCount} steps</span>
        </div>
        <label>
          Workflow name
          <input value={selectedWorkflow.state.workflowName} onChange={onNameChange} />
        </label>
        <label>
          Description
          <input value={selectedWorkflow.description} onChange={onDescriptionChange} />
        </label>
        <div className="danger-zone" aria-label="Danger zone">
          <strong>Danger zone</strong>
          <div>
            <button type="button" className="compact-button" disabled>
              Archive workflow
            </button>
            <button type="button" className="compact-button" disabled>
              Delete workflow
            </button>
          </div>
        </div>
      </section>
      <aside className="ops-panel inspector-panel">
        <div className="panel-heading">
          <h2>Execution defaults</h2>
          <span className="state-pill status-ready">Local draft</span>
        </div>
        <label>
          Default model
          <input value={defaultModel} readOnly />
        </label>
        <label>
          Default policy
          <input value={defaultPolicy} readOnly />
        </label>
        <label>
          Timeout
          <input value="300s" readOnly />
        </label>
        <div className="settings-export" aria-label="Import and export">
          <button type="button" className="compact-button" disabled>
            Import YAML
          </button>
          <button type="button" className="compact-button" disabled>
            Export YAML
          </button>
        </div>
      </aside>
    </section>
  );
};

const defaultCreateWorkflowInput: WorkflowDraftInput = {
  workflowName: "New workflow",
  description: "New local workflow draft.",
  systemPrompt: "Operate this workflow with auditable decisions and clear handoffs.",
  firstStepTitle: "Start request",
};

interface WorkflowCreateDialogProps {
  readonly draftInput: WorkflowDraftInput;
  readonly nameError: string;
  readonly open: boolean;
  readonly onDraftInputChange: (patch: Partial<WorkflowDraftInput>) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const WorkflowCreateDialog = ({
  draftInput,
  nameError,
  onDraftInputChange,
  onOpenChange,
  onSubmit,
  open,
}: WorkflowCreateDialogProps): ReactElement => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="workflow-dialog-content">
      <DialogHeader>
        <DialogTitle>Create workflow</DialogTitle>
        <DialogDescription>
          Start with a name, workflow-level system prompt, and first step.
        </DialogDescription>
      </DialogHeader>
      <form className="workflow-dialog-form" aria-label="Create workflow" onSubmit={onSubmit}>
        <label>
          Workflow name
          <Input
            value={draftInput.workflowName}
            onChange={(event) =>
              onDraftInputChange({ workflowName: event.currentTarget.value })
            }
          />
        </label>
        {nameError.length === 0 ? null : <p className="workflow-dialog-error">{nameError}</p>}
        <label>
          Description
          <Input
            value={draftInput.description}
            onChange={(event) => onDraftInputChange({ description: event.currentTarget.value })}
          />
        </label>
        <label>
          System prompt
          <textarea
            value={draftInput.systemPrompt}
            onChange={(event) => onDraftInputChange({ systemPrompt: event.currentTarget.value })}
            rows={4}
          />
        </label>
        <label>
          First step
          <Input
            value={draftInput.firstStepTitle}
            onChange={(event) => onDraftInputChange({ firstStepTitle: event.currentTarget.value })}
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={draftInput.workflowName.trim().length === 0}>
            Create workflow
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);

interface RunWorkflowDialogProps {
  readonly inputPayload: string;
  readonly inputPrompt: string;
  readonly open: boolean;
  readonly promptError: string;
  readonly workflow: WorkflowRecord;
  readonly onInputPayloadChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onInputPromptBlur: () => void;
  readonly onInputPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const RunWorkflowDialog = ({
  inputPayload,
  inputPrompt,
  onInputPayloadChange,
  onInputPromptBlur,
  onInputPromptChange,
  onOpenChange,
  onSubmit,
  open,
  promptError,
  workflow,
}: RunWorkflowDialogProps): ReactElement => {
  const latestRun = latestRunForRecord(workflow);
  const latestRunLabel =
    latestRun === undefined
      ? "Never run"
      : `${runStatusLabels[latestRun.status]} - ${formatDateTimeLabel(latestRun.startedAt)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workflow-dialog-content workflow-run-dialog-content">
        <DialogHeader>
          <span className="workflow-dialog-eyebrow">Workflow run</span>
          <DialogTitle>Run {workflow.state.workflowName}</DialogTitle>
          <DialogDescription>
            Add the operator request that this execution should process.
          </DialogDescription>
        </DialogHeader>
        <div className="workflow-run-dialog-meta" aria-label="Run target">
          <div>
            <span>Target</span>
            <strong>{workflow.state.workflowName}</strong>
          </div>
          <div>
            <span>Steps</span>
            <strong>{workflow.state.nodes.length}</strong>
          </div>
          <div>
            <span>Last run</span>
            <strong>{latestRunLabel}</strong>
          </div>
        </div>
        <form
          className="workflow-dialog-form"
          aria-label="Run workflow request"
          onSubmit={onSubmit}
        >
          <label>
            Operator request
            <Textarea
              className="workflow-run-request-textarea"
              value={inputPrompt}
              onBlur={onInputPromptBlur}
              onChange={onInputPromptChange}
              placeholder="Describe the task this workflow should execute."
              rows={5}
            />
          </label>
          {promptError.length === 0 ? (
            <p className="workflow-dialog-help">
              The request is stored with the run and passed into the input step.
            </p>
          ) : (
            <p className="workflow-dialog-error">{promptError}</p>
          )}
          <label>
            Context payload
            <Textarea
              value={inputPayload}
              onChange={onInputPayloadChange}
              placeholder='Optional JSON or notes, for example {"ticket":"OPS-42"}.'
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inputPrompt.trim().length === 0}>
              Start run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const App = (): ReactElement => {
  const [route, setRoute] = useState<OpsRoute>(() => parseOpsRoute(window.location.hash));
  const [workspace, setWorkspace] = useState<OpsWorkspaceState>(initialOpsWorkspaceState);
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState("");
  const [selectedWorkflowDirectoryRowId, setSelectedWorkflowDirectoryRowId] = useState(
    initialOpsWorkspaceState.selectedWorkflowId ?? emptyWorkflowDirectoryRow.id
  );
  const [workflowCreateDialogOpen, setWorkflowCreateDialogOpen] = useState(false);
  const [workflowDraftInput, setWorkflowDraftInput] = useState<WorkflowDraftInput>(
    defaultCreateWorkflowInput
  );
  const [workflowDraftTouched, setWorkflowDraftTouched] = useState(false);
  const [runDialogWorkflowId, setRunDialogWorkflowId] = useState<string | undefined>(undefined);
  const [runDialogPrompt, setRunDialogPrompt] = useState("");
  const [runDialogPayload, setRunDialogPayload] = useState("");
  const [runDialogTouched, setRunDialogTouched] = useState(false);
  const selectedWorkflow = useMemo(() => getSelectedWorkflow(workspace), [workspace]);
  const workflowDirectoryRecords = useMemo(
    () => workflowDirectoryRowsFor(workspace.workflows),
    [workspace.workflows]
  );
  const workflowLibraryNavItems = useMemo(
    () => workflowLibraryNavItemsFor(workflowDirectoryRecords),
    [workflowDirectoryRecords]
  );
  const workflowCategoryNavItems = useMemo(
    () => workflowCategoryNavItemsFor(workflowDirectoryRecords),
    [workflowDirectoryRecords]
  );
  const filteredWorkflowDirectoryRecords = useMemo(
    () => visibleWorkflowDirectoryRows(workflowDirectoryRecords, workflowSearchQuery),
    [workflowDirectoryRecords, workflowSearchQuery]
  );
  const selectedWorkflowDirectoryRow = useMemo(
    () =>
      selectedWorkflowDirectoryRowFor(
        workflowDirectoryRecords,
        workspace.selectedWorkflowId,
        selectedWorkflowDirectoryRowId
      ),
    [selectedWorkflowDirectoryRowId, workflowDirectoryRecords, workspace.selectedWorkflowId]
  );
  const state = selectedWorkflow.state;
  const selectedNode = useMemo(() => getSelectedNode(state), [state]);
  const selectedRun = useMemo(() => getSelectedRun(state), [state]);
  const summary = useMemo(() => summarizeOpsState(state), [state]);
  const diagnostics = useMemo(() => getWorkflowDiagnostics(state), [state]);
  const runDialogWorkflow = useMemo(
    () =>
      workspace.workflows.find((workflow) => workflow.id === runDialogWorkflowId) ??
      selectedWorkflow,
    [runDialogWorkflowId, selectedWorkflow, workspace.workflows]
  );
  const workflowDraftNameError =
    workflowDraftTouched && workflowDraftInput.workflowName.trim().length === 0
      ? "Workflow name is required."
      : "";
  const runDialogPromptError =
    runDialogTouched && runDialogPrompt.trim().length === 0
      ? "Add the operator request before starting the run."
      : "";
  const mode = route.mode;

  useEffect(() => {
    const handleHashChange = (): void => setRoute(parseOpsRoute(window.location.hash));

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const workflowId = route.workflowId;

    if (workflowId !== undefined) {
      setWorkspace((current) => selectWorkflow(current, workflowId));
      setSelectedWorkflowDirectoryRowId(workflowId);
    }
  }, [route.workflowId]);

  const navigateToRoute = useCallback((nextRoute: OpsRoute): void => {
    const nextHash = hashForOpsRoute(nextRoute);

    setRoute(nextRoute);

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, []);

  const handleSelectNode = (nodeId: string): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) => selectNode(currentState, nodeId))
    );
    navigateToRoute({ mode: "graph", workflowId: selectedWorkflow.id });
  };

  const handleAddNode = (): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) => {
        const nextNodeId = getNextAgentNodeId(currentState);
        const sourceNodeId = currentState.selectedNodeId ?? currentState.nodes.at(-1)?.id;
        const nextState = addAgentNode(currentState);

        return sourceNodeId === undefined
          ? nextState
          : connectNodes(nextState, { source: sourceNodeId, target: nextNodeId, label: "next" });
      })
    );
    navigateToRoute({ mode: "graph", workflowId: selectedWorkflow.id });
  };

  const handleOpenCreateWorkflowDialog = (): void => {
    setWorkflowDraftInput(defaultCreateWorkflowInput);
    setWorkflowDraftTouched(false);
    setWorkflowCreateDialogOpen(true);
  };

  const handleCreateWorkflowDialogOpenChange = (open: boolean): void => {
    setWorkflowCreateDialogOpen(open);
    setWorkflowDraftTouched(open ? workflowDraftTouched : false);
  };

  const handleWorkflowDraftInputChange = (patch: Partial<WorkflowDraftInput>): void => {
    setWorkflowDraftInput((current) => ({ ...current, ...patch }));
  };

  const handleCreateWorkflowSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setWorkflowDraftTouched(true);

    if (workflowDraftInput.workflowName.trim().length === 0) {
      return;
    }

    const nextWorkspace = addDraftWorkflow(workspace, workflowDraftInput);
    const nextWorkflowId = nextWorkspace.selectedWorkflowId ?? emptyWorkflowDirectoryRow.workflowId;

    setWorkspace(nextWorkspace);
    setSelectedWorkflowDirectoryRowId(nextWorkflowId);
    setWorkflowCreateDialogOpen(false);
    setWorkflowDraftTouched(false);
    navigateToRoute({ mode: "graph", workflowId: nextWorkflowId });
  };

  const handleSelectWorkflow = (workflow: WorkflowDirectoryRow): void => {
    setSelectedWorkflowDirectoryRowId(workflow.id);
    setWorkspace((current) => selectWorkflow(current, workflow.workflowId));
    navigateToRoute({ mode: "workflows", workflowId: workflow.workflowId });
  };

  const handleOpenWorkflow = (workflowId: string, nextMode: OpsMode): void => {
    setSelectedWorkflowDirectoryRowId(workflowId);
    setWorkspace((current) => selectWorkflow(current, workflowId));
    navigateToRoute({ mode: nextMode, workflowId });
  };

  const handleEditWorkflow = (workflowId: string): void => {
    handleOpenWorkflow(workflowId, "graph");
  };

  const handleOpenWorkflowInstructions = (workflowId: string): void => {
    handleOpenWorkflow(workflowId, "prompt");
  };

  const handleOpenWorkflowRuns = (workflowId: string): void => {
    handleOpenWorkflow(workflowId, "runs");
  };

  const handleRequestWorkflowRun = (workflowId: string): void => {
    setWorkspace((current) => selectWorkflow(current, workflowId));
    setSelectedWorkflowDirectoryRowId(workflowId);
    setRunDialogWorkflowId(workflowId);
    setRunDialogPrompt("");
    setRunDialogPayload("");
    setRunDialogTouched(false);
  };

  const handleRunDialogOpenChange = (open: boolean): void => {
    if (!open) {
      setRunDialogWorkflowId(undefined);
      setRunDialogPrompt("");
      setRunDialogPayload("");
      setRunDialogTouched(false);
    }
  };

  const handleRunDialogPromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setRunDialogPrompt(event.currentTarget.value);
  };

  const handleRunDialogPayloadChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setRunDialogPayload(event.currentTarget.value);
  };

  const handleRunDialogSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setRunDialogTouched(true);

    if (runDialogPrompt.trim().length === 0) {
      return;
    }

    const workflowId = runDialogWorkflowId ?? selectedWorkflow.id;

    setWorkspace((current) =>
      updateSelectedWorkflowState(selectWorkflow(current, workflowId), (currentState) =>
        addExecutionRun(currentState, {
          inputPrompt: runDialogPrompt,
          inputPayload: runDialogPayload,
          startedAt: new Date().toISOString(),
        })
      )
    );
    setSelectedWorkflowDirectoryRowId(workflowId);
    setRunDialogWorkflowId(undefined);
    setRunDialogPrompt("");
    setRunDialogPayload("");
    setRunDialogTouched(false);
    navigateToRoute({ mode: "runs", workflowId });
  };

  const handleOpenWorkflowSettings = (workflowId: string): void => {
    handleOpenWorkflow(workflowId, "settings");
  };

  const handleModeClick = (nextMode: OpsMode): void => {
    navigateToRoute({ mode: nextMode, workflowId: selectedWorkflow.id });
  };

  const handleWorkflowSearchQueryChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setWorkflowSearchQuery(event.currentTarget.value);
  };

  const handleClearWorkflowFilters = (): void => {
    setWorkflowSearchQuery("");
  };

  const handleWorkflowNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const workflowName = event.currentTarget.value;

    setWorkspace((current) => updateSelectedWorkflowMetadata(current, { workflowName }));
  };

  const handleWorkflowDescriptionChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const description = event.currentTarget.value;

    setWorkspace((current) => updateSelectedWorkflowMetadata(current, { description }));
  };

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const title = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { title })
      )
    );
  };

  const handleAgentChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const agent = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { agent })
      )
    );
  };

  const handleModelChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const model = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { model })
      )
    );
  };

  const handlePolicyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const policy = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { policy })
      )
    );
  };

  const handleStepSystemPromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const systemPrompt = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { systemPrompt })
      )
    );
  };

  const handleKindChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const kind = parseWorkflowNodeKind(event.currentTarget.value);
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { kind })
      )
    );
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const status = parseWorkflowNodeStatus(event.currentTarget.value);
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateSelectedNode(currentState, { status })
      )
    );
  };

  const handlePromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const systemPrompt = event.currentTarget.value;
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        updateWorkflowPrompt(currentState, systemPrompt)
      )
    );
  };

  const handleSelectRun = (runId: string): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) => selectRun(currentState, runId))
    );
  };

  const handleCreateRun = (submission: ExecutionRunSubmission): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        addExecutionRun(currentState, submission)
      )
    );
    navigateToRoute({ mode: "runs", workflowId: selectedWorkflow.id });
  };

  const handleCanvasConnect = useCallback((connection: Connection): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        connectNodes(currentState, edgeConnectionInputFromCanvas(connection))
      )
    );
  }, []);

  const handleCanvasEdgeDelete = useCallback((edgeIds: ReadonlyArray<string>): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) =>
        edgeIds.reduce((nextState, edgeId) => disconnectEdge(nextState, edgeId), currentState)
      )
    );
  }, []);

  const handleCanvasNodeMove = useCallback(
    (patches: ReadonlyArray<WorkflowNodePositionPatch>): void => {
      setWorkspace((current) =>
        updateSelectedWorkflowState(current, (currentState) =>
          updateNodePositions(currentState, patches)
        )
      );
    },
    []
  );

  const handleDisconnectEdge = (edgeId: string): void => {
    setWorkspace((current) =>
      updateSelectedWorkflowState(current, (currentState) => disconnectEdge(currentState, edgeId))
    );
  };

  return (
    <main className="ops-shell">
      <WorkflowCreateDialog
        draftInput={workflowDraftInput}
        nameError={workflowDraftNameError}
        open={workflowCreateDialogOpen}
        onDraftInputChange={handleWorkflowDraftInputChange}
        onOpenChange={handleCreateWorkflowDialogOpenChange}
        onSubmit={handleCreateWorkflowSubmit}
      />
      <RunWorkflowDialog
        inputPayload={runDialogPayload}
        inputPrompt={runDialogPrompt}
        open={runDialogWorkflowId !== undefined}
        promptError={runDialogPromptError}
        workflow={runDialogWorkflow}
        onInputPayloadChange={handleRunDialogPayloadChange}
        onInputPromptBlur={() => setRunDialogTouched(true)}
        onInputPromptChange={handleRunDialogPromptChange}
        onOpenChange={handleRunDialogOpenChange}
        onSubmit={handleRunDialogSubmit}
      />
      <header className="ops-topbar">
        <div className="ops-brand">
          <span className="ops-brand-symbol" aria-hidden="true" />
          <p>OpsFlow</p>
        </div>
        <h1 className="sr-only">Workflow Builder</h1>
        <nav className="mode-tabs" aria-label="Ops mode">
          {topNavigationItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={[
                item.label === "Workflows" && mode === "workflows" ? "selected" : "",
                item.label === "Runs" && mode === "runs" ? "selected" : "",
                item.label === "Connections" && mode === "graph" ? "selected" : "",
                item.label === "Settings" && mode === "settings" ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={
                (item.label === "Workflows" && mode === "workflows") ||
                (item.label === "Runs" && mode === "runs") ||
                (item.label === "Connections" && mode === "graph") ||
                (item.label === "Settings" && mode === "settings")
                  ? "page"
                  : undefined
              }
              onClick={() => handleModeClick(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ops-topbar-actions">
          <Button type="button" variant="ghost" size="icon" aria-label="Search workflows">
            <Search aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
            <Bell aria-hidden="true" />
            <span aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Help">
            <CircleHelp aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" className="ops-user-menu">
            <span>AK</span>
            <strong>Alex Kim</strong>
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </header>

      {mode === "workflows" ? (
        <>
          <nav className="workflow-subnav" aria-label="Workflow section tabs">
            <button type="button" className="selected" aria-current="page">
              Library
            </button>
            <button type="button" onClick={() => handleModeClick("graph")}>
              Builder
            </button>
            <button type="button" disabled>
              Versions
            </button>
            <button type="button" disabled>
              Templates
            </button>
          </nav>
          <WorkflowListPage
            categoryNavItems={workflowCategoryNavItems}
            diagnostics={diagnostics}
            libraryNavItems={workflowLibraryNavItems}
            workflows={filteredWorkflowDirectoryRecords}
            selectedDirectoryRow={selectedWorkflowDirectoryRow}
            selectedWorkflowId={workspace.selectedWorkflowId}
            searchQuery={workflowSearchQuery}
            totalWorkflowCount={workflowDirectoryRecords.length}
            onCreateWorkflow={handleOpenCreateWorkflowDialog}
            onClearWorkflowFilters={handleClearWorkflowFilters}
            onEditWorkflow={handleEditWorkflow}
            onOpenWorkflowRuns={handleOpenWorkflowRuns}
            onOpenWorkflowSettings={handleOpenWorkflowSettings}
            onRequestWorkflowRun={handleRequestWorkflowRun}
            onSearchQueryChange={handleWorkflowSearchQueryChange}
            onSelectWorkflow={handleSelectWorkflow}
          />
        </>
      ) : (
        <>
          {mode === "graph" ? (
            <BuilderPage
              selectedWorkflow={selectedWorkflow}
              selectedNode={selectedNode}
              state={state}
              summary={summary}
              diagnostics={diagnostics}
              onAddNode={handleAddNode}
              onAgentChange={handleAgentChange}
              onCanvasConnect={handleCanvasConnect}
              onCanvasEdgeDelete={handleCanvasEdgeDelete}
              onCanvasNodeMove={handleCanvasNodeMove}
              onDisconnectEdge={handleDisconnectEdge}
              onKindChange={handleKindChange}
              onModelChange={handleModelChange}
              onOpenInstructions={handleOpenWorkflowInstructions}
              onOpenRuns={handleOpenWorkflowRuns}
              onOpenSettings={handleOpenWorkflowSettings}
              onPolicyChange={handlePolicyChange}
              onSelectNode={handleSelectNode}
              onStatusChange={handleStatusChange}
              onStepSystemPromptChange={handleStepSystemPromptChange}
              onTitleChange={handleTitleChange}
            />
          ) : null}
          {mode === "prompt" ? (
            <InstructionsPage
              selectedWorkflow={selectedWorkflow}
              diagnostics={diagnostics}
              summary={summary}
              onDescriptionChange={handleWorkflowDescriptionChange}
              onNameChange={handleWorkflowNameChange}
              onPromptChange={handlePromptChange}
            />
          ) : null}
          {mode === "runs" ? (
            <RunHistoryPanel
              nodes={state.nodes}
              runs={state.runs}
              selectedRun={selectedRun}
              onCreateRun={handleCreateRun}
              onOpenNodeInBuilder={handleSelectNode}
              onSelectRun={handleSelectRun}
            />
          ) : null}
          {mode === "settings" ? (
            <SettingsPage
              selectedWorkflow={selectedWorkflow}
              summary={summary}
              onDescriptionChange={handleWorkflowDescriptionChange}
              onNameChange={handleWorkflowNameChange}
            />
          ) : null}
        </>
      )}
    </main>
  );
};
