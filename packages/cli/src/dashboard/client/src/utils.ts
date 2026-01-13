/**
 * Common utility functions for dashboard components
 */

/**
 * Format duration in milliseconds to human-readable string
 */
export const formatDuration = (ms: number | null): string => {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Format ISO datetime string to locale string
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleString()
}

/**
 * Format datetime with short format for compact displays
 */
export const formatDateTimeShort = (timestamp: string): string => {
  const date = new Date(timestamp)
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get status badge CSS classes based on status string
 */
export const getStatusBadgeClass = (status: string): string => {
  const statusLower = status.toLowerCase()
  if (statusLower.includes('running') || statusLower.includes('active')) {
    return 'bg-green-100 text-green-800'
  }
  if (statusLower.includes('completed') || statusLower.includes('success') || statusLower.includes('passed')) {
    return 'bg-blue-100 text-blue-800'
  }
  if (statusLower.includes('failed') || statusLower.includes('error')) {
    return 'bg-red-100 text-red-800'
  }
  return 'bg-gray-100 text-gray-800'
}
