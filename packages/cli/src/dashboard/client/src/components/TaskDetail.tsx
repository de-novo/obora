import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { TaskHierarchy, AgentRun } from '../types'
import { CreateTaskModal } from './TaskList'

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
  blocked: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
}

const StatusBadge: FunctionalComponent<{ status: string }> = ({ status }) => {
  const colors = statusColors[status] || statusColors.pending
  return (
    <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

interface TaskDetailProps {
  path?: string
  id?: string
}

export const TaskDetail: FunctionalComponent<TaskDetailProps> = ({ id }) => {
  const [task, setTask] = useState<TaskHierarchy | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'subtasks' | 'flow' | 'agents'>('subtasks')

  const fetchTask = async () => {
    if (!id) return

    try {
      const response = await fetch(`/api/tasks/${id}/hierarchy`)
      const result = await response.json()

      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch task')
      }

      // Transform API response to TaskHierarchy format
      const transformToHierarchy = (data: any): TaskHierarchy => ({
        ...data.task,
        children: (data.subtasks || []).map((subtask: any) => transformToHierarchy(subtask))
      })

      setTask(transformToHierarchy(result.data))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchAgentRuns = async () => {
    if (!id) return

    try {
      const response = await fetch(`/api/agent-runs?taskId=${id}`)
      const result = await response.json()

      if (result.ok) {
        setAgentRuns(result.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch agent runs:', err)
    }
  }

  useEffect(() => {
    fetchTask()
    fetchAgentRuns()
    const interval = setInterval(() => {
      fetchTask()
      fetchAgentRuns()
    }, 3000)
    return () => clearInterval(interval)
  }, [id])

  const updateStatus = async (newStatus: string) => {
    if (!id) return

    try {
      const response = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      const result = await response.json()
      if (!result.ok) {
        throw new Error(result.error || 'Failed to update status')
      }

      fetchTask()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
  }

  if (loading) {
    return (
      <div class="p-8 flex justify-center items-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div class="p-8">
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Task not found'}
        </div>
        <a href="/tasks" class="mt-4 inline-block text-blue-600 hover:text-blue-800">
          &larr; Back to Tasks
        </a>
      </div>
    )
  }

  return (
    <div class="p-8">
      {/* Breadcrumb */}
      <nav class="text-sm mb-6">
        <a href="/tasks" class="text-blue-600 hover:text-blue-800">Tasks</a>
        <span class="mx-2 text-gray-400">/</span>
        <span class="text-gray-600">{task.title}</span>
      </nav>

      {/* Header */}
      <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-2xl font-bold">{task.title}</h1>
              <StatusBadge status={task.status} />
            </div>
            {task.description && (
              <p class="text-gray-600 mb-4">{task.description}</p>
            )}
            <div class="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>Created: {formatDate(task.created_at)}</span>
              {task.started_at && <span>Started: {formatDate(task.started_at)}</span>}
              {task.completed_at && <span>Completed: {formatDate(task.completed_at)}</span>}
              {task.actual_duration && <span>Duration: {formatDuration(task.actual_duration)}</span>}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <select
              class="rounded-md border-gray-300 shadow-sm text-sm"
              value={task.status}
              onChange={(e) => updateStatus((e.target as HTMLSelectElement).value)}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
            </select>
            <button
              class="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              onClick={() => setShowCreateModal(true)}
            >
              + Add Subtask
            </button>
          </div>
        </div>

        {/* Progress */}
        <div class="mt-6">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-gray-600">Progress</span>
            <span class="font-medium">{Math.round(task.progress_percent)}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div
              class={`h-3 rounded-full transition-all duration-300 ${
                task.status === 'failed' ? 'bg-red-500'
                : task.status === 'completed' ? 'bg-green-500'
                : 'bg-blue-500'
              }`}
              style={{ width: `${task.progress_percent}%` }}
            />
          </div>
          <div class="flex justify-between text-xs text-gray-500 mt-2">
            <span>{task.completed_subtasks} of {task.subtask_count} subtasks completed</span>
            {task.in_progress_subtasks > 0 && (
              <span class="text-blue-600">{task.in_progress_subtasks} in progress</span>
            )}
            {task.failed_subtasks > 0 && (
              <span class="text-red-600">{task.failed_subtasks} failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div class="border-b border-gray-200 mb-6">
        <nav class="flex space-x-8">
          <button
            class={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'subtasks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('subtasks')}
          >
            Subtasks ({task.children?.length || 0})
          </button>
          <button
            class={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'flow'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('flow')}
          >
            Flow Chart
          </button>
          <button
            class={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'agents'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('agents')}
          >
            Agent Runs ({agentRuns.length})
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'subtasks' && (
        <SubtaskList
          subtasks={task.children || []}
          onAddSubtask={() => setShowCreateModal(true)}
        />
      )}

      {activeTab === 'flow' && (
        <div class="bg-white rounded-lg shadow-sm p-4">
          <TaskFlowChart task={task} />
        </div>
      )}

      {activeTab === 'agents' && (
        <AgentRunList runs={agentRuns} />
      )}

      {showCreateModal && (
        <CreateTaskModal
          parentTaskId={task.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchTask()
          }}
        />
      )}
    </div>
  )
}

interface SubtaskListProps {
  subtasks: TaskHierarchy[]
  onAddSubtask: () => void
  depth?: number
}

const SubtaskList: FunctionalComponent<SubtaskListProps> = ({ subtasks, onAddSubtask, depth = 0 }) => {
  if (subtasks.length === 0) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-8 text-center">
        <div class="text-gray-400 text-4xl mb-4">&#128221;</div>
        <p class="text-gray-600 mb-4">No subtasks yet</p>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          onClick={onAddSubtask}
        >
          Add Subtask
        </button>
      </div>
    )
  }

  return (
    <div class="space-y-3">
      {subtasks.map((subtask) => (
        <SubtaskCard key={subtask.id} task={subtask} depth={depth} />
      ))}
    </div>
  )
}

interface SubtaskCardProps {
  task: TaskHierarchy
  depth: number
}

const SubtaskCard: FunctionalComponent<SubtaskCardProps> = ({ task, depth }) => {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = task.children && task.children.length > 0

  return (
    <div class={`bg-white rounded-lg shadow-sm ${depth > 0 ? 'ml-8 border-l-2 border-gray-200' : ''}`}>
      <div
        class="p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            {hasChildren && (
              <button class="text-gray-400 hover:text-gray-600">
                {expanded ? '▼' : '▶'}
              </button>
            )}
            <div>
              <a
                href={`/tasks/${task.id}`}
                class="font-medium text-gray-900 hover:text-blue-600"
                onClick={(e) => e.stopPropagation()}
              >
                {task.title}
              </a>
              {task.description && (
                <p class="text-sm text-gray-500 mt-1">{task.description}</p>
              )}
            </div>
          </div>
          <div class="flex items-center gap-4">
            <StatusBadge status={task.status} />
            {task.subtask_count > 0 && (
              <span class="text-sm text-gray-500">
                {task.completed_subtasks}/{task.subtask_count}
              </span>
            )}
          </div>
        </div>

        {/* Mini progress bar */}
        {task.subtask_count > 0 && (
          <div class="mt-2 w-full bg-gray-200 rounded-full h-1">
            <div
              class="bg-blue-500 h-1 rounded-full"
              style={{ width: `${task.progress_percent}%` }}
            />
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div class="pb-4 pr-4">
          <SubtaskList subtasks={task.children} onAddSubtask={() => {}} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

interface TaskFlowChartProps {
  task: TaskHierarchy
}

// Status colors for SVG
const svgStatusColors: Record<string, { bg: string; border: string; text: string }> = {
  pending: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
  in_progress: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  completed: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  failed: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  cancelled: { bg: '#e5e7eb', border: '#6b7280', text: '#4b5563' },
  blocked: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
}

interface NodePosition {
  task: TaskHierarchy
  x: number
  y: number
  parentX?: number
  parentY?: number
}

const TaskFlowChart: FunctionalComponent<TaskFlowChartProps> = ({ task }) => {
  const nodeWidth = 180
  const nodeHeight = 60
  const levelGap = 100
  const siblingGap = 20

  // Calculate tree layout
  const calculatePositions = (
    node: TaskHierarchy,
    x: number,
    y: number,
    parentX?: number,
    parentY?: number
  ): NodePosition[] => {
    const positions: NodePosition[] = [{ task: node, x, y, parentX, parentY }]

    if (node.children && node.children.length > 0) {
      const totalWidth = node.children.length * nodeWidth + (node.children.length - 1) * siblingGap
      let startX = x - totalWidth / 2 + nodeWidth / 2

      for (const child of node.children) {
        const childPositions = calculatePositions(
          child,
          startX,
          y + nodeHeight + levelGap,
          x,
          y + nodeHeight
        )
        positions.push(...childPositions)
        startX += nodeWidth + siblingGap
      }
    }

    return positions
  }

  const positions = calculatePositions(task, 250, 40)

  // Calculate SVG dimensions
  const maxX = Math.max(...positions.map(p => p.x)) + nodeWidth / 2 + 40
  const maxY = Math.max(...positions.map(p => p.y)) + nodeHeight + 40
  const minX = Math.min(...positions.map(p => p.x)) - nodeWidth / 2 - 40
  const svgWidth = maxX - minX
  const svgHeight = maxY

  // Adjust positions to account for minX offset
  const offsetX = -minX

  return (
    <div class="overflow-auto" style={{ maxHeight: '500px' }}>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMin meet"
      >
        {/* Background pattern */}
        <defs>
          <pattern id="task-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="#e5e7eb" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#task-grid)" />

        {/* Connection lines */}
        {positions.filter(p => p.parentX !== undefined).map((pos, idx) => {
          const fromX = (pos.parentX || 0) + offsetX
          const fromY = pos.parentY || 0
          const toX = pos.x + offsetX
          const toY = pos.y
          const midY = (fromY + toY) / 2

          return (
            <path
              key={`line-${idx}`}
              d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
            />
          )
        })}

        {/* Task nodes */}
        {positions.map((pos, idx) => {
          const colors = svgStatusColors[pos.task.status] || svgStatusColors.pending
          const adjustedX = pos.x + offsetX

          return (
            <g key={`node-${idx}`} transform={`translate(${adjustedX - nodeWidth / 2}, ${pos.y})`}>
              {/* Shadow */}
              <rect
                x="2" y="2"
                width={nodeWidth}
                height={nodeHeight}
                rx="8"
                fill="rgba(0,0,0,0.08)"
              />
              {/* Background */}
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx="8"
                fill={colors.bg}
                stroke={colors.border}
                strokeWidth="2"
              />
              {/* Content */}
              <foreignObject x="0" y="0" width={nodeWidth} height={nodeHeight}>
                <div style={{
                  padding: '8px 12px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}>
                  <span style={{
                    fontWeight: 600,
                    fontSize: '12px',
                    color: colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {pos.task.title}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '9999px',
                      backgroundColor: colors.border + '33',
                      color: colors.text,
                    }}>
                      {pos.task.status.replace('_', ' ')}
                    </span>
                    {pos.task.subtask_count > 0 && (
                      <span style={{ fontSize: '10px', color: colors.text, opacity: 0.7 }}>
                        {pos.task.completed_subtasks}/{pos.task.subtask_count}
                      </span>
                    )}
                  </div>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface AgentRunListProps {
  runs: AgentRun[]
}

const AgentRunList: FunctionalComponent<AgentRunListProps> = ({ runs }) => {
  if (runs.length === 0) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-8 text-center">
        <div class="text-gray-400 text-4xl mb-4">&#129302;</div>
        <p class="text-gray-600">No agent runs associated with this task yet</p>
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div class="bg-white rounded-lg shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          {runs.map((run) => (
            <tr key={run.id} class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="font-medium text-gray-900">{run.agent_name}</span>
              </td>
              <td class="px-6 py-4">
                <span class="text-sm text-gray-600 line-clamp-2">{run.task}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={run.status} />
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(run.started_at)}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDuration(run.duration_ms)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
