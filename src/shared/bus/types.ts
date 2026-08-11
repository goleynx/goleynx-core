/**
 * @file 事件总线类型定义
 */

export type LogCategory = 'Agent' | 'API' | '审查' | '错误' | '对话' | '中枢' | '执行' | '广播' | '阅读' | '保存'

/** 广播事件负载 */
export interface BroadcastEvent {
  /** 发送者 Agent ID */
  sourceId: string
  /** 发送者商业化名稱 */
  sourceName: string
  /** 事件类型标识 */
  eventType: string
  /** 人类可读消息 */
  message: string
  /** 日志分类，用于系统日志面板 Tab 过滤 */
  category: LogCategory
  /** 毫秒时间戳 */
  timestamp: number
  /** 可选附加数据 */
  payload?: unknown
}

/** 系统日志条目 */
export interface SystemLogEntry {
  id: string
  timestamp: number
  category: LogCategory
  sourceName: string
  message: string
}

/** 401 执行窗代码写入广播 */
export interface EditorBroadcastEvent {
  role: string
  action: string
  filePath?: string
  timestamp: number
}

/** 事件总线事件表 */
export interface BusEvents {
  /** Agent 完成工作后的广播（保留兼容） */
  'agent:broadcast': BroadcastEvent
  /** 401 执行窗代码写入广播 */
  '401_BROADCAST': EditorBroadcastEvent
}
