/**
 * @file 商业化名稱映射
 */

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'a': '对话窗',
  'b': '中枢窗',
  'c': '审查窗',
  'd': '执行窗',
  '401-2': '执行窗 2',
}

export function displayName(agentId: string): string {
  return AGENT_DISPLAY_NAMES[agentId] ?? agentId
}

/** 系统中所有可监听角色的 ID */
export const ALL_LISTENER_IDS = ['a', 'b', 'c', 'd'] as const
export type ListenerAgentId = typeof ALL_LISTENER_IDS[number]

/**
 * 将 d 终端直接映射。
 * 后续多执行体扩展时，终端应传入具体执行体 ID。
 */
export function resolveStorageAgentId(raw: string): string {
  return raw  // agentId 即目录名
  return raw
}
