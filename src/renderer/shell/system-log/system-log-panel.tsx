import React, { useRef, useEffect, useMemo } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import { useSyslogStore } from '@stores/syslog-store'
import type { LogCategory } from '@shared/bus'

type TabId = 'all' | 'chat' | 'center' | 'review' | 'exec' | 'agent' | 'api' | 'broadcast' | 'read' | 'save' | 'error'

interface TabDef { id: TabId; key: keyof ReturnType<typeof useT>; category?: LogCategory }

const TABS: TabDef[] = [
  { id: 'all',       key: 'syslog_tab_all' },
  { id: 'chat',      key: 'syslog_tab_chat',      category: '对话' },
  { id: 'center',    key: 'syslog_tab_center',    category: '中枢' },
  { id: 'review',    key: 'syslog_tab_review',    category: '审查' },
  { id: 'exec',      key: 'syslog_tab_exec',      category: '执行' },
  { id: 'agent',     key: 'syslog_tab_agent',     category: 'Agent' },
  { id: 'api',       key: 'syslog_tab_api',       category: 'API' },
  { id: 'broadcast', key: 'syslog_tab_broadcast', category: '广播' },
  { id: 'read',      key: 'syslog_tab_read',      category: '阅读' },
  { id: 'save',      key: 'syslog_tab_save',      category: '保存' },
  { id: 'error',     key: 'syslog_tab_error',     category: '错误' },
]

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const SystemLogPanel: React.FC = () => {
  const t = useT()
  const [activeTab, setActiveTab] = React.useState<TabId>('all')
  const { enabled, logs, setEnabled, clearLogs } = useSyslogStore()
  const bodyRef = useRef<HTMLDivElement>(null)

  const filteredLogs = useMemo(() => {
    if (activeTab === 'all') return logs
    const category = TABS.find(t => t.id === activeTab)?.category
    return category ? logs.filter(l => l.category === category) : []
  }, [logs, activeTab])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [filteredLogs.length])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header" style={{ borderLeft: '3px solid var(--accent-purple)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{t.syslog_title}</span>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              background: enabled ? 'var(--accent-green)' : 'var(--accent-red)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)', padding: '1px 8px', fontSize: 10, cursor: 'pointer',
            }}
          >
            {enabled ? t.syslog_stop : t.syslog_start}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => {
            const text = filteredLogs.map(l =>
              `[${formatTime(l.timestamp)}] [${l.category}] [${l.sourceName}] ${l.message}`
            ).join('\n')
            navigator.clipboard.writeText(text).then(() => {
              const btn = document.getElementById('syslog-copy-btn')
              if (btn) { btn.textContent = '✓ 已复制'; setTimeout(() => { if (btn) btn.textContent = '复制全部' }, 2000) }
            })
          }} id="syslog-copy-btn" style={{
            background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '1px 8px', fontSize: 10, cursor: 'pointer',
          }}>复制全部</button>
          <button onClick={clearLogs} style={{
            background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '1px 8px', fontSize: 10, cursor: 'pointer',
          }}>{t.syslog_clear}</button>
        </div>
      </div>

      {/* 分类标签栏 */}
      <div style={{
        display: 'flex', gap: 2, padding: '4px 8px', flexShrink: 0,
        borderBottom: '1px solid var(--border-color)', overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '2px 10px', fontSize: 10, borderRadius: 3,
            background: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--bg-hover)',
            color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'background 0.15s, color 0.15s',
          }}>
            {t[tab.key as keyof typeof t]}
          </button>
        ))}
      </div>

      {/* 日志列表 — 可滚动 */}
      <div ref={bodyRef} style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8,
      }}>
        {filteredLogs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 40 }}>
            {t.syslog_empty}
          </div>
        )}
        {filteredLogs.map((l) => (
          <div key={l.id} style={{ color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>[{formatTime(l.timestamp)}]</span>
            {' '}{l.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default SystemLogPanel
