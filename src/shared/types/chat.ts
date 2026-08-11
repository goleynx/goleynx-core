/**
 * @file 聊天消息类型
 * @module shared/types/chat
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 单条聊天消息 */
export interface ChatMessage {
  /** 唯一标识 */
  id: string
  /** 所属面板编号 */
  panelId: string
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 是否包含代码块 */
  hasCode?: boolean
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}

/** 聊天状态 */
export interface ChatState {
  /** 消息列表 */
  messages: ChatMessage[]
  /** 是否正在等待AI回复 */
  isStreaming: boolean
  /** 当前选中的模型 */
  selectedModel: string
}

/** 生成唯一ID的简单工具 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
