/**
 * @file Engine Runner — 通用 JSON 执行器
 * @description 读取 engines/{code}.json，逐步骤执行，步步留痕
 *              所有文件读写走 IPC，不用 fs（renderer 无 fs 权限）
 */

import { useSyslogStore } from '@stores/syslog-store'
import { useAppStore } from '@stores/app-store'
import { bus } from '@shared/bus'
import type { LogCategory } from '@shared/bus'

const api = () => (window as any).electronAPI

// ───────────────────────────────────────────────────
// F1-A：蓝图缓存
// 同一轮内 core/ 蓝图（goals/arch/review-rules/steps）不会改变，
// 按 (轮,docId) 缓存一次复用，避免每个执行体每次送审都重读 4 个共享文件。
// ───────────────────────────────────────────────────
const blueprintCache = new Map<string, any>()

// ───────────────────────────────────────────────────
// F1-C：共享文件写入锁
// 多个送审信标会并发触发多个 e08（window-agent 火忘式调用，本就并发），
// 但 append_array / terminals 写入是 read-modify-write，无锁会丢条目。
// 按路径串行化写入，使并发的 LLM 审查（昂贵部分）仍并行，仅廉价写串行。
// ───────────────────────────────────────────────────
export function withFileLock(path: string, task: () => Promise<void>): Promise<void> {
  const prev = fileLocks.get(path) ?? Promise.resolve()
  const run = () => task().finally(() => {
    if (fileLocks.get(path) === chain) fileLocks.delete(path)
  })
  const chain = prev.then(run, run)
  fileLocks.set(path, chain)
  return chain
}
const fileLocks = new Map<string, Promise<void>>()

// F1-C：同一轮全通过后只下发一次 OFF，防并发/重复下发
const completedRounds = new Set<string>()

// E08 上帝视角「覆盖制」架构树体检：每轮收敛后只跑一次（已跑过的轮不再重复体检/覆盖）
const archAuditRounds = new Set<string>()

// ═══════════════════════════════════════════════════
// E08 督导中枢：任务槽 + 看护定时器
// 收敛按「任务槽(slot)」而非执行体：放弃某窗口→分母直接减；
// reassign 闭环：本窗接手别的槽后交付→其槽与被接手槽一并销账（否则收敛卡 2/3、OFF 永不发）；
// 60s 看护发现卡死窗口→比对工单要求文件 vs 窗实际写盘文件（算差集）→发带详情的 C{轮}-ac 审查意见；
// 契约裁决：① fileCount 与指令文件数不符→点名 E10 错误、让窗按实际清单重写；② 调度指令私建架构树(D03)不存在的目录层→清垃圾+告诉窗正确路径（不改工单）；③ 工单路径 vs 实际写盘不符→E08 直接修正架构树(D03)（不回环 E03、不改调度指令）。
// 另：轮收敛后架构树更新由「审查脏标记」驱动（审查阶段检出额外文件→落盘 arch-dirty/{轮}.json→ALL_PASSED 时检查标记→有标记才调 auditAndOverwriteArchTree 合并），不再盲扫磁盘。
// 熔断(melted)=硬失败→立即换窗（电路已断，不给原窗重跑）；
// 瞬态失败(timeout/parse/empty)→有限次 diagnose（默认 2 次）后再换窗；
// 所有活跃窗穷尽仍失败→abandoned→全 abandoned→发 stp。
// ═══════════════════════════════════════════════════
interface SlotState { status: 'pending' | 'delivered' | 'abandoned'; filledBy: string; triedWindows: string[] }
interface RoundSlotState { slots: Record<string, SlotState>; lastActivity: number; step: string; advisoryCounts: Record<string, number> }
const roundSlots: Record<string, RoundSlotState> = {}

async function persistSlots(round: string) {
  try { await api()?.file?.writeRaw(`runtime/slots/${round}.json`, JSON.stringify(roundSlots[round], null, 2)) } catch {}
}

// 读某窗口调度工单的文件数。
// 返回 -1：工单文件尚不存在 / 字段缺失（未知，不要急着放弃）；
// 返回 >=0：真实文件数，0 即「空工单」。空工单的槽不应进 pending，否则督导会陷入「重跑空任务」死循环。
async function dispatchFileCount(round: string, step: string, ex: string): Promise<number> {
  try {
    const raw = await api()?.file?.readRaw(`runtime/dispatch/B${round}-s${step}-${ex}.json`)
    if (!raw) return -1
    const d = JSON.parse(raw)
    const fc = (d as any).fileCount
    if (fc !== undefined && fc !== null && String(fc).trim() !== '') {
      const n = parseInt(String(fc), 10)
      if (!isNaN(n)) return n
    }
    const files = (d as any).files || (d as any).filePaths || []
    if (Array.isArray(files) && files.length > 0) return files.length
    return -1
  } catch { return -1 }
}

async function ensureSlots(round: string): Promise<RoundSlotState> {
  if (roundSlots[round]) return roundSlots[round]
  // 尝试从磁盘恢复（重启续上）
  try {
    const raw = await api()?.file?.readRaw(`runtime/slots/${round}.json`)
    const data = JSON.parse(raw || 'null')
    if (data && data.slots) { roundSlots[round] = data; return data }
  } catch {}
  // 从 meta 构建槽（meta.executors = 本轮活跃窗口集；槽标识=原窗口字母，不绑定谁写）
  let meta: any = {}
  let step = round
  try {
    const files: string[] = (await api()?.file?.listRaw('runtime/dispatch')) ?? []
    const metaFile = (files as string[]).find((f: string) => f.startsWith(`B${round}-s`) && f.endsWith('-meta.json'))
    if (metaFile) {
      meta = JSON.parse((await api()?.file?.readRaw(`runtime/dispatch/${metaFile}`)) || '{}')
      step = String(meta.step || `s${round}`).replace(/^s/, '')
    }
  } catch {}
  const executors: string[] = ((meta.executors as string[]) || []).map((e: string) => e.toUpperCase())
  const slots: Record<string, SlotState> = {}
  for (const ex of executors) {
    // 空工单（fileCount=0）直接标 abandoned：不进 pending，避免督导陷入「重跑空任务」死循环
    const fc = await dispatchFileCount(round, step, ex)
    slots[ex] = { status: fc === 0 ? 'abandoned' : 'pending', filledBy: ex, triedWindows: [ex] }
  }
  const state: RoundSlotState = { slots, lastActivity: Date.now(), step, advisoryCounts: {} }
  roundSlots[round] = state
  await persistSlots(round)
  return state
}

// 瞬态失败（非熔断）允许的原窗 diagnose 重跑上限；超过则换窗。
const TRANSIENT_DIAGNOSE_LIMIT = 2

// 从文本提取 workspace/ 开头的文件路径（去重）
function extractWorkspacePaths(text: string): string[] {
  if (!text) return []
  const re = /workspace\/[^\n\r\s,)'"`]+/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const p = m[0].trim()
    if (!out.includes(p)) out.push(p)
  }
  return out
}

// 取文件列表的公共基目录（含末尾 /）
function commonBaseDir(files: string[]): string {
  if (files.length === 0) return ''
  if (files.length === 1) return files[0].replace(/[^/]+$/, '')
  const segs = files.map((f) => f.split('/'))
  let i = 0
  while (i < segs[0].length && segs.every((s) => s[i] === segs[0][i])) i++
  return segs[0].slice(0, i).join('/') + (i > 0 ? '/' : '')
}

// 从终端对话提取本窗实际写盘文件（executor-driver 的 ✅ 摘要，按窗口隔离）
function extractWrittenFiles(conv: any[]): string[] {
  const out: string[] = []
  if (!Array.isArray(conv)) return out
  for (const e of conv) {
    if (!e || typeof e.content !== 'string') continue
    const re = /✅\s+(workspace\/[^\s)]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(e.content)) !== null) {
      const p = m[1].trim()
      if (!out.includes(p)) out.push(p)
    }
  }
  return out
}

// 取最近一次 e08 驳回原因（给接手/重跑窗指明修正方向）
function latestRejectReason(conv: any[]): string {
  if (!Array.isArray(conv)) return ''
  let reason = ''
  for (const e of conv) {
    if (!e || typeof e.content !== 'string') continue
    const c = e.content
    if (/驳回|reject|需要重写|不符合|缺失|缺少/.test(c)) reason = c.replace(/\s+/g, ' ').slice(0, 200)
  }
  return reason
}

// 比对 工单要求文件 vs 窗实际写盘文件，生成详细审查意见素材
async function buildAdvisoryDetail(round: string, step: string, win: string): Promise<any> {
  let requiredFiles: string[] = []
  let requiredBase = ''
  let fileCount = -1
  try {
    const raw = await api()?.file?.readRaw(`runtime/dispatch/B${round}-s${step}-${win}.json`)
    if (raw) {
      const d = JSON.parse(raw)
      const fc = parseInt(String((d as any).fileCount ?? '-1'), 10)
      fileCount = isNaN(fc) ? -1 : fc
      requiredFiles = extractWorkspacePaths((d as any).instruction || '')
      requiredBase = commonBaseDir(requiredFiles)
    }
  } catch {}
  let actualFiles: string[] = []
  let latestReject = ''
  try {
    const raw = await api()?.file?.readRaw(`runtime/terminals/${win}/conversations.json`)
    const conv = JSON.parse(raw || '[]')
    actualFiles = extractWrittenFiles(conv)
    latestReject = latestRejectReason(conv)
  } catch {}
  const actualBase = commonBaseDir(actualFiles)
  const reqSet = new Set(requiredFiles)
  const actSet = new Set(actualFiles)
  const extra = actualFiles.filter((f) => !reqSet.has(f))
  const missing = requiredFiles.filter((f) => !actSet.has(f))
  const pathMismatch = !!requiredBase && !!actualBase && requiredBase !== actualBase
  const parts: string[] = []
  parts.push(`工单要求 ${requiredFiles.length} 个文件（${requiredFiles.join('、') || '无'}）`)
  parts.push(`你已交付 ${actualFiles.length} 个（${actualFiles.join('、') || '无'}）`)
  if (extra.length) parts.push(`多出应删/勿写：${extra.join('、')}`)
  if (missing.length) parts.push(`缺少应补：${missing.join('、')}`)
  if (pathMismatch) parts.push(`路径应为 ${requiredBase} 不是 ${actualBase}`)
  if (latestReject) parts.push(`最近驳回原因：${latestReject}`)
  return { requiredFiles, actualFiles, extra, missing, latestReject, reason: parts.join('；'), targetFiles: requiredFiles, requiredBase, actualBase, pathMismatch, fileCount }
}

// 架构树(D03)已知目录集合（缓存）：用于判定「调度指令是否私自创建了架构树不存在的目录层」
let archKnownDirsCache: Set<string> | null = null
async function getArchKnownDirs(): Promise<Set<string>> {
  if (archKnownDirsCache) return archKnownDirsCache
  const set = new Set<string>()
  try {
    const raw = await api()?.file?.readRaw('core/architecture.md')
    if (raw) {
      const m = raw.match(/[A-Za-z0-9_\-]+\//g)
      if (m) for (const tok of m) set.add(tok.replace(/\/$/, ''))
    }
  } catch {}
  archKnownDirsCache = set
  return set
}

// 判定调度指令里的路径是否「私自创建了架构树(D03)不存在的顶层目录」（任何项目/任何层名通用，由架构树已知目录集动态判定，不写死名字）。
// 规则：workspace/<X>/<Y>/... 中，若 X 不在架构树已知目录、但 Y 在，则 X 为私建层，去掉 X 即得到架构树合法路径。
async function detectSpuriousPaths(requiredFiles: string[]): Promise<{ spurious: string[]; corrected: Record<string, string> }> {
  const known = await getArchKnownDirs()
  const spurious = new Set<string>()
  const corrected: Record<string, string> = {}
  for (const f of requiredFiles) {
    const rel = f.replace(/^workspace\//, '')
    const segs = rel.split('/')
    if (segs.length >= 2 && !known.has(segs[0]) && known.has(segs[1])) {
      spurious.add(segs[0])
      corrected[f] = 'workspace/' + segs.slice(1).join('/')
    }
  }
  return { spurious: [...spurious], corrected }
}

// 受限删除 workspace 下私建目录（路径穿越由 IPC 端兜底校验）
async function deleteWorkspacePath(relPath: string): Promise<void> {
  try { await api()?.file?.deleteWorkspace(relPath) } catch {}
}

// （A 机制已删除：reconcileArchTree 飞行中软标注改树已移除。
//  理由：单窗送审时依据 requiredBase≠actualBase 改树反应面过宽，会把「窗祸/E10祸」误判为「树祸」污染架构树（Bug1），且与收敛点覆盖制 B 撞车。
//  改树统一收口到收敛点「增量制」B（auditAndOverwriteArchTree），确定性diff+LLM语义判定合并，保底不丢条目。

// （treefix 留痕函数已移除：E08 不回环 E10 重发调度；契约违规改由 301 审查窗写进驳回指令定向纠正，见 maybeFixContract）

// ───────────────────────────────────────────────────
// E08 上帝视角「增量合并制」架构树体检（修复·全量空树BUG）：
// 在「轮收敛后、OFF 发出前」触发。不再做全量替换（旧 buildOverwriteDoc 以 LLM 生成树覆盖全文，
// 磁盘只含本轮写入文件时树会从50条掉到15条，LLM 返回空则树变空），改为「确定性 diff + 增量合并」：
//  1. 解析旧树条目 → 2. 与磁盘 diff → 3. LLM 语义判定新增/删除是否合法 → 4. 合并 = 旧条目 + 合法新增 - 确认删除
// 死命令：合并后条目数为 0 → 保旧树不动（绝不写空文件）。
// ───────────────────────────────────────────────────
function flattenWorkspace(nodes: any[], prefix = ''): string[] {
  const out: string[] = []
  for (const n of nodes || []) {
    const p = prefix ? `${prefix}/${n.name}` : n.name
    if (n.type === 'folder' && n.children) out.push(...flattenWorkspace(n.children, p))
    else if (n.type === 'file') out.push(p)
  }
  return out
}

// 从架构树 Markdown 文本中提取 workspace/ 文件路径（含目录层级上下文重建）
// 格式如：│   ├── src/components/Header.tsx → 还原为 workspace/src/components/Header.tsx
function parseArchTreeEntries(archRaw: string): string[] {
  const paths: string[] = []
  // 找树形代码块
  const blockMatch = (archRaw || '').match(/```\s*\n([\s\S]*?)\n```/)
  if (!blockMatch) return paths
  const treeText = blockMatch[1]
  // 按缩进深度追踪目录栈
  const stack: { depth: number, name: string }[] = []
  for (const line of treeText.split('\n')) {
    if (!line.trim()) continue
    // 计算缩进深度（每 4 个空格或树画线算一层）
    const indent = line.search(/\S/)
    if (indent < 0) continue
    let content = line.slice(indent).replace(/^[│├└─\s]+/, '').trim()
    content = content.replace(/\s+#.*$/, '').trim()  // 剥除行内注释（如 "GameLoop.ts # 游戏主循环" → "GameLoop.ts"）
    if (!content) continue
    // 弹出比当前深度浅的栈元素
    while (stack.length > 0 && stack[stack.length - 1].depth >= indent) stack.pop()
    if (content.endsWith('/')) {
      // 目录：入栈
      stack.push({ depth: indent, name: content.slice(0, -1) })
    } else {
      // 文件：拼接完整路径
      const dirPath = stack.map(s => s.name).join('/')
      const fullPath = dirPath ? `${dirPath}/${content}` : content
      if (fullPath) paths.push(fullPath)
    }
  }
  return [...new Set(paths)]
}

// 从扁平文件路径列表构建树形 Markdown 文本
function buildArchTreeMd(paths: string[]): string {
  if (!paths.length) return '(空)'
  const sorted = [...paths].sort()
  const lines: string[] = []
  const stack: string[] = []
  for (const p of sorted) {
    const parts = p.split('/')
    let i = 0
    // 找到共同前缀
    while (i < stack.length && i < parts.length - 1 && stack[i] === parts[i]) i++
    // 弹出多余层级
    while (stack.length > i) { stack.pop() }
    // 补入新层级
    while (stack.length < parts.length - 1) {
      const dir = parts[stack.length]
      const indent = '│   '.repeat(stack.length) + '├── '
      lines.push(`${indent}${dir}/`)
      stack.push(dir)
    }
    // 文件
    const indent = '│   '.repeat(stack.length) + '├── '
    lines.push(`${indent}${parts[parts.length - 1]}`)
  }
  // 替换最后一个 ├── 为 └──
  for (let li = lines.length - 1; li >= 0; li--) {
    // 找出每层最后一个兄弟，改 ├── → └──
    const depth = lines[li].match(/^[│\s]*├──/) ? (lines[li].indexOf('├──') / 4) : -1
    if (depth < 0) continue
    // 往后看同层是否还有
    let isLast = true
    for (let lj = li + 1; lj < lines.length; lj++) {
      const d2 = lines[lj].match(/^[│\s]*├──/) ? (lines[lj].indexOf('├──') / 4) : -1
      if (d2 >= 0 && d2 < depth) { isLast = false; break }
      if (d2 === depth) { isLast = false; break }
    }
    if (isLast) {
      const prefix = lines[li].substring(0, lines[li].indexOf('├──'))
      lines[li] = prefix + '└── ' + lines[li].substring(lines[li].indexOf('├──') + 4)
    }
  }
  return lines.join('\n')
}

// 增量合并：旧树条目 + 磁盘新增（LLM 验证合法） - 幽灵条目（LLM 确认删除） → 拼出新树文档
async function performArchMerge(
  round: string, archRaw: string, diskFiles: string[],
  requirements: string, reviewRules: string
): Promise<{ mergedPaths: string[], newDoc: string, summary: string, similarity: string }> {
  const oldPaths = parseArchTreeEntries(archRaw)
  const diskSet = new Set(diskFiles.map(f => f.replace(/^workspace\//, '')))
  const oldSet = new Set(oldPaths)
  const newPaths = [...diskSet].filter(p => !oldSet.has(p))
  const ghostPaths = [...oldSet].filter(p => !diskSet.has(p))

  // 相似度：以旧条目命中率计
  const hitCount = oldPaths.filter(p => diskSet.has(p)).length
  const total = Math.max(oldPaths.length, diskSet.size, 1)
  const similarity = Math.round((hitCount / total) * 100).toString()

  // 无差异 → 直接返回不需要合并
  if (newPaths.length === 0 && ghostPaths.length === 0) {
    return { mergedPaths: oldPaths, newDoc: '', summary: `架构树与磁盘代码完全一致（相似度 ${similarity}%）`, similarity }
  }

  // LLM 语义判定：新增是否合法？幽灵是否确认删除？
  const systemPrompt = `你是项目架构审查员。只做语义判定，不重写树。\n当前轮次：${round}\n\n规则：\n1. 每个「新增」条目：判断其路径是否符合需求(D02)与审查规则(D04)的模块划分约定。输出 legal=true/false。\n2. 每个「幽灵」条目：判断该文件是否真的应该从架构树中删除（不再需要）。输出 confirmed=true/false。\n3. 被标记 legal=false 的新增不会被写入新树；被标记 confirmed=false 的幽灵将保留在树中（保底不丢）。\n严格返回 JSON：\n{"additions":[{"path":"src/xxx.ts","legal":true,"reason":"属于 X 模块"}], "ghosts":[{"path":"src/yyy.ts","confirmed":true,"reason":"该模块已废弃"}]}`
  const userPrompt = `## 新增条目（磁盘有，树无）:\n${newPaths.join('\n') || '(无)'}\n\n## 幽灵条目（树有，磁盘无）:\n${ghostPaths.join('\n') || '(无)'}\n\n## 需求清单:\n${requirements}\n\n## 审查规则:\n${reviewRules}`
  let additions: { path: string, legal: boolean }[] = []
  let ghosts: { path: string, confirmed: boolean }[] = []
  try {
    const res = await api()?.ai?.chat({ modelId: await resolveFirstModel(), stream: false, messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]})
    const raw = res?.content ?? ''
    const jm = raw.match(/\{[\s\S]*\}/)
    if (jm) {
      const parsed = JSON.parse(jm[0])
      additions = parsed.additions || []
      ghosts = parsed.ghosts || []
    }
  } catch {
    // LLM 调用或解析失败 → 保旧树：新增一律视为暂不合并，幽灵一律保留
    log(`[E08 merge] LLM 判定失败，保旧树不丢条目`, 'error')
    return { mergedPaths: oldPaths, newDoc: '', summary: `LLM 语义判定失败，保留旧树不变（${oldPaths.length} 条目）`, similarity }
  }

  // 合并
  const legalAdds = additions.filter(a => a.legal).map(a => a.path)
  const confirmedDels = ghosts.filter(g => g.confirmed).map(g => g.path)
  const mergedPaths = [...new Set([...oldPaths.filter(p => !confirmedDels.includes(p)), ...legalAdds])]

  // 死命令：合并后条目 ≤ 0 → 保旧树
  if (mergedPaths.length === 0) {
    log(`[E08 merge] 合并后条目为 0，保旧树 ${oldPaths.length} 条不动`, 'error')
    return { mergedPaths: oldPaths, newDoc: '', summary: `合并后条目为空，保留旧树（${oldPaths.length} 条目）`, similarity }
  }

  // 构建树形文本
  const treeMd = buildArchTreeMd(mergedPaths)
  const headerMatch = (archRaw || '').match(/(\n## d\d)/)
  const header = headerMatch ? archRaw.slice(0, headerMatch.index) : (archRaw || '# 架构结构树\n\n')
  const block = `\n## d03 第 ${round} 轮 架构合并（E08）\n\n架构树与磁盘代码不一致，已基于增量合并更新。+${legalAdds.length} 新增 / -${confirmedDels.length} 删除。\n\n### 文件结构树（${mergedPaths.length} 文件）\n\n\`\`\`\n${treeMd}\n\`\`\`\n\n> E08 增量合并：保留旧树 ${oldPaths.length} 条 + 新增 ${legalAdds.length} 条 - 确认删除 ${confirmedDels.length} 条 = ${mergedPaths.length} 条。\n\n---`
  const newDoc = header.trimEnd() + '\n' + block
  const summary = `增量合并：+${legalAdds.length}/-${confirmedDels.length}，共 ${mergedPaths.length} 条目`
  return { mergedPaths, newDoc, summary, similarity }
}

// 把架构树体检结果落到 301 面板
async function writeArchAuditReport(round: string, status: 'pass' | 'warn', reason: string): Promise<void> {
  const ts = new Date().toISOString()
  const id = `arch-audit-${ts}`
  await withFileLock('runtime/panels/c/reviews.json', async () => {
    let arr: any[] = []
    try { const raw = await api()?.file?.readRaw('runtime/panels/c/reviews.json'); arr = JSON.parse(raw || '[]') } catch {}
    arr.push({ round, id, timestamp: ts, fileName: 'core/architecture.md', reviewType: 'E08 架构树体检（增量制）', status, reason })
    try { await api()?.file?.writeRaw('runtime/panels/c/reviews.json', JSON.stringify(arr, null, 2)) } catch {}
  })
  await withFileLock('terminals/c', async () => {
    try {
      await api()?.storage?.append('c', {
        round: `C${round}-m-archaudit`,
        timestamp: ts,
        role: 'model',
        content: `[审查] 第 ${round} 轮 架构树体检（E08·增量制）\n\n${reason}`,
      })
    } catch {}
  })
}

// E08 增量合并制架构树体检主流程
async function auditAndOverwriteArchTree(round: string): Promise<void> {
  if (archAuditRounds.has(round)) return
  archAuditRounds.add(round)
  try {
    const diskTree: any[] = (await api()?.file?.listWorkspace()) ?? []
    let diskFiles = flattenWorkspace(diskTree).map(f => `workspace/${f}`)
    // 剥私建层
    const known = await getArchKnownDirs()
    const spuriousTops = new Set<string>()
    for (const f of diskFiles) {
      const segs = f.replace(/^workspace\//, '').split('/')
      if (segs.length >= 2 && !known.has(segs[0]) && known.has(segs[1])) spuriousTops.add(segs[0])
    }
    if (spuriousTops.size > 0) {
      const kept = diskFiles.filter((f) => !spuriousTops.has(f.replace(/^workspace\//, '').split('/')[0]))
      log(`[E08 架构体检] 第 ${round} 轮 检出私建顶层目录 ${[...spuriousTops].join('、')}，已从体检清单剔除并清理磁盘残留`)
      for (const top of spuriousTops) { try { await deleteWorkspacePath('workspace/' + top) } catch {} }
      diskFiles = kept
    }
    const archRaw = (await api()?.readBlueprint('architecture')) || ''
    const requirements = (await api()?.readBlueprint('requirements')) || ''
    const reviewRules = (await api()?.readBlueprint('review-rules')) || ''

    // 增量合并
    const { mergedPaths, newDoc, summary, similarity } = await performArchMerge(round, archRaw, diskFiles, requirements, reviewRules)

    if (!newDoc) {
      await writeArchAuditReport(round, 'pass', `架构树体检：${summary}，无需修正。`)
      log(`[E08 架构体检] 第 ${round} 轮 ${summary}`)
      useSyslogStore.getState().addLog({ timestamp: Date.now(), category: '审查', sourceName: '审查窗', message: `[审查窗] 第 ${round} 轮 架构树体检：${summary}` })
      return { merged: false }
    }

    blueprintCache.clear()
    archKnownDirsCache = null
    await api()?.writeBlueprint('architecture', newDoc)
    // 双轨：机器可读架构清单直接用磁盘扫描（纯净路径，和 e03 同源），不走 parseArchTreeEntries 合并路径
    try {
      const archJson = `# D03 第 ${round} 轮 · E08 架构合并 · ${diskFiles.length} 文件\n${diskFiles.join('\n')}`
      await api()?.file?.writeRaw('runtime/arch-files.json', archJson)
    } catch { /* 非致命 */ }
    // 架构已变 → 通知 E05 重新生成开发步骤（写标记 + 发 C{round}-00）
    try {
      await api()?.file?.writeRaw('runtime/arch-regen.json', JSON.stringify({ round, source: 'E08' }))
      bus.emit('agent:broadcast', { sourceId: 'C', sourceName: '审查窗', eventType: `C${round}-00`, message: `第 ${round} 轮 架构已合并（E08）→ 通知 E05 重建开发步骤`, category: '审查', timestamp: Date.now() })
    } catch {}
    await writeArchAuditReport(round, 'warn', `架构树体检：${summary}，E08 已增量合并更新。`)
    log(`[E08 架构体检] 第 ${round} 轮 架构树已增量合并（+/-）`)
    useSyslogStore.getState().addLog({ timestamp: Date.now(), category: '审查', sourceName: '审查窗', message: `[审查窗] 第 ${round} 轮 架构树与代码不一致（相似度 ${similarity}%），已增量合并更新` })
    return { merged: true }
  } catch (e: any) {
    log(`[E08 架构体检] 第 ${round} 轮 失败: ${e?.message}`, 'error')
    useSyslogStore.getState().addLog({ timestamp: Date.now(), category: '错误', sourceName: '审查窗', message: `[审查窗] 第 ${round} 轮 架构树体检失败: ${e?.message}` })
    return { merged: false }
  }
}

// 契约裁决（E08 本职的判定权）：
// 只产出"定向驳回指令"内容（detail.reason / targetFiles），**绝不改写调度指令(工单)**——
// 工单已被窗口消费，事后改它窗口不会重读，毫无意义。契约违规由 301 审查窗写进驳回指令，
// 让窗口按正确路径/清单重写（驳回指令本身就是定向调度）。
async function maybeFixContract(_round: string, _step: string, _win: string, detail: any): Promise<void> {
  if (detail?.fileCount >= 0 && detail.requiredFiles.length > 0 && detail.fileCount !== detail.requiredFiles.length) {
    // 裁决①：工单 fileCount 与指令实际文件数不符 → 属调度(E10)契约错误；不改工单，点名事实并让窗口按实际清单重写
    detail.reason = `【调度指令契约错误·E10】工单 fileCount=${detail.fileCount} 与指令实际 ${detail.requiredFiles.length} 个文件不符，属调度生成错误；请按指令实际文件清单（${detail.requiredFiles.join('、')}）重写，不要多写或少写。` + (detail.reason || '')
  }
  // 裁决②：调度指令私自创建架构树(D03)不存在的目录层（这是 E10 私建的错，不是窗的锅）
  const sp = await detectSpuriousPaths(detail?.requiredFiles || [])
  if (sp.spurious.length > 0) {
    try {
      // 清理私建目录中被错写的代码（只是清垃圾，绝不改调度指令）
      for (const dir of sp.spurious) await deleteWorkspacePath(dir)
      const correctedList = Object.values(sp.corrected)
      const correctedBase = (correctedList[0] || 'workspace/').replace(/[^/]+$/, '')
      detail.targetFiles = correctedList
      detail.reason = `【调度指令私建目录·违规·E10】指令私自创建 ${sp.spurious.join('/')} 层，但架构树 D03 不存在该顶层目录；这是调度(E10)的契约错误，非你之过。正确路径应为 ${correctedBase}（去掉私建层后的架构树合法路径），请直接写到那里，禁止自建子目录。` + (detail.reason || '')
    } catch {}
  } else if (detail?.pathMismatch) {
    // 裁决③（改树不再在此处理）：工单基址 requiredBase 与窗实际基址 actualBase 不一致，且 裁决② 未判定为「私建顶层目录」。
    // 走到这里通常是「合法目录但窗把基址写偏」——以工单(与架构树对齐)基址 requiredBase 为准让窗重写，
    // 不再在此追加修正块污染架构树（消除 Bug1：单窗送审误判窗祸/E10祸为树祸）。
    // 架构树与真实代码的偏差由收敛点「覆盖制」B 统一核对/覆盖，不在此回环 E03、不改调度指令。
    detail.reason = `【基址偏差·E08 提示】工单要求基址 ${detail.requiredBase}，你实际写到 ${detail.actualBase}，二者不一致。请按工单基址 ${detail.requiredBase} 重写（以工单/架构树对齐基址为准）；架构树是否需调整将由 E08 在轮收敛后统一核对，不在此单独改树。` + (detail.reason || '')
  }
}

// 重分配：换一个未尝试过的活跃窗接手该槽；无可用窗则放弃该槽
async function reassignSlot(st: RoundSlotState, round: string, step: string, slotId: string, fromWin: string, detail: any) {
  const slot = st.slots[slotId]
  const next = Object.keys(st.slots).find((w) => !slot.triedWindows.includes(w) && w !== slotId)
  if (next) {
    slot.filledBy = next
    if (!slot.triedWindows.includes(next)) slot.triedWindows.push(next)
    await writeAdvisory(round, step, next, 'reassign', slotId, fromWin, detail)
  } else {
    slot.status = 'abandoned'
  }
}

async function writeAdvisory(round: string, step: string, targetWin: string, kind: 'diagnose' | 'reassign', slotId: string, fromWin: string, detail?: any) {
  const st = roundSlots[round]
  if (!st) return
  st.advisoryCounts[targetWin] = (st.advisoryCounts[targetWin] || 0) + 1
  const seq = String(st.advisoryCounts[targetWin]).padStart(2, '0')
  const reason = detail?.reason
    ? (kind === 'reassign' ? `原窗 ${fromWin} 任务转交你接手。` : '') + detail.reason
    : (kind === 'diagnose' ? '未送审/解析失败/超时，重跑原任务' : `原窗 ${fromWin} 任务转交你接手`)
  const targetFiles = detail?.targetFiles && detail.targetFiles.length ? detail.targetFiles : []
  const payload = {
    kind, round, advisorySeq: seq, targetExecutor: targetWin,
    reason,
    dispatchPath: `runtime/dispatch/B${round}-s${step}-${slotId}.json`,
    targetFiles, fromExecutor: fromWin, step, dispatchSeq: '01',
  }
  try { await api()?.file?.writeRaw(`runtime/advisory/C${round}-ac${seq}-${targetWin}.json`, JSON.stringify(payload, null, 2)) } catch {}
  st.lastActivity = Date.now()
  bus.emit('agent:broadcast', { sourceId: 'C', sourceName: '审查窗', eventType: `C${round}-ac${seq}-${targetWin}`, message: `审查意见(${kind}) → ${targetWin}`, category: '审查', timestamp: Date.now() })
  await persistSlots(round)
}

async function supervisorCheck() {
  const rounds = Object.keys(roundSlots)
  for (const round of rounds) {
    const st = roundSlots[round]
    if (!st || !st.slots) continue
    if (Date.now() - st.lastActivity < 60000) continue
    const pending = (Object.entries(st.slots) as [string, SlotState][]).filter(([, s]) => s.status === 'pending')
    let acted = false
    for (const [slotId, slot] of pending) {
      const win = slot.filledBy
      // 空工单（0 文件）：重跑 / 重分配都毫无意义，直接放弃该槽，杜绝「重跑空任务」死循环
      const fc = await dispatchFileCount(round, st.step, win)
      if (fc === 0) { slot.status = 'abandoned'; acted = true; continue }
      let latest: any = null
      try {
        const conv = JSON.parse((await api()?.file?.readRaw(`runtime/terminals/${win}/conversations.json`)) || '[]')
        const statuses = (conv as any[]).filter((c: any) => c.role === 'status')
        if (statuses.length) latest = statuses[statuses.length - 1]
      } catch {}
      const melted = !!(latest && latest.status === 'melted')
      const transient = !latest || latest.status === 'failed-timeout' || latest.status === 'failed-parse' || latest.status === 'failed-empty'
      if (!melted && !transient) continue
      acted = true
      const detail = await buildAdvisoryDetail(round, st.step, win)
      await maybeFixContract(round, st.step, win, detail)
      if (melted) {
        // 熔断=硬失败（电路已断）→ 立即换窗，不给原窗重跑机会
        await reassignSlot(st, round, st.step, slotId, win, detail)
      } else if ((st.advisoryCounts[win] || 0) >= TRANSIENT_DIAGNOSE_LIMIT) {
        // 瞬态卡死已达上限 → 换窗
        await reassignSlot(st, round, st.step, slotId, win, detail)
      } else {
        // 瞬态卡死→有限次 diagnose，唤醒原窗按详细意见重跑
        await writeAdvisory(round, st.step, win, 'diagnose', slotId, win, detail)
      }
    }
    // 收敛 / 兜底：无论本次是否处理过 pending，都要评估「全 abandoned → 发 stp」
    // （修复：原代码在 pending 为空时提前 continue，导致全空轮次永不发 stp 而卡死）
    const vals = Object.values(st.slots)
    const allAbandoned = vals.length > 0 && vals.every((s) => (s as SlotState).status === 'abandoned')
    if (allAbandoned && !completedRounds.has(`stp-${round}`)) {
      completedRounds.add(`stp-${round}`)
      bus.emit('agent:broadcast', { sourceId: 'C', sourceName: '审查窗', eventType: `stp${round}`, message: `第 ${round} 轮 所有任务槽穷尽仍无法完成 → STP`, category: '审查', timestamp: Date.now() })
      acted = true
    }
    if (acted) { st.lastActivity = Date.now(); await persistSlots(round) }
    else { st.lastActivity = Date.now() }
  }
}

// 督导看护：监听调度信标建立任务槽 + 定时诊断（模块级注册一次）
bus.on('agent:broadcast', (event: any) => {
  if (!event?.eventType) return
  const dm = event.eventType.match(/^B(\d{4})-s(\d{4})-(\d{2})-([A-Z])$/)
  if (dm) {
    const r = dm[1]
    ensureSlots(r).then((st) => { st.lastActivity = Date.now(); persistSlots(r) }).catch(() => {})
  }
})
if (typeof setInterval !== 'undefined') setInterval(() => { supervisorCheck().catch(() => {}) }, 5000)

// E08/E09 架构重生握手：监听到 B{round}-00 → 确认 arch-regen.json 已被 E05 清除 → 发 off
bus.on('agent:broadcast', async (event: any) => {
  if (!event?.eventType) return
  const br = event.eventType.match(/^B(\d{4})-00$/)
  if (!br) return
  const round = br[1]
  try {
    const regenRaw = await api()?.file?.readRaw('runtime/arch-regen.json')
    const regenDone = !regenRaw || regenRaw.trim() === '{}' || regenRaw.trim() === ''
    log(`[B0001-00 握手] 第 ${round} 轮 架构重生步骤已完成${regenDone ? '（已清除标记）' : '（标记残留）'}`)
    if (regenDone) {
      // 清理本轮架构脏标记（已走完 REGEN→OFF 链路，标记不再需要）
      try { await api()?.file?.delete?.(`runtime/arch-dirty/${round}.json`) } catch {}
      useSyslogStore.getState().addLog({ timestamp: Date.now(), category: '审查', sourceName: '审查窗', message: `第 ${round} 轮 架构重生步骤已完成 → OFF` })
      bus.emit('agent:broadcast', { sourceId: 'C', sourceName: '审查窗', eventType: `off${round}`, message: `第 ${round} 轮 架构重生步骤已完成 → OFF`, category: '审查', timestamp: Date.now() })
    } else {
      useSyslogStore.getState().addLog({ timestamp: Date.now(), category: '审查', sourceName: '审查窗', message: `第 ${round} 轮 架构重生步骤已完成（标记残留）` })
    }
  } catch {}
})

// ═══════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════

interface EngineStep {
  id: string
  action: string
  desc: string
  input?: string
  input_key?: string
  output_key?: string
  fallback?: string
  condition?: string
  model?: string
  system_prompt?: string
  user_prompt_template?: string
  content_template?: string
  content?: any
  append_array?: boolean
  core_append?: boolean
  entries?: any[]
  rules?: Record<string, string>
  code?: string
  sourceName?: string
  project_id?: string
  new_name?: string
  chain_code?: string
  confirm_file?: string
  timeout_ms?: number
  fallback_raw?: boolean
  message?: string
  steps?: EngineStep[]
  executors_key?: string
  splits_key?: string
  round?: string
}

interface EngineScript {
  code: string
  receiver: string
  steps: EngineStep[]
  variables: Record<string, string>
}

// ═══════════════════════════════════════════════════
// 日志
// ═══════════════════════════════════════════════════

function log(msg: string, level: 'info' | 'error' = 'info') {
  const prefix = level === 'error' ? '[Engine ERR]' : '[Engine]'
  console.log(`${prefix} ${msg}`)
  const winCat: LogCategory = level === 'error' ? '错误' : (engineSourceName ? engineSourceName[1] as LogCategory : '中枢')
  useSyslogStore.getState().addLog({
    timestamp: Date.now(),
    category: level === 'error' ? '错误' : winCat,
    sourceName: engineSourceName ? engineSourceName[0] : '引擎',
    message: `${prefix} ${msg}`,
  })
}

const ENGINE_SENDER_MAP: Record<string, [string, LogCategory]> = {
  'A': ['对话窗', '对话'],
  'B': ['中枢窗', '中枢'],
  'C': ['审查窗', '审查'],
  'D': ['执行窗', '执行'],
}

let engineSourceName: [string, LogCategory] | null = null

// ═══════════════════════════════════════════════════
// 模板解析
// ═══════════════════════════════════════════════════

function resolve(template: string, ctx: Record<string, any>): string {
  if (template === undefined || template === null) return ''
  let result = template
  let maxIterations = 5
  let prev: string
  do {
    prev = result
    result = result
      .replace(/\{\{((?!\{\{).*?)\}\}/g, (_match, expr) => {
        try {
          const keys = Object.keys(ctx)
          const vals = Object.values(ctx)
          const fn = new Function(...keys, `return (${expr})`)
          const out = fn(...vals)
          return out !== undefined ? String(out) : ''
        } catch {
          return _match
        }
      })
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
  } while (result !== prev && maxIterations-- > 0)
  return result
}

function stripXml(content: string): string {
  return content
    .replace(/<(total_files|total_groups|summary|result)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(group|files|file|batch|full_plan)[^>]*>/gi, '')
    .replace(/\*{0,2}拆分理由\*{0,2}[:：]/g, '**拆分理由**：')
    .replace(/\*{0,2}包含文件\*{0,2}[:：]/g, '**包含文件**：')
    .replace(/^\s*\n/gm, '\n')
}

function evalCond(condition: string, ctx: Record<string, any>): boolean {
  const expr = condition.replace(/\{\{(\w+)\}\}/g, (_, key) => key)
  log(`条件求值: raw="${condition}" → expr="${expr}"`)
  if (expr.includes('{{')) {
    log(`条件解析失败: 残留未替换变量 → "${expr}"`, 'error')
    return false
  }
  const keys = Object.keys(ctx)
  const vals = Object.values(ctx)
  try {
    const result = new Function(...keys, `return !!(${expr})`)(...vals)
    log(`条件结果: ${result}`)
    return result
  } catch (e: any) {
    log(`条件执行异常: ${e.message}`, 'error')
    return false
  }
}

function resolveDeep(value: any, ctx: Record<string, any>): any {
  if (typeof value === 'string') return resolve(value, ctx)
  if (Array.isArray(value)) return value.map(v => resolveDeep(v, ctx))
  if (value && typeof value === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveDeep(v, ctx)
    }
    return out
  }
  return value
}

function localTS(): string {
  return new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function isPlaceholder(text: string): boolean {
  return !text || !text.trim()
}

// 执行体窗口字母：从 d 起无限顺延（d,e,f,...,z，超出后 d{n} 兜底）。开 10 窗第 10 个 = M。
function executorLetter(i: number): string {
  const pos = 3 + i // d 对应索引 0
  if (pos <= 25) return String.fromCharCode(97 + pos)
  return `d${i}`
}

// ═══════════════════════════════════════════════════
// Action 执行器
// ═══════════════════════════════════════════════════

async function execReadFile(step: EngineStep, ctx: Record<string, any>): Promise<any> {
  const relPath = resolve(step.input || '', ctx)
  if (relPath.includes('terminals/') && relPath.endsWith('conversations.json')) {
    const agentPart = relPath.split('terminals/')[1]?.split('/')[0]
    if (agentPart) {
      const entries = await api()?.storage?.get(agentPart) ?? []
      if (Array.isArray(entries) && entries.length > 0) {
        const round = ctx.CURRENT_ROUND
        if (typeof round === 'number' && round > 0) {
          const currentTag = `=== ${String(round).padStart(4, '0')} ===`
          const nextTag = `=== ${String(round + 1).padStart(4, '0')} ===`
          let startIdx = 0
          let endIdx = entries.length
          for (let i = 0; i < entries.length; i++) {
            if (entries[i].round === currentTag) startIdx = i + 1
            if (entries[i].round === nextTag) { endIdx = i; break }
          }
          return entries.slice(startIdx, endIdx).filter((e: any) => e.role !== 'separator')
        }
      }
      return entries
    }
  }
  if (relPath.startsWith("core/")) {
    const docId = relPath.replace('core/', '').replace('.md', '')
    const cacheKey = `${ctx.CURRENT_ROUND_PADDED || '0'}:${docId}`
    if (blueprintCache.has(cacheKey)) return blueprintCache.get(cacheKey)
    const content = await api()?.readBlueprint(docId) ?? step.fallback
    blueprintCache.set(cacheKey, content)
    return content
  }
  return await api()?.file?.readRaw(relPath) ?? step.fallback
}

/** 解析模型：不强制绑定供应商，取设置里第一个已配置 Key 的模型；无则返回空串 */
async function resolveFirstModel(): Promise<string> {
  try {
    const list: any[] = await api()?.ai?.availableModels?.() ?? []
    return list[0]?.id || ''
  } catch { return '' }
}

async function execLlmCall(step: EngineStep, ctx: Record<string, any>): Promise<string> {
  let modelId = resolve(step.model || '', ctx)
  if (!modelId) modelId = await resolveFirstModel()
  const agentName = step.sourceName || '中枢窗'
  useSyslogStore.getState().addLog({
    timestamp: Date.now(),
    category: 'API',
    sourceName: agentName,
    message: `[${agentName}] 调用 ${modelId}`,
  })
  const res = await api()?.ai?.chat({ modelId, stream: false, messages: [
    { role: 'system', content: resolve(step.system_prompt || '', ctx) },
    { role: 'user', content: resolve(step.user_prompt_template || '', ctx) },
  ]})
  return res?.content ?? ''
}

async function execParse(step: EngineStep, ctx: Record<string, any>): Promise<Record<string, string>> {
  const raw = String(ctx[step.input_key || ''] || '')
  const out: Record<string, string> = {}
  if (step.rules) {
    for (const [key, pattern] of Object.entries(step.rules)) {
      const m = raw.match(new RegExp(pattern.replace('match:', ''), 's'))
      out[key] = m ? m[1].trim() : ''
    }
    // fallback_raw：LLM 偶尔忘 XML 标签 → 用原始输出兜底，不丢 instruction
    if (step.fallback_raw) {
      for (const key of Object.keys(out)) {
        if (!out[key] || out[key].trim() === '') out[key] = raw
      }
    }
  }
  return out
}

async function execWriteFile(step: EngineStep, ctx: Record<string, any>): Promise<void> {
  const relPath = resolve(step.input || '', ctx)
  if (relPath.includes('terminals/') && relPath.endsWith('conversations.json')) {
    const agentPart = relPath.split('terminals/')[1]?.split('/')[0]
    if (agentPart) {
      const entry = typeof step.content === 'object'
        ? resolveDeep(step.content, ctx)
        : { timestamp: new Date().toISOString(), role: 'model' as const, content: resolve(String(step.content || ''), ctx) }
      if (ctx.ROUND_TAG) (entry as any).round = ctx.ROUND_TAG
      // F1-C：同一 terminal 文件并发 append 串行化（防 read-modify-write 丢条目）
      await withFileLock(`terminals/${agentPart}`, async () => {
        await api()?.storage?.append(agentPart, entry)
      })
      return
    }
  }
  if (relPath.startsWith('core/')) {
    const docId = relPath.replace('core/', '').replace('.md', '')
    let content = resolve(step.content_template || '', ctx)
    if (docId === 'steps') content = stripXml(content)
    if (step.core_append) {
      const existing = await api()?.readBlueprint?.(docId) || ''
      content = existing ? existing + '\n' + content : content
    }
    // F1-A：蓝图被改写（e05/e10），失效同轮缓存，下次读取重新加载
    blueprintCache.clear()
    await api()?.writeBlueprint(docId, content)
    return
  }
  if (step.append_array) {
    // F1-C：reviews.json / 各面板 是多个并发 e08 共享的，read-modify-write 必须串行
    await withFileLock(relPath, async () => {
      let arr: any[] = []
      const existing = await api()?.file?.readRaw(relPath)
      try { arr = JSON.parse(existing || '[]') } catch {}
      const entry = typeof step.content === 'object'
        ? resolveDeep(step.content, ctx)
        : resolve(String(step.content || ''), ctx)
      arr.push(entry)
      await api()?.file?.writeRaw(relPath, JSON.stringify(arr, null, 2))
    })
  } else {
    const content = typeof step.content === 'object'
      ? JSON.stringify(resolveDeep(step.content, ctx), null, 2)
      : resolve(step.content_template || '', ctx)
    await api()?.file?.writeRaw(relPath, content)
  }
}

async function execRenameProject(step: EngineStep, ctx: Record<string, any>): Promise<void> {
  const projectId = step.project_id ? resolve(step.project_id, ctx) : await api()?.project?.info?.().then((info: any) => info?.id) ?? ''
  const newName = resolve(step.new_name || '', ctx)
  if (!projectId || !newName) {
    log(`rename_project: 缺少 projectId 或 newName`, 'error')
    return
  }
  await api()?.project?.rename?.(projectId, newName)
  useAppStore.getState().renameTask(projectId, newName)
  log(`项目已重命名: ${projectId} -> ${newName}`)
}

function execSyslog(step: EngineStep, ctx: Record<string, any>) {
  (step.entries || []).forEach((e: any) => {
    useSyslogStore.getState().addLog({
      timestamp: Date.now(),
      category: e.category || 'Agent',
      sourceName: resolve(e.sourceName || '', ctx),
      message: resolve(e.message || '', ctx),
    })
  })
}

// ═══════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════

export async function runEngine(code: string, receiverAgentId: string, triggerEvent?: string) {
  const enginePath = `engines/${code}.json`
  const engineRaw = await api()?.file?.readRaw(enginePath)
  if (!engineRaw) {
    log(`引擎文件不存在: ${enginePath}`, 'error')
    return
  }

  let script: EngineScript
  try {
    script = JSON.parse(engineRaw)
  } catch (e: any) {
    log(`引擎 JSON 解析失败: ${code}.json — ${e.message}`, 'error')
    return
  }

  if (script.receiver !== receiverAgentId) {
    log(`跳过: ${code} 的接收方是 ${script.receiver}，当前是 ${receiverAgentId}`)
    return
  }

  const codeHead = code.replace(/^.*\//, '').charAt(0).toUpperCase()
  engineSourceName = ENGINE_SENDER_MAP[codeHead] ?? null

  log(`开始执行引擎 ${code}，共 ${script.steps.length} 步`)

  const ctx: Record<string, any> = {
    CURRENT_MODEL: '',
    TIMESTAMP: localTS(),
    NOW: new Date().toISOString(),
    CURRENT_ROUND: useAppStore.getState().currentRound,
    CURRENT_ROUND_PADDED: String(useAppStore.getState().currentRound).padStart(4, '0'),
    CURRENT_ROUND_2DIGIT: String(useAppStore.getState().currentRound).padStart(2, '0'),
    // 引擎级注入 IS_FIRST：第 1 轮为 'true'，其余轮次为 'false'。
    // 防止 E07/E02/E03 等不读 current_goals 的引擎在条件里引用 {{IS_FIRST}} 时
    // 因变量未定义而静默跳过（导致第二轮目标未变化分支死锁）。
    IS_FIRST: useAppStore.getState().currentRound === 1 ? 'true' : 'false',
  }

  if (triggerEvent) {
    ctx.TRIGGER_EVENT = triggerEvent
    // 送审信标：{执行体}{轮}-v{调度版次}-{送审迭代}（v 小写；执行体从 D 起顺延故用 [A-Z] 支持多窗口）
    const vm = triggerEvent.match(/^([A-Z])\d{4}-v(\d{2})-(\d{2})$/)
    if (vm) {
      ctx.TRIGGER_EXECUTOR = vm[1]
      ctx.TRIGGER_EXECUTOR_LOWER = vm[1].toLowerCase()
      ctx.TRIGGER_VERSION = vm[2]
      ctx.TRIGGER_ITERATION = vm[3]
      ctx.TRIGGER_ROUND = triggerEvent.slice(1, 5)
      // 任务槽：找当前由谁填充该提交所属槽（重分配后 filledBy 可能≠提交执行体），审查按槽的调度文件
      const _st = roundSlots[ctx.TRIGGER_ROUND]
      const _entry = _st ? Object.entries(_st.slots).find(([, s]: any) => s.filledBy === vm[1]) : null
      const _slot = _entry ? _entry[1] : null
      ctx.REVIEW_SLOT = ((_entry ? _entry[0] : vm[1])).toUpperCase()
      if (_st) _st.lastActivity = Date.now()
      // F1-B：上一送审迭代（用于读取上次驳回文件做复审聚焦）；首次送审为 '00'（无上次驳回）
      const iterNum = parseInt(vm[3], 10)
      ctx.TRIGGER_PREV_ITERATION = String(Math.max(0, iterNum - 1)).padStart(2, '0')
    }
    // B/C 家族信标（e10 调度触发）：B{nnnn}-s{mmmm}-00 / C{nnnn}-s{mmmm}-00
    // nnnn=轮次, mmmm=本轮调度的组号 → 注入供 e10 定位 runtime/steps 下的具体组文件
    const bm = triggerEvent.match(/^([BC])(\d{4})-s(\d{4})-00$/)
    if (bm) {
      ctx.TRIGGER_TYPE = bm[1]                       // 'b' 或 'c'
      ctx.TRIGGER_ROUND = bm[2]
      ctx.TRIGGER_STEP = bm[3]
      // 首轮是初始开发步骤，不存在「对齐已变化」；非首轮才按 b/c 区分是否变化
      if (ctx.IS_FIRST === 'true') {
        ctx.ALIGNMENT_NOTE = '首轮初始开发步骤'
      } else {
        ctx.ALIGNMENT_NOTE = bm[1] === 'C'
          ? '目标对齐未变化'
          : '目标对齐已变化（最新开发步骤）'
      }
      log(`解析 b/c 信标: 类型=${bm[1]} 轮次=${bm[2]} 组号=${bm[3]}`)
    }
    // rc 送审信标：{执行体}{轮}-rc{版}-{迭}（窗口历史纠查送审，e09 复核）→ reconcile 模式
    const rcm = triggerEvent.match(/^([A-Z])(\d{4})-rc(\d{2})-(\d{2})$/)
    if (rcm) {
      ctx.TRIGGER_EXECUTOR = rcm[1]
      ctx.TRIGGER_EXECUTOR_LOWER = rcm[1].toLowerCase()
      ctx.TRIGGER_ROUND = rcm[2]
      ctx.TRIGGER_RECONCILE_VERSION = rcm[3]
      ctx.TRIGGER_RECONCILE_ITERATION = rcm[4]
      ctx.TRIGGER_MODE = 'reconcile'
      log(`解析 rc 信标: 执行体=${rcm[1]} 轮次=${rcm[2]} 版=${rcm[3]} 迭=${rcm[4]}`)
    }
  }

  // 链式调起（chain_engine，无信标）→ init 模式：显式置 TRIGGER_MODE='init'，
  // 否则 evalCond 中 {{TRIGGER_MODE}} 未声明会 ReferenceError → 所有 init 步骤被误判跳过。
  if (!triggerEvent) ctx.TRIGGER_MODE = 'init'

  for (const step of script.steps) {
    if (useAppStore.getState().runnerState === 'STOPPED') {
      const remain = script.steps.length - script.steps.indexOf(step)
      log(`引擎 ${code} 被用户终止（STP广播），跳过剩余 ${remain} 步。已执行步骤保留。`)
      return
    }
    log(`${step.id} (${step.action}) ${step.desc}`)

    if (step.condition && !evalCond(step.condition, ctx)) {
      log(`${step.id} 条件跳过`)
      continue
    }

    const ok = await executeStep(step, ctx, code, receiverAgentId)
    if (!ok) return
  }

  log(`引擎 ${code} 全部执行完毕`)
}

// ═══════════════════════════════════════════════════
// 步骤执行器（从 runEngine 提取，支持 foreach 子步骤递归调用）
// 返回: true=继续下一步, false=终止引擎
// ═══════════════════════════════════════════════════

async function executeStep(
  step: EngineStep,
  ctx: Record<string, any>,
  code: string,
  receiverAgentId: string,
): Promise<boolean> {
  try {
    switch (step.action) {
      case 'read_file': {
        const val = await execReadFile(step, ctx)
        if (step.output_key) {
          ctx[step.output_key] = val
          if (step.output_key === 'conversations' && Array.isArray(val)) {
            ctx.USER_MESSAGES = val.filter((c: any) => c.role === 'user').map((c: any) => c.content).join('\n---\n')
            ctx.MODEL_MESSAGES = val.filter((c: any) => c.role === 'model').map((c: any) => c.content.slice(0, 500)).join('\n---\n')
            log(`派生变量: USER_MESSAGES=${ctx.USER_MESSAGES.length}chars, MODEL_MESSAGES=${ctx.MODEL_MESSAGES.length}chars`)
          }
          if (step.output_key === 'conversations_2000' && Array.isArray(val)) {
            ctx.CONVERSATIONS_RAW = val.map((c: any) => `[${c.role === 'user' ? '用户' : '模型'}] ${c.content}`).join('\n\n---\n\n')
            log(`派生变量: CONVERSATIONS_RAW=${ctx.CONVERSATIONS_RAW.length}chars`)
          }
          if (step.output_key === 'review_count') {
            try { const arr = JSON.parse(String(val || '[]')); ctx.REVIEW_ROUND = Array.isArray(arr) ? arr.length + 1 : 1 } catch { ctx.REVIEW_ROUND = 1 }
            log(`REVIEW_ROUND=${ctx.REVIEW_ROUND}`)
          }
          if (step.output_key === 'current_goals') {
            ctx.CURRENT_GOALS = val
            ctx.IS_FIRST = (isPlaceholder(String(val)) || useAppStore.getState().currentRound === 1) ? 'true' : 'false'
            const matches = String(val).match(/目标对齐/g)
            ctx.ROUND_NUMBER = matches ? matches.length + 1 : 1
            log(`IS_FIRST=${ctx.IS_FIRST} ROUND=${ctx.ROUND_NUMBER}`)
          }
        }
        break
      }
      case 'llm_call': {
        const val = await execLlmCall(step, ctx)
        if (step.output_key) ctx[step.output_key] = val
        console.log(`[Engine] LLM 原始输出(前200字): ${val.slice(0, 200)}...`)
        break
      }
      case 'parse': {
        const val = await execParse(step, ctx)
        if (step.output_key) ctx[step.output_key] = val
        for (const [k, v] of Object.entries(val)) {
          ctx[k.toUpperCase()] = v
        }
        if (val.goals_changed !== undefined) {
          ctx.GOALS_CHANGED = val.goals_changed === 'true' || ctx.IS_FIRST === 'true' ? 'true' : 'false'
        }
        if (val.clean_content !== undefined) ctx.CLEAN_CONTENT = val.clean_content || ''
        if (val.project_name !== undefined) ctx.PROJECT_NAME = val.project_name || ''
        if (val.file_list !== undefined) {
          ctx.FILE_LIST_COUNT = String(val.file_list || '').split('\n').filter((l: string) => l.trim()).length
        }
        log(`解析: ${Object.keys(val).join(', ')}`)
        break
      }
      case 'write_file': {
        const shouldWrite = ctx.IS_FIRST === 'true' || ctx.GOALS_CHANGED === 'true'
        if (!shouldWrite && step.condition && !evalCond(step.condition, ctx)) {
          log(`${step.id} 条件跳过`)
          return true
        }
        await execWriteFile(step, ctx)
        break
      }
      case 'rename_project': {
        await execRenameProject(step, ctx)
        break
      }
      case 'cut_append': {
        const raw = resolve(step.input || '', ctx)
        const newContent = resolve(step.content_template || '', ctx)
        const SEP = '\n\n---\n\n'
        if (raw.startsWith('core/')) {
          const docId = raw.replace('core/', '').replace('.md', '')
          const existing = await api()?.readBlueprint?.(docId) || ''
          const sepIdx = existing.lastIndexOf(SEP)
          const prefix = sepIdx !== -1 ? existing.substring(0, sepIdx) : existing
          await api()?.writeBlueprint(docId, prefix + SEP + newContent + '\n')
        } else {
          const existing = await api()?.file?.readRaw(raw) || ''
          const sepIdx = existing.lastIndexOf(SEP)
          const prefix = sepIdx !== -1 ? existing.substring(0, sepIdx) : existing
          await api()?.file?.writeRaw(raw, prefix + SEP + newContent + '\n')
        }
        log(`${step.id} 完成`)
        break
      }
      case 'syslog': {
        execSyslog(step, ctx)
        break
      }
      case 'broadcast': {
        const bc = resolve(step.code || '', ctx)
        const { bus } = await import('@shared/bus')
        bus.emit('agent:broadcast', {
          sourceId: receiverAgentId, sourceName: '中枢窗',
          eventType: bc, message: `引擎 ${code} → 广播 ${bc}`,
          category: '广播', timestamp: Date.now(),
        })
        log(`发送广播 ${bc}`)
        break
      }
      case 'chain_engine': {
        const nextCode = resolve(step.chain_code || '', ctx)
        log(`链式调用引擎: ${nextCode}`)
        await runEngine(nextCode, receiverAgentId)
        break
      }
      case 'user_confirm': {
        const confirmPath = resolve(step.confirm_file || 'runtime/panels/c/confirm.json', ctx)
        const timeoutMs = step.timeout_ms || 30000
        const promptMsg = resolve(step.message || '是否确认以上内容入库？', ctx)
        useAppStore.getState().setConfirmingEngine(code)
        await api()?.file?.writeRaw(confirmPath, JSON.stringify({ status: 'pending', message: promptMsg, expires_at: new Date(Date.now() + timeoutMs).toISOString() }, null, 2))
        log(`等待用户确认: ${promptMsg} (${timeoutMs}ms 超时)`)
        const result = await new Promise<'confirmed' | 'timeout' | 'intervention' | 'cancelled'>((resolve_promise) => {
          const startTime = Date.now()
          const poll = async () => {
            const raw = await api()?.file?.readRaw(confirmPath)
            let data: any = {}
            try { data = JSON.parse(raw || '{}') } catch {}
            if (data.status === 'confirmed') { resolve_promise('confirmed'); return }
            if (data.status === 'intervention') { resolve_promise('intervention'); return }
            if (data.status === 'cancelled') { resolve_promise('cancelled'); return }
            if (Date.now() - startTime > timeoutMs) { resolve_promise('timeout'); return }
            setTimeout(poll, 2000)
          }
          poll()
        })
        ctx.CONFIRM_RESULT = result
        if (result === 'cancelled') {
          log('用户对话取消 — 引擎终止')
          await api()?.file?.writeRaw(confirmPath, JSON.stringify({ status: 'cancelled', message: promptMsg }, null, 2))
          useAppStore.getState().setConfirmingEngine(null)
          return false
        }
        if (result === 'intervention') {
          ctx.INTERVENTION = 'true'
          log('用户干预 — 引擎将跳过后续写入步骤')
          await api()?.file?.writeRaw(confirmPath, JSON.stringify({ status: 'cleared' }, null, 2))
          useAppStore.getState().setConfirmingEngine(null)
          return false
        }
        log(`用户确认结果: ${result}`)
        await api()?.file?.writeRaw(confirmPath, JSON.stringify({ status: result === 'confirmed' ? 'confirmed' : 'timeout', message: promptMsg }, null, 2))
        useAppStore.getState().setConfirmingEngine(null)
        break
      }
      case 'scaffold': {
        const fileList = (ctx.FILE_LIST || '').split('\n').map((f: string) => f.trim()).filter(Boolean)
        log(`开始在 workspace/ 创建 ${fileList.length} 个文件`)
        for (const relPath of fileList) {
          try { await api()?.file?.write(relPath, ''); log(`  创建: ${relPath}`) }
          catch (e: any) { log(`${relPath} 创建失败: ${e.message}`, 'error') }
        }
        break
      }
      case 'check_convergence': {
        const cvRound = ctx.CURRENT_ROUND_PADDED
        // 任务槽收敛：放弃某窗口→该槽标记 abandoned（分母已减），只看非 abandoned 槽是否全 delivered。
        // 与「记功/谁写」解耦：301 只认 S 组整体完成度，不在意具体哪个窗口写的。
        const st = roundSlots[cvRound]
        if (st && st.slots) {
          const vals: any[] = Object.values(st.slots)
          const active = vals.filter((s: any) => s.status !== 'abandoned')
          const delivered = active.filter((s: any) => s.status === 'delivered')
          ctx.EXPECTED_COUNT = String(active.length)
          ctx.PASS_COUNT = String(delivered.length)
          ctx.ALL_PASSED = active.length > 0 && delivered.length === active.length ? 'true' : 'false'
        } else {
          // 兜底口径（无槽记录时，按旧 dispatchCount + reviews.json pass 计数）
          await withFileLock('runtime/panels/c/reviews.json', async () => {
            let cvReviews: any[] = []
            try { const cvRaw = await api()?.file?.readRaw('runtime/panels/c/reviews.json'); cvReviews = JSON.parse(cvRaw || '[]') } catch {}
            let cvDispatchCount = 1
            try { const cvMeta = JSON.parse(ctx.META_RAW || '{}'); cvDispatchCount = cvMeta.dispatchCount || 1 } catch {}
            const cvLatest: Record<string, string> = {}
            for (const r of cvReviews) { if (r.round === cvRound && r.executor) cvLatest[String(r.executor).toLowerCase()] = r.status }
            const cvPassCount = Object.values(cvLatest).filter(s => s === 'pass').length
            ctx.PASS_COUNT = String(cvPassCount)
            ctx.EXPECTED_COUNT = String(cvDispatchCount)
            ctx.ALL_PASSED = cvPassCount >= cvDispatchCount ? 'true' : 'false'
          })
        }
        // 本次审查通过 → 把对应任务槽标记 delivered（销账，与谁写无关）
        if (ctx.PASSED === 'true' && st && st.slots) {
          const slotKey = String(ctx.REVIEW_SLOT || ctx.TRIGGER_EXECUTOR || '')
          const slot: any = st.slots[slotKey]
          if (slot && slot.status !== 'abandoned') {
            slot.status = 'delivered'
            // reassign 闭环（修复卡死）：本窗可能接手了别的槽（filledBy===本窗），
            // 一并销账，否则「D 接手 F 后只销 D 槽、F 槽永远 pending → 收敛卡在 2/3、OFF 永不发」。
            for (const k of Object.keys(st.slots)) {
              if (k !== slotKey && st.slots[k].filledBy === slotKey && st.slots[k].status !== 'abandoned') {
                st.slots[k].status = 'delivered'
              }
            }
            st.lastActivity = Date.now()
            await persistSlots(cvRound)
            // slot 销账后重新评估收敛
            const vals: any[] = Object.values(st.slots)
            const active = vals.filter((s: any) => s.status !== 'abandoned')
            const delivered = active.filter((s: any) => s.status === 'delivered')
            ctx.EXPECTED_COUNT = String(active.length)
            ctx.PASS_COUNT = String(delivered.length)
            ctx.ALL_PASSED = active.length > 0 && delivered.length === active.length ? 'true' : 'false'
          }
        }
        // 审查通过且检测到额外文件 → 标记架构脏（用于收敛后触发架构更新，而非事后盲扫磁盘）
        if (ctx.PASSED === 'true' && ctx.DETAILS && /已标记.*额外文件/.test(ctx.DETAILS)) {
          try {
            const dirtyWindow = String(ctx.REVIEW_SLOT || ctx.TRIGGER_EXECUTOR || '')
            await api()?.file?.writeRaw(`runtime/arch-dirty/${cvRound}.json`,
              JSON.stringify({ round: cvRound, dirty: true, window: dirtyWindow, timestamp: Date.now() }))
          } catch {}
        }
        // E08 架构树巡检：全部通过时，先查审查阶段是否已标记额外文件（而非盲扫磁盘）
        // 存在脏标记 → 架构必然变了 → 调 auditAndOverwriteArchTree 合并 + 发 C{round}-00
        // 无标记 → 架构干净 → 跳过扫描 → 直接走 OFF
        if (ctx.ALL_PASSED === 'true' && !archAuditRounds.has(cvRound)) {
          let archDirty = false
          try {
            const dirtyRaw = await api()?.file?.readRaw(`runtime/arch-dirty/${cvRound}.json`)
            archDirty = !!dirtyRaw && dirtyRaw.trim() !== '' && dirtyRaw.trim() !== '{}'
          } catch {}
          if (archDirty) {
            const result = await auditAndOverwriteArchTree(cvRound)
            ctx.ARCH_MERGED = result?.merged ? 'true' : 'false'
          } else {
            ctx.ARCH_MERGED = 'false'
          }
        }
        // F1-C：同一轮全通过后只下发一次 OFF，防并发/重复下发导致 e06 重跑
        if (ctx.ALL_PASSED === 'true' && !completedRounds.has(cvRound)) {
          completedRounds.add(cvRound)
          ctx.OFF_ALLOWED = 'true'
        } else {
          ctx.OFF_ALLOWED = 'false'
        }
        log(`收敛检查(槽): ${ctx.PASS_COUNT}/${ctx.EXPECTED_COUNT} 已交付 → ALL_PASSED=${ctx.ALL_PASSED} OFF_ALLOWED=${ctx.OFF_ALLOWED}`)
        break
      }
      case 'check_reconcile': {
        // 历史纠查收敛：统计本论「历史纠查」已通过窗口数（reviews.json 用 R{轮} 前缀与当前送审区分），
        // 全通过且纠查标记尚未置 historicalDone 时，标记并允许发 OFF（同轮仅一次，防并发/重发重复 OFF）。
        const rcRound = ctx.TRIGGER_ROUND || ctx.CURRENT_ROUND_PADDED || ''
        const markPath = `runtime/reconcile/${rcRound}.json`
        let kWindows = 1
        let historicalDone = 'false'
        try {
          const markRaw = await api()?.file?.readRaw(markPath)
          const mark = JSON.parse(markRaw || '{}')
          kWindows = Math.max(1, mark.kWindows || mark.dispatchCount || 1)
          historicalDone = mark.historicalDone === true ? 'true' : 'false'
        } catch {}
        const reviewsPath = 'runtime/panels/c/reviews.json'
        await withFileLock(reviewsPath, async () => {
          let revs: any[] = []
          try { const raw = await api()?.file?.readRaw(reviewsPath); revs = JSON.parse(raw || '[]') } catch {}
          const revRound = `R${rcRound}`
          const latest: Record<string, string> = {}
          for (const r of revs) { if (r.round === revRound && r.executor) latest[String(r.executor).toLowerCase()] = r.status }
          const passCount = Object.values(latest).filter(s => s === 'pass').length
          ctx.RECONCILE_PASS_COUNT = String(passCount)
          ctx.RECONCILE_EXPECTED = String(kWindows)
          ctx.ALL_PASSED_RECONCILE = passCount >= kWindows ? 'true' : 'false'
          if (passCount >= kWindows && historicalDone !== 'true') {
            historicalDone = 'true'
            try {
              const markRaw2 = await api()?.file?.readRaw(markPath)
              const mark2 = JSON.parse(markRaw2 || '{}')
              mark2.historicalDone = true
              await api()?.file?.writeRaw(markPath, JSON.stringify(mark2, null, 2))
            } catch {}
            ctx.OFF_READY = 'true'
          } else {
            ctx.OFF_READY = 'false'
          }
        })
        log(`纠查收敛: ${ctx.RECONCILE_PASS_COUNT}/${ctx.RECONCILE_EXPECTED} → ALL_PASSED_RECONCILE=${ctx.ALL_PASSED_RECONCILE} OFF_READY=${ctx.OFF_READY}`)
        break
      }
      case 'list_workspace': {
      // 列出 workspace 全部文件（供 E09 漂移检测与架构一致性核对）
      try {
        const diskTree: any[] = (await api()?.file?.listWorkspace()) ?? []
        const files = flattenWorkspace(diskTree).map(f => `workspace/${f}`)
        ctx.WORKSPACE_FILES = files.join('\n')
        ctx.WORKSPACE_FILE_COUNT = String(files.length)
        log(`list_workspace: 共 ${files.length} 个文件`)
      } catch (e: any) {
        ctx.WORKSPACE_FILES = ''
        ctx.WORKSPACE_FILE_COUNT = '0'
        log(`list_workspace 失败: ${e.message}`, 'error')
      }
      break
    }
    case 'prepare_dispatch': {
        // STEPS 已由 resolve_steps 解析为「单个组」的内容（按触发信标 s 段定位的最新快照），
        // 不再从 core/steps.md 全文正则抠组（旧逻辑已废弃）。
        // 本步骤只负责：提取文件清单 + 读取已开执行体窗口数；具体怎么分区交给大模型（apply_partition）。
        const stepContent = String(ctx[step.input_key || 'STEPS'] || '')
        const stepNo = ctx.TRIGGER_STEP || resolve(step.round || '{{CURRENT_ROUND_PADDED}}', ctx)
        const stepCode = `s${stepNo}`
        const filePaths = [...new Set((stepContent.match(/workspace\/[^\s)\],\n:]+/g) || []).map((p: string) => p.replace(/[,:;]+$/, '')))]
        let opened = 1
        try { const execRaw = await api()?.file?.readRaw('runtime/executors.json'); const execData = JSON.parse(execRaw || '{}'); opened = Math.max(1, execData.count || 1) } catch {}
        ctx.STEP_CONTENT = stepContent
        ctx.STEP_CODE = stepCode
        ctx.FILE_PATHS = filePaths
        ctx.FILE_PATHS_JOINED = filePaths.join('\n')
        ctx.OPENED_WINDOWS = String(opened)
        ctx.TOTAL_FILES = String(filePaths.length)
        // 容量决策：单窗最多处理 DISPATCH_CAP 个文件；实际派发窗口数 = min(已开窗口, ceil(文件数/CAP))，且至少 1 个。
        // 开了 N 窗 ≠ 必须派 N 窗：文件少则 1 窗搞定，文件多才拆分；拆几份只跟业务量挂钩，不跟开了几窗挂钩。
        const DISPATCH_CAP = 10
        const targetCount = Math.max(1, Math.min(opened, Math.ceil(filePaths.length / DISPATCH_CAP)))
        ctx.TARGET_WINDOW_COUNT = String(targetCount)
        log(`准备调度: ${filePaths.length} 文件 / 已开 ${opened} 窗 / 实际派发 ${targetCount} 窗(CAP=${DISPATCH_CAP}) [组 ${stepCode}]`)
        break
      }
      case 'split_steps': {
        const plan = String(ctx[step.input_key || 'FULL_PLAN'] || '')
        // REGEN 模式下用触发轮次而非全局轮次，防止 off 推进全局轮次后错写 d{新轮次}/
        const isRegen = ctx.REGEN_MODE === 'E08' || ctx.REGEN_MODE === 'E09'
        const round = isRegen ? (ctx.TRIGGER_ROUND || resolve(step.round || '{{CURRENT_ROUND_PADDED}}', ctx)) : resolve(step.round || '{{CURRENT_ROUND_PADDED}}', ctx)
        const baseDir = `runtime/steps/d${round}`
        // 按 [sNNNN] 将开发步骤各组拆分为独立 JSON 文件
        const groupRe = /###\s*第\d+组\s*\[([sS]\d{4})\]([\s\S]*?)(?=\n###\s*第\d+组\s*\[[sS]\d{4}\]|$)/gi
        let m: RegExpExecArray | null
        let count = 0
        while ((m = groupRe.exec(plan)) !== null) {
          const gid = m[1].toLowerCase()
          const content = m[2].trim()
          const filePath = `${baseDir}/${gid}.json`
          const obj = { group: gid, round, content }
          try {
            await api()?.file?.writeRaw(filePath, JSON.stringify(obj, null, 2))
            count++
            log(`  拆分写出: ${filePath}`)
          } catch (e: any) {
            log(`  拆分写出失败 ${filePath}: ${e.message}`, 'error')
          }
        }
        ctx.SPLIT_GROUP_COUNT = String(count)
        // 写最新步骤目录标记：resolve_steps 据此精确定位，不用试探不存在的目录
        try { await api()?.file?.writeRaw('runtime/steps/.latest.json', JSON.stringify({ dir: `d${round}`, round })) } catch {}
        log(`split_steps 完成: ${count} 组 → ${baseDir}/`)
        break
      }
      case 'resolve_steps': {
        // 读 E05 留下的目录标记，精确定位步骤文件所在目录，不盲猜、不试探。
        const stepNo = ctx.TRIGGER_STEP || resolve(step.round || '{{CURRENT_ROUND_PADDED}}', ctx)
        let dir = 'd0001'
        try {
          const marker = await api()?.file?.readRaw('runtime/steps/.latest.json')
          if (marker && marker.trim() !== '') {
            const m = JSON.parse(marker.trim())
            if (m.dir) dir = m.dir
          }
        } catch {}
        const stepFile = `runtime/steps/${dir}/s${stepNo}.json`
        try {
          const raw = await api()?.file?.readRaw(stepFile)
          if (!raw || raw.trim() === '') throw new Error('EMPTY')
          let obj: any = {}
          try { obj = JSON.parse(raw) } catch {}
          ctx.STEPS = obj.content || raw
          ctx.STEP_ROUND = String(obj.round ?? dir.replace('d', ''))
          ctx.STEP_GROUP = String(obj.group ?? `s${stepNo}`)
          log(`resolve_steps: ${dir}/s${stepNo}.json (组 ${ctx.STEP_GROUP}, ${ctx.STEP_ROUND} 轮生成)`)
        } catch (e: any) {
          log(`resolve_steps: ${dir}/s${stepNo}.json 未找到`, 'error')
          ctx.STEPS = ''
        }
        break
      }
      case 'foreach_executor': {
        const executors: string[] = ctx[step.executors_key || 'EXECUTORS'] || []
        const fileSplits: string[][] = ctx[step.splits_key || 'FILE_SPLITS'] || []
        const stepContent: string = ctx.STEP_CONTENT || ''
        for (let i = 0; i < executors.length; i++) {
          if (useAppStore.getState().runnerState === 'STOPPED') break
          const executor = executors[i]
          const fileSubset = fileSplits[i] || []
          ctx.CURRENT_EXECUTOR = executor.toUpperCase()
          ctx.CURRENT_EXECUTOR_LOWER = executor
          ctx.CURRENT_DISPATCH_COUNT = '01'  // 首次调度版次永远 01；人工微调重调度时递增
          ctx.CURRENT_FILE_COUNT = String(fileSubset.length)
          ctx.CURRENT_FILE_SUBSET = fileSubset.join('\n')
          if (fileSubset.length > 0 && executors.length > 1) {
            ctx.CURRENT_STEP_CONTENT = stepContent.replace(
              /(\*\*包含文件\*\*[:：]\s*\n)((?:.*\n)*?)(?=\*\*|$)/,
              (_: string, header: string) => header + fileSubset.map(f => `- ${f}`).join('\n') + '\n'
            )
          } else {
            ctx.CURRENT_STEP_CONTENT = stepContent
          }
          log(`foreach 执行体 ${executor.toUpperCase()} (${i + 1}/${executors.length})`)
          for (const subStep of (step.steps || [])) {
            if (useAppStore.getState().runnerState === 'STOPPED') break
            log(`  ${subStep.id} (${subStep.action}) ${subStep.desc || ''}`)
            if (subStep.condition && !evalCond(subStep.condition, ctx)) { log(`  ${subStep.id} 条件跳过`); continue }
            const ok = await executeStep(subStep, ctx, code, receiverAgentId)
            if (!ok) return false
          }
        }
        break
      }
      case 'apply_partition': {
        // 大模型决策的分区（e10 的 partition_decision 步骤产出 ctx.PARTITION_RAW）。
        // 格式：{ "d": [文件...], "e": [文件...], ... }，须覆盖全部文件且不重复。
        // 本步骤负责校验 + 规范化（窗口一律从 d 起顺序赋字母，杜绝缺口/重复）+ 兜底取模。
        const filePaths: string[] = ctx.FILE_PATHS || []
        const opened = Math.max(1, parseInt(String(ctx.OPENED_WINDOWS || '1'), 10) || 1)
        const targetCountRaw = parseInt(String(ctx.TARGET_WINDOW_COUNT || ''), 10)
        const targetCount = targetCountRaw > 0 ? targetCountRaw : Math.max(1, Math.min(opened, filePaths.length))
        const raw = String(ctx.PARTITION_RAW || '')
        let groups: string[][] = []
        let usedModel = false
        try {
          const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const keys = Object.keys(parsed).map(k => k.toLowerCase()).sort()
            const vals = keys.map(k => (Array.isArray(parsed[k]) ? parsed[k].map(String) : []))
            const flat = vals.flat()
            const sameSet =
              flat.length === filePaths.length &&
              new Set(flat).size === new Set(filePaths).size &&
              flat.every((f: string) => filePaths.includes(f))
            if (sameSet && vals.length > 0) {
              groups = vals
              usedModel = true
            }
          }
        } catch (e: any) {
          log(`apply_partition: 模型分区解析失败，回退取模 → ${e.message}`, 'error')
        }
        if (!usedModel) {
          // 兜底：取模不相交分区，执行体数 = TARGET_WINDOW_COUNT（容量决策），杜绝 0 文件执行体
          const n = Math.max(1, Math.min(opened, targetCount))
          groups = Array.from({ length: n }, (_, i) => filePaths.filter((_, idx) => idx % n === i))
          log(`apply_partition: 兜底取模分区 → ${n} 个执行体（TARGET=${targetCount}）`)
        } else if (groups.length !== targetCount) {
          // 模型分区组数 ≠ TARGET → 强制按 TARGET 确定性切分（防止 LLM 过度/不足拆分）
          usedModel = false
          const n = Math.max(1, Math.min(opened, targetCount))
          groups = Array.from({ length: n }, (_, i) => filePaths.filter((_, idx) => idx % n === i))
          log(`apply_partition: 模型组数 ${groups.length} ≠ TARGET ${targetCount} → 强制确定性切分 ${n} 窗`)
        }
        const executors = groups.map((_, i) => executorLetter(i))
        ctx.EXECUTORS = executors
        ctx.EXECUTORS_JSON = JSON.stringify(executors)
        ctx.FILE_SPLITS = groups
        ctx.DISPATCH_COUNT = String(executors.length)
        ctx.TOTAL_FILES = String(filePaths.length)
        log(`apply_partition: 实际调度 ${executors.length} 个窗口 (${executors.join(', ')})，覆盖 ${filePaths.length} 文件（模型决策=${usedModel}）`)
        break
      }
      case 'validate_dispatch': {
        // 下发前交叉验证（发信标之前的最后一道判断）：
        // 以架构树 D03 为标尺，检查每张调度工单里的 workspace/ 路径顶层目录是否在架构树中；
        // 若发现「私建层」（顶层目录不在树、但第二层是合法根），则剥离该层、修正工单路径，
        // 使执行窗写到正确位置。修正覆盖：dispatch 工单（执行窗权威来源）+ 执行体终端 + 201 终端/面板（显示一致）。
        const round = ctx.CURRENT_ROUND_PADDED || ctx.ROUND || ''
        const stepNo = ctx.TRIGGER_STEP || ''
        const executors: string[] = ctx.EXECUTORS || []
        const archRaw = String(ctx.ARCHITECTURE || '')
        // 抽架构树已知顶层目录集（排除 Goleynx 系统目录 workspace/core/runtime）
        const knownTopDirs = new Set(
          (archRaw.match(/[A-Za-z0-9_-]+\//g) || [])
            .map((s: string) => s.replace(/\/$/, ''))
            .filter((d: string) => d && !['workspace', 'core', 'runtime'].includes(d))
        )
        // 把修正后的 instruction 同步进某个 JSON 数组文件（终端/面板）里包含旧指令的所有字符串字段
        async function fixInstructionInFile(apiRef: any, filePath: string, oldInstr: string, newInstr: string): Promise<void> {
          try {
            const raw = await apiRef?.file?.readRaw(filePath)
            if (!raw) return
            let arr: any[]
            try { arr = JSON.parse(raw) } catch { return }
            if (!Array.isArray(arr)) return
            let changed = false
            for (const item of arr) {
              for (const k of Object.keys(item)) {
                if (typeof item[k] === 'string' && item[k].includes(oldInstr)) {
                  item[k] = item[k].split(oldInstr).join(newInstr)
                  changed = true
                }
              }
            }
            if (changed) await apiRef?.file?.writeRaw(filePath, JSON.stringify(arr, null, 2))
          } catch {}
        }
        let fixedCount = 0
        if (knownTopDirs.size > 0) {
          for (const ex of executors) {
            const dispatchPath = `runtime/dispatch/B${round}-s${stepNo}-${ex.toUpperCase()}.json`
            try {
              const raw = await api()?.file?.readRaw(dispatchPath)
              if (!raw) continue
              const d = JSON.parse(raw)
              const instr: string = d.instruction || ''
              const paths = [...new Set((instr.match(/workspace\/[A-Za-z0-9_.\-\/()（）]+?\.[a-zA-Z]+/g) || []) as string[])].map((p: string) => p.replace(/[\x60"'）)）\s]+$/, ''))
              let corrected = instr
              const suspicious: string[] = []
              for (const p of paths) {
                const segs = p.replace(/^workspace\//, '').split('/').filter(Boolean)
                const top = segs[0]
                if (top && !knownTopDirs.has(top)) {
                  if (segs.length > 1 && knownTopDirs.has(segs[1])) {
                    // 第二层是合法根 → 第一层是私建层，剥离之
                    corrected = corrected.split(p).join('workspace/' + segs.slice(1).join('/'))
                  } else {
                    suspicious.push(p)
                  }
                }
              }
              if (corrected !== instr) {
                d.instruction = corrected
                await api()?.file?.writeRaw(dispatchPath, JSON.stringify(d, null, 2))
                await fixInstructionInFile(api(), `runtime/terminals/${ex}/conversations.json`, instr, corrected)
                await fixInstructionInFile(api(), `runtime/terminals/b/conversations.json`, instr, corrected)
                await fixInstructionInFile(api(), `runtime/panels/b/statuses.json`, instr, corrected)
                fixedCount++
                log(`validate_dispatch: ${dispatchPath} 修正私建层路径`)
              } else if (suspicious.length > 0) {
                log(`validate_dispatch: ${dispatchPath} 发现无法安全修正的可疑路径 ${suspicious.join(', ')}（交由 301 审查）`, 'info')
              }
            } catch (e: any) {
              log(`validate_dispatch: 处理 ${dispatchPath} 失败 → ${e.message}`, 'error')
            }
          }
        } else {
          log('validate_dispatch: 架构树未解析出已知目录，跳过路径校验（防误伤）', 'info')
        }
        ctx.VALIDATE_FIXED = String(fixedCount)
        log(`validate_dispatch: 交叉验证完成，修正 ${fixedCount} 张工单`)
        break
      }
      case 'broadcast_all': {
        // 阶段二：所有工单已写本地后，一次性把全部调度信标发出（bus.emit 同步，实质并发唤醒各窗口）
        const { bus } = await import('@shared/bus')
        const executors: string[] = ctx.EXECUTORS || []
        const round = ctx.CURRENT_ROUND_PADDED || ''
        const stepNo = ctx.TRIGGER_STEP || ''
        for (const ex of executors) {
          if (useAppStore.getState().runnerState === 'STOPPED') break
          const bc = `B${round}-s${stepNo}-01-${ex.toUpperCase()}`
          bus.emit('agent:broadcast', {
            sourceId: receiverAgentId, sourceName: '中枢窗',
            eventType: bc, message: `引擎 ${code} → 广播 ${bc}`,
            category: '广播', timestamp: Date.now(),
          })
          log(`发送广播 ${bc}`)
        }
        break
      }
      default: {
        log(`${step.id} 未知 action: ${step.action}`, 'error')
      }
    }
  } catch (e: any) {
    log(`${step.id} 失败: ${e.message}`, 'error')
    return false
  }
  log(`${step.id} 完成`)
  return true
}
