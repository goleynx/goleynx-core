import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useT } from '@renderer/hooks/use-translation'

interface ChatEntryProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

const ChatEntry: React.FC<ChatEntryProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入开发指令...'
}) => {
  const t = useT()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; selection: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = useCallback(() => {
    const selected = menu?.selection || ''
    if (!selected) return
    try {
      navigator.clipboard.writeText(selected).catch(() => fallbackCopy(selected))
    } catch {
      fallbackCopy(selected)
    }
    setMenu(null)
  }, [menu])

  const handlePaste = useCallback(async () => {
    try {
      const txt = await navigator.clipboard.readText()
      if (txt) setText(prev => prev + txt)
    } catch {
      document.execCommand('paste')
    }
    setMenu(null)
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const selected = window.getSelection()?.toString() || ''
    setMenu({ x: e.clientX, y: e.clientY, selection: selected })
  }

  return (
    <div style={{ position: 'relative', padding: 8, borderTop: '1px solid var(--border-color)' }}>
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        style={{
          width: '100%',
          resize: 'none',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 48px 8px 12px',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          padding: '4px 12px',
          background: (disabled || !text.trim()) ? 'var(--bg-hover)' : 'var(--accent-blue)',
          color: (disabled || !text.trim()) ? 'var(--text-tertiary)' : '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: (disabled || !text.trim()) ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 500,
          transition: 'background 0.15s',
        }}
      >
        {t.chat_send}
      </button>

      {/* 自定义右键菜单：有选中=复制，无选中=粘贴 */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            zIndex: 9999,
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            minWidth: 120,
          }}
        >
          {menu.selection ? (
            <MenuItem icon="📋" label="复制" onClick={handleCopy} />
          ) : (
            <MenuItem icon="📄" label="粘贴" onClick={handlePaste} />
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)',
        cursor: 'pointer', borderRadius: 3,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon} {label}
    </div>
  )
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export default ChatEntry
