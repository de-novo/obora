import { FunctionalComponent } from 'preact'

interface ConnectionStatusProps {
  status: 'connected' | 'connecting' | 'disconnected'
}

export const ConnectionStatus: FunctionalComponent<ConnectionStatusProps> = ({ status }) => {
  const statusConfig = {
    connected: { text: 'Connected', class: 'bg-green-500' },
    connecting: { text: 'Connecting...', class: 'bg-yellow-500' },
    disconnected: { text: 'Disconnected', class: 'bg-red-500' },
  }

  const config = statusConfig[status]

  return (
    <div class="fixed top-4 right-4 flex items-center space-x-2 bg-white px-4 py-2 rounded-lg shadow-md z-50">
      <div class={`w-2 h-2 rounded-full ${config.class}`}></div>
      <span class="text-sm font-medium">{config.text}</span>
    </div>
  )
}
