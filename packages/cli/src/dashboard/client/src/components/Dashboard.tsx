import { FunctionalComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import type { CurrentActivity } from '../types'
import { AgentStats } from './AgentStats'
import { RealTimeLog } from './RealTimeLog'
import { WorkflowProgress } from './WorkflowProgress'
import { FeedbackLoopPanel } from './FeedbackLoopPanel'
import { WorkflowHistory } from './WorkflowHistory'

export const Dashboard: FunctionalComponent = () => {
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null)

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
      } catch (err) {
        console.error('Failed to fetch activity:', err)
      }
    }

    fetchActivity()
    const interval = setInterval(fetchActivity, 2000)

    return () => clearInterval(interval)
  }, [])

  const workflowId = currentActivity?.workflow_id || null

  return (
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-8">Dashboard</h1>

      <div class="mb-8">
        <WorkflowProgress workflowId={workflowId} />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <FeedbackLoopPanel workflowId={workflowId} />
        <WorkflowHistory />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AgentStats />
        <RealTimeLog />
      </div>
    </div>
  )
}
