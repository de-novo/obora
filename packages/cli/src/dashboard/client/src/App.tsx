import { FunctionalComponent } from 'preact'
import Router from 'preact-router'
import { useSSE } from './hooks/useSSE'
import {
  ConnectionStatus,
  Dashboard,
  SessionList,
  SessionDetail,
  WorkflowDetail,
} from './components'

export const App: FunctionalComponent = () => {
  const { status, error } = useSSE('/api/stream/activity')

  return (
    <div class="min-h-screen bg-gray-50">
      <ConnectionStatus status={status} />

      {error && (
        <div class="fixed top-16 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-md">
          <span class="text-sm">Error: {error.message}</span>
        </div>
      )}

      <nav class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <div class="flex space-x-8">
              <a href="/" class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900">
                Dashboard
              </a>
              <a href="/sessions" class="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 hover:text-gray-900">
                Sessions
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <Router>
          <Dashboard path="/" />
          <SessionList path="/sessions" />
          <SessionDetail path="/sessions/:id" />
          <WorkflowDetail path="/workflows/:id" />
        </Router>
      </main>
    </div>
  )
}
