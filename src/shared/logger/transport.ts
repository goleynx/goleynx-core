/**
 * @file 日志传输器
 * @module shared/logger/transport
 * @description 日志输出通道：开发模式 -> 控制台 + 内存，发布模式 -> 静默 + 内存。
 *              后续可扩展：文件写入（electron-log）、远程上报。
 */

import { LogEntry, LogTransport } from './types'
import { LogLevel, LOG_LEVEL_LABELS } from './levels'

/** 内存中的日志记录（供错误反馈页查询） */
const logHistory: LogEntry[] = []
const MAX_HISTORY = 500

/** 创建格式化的日志前缀 */
function formatPrefix(entry: LogEntry): string {
  return `[${entry.timestamp}] [${LOG_LEVEL_LABELS[entry.level]}] [${entry.module}]`
}

/** 控制台传输器 */
class ConsoleTransport implements LogTransport {
  private minLevel: LogLevel = LogLevel.DEBUG

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  write(entry: LogEntry): void {
    if (entry.level < this.minLevel) return

    const prefix = formatPrefix(entry)
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.data ?? '')
        break
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.data ?? '')
        break
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.data ?? '')
        break
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.data ?? '')
        break
    }
  }
}

/** 内存传输器 —— 保留最近500条，供错误反馈页回溯 */
class MemoryTransport implements LogTransport {
  private minLevel: LogLevel = LogLevel.DEBUG

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  write(entry: LogEntry): void {
    if (entry.level < this.minLevel) return
    logHistory.push(entry)
    if (logHistory.length > MAX_HISTORY) {
      logHistory.splice(0, logHistory.length - MAX_HISTORY)
    }
  }

  /** 获取历史日志（供外部查询） */
  getHistory(): LogEntry[] {
    return [...logHistory]
  }

  /** 清空历史 */
  clearHistory(): void {
    logHistory.length = 0
  }
}

/** 导出传输器实例 */
export const consoleTransport = new ConsoleTransport()
export const memoryTransport = new MemoryTransport()

/** 获取所有传输器 */
export function getTransports(): LogTransport[] {
  return [consoleTransport, memoryTransport]
}
