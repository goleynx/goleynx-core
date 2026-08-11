import React, { useState } from 'react'
import { getStatusMap, STATUS_LABEL, type FileStatus } from './file-status-logic'

/** 可折叠文件状态面板 — 默认收起，点击展开显示所有文件状态 */
const FileStatusPanel: React.FC = () => {
  const [open, setOpen] = useState(false)
  const statuses = getStatusMap()
  const entries = Object.entries(statuses)

  return (
    <div style={{
      borderTop: open ? '1px solid var(--border-color)' : 'none',
      flexShrink: 0,
    }}>
      {/* 状态栏标题：点击展开/收起 */}
      <div
        onClick={() => setOpen(!open)}
        title={open ? '收起状态栏' : '展开状态栏'}
        style={{
          height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)',
          userSelect: 'none',
          background: 'var(--bg-primary)',
          borderTop: open ? 'none' : '1px solid var(--border-color)',
        }}
      >
        <span>状态</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>

      {/* 展开后的文件状态列表 */}
      {open && (
        <div style={{
          maxHeight: 200, overflow: 'auto',
          background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-color)',
        }}>
          {entries.length === 0 ? (
            <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-tertiary)' }}>
              暂无状态记录
            </div>
          ) : (
            entries.map(([path, status]) => (
              <div key={path} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', fontSize: 11,
                color: 'var(--text-secondary)',
              }}>
                <span>{STATUS_LABEL[status]}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default FileStatusPanel
