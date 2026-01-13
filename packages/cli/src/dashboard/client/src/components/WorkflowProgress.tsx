import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { AgentRunBranch } from '../types'

interface WorkflowProgressProps {
  workflowId: string | null
}

const statusColors: Record<string, string> = {
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  error: 'bg-red-500',
  pending: 'bg-gray-400',
}

const BranchNode: FunctionalComponent<{
  node: AgentRunBranch
  isLast: boolean
  prefix: string
  depth: number
}> = ({ node, isLast, prefix, depth }) => {
  const hasChildren = node.children.length > 0
  const connector = isLast ? '\u2514' : '\u251C'
  const childPrefix = prefix + (isLast ? '   ' : '\u2502  ')

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const isRunning = node.status === 'running'

  return (
    <div class="font-mono text-sm">
      <div
        class={`flex items-center py-1.5 px-2 rounded ${
          isRunning ? 'bg-blue-50 border-l-2 border-blue-500' : ''
        }`}
      >
        <span class="text-gray-400 whitespace-pre">{prefix}{connector} </span>

        <span class={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
          statusColors[node.status] || 'bg-gray-400'
        } ${isRunning ? 'animate-pulse' : ''}`} />

        <span class="font-semibold text-blue-600">{node.agent_name}</span>

        <span class="ml-auto flex items-center space-x-3 text-xs text-gray-400 flex-shrink-0">
          <span>{formatTime(node.started_at)}</span>
          <span class="w-12 text-right">{formatDuration(node.duration_ms)}</span>
          <span class={`px-1.5 py-0.5 rounded ${
            node.status === 'completed' ? 'bg-green-100 text-green-700' :
            node.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
            node.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {node.status}
          </span>
        </span>
      </div>

      {hasChildren && (
        <div>
          {node.children.map((child, idx) => (
            <BranchNode
              key={child.id}
              node={child}
              isLast={idx === node.children.length - 1}
              prefix={childPrefix}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const WorkflowProgress: FunctionalComponent<WorkflowProgressProps> = ({ workflowId }) => {
  const [branches, setBranches] = useState<AgentRunBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workflowId) {
      setLoading(false)
      return
    }

    const fetchBranches = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}/branches`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setBranches(result.data || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch branches')
      } finally {
        setLoading(false)
      }
    }

    fetchBranches()
    const interval = setInterval(fetchBranches, 3000)
    return () => clearInterval(interval)
  }, [workflowId])

  if (!workflowId) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Current Workflow Progress</h2>
        <div class="text-gray-500 text-center py-8">No active workflow</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Current Workflow Progress</h2>
        <div class="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Current Workflow Progress</h2>
        <div class="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Current Workflow Progress</h2>
      {branches.length === 0 ? (
        <div class="text-gray-500">No workflow steps found</div>
      ) : (
        <div class="overflow-x-auto max-h-96 overflow-y-auto border rounded-lg p-2">
          {branches.map((branch, idx) => (
            <BranchNode
              key={branch.id}
              node={branch}
              isLast={idx === branches.length - 1}
              prefix=""
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
