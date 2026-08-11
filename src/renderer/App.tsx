import React, { useEffect } from 'react'
import Titlebar from './shell/titlebar/titlebar'
import Statusbar from './shell/statusbar/statusbar'
import Workspace from './layout/workspace'
import { setupAgentBroadcastListeners } from './core/agent-listeners'
import { setupWindowAgents, reloadWindowAgents } from './core/window-agent'
import { setupRoundManager } from './system-runner/logic/round-manager'
import { setupRoundControlLogic } from './system-runner/logic/round-control-logic'
import { setupExecutorDriver } from './system-runner/logic/executor-driver'
import { useAppStore } from '@stores/app-store'

const App: React.FC = () => {
  useEffect(() => {
    setupAgentBroadcastListeners()
    setupWindowAgents()
    setupRoundManager()
    setupRoundControlLogic()
    setupExecutorDriver()
    // 启动时加载真实项目列表，替换假数据
    ;(async () => {
      const list = await (window as any).electronAPI?.project?.list?.()
      if (Array.isArray(list) && list.length) {
        useAppStore.getState().loadTasks(list)
      }
    })()
  }, [])

  // 项目切换时重载窗口代理（切换后 engines/ 变了）
  const activeTaskId = useAppStore(s => s.activeTaskId)
  useEffect(() => {
    if (activeTaskId) reloadWindowAgents()
  }, [activeTaskId])

  return (
    <div className="app-root" style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
    }}>
      <Titlebar />
      <div style={{ flex: 1, overflow: 'hidden' }}><Workspace /></div>
      <Statusbar />
    </div>
  )
}

export default App
