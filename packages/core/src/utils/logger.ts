type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerOptions {
  prefix?: string
  debug?: boolean
}

const isDebugEnabled = (): boolean => {
  return process.env.OBORA_DEBUG === 'true' || process.env.DEBUG?.includes('obora') || false
}

class Logger {
  private prefix: string
  private debugMode: boolean

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || ''
    this.debugMode = options.debug ?? isDebugEnabled()
  }

  private format(_level: LogLevel, message: string): string {
    const prefix = this.prefix ? `[${this.prefix}] ` : ''
    return `${prefix}${message}`
  }

  debug(message: string, data?: unknown): void {
    if (!this.debugMode) return
    const formatted = this.format('debug', message)
    if (data !== undefined) {
      console.log(formatted, typeof data === 'object' ? JSON.stringify(data) : data)
    } else {
      console.log(formatted)
    }
  }

  info(message: string): void {
    console.log(this.format('info', message))
  }

  warn(message: string): void {
    console.warn(this.format('warn', message))
  }

  error(message: string, error?: unknown): void {
    const formatted = this.format('error', message)
    if (error instanceof Error) {
      console.error(formatted, error.message)
    } else if (error !== undefined) {
      console.error(formatted, error)
    } else {
      console.error(formatted)
    }
  }

  child(prefix: string): Logger {
    const newPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix
    return new Logger({ prefix: newPrefix, debug: this.debugMode })
  }
}

export const logger = new Logger()

export function createLogger(prefix: string): Logger {
  return new Logger({ prefix })
}

export { Logger }
