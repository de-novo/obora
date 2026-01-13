import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { Workflow, FeedbackLoop } from '../types'

type TabType = 'current' | 'past'

interface WorkflowWithFeedback extends Workflow {
  feedback_loops?: FeedbackLoop[]
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-700 animate-pulse'
    case 'completed':
      return 'bg-green-100 text-green-700'
    case 'failed':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

const formatDateTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getFeedbackSummary = (loops: FeedbackLoop[] | undefined) => {
  if (!loops || loops.length === 0) return null

  const mainLoop = loops[0]
  const status = mainLoop.status
  const iterations = mainLoop.iteration

  if (status === 'passed') {
    return (
      <span class="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded">
        FB: passed ({iterations} iteration{iterations > 1 ? 's' : ''})
      </span>
    )
  } else if (status === 'failed' || status === 'max_reached') {
    return (
      <span class="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded">
        FB: failed ({iterations} iteration{iterations > 1 ? 's' : ''})
      </span>
    )
  } else {
    return (
      <span class="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded animate-pulse">
        FB: in progress ({iterations})
      </span>
    )
  }
}

export const WorkflowHistory: FunctionalComponent = () => {
  const [activeTab, setActiveTab] = useState<TabType>('current')
  const [workflows, setWorkflows] = useState<WorkflowWithFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const abortController = new AbortController()
    let isMounted = true

    const fetchWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows', {
          signal: abortController.signal,
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }

        const workflowsData = result.data || []

        const workflowsWithFeedback = await Promise.all(
          workflowsData.map(async (workflow: Workflow) => {
            try {
              const fbResponse = await fetch(`/api/feedback-loops?workflowId=${workflow.id}`, {
                signal: abortController.signal,
              })
              if (fbResponse.ok) {
                const fbResult = await fbResponse.json()
                return {
                  ...workflow,
                  feedback_loops: fbResult.ok ? fbResult.data : [],
                }
              }
            } catch {
              // Ignore feedback loop fetch errors (including aborts)
            }
            return { ...workflow, feedback_loops: [] }
          })
        )

        if (isMounted) {
          setWorkflows(workflowsWithFeedback)
          setError(null)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch workflows')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchWorkflows()
    const interval = setInterval(fetchWorkflows, 5000)

    return () => {
      isMounted = false
      abortController.abort()
      clearInterval(interval)
    }
  }, [])

  const currentWorkflows = workflows.filter(w => w.status === 'running')
  const pastWorkflows = workflows.filter(w => w.status === 'completed' || w.status === 'failed')

  const displayWorkflows = activeTab === 'current' ? currentWorkflows : pastWorkflows

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Workflows</h2>
        <div class="flex space-x-2">
          <button
            onClick={() => setActiveTab('current')}
            class={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === 'current'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => setActiveTab('past')}
            class={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === 'past'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Past
          </button>
        </div>
      </div>

      {loading ? (
        <div class="text-gray-500 text-center py-8">Loading...</div>
      ) : error ? (
        <div class="text-red-500 text-sm">Error: {error}</div>
      ) : displayWorkflows.length === 0 ? (
        <div class="text-gray-500 text-center py-8">
          No {activeTab} workflows
        </div>
      ) : (
        <div class="space-y-2 max-h-96 overflow-y-auto">
          {displayWorkflows.map((workflow) => (
            <div
              key={workflow.id}
              class="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => {
                // Navigate to workflow detail - placeholder for now
                console.log('Navigate to workflow:', workflow.id)
              }}
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                  <div class="font-medium text-sm truncate">
                    {workflow.description || workflow.name || 'Unnamed workflow'}
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    {formatDateTime(workflow.started_at)}
                  </div>
                </div>
                <span class={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ml-2 ${statusBadgeClass(workflow.status)}`}>
                  {workflow.status}
                </span>
              </div>

              {workflow.feedback_loops && workflow.feedback_loops.length > 0 && (
                <div class="mt-2">
                  {getFeedbackSummary(workflow.feedback_loops)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
