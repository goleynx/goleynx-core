/**
 * @file AI Provider 模型工厂
 * @module shared/api/model-provider
 * @description 统一的多模型调用入口。根据 modelId 自动路由到
 *              OpenAI / DeepSeek / 其他兼容 OpenAI API 的提供商。
 *
 * 设计模式：借鉴 LobeHub model-runtime 的 Provider Factory 模式。
 *           LobeHub 将每个 provider 的差异封装在 openaiCompatibleFactory
 *           和 anthropicCompatibleFactory 内部，运行时根据 modelId 匹配。
 *
 * 简化策略：DeepSeek 和大多数国产模型兼容 OpenAI API 格式，
 *           通过 openai npm 包 + 不同的 baseURL 即可覆盖。
 *           Anthropic 后续通过 @anthropic-ai/sdk 单独接入。
 */

import OpenAI from 'openai'
import type {
  ChatMessage,
  ChatRequestConfig,
  ChatResponse,
  StreamChunk,
  ProviderRegistry,
} from './types'

/** 提供商注册表 - 集中管理所有模型的 baseURL 和路由 */
const PROVIDERS: ProviderRegistry = {
  // ====== DeepSeek ======
  'deepseek-chat': {
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },

  // ====== OpenAI ======
  'gpt-4o': {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },

  // ====== Ollama (本地模型) ======
  'llama3': {
    provider: 'openai', // Ollama 兼容 OpenAI API
    baseURL: 'http://localhost:11434/v1',
    model: 'llama3',
  },
}

/**
 * AI Provider 工厂类
 *
 * 使用方式：
 *   const p = ProviderFactory.create('deepseek-chat', 'sk-xxx')
 *   const res = await p.chat([{ role: 'user', content: 'hello' }])
 */
export class ProviderFactory {
  private client: OpenAI
  private modelName: string

  private constructor(modelId: string, apiKey: string) {
    const config = PROVIDERS[modelId]
    if (!config) {
      throw new Error(
        `未知模型: ${modelId}。可用模型: ${Object.keys(PROVIDERS).join(', ')}`,
      )
    }

    this.modelName = config.model
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey,
      dangerouslyAllowBrowser: true, // Electron 渲染进程需要
    })
  }

  /** 创建 Provider 实例 */
  static create(modelId: string, apiKey: string): ProviderFactory {
    return new ProviderFactory(modelId, apiKey)
  }

  /**
   * 非流式聊天
   * @param messages 消息数组
   * @param config 请求配置
   * @returns ChatResponse
   */
  async chat(
    messages: ChatMessage[],
    config?: ChatRequestConfig,
  ): Promise<ChatResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      temperature: config?.temperature ?? 0.7,
      max_tokens: config?.maxTokens,
    })

    const choice = completion.choices[0]
    return {
      content: choice.message.content ?? '',
      finishReason: choice.finish_reason,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    }
  }

  /**
   * 流式聊天 - 返回 AsyncGenerator
   * 使用方式：
   *   for await (const chunk of p.chatStream(messages)) {
   *     console.log(chunk.content) // 增量文本
   *   }
   */
  async *chatStream(
    messages: ChatMessage[],
    config?: ChatRequestConfig,
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      temperature: config?.temperature ?? 0.7,
      max_tokens: config?.maxTokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      const finishReason = chunk.choices[0]?.finish_reason

      yield {
        content: delta ?? '',
        done: finishReason !== null && finishReason !== undefined,
      }
    }
  }

  /** 获取当前模型名称 */
  get model(): string {
    return this.modelName
  }
}

/**
 * 检查模型是否已注册
 * @param modelId 模型标识
 */
export function isModelRegistered(modelId: string): boolean {
  return modelId in PROVIDERS
}

/**
 * 获取所有已注册模型列表
 */
export function getRegisteredModels(): string[] {
  return Object.keys(PROVIDERS)
}

/**
 * 注册新模型（动态扩展）
 * @param modelId 模型标识
 * @param baseURL API 地址
 * @param model 实际模型名
 */
export function registerModel(
  modelId: string,
  baseURL: string,
  model: string,
): void {
  PROVIDERS[modelId] = { provider: 'openai', baseURL, model }
}

export default ProviderFactory
