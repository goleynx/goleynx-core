/**
 * @file 结构化追加式存储服务
 * @description 根据 agentId 映射物理目录，读/写 conversations.json
 *              所有落盘数据均为明文 JSON，严格基于 timestamp + role 字段结构
 *              执行体按字母横向动态扩展（d / e / f / …）
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// ── 类型定义 ──────────────────────────────────────────────

/** 单条对话消息（明文，绝对禁止加密） */
export interface AgentMessage {
  /** 轮次标签，如 A0001-01、B0001-03 */
  round?: string
  /** 时间戳 — 精确到毫秒的 ISO 字符串 */
  timestamp: string
  /** 角色 — 严格二分 */
  role: 'user' | 'model'
  /** 消息正文 */
  content: string
  /** 可选：模型 ID */
  modelId?: string
}

/** Agent 目录映射表 */
const AGENT_DIR_MAP: Record<string, string> = {
  'a': 'a',
  'b': 'b',
  'c': 'c',
  'd': 'd',
  'e': 'e',
  'f': 'f',
}

/**
 * 根据 agentId 解析物理目录路径（基于 dataRoot）
 *
 * - 'a'  →  a/
 * - 'b'  →  b/
 * - 'c'  →  c/
 * - 'd'  →  d/
 
 
 */
function resolveAgentDir(dataRoot: string, agentId: string): string {
  // agentId 即目录名：a/b/c/d/e/f...
  if (AGENT_DIR_MAP[agentId]) {
    return join(dataRoot, AGENT_DIR_MAP[agentId])
  }
  // 降级：直接用 agentId 作为目录名
  return join(dataRoot, agentId)
}

/**
 * 向指定 Agent 追加一条对话消息
 *
 * 逻辑：
 *   1. 递归创建目录（不存在时自动建立）
 *   2. 读取 conversations.json → 空数组兜底
 *   3. push 新 message → 覆盖写入
 */
export async function appendConversation(
  dataRoot: string,
  agentId: string,
  message: AgentMessage,
): Promise<void> {
  const dir = resolveAgentDir(dataRoot, agentId)
  await mkdir(dir, { recursive: true })

  const filePath = join(dir, 'conversations.json')

  let data: AgentMessage[] = []
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) data = parsed
  } catch {
    // 文件不存在或损坏 → 空数组兜底
  }

  data.push(message)
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 读取指定 Agent 的完整对话历史
 */
export async function getConversation(
  dataRoot: string,
  agentId: string,
): Promise<AgentMessage[]> {
  const dir = resolveAgentDir(dataRoot, agentId)
  const filePath = join(dir, 'conversations.json')

  try {
    const raw = await readFile(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 列出 dataRoot 下所有已存在的 Agent 目录
 */
export async function listAgentDirs(
  dataRoot: string,
): Promise<string[]> {
  const { readdir } = await import('fs/promises')
  try {
    const entries = await readdir(dataRoot, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

/**
 * 统一的 runtime 根目录计算（main 进程调用）
 */
export function getRuntimeRoot(appPath: string): string {
  return join(appPath, '.goleynx', 'runtime')
}
