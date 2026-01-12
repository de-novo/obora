import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { route } from 'preact-router'
import type { Session } from '../types'

export const SessionList: FunctionalComponent = () => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/sessions')

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        setSessions(result.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch sessions')
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getStatusBadge = (status: Session['status']) => {
    const config = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      error: 'bg-red-100 text-red-800',
    }
    return config[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div class="p-8">
        <h1 class="text-3xl font-bold mb-8">Sessions</h1>
        <div class="text-gray-500">Loading sessions...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="p-8">
        <h1 class="text-3xl font-bold mb-8">Sessions</h1>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-8">Sessions</h1>

      <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Session ID
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Time
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                End Time
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {sessions.length === 0 ? (
              <tr>
                <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                  No sessions found
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.id}
                  class="hover:bg-gray-50 cursor-pointer"
                  onClick={() => route(`/sessions/${session.id}`)}
                >
                  <td class="px-6 py-4 text-sm font-mono text-gray-900">
                    {session.id}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(session.started_at)}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">
                    {session.ended_at ? formatDateTime(session.ended_at) : '-'}
                  </td>
                  <td class="px-6 py-4 text-sm">
                    <span class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(session.status)}`}>
                      {session.status}
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
