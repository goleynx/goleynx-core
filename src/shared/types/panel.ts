/**
 * @file 面板类型
 * @module shared/types/panel
 */

import { PanelPosition } from '../config/panels'

/** 面板运行时状态 */
export interface PanelState {
  id: string
  number: number
  position: PanelPosition
  expanded: boolean
  width: number
}

/** 右侧面板组收起/展开状态 */
export interface RightPanelState {
  /** 整体是否收起 */
  collapsed: boolean
  /** 301 是否可见 */
  reviewerVisible: boolean
  /** 201 是否可见 */
  schedulerVisible: boolean
}
