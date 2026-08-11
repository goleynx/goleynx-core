import React, { useState, useRef, useEffect } from 'react'
import { useT } from '@renderer/hooks/use-translation'
import ModelSelector from '@renderer/components/model-selector/model-selector'
import ChatEntry from '@renderer/components/chat-entry/chat-entry'
import MessageBubble from '@renderer/components/chat-entry/message-bubble'
import { useSendMessage } from '@renderer/hooks/use-send-message'
import { useSyslogStore } from '@stores/syslog-store'
import { useAppStore } from '@stores/app-store'
import { bus } from '@shared/bus'
import RoundControlBar from '@renderer/system-runner/ui/round-control-bar'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const ChatPanel: React.FC = () => {
  const t = useT()
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [goalsContext, setGoalsContext] = useState('')
  const currentRound = useAppStore(s => s.currentRound)
  const bottomRef = useRef<HTMLDivElement>(null)

  /** 收到 G000 → 读 goals.md 注入到后续回复 */
  useEffect(() => {
    const handler = async (event: any) => {
      if (!/^[BC]\d{4}-d01$/.test(event.eventType)) return
      try {
        const raw = await (window as any).electronAPI?.readBlueprint?.('goals')
        if (raw) {
          setGoalsContext(raw)
          useSyslogStore.getState().addLog({
            timestamp: Date.now(), category: '阅读',
            sourceName: '对话窗', message: `[对话窗] 阅读 core/goals.md (${raw.length} 字符)`,
          })
        }
      } catch {}
    }
    bus.on('agent:broadcast', handler)
    return () => { bus.off?.('agent:broadcast', handler) }
    // eslint-disable-next-line
  }, [])

  const systemPrompt = goalsContext
    ? `[当前项目目标]\n${goalsContext}\n\n---\n你是一个专业的全栈软件工程师。请基于以上目标回答用户问题。用中文简洁回答，代码用 TypeScript。`
    : '你是一个专业的全栈软件工程师，擅长 React、TypeScript、Node.js。用中文简洁回答，代码用 TypeScript。'

  const roundPrefix = `A${String(currentRound).padStart(4, '0')}`

  const { send, loading, error } = useSendMessage(model, {
    systemPrompt,
    agentId: 'A',
    roundPrefix,
  })

  /** 自动滚到底部 */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /** 启动时加载历史对话 */
  useEffect(() => {
    (async () => {
      const raw = await (window as any).electronAPI?.storage?.get('a')
      if (!Array.isArray(raw) || !raw.length) return
      const loaded: Message[] = raw.map((r: any) => ({
        id: (Date.now() + Math.random()).toString(36),
        role: r.role === 'model' ? 'assistant' : 'user',
        content: r.content ?? '',
        timestamp: new Date(r.timestamp).getTime(),
      }))
      setMessages(loaded)
    })()
  }, [])

  /** 生成唯一 ID */
  const mid = () => (Date.now() + Math.random()).toString(36)

  const handleSend = async (text: string) => {
    // 添加用户消息
    const userMsg: Message = { id: mid(), role: 'user', content: text, timestamp: Date.now() }
    // 添加 AI 占位消息（流式填充）
    const aiMsg: Message = { id: mid(), role: 'assistant', content: '', timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg, aiMsg])

    try {
      await send(text, (chunk) => {
        // 流式增量更新 AI 消息
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id ? { ...m, content: m.content + chunk } : m,
          ),
        )
      })
      // AI 回复完成 —— 不再自动发 A0001 广播
      // 广播由用户点"提交"按钮手动触发（见 RoundControlBar）
    } catch {
      // 出错时在 AI 消息中显示错误
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? { ...m, content: m.content || '⚠ 调用失败: ' + (error ?? '未知错误') }
            : m,
        ),
      )
    }
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header" style={{ position: 'relative', flexShrink: 0, minHeight: 20, boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--accent-blue)' }} />
        <span>{t.panel_chat} A</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ModelSelector value={model} onChange={setModel} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginTop: 40, fontSize: 13 }}>
              {t.chat_empty}
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} timestamp={m.timestamp} />
          ))}
          <div ref={bottomRef} />
        </div>
        <ChatEntry onSend={handleSend} placeholder={t.chat_placeholder} disabled={loading} />
        <RoundControlBar />
      </div>
    </div>
  )
}

export default ChatPanel
