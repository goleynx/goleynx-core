/**
 * @file 校验工具
 * @module shared/utils/validate
 */

/** 校验 API Key 格式（各提供商格式不同，当前做基本格式检查） */
export function validateApiKey(key: string, provider: string): boolean {
  if (!key || key.trim().length === 0) return false
  switch (provider) {
    case 'deepseek':
      return key.startsWith('sk-') && key.length >= 32
    case 'openai':
      return key.startsWith('sk-') && key.length >= 48
    case 'anthropic':
      return key.startsWith('sk-ant-') && key.length >= 40
    case 'custom':
      return key.length >= 16
    default:
      return key.length >= 16
  }
}

/** 校验面板ID是否在注册表中 */
export function isValidPanelId(id: string): boolean {
  const validIds = ['101-chat', '201-scheduler', '301-reviewer', '401-editor']
  return validIds.includes(id)
}

/** 校验是否为空字符串 */
export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0
}
