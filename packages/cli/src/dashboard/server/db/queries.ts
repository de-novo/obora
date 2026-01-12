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
      metadata
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

  const sessionFilter = sessionId ? `AND ar.session_id = '${sessionId}'` : "";

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
    WHERE 1=1 ${sessionFilter}
    ORDER BY ar.started_at DESC
    LIMIT 100
  `;

  return db.prepare(query).all() as AgentRelationship[];
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

  // Generate Mermaid flowchart
  const mermaid = generateMermaidFlowchart(nodes);

  return {
    sessionId,
    nodes,
    mermaid,
  };
}

/**
 * Generate Mermaid flowchart syntax from workflow nodes
 */
function generateMermaidFlowchart(nodes: WorkflowFlowNode[]): string {
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
    const label = node.description
      ? `${node.agent_name}\\n${truncate(node.description, 30)}`
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
