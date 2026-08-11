/**
 * @file 101 窗口轮次控制逻辑
 * @module system-runner/logic/round-control-logic
 *
 * 职责：
 * 1. 监听 OFF{任意轮次} 广播 → 正常结束 → 自动发下一轮广播
 *    - 有排队（QUEUED）→ 等 10ms（让 round-manager 先完成 +1）→ 发 A{当前常量} → state=RUNNING
 *    - 没排队（RUNNING）→ 10 秒倒计时 → 发 A{当前常量} → state=RUNNING（全自动）
 *    - 10 秒倒计时期间设置 endingRound（状态显示"A{N} 已结束"）
 *
 * 2. 监听 STP{任意轮次} 广播 → 强制终止 → 不自动发广播
 *    - 清除 endingRound（如果在倒计时中）
 *    - 清除排队 → state=STOPPED
 *    - 不发 A{新常量}（等用户再点提交）
 *
 * 不管的：
 * - 提交按钮逻辑（在 round-control-bar.tsx 里）
 * - 终止按钮逻辑（在 round-control-bar.tsx 里）
 * - 常量 +1（round-manager 负责，OFF 和 STP 都 +1）
 */

import { useAppStore } from '@stores/app-store'
import { bus } from '@shared/bus'
import { useSyslogStore } from '@stores/syslog-store'
import { emitBroadcast } from '@renderer/core/agent-listeners'

const OFF_10MS_DELAY = 10       // 有排队时等 10ms 让 round-manager 完成 +1
const OFF_10S_DELAY = 10000     // 没排队时 10 秒倒计时

let initialized = false

/**
 * 启动 101 窗口的 OFF/STP 监听 + 自动发广播逻辑（全局调用一次）
 */
export function setupRoundControlLogic() {
  if (initialized) return
  initialized = true

  const handler = async (event: any) => {
    if (!event.eventType) return

    // ── off{N} → 正常结束 → 自动发下一轮 ──
    const offMatch = event.eventType.match(/^off(\d{4})$/)
    if (offMatch) {
      const offRound = parseInt(offMatch[1])
      const { runnerState } = useAppStore.getState()

      useSyslogStore.getState().addLog({
        timestamp: Date.now(),
        category: '广播',
        sourceName: '对话窗',
        message: `[对话窗] 收到 off${String(offRound).padStart(4, '0')}（state=${runnerState}）`,
      })

      if (runnerState === 'QUEUED') {
        // 有排队 → 等 10ms（让 round-manager 完成 +1）→ 发 A{当前常量}
        setTimeout(() => {
          const currentRound = useAppStore.getState().currentRound
          const roundCode = `A${String(currentRound).padStart(4, '0')}`
          emitBroadcast({
            sourceId: 'A',
            sourceName: '对话窗',
            eventType: roundCode,
            message: `${roundCode} 排队触发，启动第 ${currentRound} 轮`,
            category: '广播',
          })
          useAppStore.getState().setRunnerState('RUNNING')
          useSyslogStore.getState().addLog({
            timestamp: Date.now(),
            category: '广播',
            sourceName: '对话窗',
            message: `[对话窗] 排队触发 → 发 ${roundCode} 广播`,
          })
        }, OFF_10MS_DELAY)
      } else if (runnerState === 'RUNNING') {
        // 没排队 → 10 秒倒计时 → 发 A{当前常量}（全自动）
        useAppStore.getState().setEndingRound(offRound)
        useSyslogStore.getState().addLog({
          timestamp: Date.now(),
          category: '广播',
          sourceName: '对话窗',
          message: `[对话窗] off${String(offRound).padStart(4, '0')} → 10 秒倒计时开始`,
        })
        setTimeout(() => {
          const currentRound = useAppStore.getState().currentRound
          const roundCode = `A${String(currentRound).padStart(4, '0')}`
          emitBroadcast({
            sourceId: 'A',
            sourceName: '对话窗',
            eventType: roundCode,
            message: `${roundCode} 自动触发（10秒倒计时结束），启动第 ${currentRound} 轮`,
            category: '广播',
          })
          useAppStore.getState().setEndingRound(null)
          // state 保持 RUNNING
          useSyslogStore.getState().addLog({
            timestamp: Date.now(),
            category: '广播',
            sourceName: '对话窗',
            message: `[对话窗] 10 秒倒计时结束 → 发 ${roundCode} 广播`,
          })
        }, OFF_10S_DELAY)
      }
      // STOPPED / IDLE → 不做事
      return
    }

    // ── stp{N} → 强制终止 → 清除排队 → 不自动发广播 ──
    const stpMatch = event.eventType.match(/^stp(\d{4})$/)
    if (stpMatch) {
      const stpRound = parseInt(stpMatch[1])
      const { runnerState } = useAppStore.getState()

      useSyslogStore.getState().addLog({
        timestamp: Date.now(),
        category: '广播',
        sourceName: '对话窗',
        message: `[对话窗] 收到 stp${String(stpRound).padStart(4, '0')}（state=${runnerState}）→ 清除排队 → state=STOPPED`,
      })

      // 清除 endingRound（如果在倒计时中）
      useAppStore.getState().setEndingRound(null)
      // 设置被中止的轮次（状态显示"A{N} 已中止"用，不能用 currentRound 因为它已经 +1）
      useAppStore.getState().setStoppedRound(stpRound)
      // 清除排队 → state=STOPPED
      useAppStore.getState().setRunnerState('STOPPED')
      // 不自动发广播（等用户再点提交）
    }
  }

  bus.on('agent:broadcast', handler)
}
