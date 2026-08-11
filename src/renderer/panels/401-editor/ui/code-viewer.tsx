import React, { useEffect, useState } from 'react'
import Editor, { loader, type Monaco } from '@monaco-editor/react'
import { useT } from '@renderer/hooks/use-translation'

/** 文件扩展名 → Monaco language */
const extToLang: Record<string, string> = {
  tsx: 'typescript', ts: 'typescript',
  jsx: 'javascript', js: 'javascript',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', json: 'json', md: 'markdown',
  xml: 'xml', yml: 'yaml', yaml: 'yaml',
  py: 'python', go: 'go', rs: 'rust',
  prisma: 'prisma',
  svg: 'xml',
}

interface CodeViewerProps {
  code: string
  filePath?: string
  onChange?: (value: string) => void
}

/** Monaco Editor 代码编辑器 */
const CodeViewer: React.FC<CodeViewerProps> = ({ code, filePath, onChange }) => {
  const t = useT()
  const ext = (filePath ?? '').split('.').pop()?.toLowerCase() ?? 'ts'
  const language = extToLang[ext] ?? 'plaintext'
  const [themeReady, setThemeReady] = useState(false)

  // Monaco 加载后定义 goleynx-dark 主题（背景 #252536 跟 Workspace 一致）
  useEffect(() => {
    let mounted = true
    loader.init().then((monaco) => {
      if (!mounted) return
      monaco.editor.defineTheme('goleynx-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: { 'editor.background': '#252536' },
      })
      setThemeReady(true)
    }).catch(() => {
      // CDN 加载失败也允许渲染
      if (mounted) setThemeReady(true)
    })
    return () => { mounted = false }
  }, [])

  return (
    <Editor
      height="100%"
      language={language}
      value={code}
      onChange={(val) => onChange?.(val ?? '')}
      theme={themeReady ? 'goleynx-dark' : 'vs-dark'}
      options={{
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        fontSize: 13,
        fontFamily: 'var(--font-mono), Consolas, monospace',
        padding: { top: 8 },
        renderWhitespace: 'selection',
        folding: true,
        automaticLayout: true,
      }}
      loading={
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
          {t.ws_editor_loading}
        </div>
      }
    />
  )
}

export default CodeViewer
