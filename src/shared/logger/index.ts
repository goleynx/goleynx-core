import { LogLevel, parseLogLevel } from './levels'
import { LogEntry } from './types'
import { getTransports, memoryTransport } from './transport'
import { APP_CONFIG } from '../config/app'

class Logger {
  private level: LogLevel

  constructor() {
    this.level = parseLogLevel(APP_CONFIG.logLevel)
  }

  setLevel(level: LogLevel): void {
    this.level = level
    for (const transport of getTransports()) {
      transport.setLevel(level)
    }
  }

  private createEntry(level: LogLevel, module: string, message: string, data?: unknown): LogEntry {
    return { timestamp: new Date().toISOString(), level, module, message, data }
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (level < this.level) return
    const entry = this.createEntry(level, module, message, data)
    for (const transport of getTransports()) {
      transport.write(entry)
    }
  }

  debug(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, module, message, data)
  }

  info(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, module, message, data)
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, module, message, data)
  }

  error(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, module, message, data)
  }

  getHistory() { return memoryTransport.getHistory() }
  clearHistory(): void { memoryTransport.clearHistory() }
}

/** 全局唯一日志实例 */
export const logger = new Logger()
