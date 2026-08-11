/**
 * @file 窗口尺寸与位置持久化
 * @module main/window
 * @description 窗口关闭时保存 bounds 到本地文件，启动时恢复。
 */

import { app, Rectangle } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/** 获取窗口状态存储路径（惰性求值，避免顶层调用 electron API） */
function getStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

/** 默认窗口尺寸 */
const DEFAULT_BOUNDS: Rectangle = {
  width: 1280,
  height: 800,
  x: 0,
  y: 0,
}

/** 读取上次保存的窗口状态 */
export function loadWindowState(): Rectangle {
  try {
    const statePath = getStatePath()
    if (existsSync(statePath)) {
      const raw = readFileSync(statePath, 'utf-8')
      const saved = JSON.parse(raw)
      return {
        x: saved.x,
        y: saved.y,
        width: saved.width || DEFAULT_BOUNDS.width,
        height: saved.height || DEFAULT_BOUNDS.height,
      }
    }
  } catch {
    // 文件损坏或不存在，用默认值
  }
  return { ...DEFAULT_BOUNDS }
}

/** 保存当前窗口状态 */
export function saveWindowState(bounds: Rectangle): void {
  try {
    const userDataPath = app.getPath('userData')
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true })
    }
    writeFileSync(getStatePath(), JSON.stringify({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }, null, 2))
  } catch {
    // 静默失败
  }
}
