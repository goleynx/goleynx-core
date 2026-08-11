import React, { useState, useRef, useEffect } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import FileTree from './file-tree'
import { loadStatusMap, STATUS_ICON, STATUS_COLOR, type FileStatus } from './file-status-logic'

const COMPACT_THRESHOLD = 80

interface TreeNode {
  name: string
  type: 'folder' | 'file'
  children?: TreeNode[]
}

/** 4% 状态栏：递归渲染文件树对应的状态图标，与文件树行高对齐 */
const StatusColumn: React.FC<{
  node: TreeNode
  depth: number
  path: string
  statusMap: Record<string, FileStatus>
}> = ({ node, depth, path, statusMap }) => {
  // path 由外层以 "workspace" 起始，递归拼接不重复添加前缀
  const currentPath = `${path}/${node.name}`

  if (node.type === 'file') {
    const status: FileStatus = statusMap[currentPath] || 'empty'
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2px 4px',
        height: 22,
      }}>
        <span style={{
          color: STATUS_COLOR[status],
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
        }}>
          {STATUS_ICON[status]}
        </span>
      </div>
    )
  }

  return (
    <>
      <div style={{ height: 22 }} />
      {node.children?.map(child => (
        <StatusColumn
          key={child.name}
          node={child}
          depth={depth + 1}
          path={currentPath}
          statusMap={statusMap}
        />
      ))}
    </>
  )
}

interface FileTreePanelProps {
  /** true = 在 101 空间（弹出状态），false = 在 401 内部 */
  poppedOut: boolean
  /** 切换弹出的回调 */
  onPopOut: () => void
  /** 文件点击回调 */
  onFileClick?: (path: string) => void
  /** 当前选中文件路径 */
  selectedPath?: string
}

/** 共享文件树面板 — 401 内部和 101 空间共用 */
const FileTreePanel: React.FC<FileTreePanelProps> = ({ poppedOut, onPopOut, onFileClick, selectedPath }) => {
  const t = useT()
  const [statusOpen, setStatusOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const treeScrollRef = useRef<HTMLDivElement>(null)
  const statusScrollRef = useRef<HTMLDivElement>(null)

  // 文件状态表：{ [filePath]: FileStatus }
  const [statusMap, setStatusMap] = useState<Record<string, FileStatus>>({})

  // 每 3 秒轮询加载文件状态
  useEffect(() => {
    if (!statusOpen) return
    const load = async () => {
      const map = await loadStatusMap()
      setStatusMap(map)
    }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [statusOpen])

  // 文件树数据（用于状态栏镜像渲染）
  const [tree, setTree] = useState<TreeNode[]>([])

  // 状态栏打开时读取文件树
  useEffect(() => {
    if (!statusOpen) return
    const loadTree = async () => {
      try {
        const files = await (window as any).electronAPI?.file?.listWorkspace?.() ?? []
        setTree(Array.isArray(files) ? files : [])
      } catch { setTree([]) }
    }
    loadTree()
    const interval = setInterval(loadTree, 3000)
    return () => clearInterval(interval)
  }, [statusOpen])

  // 文件树滚动时同步状态栏滚动
  const syncScroll = () => {
    if (statusScrollRef.current && treeScrollRef.current) {
      statusScrollRef.current.scrollTop = treeScrollRef.current.scrollTop
    }
  }

  // 监听底部条宽度，< 80px 时切紧凑模式
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setCompact(el.clientWidth < COMPACT_THRESHOLD)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 弹出到 101 时顶部黑色占位 — 跟 401 "执行体" panel-header 对齐 */}
      {poppedOut && (
        <div className="panel-header" style={{ flexShrink: 0 }}>
          <span style={{ visibility: 'hidden', fontSize: 'inherit' }}>.</span>
          <select style={{ visibility: 'hidden', padding: '4px 8px', fontSize: 12, border: '1px solid transparent', pointerEvents: 'none', background: 'transparent' }}>
          </select>
        </div>
      )}

      {/* 主体：96% 文件树 + 4% 状态栏 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧：文件树（96% 宽，状态展开时缩小） */}
        <div ref={treeScrollRef} onScroll={syncScroll} style={{
          flex: 1, minWidth: 0,
          overflow: 'auto', padding: '4px 0',
        }}>
          <FileTree onFileClick={onFileClick} selectedPath={selectedPath} />
        </div>

        {/* 右侧：4% 状态栏 — 仅展开时显示 */}
        {statusOpen && (
          <div ref={statusScrollRef} style={{
            width: '4%', minWidth: 40, flexShrink: 0,
            background: 'var(--panel-bg)',
            borderLeft: '1px solid var(--border-color)',
            overflow: 'hidden',
            fontSize: 11, color: 'var(--text-tertiary)',
          }}>
            <div style={{ padding: '2px 0' }}>
              {tree.map(n => (
                <StatusColumn key={n.name} node={n} depth={0} path="workspace" statusMap={statusMap} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部 24px 整合排 — 弹出靠左 + workspace 居中 + 状态靠右 */}
      <div
        ref={barRef}
        style={{
        height: 24, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border-color)',
        fontSize: 12, color: 'var(--text-tertiary)',
        userSelect: 'none',
      }}>
        {/* 弹出/收回按钮 — 靠左，紧凑模式只显示符号 */}
        <div
          onClick={onPopOut}
          title={poppedOut ? t.ws_pop_back_title : t.ws_pop_title}
          style={{ cursor: 'pointer', padding: '0 8px', height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}
        >
          {compact
            ? (poppedOut ? '▸' : '◂')
            : (poppedOut ? `${t.ws_pop_back} ▸` : `${t.ws_pop_out} ◂`)
          }
        </div>
        {/* workspace 标识 — 居中，始终保留 */}
        <div style={{ flex: 1, textAlign: 'center', padding: '0 8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {t.ws_label}
        </div>
        {/* 状态 — 靠右，紧凑模式只显示符号 */}
        <div
          onClick={() => setStatusOpen(!statusOpen)}
          title={statusOpen ? t.ws_status_collapse : t.ws_status_expand}
          style={{ cursor: 'pointer', padding: '0 8px', height: '100%', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}
        >
          {compact
            ? (statusOpen ? '▸' : '◂')
            : (statusOpen ? `▸ ${t.ws_status}` : `◂ ${t.ws_status}`)
          }
        </div>
      </div>
    </div>
  )
}

export default FileTreePanel
