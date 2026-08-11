/**
 * @file 日志类型定义
 * @module shared/logger/types
 */

import { LogLevel } from './levels'

/** 单条日志记录 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: string
  /** 日志级别 */
  level: LogLevel
  /** 日志来源模块 */
  module: string
  /** 日志消息 */
  message: string
  /** 附加数据 */
  data?: unknown
}

/** 日志传输器接口 —— 扩展不同的输出通道（控制台/文件/远程） */
export interface LogTransport {
  /** 写入一条日志 */
  write(entry: LogEntry): void
  /** 设置日志级别阈值 */
  setLevel(level: LogLevel): void
}
