import { FunctionalComponent } from 'preact'
import { useState, useEffect, useMemo } from 'preact/hooks'
import type { AgentRelationship } from '../types'

interface TreeNode extends AgentRelationship {
  children: TreeNode[]
}

function buildTree(relationships: AgentRelationship[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  relationships.forEach((rel) => {
    nodeMap.set(rel.id, { ...rel, children: [] })
  })

  relationships.forEach((rel) => {
    const node = nodeMap.get(rel.id)!
    if (rel.parent_id && nodeMap.has(rel.parent_id)) {
      nodeMap.get(rel.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortByTime = (a: TreeNode, b: TreeNode) =>
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime()

  roots.sort(sortByTime)
  nodeMap.forEach((node) => node.children.sort(sortByTime))

  return roots
}

const statusColors: Record<string, string> = {
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  error: 'bg-red-500',
  pending: 'bg-gray-400',
}

const TreeNodeComponent: FunctionalComponent<{
  node: TreeNode
  isLast: boolean
  prefix: string
  onSelect: (node: TreeNode) => void
  selectedId: string | null
}> = ({ node, isLast, prefix, onSelect, selectedId }) => {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedId

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

  return (
    <div class="font-mono text-sm">
      <div
        class={`flex items-center group py-1.5 px-2 rounded cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
        }`}
        onClick={() => onSelect(node)}
      >
        <span class="text-gray-400 whitespace-pre">{prefix}{connector} </span>

        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            class="w-4 h-4 mr-1 text-gray-500 hover:text-gray-700"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        )}

        <span class={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${statusColors[node.status] || 'bg-gray-400'}`} />

        <span class="font-semibold text-blue-600">{node.agent_name}</span>

        {node.description && (
          <span class="ml-2 text-gray-600 truncate max-w-md">
            {node.description}
          </span>
        )}

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

      {expanded && hasChildren && (
        <div>
          {node.children.map((child, idx) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              isLast={idx === node.children.length - 1}
              prefix={childPrefix}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const DetailPanel: FunctionalComponent<{ node: TreeNode | null }> = ({ node }) => {
  if (!node) {
    return (
      <div class="text-gray-400 text-center py-8">
        Click on an agent to see details
      </div>
    )
  }

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ko-KR')
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-lg text-blue-600">{node.agent_name}</h3>
        <span class={`px-2 py-1 rounded text-sm ${
          node.status === 'completed' ? 'bg-green-100 text-green-700' :
          node.status === 'running' ? 'bg-blue-100 text-blue-700' :
          node.status === 'failed' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {node.status}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-gray-500">Started</div>
          <div>{formatDateTime(node.started_at)}</div>
        </div>
        <div>
          <div class="text-gray-500">Duration</div>
          <div>{node.duration_ms ? `${(node.duration_ms / 1000).toFixed(2)}s` : '-'}</div>
        </div>
      </div>

      {node.description && (
        <div>
          <div class="text-gray-500 text-sm mb-1">Task</div>
          <div class="bg-gray-50 rounded p-3 text-sm font-medium">
            {node.description}
          </div>
        </div>
      )}

      {node.prompt && (
        <div>
          <div class="text-gray-500 text-sm mb-1">Prompt</div>
          <div class="bg-blue-50 rounded p-3 text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
            {node.prompt}
          </div>
        </div>
      )}

      {node.output_summary && (
        <div>
          <div class="text-gray-500 text-sm mb-1">Result</div>
          <div class="bg-green-50 rounded p-3 text-sm whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {node.output_summary}
          </div>
        </div>
      )}

      <div class="text-xs text-gray-400">
        ID: {node.id}
      </div>
    </div>
  )
}

export const AgentTree: FunctionalComponent = () => {
  const [relationships, setRelationships] = useState<AgentRelationship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)

  const tree = useMemo(() => buildTree(relationships), [relationships])

  useEffect(() => {
    const fetchRelationships = async () => {
      try {
        const response = await fetch('/api/agent-relationships')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setRelationships(result.data || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch')
      } finally {
        setLoading(false)
      }
    }

    fetchRelationships()
    const interval = setInterval(fetchRelationships, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleSelect = (node: TreeNode) => {
    setSelectedNode(node.id === selectedNode?.id ? null : node)
  }

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Agent Execution History</h2>

      {loading ? (
        <div class="text-gray-500">Loading...</div>
      ) : error ? (
        <div class="text-red-500">Error: {error}</div>
      ) : tree.length === 0 ? (
        <div class="text-gray-500">No agent executions found</div>
      ) : (
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 overflow-x-auto max-h-96 overflow-y-auto border rounded-lg p-2">
            {tree.slice(0, 30).map((node, idx) => (
              <TreeNodeComponent
                key={node.id}
                node={node}
                isLast={idx === Math.min(tree.length, 30) - 1}
                prefix=""
                onSelect={handleSelect}
                selectedId={selectedNode?.id || null}
              />
            ))}
            {tree.length > 30 && (
              <div class="text-gray-400 text-sm mt-2 pl-4">
                ... and {tree.length - 30} more
              </div>
            )}
          </div>

          <div class="border rounded-lg p-4">
            <DetailPanel node={selectedNode} />
          </div>
        </div>
      )}
    </div>
  )
}
