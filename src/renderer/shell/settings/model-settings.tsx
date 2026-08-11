import React from 'react'

const ModelSettings: React.FC = () => {
  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 16 }}>模型设置</h3>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        为每个面板配置默认模型与温度参数。
      </p>
      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        模型参数管理功能开发中...
      </div>
    </div>
  )
}

export default ModelSettings
