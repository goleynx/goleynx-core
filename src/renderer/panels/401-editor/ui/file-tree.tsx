import React, { useState, useEffect } from 'react'
import { useT } from '@renderer/hooks/use-translation'

interface FileNode {
  name: string
  type: 'folder' | 'file'
  children?: FileNode[]
}

interface FileTreeProps {
  onFileClick?: (path: string) => void
  selectedPath?: string
}

/** 单文件行 */
const FileRow: React.FC<{
  name: string
  depth: number
  isSelected: boolean
  onClick: () => void
}> = ({ name, depth, isSelected, onClick }) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const icon = extensions[ext] ?? '📄'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: `2px 8px 2px ${12 + depth * 14}px`,
        cursor: 'pointer', fontSize: 12,
        background: isSelected ? 'var(--bg-hover)' : 'transparent',
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        userSelect: 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      <span style={{ fontSize: 11, flexShrink: 0 }}>{icon}</span>
      <span>{name}</span>
    </div>
  )
}

/** 单文件夹行 */
const FolderRow: React.FC<{
  name: string
  depth: number
  collapsed: boolean
  onClick: () => void
}> = ({ name, depth, collapsed, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: `2px 8px 2px ${8 + depth * 14}px`,
      cursor: 'pointer', fontSize: 12,
      color: 'var(--text-secondary)',
      userSelect: 'none',
    }}
  >
    <span style={{ fontSize: 10, width: 12, flexShrink: 0 }}>{collapsed ? '▶' : '▼'}</span>
    <span>{collapsed ? '📁' : '📂'} {name}</span>
  </div>
)

/** 递归树节点 */
const TreeNode: React.FC<{
  node: FileNode
  depth: number
  path: string
  selectedPath: string
  onFileClick: (path: string) => void
}> = ({ node, depth, path, selectedPath, onFileClick }) => {
  const currentPath = `${path}/${node.name}`
  const [collapsed, setCollapsed] = useState(false)

  if (node.type === 'file') {
    return (
      <FileRow
        name={node.name}
        depth={depth}
        isSelected={selectedPath === currentPath}
        onClick={() => onFileClick(currentPath)}
      />
    )
  }

  return (
    <>
      <FolderRow
        name={node.name}
        depth={depth}
        collapsed={collapsed}
        onClick={() => setCollapsed(!collapsed)}
      />
      {!collapsed && node.children?.map(child => (
        <TreeNode
          key={child.name}
          node={child}
          depth={depth + 1}
          path={currentPath}
          selectedPath={selectedPath}
          onFileClick={onFileClick}
        />
      ))}
    </>
  )
}

/** 文件扩展名 → 图标 */
const extensions: Record<string, string> = {
  tsx: '📘', ts: '📘', jsx: '📒', js: '📒',
  css: '🎨', json: '📋', md: '📝', html: '🌐', svg: '🖼',
  png: '🖼', jpg: '🖼', webp: '🖼', ico: '🖼',
  woff2: '🔤', ttf: '🔤',
  gitkeep: '📄',
  prisma: '🗄', env: '⚙', yml: '⚙', yaml: '⚙',
}

/** Workspace 文件树 */
const FileTree: React.FC<FileTreeProps> = ({ onFileClick, selectedPath }) => {
  const t = useT()
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const api = (window as any).electronAPI
      const files = await api?.file?.listWorkspace() ?? []
      setTree(files)
    } catch {
      setTree([])
    } finally {
      setLoading(false)
    }
  }

  // 首次加载 + 每 500ms 轮询自动刷新
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 500)
    return () => clearInterval(interval)
  }, [])

  // 暴露刷新方法给父组件
  useEffect(() => {
    (FileTree as any)._refresh = refresh
    return () => { (FileTree as any)._refresh = undefined }
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        {t.ws_loading}
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        {t.ws_empty_files}
      </div>
    )
  }

  return (
    <>
      {tree.map(node => (
        <TreeNode
          key={node.name}
          node={node}
          depth={0}
          path=""
          selectedPath={selectedPath ?? ''}
          onFileClick={onFileClick ?? (() => {})}
        />
      ))}
    </>
  )
}

export default FileTree
