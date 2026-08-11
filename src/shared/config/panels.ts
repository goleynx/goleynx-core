/**
 * @file 面板配置
 * @module shared/config/panels
 * @description 面板标签统一管理。修改此文件即可全局同步 UI 标题。
 *              底部代码变量名保持不变（id/number），仅 UI 文案由此驱动。
 */

export type PanelPosition =
  | 'left'
  | 'center'
  | 'right-top'
  | 'right-bottom'
  | 'extended'

export interface PanelConfig {
  id: string
  number: number
  label: string
  labelEn: string
  position: PanelPosition
  defaultExpanded: boolean
  collapsible: boolean
  description: string
  role: string
}

export const PANEL_REGISTRY: PanelConfig[] = [
  {
    id: '101-chat',
    number: 101,
    label: '对话',
    labelEn: 'Chat',
    position: 'center',
    defaultExpanded: true,
    collapsible: false,
    description: '用户交互入口',
    role: '对话智能体',
  },
  {
    id: '201-scheduler',
    number: 201,
    label: '中枢',
    labelEn: 'Scheduler',
    position: 'left-bottom',
    defaultExpanded: true,
    collapsible: true,
    description: '统筹中枢',
    role: '统筹智能体',
  },
  {
    id: '301-reviewer',
    number: 301,
    label: '审查',
    labelEn: 'Reviewer',
    position: 'left-top',
    defaultExpanded: true,
    collapsible: true,
    description: '合规审查 + 全局广播源',
    role: '审查智能体 / 全局广播源',
  },
  {
    id: '401-editor',
    number: 401,
    label: '执行',
    labelEn: 'Editor',
    position: 'right',
    defaultExpanded: true,
    collapsible: false,
    description: '代码执行视窗',
    role: '执行智能体',
  },
]

export function getPanelConfig(id: string): PanelConfig | undefined {
  return PANEL_REGISTRY.find((p) => p.id === id)
}

export function getPanelByNumber(num: number): PanelConfig | undefined {
  return PANEL_REGISTRY.find((p) => p.number === num)
}

export const LEFT_PANELS = PANEL_REGISTRY.filter(
  (p) => p.position === 'left-top' || p.position === 'left-bottom'
)

/** 左侧上下比例：审查(上) 40%，中枢(下) 60% */
export const LEFT_PANEL_RATIO = {
  top: 0.4,
  bottom: 0.6,
} as const
