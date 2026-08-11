import React from 'react'
import { useT } from '@renderer/hooks/use-translation'
import { useAppStore, type RunnerState } from '@stores/app-store'
import { emitBroadcast } from '@renderer/core/agent-listeners'
import { useSyslogStore } from '@stores/syslog-store'

/**
 * 101 对话框底部 — 提交/终止/当前运行轮次 控制条
 *
 * 布局：[提交]      [当前运行轮次: XXX]      [终止]
 *
 * 提交按钮逻辑：
 *  - IDLE/STOPPED → 发 A{currentRound} 广播 → state=RUNNING
 *  - RUNNING → state=QUEUED（排队等 OFF0001）
 *  - QUEUED → 灰色不可点
 *
 * 终止按钮逻辑：
 *  - RUNNING → 发 STP{currentRound} 广播 → state=STOPPED
 *  - 其他 → 灰色不可点
 */
const RoundControlBar: React.FC = () => {
  const t = useT()
  const { runnerState, currentRound, setRunnerState, endingRound, stoppedRound, setStoppedRound } = useAppStore()

  const roundCode = `A${String(currentRound).padStart(4, '0')}`
  const stopCode = `stp${String(currentRound).padStart(4, '0')}`

  const canSubmit = runnerState === 'IDLE' || runnerState === 'STOPPED'
  const canStop = runnerState === 'RUNNING'

  // 状态显示：stoppedRound 优先（STP 触发，显示"已中止"），其次 endingRound（OFF 倒计时），最后按 runnerState
  const stateText =
    stoppedRound !== null ? `a${String(stoppedRound).padStart(4, '0')} ${t.round_stopped}`
    : endingRound !== null ? `a${String(endingRound).padStart(4, '0')} ${t.round_stopped}`
    : runnerState === 'IDLE' ? t.round_idle
    : runnerState === 'RUNNING' ? `${roundCode} ${t.round_running}`
    : runnerState === 'QUEUED' ? `a${String(currentRound + 1).padStart(4, '0')} ${t.round_queued}`
    : `${roundCode} ${t.round_stopped}`

  const stateColor =
    stoppedRound !== null ? 'var(--accent-red)'
    : endingRound !== null ? '#eab308'
    : runnerState === 'IDLE' ? 'var(--text-tertiary)'
    : runnerState === 'RUNNING' ? 'var(--accent-green)'
    : runnerState === 'QUEUED' ? '#eab308'
    : 'var(--accent-red)'

  /** 提交按钮：第一次点=发广播启动；第二次点=排队等下一轮 */
  const handleSubmit = () => {
    if (runnerState === 'IDLE' || runnerState === 'STOPPED') {
      // 发 A{currentRound} 广播 → 启动本轮全链路
      // 清空 stoppedRound（让状态从"已中止"恢复）
      setStoppedRound(null)
      emitBroadcast({
        sourceId: 'A',
        sourceName: '对话窗',
        eventType: roundCode,
        message: `${roundCode} 用户提交，启动第 ${currentRound} 轮`,
        category: '广播',
      })
      setRunnerState('RUNNING')
      ;(async () => {
        try {
          const nextRound = currentRound + 1
          const sepTag = `=== ${String(nextRound).padStart(4, '0')} ===`
          await (window as any).electronAPI?.storage?.append('a', {
            round: sepTag, role: 'separator', content: '', timestamp: new Date().toISOString(),
          })
        } catch {}
      })()
      useSyslogStore.getState().addLog({
        timestamp: Date.now(), category: '广播',
        sourceName: '对话窗', message: `[对话窗] 用户点提交 → 发 ${roundCode} 广播`,
      })
    } else if (runnerState === 'RUNNING') {
      // 排队：等当前轮 OFF 到了再发下一轮广播
      setRunnerState('QUEUED')
      useSyslogStore.getState().addLog({
        timestamp: Date.now(), category: '广播',
        sourceName: '对话窗', message: `[对话窗] 用户点提交 → a${String(currentRound + 1).padStart(4, '0')} 排队中（等 off${String(currentRound).padStart(4, '0')}）`,
      })
    }
  }

  /** 终止按钮：发 STP{currentRound} 广播 → 全链路停止 */
  const handleStop = () => {
    if (runnerState !== 'RUNNING') return
    emitBroadcast({
      sourceId: 'a',
      sourceName: '对话窗',
      eventType: stopCode,
      message: `${stopCode} 用户终止第 ${currentRound} 轮`,
      category: '广播',
    })
    setRunnerState('STOPPED')
    useSyslogStore.getState().addLog({
      timestamp: Date.now(), category: '广播',
      sourceName: '对话窗', message: `[对话窗] 用户点终止 → 发 ${stopCode} 广播，全链路停止`,
    })
  }

  // 柔和按钮样式：可点时彩色淡底+边框，不可点时透明+灰边
  const getButtonStyle = (enabled: boolean, color: string): React.CSSProperties => {
    if (enabled) {
      return {
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color: color,
        border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`,
        cursor: 'pointer',
      }
    }
    return {
      background: 'transparent',
      color: 'var(--text-tertiary)',
      border: '1px solid var(--border-color)',
      cursor: 'not-allowed',
    }
  }

  const buttonBase: React.CSSProperties = {
    borderRadius: 'var(--radius-sm)',
    padding: '0 12px',
    height: 18,
    fontSize: 11,
    fontWeight: 600,
    transition: 'background 0.15s, color 0.15s, border 0.15s',
    flexShrink: 0,
  }

  return (
    <div
      data-component="round-control-bar"
      style={{
        height: 24,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        gap: 8,
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border-color)',
      }}
    >
      {/* 左：提交按钮（最左） */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        title={t.btn_submit_title}
        style={{ ...buttonBase, ...getButtonStyle(canSubmit, 'var(--accent-green)') }}
      >
        {t.btn_submit}
      </button>

      {/* 中：当前运行轮次（居中） */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--text-secondary)',
        minWidth: 0,
        overflow: 'hidden',
      }}>
        <span style={{ whiteSpace: 'nowrap' }}>{t.round_label}</span>
        <span style={{
          fontFamily: 'monospace',
          fontWeight: 600,
          color: stateColor,
          whiteSpace: 'nowrap',
        }}>
          {stateText}
        </span>
      </div>

      {/* 右：终止按钮（最右） */}
      <button
        onClick={handleStop}
        disabled={!canStop}
        title={t.btn_stop_title}
        style={{ ...buttonBase, ...getButtonStyle(canStop, 'var(--accent-red)') }}
      >
        {t.btn_stop}
      </button>
    </div>
  )
}

export default RoundControlBar
