/**
 * @file 窗口代理 — 通用引擎加载器
 * @module renderer/core/window-agent
 *
 * 职责：
 * 1. 扫描 .goleynx/engines/ 目录，读取每个引擎的 trigger 声明
 * 2. 自动注册 bus 监听（pattern 匹配 → runEngine）
 * 3. 支持 max_iterations 熔断阈值（e08 专用）
 * 4. 步进后自动重载（reloadWindowAgents）
 *
 * 不处理的：
 * - TS 驱动器（dispatcher-driver / executor-driver）保留自己的 bus 监听
 * - 链式引擎（e02/e03，pattern=null）不注册监听
 */

import { bus } from '@shared/bus'
import { useSyslogStore } from '@stores/syslog-store'
import { runEngine, withFileLock } from '@renderer/core/engine-runner'

interface EngineTrigger {
  pattern: string | null
  listener: string
  max_iterations?: number
  driver?: string
}

const api = () => (window as any).electronAPI

let cleanupFns: (() => void)[] = []
let initialized = false
let isReloading = false  // 防止并发重载（setupWindowAgents + activeTaskId useEffect 同时触发）

/** 扫描 engines/ 目录，加载所有引擎的 trigger 声明 */
async function loadEngineTriggers(): Promise<Array<{ code: string; trigger: EngineTrigger }>> {
  const result: Array<{ code: string; trigger: EngineTrigger }> = []
  try {
    const files: string[] = await api()?.file?.listRaw('engines') ?? []
    for (const filename of files) {
      if (!filename.endsWith('.json')) continue
      try {
        const raw = await api()?.file?.readRaw(`engines/${filename}`)
        const parsed = JSON.parse(raw || '{}')
        if (parsed.trigger && parsed.trigger.listener) {
          result.push({
            // 用文件名作为 code（runEngine 用 code 拼文件路径 engines/{code}.json）
            // 不解析 parsed.code——那是描述性标识（如 "B0001-e01"），不是文件名
            code: filename.replace('.json', ''),
            trigger: parsed.trigger,
          })
        }
      } catch {}
    }
  } catch {}
  return result
}

/** 清理旧监听 + 重新扫描 + 注册新监听 */
async function registerAll() {
  // 防止并发调用：setupWindowAgents 和 activeTaskId useEffect 会同时触发
  if (isReloading) return
  isReloading = true

  try {
    // 清理旧监听
    cleanupFns.forEach(fn => fn())
    cleanupFns = []

    const engines = await loadEngineTriggers()

  // 按窗口分组统计
  const grouped: Record<string, string[]> = {}
  for (const eng of engines) {
    const l = eng.trigger.listener
    if (!grouped[l]) grouped[l] = []
    grouped[l].push(eng.code)
  }
  for (const [listener, codes] of Object.entries(grouped)) {
    useSyslogStore.getState().addLog({
      timestamp: Date.now(),
      category: '广播',
      sourceName: '窗口代理',
      message: `[窗口代理] ${listener.toUpperCase()} 代理已加载 ${codes.length} 个引擎: ${codes.join(', ')}`,
    })
  }

  let registered = 0

  for (const eng of engines) {
    const { pattern, listener, max_iterations, driver } = eng.trigger

    // 链式引擎（pattern=null）不注册监听
    if (!pattern) continue

    // TS 驱动器保留自己的监听，窗口代理不重复注册
    if (driver) continue

    const regex = new RegExp(pattern)

    const handler = async (event: any) => {
      if (!event.eventType) return
      if (!regex.test(event.eventType)) return

      const eventType = event.eventType

      // 熔断阈值检查（e08 专用）
      if (max_iterations) {
        // 送审信标：{执行体}{轮}-v{调度版次}-{送审迭代} 或 {执行体}{轮}-rc{版}-{迭}（历史纠查送审）
        // 分组：g1=轮, g2=v/rc, g3=版次, g4=迭代；熔断按「迭代」计数（01→05，第06次熔断），与 e11 的 TRIGGER_RECONCILE_ITERATION<'06' 一致
        const vMatch = eventType.match(/^[A-Z](\d{4})-(v|rc)(\d{2})-(\d{2})$/)
        if (vMatch) {
          const round = vMatch[1]
          const iterCount = parseInt(vMatch[4])
          if (iterCount >= max_iterations) {
            // 追加熔断记录到 reviews.json（面板显示用）——F1-C：与 e08 的 append 共用锁，防并发写撕裂
            try {
              const exec = eventType[0] // D/E/F
              const reviewsPath = 'runtime/panels/c/reviews.json'
              await withFileLock(reviewsPath, async () => {
                const existing = await (window as any).electronAPI?.file?.readRaw(reviewsPath)
                const arr = JSON.parse(existing || '[]')
                arr.push({
                  round: round,
                  id: `fused-${Date.now()}`,
                  timestamp: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/'),
                  fileName: eventType,
                  executor: exec.toLowerCase(),
                  reviewType: `第 ${round} 轮 ${exec} 熔断`,
                  status: 'fused',
                  reason: `迭代达上限(${max_iterations})，触发熔断`,
                })
                await (window as any).electronAPI?.file?.writeRaw(reviewsPath, JSON.stringify(arr, null, 2))
              })
            } catch (e: any) {}
            // 不再自动发 STP：把 melted 结构化标记写入该执行体终端（role:'status'），
            // 交由 301 督导中枢据此诊断→追逃/重分配/穷尽发 stp（熔断值 6 仅作「该窗本轮到此为止」信号）。
            try {
              const exec = eventType[0]
              const tPath = `runtime/terminals/${exec.toLowerCase()}/conversations.json`
              await withFileLock(tPath, async () => {
                const existing = await (window as any).electronAPI?.file?.readRaw(tPath)
                const arr = JSON.parse(existing || '[]')
                arr.push({
                  round: `${exec.toUpperCase()}${round}-melt`,
                  timestamp: new Date().toISOString(),
                  role: 'status',
                  phase: 'fused',
                  status: 'melted',
                  detail: `送审迭代达上限(${max_iterations})，熔断`,
                })
                await (window as any).electronAPI?.file?.writeRaw(tPath, JSON.stringify(arr, null, 2))
              })
            } catch (e: any) {}
            useSyslogStore.getState().addLog({
              timestamp: Date.now(),
              category: '审查',
              sourceName: '审查窗',
              message: `[审查窗] 第 ${round} 轮 ${eventType[0]} 送审迭代达阈值(${max_iterations})，已写 melted 标记，交由 301 督导决策`,
            })
            return
          }
        }
      }

      // 路由到 JSON 引擎
      runEngine(eng.code, listener, eventType).catch((e: any) => {
        useSyslogStore.getState().addLog({
          timestamp: Date.now(),
          category: '错误',
          sourceName: '窗口代理',
          message: `[窗口代理] 引擎 ${eng.code}（${eventType}）执行失败: ${e.message ?? '未知错误'}`,
        })
      })
    }

    bus.on('agent:broadcast', handler)
    cleanupFns.push(() => bus.off('agent:broadcast', handler))
    registered++
  }

  useSyslogStore.getState().addLog({
    timestamp: Date.now(),
    category: '广播',
    sourceName: '窗口代理',
    message: `[窗口代理] 已注册 ${registered} 个信标监听（共 ${engines.length} 个引擎）`,
  })
  } finally {
    isReloading = false
  }
}

/** 启动时初始化窗口代理（全局调用一次） */
export function setupWindowAgents() {
  if (initialized) return
  initialized = true
  registerAll()
}

/** 步进后重载窗口代理（重新扫描引擎 → 重新注册监听） */
export async function reloadWindowAgents() {
  await registerAll()
}
