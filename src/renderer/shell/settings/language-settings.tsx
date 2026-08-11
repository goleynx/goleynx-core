import React from 'react'
import { useAppStore } from '@stores/app-store'
import { zhCN, enUS } from '@shared/i18n/translations'

const LanguageSettings: React.FC = () => {
  const { language, setLanguage } = useAppStore()
  const t = language === 'zh-CN' ? zhCN : enUS

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 16 }}>{t.lang_title}</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{t.lang_label}</label>
        <select value={language} onChange={e => setLanguage(e.target.value as 'zh-CN' | 'en-US')}
          style={{ width: '100%', padding: '6px 10px', background:'var(--bg-tertiary)', color:'var(--text-primary)', border:'1px solid var(--border-color)', borderRadius:4, fontSize:13 }}>
          <option value="zh-CN">{t.lang_zh}</option>
          <option value="en-US">{t.lang_en}</option>
        </select>
      </div>
    </div>
  )
}

export default LanguageSettings
