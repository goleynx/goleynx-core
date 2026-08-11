import React, { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useT } from '@renderer/hooks/use-translation'
import { useAppStore, type BlueprintDocId } from '@stores/app-store'

declare global {
  interface Window {
    electronAPI?: {
      readBlueprint: (docId: string) => Promise<string | null>
    }
  }
}

const DOC_NAMES: Record<BlueprintDocId, string> = {
  requirements: '需求清单.md',
  goals: '目标对齐.md',
  architecture: '架构结构树.md',
  steps: '项目开发步骤.md',
  summary: '总结汇报.md',
}

const BlueprintViewerPanel: React.FC = () => {
  const t = useT()
  const { activeBlueprintDoc, activeTaskId, taskList, blueprintRefreshCounter } = useAppStore()
  const [content, setContent] = useState<string>(t.blueprint_loading)
  const docName = DOC_NAMES[activeBlueprintDoc]
  const projectId = taskList.find((tk) => tk.id === activeTaskId)?.id ?? ''

  const loadDoc = useCallback(async (docId: BlueprintDocId) => {
    setContent(t.blueprint_loading)
    const text = await window.electronAPI?.readBlueprint(docId)
    setContent(text ?? t.blueprint_error)
  }, [t.blueprint_loading, t.blueprint_error])

  useEffect(() => {
    loadDoc(activeBlueprintDoc)
  }, [activeBlueprintDoc, blueprintRefreshCounter, loadDoc])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header" style={{ borderLeft: '3px solid var(--accent-blue)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.blueprint_current_view}：{docName}</span>
        {projectId && (
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{projectId}</span>
        )}
      </div>

      {/* Markdown 内容区 — flex-1 + overflow-y-auto 确保滚动 */}
      <div
        className="prose prose-sm prose-invert max-w-none"
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '20px 24px',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default BlueprintViewerPanel
