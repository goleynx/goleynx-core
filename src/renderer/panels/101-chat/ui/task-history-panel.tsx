import React, { useState } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import { useAppStore } from '@stores/app-store'

const TaskHistoryPanel: React.FC = () => {
  const t = useT()
  const { taskList, activeTaskId, switchActiveTask, addTask, renameTask } = useAppStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditValue(name)
  }

  const submitEdit = async (id: string) => {
    const val = editValue.trim()
    if (val && val !== id) {
      renameTask(id, val)
      await (window as any).electronAPI?.project?.rename?.(id, val)
    }
    setEditingId(null)
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部：新建任务按钮 */}
      <div style={{
        padding: 10,
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <button
          onClick={async () => {
            const pid = await (window as any).electronAPI?.project?.create?.()
            if (pid) addTask({ id: pid, name: pid })
          }}
          style={{
            width: '100%', padding: '8px 0',
            background: 'var(--accent-green)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {t.task_new}
        </button>
      </div>

      {/* 任务列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {taskList.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 30, fontSize: 12 }}>
            暂无任务
          </div>
        )}
        {taskList.map((t) => (
          <div
            key={t.id}
            onClick={() => switchActiveTask(t.id)}
            onDoubleClick={() => startEdit(t.id, t.name)}
            style={{
              padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
              background: activeTaskId === t.id ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
              color: activeTaskId === t.id ? '#fff' : 'var(--text-primary)',
              border: activeTaskId === t.id ? 'none' : '1px solid var(--border-color)',
              cursor: 'pointer', fontSize: 12,
              transition: 'background 0.15s, color 0.15s',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            {editingId === t.id ? (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => submitEdit(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEdit(t.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1, padding: '2px 4px', fontSize: 12,
                  background: 'var(--panel-bg)', color: 'var(--text-primary)',
                  border: '1px solid var(--accent-blue)', borderRadius: 2, outline: 'none',
                }}
              />
            ) : (
              <>
                <span>{t.name}</span>
                <span style={{ fontSize: 9, color: activeTaskId === t.id ? 'rgba(255,255,255,0.5)' : 'var(--text-tertiary)' }}>{t.id}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TaskHistoryPanel
