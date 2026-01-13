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

const complexityLabels: Record<string, { label: string; color: string }> = {
  trivial: { label: 'Trivial', color: 'text-gray-500' },
  simple: { label: 'Simple', color: 'text-green-600' },
  medium: { label: 'Medium', color: 'text-blue-600' },
  complex: { label: 'Complex', color: 'text-orange-600' },
  epic: { label: 'Epic', color: 'text-purple-600' },
}

const StatusBadge: FunctionalComponent<{ status: string }> = ({ status }) => {
  const colors = statusColors[status] || statusColors.pending
  return (
    <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

const ProgressBar: FunctionalComponent<{ percent: number; status: string }> = ({ percent, status }) => {
  const barColor = status === 'failed' ? 'bg-red-500'
    : status === 'completed' ? 'bg-green-500'
    : status === 'in_progress' ? 'bg-blue-500'
    : 'bg-gray-300'

  return (
    <div class="w-full bg-gray-200 rounded-full h-2">
      <div
        class={`${barColor} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  )
}

export const TaskList: FunctionalComponent = () => {
  const [tasks, setTasks] = useState<TaskWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      params.append('root', 'true')

      const response = await fetch(`/api/tasks?${params}`)
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
  }, [statusFilter])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
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
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <div class="p-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold">Tasks</h1>
        <div class="flex items-center space-x-4">
          <select
            class="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
          </select>
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            onClick={() => setShowCreateModal(true)}
          >
            + New Task
          </button>
        </div>
      </div>

      {error && (
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div class="flex justify-center items-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div class="text-center py-12 bg-white rounded-lg shadow">
          <div class="text-gray-400 text-6xl mb-4">&#128203;</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No tasks yet</h3>
          <p class="text-gray-500 mb-4">Create your first task to get started</p>
          <button
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={() => setShowCreateModal(true)}
          >
            Create Task
          </button>
        </div>
      ) : (
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Complexity
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {tasks.map((task) => (
                <tr key={task.id} class="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/tasks/${task.id}`}>
                  <td class="px-6 py-4">
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-gray-900">{task.title}</span>
                      {task.description && (
                        <span class="text-sm text-gray-500 truncate max-w-xs">{task.description}</span>
                      )}
                      {task.subtask_count > 0 && (
                        <span class="text-xs text-gray-400 mt-1">
                          {task.subtask_count} subtask{task.subtask_count !== 1 ? 's' : ''}
                          ({task.completed_subtasks} completed)
                        </span>
                      )}
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={task.status} />
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="w-32">
                      <ProgressBar percent={task.progress_percent} status={task.status} />
                      <span class="text-xs text-gray-500 mt-1">{Math.round(task.progress_percent)}%</span>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    {task.complexity && (
                      <span class={`text-sm ${complexityLabels[task.complexity]?.color || 'text-gray-500'}`}>
                        {complexityLabels[task.complexity]?.label || task.complexity}
                      </span>
                    )}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(task.created_at)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDuration(task.actual_duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            fetchTasks()
          }}
        />
      )}
    </div>
  )
}

interface CreateTaskModalProps {
  onClose: () => void
  onCreated: () => void
  parentTaskId?: string
}

const CreateTaskModal: FunctionalComponent<CreateTaskModalProps> = ({ onClose, onCreated, parentTaskId }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [complexity, setComplexity] = useState<string>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          complexity,
          parent_task_id: parentTaskId || null,
        }),
      })

      const result = await response.json()
      if (!result.ok) {
        throw new Error(result.error || 'Failed to create task')
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 class="text-xl font-bold mb-4">
          {parentTaskId ? 'Create Subtask' : 'Create New Task'}
        </h2>

        {error && (
          <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
              placeholder="Enter task title"
              required
            />
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              rows={3}
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder="Optional description"
            />
          </div>

          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
            <select
              class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={complexity}
              onChange={(e) => setComplexity((e.target as HTMLSelectElement).value)}
            >
              <option value="trivial">Trivial</option>
              <option value="simple">Simple</option>
              <option value="medium">Medium</option>
              <option value="complex">Complex</option>
              <option value="epic">Epic</option>
            </select>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              type="button"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={submitting || !title.trim()}
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { CreateTaskModal }
