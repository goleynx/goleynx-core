import React from 'react'
import { useAppStore } from '@stores/app-store'

const AppearanceSettings: React.FC = () => {
  const { theme, setTheme } = useAppStore()

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 16 }}>外观设置</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>主题</label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
          style={{
            width: '100%', padding: '6px 10px', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13,
          }}
        >
          <option value="dark">暗黑</option>
          <option value="light">亮色</option>
        </select>
      </div>
    </div>
  )
}

export default AppearanceSettings
