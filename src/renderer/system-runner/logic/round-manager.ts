/**
 * @file 轮次管理器 — 持久化常量
 * @module system-runner/logic/round-manager
 *
 * 职责（就这一件事）：
 * 1. 启动时从 runtime/round.json 读取当前轮次，写入 store
 * 2. 监听 OFF{当前轮次} 和 STP{当前轮次} 广播
 * 3. 收到任何一个 → 轮次立刻 +1 → 持久化写入文件 → 更新 store
 *
 * 不管的：
 * - OFF/STP 是谁发的（不管，反正有人发）
 * - 10 秒延迟（不做，那是状态显示的事）
 * - 提交/终止/状态显示（不碰，那是 UI 层的事）
 */

import { useAppStore } from '@stores/app-store'
import { bus } from '@shared/bus'
import { useSyslogStore } from '@stores/syslog-store'
import { reloadWindowAgents } from '@renderer/core/window-agent'

const ROUND_FILE = 'runtime/round.json'

let initialized = false

/** 读取持久化的轮次 */
async function readRound(): Promise<number> {
  const raw = await (window as any).electronAPI?.file?.readRaw(ROUND_FILE)
  if (!raw) return 1
  try {
    const data = JSON.parse(raw)
    return data.currentRound ?? 1
  } catch {
    return 1
  }
}

/** 写入持久化的轮次 */
async function writeRound(round: number): Promise<void> {
  await (window as any).electronAPI?.file?.writeRaw(
    ROUND_FILE,
    JSON.stringify({ currentRound: round }, null, 2),
  )
}

/**
 * 启动轮次管理器（全局调用一次）
 *
 * 流程：
 *   启动 → 读 round.json → 写入 store.currentRound
 *   监听 OFF{当前轮次} 或 STP{当前轮次} → +1 → 写 round.json → 更新 store.currentRound
 */
export function setupRoundManager() {
  if (initialized) return
  initialized = true

  // 1. 初始化：从持久化文件读取轮次
  ;(async () => {
    const round = await readRound()
    useAppStore.getState().setCurrentRound(round)
    useSyslogStore.getState().addLog({
      timestamp: Date.now(),
      category: '广播',
      sourceName: '轮次管理器',
      message: `[轮次管理器] 初始化轮次: ${String(round).padStart(4, '0')}`,
    })
  })()

  // 2. 监听 OFF{当前轮次} 或 STP{当前轮次} → 立刻 +1（持久化 + 更新 store）
  const handler = async (event: any) => {
    if (!event.eventType) return
    // 匹配 off0001 / stp0001 / off0002 / stp0002 ...
    const m = event.eventType.match(/^(off|stp)(\d{4})$/)
    if (!m) return

    const eventType = m[1]  // "off" 或 "stp"
    const eventRound = parseInt(m[2])
    const currentRound = useAppStore.getState().currentRound

    // 只有事件的轮次 == 当前轮次 时才 +1
    if (eventRound !== currentRound) return

    const nextRound = currentRound + 1

    // 持久化写入文件
    await writeRound(nextRound)

    // 更新 store
    useAppStore.getState().setCurrentRound(nextRound)

    // 步进后重载窗口代理（重新扫描引擎 → 重新注册监听）
    reloadWindowAgents()

    // ── 非对称断代分隔符：201/301/401 截获 OFF/STP 后插入 === {下一轮次} === ──
    const sepPad = String(currentRound + 1).padStart(4, '0')
    const sepTag = `=== ${sepPad} ===`
    const sepEntry = { round: sepTag, role: 'separator', content: '', timestamp: new Date().toISOString() }
    try {
      const api = (window as any).electronAPI
      if (api?.storage?.append) {
        await api.storage.append('b', sepEntry)
        await api.storage.append('c', sepEntry)
        await api.storage.append('d', sepEntry)
      }
    } catch {}

    useSyslogStore.getState().addLog({
      timestamp: Date.now(),
      category: '广播',
      sourceName: '轮次管理器',
      message: `[轮次管理器] 收到 ${eventType}${String(eventRound).padStart(4, '0')} → 轮次 +1 → ${String(nextRound).padStart(4, '0')}（已持久化）`,
    })

}
  bus.on("agent:broadcast", handler)
}
