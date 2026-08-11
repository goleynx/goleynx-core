import React, { useMemo, useState, useEffect } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import ModelSelector from '@renderer/components/model-selector/model-selector'
import { useAppStore } from '@stores/app-store'

interface ReviewRecord {
  id: string
  round?: string
  timestamp: string
  fileName: string
  reviewType: string
  status: 'pass' | 'warn' | 'reject' | 'fused'
  reason: string
}

function fmtTime(ts?: string) {
  if (!ts) return ''
  const m = ts.match(/\d{4}\/(\d{2}\/\d{2})\s(\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : ts
}

const STATUS_COLORS: Record<string, string> = {
  pass: 'var(--accent-green)', warn: 'var(--accent-amber)', reject: 'var(--accent-red)', fused: 'var(--accent-red)',
}

const ReviewerPanel: React.FC = () => {
  const t = useT()
  const statusLabels = useMemo<Record<string, string>>(() => ({
    pass: t.review_pass,
    warn: t.review_warn,
    reject: t.review_reject,
    fused: '熔断',
  }), [t.review_pass, t.review_warn, t.review_reject])
  const [model, setModel] = useState('')
  const [reviews, setReviews] = useState<ReviewRecord[]>([])
  const { activeChatAgentId, switchChatAgent } = useAppStore()
  const active = activeChatAgentId === 'c'
  const toggle = () => switchChatAgent(active ? 'a' : 'c')
  // 按轮次分组
  const grouped = useMemo(() => {
    const g: Record<string, ReviewRecord[]> = {}
    reviews.forEach(r => {
      const rnd = r.round || '0001'
      if (!g[rnd]) g[rnd] = []
      g[rnd].push(r)
    })
    return g
  }, [reviews])
  const sortedRounds = Object.keys(grouped).sort()

  useEffect(() => {
    const loadReviews = async () => {
      const raw = await (window as any).electronAPI?.file?.readRaw('runtime/panels/c/reviews.json')
      if (!raw) { setReviews([]); return }
      try {
        const arr = JSON.parse(raw)
        setReviews(Array.isArray(arr) ? arr : [])
      } catch { setReviews([]) }
    }
    loadReviews()
    const timer = setInterval(loadReviews, 3000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ borderLeft: '3px solid var(--accent-red)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{t.panel_review} C</span>
          <button onClick={toggle} title={active ? '关闭' : '终端'} style={{
            background: active ? 'rgba(34,197,94,0.12)' : 'var(--bg-hover)',
            color: active ? 'var(--accent-green)' : 'var(--text-secondary)',
            border: 'none', borderRadius: 3, padding: '1px 6px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: active ? 600 : 400,
          }}>&gt;_</button>
        </div>
        <ModelSelector value={model} onChange={setModel} />
      </div>

      {/* 审查记录流 — 只读展示，用户通过 >_ 终端干预 */}
      <div className="panel-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 8px' }}>
        <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          {t.review_count} · {reviews.length}
        </div>
        {sortedRounds.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 30, fontSize: 12 }}>
            {t.review_empty}
          </div>
        ) : (
          sortedRounds.map(round => (
            <div key={round} style={{
              border: '1px solid var(--border-color)',
              borderRadius: 6, padding: '6px 8px', marginBottom: 8,
              background: 'var(--panel-header)',
              borderLeft: '3px solid var(--accent-red)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                marginBottom: 4,
              }}>
                <span>🎯</span>
                <span>第 {String(parseInt(round)||1).padStart(4,'0')} 轮</span>
              </div>
              {grouped[round].map((r) => (
                <div key={r.id} style={{
                  padding: '5px 8px', marginBottom: 3, borderRadius: 4,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                }}>
                  <div style={{ fontSize: 7, color: 'var(--text-tertiary)', marginBottom: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{fmtTime(r.timestamp)}</span>
                    <span style={{ color: 'var(--border-color)' }}>---</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{r.round || '0001'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.fileName}</span>
                    <span style={{
                      fontSize: 12, color: STATUS_COLORS[r.status], fontWeight: 500,
                      padding: '1px 6px', borderRadius: 3, border: `1px solid ${STATUS_COLORS[r.status]}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {statusLabels[r.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {r.reviewType}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 8, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 1 }}>
                      {r.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ReviewerPanel
