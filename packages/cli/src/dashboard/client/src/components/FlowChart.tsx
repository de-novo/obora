import { FunctionalComponent } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'

interface WorkflowFlowNode {
  id: string
  agent_name: string
  description: string | null
  status: string
  duration_ms: number | null
  started_at: string
  parent_id: string | null
  depth: number
}

interface WorkflowFlow {
  sessionId: string
  nodes: WorkflowFlowNode[]
  mermaid: string
}

interface FlowChartProps {
  sessionId: string
}

export const FlowChart: FunctionalComponent<FlowChartProps> = ({ sessionId }) => {
  const [flow, setFlow] = useState<WorkflowFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mermaidReady, setMermaidReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load Mermaid library
  useEffect(() => {
    const loadMermaid = async () => {
      if ((window as any).mermaid) {
        setMermaidReady(true)
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
      script.async = true
      script.onload = () => {
        const mermaid = (window as any).mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis',
          },
        })
        setMermaidReady(true)
      }
      document.head.appendChild(script)
    }

    loadMermaid()
  }, [])

  // Fetch flow data
  useEffect(() => {
    if (!sessionId) return

    const fetchFlow = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/workflow-flow?sessionId=${sessionId}`)

        if (!res.ok) {
          if (res.status === 404) {
            setFlow(null)
            setError(null)
            return
          }
          throw new Error(`Failed to fetch flow: ${res.status}`)
        }

        const response = await res.json()

        if (!response.ok) {
          throw new Error(response.error || 'API error')
        }

        setFlow(response.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch flow')
      } finally {
        setLoading(false)
      }
    }

    fetchFlow()
  }, [sessionId])

  // Render Mermaid diagram
  useEffect(() => {
    if (!mermaidReady || !flow?.mermaid || !containerRef.current) return

    const renderDiagram = async () => {
      const mermaid = (window as any).mermaid

      try {
        containerRef.current!.innerHTML = ''

        const { svg } = await mermaid.render(`flowchart-${sessionId}`, flow.mermaid)
        containerRef.current!.innerHTML = svg
      } catch (err) {
        console.error('Mermaid render error:', err)
        // Fallback to showing raw mermaid code
        containerRef.current!.innerHTML = `
          <pre class="bg-gray-100 p-4 rounded text-sm overflow-auto">${flow.mermaid}</pre>
        `
      }
    }

    renderDiagram()
  }, [mermaidReady, flow?.mermaid, sessionId])

  if (loading) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Workflow Flow</h2>
        <div class="text-gray-500 text-center py-8">Loading flow chart...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Workflow Flow</h2>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      </div>
    )
  }

  if (!flow || flow.nodes.length === 0) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Workflow Flow</h2>
        <div class="text-gray-500 text-center py-8">No workflow data available</div>
      </div>
    )
  }

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold">Workflow Flow</h2>
        <div class="flex items-center space-x-4 text-xs">
          <div class="flex items-center">
            <span class="w-3 h-3 rounded bg-green-200 border border-green-500 mr-1"></span>
            <span class="text-gray-600">Completed</span>
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 rounded bg-yellow-200 border border-yellow-500 mr-1"></span>
            <span class="text-gray-600">Running</span>
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 rounded bg-red-200 border border-red-500 mr-1"></span>
            <span class="text-gray-600">Failed</span>
          </div>
        </div>
      </div>

      <div class="border border-gray-200 rounded-lg p-4 overflow-auto" style={{ minHeight: '300px' }}>
        <div ref={containerRef} class="flex justify-center">
          {!mermaidReady && <div class="text-gray-500">Loading diagram renderer...</div>}
        </div>
      </div>

      <div class="mt-4">
        <h3 class="text-sm font-medium text-gray-700 mb-2">Agent Execution Summary</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          {flow.nodes.map((node) => (
            <div
              key={node.id}
              class={`p-2 rounded text-xs ${
                node.status === 'completed'
                  ? 'bg-green-50 border border-green-200'
                  : node.status === 'failed'
                  ? 'bg-red-50 border border-red-200'
                  : node.status === 'running'
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div class="font-medium truncate">{node.agent_name}</div>
              {node.duration_ms && (
                <div class="text-gray-500">{formatDuration(node.duration_ms)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}
