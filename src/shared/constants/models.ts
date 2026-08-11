/**
 * @file 模型列表常量
 * @module shared/constants/models
 * @description 平台支持的模型列表及其价格。接入API密钥即可直接调用对应大模型。
 */

import { ModelConfig } from '../types/model'

/** 平台预置模型列表 */
export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    pricePerKToken: 0.16,
    enabled: true,
    maxTokens: 65536,
    panelTypes: ['101-chat', '201-scheduler', '301-reviewer'],
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    pricePerKToken: 0.20,
    enabled: true,
    maxTokens: 65536,
    panelTypes: ['401-editor'],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    pricePerKToken: 0.78,
    enabled: true,
    maxTokens: 128000,
    panelTypes: [], // 所有面板可用
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    pricePerKToken: 0.56,
    enabled: true,
    maxTokens: 200000,
    panelTypes: ['301-reviewer'],
  },
]

/** 根据面板ID筛选可用模型 */
export function getModelsForPanel(panelId: string): ModelConfig[] {
  return AVAILABLE_MODELS.filter(
    (m) => m.enabled && (m.panelTypes.length === 0 || m.panelTypes.includes(panelId))
  )
}
