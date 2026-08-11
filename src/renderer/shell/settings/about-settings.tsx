import React from 'react'

const AboutSettings: React.FC = () => {
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 16 }}>关于 Goleynx</h3>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        <p>版本：0.1.0</p>
        <p>多 Agent 协同开发桌面平台</p>
        <p>让普通人也能通过对话驱动软件开发</p>
      </div>
    </div>
  )
}

export default AboutSettings
