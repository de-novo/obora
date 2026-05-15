import type { ChangeEvent, ReactElement } from "react";
import { useMemo, useState } from "react";

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
  updateWorkflowPrompt,
  workflowNodeKinds,
  workflowNodeStatuses,
  type ExecutionRun,
  type OpsMode,
  type OpsWorkbenchState,
  type WorkflowEdge,
  type WorkflowNode,
} from "./ops-model";

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

interface WorkflowGraphProps {
  readonly state: OpsWorkbenchState;
  readonly onSelectNode: (nodeId: string) => void;
}

const WorkflowGraph = ({ state, onSelectNode }: WorkflowGraphProps): ReactElement => {
  const edges = useMemo(
    () => resolveGraphEdges(state.nodes, state.edges),
    [state.edges, state.nodes]
  );

  return (
    <section className="graph-stage" aria-label="Workflow graph">
      <svg
        className="graph-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {edges.map((edge) => (
          <g key={edge.id}>
            <line
              className="graph-edge-line"
              x1={edge.sourceNode.x}
              y1={edge.sourceNode.y}
              x2={edge.targetNode.x}
              y2={edge.targetNode.y}
            />
            <text
              className="graph-edge-label"
              x={(edge.sourceNode.x + edge.targetNode.x) / 2}
              y={(edge.sourceNode.y + edge.targetNode.y) / 2 - 3}
            >
              {edge.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="graph-node-layer">
        {state.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={[
              "graph-node",
              statusClass(node.status),
              node.id === state.selectedNodeId ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            aria-pressed={node.id === state.selectedNodeId}
            aria-label={`Select ${node.title}`}
            onClick={() => onSelectNode(node.id)}
          >
            <span>{nodeKindLabels[node.kind]}</span>
            <strong>{node.title}</strong>
            <small>{node.agent}</small>
          </button>
        ))}
      </div>
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
          <div key={step.id} className={["step-row", statusClass(step.status)].join(" ")}>
            <span>{runStepStatusLabels[step.status]}</span>
            <strong>{step.title}</strong>
            <small>{formatDuration(step.durationMs)}</small>
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
        <WorkflowGraph state={state} onSelectNode={handleSelectNode} />
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
