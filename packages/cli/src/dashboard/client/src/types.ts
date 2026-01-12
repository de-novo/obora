export interface Session {
  id: string
  started_at: string
  ended_at: string | null
  status: 'active' | 'completed' | 'error'
  metadata: string | null
}

export interface Workflow {
  id: string
  session_id: string
  name: string
  description: string | null
  started_at: string
  ended_at: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  metadata: string | null
}

export interface AgentRun {
  id: string
  session_id: string
  workflow_id: string | null
  agent_name: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'error'
  started_at: string
  ended_at: string | null
  duration_ms: number | null
  result: string | null
  error: string | null
  metadata: string | null
}

export interface AgentStat {
  agent_name: string
  total_runs: number
  completed_runs: number
  failed_runs: number
  avg_duration_ms: number
  success_rate: number
}

export interface FileActivity {
  file_path: string
  access_count: number
  last_accessed: string
}

export interface RecentAction {
  id: string
  timestamp: string
  type: 'session' | 'workflow' | 'agent_run' | 'tool_call' | 'file_access'
  description: string
  status: string
  metadata: string | null
}

export interface CurrentActivity {
  session_id: string
  workflow_id: string | null
  agent_name: string
  task: string
  started_at: string
  duration_ms: number
}

export interface AgentRelationship {
  id: string
  parent_id: string | null
  agent_name: string
  description: string | null
  prompt: string | null
  output_summary: string | null
  status: string
  started_at: string
  duration_ms: number | null
  children_count: number
  depth: number
}
