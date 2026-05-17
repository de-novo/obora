import type { ChangeEvent, ReactElement } from "react";
import { memo, useCallback, useMemo, useState } from "react";
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

import "@xyflow/react/dist/style.css";
import "./styles.css";
import {
  addAgentNode,
  compileWorkflowYaml,
  connectNodes,
  disconnectEdge,
  getNextAgentNodeId,
  getSelectedNode,
  getSelectedRun,
  initialOpsState,
  nodeKindLabels,
  nodeStatusLabels,
  opsModes,
  parseWorkflowNodeKind,
  parseWorkflowNodeStatus,
  resolveGraphEdges,
  runStatusLabels,
  runStepStatusLabels,
  selectNode,
  selectRun,
  summarizeOpsState,
  updateSelectedNode,
  updateNodePositions,
  updateWorkflowPrompt,
  workflowNodeKinds,
  workflowNodeStatuses,
  type EdgeConnectionInput,
  type ExecutionRun,
  type OpsMode,
  type OpsWorkbenchState,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodePositionPatch,
} from "./ops-model";
import { TraceSummary } from "./TraceSummary";

const modeLabels: Record<OpsMode, string> = {
  graph: "Graph",
  prompt: "Prompt",
  runs: "Runs",
};

const statusClass = (status: string): string => `status-${status}`;

const formatDuration = (durationMs: number): string => `${Math.round(durationMs / 1000)}s`;

interface EdgeDraft {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly label: string;
}

const initialEdgeDraft: EdgeDraft = {
  sourceNodeId: initialOpsState.nodes[0]?.id ?? "",
  targetNodeId: initialOpsState.nodes[1]?.id ?? initialOpsState.nodes[0]?.id ?? "",
  label: "next",
};

const nodeTitleFor = (nodes: ReadonlyArray<WorkflowNode>, nodeId: string): string =>
  nodes.find((node) => node.id === nodeId)?.title ?? nodeId;

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
        className={[
          "workflow-canvas-node",
          statusClass(node.status),
          selected ? "selected" : "",
        ]
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
        <dl>
          <div>
            <dt>Agent</dt>
            <dd>{node.agent}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{node.model}</dd>
          </div>
          <div>
            <dt>Policy</dt>
            <dd>{node.policy}</dd>
          </div>
        </dl>
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
          onEdgesDelete={(deletedEdges) => onDeleteEdges(edgeIdsFromDeletedCanvasEdges(deletedEdges))}
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
            <span>Infinite canvas</span>
            <strong>{state.nodes.length} nodes</strong>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </section>
  );
};

interface NodeListProps {
  readonly nodes: ReadonlyArray<WorkflowNode>;
  readonly edges: ReadonlyArray<WorkflowEdge>;
  readonly selectedNodeId: string | undefined;
  readonly edgeDraft: EdgeDraft;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onAddNode: () => void;
  readonly onConnectEdge: () => void;
  readonly onDisconnectEdge: (edgeId: string) => void;
  readonly onEdgeLabelChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onEdgeSourceChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onEdgeTargetChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

const NodeList = ({
  edgeDraft,
  edges,
  nodes,
  selectedNodeId,
  onAddNode,
  onConnectEdge,
  onDisconnectEdge,
  onEdgeLabelChange,
  onEdgeSourceChange,
  onEdgeTargetChange,
  onSelectNode,
}: NodeListProps): ReactElement => (
  <aside className="ops-panel node-list" aria-label="Workflow nodes">
    <div className="panel-heading">
      <h2>Nodes</h2>
      <button type="button" className="compact-button" onClick={onAddNode}>
        Add step
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

    <section className="edge-builder" aria-label="Edge builder">
      <div className="panel-heading">
        <h2>Edges</h2>
        <button
          type="button"
          className="compact-button"
          onClick={onConnectEdge}
          disabled={
            edgeDraft.sourceNodeId.length === 0 ||
            edgeDraft.targetNodeId.length === 0 ||
            edgeDraft.sourceNodeId === edgeDraft.targetNodeId
          }
        >
          Connect edge
        </button>
      </div>
      <label>
        From
        <select value={edgeDraft.sourceNodeId} onChange={onEdgeSourceChange}>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        To
        <select value={edgeDraft.targetNodeId} onChange={onEdgeTargetChange}>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Edge label
        <input value={edgeDraft.label} onChange={onEdgeLabelChange} />
      </label>
      <div className="edge-list" aria-label="Connected edges">
        {edges.map((edge) => (
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
        ))}
      </div>
    </section>
  </aside>
);

interface NodeInspectorProps {
  readonly node: WorkflowNode;
  readonly compiledWorkflow: string;
  readonly onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onModelChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPolicyChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onStepSystemPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onKindChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  readonly onStatusChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

const NodeInspector = ({
  compiledWorkflow,
  node,
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
      <h2>Inspector</h2>
      <span className={["state-pill", statusClass(node.status)].join(" ")}>
        {nodeStatusLabels[node.status]}
      </span>
    </div>

    <label>
      Title
      <input value={node.title} onChange={onTitleChange} />
    </label>
    <label>
      Kind
      <select value={node.kind} onChange={onKindChange}>
        {workflowNodeKinds.map((kind) => (
          <option key={kind} value={kind}>
            {nodeKindLabels[kind]}
          </option>
        ))}
      </select>
    </label>
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
      Step System Prompt
      <textarea value={node.systemPrompt} onChange={onStepSystemPromptChange} rows={7} />
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

    <div className="compiled-preview" aria-label="Compiled workflow">
      <pre>{compiledWorkflow}</pre>
    </div>
  </aside>
);

interface PromptPanelProps {
  readonly prompt: string;
  readonly compiledWorkflow: string;
  readonly onPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

const PromptPanel = ({
  compiledWorkflow,
  onPromptChange,
  prompt,
}: PromptPanelProps): ReactElement => (
  <aside className="ops-panel inspector-panel prompt-panel" aria-label="System prompt editor">
    <div className="panel-heading">
      <h2>Workflow System Prompt</h2>
      <span className="state-pill status-ready">Version draft</span>
    </div>
    <label>
      Workflow System Prompt
      <textarea value={prompt} onChange={onPromptChange} rows={11} />
    </label>
    <div className="compiled-preview" aria-label="Prompt compile preview">
      <pre>{compiledWorkflow}</pre>
    </div>
  </aside>
);

interface RunHistoryPanelProps {
  readonly runs: ReadonlyArray<ExecutionRun>;
  readonly selectedRun: ExecutionRun;
  readonly onSelectRun: (runId: string) => void;
}

const RunHistoryPanel = ({
  onSelectRun,
  runs,
  selectedRun,
}: RunHistoryPanelProps): ReactElement => (
  <aside className="ops-panel inspector-panel run-panel" aria-label="Execution history">
    <div className="panel-heading">
      <h2>Run History</h2>
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

    <div className="run-detail">
      <h3>{selectedRun.id}</h3>
      <div className="step-list">
        {selectedRun.steps.map((step) => (
          <div key={step.id} className="step-item">
            <div className={["step-row", statusClass(step.status)].join(" ")}>
              <span>{runStepStatusLabels[step.status]}</span>
              <strong>{step.title}</strong>
              <small>{formatDuration(step.durationMs)}</small>
            </div>
            {step.trace ? <TraceSummary trace={step.trace} /> : null}
          </div>
        ))}
      </div>
    </div>
  </aside>
);

export const App = (): ReactElement => {
  const [mode, setMode] = useState<OpsMode>("graph");
  const [state, setState] = useState<OpsWorkbenchState>(initialOpsState);
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft>(initialEdgeDraft);
  const selectedNode = useMemo(() => getSelectedNode(state), [state]);
  const selectedRun = useMemo(() => getSelectedRun(state), [state]);
  const summary = useMemo(() => summarizeOpsState(state), [state]);
  const compiledWorkflow = useMemo(() => compileWorkflowYaml(state), [state]);

  const handleSelectNode = (nodeId: string): void => {
    setState((current) => selectNode(current, nodeId));
    setMode("graph");
  };

  const handleAddNode = (): void => {
    const nextNodeId = getNextAgentNodeId(state);
    const sourceNodeId = state.selectedNodeId ?? state.nodes.at(-1)?.id ?? nextNodeId;
    setState(addAgentNode);
    setEdgeDraft((current) => ({
      ...current,
      sourceNodeId,
      targetNodeId: nextNodeId,
      label: current.label.trim().length > 0 ? current.label : "next",
    }));
    setMode("graph");
  };

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const title = event.currentTarget.value;
    setState((current) => updateSelectedNode(current, { title }));
  };

  const handleAgentChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const agent = event.currentTarget.value;
    setState((current) => updateSelectedNode(current, { agent }));
  };

  const handleModelChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const model = event.currentTarget.value;
    setState((current) => updateSelectedNode(current, { model }));
  };

  const handlePolicyChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const policy = event.currentTarget.value;
    setState((current) => updateSelectedNode(current, { policy }));
  };

  const handleStepSystemPromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const systemPrompt = event.currentTarget.value;
    setState((current) => updateSelectedNode(current, { systemPrompt }));
  };

  const handleKindChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const kind = parseWorkflowNodeKind(event.currentTarget.value);
    setState((current) => updateSelectedNode(current, { kind }));
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const status = parseWorkflowNodeStatus(event.currentTarget.value);
    setState((current) => updateSelectedNode(current, { status }));
  };

  const handlePromptChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const systemPrompt = event.currentTarget.value;
    setState((current) => updateWorkflowPrompt(current, systemPrompt));
  };

  const handleSelectRun = (runId: string): void => {
    setState((current) => selectRun(current, runId));
  };

  const handleEdgeSourceChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const sourceNodeId = event.currentTarget.value;
    setEdgeDraft((current) => ({ ...current, sourceNodeId }));
  };

  const handleEdgeTargetChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const targetNodeId = event.currentTarget.value;
    setEdgeDraft((current) => ({ ...current, targetNodeId }));
  };

  const handleEdgeLabelChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const label = event.currentTarget.value;
    setEdgeDraft((current) => ({ ...current, label }));
  };

  const handleConnectEdge = (): void => {
    setState((current) =>
      connectNodes(current, {
        source: edgeDraft.sourceNodeId,
        target: edgeDraft.targetNodeId,
        label: edgeDraft.label,
      })
    );
  };

  const handleCanvasConnect = useCallback((connection: Connection): void => {
    setState((current) => connectNodes(current, edgeConnectionInputFromCanvas(connection)));
  }, []);

  const handleCanvasEdgeDelete = useCallback((edgeIds: ReadonlyArray<string>): void => {
    setState((current) =>
      edgeIds.reduce((nextState, edgeId) => disconnectEdge(nextState, edgeId), current)
    );
  }, []);

  const handleCanvasNodeMove = useCallback(
    (patches: ReadonlyArray<WorkflowNodePositionPatch>): void => {
      setState((current) => updateNodePositions(current, patches));
    },
    []
  );

  const handleDisconnectEdge = (edgeId: string): void => {
    setState((current) => disconnectEdge(current, edgeId));
  };

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <div>
          <p>Obora Ops</p>
          <h1>Workflow Operations</h1>
        </div>
        <dl className="metrics">
          <div>
            <dt>Nodes</dt>
            <dd>{summary.nodeCount}</dd>
          </div>
          <div>
            <dt>Edges</dt>
            <dd>{summary.edgeCount}</dd>
          </div>
          <div>
            <dt>Ready</dt>
            <dd>{summary.readyCount}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{summary.activeRuns}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{summary.failedRuns}</dd>
          </div>
        </dl>
      </header>

      <nav className="mode-tabs" aria-label="Ops mode">
        {opsModes.map((tab) => (
          <button
            key={tab}
            type="button"
            className={mode === tab ? "selected" : ""}
            onClick={() => setMode(tab)}
          >
            {modeLabels[tab]}
          </button>
        ))}
      </nav>

      <section className="ops-workbench">
        <NodeList
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={state.selectedNodeId}
          edgeDraft={edgeDraft}
          onAddNode={handleAddNode}
          onConnectEdge={handleConnectEdge}
          onDisconnectEdge={handleDisconnectEdge}
          onEdgeLabelChange={handleEdgeLabelChange}
          onEdgeSourceChange={handleEdgeSourceChange}
          onEdgeTargetChange={handleEdgeTargetChange}
          onSelectNode={handleSelectNode}
        />
        <WorkflowGraph
          state={state}
          onConnectNodes={handleCanvasConnect}
          onDeleteEdges={handleCanvasEdgeDelete}
          onMoveNodes={handleCanvasNodeMove}
          onSelectNode={handleSelectNode}
        />
        {mode === "prompt" ? (
          <PromptPanel
            prompt={state.systemPrompt}
            compiledWorkflow={compiledWorkflow}
            onPromptChange={handlePromptChange}
          />
        ) : null}
        {mode === "runs" ? (
          <RunHistoryPanel
            runs={state.runs}
            selectedRun={selectedRun}
            onSelectRun={handleSelectRun}
          />
        ) : null}
        {mode === "graph" ? (
          <NodeInspector
            node={selectedNode}
            compiledWorkflow={compiledWorkflow}
            onAgentChange={handleAgentChange}
            onKindChange={handleKindChange}
            onModelChange={handleModelChange}
            onPolicyChange={handlePolicyChange}
            onStepSystemPromptChange={handleStepSystemPromptChange}
            onStatusChange={handleStatusChange}
            onTitleChange={handleTitleChange}
          />
        ) : null}
      </section>
    </main>
  );
};
