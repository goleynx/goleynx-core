import React, { useState } from 'react'
import { useAppStore } from '@stores/app-store'
import { useEditorStore } from '@stores/editor-store'
import { useT } from '@renderer/hooks/use-translation'
import ChatPanel from '@panels/101-chat/ui/chat-panel'
import EditorPanel from '@panels/401-editor/ui/editor-panel'
import FileTreePanel from '@panels/401-editor/ui/file-tree-panel'
import SchedulerPanel from '@panels/201-scheduler/ui/scheduler-panel'
import ReviewerPanel from '@panels/301-reviewer/ui/reviewer-panel'
import TaskHistoryPanel from '@panels/101-chat/ui/task-history-panel'
import BlueprintMenuPanel from '@panels/101-chat/ui/blueprint-menu-panel'
import BlueprintViewerPanel from '@panels/101-chat/ui/blueprint-viewer-panel'
import AgentTerminalPanel from '@panels/101-chat/ui/agent-terminal-panel'
import SettingsMenu from '@renderer/shell/settings/settings-menu'
import SettingsContent from '@renderer/shell/settings/settings-content'
import SystemLogPanel from '@renderer/shell/system-log/system-log-panel'

const LEFT_COLLAPSED_WIDTH = 34

const Workspace: React.FC = () => {
  const t = useT()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  // 左栏内 301/201 高度比例（301 占上方），单位百分比，初始 40:60
  const [splitRatio, setSplitRatio] = useState(40)
  // 401 文件树是否弹出到 101 空间
  const [fileTreePoppedOut, setFileTreePoppedOut] = useState(false)
  const { isHistoryOpen, isBlueprintOpen, isSettingsOpen, activeSettingsTab, isSystemLogOpen, activeChatAgentId, executionAgents } = useAppStore()
  const { currentFilePath, setFilePath, setCode } = useEditorStore()

  /** 弹出状态下点击文件】读 workspace 内容 */
  const handleFileClickPoppedOut = async (path: string) => {
    setFilePath(path)
    try {
      const content = await (window as any).electronAPI?.file?.readWorkspace?.(path) ?? ''
      setCode(content)
    } catch { /* ignore */ }
  }

  // 拖拉条：按下时记录初始位置，移动时调整比例
  const dragRef = React.useRef<{ startY: number; startRatio: number; containerH: number } | null>(null)
  const onSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = (e.currentTarget as HTMLElement).parentElement
    if (!container) return
    dragRef.current = {
      startY: e.clientY,
      startRatio: splitRatio,
      containerH: container.getBoundingClientRect().height,
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dy = ev.clientY - dragRef.current.startY
      const deltaPct = (dy / dragRef.current.containerH) * 100
      const next = Math.min(85, Math.max(15, dragRef.current.startRatio + deltaPct))
      setSplitRatio(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const gridCols = (isHistoryOpen || isBlueprintOpen || isSettingsOpen)
    ? '20% 40% 40%'
    : leftCollapsed
      ? `${LEFT_COLLAPSED_WIDTH}px calc((100% - ${LEFT_COLLAPSED_WIDTH}px) * 0.4) calc((100% - ${LEFT_COLLAPSED_WIDTH}px) * 0.6)`
      : '20% 40% 40%'

  const renderLeftColumn = () => {
    if (isSettingsOpen) return <SettingsMenu />
    if (isBlueprintOpen) return <BlueprintMenuPanel />
    if (isHistoryOpen) return <TaskHistoryPanel />
    if (leftCollapsed) {
      return (
        <div onClick={() => setLeftCollapsed(false)} title="展开面板" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--panel-header)', borderRight: '1px solid var(--border-color)',
          cursor: 'pointer', userSelect: 'none',
        }}>
          <span style={{ writingMode: 'vertical-rl', letterSpacing: 3, fontSize: 11, color: 'var(--text-secondary)' }}>
            {t.ws_review_schedule}
          </span>
        </div>
      )
    }
    return (
      <>
        <div style={{ height: `${splitRatio}%`, minHeight: 0 }}><ReviewerPanel /></div>
        {/* 201/301 分隔条 — 上下拖动调整两栏高度 */}
        <div
          onMouseDown={onSplitterMouseDown}
          title="上下拖动调整 201/301 高度比例"
          style={{
            height: 6, flexShrink: 0, cursor: 'row-resize',
            background: 'var(--border-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          <div style={{
            width: 30, height: 2, borderRadius: 1,
            background: 'var(--text-tertiary)', opacity: 0.5,
          }} />
        </div>
        <div style={{ height: `${100 - splitRatio}%`, minHeight: 0 }}><SchedulerPanel /></div>
        <div onClick={() => setLeftCollapsed(true)} title="收起" style={{
          height: 24, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--panel-header)', borderTop: '1px solid var(--border-color)',
          cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)',
        }}>{t.ws_collapse}</div>
      </>
    )
  }

  const renderCenterColumn = () => {
    if (isSettingsOpen && activeSettingsTab) return <SettingsContent />
    if (isBlueprintOpen) return <BlueprintViewerPanel />
    if (fileTreePoppedOut) return <FileTreePanel poppedOut={true} onPopOut={() => setFileTreePoppedOut(false)} onFileClick={handleFileClickPoppedOut} selectedPath={currentFilePath} />
    if (activeChatAgentId !== 'a') return <AgentTerminalPanel />
    return <ChatPanel />
  }

  return (
    <div style={{ position: 'relative', height: '100%', background: 'var(--border-color)' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gridTemplateRows: '1fr',
        height: '100%',
        transition: 'grid-template-columns 0.28s ease',
        gap: 1,
      }}>
        {/* 第一列 */}
        <div style={{ gridRow: '1 / 2', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, overflow: 'hidden' }}>
          {renderLeftColumn()}
        </div>

        {/* 第二列：对话 / 蓝图 / 终端 / 设置 */}
        <div style={{ gridRow: '1 / 2', minWidth: 0, height: '100%', overflow: 'hidden' }}>
          {renderCenterColumn()}
        </div>

        {/* 第三列：执行体 / 系统日志 */}
        <div style={{
          gridRow: '1 / 2', display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          height: '100%', gap: 1,
        }}>
          {isSystemLogOpen ? (
            <div style={{ flex: 1, height: '100%', minWidth: 0 }}>
              <SystemLogPanel />
            </div>
          ) : (
            executionAgents.map((agent, idx) => (
              <div
                key={agent.id}
                style={{
                  minWidth: executionAgents.length >= 2 ? 600 : 0,
                  flexShrink: executionAgents.length >= 2 ? 0 : undefined,
                  flex: executionAgents.length === 1 ? 1 : undefined,
                  height: '100%',
                }}
              >
                <EditorPanel
                  title={`执行体 ${agent.letter}`}
                  executorIndex={idx}
                  fileTreePoppedOut={fileTreePoppedOut}
                  onFileTreePopOut={() => setFileTreePoppedOut(!fileTreePoppedOut)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Workspace
