/**
 * @file 全局常量
 * @module shared/constants
 */

/** API 请求超时（毫秒） */
export const API_TIMEOUT = 30000

/** 面板尺寸常量 */
export const PANEL_DEFAULTS = {
  leftWidth: 280,
  centerMinWidth: 400,
  rightWidth: 320,
  collapsedRightWidth: 40,
} as const

/** Monaco Editor 默认配置 */
export const EDITOR_DEFAULTS = {
  fontSize: 14,
  tabSize: 2,
  language: 'typescript',
  theme: 'vs-dark',
} as const

/** 事件名称常量 */
export const BUS_EVENTS = {
  /** 任务下发 */
  TASK_DISPATCH: 'task:dispatch',
  /** 任务进度更新 */
  TASK_PROGRESS: 'task:progress',
  /** 代码完成回调 */
  CODE_COMPLETED: 'code:completed',
  /** 审查通过 */
  REVIEW_PASS: 'review:pass',
  /** 审查拦截 */
  REVIEW_INTERCEPT: 'review:intercept',
  /** 强制打回 */
  REVIEW_REJECT: 'review:reject',
  /** 广播合规基线 */
  BROADCAST_BASELINE: 'broadcast:baseline',
  /** 目标交叉验证 */
  CROSS_VALIDATION: 'cross:validation',
} as const

/** 存储键名 */
export const STORAGE_KEYS = {
  theme: 'goleynx-theme',
  language: 'goleynx-language',
  apiKeys: 'goleynx-api-keys',
  windowBounds: 'goleynx-window-bounds',
  panelState: 'goleynx-panel-state',
} as const
