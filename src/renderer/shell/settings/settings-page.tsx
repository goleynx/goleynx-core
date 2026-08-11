import React from 'react'
import { useAppStore } from '@stores/app-store'

const SettingsPage: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { theme, setTheme, language, setLanguage } = useAppStore()

  return (
    <div style={{ padding: 24, maxWidth: 400, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 20, fontSize: 16, fontWeight: 500 }}>设置</h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>主题</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13 }}>
          <option value="dark">暗黑</option>
          <option value="light">亮色</option>
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>语言</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en-US')}
          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13 }}>
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
        <p>版本 0.1.0</p>
        <p>多Agent协同开发桌面平台</p>
      </div>

      {onClose && (
        <button onClick={onClose} style={{ marginTop: 16, padding: '6px 16px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>关闭</button>
      )}
    </div>
  )
}

export default SettingsPage
