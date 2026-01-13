import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { FeedbackLoopWithIterations } from '../types'

interface FeedbackLoopPanelProps {
  workflowId: string | null
}

const parseIssues = (jsonString: string | null): string[] => {
  if (!jsonString) return []
  try {
    const parsed = JSON.parse(jsonString)
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object' && parsed.issues) return parsed.issues
    return []
  } catch {
    return []
  }
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'passed':
      return 'bg-green-100 text-green-700'
    case 'reviewing':
      return 'bg-blue-100 text-blue-700 animate-pulse'
    case 'fixing':
      return 'bg-yellow-100 text-yellow-700 animate-pulse'
    case 'failed':
      return 'bg-red-100 text-red-700'
    case 'max_reached':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

const phaseIcon = (status: string) => {
  if (status === 'completed') return '\u2713'
  if (status === 'running') return '\u23F3'
  return '\u25CB'
}

export const FeedbackLoopPanel: FunctionalComponent<FeedbackLoopPanelProps> = ({ workflowId }) => {
  const [feedbackLoop, setFeedbackLoop] = useState<FeedbackLoopWithIterations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workflowId) {
      setLoading(false)
      return
    }

    const abortController = new AbortController()
    let isMounted = true

    const fetchFeedbackLoop = async () => {
      try {
        const response = await fetch('/api/feedback-loops/current', {
          signal: abortController.signal,
        })
        if (!response.ok) {
          if (response.status === 404) {
            if (isMounted) {
              setFeedbackLoop(null)
              setError(null)
              setLoading(false)
            }
            return
          }
          throw new Error(`HTTP ${response.status}`)
        }
        const result = await response.json()
        if (!result.ok) {
          throw new Error(result.error || 'Unknown error')
        }
        if (isMounted) {
          setFeedbackLoop(result.data)
          setError(null)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch feedback loop')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchFeedbackLoop()
    const interval = setInterval(fetchFeedbackLoop, 2000)

    return () => {
      isMounted = false
      abortController.abort()
      clearInterval(interval)
    }
  }, [workflowId])

  if (!workflowId || loading) {
    return null
  }

  if (error) {
    return (
      <div class="bg-white rounded-lg shadow-sm p-6">
        <h2 class="text-lg font-semibold mb-4">Feedback Loop</h2>
        <div class="text-red-500 text-sm">Error: {error}</div>
      </div>
    )
  }

  if (!feedbackLoop) {
    return null
  }

  const maxIterations = 3
  const groupedIterations = feedbackLoop.iterations.reduce((acc, iter) => {
    if (!acc[iter.iteration]) {
      acc[iter.iteration] = []
    }
    acc[iter.iteration].push(iter)
    return acc
  }, {} as Record<number, typeof feedbackLoop.iterations>)

  return (
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">
          Feedback Loop ({feedbackLoop.iteration}/{maxIterations})
        </h2>
        <span class={`px-2 py-1 rounded text-sm font-medium ${statusBadgeClass(feedbackLoop.status)}`}>
          {feedbackLoop.status}
        </span>
      </div>

      <div class="space-y-3">
        {Object.entries(groupedIterations)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([iteration, iters]) => {
            const reviewIter = iters.find(i => i.phase === 'review')
            const fixIter = iters.find(i => i.phase === 'fix')
            const verifyIter = iters.find(i => i.phase === 'verify')

            const issuesFound = reviewIter ? parseIssues(reviewIter.issues_found) : []
            const issuesResolved = fixIter ? parseIssues(fixIter.issues_resolved) : []

            const roundStatus = verifyIter?.ended_at
              ? 'passed'
              : fixIter && !fixIter.ended_at
              ? 'in progress'
              : reviewIter && !reviewIter.ended_at
              ? 'reviewing'
              : 'pending'

            return (
              <div key={iteration} class="border rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-medium text-sm">Round {iteration}</span>
                  <span class={`text-xs px-2 py-0.5 rounded ${
                    roundStatus === 'passed' ? 'bg-green-100 text-green-700' :
                    roundStatus === 'in progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {roundStatus === 'passed' ? '\u2713 passed' : roundStatus}
                  </span>
                </div>

                <div class="space-y-2 ml-4 text-sm">
                  {reviewIter && (
                    <div class="flex items-start">
                      <span class="mr-2">
                        {phaseIcon(reviewIter.ended_at ? 'completed' : 'running')}
                      </span>
                      <div class="flex-1">
                        <span class="text-gray-700">review:</span>
                        {issuesFound.length > 0 ? (
                          <span class="ml-2 text-orange-600 font-medium">
                            {issuesFound.length} issue{issuesFound.length > 1 ? 's' : ''} found
                          </span>
                        ) : (
                          <span class="ml-2 text-gray-500">no issues</span>
                        )}
                      </div>
                    </div>
                  )}

                  {fixIter && (
                    <div class="flex items-start">
                      <span class="mr-2">
                        {phaseIcon(fixIter.ended_at ? 'completed' : 'running')}
                      </span>
                      <div class="flex-1">
                        <span class="text-gray-700">fix:</span>
                        {fixIter.ended_at ? (
                          <span class="ml-2 text-green-600">
                            {issuesResolved.length > 0
                              ? `${issuesResolved.length} issue${issuesResolved.length > 1 ? 's' : ''} resolved`
                              : 'completed'
                            }
                          </span>
                        ) : (
                          <span class="ml-2 text-blue-600 animate-pulse">in progress...</span>
                        )}
                      </div>
                    </div>
                  )}

                  {verifyIter && (
                    <div class="flex items-start">
                      <span class="mr-2">
                        {phaseIcon(verifyIter.ended_at ? 'completed' : 'running')}
                      </span>
                      <div class="flex-1">
                        <span class="text-gray-700">verify:</span>
                        {verifyIter.ended_at ? (
                          <span class="ml-2 text-green-600">\u2713 passed</span>
                        ) : (
                          <span class="ml-2 text-blue-600 animate-pulse">verifying...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {feedbackLoop.status === 'max_reached' && (
        <div class="mt-4 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
          Maximum iteration limit reached. Manual review may be required.
        </div>
      )}
    </div>
  )
}
