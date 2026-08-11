import React from 'react'
import { useAppStore } from '@stores/app-store'
import GeneralSettings from './general-settings'
import AppearanceSettings from './appearance-settings'
import LanguageSettings from './language-settings'
import ModelSettings from './model-settings'
import ApiSettings from './api-settings'
import AboutSettings from './about-settings'

const SettingsContent: React.FC = () => {
  const { activeSettingsTab } = useAppStore()

  const render = () => {
    switch (activeSettingsTab) {
      case 'general':    return <GeneralSettings />
      case 'appearance': return <AppearanceSettings />
      case 'language':   return <LanguageSettings />
      case 'model':      return <ModelSettings />
      case 'api':        return <ApiSettings />
      case 'about':      return <AboutSettings />
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {render()}
      </div>
    </div>
  )
}

export default SettingsContent
