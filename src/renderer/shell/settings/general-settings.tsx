import React from 'react'
import { useAppStore } from '@stores/app-store'

const GeneralSettings: React.FC = () => {
  const { language, setLanguage } = useAppStore()

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 16 }}>通用设置</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>语言</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en-US')}
          style={{
            width: '100%', padding: '6px 10px', background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: 13,
          }}
        >
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </div>
    </div>
  )
}

export default GeneralSettings
