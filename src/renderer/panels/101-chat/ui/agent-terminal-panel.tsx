import React, { useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useT } from '@renderer/hooks/use-translation'
import { useAppStore, type BlueprintDocId } from '@stores/app-store'
import { useEditorStore } from '@stores/editor-store'
import { useSendMessage } from '@renderer/hooks/use-send-message'
import { useSyslogStore } from '@stores/syslog-store'
import { bus } from '@shared/bus'
import ModelSelector from '@renderer/components/model-selector/model-selector'

// 各窗口监听的文件更新广播 → 自动读取并注入上下文（新协议：正则匹配 {窗口}{轮次}-d{文件编号}）
const BROADCAST_FILES: Record<string, Array<{ pattern: RegExp; docId: string; label: string }>> = {
  'b': [
    { pattern: /^[BC]\d{4}-d01$/, docId: 'goals',          label: 'core/goals.md' },
    { pattern: /^[BC]\d{4}-d02$/, docId: 'requirements',    label: 'core/requirements.md' },
    { pattern: /^[BC]\d{4}-d03$/, docId: 'architecture',    label: 'core/architecture.md' },
    { pattern: /^[BC]\d{4}-d05$/, docId: 'steps',           label: 'core/steps.md' },
  ],
  'c': [
    { pattern: /^[BC]\d{4}-d01$/, docId: 'goals',          label: 'core/goals.md' },
    { pattern: /^[BC]\d{4}-d04$/, docId: 'review-rules',    label: 'core/review-rules.md' },
    { pattern: /^[BC]\d{4}-d03$/, docId: 'architecture',    label: 'core/architecture.md' },
  ],
}

// 终端顶部 D 编号快捷按钮（按当前 UI 顺序的 D 编号，跟蓝图菜单一致）
const DOC_BUTTONS: Record<string, Array<{ docId: BlueprintDocId; label: string; code: string }>> = {
  'b': [
    { docId: 'goals', label: '目标', code: 'D01' },
    { docId: 'steps', label: '步骤', code: 'D05' },
    { docId: 'summary', label: '总结', code: 'D06' },
  ],
  'c': [
    { docId: 'requirements', label: '清单', code: 'D02' },
    { docId: 'architecture', label: '结构', code: 'D03' },
    { docId: 'review-rules', label: '规则', code: 'D04' },
  ],
}

// 根据读取的蓝图文件构建系统提示词前缀
function buildContextPrefix(agentId: string, contexts: Record<string, string>): string {
  const entries = Object.entries(contexts).filter(([,v]) => v)
  if (!entries.length) return ''
  const lines = entries.map(([k, v]) => `[${k}]\n${v}`)
  return lines.join('\n\n---\n\n')
}

const SYSTEM_PROMPTS: Record<string, string> = {
  'b': '你是 Goleynx 的中枢调度 Agent。你负责把用户需求拆解成任务，并下发给执行体。用中文简短回答。',
  'c': '你是 Goleynx 的审查纠偏 Agent。你负责审查代码和架构合规性，必要时拦截并给出修改建议。用中文简短回答。',
  'd': '你是 Goleynx 的执行逻辑 Agent。你负责根据任务生成代码或执行机器指令。用中文简短回答，代码用 TypeScript。',
}

const AgentTerminalPanel: React.FC = () => {
  const t = useT()
  const [input, setInput] = useState('')
  const [localLogs, setLocalLogs] = useState<Record<string, Array<{ id: string; text: string; role?: 'system' | 'user' | 'agent' }>>>({})
  const [modelId, setModelId] = useState('')
  const [contextFiles, setContextFiles] = useState<Record<string, string>>({})
  const [viewingDoc, setViewingDoc] = useState<BlueprintDocId | null>(null)
  const [docContent, setDocContent] = useState('')
  const { activeChatAgentId, switchChatAgent } = useAppStore()
  const currentRound = useAppStore(s => s.currentRound)
  // 终端保存码前缀：201→B{轮次}，301→C{轮次}，401→D{轮次}
  const roundPrefix = activeChatAgentId === 'b'
    ? `B${String(currentRound).padStart(4, '0')}`
    : activeChatAgentId === 'c'
    ? `C${String(currentRound).padStart(4, '0')}`
    : activeChatAgentId === 'd'
    ? `D${String(currentRound).padStart(4, '0')}`
    : undefined

  const agentInfo = useMemo(() => ({
    'b': { title: t.terminal_201 },
    'c': { title: t.terminal_301 },
    'd': { title: t.terminal_401 },
  }), [t.terminal_201, t.terminal_301, t.terminal_401])
  const info = agentInfo[activeChatAgentId] ?? { title: t.terminal_unknown }
  const logs = localLogs[activeChatAgentId] ?? []
  const docButtons = DOC_BUTTONS[activeChatAgentId] ?? []

  // 切换 agentId 时重置蓝图查看状态
  useEffect(() => {
    setViewingDoc(null)
    setDocContent('')
  }, [activeChatAgentId])

  /** 点击 D 编号按钮：再点一次或点返回 → 恢复终端 */
  const handleDocClick = async (docId: BlueprintDocId) => {
    if (viewingDoc === docId) {
      setViewingDoc(null)
      setDocContent('')
      return
    }
    const text = await (window as any).electronAPI?.readBlueprint?.(docId)
    setDocContent(text ?? '')
    setViewingDoc(docId)
  }

  const handleBackToTerminal = () => {
    setViewingDoc(null)
    setDocContent('')
  }

  // 监听文件更新广播 → 自动读取并注入上下文
  useEffect(() => {
    const files = BROADCAST_FILES[activeChatAgentId]
    if (!files?.length) return

    const handler = async (event: any) => {
      const matched = files.find(f => f.pattern.test(event.eventType))
      if (!matched) return
      try {
        const raw = await (window as any).electronAPI?.readBlueprint?.(matched.docId)
        if (raw) {
          setContextFiles(prev => ({ ...prev, [matched.docId]: raw }))
          useSyslogStore.getState().addLog({
            timestamp: Date.now(), category: '阅读',
            sourceName: activeChatAgentId === 'b' ? '中枢窗' : '审查窗',
            message: `[${activeChatAgentId === 'b' ? '中枢窗' : '审查窗'}] 阅读 ${matched.label} (${raw.length} 字符)`,
          })
        }
      } catch {}
    }
    bus.on('agent:broadcast', handler)
    return () => { bus.off?.('agent:broadcast', handler) }
    // eslint-disable-next-line
  }, [activeChatAgentId])

  // 构建含上下文注入的 system prompt
  const systemPrompt = useMemo(() => {
    const prefix = buildContextPrefix(activeChatAgentId, contextFiles)
    const base = SYSTEM_PROMPTS[activeChatAgentId] ?? ''
    return prefix ? `${prefix}\n\n---\n${base}` : base
  }, [activeChatAgentId, contextFiles])

  // 挂载时从 storage 加载真实历史日志
  useEffect(() => {
    (async () => {
      const agentId = activeChatAgentId === 'd' ? 'd' : activeChatAgentId
      const data = await (window as any).electronAPI?.storage?.get(agentId)
      if (!Array.isArray(data) || !data.length) return
      const entries = data.map((r: any) => ({
        id: (Date.now() + Math.random()).toString(36),
        text: r.role === 'model'
          ? `[${agentId === 'b' ? '提炼' : agentId === 'c' ? '审查' : '执行'}] ${r.content.replace(/^\[提炼\]\s*/, '')}`
          : r.content ?? '',
        role: r.role === 'user' ? 'user' : r.role === 'model' ? 'system' : undefined,
      }))
      setLocalLogs(prev => ({ ...prev, [activeChatAgentId]: entries }))
    })()
  }, [activeChatAgentId])

  // 计算存储用的 agentId：b/c/d 直通
  const storageAgentId = activeChatAgentId === 'd' ? 'd' : activeChatAgentId

  const { send, loading } = useSendMessage(modelId, { systemPrompt, agentId: storageAgentId, roundPrefix })
  const { setCode, setFilePath } = useEditorStore()

  /** 提取 Markdown 代码块内容 */
  const extractCodeBlock = (text: string): string => {
    const match = text.match(/```[\w]*\n?([\s\S]*?)```/)
    return match ? match[1].trim() : text.trim()
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    // 先显示用户干预消息
    setLocalLogs(prev => ({
      ...prev,
      [activeChatAgentId]: [
        ...(prev[activeChatAgentId] ?? []),
        { id: Date.now().toString(), text: `[干预] ${text}`, role: 'user' },
      ],
    }))
    setInput('')

    // 调用 AI
    try {
      let reply = ''
      if (activeChatAgentId === 'd') {
        setLocalLogs(prev => ({
          ...prev,
          [activeChatAgentId]: [
            ...(prev[activeChatAgentId] ?? []),
            { id: Date.now().toString(), text: '[生成] 正在生成代码...', role: 'system' },
          ],
        }))
      }

      await send(text, (chunk) => {
        reply += chunk
      })

      if (activeChatAgentId === 'd') {
        // 401：代码只在右侧编辑器展示，终端只保留状态轨迹
        const code = extractCodeBlock(reply)
        const filename = 'executor-d.ts'
        const now = Date.now()

        // 1. 同步到编辑器
        if (code) setCode(code)

        // 2. 写入本地文件
        const res = await (window as any).electronAPI?.file?.write(filename, code || reply)
        if (res?.success) {
          setFilePath(res.path || filename)
          setLocalLogs(prev => ({
            ...prev,
            [activeChatAgentId]: [
              ...(prev[activeChatAgentId] ?? []),
              { id: (Date.now() + 1).toString(), text: `[生成] 代码生成完成`, role: 'system' },
              { id: (Date.now() + 2).toString(), text: `[写入] 文件已落盘：${filename}`, role: 'system' },
            ],
          }))

          // 3. 发送广播（系统日志监听，不进终端）
          bus.emit('401_BROADCAST', {
            role: '执行窗 1',
            action: '文件已更新',
            filePath: res.path || filename,
            timestamp: now,
          })
        } else {
          setLocalLogs(prev => ({
            ...prev,
            [activeChatAgentId]: [
              ...(prev[activeChatAgentId] ?? []),
              { id: (Date.now() + 1).toString(), text: '[错误] 文件写入失败', role: 'system' },
            ],
          }))
        }
      } else {
        // 201/301：保持原有行为，把 AI 回复直接展示在终端
        setLocalLogs(prev => ({
          ...prev,
          [activeChatAgentId]: [
            ...(prev[activeChatAgentId] ?? []),
            { id: (Date.now() + 1).toString(), text: reply, role: 'agent' },
          ],
        }))
      }
    } catch (e: any) {
      setLocalLogs(prev => ({
        ...prev,
        [activeChatAgentId]: [
          ...(prev[activeChatAgentId] ?? []),
          { id: (Date.now() + 1).toString(), text: `[错误] ${e.message ?? 'AI 调用失败'}`, role: 'system' },
        ],
      }))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="panel" style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--bg-primary)',
      borderTop: '2px solid var(--accent-green)',
    }}>
      {/* Header — 三段式：左(底层专家模式) 中(控制台名) 右(返回主界面) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', width: '100%',
        padding: '8px 12px', flexShrink: 0,
        background: 'var(--panel-header)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        {/* 左：底层专家模式 + 模型选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--accent-green)', fontWeight: 700 }}>
            {t.terminal_expert_mode}
          </span>
          <ModelSelector value={modelId} onChange={setModelId} />
        </div>

        {/* 中：绝对居中控制台名称 */}
        <span style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
        }}>
          {info.title}
        </span>

        {/* 右：D 编号快捷按钮 + 返回主界面 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {docButtons.map((btn) => (
            <button
              key={btn.docId}
              onClick={() => handleDocClick(btn.docId)}
              title={`${btn.label}（${btn.code}）`}
              style={{
                background: viewingDoc === btn.docId ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                color: viewingDoc === btn.docId ? '#fff' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2,
              }}
            >
              <span style={{ fontSize: 11 }}>{btn.label}</span>
              <span style={{ fontSize: 8, fontFamily: 'monospace', opacity: 0.8 }}>{btn.code}</span>
            </button>
          ))}
          <button
            onClick={() => switchChatAgent('a')}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-secondary)', fontSize: 11,
              cursor: 'pointer', padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {t.terminal_back}
          </button>
        </div>
      </div>

      {/* 内容区：查看蓝图 或 终端日志 */}
      {viewingDoc ? (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '6px 12px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
            background: 'var(--panel-header)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {docButtons.find(b => b.docId === viewingDoc)?.label}（{docButtons.find(b => b.docId === viewingDoc)?.code}）
            </span>
            <button
              onClick={handleBackToTerminal}
              style={{
                background: 'none', border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)', fontSize: 10,
                cursor: 'pointer', padding: '2px 10px',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              ← 返回终端
            </button>
          </div>
          <div
            className="prose prose-sm prose-invert max-w-none"
            style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {docContent || t.blueprint_loading}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0, padding: 12,
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2,
        }}>
          {logs.map((l) => (
            <div key={l.id} style={{
              color: l.role === 'user' ? 'var(--accent-blue)'
                   : l.role === 'agent' ? 'var(--accent-green)'
                   : l.text.includes('⚠') || l.text.includes('拦截') || l.text.includes('[错误]') ? 'var(--accent-red)'
                   : l.text.includes('✅') || l.text.includes('通过') ? 'var(--accent-green)'
                   : 'var(--text-secondary)',
              marginBottom: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {/* 底部输入区 */}
      <div style={{ borderTop: '1px solid var(--border-color)', padding: 8, flexShrink: 0, position: 'relative' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.terminal_placeholder}
          rows={2}
          disabled={loading}
          style={{
            width: '100%', resize: 'none',
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
            padding: '8px 52px 8px 12px', fontSize: 12,
            fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            position: 'absolute', right: 16, bottom: 16,
            padding: '4px 10px', fontSize: 11,
            background: (loading || !input.trim()) ? 'var(--bg-hover)' : 'var(--accent-green)',
            color: (loading || !input.trim()) ? 'var(--text-tertiary)' : '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? t.editor_generating : t.terminal_send}
        </button>
      </div>
    </div>
  )
}

export default AgentTerminalPanel
