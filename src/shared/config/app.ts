/**
 * @file 应用配置
 * @module shared/config/app
 * @description 全局应用配置：日志级别、默认语言、窗口尺寸等。
 */

export const APP_CONFIG = {
  /** 日志级别：debug（开发）/ silent（发布） */
  logLevel: 'debug' as 'debug' | 'warn' | 'error' | 'silent',

  /** 默认语言 */
  defaultLanguage: 'zh-CN' as 'zh-CN' | 'en-US',

  /** 支持的语言列表 */
  supportedLanguages: ['zh-CN', 'en-US'] as const,

  /** 默认主题 */
  defaultTheme: 'dark' as 'light' | 'dark',

  /** 窗口默认尺寸 */
  window: {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 500,
  },

  /** Monaco Editor 默认配置 */
  editor: {
    fontSize: 14,
    tabSize: 2,
    theme: 'vs-dark',
  },

  /** 面板默认宽度 */
  panelWidth: {
    left: 280,   // 101 对话面板
    right: 320,  // 右侧面板区(301+201)
    collapsedRight: 40, // 右侧收起时的宽度
  },
} as const

export type AppConfig = typeof APP_CONFIG
