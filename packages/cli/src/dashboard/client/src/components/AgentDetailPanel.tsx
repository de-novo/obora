import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { AgentDetailPanelProps, ToolCall } from '../types'
import { formatDuration, getStatusBadgeClass } from '../utils'

export const AgentDetailPanel: FunctionalComponent<AgentDetailPanelProps> = ({ agent, onClose }) => {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch tool calls when agent changes
  useEffect(() => {
    if (!agent) {
      setToolCalls([])
      return
    }

    const controller = new AbortController()

    const fetchToolCalls = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/agent-runs/${agent.id}/tools`, {
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`Failed to fetch tool calls: ${res.status}`)
        }

        const response = await res.json()
        if (response.ok) {
          setToolCalls(response.data)
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to fetch tool calls:', err)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchToolCalls()

    return () => {
      controller.abort()
    }
  }, [agent?.id])

  // Handle ESC key to close modal
  useEffect(() => {
    if (!agent) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [agent, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (agent) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [agent])

  if (!agent) return null

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div class="flex justify-between items-center p-6 border-b">
          <h2 class="text-xl font-semibold">Agent Details</h2>
          <button
            onClick={onClose}
            class="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="overflow-y-auto p-6 space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-gray-500">Agent Name</div>
              <div class="font-medium">{agent.agent_name}</div>
            </div>
            <div>
              <div class="text-sm text-gray-500">Status</div>
              <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(agent.status)}`}>
                {agent.status}
              </span>
            </div>
            <div>
              <div class="text-sm text-gray-500">Duration</div>
              <div class="text-sm">{formatDuration(agent.duration_ms)}</div>
            </div>
            <div>
              <div class="text-sm text-gray-500">Started At</div>
              <div class="text-sm">{new Date(agent.started_at).toLocaleString()}</div>
            </div>
          </div>

          {agent.prompt && (
            <div>
              <div class="text-sm font-semibold text-gray-700 mb-2">Task</div>
              <div class="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">{agent.prompt}</div>
            </div>
          )}

          {agent.description && (
            <div>
              <div class="text-sm font-semibold text-gray-700 mb-2">Description</div>
              <div class="bg-gray-50 rounded p-3 text-sm">{agent.description}</div>
            </div>
          )}

          {agent.output_summary && (
            <div>
              <div class="text-sm font-semibold text-gray-700 mb-2">Output Summary</div>
              <div class="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">{agent.output_summary}</div>
            </div>
          )}

          <div>
            <div class="text-sm font-semibold text-gray-700 mb-2">Tools Used</div>
            {loading ? (
              <div class="text-sm text-gray-500">Loading tools...</div>
            ) : toolCalls.length === 0 ? (
              <div class="text-sm text-gray-500">No tools used</div>
            ) : (
              <div class="space-y-2">
                {toolCalls.map((tool) => (
                  <div
                    key={tool.id}
                    class="border border-gray-200 rounded p-3 text-sm"
                  >
                    <div class="flex justify-between items-start mb-1">
                      <div class="font-medium">{tool.tool_name}</div>
                      <span class={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(tool.status)}`}>
                        {tool.status}
                      </span>
                    </div>
                    {tool.duration_ms && (
                      <div class="text-xs text-gray-500">
                        Duration: {formatDuration(tool.duration_ms)}
                      </div>
                    )}
                    {tool.error_message && (
                      <div class="text-xs text-red-600 mt-1">
                        Error: {tool.error_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
