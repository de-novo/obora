import { getAgentDb } from "./client";

/**
 * Database Query Functions
 * All queries use parameter binding to prevent SQL injection
 */

// ============================================================================
// Types
// ============================================================================

export type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed" | "error";
  metadata: string | null;
  initial_prompt: string | null;
};

export type Workflow = {
  id: string;
  session_id: string;
  planned_by: string;
  task_description: string | null;
  workflow_json: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export type WorkflowStep = {
  id: string;
  workflow_id: string;
  step_number: number;
  agent_name: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
};

export type AgentRun = {
  id: string;
  session_id: string;
  workflow_id: string | null;
  agent_name: string;
  agent_category: string | null;
  model: string | null;
  input_summary: string | null;
  output_summary: string | null;
  status: "running" | "completed" | "failed" | "interrupted";
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  tokens_input: number;
  tokens_output: number;
  error_message: string | null;
  metadata: string | null;
};

export type ToolCall = {
  id: string;
  run_id: string;
  tool_name: string;
  input: string | null;
  output: string | null;
  status: string;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
};

export type FileAccess = {
  id: string;
  run_id: string;
  tool_call_id: number | null;
  file_path: string;
  access_type: "read" | "write" | "edit" | "create" | "delete";
  line_start: number | null;
  line_end: number | null;
  summary: string | null;
  timestamp: string;
};

export type AgentStats = {
  agent_name: string;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
  success_rate: number;
};

export type WorkflowProgress = {
  workflow_id: string;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  current_step: number | null;
  progress_percent: number;
};

export type CurrentActivity = {
  session_id: string;
  workflow_id: string | null;
  agent_name: string;
  input_summary: string | null;
  started_at: string;
  duration_ms: number;
};

export type RecentAction = {
  id: string;
  timestamp: string;
  type: "session" | "workflow" | "agent_run" | "tool_call" | "file_access";
  description: string;
  status: string;
  metadata: string | null;
};

export type AgentRunFilters = {
  sessionId?: string;
  workflowId?: string;
  agentName?: string;
  status?: string;
};

export type AgentRelationship = {
  id: string;
  parent_id: string | null;
  agent_name: string;
  description: string | null;
  prompt: string | null;
  output_summary: string | null;
  status: string;
  started_at: string;
  duration_ms: number | null;
  children_count: number;
  depth: number;
};

export type ParallelGroup = {
  id: number;
  workflow_id: string;
  group_order: number;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  ended_at: string | null;
};

export type FeedbackLoop = {
  id: number;
  workflow_id: string;
  trigger_step_id: number | null;
  trigger_agent: string;
  reviewer_agent: string;
  iteration: number;
  status: "pending" | "reviewing" | "fixing" | "passed" | "failed" | "max_reached";
  trigger_output: string | null;
  review_result: string | null;
  fix_result: string | null;
  started_at: string;
  ended_at: string | null;
};

export type FeedbackIteration = {
  id: number;
  loop_id: number;
  iteration: number;
  phase: "review" | "fix" | "verify";
  agent_name: string;
  input_summary: string | null;
  output_summary: string | null;
  issues_found: string | null;
  issues_resolved: string | null;
  started_at: string;
  ended_at: string | null;
};

export type WorkflowStepWithRun = WorkflowStep & {
  agent_run: AgentRunBranch | null;
};

// ============================================================================
// Task Types
// ============================================================================

export type Task = {
  id: string;
  title: string;
  description: string | null;
  parent_task_id: string | null;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "blocked";
  priority: number;
  complexity: "trivial" | "simple" | "medium" | "complex" | "epic" | null;
  tags: string | null; // JSON array
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration_ms: number | null;
  actual_duration_ms: number | null;
  created_by: string | null;
  metadata: string | null;
};

export type TaskWithProgress = Task & {
  subtask_count: number;
  completed_subtasks: number;
  in_progress_subtasks: number;
  failed_subtasks: number;
  agent_run_count: number;
  progress_percent: number;
  depth: number;
};

export type TaskDependency = {
  task_id: string;
  depends_on_task_id: string;
  dependency_type: "blocks" | "related" | "continues" | "reviews";
  created_at: string;
};

export type TaskHierarchy = {
  task: TaskWithProgress;
  subtasks: TaskHierarchy[];
  dependencies: TaskDependency[];
};

export type TaskFlowNode = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress_percent: number;
  subtask_count: number;
  parent_task_id: string | null;
  depth: number;
};

export type ParallelGroupWithSteps = ParallelGroup & {
  steps: WorkflowStepWithRun[];
};

export type FeedbackLoopWithIterations = FeedbackLoop & {
  iterations: FeedbackIteration[];
};

export type AgentRunBranch = {
  id: string;
  agent_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  children: AgentRunBranch[];
};

export type WorkflowProgressExtended = {
  workflow_id: string;
  task_description: string | null;
  status: string;
  total_steps: number;
  completed_steps: number;
  running_steps: number;
  failed_steps: number;
  parallel_groups: ParallelGroupWithSteps[];
  current_feedback_loop: FeedbackLoopWithIterations | null;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all sessions ordered by most recent first
 */
export function getSessions(): Session[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      id,
      started_at,
      ended_at,
      status,
      metadata,
      initial_prompt
    FROM sessions
    ORDER BY started_at DESC
  `;

  return db.prepare(query).all() as Session[];
}

/**
 * Get workflows, optionally filtered by session
 */
export function getWorkflows(sessionId?: string): Workflow[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  if (sessionId) {
    const query = `
      SELECT
        id,
        session_id,
        planned_by,
        task_description,
        workflow_json,
        status,
        created_at,
        started_at,
        ended_at
      FROM workflows
      WHERE session_id = ?
      ORDER BY created_at DESC
    `;

    return db.prepare(query).all(sessionId) as Workflow[];
  }

  const query = `
    SELECT
      id,
      session_id,
      planned_by,
      task_description,
      workflow_json,
      status,
      created_at,
      started_at,
      ended_at
    FROM workflows
    ORDER BY created_at DESC
  `;

  return db.prepare(query).all() as Workflow[];
}

/**
 * Get workflow steps for a specific workflow
 */
export function getWorkflowSteps(workflowId: string): WorkflowStep[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      id,
      workflow_id,
      step_number,
      agent_name,
      task,
      status,
      started_at,
      ended_at,
      result
    FROM workflow_steps
    WHERE workflow_id = ?
    ORDER BY step_number ASC
  `;

  return db.prepare(query).all(workflowId) as WorkflowStep[];
}

/**
 * Get agent runs with optional filters
 */
export function getAgentRuns(filters: AgentRunFilters = {}): AgentRun[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.sessionId) {
    conditions.push("session_id = ?");
    params.push(filters.sessionId);
  }

  if (filters.workflowId) {
    conditions.push("workflow_id = ?");
    params.push(filters.workflowId);
  }

  if (filters.agentName) {
    conditions.push("agent_name = ?");
    params.push(filters.agentName);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      id,
      session_id,
      workflow_id,
      agent_name,
      agent_category,
      model,
      input_summary,
      output_summary,
      status,
      started_at,
      ended_at,
      duration_ms,
      tokens_input,
      tokens_output,
      error_message,
      metadata
    FROM agent_runs
    ${whereClause}
    ORDER BY started_at DESC
  `;

  return db.prepare(query).all(...params) as AgentRun[];
}

/**
 * Get tool calls for a specific agent run
 */
export function getToolCalls(runId: string): ToolCall[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      id,
      run_id,
      tool_name,
      input,
      output,
      status,
      error_message,
      started_at,
      ended_at,
      duration_ms
    FROM tool_calls
    WHERE run_id = ?
    ORDER BY started_at ASC
  `;

  return db.prepare(query).all(runId) as ToolCall[];
}

/**
 * Get file accesses, optionally filtered by run
 */
export function getFileAccesses(runId?: string): FileAccess[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  if (runId) {
    const query = `
      SELECT
        id,
        run_id,
        tool_call_id,
        file_path,
        access_type,
        line_start,
        line_end,
        summary,
        timestamp
      FROM file_accesses
      WHERE run_id = ?
      ORDER BY timestamp DESC
    `;

    return db.prepare(query).all(runId) as FileAccess[];
  }

  const query = `
    SELECT
      id,
      run_id,
      tool_call_id,
      file_path,
      access_type,
      line_start,
      line_end,
      summary,
      timestamp
    FROM file_accesses
    ORDER BY timestamp DESC
    LIMIT 100
  `;

  return db.prepare(query).all() as FileAccess[];
}

/**
 * Get aggregated statistics per agent
 */
export function getAgentStats(): AgentStats[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      agent_name,
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_runs,
      SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failed_runs,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE 0 END) as avg_duration_ms,
      CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS REAL) /
        COUNT(*) * 100 as success_rate
    FROM agent_runs
    GROUP BY agent_name
    ORDER BY total_runs DESC
  `;

  return db.prepare(query).all() as AgentStats[];
}

/**
 * Get progress information for a specific workflow
 */
export function getWorkflowProgress(workflowId: string): WorkflowProgress | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  const query = `
    SELECT
      workflow_id,
      COUNT(*) as total_steps,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_steps,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_steps,
      MAX(CASE WHEN status = 'running' THEN step_number ELSE NULL END) as current_step,
      CAST(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS REAL) /
        COUNT(*) * 100 as progress_percent
    FROM workflow_steps
    WHERE workflow_id = ?
    GROUP BY workflow_id
  `;

  return db.prepare(query).get(workflowId) as WorkflowProgress | null;
}

/**
 * Get currently running activities
 */
export function getCurrentActivity(): CurrentActivity[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      session_id,
      workflow_id,
      agent_name,
      input_summary,
      started_at,
      (strftime('%s', 'now') - strftime('%s', started_at)) * 1000 as duration_ms
    FROM agent_runs
    WHERE status = 'running'
    ORDER BY started_at DESC
  `;

  return db.prepare(query).all() as CurrentActivity[];
}

/**
 * Get agent relationships with task details from tool_calls
 */
export function getAgentRelationships(sessionId?: string): AgentRelationship[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const hasSessionFilter = Boolean(sessionId);

  // Join agent_runs with the closest matching tool_call
  const query = `
    SELECT
      ar.id,
      ar.parent_run_id as parent_id,
      ar.agent_name,
      (
        SELECT json_extract(tc.input, '$.description')
        FROM tool_calls tc
        WHERE tc.tool_name = 'Task'
          AND json_extract(tc.input, '$.subagent_type') = ar.agent_name
          AND tc.started_at <= ar.started_at
        ORDER BY tc.started_at DESC
        LIMIT 1
      ) as description,
      (
        SELECT json_extract(tc.input, '$.prompt')
        FROM tool_calls tc
        WHERE tc.tool_name = 'Task'
          AND json_extract(tc.input, '$.subagent_type') = ar.agent_name
          AND tc.started_at <= ar.started_at
        ORDER BY tc.started_at DESC
        LIMIT 1
      ) as prompt,
      COALESCE(
        NULLIF(ar.output_summary, ''),
        (
          SELECT tc.output
          FROM tool_calls tc
          WHERE tc.tool_name = 'Task'
            AND json_extract(tc.input, '$.subagent_type') = ar.agent_name
            AND tc.started_at <= ar.started_at
          ORDER BY tc.started_at DESC
          LIMIT 1
        )
      ) as output_summary,
      ar.status,
      ar.started_at,
      ar.duration_ms,
      (SELECT COUNT(*) FROM agent_runs WHERE parent_run_id = ar.id) as children_count,
      0 as depth
    FROM agent_runs ar
    WHERE 1=1 ${hasSessionFilter ? "AND ar.session_id = ?" : ""}
    ORDER BY ar.started_at DESC
    LIMIT 100
  `;

  const params = hasSessionFilter ? [sessionId] : [];
  return db.prepare(query).all(...params) as AgentRelationship[];
}

// ============================================================================
// Workflow Flow Types
// ============================================================================

export type WorkflowFlowNode = {
  id: string;
  agent_name: string;
  description: string | null;
  status: string;
  duration_ms: number | null;
  started_at: string;
  parent_id: string | null;
  depth: number;
};

export type WorkflowFlow = {
  sessionId: string;
  nodes: WorkflowFlowNode[];
  feedbackLoops: FeedbackLoop[];
  mermaid: string;
};

/**
 * Get workflow flow data for visualization
 */
export function getWorkflowFlow(sessionId: string): WorkflowFlow | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  // Get all agent runs for this session with their relationships
  const query = `
    WITH RECURSIVE agent_tree AS (
      -- Root agents (no parent)
      SELECT
        ar.id,
        ar.agent_name,
        (
          SELECT json_extract(tc.input, '$.description')
          FROM tool_calls tc
          WHERE tc.tool_name = 'Task'
            AND json_extract(tc.input, '$.subagent_type') = ar.agent_name
            AND tc.started_at <= ar.started_at
          ORDER BY tc.started_at DESC
          LIMIT 1
        ) as description,
        ar.status,
        ar.duration_ms,
        ar.started_at,
        ar.parent_run_id as parent_id,
        0 as depth
      FROM agent_runs ar
      WHERE ar.session_id = ?
        AND ar.parent_run_id IS NULL

      UNION ALL

      -- Child agents
      SELECT
        ar.id,
        ar.agent_name,
        (
          SELECT json_extract(tc.input, '$.description')
          FROM tool_calls tc
          WHERE tc.tool_name = 'Task'
            AND json_extract(tc.input, '$.subagent_type') = ar.agent_name
            AND tc.started_at <= ar.started_at
          ORDER BY tc.started_at DESC
          LIMIT 1
        ) as description,
        ar.status,
        ar.duration_ms,
        ar.started_at,
        ar.parent_run_id as parent_id,
        at.depth + 1 as depth
      FROM agent_runs ar
      INNER JOIN agent_tree at ON ar.parent_run_id = at.id
      WHERE ar.session_id = ?
    )
    SELECT * FROM agent_tree
    ORDER BY started_at ASC
  `;

  const nodes = db.prepare(query).all(sessionId, sessionId) as WorkflowFlowNode[];

  if (nodes.length === 0) {
    return null;
  }

  // Get all feedback loops for workflows in this session
  const workflowsQuery = `
    SELECT id FROM workflows WHERE session_id = ?
  `;
  const workflows = db.prepare(workflowsQuery).all(sessionId) as Array<{ id: string }>;

  const feedbackLoops: FeedbackLoop[] = [];
  for (const workflow of workflows) {
    const loops = getFeedbackLoops(workflow.id);
    feedbackLoops.push(...loops);
  }

  // Generate Mermaid flowchart with feedback loops
  const mermaid = generateMermaidFlowchart(nodes, feedbackLoops);

  return {
    sessionId,
    nodes,
    feedbackLoops,
    mermaid,
  };
}

/**
 * Generate Mermaid flowchart syntax from workflow nodes with feedback loops
 */
function generateMermaidFlowchart(nodes: WorkflowFlowNode[], feedbackLoops: FeedbackLoop[] = []): string {
  const lines: string[] = ["flowchart TB"];

  // Define status colors
  lines.push("  %% Status colors");
  lines.push("  classDef running fill:#fef3c7,stroke:#f59e0b,color:#92400e");
  lines.push("  classDef completed fill:#d1fae5,stroke:#10b981,color:#065f46");
  lines.push("  classDef failed fill:#fee2e2,stroke:#ef4444,color:#991b1b");
  lines.push("  classDef pending fill:#f3f4f6,stroke:#9ca3af,color:#374151");
  lines.push("");

  // Create node definitions
  lines.push("  %% Nodes");
  for (const node of nodes) {
    const shortId = node.id.substring(0, 7);
    const description = node.description
      ? sanitizeMermaidLabel(truncate(node.description, 30))
      : "";
    const label = description
      ? `${node.agent_name}\\n${description}`
      : node.agent_name;
    const duration = node.duration_ms ? `\\n${formatDuration(node.duration_ms)}` : "";

    // Use different shapes based on agent type
    if (node.agent_name === "planner") {
      lines.push(`  ${shortId}{{"\`${label}${duration}\`"}}`);
    } else if (node.agent_name === "reviewer") {
      lines.push(`  ${shortId}[/"\`${label}${duration}\`"/]`);
    } else {
      lines.push(`  ${shortId}["\`${label}${duration}\`"]`);
    }
  }
  lines.push("");

  // Create edges (connections)
  lines.push("  %% Connections");

  // Group nodes by parent for sequential connections
  const rootNodes = nodes.filter(n => n.parent_id === null);
  const childrenByParent = new Map<string, WorkflowFlowNode[]>();

  for (const node of nodes) {
    if (node.parent_id) {
      const children = childrenByParent.get(node.parent_id) || [];
      children.push(node);
      childrenByParent.set(node.parent_id, children);
    }
  }

  // Connect sequential root nodes
  for (let i = 0; i < rootNodes.length - 1; i++) {
    const from = rootNodes[i].id.substring(0, 7);
    const to = rootNodes[i + 1].id.substring(0, 7);
    lines.push(`  ${from} --> ${to}`);
  }

  // Connect parent to children (subgraph style)
  for (const [parentId, children] of childrenByParent) {
    const parentShortId = parentId.substring(0, 7);

    // Sort children by start time
    children.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    for (let i = 0; i < children.length; i++) {
      const childShortId = children[i].id.substring(0, 7);

      if (i === 0) {
        // First child connects from parent
        lines.push(`  ${parentShortId} -.-> ${childShortId}`);
      } else {
        // Subsequent children connect from previous sibling
        const prevShortId = children[i - 1].id.substring(0, 7);
        lines.push(`  ${prevShortId} --> ${childShortId}`);
      }
    }
  }
  lines.push("");

  // Add feedback loop connections
  if (feedbackLoops.length > 0) {
    lines.push("  %% Feedback loops");

    for (const loop of feedbackLoops) {
      // Find nodes by agent name
      const triggerNode = nodes.find(n => n.agent_name === loop.trigger_agent);
      const reviewerNode = nodes.find(n => n.agent_name === loop.reviewer_agent);

      if (!triggerNode || !reviewerNode) {
        continue;
      }

      const triggerShortId = triggerNode.id.substring(0, 7);
      const reviewerShortId = reviewerNode.id.substring(0, 7);

      // Add feedback arrow from reviewer back to trigger agent
      // Only show feedback if status is not 'passed'
      if (loop.status === "passed") {
        // No feedback arrow needed for passed status
        continue;
      }

      // Create feedback label based on status and iteration
      let label = "";
      if (loop.status === "pending") {
        label = `|pending #${loop.iteration}|`;
      } else if (loop.status === "reviewing") {
        label = `|reviewing #${loop.iteration}|`;
      } else if (loop.status === "fixing") {
        label = `|fixing #${loop.iteration}|`;
      } else if (loop.status === "failed" || loop.status === "max_reached") {
        label = `|issues #${loop.iteration}|`;
      } else {
        label = `|#${loop.iteration}|`;
      }

      // Add dotted line back from reviewer to trigger agent
      lines.push(`  ${reviewerShortId} -.${label}.-> ${triggerShortId}`);
    }

    lines.push("");
  }

  // Apply status classes
  lines.push("  %% Apply styles");
  for (const node of nodes) {
    const shortId = node.id.substring(0, 7);
    const statusClass = node.status === "completed" ? "completed"
      : node.status === "failed" ? "failed"
      : node.status === "running" ? "running"
      : "pending";
    lines.push(`  class ${shortId} ${statusClass}`);
  }

  return lines.join("\n");
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

/**
 * Sanitize text for Mermaid label to prevent syntax errors
 */
function sanitizeMermaidLabel(text: string): string {
  return text
    .replace(/`/g, "'")
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .replace(/\\/g, "\\\\");
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Get recent actions across all types
 */
export function getRecentActions(limit: number = 100): RecentAction[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT * FROM (
      SELECT
        id,
        started_at as timestamp,
        'session' as type,
        COALESCE('Session: ' || substr(initial_prompt, 1, 50), 'Session started') as description,
        status,
        json(metadata) as metadata
      FROM sessions

      UNION ALL

      SELECT
        id,
        COALESCE(started_at, created_at) as timestamp,
        'workflow' as type,
        'Workflow: ' || COALESCE(substr(task_description, 1, 50), planned_by) as description,
        status,
        NULL as metadata
      FROM workflows

      UNION ALL

      SELECT
        id,
        started_at as timestamp,
        'agent_run' as type,
        'Agent: ' || agent_name || COALESCE(' - ' || substr(input_summary, 1, 50), '') as description,
        status,
        json(metadata) as metadata
      FROM agent_runs

      UNION ALL

      SELECT
        CAST(id AS TEXT) as id,
        started_at as timestamp,
        'tool_call' as type,
        'Tool: ' || tool_name as description,
        COALESCE(status, 'success') as status,
        NULL as metadata
      FROM tool_calls

      UNION ALL

      SELECT
        CAST(id AS TEXT) as id,
        timestamp,
        'file_access' as type,
        access_type || ': ' || file_path as description,
        'completed' as status,
        summary as metadata
      FROM file_accesses
    )
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  return db.prepare(query).all(limit) as RecentAction[];
}

// ============================================================================
// Parallel Groups and Feedback Loops
// ============================================================================

/**
 * Get parallel groups for a workflow
 */
export function getParallelGroups(workflowId: string): ParallelGroup[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      id,
      workflow_id,
      group_order,
      status,
      started_at,
      ended_at
    FROM parallel_groups
    WHERE workflow_id = ?
    ORDER BY group_order ASC
  `;

  return db.prepare(query).all(workflowId) as ParallelGroup[];
}

/**
 * Get feedback loops for a workflow
 */
export function getFeedbackLoops(workflowId: string): FeedbackLoop[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      id,
      workflow_id,
      trigger_step_id,
      trigger_agent,
      reviewer_agent,
      iteration,
      status,
      trigger_output,
      review_result,
      fix_result,
      started_at,
      ended_at
    FROM feedback_loops
    WHERE workflow_id = ?
    ORDER BY started_at DESC
  `;

  return db.prepare(query).all(workflowId) as FeedbackLoop[];
}

/**
 * Get feedback loop with iterations
 */
export function getFeedbackLoopWithIterations(loopId: number): FeedbackLoopWithIterations | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  const loopQuery = `
    SELECT
      id,
      workflow_id,
      trigger_step_id,
      trigger_agent,
      reviewer_agent,
      iteration,
      status,
      trigger_output,
      review_result,
      fix_result,
      started_at,
      ended_at
    FROM feedback_loops
    WHERE id = ?
  `;

  const loop = db.prepare(loopQuery).get(loopId) as FeedbackLoop | undefined;
  if (!loop) return null;

  const iterationsQuery = `
    SELECT
      id,
      loop_id,
      iteration,
      phase,
      agent_name,
      input_summary,
      output_summary,
      issues_found,
      issues_resolved,
      started_at,
      ended_at
    FROM feedback_iterations
    WHERE loop_id = ?
    ORDER BY iteration ASC, started_at ASC
  `;

  const iterations = db.prepare(iterationsQuery).all(loopId) as FeedbackIteration[];

  return {
    ...loop,
    iterations,
  };
}

/**
 * Get current feedback loop (most recent running or pending)
 */
export function getCurrentFeedbackLoop(): FeedbackLoopWithIterations | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  const query = `
    SELECT id
    FROM feedback_loops
    WHERE status IN ('pending', 'reviewing', 'fixing')
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const result = db.prepare(query).get() as { id: number } | undefined;
  if (!result) return null;

  return getFeedbackLoopWithIterations(result.id);
}

/**
 * Get agent run branches (recursive tree structure)
 */
export function getAgentRunBranches(workflowId: string): AgentRunBranch[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    WITH RECURSIVE branch_tree AS (
      SELECT
        id,
        agent_name,
        status,
        started_at,
        ended_at,
        duration_ms,
        parent_run_id,
        0 as depth
      FROM agent_runs
      WHERE workflow_id = ? AND parent_run_id IS NULL

      UNION ALL

      SELECT
        ar.id,
        ar.agent_name,
        ar.status,
        ar.started_at,
        ar.ended_at,
        ar.duration_ms,
        ar.parent_run_id,
        bt.depth + 1
      FROM agent_runs ar
      INNER JOIN branch_tree bt ON ar.parent_run_id = bt.id
      WHERE ar.workflow_id = ?
    )
    SELECT
      id,
      agent_name,
      status,
      started_at,
      ended_at,
      duration_ms,
      parent_run_id,
      depth
    FROM branch_tree
    ORDER BY started_at ASC
  `;

  const rows = db.prepare(query).all(workflowId, workflowId) as Array<{
    id: string;
    agent_name: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    duration_ms: number | null;
    parent_run_id: string | null;
    depth: number;
  }>;

  const nodeMap = new Map<string, AgentRunBranch>();
  const rootNodes: AgentRunBranch[] = [];

  for (const row of rows) {
    const node: AgentRunBranch = {
      id: row.id,
      agent_name: row.agent_name,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_ms: row.duration_ms,
      children: [],
    };

    nodeMap.set(row.id, node);

    if (!row.parent_run_id) {
      rootNodes.push(node);
    }
  }

  for (const row of rows) {
    if (row.parent_run_id) {
      const parent = nodeMap.get(row.parent_run_id);
      const child = nodeMap.get(row.id);
      if (parent && child) {
        parent.children.push(child);
      }
    }
  }

  return rootNodes;
}

/**
 * Get workflow progress with parallel groups and feedback loops
 */
export function getWorkflowProgressExtended(workflowId: string): WorkflowProgressExtended | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  const workflowQuery = `
    SELECT
      w.id as workflow_id,
      w.task_description,
      w.status,
      COUNT(ws.id) as total_steps,
      SUM(CASE WHEN ws.status = 'completed' THEN 1 ELSE 0 END) as completed_steps,
      SUM(CASE WHEN ws.status = 'running' THEN 1 ELSE 0 END) as running_steps,
      SUM(CASE WHEN ws.status = 'failed' THEN 1 ELSE 0 END) as failed_steps
    FROM workflows w
    LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
    WHERE w.id = ?
    GROUP BY w.id
  `;

  const workflow = db.prepare(workflowQuery).get(workflowId) as WorkflowProgressExtended | undefined;
  if (!workflow) return null;

  const parallelGroups = getParallelGroups(workflowId);

  const groupsWithSteps: ParallelGroupWithSteps[] = parallelGroups.map((group) => {
    const stepsQuery = `
      SELECT
        ws.id,
        ws.workflow_id,
        ws.step_number,
        ws.agent_name,
        ws.task,
        ws.status,
        ws.started_at,
        ws.ended_at,
        ws.result
      FROM workflow_steps ws
      INNER JOIN parallel_group_steps pgs ON pgs.step_id = ws.id
      WHERE pgs.group_id = ?
      ORDER BY ws.step_number ASC
    `;

    const steps = db.prepare(stepsQuery).all(group.id) as WorkflowStep[];

    const stepsWithRuns: WorkflowStepWithRun[] = steps.map((step) => {
      const runQuery = `
        SELECT
          id,
          agent_name,
          status,
          started_at,
          ended_at,
          duration_ms
        FROM agent_runs
        WHERE id = ?
      `;

      const run = step.result
        ? (db.prepare(runQuery).get(step.result) as Omit<AgentRunBranch, "children"> | undefined)
        : null;

      return {
        ...step,
        agent_run: run ? { ...run, children: [] } : null,
      };
    });

    return {
      ...group,
      steps: stepsWithRuns,
    };
  });

  const currentFeedbackLoop = getCurrentFeedbackLoop();

  return {
    ...workflow,
    parallel_groups: groupsWithSteps,
    current_feedback_loop: currentFeedbackLoop,
  };
}

// ============================================================================
// Task Query Functions
// ============================================================================

/**
 * Run migration to add tasks tables
 * Uses writable connection for schema changes
 */
export function runTaskMigration(): boolean {
  const db = getAgentDb().getWritableConnection();
  if (!db) return false;

  try {
    // Create tasks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'pending' CHECK (status IN (
          'pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked'
        )),
        priority INTEGER DEFAULT 0,
        complexity TEXT CHECK (complexity IN ('trivial', 'simple', 'medium', 'complex', 'epic')),
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        estimated_duration_ms INTEGER,
        actual_duration_ms INTEGER,
        created_by TEXT,
        metadata TEXT
      )
    `);

    // Create task_sessions linking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_sessions (
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'primary' CHECK (role IN ('primary', 'continuation', 'review', 'fix')),
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        PRIMARY KEY (task_id, session_id)
      )
    `);

    // Create task_dependencies table
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        dependency_type TEXT DEFAULT 'blocks' CHECK (dependency_type IN (
          'blocks', 'related', 'continues', 'reviews'
        )),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_id, depends_on_task_id)
      )
    `);

    // Add task_id to agent_runs if not exists
    const columns = db.prepare("PRAGMA table_info(agent_runs)").all() as Array<{ name: string }>;
    if (!columns.some(col => col.name === "task_id")) {
      db.exec("ALTER TABLE agent_runs ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL");
    }

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_sessions_session ON task_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
    `);

    // Close writable connection after migration
    db.close();
    return true;
  } catch (error) {
    console.error("Failed to run task migration:", error);
    // Close connection even on error
    try { db.close(); } catch {}
    return false;
  }
}

/**
 * Get all tasks with progress information
 */
export function getTasks(filters: { status?: string; parentId?: string | null } = {}): TaskWithProgress[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const conditions: string[] = [];
  const params: (string | null)[] = [];

  if (filters.status) {
    conditions.push("t.status = ?");
    params.push(filters.status);
  }

  if (filters.parentId === null) {
    conditions.push("t.parent_task_id IS NULL");
  } else if (filters.parentId) {
    conditions.push("t.parent_task_id = ?");
    params.push(filters.parentId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      t.*,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as subtask_count,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') as completed_subtasks,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'in_progress') as in_progress_subtasks,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'failed') as failed_subtasks,
      (SELECT COUNT(*) FROM agent_runs WHERE task_id = t.id) as agent_run_count,
      CASE
        WHEN (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) = 0 THEN
          CASE t.status
            WHEN 'completed' THEN 100
            WHEN 'in_progress' THEN 50
            ELSE 0
          END
        ELSE
          CAST((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') AS REAL) /
          NULLIF((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id), 0) * 100
      END as progress_percent,
      0 as depth
    FROM tasks t
    ${whereClause}
    ORDER BY t.priority DESC, t.created_at DESC
  `;

  return db.prepare(query).all(...params) as TaskWithProgress[];
}

/**
 * Get a single task by ID with progress
 */
export function getTask(taskId: string): TaskWithProgress | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  const query = `
    SELECT
      t.*,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as subtask_count,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') as completed_subtasks,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'in_progress') as in_progress_subtasks,
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'failed') as failed_subtasks,
      (SELECT COUNT(*) FROM agent_runs WHERE task_id = t.id) as agent_run_count,
      CASE
        WHEN (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) = 0 THEN
          CASE t.status
            WHEN 'completed' THEN 100
            WHEN 'in_progress' THEN 50
            ELSE 0
          END
        ELSE
          CAST((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') AS REAL) /
          NULLIF((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id), 0) * 100
      END as progress_percent,
      0 as depth
    FROM tasks t
    WHERE t.id = ?
  `;

  return db.prepare(query).get(taskId) as TaskWithProgress | null;
}

/**
 * Get task hierarchy (task with all subtasks recursively)
 */
export function getTaskHierarchy(taskId: string): TaskHierarchy | null {
  const task = getTask(taskId);
  if (!task) return null;

  const subtasks = getTasks({ parentId: taskId });
  const dependencies = getTaskDependencies(taskId);

  return {
    task,
    subtasks: subtasks.map(st => getTaskHierarchy(st.id)!).filter(Boolean),
    dependencies,
  };
}

/**
 * Get task dependencies
 */
export function getTaskDependencies(taskId: string): TaskDependency[] {
  const db = getAgentDb().getConnection();
  if (!db) return [];

  const query = `
    SELECT
      task_id,
      depends_on_task_id,
      dependency_type,
      created_at
    FROM task_dependencies
    WHERE task_id = ? OR depends_on_task_id = ?
  `;

  return db.prepare(query).all(taskId, taskId) as TaskDependency[];
}

/**
 * Create a new task
 */
export function createTask(task: Omit<Task, "id" | "created_at">): Task | null {
  const db = getAgentDb().getWritableConnection();
  if (!db) return null;

  const id = crypto.randomUUID();

  const query = `
    INSERT INTO tasks (
      id, title, description, parent_task_id, status, priority,
      complexity, tags, started_at, completed_at, estimated_duration_ms,
      actual_duration_ms, created_by, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `;

  try {
    const result = db.prepare(query).get(
      id,
      task.title,
      task.description,
      task.parent_task_id,
      task.status || "pending",
      task.priority || 0,
      task.complexity,
      task.tags,
      task.started_at,
      task.completed_at,
      task.estimated_duration_ms,
      task.actual_duration_ms,
      task.created_by,
      task.metadata
    ) as Task;
    db.close();
    return result;
  } catch (error) {
    console.error("Failed to create task:", error);
    try { db.close(); } catch {}
    return null;
  }
}

/**
 * Update task status and timestamps
 */
export function updateTaskStatus(
  taskId: string,
  status: Task["status"],
  options: { started_at?: string; completed_at?: string; actual_duration_ms?: number } = {}
): boolean {
  const db = getAgentDb().getWritableConnection();
  if (!db) return false;

  const updates: string[] = ["status = ?"];
  const params: (string | number)[] = [status];

  if (options.started_at) {
    updates.push("started_at = ?");
    params.push(options.started_at);
  }

  if (options.completed_at) {
    updates.push("completed_at = ?");
    params.push(options.completed_at);
  }

  if (options.actual_duration_ms !== undefined) {
    updates.push("actual_duration_ms = ?");
    params.push(options.actual_duration_ms);
  }

  params.push(taskId);

  const query = `UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`;

  try {
    db.prepare(query).run(...params);
    db.close();
    return true;
  } catch (error) {
    console.error("Failed to update task status:", error);
    try { db.close(); } catch {}
    return false;
  }
}

/**
 * Link task to session
 */
export function linkTaskToSession(
  taskId: string,
  sessionId: string,
  role: "primary" | "continuation" | "review" | "fix" = "primary"
): boolean {
  const db = getAgentDb().getWritableConnection();
  if (!db) return false;

  const query = `
    INSERT OR REPLACE INTO task_sessions (task_id, session_id, role, started_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `;

  try {
    db.prepare(query).run(taskId, sessionId, role);
    db.close();
    return true;
  } catch (error) {
    console.error("Failed to link task to session:", error);
    try { db.close(); } catch {}
    return false;
  }
}

/**
 * Add task dependency
 */
export function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  dependencyType: TaskDependency["dependency_type"] = "blocks"
): boolean {
  const db = getAgentDb().getWritableConnection();
  if (!db) return false;

  const query = `
    INSERT OR REPLACE INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
    VALUES (?, ?, ?)
  `;

  try {
    db.prepare(query).run(taskId, dependsOnTaskId, dependencyType);
    db.close();
    return true;
  } catch (error) {
    console.error("Failed to add task dependency:", error);
    try { db.close(); } catch {}
    return false;
  }
}

/**
 * Get task flow data for visualization (similar to workflow flow)
 */
export function getTaskFlow(taskId?: string): { nodes: TaskFlowNode[]; mermaid: string } | null {
  const db = getAgentDb().getConnection();
  if (!db) return null;

  // Get all root tasks or subtasks of a specific task
  const query = taskId
    ? `
      WITH RECURSIVE task_tree AS (
        SELECT
          id, title, description, parent_task_id, status, priority, 0 as depth
        FROM tasks
        WHERE id = ?

        UNION ALL

        SELECT
          t.id, t.title, t.description, t.parent_task_id, t.status, t.priority, tt.depth + 1
        FROM tasks t
        INNER JOIN task_tree tt ON t.parent_task_id = tt.id
      )
      SELECT
        tt.*,
        (SELECT COUNT(*) FROM tasks WHERE parent_task_id = tt.id) as subtask_count,
        CASE
          WHEN (SELECT COUNT(*) FROM tasks WHERE parent_task_id = tt.id) = 0 THEN
            CASE tt.status WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END
          ELSE
            CAST((SELECT COUNT(*) FROM tasks WHERE parent_task_id = tt.id AND status = 'completed') AS REAL) /
            NULLIF((SELECT COUNT(*) FROM tasks WHERE parent_task_id = tt.id), 0) * 100
        END as progress_percent
      FROM task_tree tt
      ORDER BY tt.depth, tt.priority DESC
    `
    : `
      SELECT
        t.id, t.title, t.description, t.parent_task_id, t.status, t.priority, 0 as depth,
        (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as subtask_count,
        CASE
          WHEN (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) = 0 THEN
            CASE t.status WHEN 'completed' THEN 100 WHEN 'in_progress' THEN 50 ELSE 0 END
          ELSE
            CAST((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') AS REAL) /
            NULLIF((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id), 0) * 100
        END as progress_percent
      FROM tasks t
      WHERE t.parent_task_id IS NULL
      ORDER BY t.priority DESC, t.created_at DESC
      LIMIT 20
    `;

  const params = taskId ? [taskId] : [];
  const nodes = db.prepare(query).all(...params) as TaskFlowNode[];

  if (nodes.length === 0) {
    return null;
  }

  // Generate Mermaid
  const mermaid = generateTaskMermaid(nodes);

  return { nodes, mermaid };
}

/**
 * Generate Mermaid diagram for tasks
 */
function generateTaskMermaid(nodes: TaskFlowNode[]): string {
  const lines: string[] = ["flowchart TB"];

  // Status colors
  lines.push("  classDef pending fill:#f3f4f6,stroke:#9ca3af,color:#374151");
  lines.push("  classDef in_progress fill:#fef3c7,stroke:#f59e0b,color:#92400e");
  lines.push("  classDef completed fill:#d1fae5,stroke:#10b981,color:#065f46");
  lines.push("  classDef failed fill:#fee2e2,stroke:#ef4444,color:#991b1b");
  lines.push("");

  // Nodes
  for (const node of nodes) {
    const shortId = node.id.substring(0, 8);
    const label = sanitizeMermaidLabel(node.title);
    const progress = Math.round(node.progress_percent || 0);
    const subtaskInfo = node.subtask_count > 0 ? `\\n(${node.subtask_count} subtasks)` : "";

    if (node.subtask_count > 0) {
      // Task with subtasks - hexagon shape
      lines.push(`  ${shortId}{{"\`${label}\\n${progress}%${subtaskInfo}\`"}}`);
    } else {
      // Leaf task - rectangle
      lines.push(`  ${shortId}["\`${label}\\n${progress}%\`"]`);
    }
  }
  lines.push("");

  // Connections (parent -> child)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    if (node.parent_task_id && nodeMap.has(node.parent_task_id)) {
      const parentShort = node.parent_task_id.substring(0, 8);
      const childShort = node.id.substring(0, 8);
      lines.push(`  ${parentShort} --> ${childShort}`);
    }
  }
  lines.push("");

  // Apply styles
  for (const node of nodes) {
    const shortId = node.id.substring(0, 8);
    const statusClass = node.status.replace("-", "_");
    lines.push(`  class ${shortId} ${statusClass}`);
  }

  return lines.join("\n");
}
