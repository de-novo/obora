import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { Workflow, AgentRun } from '../types'

interface WorkflowDetailProps {
  id?: string
}

export const WorkflowDetail: FunctionalComponent<WorkflowDetailProps> = ({ id }) => {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      try {
        setLoading(true)

        const agentRunsRes = await fetch(`/api/agent-runs?workflowId=${id}`)

        if (!agentRunsRes.ok) {
          throw new Error(`Failed to fetch agent runs: ${agentRunsRes.status}`)
        }

        const agentRunsResponse = await agentRunsRes.json()

        if (!agentRunsResponse.ok) {
          throw new Error('API returned error response')
        }

        const agentRunsData: AgentRun[] = agentRunsResponse.data
        setAgentRuns(agentRunsData)

        if (agentRunsData.length > 0) {
          const workflowData: Workflow = {
            id: agentRunsData[0].workflow_id,
            session_id: '',
            name: 'Workflow',
            status: agentRunsData.some((run: AgentRun) => run.status === 'running') ? 'running' : 'completed',
            start_time: agentRunsData[0].start_time,
            end_time: agentRunsData[agentRunsData.length - 1].end_time,
          }
          setWorkflow(workflowData)
        }

        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('running') || statusLower.includes('active')) {
      return 'bg-green-100 text-green-800'
    }
    if (statusLower.includes('completed') || statusLower.includes('success')) {
      return 'bg-blue-100 text-blue-800'
    }
    if (statusLower.includes('failed') || statusLower.includes('error')) {
      return 'bg-red-100 text-red-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const calculateDuration = (start: string, end: string | null) => {
    if (!end) return 'Running...'
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const durationMs = endTime - startTime
    const seconds = Math.floor(durationMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (loading) {
    return (
      <div class="p-8">
        <h1 class="text-3xl font-bold mb-8">Workflow Detail</h1>
        <div class="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="p-8">
        <button
          onClick={() => window.history.back()}
          class="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← Back
        </button>
        <h1 class="text-3xl font-bold mb-8">Workflow Detail</h1>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <div class="p-8">
      <button
        onClick={() => window.history.back()}
        class="mb-4 text-blue-600 hover:text-blue-800"
      >
        ← Back
      </button>

      <h1 class="text-3xl font-bold mb-8">Workflow Detail</h1>

      {workflow && (
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 class="text-lg font-semibold mb-4">Workflow Information</h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-gray-500">Workflow ID</div>
              <div class="font-mono text-sm">{workflow.id}</div>
            </div>
            <div>
              <div class="text-sm text-gray-500">Status</div>
              <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(workflow.status)}`}>
                {workflow.status}
              </span>
            </div>
            <div>
              <div class="text-sm text-gray-500">Start Time</div>
              <div class="text-sm">{formatDateTime(workflow.start_time)}</div>
            </div>
            <div>
              <div class="text-sm text-gray-500">End Time</div>
              <div class="text-sm">{workflow.end_time ? formatDateTime(workflow.end_time) : 'Running'}</div>
            </div>
          </div>
        </div>
      )}

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Agent Runs</h2>
        {agentRuns.length === 0 ? (
          <div class="text-gray-500">No agent runs found</div>
        ) : (
          <div class="space-y-4">
            {agentRuns.map((run, index) => (
              <div key={run.id} class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-3">
                  <div class="flex items-center space-x-3">
                    <div class="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div class="font-medium">{run.agent_type}</div>
                  </div>
                  <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm ml-11">
                  <div>
                    <span class="text-gray-500">Started:</span> {formatDateTime(run.start_time)}
                  </div>
                  <div>
                    <span class="text-gray-500">Duration:</span> {calculateDuration(run.start_time, run.end_time)}
                  </div>
                </div>
                {run.result && (
                  <div class="mt-3 ml-11">
                    <div class="text-sm text-gray-500 mb-1">Result:</div>
                    <div class="text-sm bg-gray-50 p-3 rounded border border-gray-200 font-mono overflow-x-auto">
                      {run.result}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
