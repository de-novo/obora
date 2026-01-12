import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { CurrentActivity } from '../types'
import { AgentStats } from './AgentStats'
import { AgentTree } from './AgentTree'
import { RealTimeLog } from './RealTimeLog'

export const Dashboard: FunctionalComponent = () => {
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await fetch('/api/activity/current')

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setCurrentActivity(result.data?.[0] || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch activity')
      } finally {
        setLoading(false)
      }
    }

    fetchActivity()
    const interval = setInterval(fetchActivity, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-8">Dashboard</h1>

      <div class="mb-8">
        <div class="bg-white rounded-lg shadow-sm p-6">
          <h2 class="text-lg font-semibold mb-4">Current Activity</h2>
          {loading ? (
            <div class="text-gray-500">Loading...</div>
          ) : error ? (
            <div class="text-red-500">Error: {error}</div>
          ) : currentActivity?.workflow_id ? (
            <div class="space-y-2">
              <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span class="text-sm font-medium">Active</span>
              </div>
              <div class="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div class="text-sm text-gray-500">Task</div>
                  <div class="font-medium">{currentActivity.task}</div>
                </div>
                <div>
                  <div class="text-sm text-gray-500">Agent</div>
                  <div class="font-medium">{currentActivity.agent_name || 'N/A'}</div>
                </div>
                <div>
                  <div class="text-sm text-gray-500">Duration</div>
                  <div class="font-medium">{(currentActivity.duration_ms / 1000).toFixed(1)}s</div>
                </div>
                <div>
                  <div class="text-sm text-gray-500">Workflow ID</div>
                  <div class="font-mono text-sm text-gray-600">{currentActivity.workflow_id}</div>
                </div>
              </div>
            </div>
          ) : (
            <div class="text-gray-500">No active workflow</div>
          )}
        </div>
      </div>

      <div class="mb-8">
        <AgentTree />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AgentStats />
        <RealTimeLog />
      </div>
    </div>
  )
}
