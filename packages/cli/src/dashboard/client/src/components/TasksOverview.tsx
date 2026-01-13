import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { TaskWithProgress } from '../types'

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
    <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

const ProgressRing: FunctionalComponent<{ percent: number; size?: number; status: string }> = ({
  percent,
  size = 40,
  status
}) => {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (percent / 100) * circumference

  const ringColor = status === 'failed' ? '#ef4444'
    : status === 'completed' ? '#10b981'
    : status === 'in_progress' ? '#3b82f6'
    : '#9ca3af'

  return (
    <div class="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} class="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          class="transition-all duration-500"
        />
      </svg>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xs font-medium text-gray-600">{Math.round(percent)}%</span>
      </div>
    </div>
  )
}

export const TasksOverview: FunctionalComponent = () => {
  const [tasks, setTasks] = useState<TaskWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = async () => {
    try {
      // Get all root tasks (not subtasks)
      const response = await fetch('/api/tasks?root=true')
      const result = await response.json()

      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch tasks')
      }

      setTasks(result.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  // Calculate summary stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }

  const overallProgress = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  if (loading) {
    return (
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Tasks Overview</h2>
        <div class="flex items-center justify-center h-32">
          <div class="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Tasks Overview</h2>
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <h2 class="text-lg font-semibold text-gray-800">Tasks Overview</h2>
        <a
          href="/tasks"
          class="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View All &rarr;
        </a>
      </div>

      {/* Summary Stats */}
      <div class="px-6 py-4 bg-gray-50 border-b border-gray-100">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-3">
              <ProgressRing percent={overallProgress} size={48} status={stats.failed > 0 ? 'failed' : stats.completed === stats.total && stats.total > 0 ? 'completed' : 'in_progress'} />
              <div>
                <div class="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div class="text-xs text-gray-500">Total Tasks</div>
              </div>
            </div>
            <div class="h-10 w-px bg-gray-200" />
            <div class="flex gap-4 text-sm">
              <div class="text-center">
                <div class="text-lg font-semibold text-green-600">{stats.completed}</div>
                <div class="text-xs text-gray-500">Completed</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-blue-600">{stats.inProgress}</div>
                <div class="text-xs text-gray-500">In Progress</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-gray-600">{stats.pending}</div>
                <div class="text-xs text-gray-500">Pending</div>
              </div>
              {stats.failed > 0 && (
                <div class="text-center">
                  <div class="text-lg font-semibold text-red-600">{stats.failed}</div>
                  <div class="text-xs text-gray-500">Failed</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div class="divide-y divide-gray-100 max-h-80 overflow-y-auto">
        {tasks.length === 0 ? (
          <div class="px-6 py-8 text-center">
            <div class="text-gray-400 text-3xl mb-2">&#128203;</div>
            <p class="text-gray-500 text-sm">No tasks yet</p>
            <a
              href="/tasks"
              class="mt-3 inline-block text-sm text-blue-600 hover:text-blue-800"
            >
              Create your first task &rarr;
            </a>
          </div>
        ) : (
          tasks.slice(0, 5).map((task) => (
            <a
              key={task.id}
              href={`/tasks/${task.id}`}
              class="block px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4 min-w-0 flex-1">
                  <ProgressRing percent={task.progress_percent} size={36} status={task.status} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900 truncate">{task.title}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    {task.description && (
                      <p class="text-sm text-gray-500 truncate mt-0.5">{task.description}</p>
                    )}
                    {task.subtask_count > 0 && (
                      <p class="text-xs text-gray-400 mt-1">
                        {task.completed_subtasks}/{task.subtask_count} subtasks completed
                      </p>
                    )}
                  </div>
                </div>
                <div class="text-gray-400 ml-4">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </a>
          ))
        )}
        {tasks.length > 5 && (
          <div class="px-6 py-3 bg-gray-50 text-center">
            <a href="/tasks" class="text-sm text-blue-600 hover:text-blue-800">
              +{tasks.length - 5} more tasks
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
