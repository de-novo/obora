import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { Session, Workflow, AgentRelationship } from '../types'
import { FlowChart } from './FlowChart'
import { AgentDetailPanel } from './AgentDetailPanel'
import { formatDateTime, formatDuration, getStatusBadgeClass } from '../utils'

interface SessionDetailProps {
  id?: string
}

export const SessionDetail: FunctionalComponent<SessionDetailProps> = ({ id }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [agentRelationships, setAgentRelationships] = useState<AgentRelationship[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentRelationship | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const controller = new AbortController()

    const fetchData = async () => {
      try {
        setLoading(true)

        const [sessionsRes, workflowsRes, agentRelationshipsRes] = await Promise.all([
          fetch('/api/sessions', { signal: controller.signal }),
          fetch(`/api/workflows?sessionId=${id}`, { signal: controller.signal }),
          fetch(`/api/agent-relationships?sessionId=${id}`, { signal: controller.signal }),
        ])

        if (!sessionsRes.ok) {
          throw new Error(`Failed to fetch sessions: ${sessionsRes.status}`)
        }
        if (!workflowsRes.ok) {
          throw new Error(`Failed to fetch workflows: ${workflowsRes.status}`)
        }
        if (!agentRelationshipsRes.ok) {
          throw new Error(`Failed to fetch agent relationships: ${agentRelationshipsRes.status}`)
        }

        const sessionsResponse = await sessionsRes.json()
        const workflowsResponse = await workflowsRes.json()
        const agentRelationshipsResponse = await agentRelationshipsRes.json()

        if (!sessionsResponse.ok || !workflowsResponse.ok || !agentRelationshipsResponse.ok) {
          throw new Error('API returned error response')
        }

        const sessions: Session[] = sessionsResponse.data
        const workflows: Workflow[] = workflowsResponse.data
        const relationships: AgentRelationship[] = agentRelationshipsResponse.data

        const foundSession = sessions.find(s => s.id === id)
        if (!foundSession) {
          throw new Error('Session not found')
        }

        setSession(foundSession)
        setWorkflows(workflows)
        setAgentRelationships(relationships)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [id])


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

      {/* Original Request Section */}
      {session.initial_prompt && (
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 class="text-lg font-semibold mb-4">Original Request</h2>
          <div class="bg-blue-50 border border-blue-200 rounded p-4 text-sm whitespace-pre-wrap">
            {session.initial_prompt}
          </div>
        </div>
      )}

      {/* Workflow Flow Chart */}
      <div class="mb-8">
        <FlowChart sessionId={id || ''} />
      </div>

      {/* Agent Execution Summary */}
      {agentRelationships.length > 0 && (
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 class="text-lg font-semibold mb-4">Agent Execution Summary</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agentRelationships.map((agent) => (
              <div
                key={agent.id}
                class={`p-4 rounded border cursor-pointer transition-colors hover:bg-gray-50 ${
                  agent.status === 'completed'
                    ? 'border-green-200 bg-green-50'
                    : agent.status === 'failed'
                    ? 'border-red-200 bg-red-50'
                    : agent.status === 'running'
                    ? 'border-yellow-200 bg-yellow-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div class="flex justify-between items-start mb-2">
                  <div class="font-medium">{agent.agent_name}</div>
                  <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(agent.status)}`}>
                    {agent.status}
                  </span>
                </div>
                {agent.duration_ms && (
                  <div class="text-xs text-gray-500 mb-2">
                    Duration: {formatDuration(agent.duration_ms)}
                  </div>
                )}
                {(agent.description || agent.prompt) && (
                  <div class="text-sm text-gray-700 line-clamp-2">
                    {agent.description || agent.prompt}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 class="text-lg font-semibold mb-4">Session Information</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-500">Session ID</div>
            <div class="font-mono text-sm">{session.id}</div>
          </div>
          <div>
            <div class="text-sm text-gray-500">Status</div>
            <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(session.status)}`}>
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
                  <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(workflow.status)}`}>
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

      {/* Agent Detail Panel */}
      <AgentDetailPanel
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  )
}
