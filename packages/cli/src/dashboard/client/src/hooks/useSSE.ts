import { useEffect, useState, useRef } from 'preact/hooks'

export type SSEStatus = 'connected' | 'connecting' | 'disconnected'

export interface SSEData {
  type: string
  data: unknown
  timestamp: number
}

export interface UseSSEResult {
  status: SSEStatus
  data: SSEData | null
  error: Error | null
}

const RECONNECT_DELAY = 3000

export function useSSE(url: string): UseSSEResult {
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const [data, setData] = useState<SSEData | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const connect = () => {
      setStatus('connecting')
      setError(null)

      try {
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          setStatus('connected')
          setError(null)
        }

        eventSource.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data)
            setData({
              type: parsed.type || 'message',
              data: parsed.data || parsed,
              timestamp: Date.now(),
            })
          } catch (err) {
            console.error('Failed to parse SSE data:', err)
            setError(err instanceof Error ? err : new Error('Failed to parse SSE data'))
          }
        }

        eventSource.onerror = (err) => {
          console.error('SSE connection error:', err)
          setStatus('disconnected')
          setError(new Error('Connection lost'))
          eventSource.close()

          // Attempt to reconnect after delay
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect()
          }, RECONNECT_DELAY)
        }
      } catch (err) {
        console.error('Failed to create EventSource:', err)
        setStatus('disconnected')
        setError(err instanceof Error ? err : new Error('Failed to create connection'))

        // Attempt to reconnect after delay
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect()
        }, RECONNECT_DELAY)
      }
    }

    connect()

    // Cleanup function
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [url])

  return { status, data, error }
}
