import React from 'react'

const Menubar: React.FC = () => (
  <div style={{ display: 'flex', height: 28, padding: '0 8px', background: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)', fontSize: 12, alignItems: 'center' }}>
    {['文件', '编辑', '视图', '帮助'].map((label) => (
      <button key={label} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>
        {label}
      </button>
    ))}
  </div>
)

export default Menubar
