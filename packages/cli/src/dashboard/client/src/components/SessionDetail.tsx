import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { Session, Workflow } from '../types'
import { FlowChart } from './FlowChart'

interface SessionDetailProps {
  id?: string
}

export const SessionDetail: FunctionalComponent<SessionDetailProps> = ({ id }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const fetchData = async () => {
      try {
        setLoading(true)

        const [sessionsRes, workflowsRes] = await Promise.all([
          fetch('/api/sessions'),
          fetch(`/api/workflows?sessionId=${id}`),
        ])

        if (!sessionsRes.ok) {
          throw new Error(`Failed to fetch sessions: ${sessionsRes.status}`)
        }
        if (!workflowsRes.ok) {
          throw new Error(`Failed to fetch workflows: ${workflowsRes.status}`)
        }

        const sessionsResponse = await sessionsRes.json()
        const workflowsResponse = await workflowsRes.json()

        if (!sessionsResponse.ok || !workflowsResponse.ok) {
          throw new Error('API returned error response')
        }

        const sessions: Session[] = sessionsResponse.data
        const workflows: Workflow[] = workflowsResponse.data

        const foundSession = sessions.find(s => s.id === id)
        if (!foundSession) {
          throw new Error('Session not found')
        }

        setSession(foundSession)
        setWorkflows(workflows)
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

  if (loading) {
    return (
      <div class="p-8">
        <h1 class="text-3xl font-bold mb-8">Session Detail</h1>
        <div class="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div class="p-8">
        <button
          onClick={() => route('/sessions')}
          class="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to Sessions
        </button>
        <h1 class="text-3xl font-bold mb-8">Session Detail</h1>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error || 'Session not found'}
        </div>
      </div>
    )
  }

  return (
    <div class="p-8">
      <button
        onClick={() => route('/sessions')}
        class="mb-4 text-blue-600 hover:text-blue-800"
      >
        ← Back to Sessions
      </button>

      <h1 class="text-3xl font-bold mb-8">Session Detail</h1>

      {/* Workflow Flow Chart */}
      <div class="mb-8">
        <FlowChart sessionId={id || ''} />
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 class="text-lg font-semibold mb-4">Session Information</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-500">Session ID</div>
            <div class="font-mono text-sm">{session.id}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Status</div>
            <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(session.status)}`}>
              {session.status}
            </span>
          </div>
          <div>
            <div class="text-sm text-gray-500">Start Time</div>
            <div class="text-sm">{formatDateTime(session.started_at)}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">End Time</div>
            <div class="text-sm">{session.ended_at ? formatDateTime(session.ended_at) : 'Running'}</div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Workflows</h2>
        {workflows.length === 0 ? (
          <div class="text-gray-500">No workflows found</div>
        ) : (
          <div class="space-y-4">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => route(`/workflows/${workflow.id}`)}
              >
                <div class="flex justify-between items-start mb-2">
                  <div class="font-medium">{workflow.name}</div>
                  <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(workflow.status)}`}>
                    {workflow.status}
                  </span>
                </div>
                <div class="text-sm text-gray-500">
                  Started: {formatDateTime(workflow.started_at)}
                  {workflow.ended_at && ` • Ended: ${formatDateTime(workflow.ended_at)}`}
                </div>
                <div class="text-xs text-gray-400 font-mono mt-1">ID: {workflow.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
