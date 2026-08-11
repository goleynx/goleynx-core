import React, { useState, useEffect, useRef } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import ModelSelector from '@renderer/components/model-selector/model-selector'
import { useAppStore } from '@stores/app-store'
import { useEditorStore } from '@stores/editor-store'
import FileTreePanel from './file-tree-panel'
import CodeViewer from './code-viewer'

interface EditorPanelProps {
  title: string
  executorIndex: number
  /** 文件树是否已弹出到 101 空间（由 workspace 控制） */
  fileTreePoppedOut?: boolean
  /** 切换文件树弹出的回调（由 workspace 提供） */
  onFileTreePopOut?: () => void
}

const EditorPanel: React.FC<EditorPanelProps> = ({ title, executorIndex, fileTreePoppedOut = false, onFileTreePopOut = () => {} }) => {
  const t = useT()
  const { activeChatAgentId, switchChatAgent } = useAppStore()
  const active = activeChatAgentId === 'd'
  const toggle = () => switchChatAgent(active ? 'a' : 'd')

  const { currentCode, currentFilePath, setCode, setFilePath } = useEditorStore()
  const [localCode, setLocalCode] = useState('')

  /** 点击文件树中的文件 → 读 workspace 内容并显示到代码区 */
  const handleFileClick = async (path: string) => {
    setFilePath(path)
    try {
      const api = (window as any).electronAPI
      const content = await api?.file?.readWorkspace?.(path) ?? ''
      setLocalCode(content)
      setCode(content)
    } catch {
      // ignore
    }
  }
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 401 内部分割比例（文件树 25% / 代码 75%）
  const [splitRatio, setSplitRatio] = useState(25)
  const dragRef = useRef<{ startX: number; startRatio: number; containerW: number } | null>(null)
  const onSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = (e.currentTarget as HTMLElement).parentElement
    if (!container) return
    dragRef.current = {
      startX: e.clientX,
      startRatio: splitRatio,
      containerW: container.getBoundingClientRect().width,
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const deltaPct = (dx / dragRef.current.containerW) * 100
      const next = Math.min(60, Math.max(10, dragRef.current.startRatio + deltaPct))
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

  // Sync store → local display
  useEffect(() => {
    setLocalCode(currentCode)
  }, [currentCode])

  /** 写入本地文件（防抖 800ms） */
  const saveToFile = (code: string, filePath?: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const agentId = `401-${executorIndex + 1}`
      const filename = filePath || `executor-${agentId.replace('-', '-0')}.ts`
      await (window as any).electronAPI?.file?.write(filename, code)
    }, 800)
  }

  const handleCodeChange = (value: string) => {
    setLocalCode(value)
    setCode(value)
    if (currentFilePath) {
      saveToFile(value, currentFilePath.replace(/^\//, ''))
    }
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header — 显式 20px 高度，跟 101/201/301 panel-header 对齐
          绿条用独立 absolute div，强制 top:0/bottom:0 撑满整个 header 高度 */}
      <div className="panel-header" style={{
        position: 'relative',
        flexShrink: 0,
        minHeight: 20,
        boxSizing: 'border-box',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--accent-green)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{title}</span>
          <button onClick={toggle} title={active ? '关闭' : '终端'} style={{
            background: active ? 'rgba(34,197,94,0.12)' : 'var(--bg-hover)',
            color: active ? 'var(--accent-green)' : 'var(--text-secondary)',
            border: 'none', borderRadius: 3, padding: '1px 6px', fontSize: 10,
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: active ? 600 : 400,
          }}>&gt;_</button>
        </div>
        <ModelSelector value="" onChange={(id) => { /* 编辑器窗口模型选择（预留） */ void id }} />
      </div>

      {/* 主体：左侧文件树(25%) + 右侧代码(75%) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧：文件树结构空间 — 弹出到 101 时不显示 */}
        {!fileTreePoppedOut && (
          <div style={{
            width: `${splitRatio}%`,
            flexShrink: 0, minWidth: 0,
            display: 'flex', flexDirection: 'column',
            transition: 'width 0.2s ease',
          }}>
            <FileTreePanel poppedOut={false} onPopOut={onFileTreePopOut} onFileClick={handleFileClick} selectedPath={currentFilePath} />
          </div>
        )}

        {/* 拖拽分隔线 */}
        {!fileTreePoppedOut && (
          <div
            onMouseDown={onSplitterMouseDown}
            title="左右拖动调整结构/代码比例"
            style={{
              width: 4, flexShrink: 0, cursor: 'col-resize',
              background: 'var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: 2, height: 30, borderRadius: 1,
              background: 'var(--text-tertiary)', opacity: 0.5,
            }} />
          </div>
        )}

        {/* 右侧：代码展示空间 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, background: 'var(--panel-bg)' }}>
            <CodeViewer code={localCode} filePath={currentFilePath} onChange={handleCodeChange} />
          </div>
          {/* 底部 24px — 跟 FileTreePanel 底部弹出按钮同背景色 var(--bg-primary) */}
          <div style={{
            height: 24, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-primary)',
            borderTop: '1px solid var(--border-color)',
            fontSize: 12, color: 'var(--text-tertiary)',
            userSelect: 'none',
          }}>
            {t.ws_code_area}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EditorPanel
