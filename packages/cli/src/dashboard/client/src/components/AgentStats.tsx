import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { AgentStat } from '../types'

export const AgentStats: FunctionalComponent = () => {
  const [stats, setStats] = useState<AgentStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/stats/agents')

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setStats(result.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 5000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Agent Statistics</h2>
        <div class="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Agent Statistics</h2>
        <div class="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h2 class="text-lg font-semibold mb-4">Agent Statistics</h2>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agent
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Runs
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Duration
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Success Rate
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {stats.length === 0 ? (
              <tr>
                <td colspan="4" class="px-4 py-4 text-center text-gray-500">
                  No statistics available
                </td>
              </tr>
            ) : (
              stats.map((stat) => (
                <tr key={stat.agent_name} class="hover:bg-gray-50">
                  <td class="px-4 py-4 text-sm font-medium text-gray-900">
                    {stat.agent_name}
                  </td>
                  <td class="px-4 py-4 text-sm text-gray-500">
                    {stat.total_runs}
                  </td>
                  <td class="px-4 py-4 text-sm text-gray-500">
                    {(stat.avg_duration_ms / 1000).toFixed(2)}s
                  </td>
                  <td class="px-4 py-4 text-sm">
                    <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      stat.success_rate >= 90 ? 'bg-green-100 text-green-800' :
                      stat.success_rate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {stat.success_rate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
