import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'

// Types
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

interface FeedbackLoop {
  id: number
  trigger_agent: string
  reviewer_agent: string
  iteration: number
  status: string
}

interface WorkflowFlow {
  sessionId: string
  nodes: WorkflowFlowNode[]
  feedbackLoops: FeedbackLoop[]
  mermaid: string
}

interface FlowChartProps {
  sessionId: string
}

// Status colors
const statusConfig: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  running: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', dot: '#f59e0b' },
  completed: { bg: '#d1fae5', border: '#10b981', text: '#065f46', dot: '#10b981' },
  failed: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', dot: '#ef4444' },
  pending: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151', dot: '#9ca3af' },
}

// Agent icons
const agentIcons: Record<string, string> = {
  planner: '📋',
  explorer: '🔍',
  implementer: '⚙️',
  reviewer: '✅',
  debugger: '🐛',
  'test-writer': '🧪',
  'test-runner': '▶️',
  Plan: '🎯',
  default: '🤖',
}

// Format duration
function formatDuration(ms: number | null): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// Node component
interface NodeProps {
  node: WorkflowFlowNode
  x: number
  y: number
  isRunning: boolean
}

function FlowNode({ node, x, y, isRunning }: NodeProps) {
  const config = statusConfig[node.status] || statusConfig.pending
  const icon = agentIcons[node.agent_name] || agentIcons.default
  const width = 200
  const height = node.description ? 80 : 60

  return (
    <g transform={`translate(${x - width / 2}, ${y})`}>
      {/* Shadow */}
      <rect
        x="2"
        y="2"
        width={width}
        height={height}
        rx="12"
        fill="rgba(0,0,0,0.08)"
      />
      {/* Card background */}
      <rect
        width={width}
        height={height}
        rx="12"
        fill={config.bg}
        stroke={config.border}
        strokeWidth="2"
        className={isRunning ? 'animate-pulse' : ''}
      />
      {/* Content */}
      <foreignObject x="0" y="0" width={width} height={height}>
        <div
          style={{
            padding: '12px 16px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: config.text }}>
              {node.agent_name}
            </span>
          </div>
          {node.description && (
            <p style={{
              fontSize: '11px',
              color: config.text,
              opacity: 0.75,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {node.description}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: config.border + '33',
              color: config.text,
              fontWeight: 500,
            }}>
              {node.status}
            </span>
            {node.duration_ms && (
              <span style={{ fontSize: '10px', color: config.text, opacity: 0.6 }}>
                {formatDuration(node.duration_ms)}
              </span>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  )
}

// Arrow component
interface ArrowProps {
  from: { x: number; y: number }
  to: { x: number; y: number }
  animated?: boolean
  feedback?: boolean
  label?: string
}

function Arrow({ from, to, animated = false, feedback = false, label }: ArrowProps) {
  const color = feedback ? '#f59e0b' : '#94a3b8'
  const midY = (from.y + to.y) / 2

  // Curved path for feedback loops (going right then down then left)
  const path = feedback
    ? `M ${from.x} ${from.y}
       C ${from.x + 60} ${from.y}, ${to.x + 60} ${to.y}, ${to.x} ${to.y}`
    : `M ${from.x} ${from.y}
       C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`

  return (
    <g>
      <defs>
        <marker
          id={`arrow-${feedback ? 'feedback' : 'normal'}`}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={color} />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={feedback ? '5,5' : 'none'}
        markerEnd={`url(#arrow-${feedback ? 'feedback' : 'normal'})`}
        className={animated ? 'animate-flow' : ''}
      />
      {label && (
        <text
          x={(from.x + to.x) / 2 + (feedback ? 40 : 0)}
          y={(from.y + to.y) / 2}
          fill={color}
          fontSize="10"
          fontWeight="600"
          textAnchor="middle"
          dy="-5"
        >
          {label}
        </text>
      )}
    </g>
  )
}

export const FlowChart: FunctionalComponent<FlowChartProps> = ({ sessionId }) => {
  const [flow, setFlow] = useState<WorkflowFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

    // Polling for updates
    const interval = setInterval(fetchFlow, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  if (loading) {
    return (
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Agent Flow</h2>
        <div class="flex items-center justify-center h-64">
          <div class="flex items-center gap-3 text-gray-500">
            <div class="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <span>Loading flow...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Agent Flow</h2>
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Error: {error}
        </div>
      </div>
    )
  }

  if (!flow || flow.nodes.length === 0) {
    return (
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-lg font-semibold mb-4 text-gray-800">Agent Flow</h2>
        <div class="flex flex-col items-center justify-center h-64 text-gray-400">
          <span class="text-4xl mb-2">🔄</span>
          <span>No agent activity yet</span>
        </div>
      </div>
    )
  }

  // Sort nodes by time
  const sortedNodes = [...flow.nodes].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  )

  // Calculate positions
  const nodeHeight = 90
  const nodeSpacing = 20
  const centerX = 250
  const startY = 40
  const svgHeight = sortedNodes.length * (nodeHeight + nodeSpacing) + 60

  const nodePositions = sortedNodes.map((node, index) => ({
    node,
    x: centerX,
    y: startY + index * (nodeHeight + nodeSpacing),
  }))

  return (
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="flex justify-between items-center px-6 py-4 border-b border-gray-100">
        <h2 class="text-lg font-semibold text-gray-800">Agent Flow</h2>
        <div class="flex items-center gap-4 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-emerald-400" />
            <span class="text-gray-600">Completed</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
            <span class="text-gray-600">Running</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-red-400" />
            <span class="text-gray-600">Failed</span>
          </div>
        </div>
      </div>

      <div class="overflow-auto" style={{ maxHeight: '600px' }}>
        <svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 500 ${svgHeight}`}
          preserveAspectRatio="xMidYMin meet"
        >
          <style>{`
            @keyframes flowAnimation {
              0% { stroke-dashoffset: 20; }
              100% { stroke-dashoffset: 0; }
            }
            .animate-flow {
              animation: flowAnimation 1s linear infinite;
            }
          `}</style>

          {/* Background pattern */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1" fill="#e5e7eb" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Arrows */}
          {nodePositions.slice(0, -1).map((pos, index) => {
            const nextPos = nodePositions[index + 1]
            const fromY = pos.y + (sortedNodes[index].description ? 80 : 60)
            return (
              <Arrow
                key={`arrow-${index}`}
                from={{ x: pos.x, y: fromY }}
                to={{ x: nextPos.x, y: nextPos.y }}
                animated={nextPos.node.status === 'running'}
              />
            )
          })}

          {/* Feedback loop arrows */}
          {flow.feedbackLoops?.filter(loop => loop.status !== 'passed').map(loop => {
            const reviewerPos = nodePositions.find(p => p.node.agent_name === loop.reviewer_agent)
            const triggerPos = nodePositions.find(p => p.node.agent_name === loop.trigger_agent)

            if (reviewerPos && triggerPos && reviewerPos.y > triggerPos.y) {
              return (
                <Arrow
                  key={`feedback-${loop.id}`}
                  from={{ x: reviewerPos.x + 100, y: reviewerPos.y + 40 }}
                  to={{ x: triggerPos.x + 100, y: triggerPos.y + 40 }}
                  feedback
                  animated
                  label={`#${loop.iteration}`}
                />
              )
            }
            return null
          })}

          {/* Nodes */}
          {nodePositions.map(({ node, x, y }) => (
            <FlowNode
              key={node.id}
              node={node}
              x={x}
              y={y}
              isRunning={node.status === 'running'}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}
