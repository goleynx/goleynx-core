/**
 * @file 面板布局状态管理
 * @module stores/panel-store
 * @description 使用 Zustand 管理四个面板的展开/收起、宽度、可见性。
 *              右侧面板整体收起时，面板状态保持但UI不渲染。
 */

import { create } from 'zustand'
import { PanelState, RightPanelState } from '@shared/types/panel'
import { PANEL_REGISTRY, getPanelConfig } from '@shared/config/panels'
import { PANEL_DEFAULTS } from '@shared/constants'

interface PanelStore {
  /** 所有面板的运行时状态 */
  panels: PanelState[]
  /** 右侧面板组状态 */
  rightPanel: RightPanelState

  /** 初始化面板状态（从面板注册表读取） */
  initPanels: () => void
  /** 收起或展开右侧面板组 */
  toggleRightPanel: () => void
  /** 展开右侧面板 */
  expandRightPanel: () => void
  /** 收起右侧面板 */
  collapseRightPanel: () => void
  /** 更新面板宽度 */
  setPanelWidth: (id: string, width: number) => void
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panels: [],
  rightPanel: {
    collapsed: false,
    reviewerVisible: true,
    schedulerVisible: true,
  },

  initPanels: () => {
    const panels: PanelState[] = PANEL_REGISTRY.map((config) => ({
      id: config.id,
      number: config.number,
      position: config.position,
      expanded: config.defaultExpanded,
      width: config.position === 'left'
        ? PANEL_DEFAULTS.leftWidth
        : config.position === 'center'
          ? -1 // 自适应
          : PANEL_DEFAULTS.rightWidth,
    }))
    set({ panels })
  },

  toggleRightPanel: () => {
    const { rightPanel } = get()
    set({ rightPanel: { ...rightPanel, collapsed: !rightPanel.collapsed } })
  },

  expandRightPanel: () => {
    set((state) => ({ rightPanel: { ...state.rightPanel, collapsed: false } }))
  },

  collapseRightPanel: () => {
    set((state) => ({ rightPanel: { ...state.rightPanel, collapsed: true } }))
  },

  setPanelWidth: (id, width) => {
    set((state) => ({
      panels: state.panels.map((p) => (p.id === id ? { ...p, width } : p)),
    }))
  },
}))
