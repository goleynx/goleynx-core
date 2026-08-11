import React from 'react'
import { useAppStore } from '@stores/app-store'
import { useT } from '@renderer/hooks/use-translation'

const Statusbar: React.FC = () => {
  const t = useT()
  const { isHistoryOpen, toggleHistoryOpen, isBlueprintOpen, toggleBlueprintOpen, isSystemLogOpen, toggleSystemLogOpen, addExecutionAgent } = useAppStore()

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '20% 40% 40%',
      height: 30, background: 'var(--panel-header)',
      borderTop: '1px solid var(--border-color)', fontSize: 11,
    }}>
      {/* 左列 20% — 对齐审查/中枢左列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
        <button
          onClick={toggleHistoryOpen}
          style={{
            background: isHistoryOpen ? 'var(--accent-blue)' : 'var(--bg-hover)',
            color: isHistoryOpen ? '#fff' : 'var(--text-secondary)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            padding: '1px 8px', fontSize: 10,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
        >🕒 {t.panel_task_history}</button>
        <button
          onClick={toggleBlueprintOpen}
          style={{
            background: isBlueprintOpen ? 'var(--accent-blue)' : 'var(--bg-hover)',
            color: isBlueprintOpen ? '#fff' : 'var(--text-secondary)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            padding: '1px 8px', fontSize: 10,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
        >📖 {t.panel_blueprint}</button>
      </div>

      {/* 中列 40% — 空 */}
      <div />

      {/* 右列 40% — 对齐执行体右列：系统日志在左，添加执行体在右 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
        <button
          onClick={toggleSystemLogOpen}
          style={{
            background: isSystemLogOpen ? 'var(--accent-purple)' : 'var(--bg-hover)',
            color: isSystemLogOpen ? '#fff' : 'var(--text-secondary)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            padding: '1px 8px', fontSize: 10,
            cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
          }}
        >📋 {t.status_system_log}</button>
        <button
          onClick={async () => {
            await (window as any).electronAPI?.executor?.create?.()
            addExecutionAgent()
          }}
          style={{
            background: 'var(--accent-green)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)',
            padding: '1px 8px', fontSize: 10,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
        >➕ {t.status_add_exec}</button>
      </div>
    </div>
  )
}

export default Statusbar
