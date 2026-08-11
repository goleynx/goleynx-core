import React, { useState } from 'react'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ role, content, timestamp }) => {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 降级方案
      const ta = document.createElement('textarea')
      ta.value = content
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      marginBottom: 12, gap: 8, position: 'relative',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: isUser ? 'var(--accent-blue)' : 'var(--accent-green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 11, fontWeight: 500, flexShrink: 0,
      }}>
        {isUser ? 'U' : 'AI'}
      </div>
      <div style={{ maxWidth: '80%' }}>
        <div style={{
          background: isUser ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
          color: isUser ? '#fff' : 'var(--text-primary)',
          borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
          padding: '8px 14px',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {content}
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text-tertiary)',
          marginTop: 2, textAlign: isUser ? 'right' : 'left',
          display: 'flex', alignItems: 'center', gap: 4,
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}>
          <span>
            {new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={handleCopy}
            title="复制"
            style={{
              background: 'none', border: 'none', color: copied ? 'var(--accent-green)' : 'var(--text-tertiary)',
              cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1,
              opacity: 0.6, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.6' }}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
