import React, { useState, useEffect } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import ModelSelector from '@renderer/components/model-selector/model-selector'
import { useAppStore } from '@stores/app-store'

interface StatusItem {
  round?: string               // 4 位 padded，如 "0001"
  id?: string
  timestamp?: string
  type?: string                // 目标提炼 | 开发步骤 | 调度指令
  message?: string
  projectName?: string
  goalsChanged?: string
  totalGroups?: string | number  // 总组数（从开发步骤读）
  stepCode?: string              // 步骤编号，如 "0501"
  groupNumber?: number           // 当前组号 1, 2, 3...
  dispatchCount?: number         // 当前组第几次调度 1, 2, 3...
}

const TYPE_ICONS: Record<string, string> = {
  '目标提炼': '🎯',
  '开发步骤': '📋',
  '调度指令': '📡',
}

function fmtTime(ts?: string) {
  if (!ts) return ''
  const m = ts.match(/\d{4}\/(\d{2}\/\d{2})\s(\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : ts
}

/** 一条消息卡片 — 统一与 301 风格 */
const MessageCard: React.FC<{ time?: string; round: string; dotColor?: string; children: React.ReactNode }> = ({ time, round, dotColor, children }) => (
  <div style={{
    padding: '5px 8px', marginBottom: 3, borderRadius: 4,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
  }}>
    <div style={{ fontSize: 7, color: 'var(--text-tertiary)', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{fmtTime(time)}</span>
      <span style={{ color: 'var(--border-color)' }}>---</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>{round}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      {dotColor && <span style={{ color: dotColor, fontSize: 8 }}>●</span>}
      {children}
    </div>
  </div>
)

const SchedulerPanel: React.FC = () => {
  const t = useT()
  const [model, setModel] = useState('')
  const [statuses, setStatuses] = useState<StatusItem[]>([])
  const { activeChatAgentId, switchChatAgent } = useAppStore()
  const active = activeChatAgentId === 'b'
  const toggle = () => switchChatAgent(active ? 'a' : 'b')

  useEffect(() => {
    const readStatus = async () => {
      const raw = await (window as any).electronAPI?.file?.readRaw('runtime/panels/b/statuses.json')
      if (!raw) { setStatuses([]); return }
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setStatuses(arr)
      } catch { setStatuses([]) }
    }
    readStatus()
    const timer = setInterval(readStatus, 3000)
    return () => clearInterval(timer)
  }, [])

  // 按轮次分组（每轮一张大卡片）
  const grouped: Record<string, StatusItem[]> = {}
  for (const s of statuses) {
    const r = s.round ?? '0000'
    if (!grouped[r]) grouped[r] = []
    grouped[r].push(s)
  }
  const sortedRounds = Object.keys(grouped).sort()

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ borderLeft: '3px solid var(--accent-amber)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{t.panel_schedule} B</span>
          <button onClick={toggle} title={active ? '关闭' : '终端'} style={{
            background: active ? 'rgba(34,197,94,0.12)' : 'var(--bg-hover)',
            color: active ? 'var(--accent-green)' : 'var(--text-secondary)',
            border: 'none', borderRadius: 3, padding: '1px 6px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: active ? 600 : 400,
          }}>&gt;_</button>
        </div>
        <ModelSelector value={model} onChange={setModel} />
      </div>

      <div className="panel-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 8 }}>
        {sortedRounds.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 30, fontSize: 12 }}>
            {t.sched_no_items}
          </div>
        ) : (
          sortedRounds.map((round) => {
            const items = grouped[round]
            const roundNum = parseInt(round, 10) || 0
            // 找目标提炼 / 开发步骤 / 调度
            const goalsItem = items.find(i => i.type === '目标提炼')
            const stepsItem = items.find(i => i.type === '开发步骤')
            const dispatchItems = items.filter(i => i.type === '调度指令')
            // 总组数取最后一个调度 / 开发步骤里的 totalGroups
            const totalGroups = dispatchItems[dispatchItems.length - 1]?.totalGroups
              ?? stepsItem?.totalGroups
              ?? 0
            return (
              <div key={round} style={{
                border: '1px solid var(--border-color)',
                borderRadius: 6, padding: '6px 8px', marginBottom: 8,
                background: 'var(--panel-header)',
                borderLeft: '3px solid var(--accent-green)',
              }}>
                {/* 轮次标题 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  marginBottom: 4,
                }}>
                  <span>🎯</span>
                  <span>第 {String(roundNum).padStart(4, '0')} 轮</span>
                </div>

                {/* 每条消息独立卡片 */}
                {goalsItem && (
                  <MessageCard time={goalsItem.timestamp} round={round}>
                    <span style={{ color: 'var(--accent-green)' }}>✅</span>
                    <span>目标提炼{goalsItem.projectName ? ` — ${goalsItem.projectName}` : ''}</span>
                    <span style={{ marginLeft: 6, fontSize: 10, color: goalsItem.goalsChanged === 'true' ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>
                      {goalsItem.goalsChanged === 'true' ? '已更新' : '未变化'}
                    </span>
                  </MessageCard>
                )}

                {stepsItem && (
                  <MessageCard time={stepsItem.timestamp} round={round}>
                    <span style={{ color: 'var(--accent-green)' }}>✅</span>
                    <span>项目开发步骤已更新 — 已分 {stepsItem.totalGroups || totalGroups || '?'} 组</span>
                  </MessageCard>
                )}

                {/* 进度行：红点 + s0001 / N */}
                {dispatchItems.length > 0 && (
                  <MessageCard
                    time={dispatchItems[0].timestamp}
                    round={round}
                    dotColor="var(--accent-red)"
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      s{round} / {totalGroups}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>第 0001 组调度</span>
                  </MessageCard>
                )}

                {/* 调度行：灰点 + s0001-01-D/E */}
                {dispatchItems.map((d, i) => {
                  const cnt = d.dispatchCount ?? 1
                  const exec = (d.executor || 'd').toUpperCase()
                  const code = `s${round}-${String(cnt).padStart(2, '0')}-${exec}`
                  return (
                    <MessageCard
                      key={d.id ?? i}
                      time={d.timestamp}
                      round={round}
                      dotColor="var(--text-tertiary)"
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{code}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>第 {cnt} 次调度</span>
                        <div style={{ height: 6 }} />
                        <div style={{ height: 6 }} />
                        <span style={{ color: 'var(--accent-green)', fontSize: 11 }}>已下发</span>
                      </div>
                    </MessageCard>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SchedulerPanel
