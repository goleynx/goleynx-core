import { useCallback, useRef, useState } from 'react'
import { useSyslogStore } from '@stores/syslog-store'
import { displayName, type LogCategory } from '@shared/bus'

function agentToSaveCategory(agentId: string): LogCategory {
  if (agentId === 'a') return '对话'
  if (agentId === 'b') return '中枢'
  if (agentId === 'c') return '审查'
  if (agentId === 'd' || agentId === 'e' || agentId === 'f') return '执行'
  return '保存'
}

function agentToWindowLogCategory(agentId: string): LogCategory {
  return agentToSaveCategory(agentId)
}

export interface SendMessageOpts {
  systemPrompt?: string
  /** 当前 Agent ID，用于自动落盘（a/b/c/d...） */
  agentId?: string
  /** 轮次前缀，如 A0001（不含 -uXX / -mXX，由 hook 内部生成） */
  roundPrefix?: string
}

export function useSendMessage(modelId: string, opts?: SendMessageOpts) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)
  // u/m 计数器（用户发言 / 模型回复分别递增）
  const uCounterRef = useRef(0)
  const mCounterRef = useRef(0)
  const lastPrefixRef = useRef<string>('')

  const send = useCallback(async (content: string, onChunk: (text: string) => void, apiKey?: string): Promise<string> => {
    const { systemPrompt, agentId, roundPrefix } = opts ?? {}
    setLoading(true); setError(null); abortRef.current = false
    const key = apiKey ?? ''
    const ts = new Date().toISOString()
    const aid = agentId ?? 'a'
    const winName = displayName(aid)
    const saveCat = agentToSaveCategory(aid)
    const winCat = agentToWindowLogCategory(aid)

    // roundPrefix 变化时（A0001→A0002）重置 u/m 计数器
    if (roundPrefix && roundPrefix !== lastPrefixRef.current) {
      lastPrefixRef.current = roundPrefix
      uCounterRef.current = 0
      mCounterRef.current = 0
    }

    // ── 第一步：用户消息全局落盘（round = A0001-u01）──
    const uCounter = ++uCounterRef.current
    const userRound = roundPrefix ? `${roundPrefix}-u${String(uCounter).padStart(2, '0')}` : undefined
    if (agentId) {
      try {
        await (window as any).electronAPI?.storage?.append(agentId, {
          round: userRound, timestamp: ts, role: 'user', content, modelId,
        })
        // 保存分类：用户消息已保存
        useSyslogStore.getState().addLog({
          timestamp: Date.now(),
          category: '保存',
          sourceName: winName,
          message: `[${winName}] 保存用户消息 round=${userRound ?? '?'}`,
        })
        // 窗口分类：用户发送消息
        useSyslogStore.getState().addLog({
          timestamp: Date.now(),
          category: winCat,
          sourceName: winName,
          message: `[${winName}] 已保存到 ${userRound ?? '?'}`,
        })
      } catch { /* 存储失败不阻塞发送 */ }
    }

    try {
      // API 分类 + 对话/中枢/审查/执行 分类：API 调用
      useSyslogStore.getState().addLog({
        timestamp: Date.now(),
        category: 'API',
        sourceName: winName,
        message: `[API] ${winName} 调用 ${modelId}`,
      })
      useSyslogStore.getState().addLog({
        timestamp: Date.now(),
        category: winCat,
        sourceName: winName,
        message: `[${winName}] 调用 ${modelId} (${userRound ?? '?'})`,
      })

      const cleanup = (window as any).electronAPI?.ai?.onChunk((c: any) => {
        if (!abortRef.current && c.content) onChunk(c.content)
      })
      const msgs: { role: string; content: string }[] = []
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
      msgs.push({ role: 'user', content })
      const r = await (window as any).electronAPI?.ai?.chat({ modelId, apiKey: key, messages: msgs, stream: true })
      cleanup?.()
      setLoading(false)

      // ── 第二步：模型消息全局落盘（round = A0001-m01）──
      const fullReply = r?.content ?? ''
      const mCounter = ++mCounterRef.current
      const modelRound = roundPrefix ? `${roundPrefix}-m${String(mCounter).padStart(2, '0')}` : undefined
      if (agentId && fullReply) {
        try {
          await (window as any).electronAPI?.storage?.append(agentId, {
            round: modelRound, timestamp: new Date().toISOString(), role: 'model', content: fullReply, modelId,
          })
          useSyslogStore.getState().addLog({
            timestamp: Date.now(),
            category: '保存',
            sourceName: winName,
            message: `[${winName}] 保存模型回复 round=${modelRound ?? '?'}`,
          })
        } catch { /* 存储失败不阻塞 */ }
      }

      return fullReply
    } catch (e: any) {
      setLoading(false)
      setError(e.message)
      useSyslogStore.getState().addLog({
        timestamp: Date.now(),
        category: '错误',
        sourceName: winName,
        message: `[错误] ${winName} AI 调用失败: ${e.message ?? '未知错误'}`,
      })
      throw e
    }
  }, [modelId, opts])

  const abort = useCallback(() => { abortRef.current = true }, [])
  return { send, abort, loading, error, clearError: () => setError(null) }
}
