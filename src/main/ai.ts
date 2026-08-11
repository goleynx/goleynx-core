/**
 * @file AI Provider 供应商标配表 + IPC 集成
 */
import OpenAI from 'openai'
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ====== 供应商标配表 ======
export interface ProviderInfo {
  id: string; name: string; baseURL: string; needsKey: boolean
}

export const ALL_PROVIDERS: ProviderInfo[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat',       baseURL: 'https://api.deepseek.com/v1',            needsKey: true },
  { id: 'gpt-4o',        name: 'GPT-4o',               baseURL: 'https://api.openai.com/v1',              needsKey: true },
  { id: 'gpt-4o-mini',   name: 'GPT-4o Mini',          baseURL: 'https://api.openai.com/v1',              needsKey: true },
  { id: 'kimi',          name: 'Kimi (月之暗面)',       baseURL: 'https://api.moonshot.cn/v1',             needsKey: true },
  { id: 'qwen-turbo',    name: '通义千问 Turbo',        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsKey: true },
  { id: 'glm-4',         name: '智谱 GLM-4',           baseURL: 'https://open.bigmodel.cn/api/paas/v4',   needsKey: true },
  { id: 'grok-1',        name: 'Grok (xAI)',            baseURL: 'https://api.x.ai/v1',                    needsKey: true },
  { id: 'llama3',        name: 'Llama 3 (Ollama)',      baseURL: 'http://localhost:11434/v1',               needsKey: false },
]

// ====== Key 存储 ======
function keyPath() { return join(app.getPath('userData'), 'Goleynx-keys.json') }
function readKeys(): Record<string, string> { try { return JSON.parse(readFileSync(keyPath(),'utf-8')) } catch { return {} } }
function writeKeys(d: Record<string, string>) { writeFileSync(keyPath(), JSON.stringify(d,null,2),'utf-8') }

export function setKey(modelId: string, key: string) {
  const k = readKeys()
  k[modelId] = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key).toString('hex') : key
  writeKeys(k)
}
export function getKey(modelId: string): string | null {
  const v = readKeys()[modelId]; if (!v) return null
  if (safeStorage.isEncryptionAvailable()) { try { return safeStorage.decryptString(Buffer.from(v,'hex')) } catch { return null } }
  return v
}
export function deleteKey(modelId: string) { const k = readKeys(); delete k[modelId]; writeKeys(k) }
export function hasKey(modelId: string) { return modelId in readKeys() }

// 获取可用模型列表（已保存Key的云端 + 所有本地）
export function getAvailableModels(): ProviderInfo[] {
  return ALL_PROVIDERS.filter(p => !p.needsKey || hasKey(p.id))
}

// ====== AI 调用 ======
export async function aiChat(
  modelId: string, apiKey: string, messages: { role: string; content: string }[],
  stream: boolean, onChunk?: (data: { content: string; done: boolean }) => void
): Promise<{ content: string; finishReason: string | null } | null> {
  const cfg = ALL_PROVIDERS.find(p => p.id === modelId); if (!cfg) return null
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey })

  if (stream && onChunk) {
    const s = await client.chat.completions.create({ model: modelId, messages: messages as any, stream: true })
    let full = ''
    for await (const c of s) { const d = c.choices[0]?.delta?.content ?? ''; full += d; onChunk({ content: d, done: !!c.choices[0]?.finish_reason }) }
    return { content: full, finishReason: 'stop' }
  }
  const r = await client.chat.completions.create({ model: modelId, messages: messages as any })
  return { content: r.choices[0].message.content ?? '', finishReason: r.choices[0].finish_reason }
}
