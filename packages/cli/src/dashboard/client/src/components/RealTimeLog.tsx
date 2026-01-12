import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { RecentAction } from '../types'

export const RealTimeLog: FunctionalComponent = () => {
  const [logs, setLogs] = useState<RecentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/actions/recent')

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setLogs(result.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
    const interval = setInterval(fetchLogs, 3000)

    return () => clearInterval(interval)
  }, [])

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  if (loading) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Real-time Log</h2>
        <div class="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Real-time Log</h2>
        <div class="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Real-time Log</h2>
      <div class="space-y-2 max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div class="text-gray-500">No recent actions</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} class="border-l-4 border-blue-500 pl-4 py-2">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <span class="font-medium text-sm">{log.type}</span>
                  <span class="text-gray-500 text-sm mx-2">•</span>
                  <span class="text-sm">{log.description}</span>
                </div>
                <span class="text-xs text-gray-500">{formatTimestamp(log.timestamp)}</span>
              </div>
              {log.metadata && (
                <div class="text-sm text-gray-600 mt-1">{log.metadata}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
