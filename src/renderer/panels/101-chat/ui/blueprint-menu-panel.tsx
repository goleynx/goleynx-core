import React, { useMemo } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import { useAppStore, type BlueprintDocId } from '@stores/app-store'

const BlueprintMenuPanel: React.FC = () => {
  const t = useT()
  const { taskList, activeTaskId, activeBlueprintDoc, setBlueprintDoc } = useAppStore()
  const activeTask = taskList.find((tk) => tk.id === activeTaskId)
  const taskName = activeTask?.name ?? t.task_unknown
  const projectId = activeTask?.id ?? ''

  const menuItems = useMemo(() => [
    { id: 'goals' as BlueprintDocId, label: t.blueprint_goals, code: 'D01' },
    { id: 'requirements' as BlueprintDocId, label: t.blueprint_requirements, code: 'D02' },
    { id: 'architecture' as BlueprintDocId, label: t.blueprint_architecture, code: 'D03' },
    { id: 'review-rules' as BlueprintDocId, label: t.blueprint_review_rules, code: 'D04' },
    { id: 'steps' as BlueprintDocId, label: t.blueprint_steps, code: 'D05' },
    { id: 'summary' as BlueprintDocId, label: t.blueprint_summary, code: 'D06' },
  ], [t.blueprint_requirements, t.blueprint_goals, t.blueprint_architecture, t.blueprint_review_rules, t.blueprint_steps, t.blueprint_summary])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 10,
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>[{taskName}]</span>
          {projectId && (
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{projectId}</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t.panel_blueprint}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {menuItems.map((item) => (
          <div
            key={item.id}
            onClick={() => setBlueprintDoc(item.id)}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
              background: activeBlueprintDoc === item.id ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
              color: activeBlueprintDoc === item.id ? '#fff' : 'var(--text-primary)',
              border: activeBlueprintDoc === item.id ? 'none' : '1px solid var(--border-color)',
              cursor: 'pointer', fontSize: 12,
              transition: 'background 0.15s, color 0.15s',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span>{item.label}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.7 }}>{item.code}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BlueprintMenuPanel
