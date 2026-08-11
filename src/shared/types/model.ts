/**
 * @file 模型配置类型
 * @module shared/types/model
 */

/** 模型提供商 */
export type ModelProvider = 'deepseek' | 'openai' | 'anthropic' | 'custom'

/** 单个模型配置 */
export interface ModelConfig {
  /** 模型ID */
  id: string
  /** 模型名称 */
  name: string
  /** 提供商 */
  provider: ModelProvider
  /** 价格（元/千token） */
  pricePerKToken: number
  /** 是否可用 */
  enabled: boolean
  /** 最大上下文长度 */
  maxTokens: number
  /** 适用的面板类型（空数组表示所有面板可用） */
  panelTypes: string[]
}

/** API 密钥配置 */
export interface ApiKeyConfig {
  /** 归属面板 */
  panelId: string
  /** 提供商 */
  provider: ModelProvider
  /** 密钥（加密存储） */
  key: string
  /** 是否使用平台密钥（而非用户自带） */
  usePlatform: boolean
}

/** Token 使用统计 */
export interface TokenUsage {
  panelId: string
  modelId: string
  inputTokens: number
  outputTokens: number
  cost: number
  timestamp: number
}
