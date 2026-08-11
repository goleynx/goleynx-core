import React from 'react'
import { useAppStore, type SettingsTabId } from '@stores/app-store'
import { zhCN, enUS } from '@shared/i18n/translations'

const TABS: { id: SettingsTabId; key: keyof typeof zhCN }[] = [
  { id: 'general',    key: 'settings_general' },
  { id: 'appearance', key: 'settings_appearance' },
  { id: 'language',   key: 'settings_language' },
  { id: 'model',      key: 'settings_model' },
  { id: 'api',        key: 'settings_api' },
  { id: 'about',      key: 'settings_about' },
]

const SettingsMenu: React.FC = () => {
  const { activeSettingsTab, setSettingsTab, language, toggleSettings } = useAppStore()
  const t = language === 'zh-CN' ? zhCN : enUS

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--panel-header)' }}>
      <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
        {t.settings_title}
      </div>
      {TABS.map(tab => (
        <div key={tab.id} onClick={() => setSettingsTab(tab.id)} style={{
          padding: '8px 12px', fontSize: 12, cursor: 'pointer',
          color: activeSettingsTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
          background: activeSettingsTab === tab.id ? 'var(--bg-hover)' : 'transparent',
          borderLeft: activeSettingsTab === tab.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
        }}>
          {t[tab.key]}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div onClick={() => toggleSettings(false)} style={{
        padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border-color)', textAlign: 'center',
      }}>{t.settings_close}</div>
    </div>
  )
}

export default SettingsMenu
