/**
 * @file 日志级别定义
 * @module shared/logger/levels
 */

/** 日志级别枚举 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/** 日志级别名称映射 */
export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
}

/** 将字符串日志级别转为枚举 */
export function parseLogLevel(level: string): LogLevel {
  switch (level) {
    case 'debug': return LogLevel.DEBUG
    case 'warn': return LogLevel.WARN
    case 'error': return LogLevel.ERROR
    case 'silent': return LogLevel.SILENT
    default: return LogLevel.INFO
  }
}
