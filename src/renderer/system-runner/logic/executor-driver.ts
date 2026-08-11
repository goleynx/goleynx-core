/**
 * @file 401 执行驱动器
 * @module system-runner/logic/executor-driver
 *
 * 职责：
 * 1. 监听 B{轮次}-s{组}-{版次}-{执行体} 广播 → 401 首次执行
 * 2. 监听 C{轮次}-r{版次}-{序号}-{执行体} 广播 → 审查不通过 → 读 reject 文件 → 自动重写 → 再送审
 * 3. 读 d05-instruction.json（调度指令 = 核心任务）
 * 4. 读 d05-review.md（审查不通过时，301 写回的重写指令）
 * 5. 调 LLM 生成/重写代码
 * 6. 解析代码 → 写入 workspace/
 * 7. 401 终端记录执行结果（首次执行 + 打回重写）
 * 8. 发 {执行体}{轮次}-v{调度版次}-{送审迭代} 广播请求 301 审查（v 跟随调度信标 seq；迭代 01→05，06 熔断）
 */

import { bus } from '@shared/bus'
import { useSyslogStore } from '@stores/syslog-store'

let initialized = false

/** 记录 (轮次-执行体) → 本次调度的组号(step)，供驳回重写时回查同一份调度工单 */
const dispatchStepMap: Record<string, string> = {}

/** 获取当前步骤的调度指令文件路径（s 段用组号 step，而非轮次 round） */
function getInstructionPath(round: string, step: string, executor: string = 'D', dispatchSeq: string = '01'): string {
  const group = step || round
  return `runtime/dispatch/B${round}-s${group}-${dispatchSeq}-${executor}.json`
}

/** 获取当前步骤的驳回指令文件路径（version 取自驳回信标 r 段，rejectCount 取自迭代段，保证每次打回都是新文件） */
function getRejectPath(round: string, version: string, rejectCount: string, executor: string = 'D'): string {
  return `runtime/reject/C${round}-r${version}-${rejectCount}-${executor}.json`
}

const SYSTEM_PROMPT = `你是 Goleynx 顶级代码工程师（401 执行窗）。

你的核心任务：严格按照调度指令写代码。

本地文件说明：
1. goals.md（目标对齐）— 每次核心对话目标都会在这里更新。你参考它是为了保持在代码撰写过程中始终和目标对齐。
2. architecture.md（架构树）— 架构树已经写好了，你在写代码过程中可以参考文件结构和依赖关系。
3. steps.md（开发步骤）— 开发步骤已将所有步骤全部撰写出来，但当前你的任务仅仅是当前轮次的调度指令。你即使阅读它们，也只能是参考。
4. review-rules.md（审查规则）— 301 审查窗的判决标准。你参考它是为了避免代码被打回。
5. 调度指令 — 这是你的核心任务，必须严格执行。

执行规则：
1. 本地文件如果不存在，直接创建
2. 如果已有空文件（scaffold 创建的），直接往里写代码
3. 代码必须完整、可运行、无占位符
4. 严格按照调度指令的文件列表写代码，不要多写也不要少写

输出格式（严格遵守）：
**文件**: workspace/<相对路径>
\`\`\`tsx
完整代码
\`\`\`

逐文件输出，直到调度指令中所有文件都写完。`

const SYSTEM_PROMPT_REJECT = `你是 Goleynx 代码工程师（401 执行窗）。

你的代码被 301 审查窗打回了。现在是第 N 次重写（N 越大越严格）。

## 硬性红线（违反任何一条直接再次驳回）

1. 【文件清单锁死】你只能修改审查意见中「reject_files」列出的文件，且路径必须与 reject_files 完全一致。不得新建任何文件、不得改变目录层级、不得创建新的子目录。

2. 【禁止扩展】严禁创建 reject_files 清单之外的任何文件（包括 types.ts、utils.ts、hooks、providers、helpers 等）。所有逻辑必须写在 reject_files 已有的文件内。

3. 【逐条修复】按照审查意见的 instructions 逐条对照修改，只修被点名的问题，不要额外改动未提及的代码。

4. 【代码完整】输出完整文件内容（非 diff），代码可独立运行，无占位符/省略号/TODO。

## 输出格式（严格遵守）

**文件**: workspace/<与 reject_files 完全一致的路径>
\`\`\`tsx
完整代码
\`\`\`

逐文件输出，直到 reject_files 中所有文件修复完毕。`

const SYSTEM_PROMPT_RECONCILE = `你是 Goleynx 顶级代码工程师（401 执行窗）。

你收到一份「历史代码纠查工单」：项目目标对齐已发生变化，架构树已更新。你当前的任务不是写新功能，而是按照【最新架构树】修正工单里列出的【历史文件】，让它们重新符合新架构。

执行规则：
1. 只修改工单列出的历史文件，其他文件绝对不要动。
2. 严格以最新架构树为标尺（结构/依赖/接口/约束），不要保留与新架构冲突的旧写法。
3. 代码必须完整、可运行、无占位符。
4. 不要引入与工单无关的新文件或新依赖。

输出格式（严格遵守）：
**文件**: workspace/<相对路径>
\`\`\`tsx
完整代码
\`\`\`

逐文件输出，直到工单所列历史文件全部修正完毕。`

const SYSTEM_PROMPT_RECONCILE_REJECT = `你是 Goleynx 顶级代码工程师（401 执行窗）。

你上一轮的历史代码纠查被 301 审查窗打回了！现在你需要根据审查意见，继续修正指定的历史文件以适配新架构。

打回原因 + 重写指令已在上文中给出。请严格按照审查意见修改，避免再次被打回。

重写规则：
1. 只修改被指出有问题的历史文件，其他文件不要动。
2. 严格遵循审查意见，逐条对照修改。
3. 代码必须完整、可运行、无占位符。

输出格式（严格遵守）：
**文件**: workspace/<相对路径>
\`\`\`tsx
完整代码
\`\`\`

逐文件输出，直到所有问题修复完毕。`

/** 规范化路径：统一成 workspace/ 前缀（兼容 LLM 省略前缀、markdown 反引号、括号路由组） */
function normalizePath(raw: string): string {
  let p = raw.trim()
  p = p.replace(/[`*]/g, '')        // 去掉 markdown 反引号/星号
  p = p.replace(/^workspace\//, '') // 去掉已有的 workspace/
  p = p.replace(/^\.?\//, '')       // 去掉开头的 ./ 或 /
  p = p.replace(/\s+/g, ' ')       // 合并多余空白
  return 'workspace/' + p
}

/** 从 LLM 输出解析代码文件。
 *  容错点：
 *  1) 路径可带或不带 workspace/ 前缀；
 *  2) 支持括号路由组 app/(auth)/layout.tsx；
 *  3) 容忍 markdown 反引号包裹路径；
 *  4) 主正则抓不到时用「文件路径 + 代码块」兜底。 */
function parseCodeFiles(llmOutput: string): Array<{ path: string; code: string }> {
  const files: Array<{ path: string; code: string }> = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  // 主正则：**文件**: <path> 紧跟 ```lang\n<code>```
  const regex = /\*\*文件\*\*[:：]\s*([^\n]+?)\s*\n\s*```[^\n]*\n([\s\S]*?)```/g
  while ((m = regex.exec(llmOutput)) !== null) {
    const path = normalizePath(m[1])
    const code = m[2].trim()
    if (code && !seen.has(path)) { seen.add(path); files.push({ path, code }) }
  }

  // 兜底：匹配文件路径（含 .tsx/.ts/.css 等）+ 其后代码块
  if (files.length === 0) {
    const fallback = /([\w./\-() ]+\.(?:tsx?|jsx?|ts|css|scss|json|md))(?:\s|\n)*```[^\n]*\n([\s\S]*?)```/g
    while ((m = fallback.exec(llmOutput)) !== null) {
      const path = normalizePath(m[1])
      const code = m[2].trim()
      if (code && !seen.has(path)) { seen.add(path); files.push({ path, code }) }
    }
  }
  return files
}

/** LLM 调用超时包装（防单窗拖死整轮） */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }).catch((e) => { clearTimeout(t); reject(e) })
  })
}

/** 结构化状态记录：供 301 督导中枢确定性诊断（区分 started/failed-timeout/failed-parse/failed-empty/submitted/melted），
 *  落盘 runtime/terminals/{窗}/conversations.json（role:'status'），与人工摘要并存，301 直接按 status 判定。 */
async function appendStatus(api: any, executor: string, round: string, phase: string, status: string, detail: string) {
  try {
    await api.storage.append(executor, {
      round: `${executor.toUpperCase()}${round}-status`,
      timestamp: new Date().toISOString(),
      role: 'status',
      phase,
      status,
      detail: detail || '',
    })
  } catch {}
}

/**
 * 解析执行模型：不强制绑定任何供应商。
 * 优先用传入的偏好模型；否则取「设置里已配置 API Key 的模型」中的第一个
 * （用户在设置中添加了谁的 Key 就用谁；都没添加则返回空串，由 IPC 报「未配置密钥」）。
 */
async function resolveExecModel(preferred?: string): Promise<string> {
  if (preferred && preferred.trim()) return preferred
  try {
    const list: any[] = await (window as any).electronAPI?.ai?.availableModels?.() ?? []
    return list[0]?.id || ''
  } catch {
    return ''
  }
}

/** 解析失败兜底：让 LLM 把原始输出重排成标准格式再解析一次 */
async function reformatAndParse(api: any, rawOutput: string, log: any): Promise<Array<{ path: string; code: string }>> {
  try {
    const execModel = await resolveExecModel()
    const r = await withTimeout(api.ai.chat({
      modelId: execModel, apiKey: '', stream: false,
      messages: [
        { role: 'system', content: '你是代码格式化器。把下方内容里每个文件严格重排为：\n**文件**: workspace/<相对路径>\n```lang\n完整代码\n```\n逐文件输出，不要任何多余文字。路径保留原有 workspace/ 之后的相对结构，原样照搬，不要精简、不要自建子目录（如 smart-glasses-store/ 这类架构树不存在的层）。' },
        { role: 'user', content: rawOutput },
      ],
    }), 120000, '格式化重试')
    return parseCodeFiles((r as any)?.content ?? '')
  } catch (e: any) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 格式化重试失败: ${e.message}` })
    return []
  }
}

/** 通用：写文件 + 发审查广播 */
async function writeFilesAndReview(
  round: string, dispatchSeq: string, submitIter: string, executor: string, step: string,
  files: Array<{ path: string; code: string }>,
  log: ReturnType<typeof useSyslogStore.getState.addLog>, api: any,
) {
  const results: string[] = []
  let wroteCount = 0

  for (const file of files) {
    const relPath = file.path.replace(/^workspace\//, '')
    try {
      await api.file.write(relPath, file.code)
      const kb = (file.code.length / 1024).toFixed(1)
      results.push(`✅ ${file.path} (${kb} KB)`)
      wroteCount++
      log({ timestamp: Date.now(), category: '保存', sourceName: '执行窗', message: `[保存] ${file.path} (${kb} KB)` })
    } catch (e: any) {
      results.push(`❌ ${file.path} — 写入失败: ${e.message}`)
      log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] ${file.path} 写入失败: ${e.message}` })
    }
  }

  await appendStatus(api, executor, round, 'submit', 'submitted', `v${dispatchSeq}-${submitIter} 已写${wroteCount}文件`)

  // 401 终端记录
  const isFirstSubmit = submitIter === '01'
  const roundTag = isFirstSubmit
    ? `第 ${round} 轮 s${step}-V${dispatchSeq} 首次送审`
    : `第 ${round} 轮 s${step}-V${dispatchSeq} 第${parseInt(submitIter)}次送审（驳回后重写）`
  const summary = `[执行] ${roundTag} 已完成\n\n已写入 ${wroteCount} 个文件：\n${results.join('\n')}`

  try {
    await api.storage.append(executor, {
      round: `${executor.toUpperCase()}${round}-mv${dispatchSeq}`,
      timestamp: new Date().toISOString(),
      role: 'model',
      content: summary,
    })
  } catch {}

  log({ timestamp: Date.now(), category: '执行', sourceName: '执行窗', message: `[执行窗] ${roundTag} 完成 — ${wroteCount} 个文件已写入 workspace/` })

  // 发审查广播（送审信标 = {执行体}{轮}-V{调度版次}-{送审迭代}）
  // 版本段 V 跟随调度信标的 seq（首次 01；人工微调重调度递增 02…），绝不随送审迭代变；
  // 迭代段 01→05，第 06 次由 window-agent 触发熔断（不再驳回、直接熔断）
  const reviewCode = `${executor.toUpperCase()}${round}-v${dispatchSeq}-${submitIter}`
  bus.emit('agent:broadcast', {
    sourceId: executor,
    sourceName: '执行窗',
    eventType: reviewCode,
    message: `401 ${roundTag} 完成 → 请求 301 审查（V${dispatchSeq} 第 ${submitIter} 次送审）`,
    category: '执行',
    timestamp: Date.now(),
  })

  log({ timestamp: Date.now(), category: '广播', sourceName: '执行窗', message: `[广播] 发送 ${reviewCode}（V${dispatchSeq} 第 ${submitIter} 次送审）→ 请求 301 审查` })
}

/** 首次执行：读调度指令 → LLM 生成代码 */
async function runExecutor(round: string, dispatchSeq: string, step: string, executor: string = 'D') {
  const api = (window as any).electronAPI
  if (!api) return

  const log = useSyslogStore.getState().addLog
  dispatchStepMap[`${round}-${executor}`] = step || round
  await appendStatus(api, executor, round, 'execute', 'started', `s${step}-v${dispatchSeq}`)
  log({ timestamp: Date.now(), category: '执行', sourceName: '执行窗', message: `[执行窗] 第 ${round} 轮 s${step}-v${dispatchSeq} 开始执行` })

  // 1. 读调度指令
  let instruction = ''
  try {
    const raw = await api.file.readRaw(getInstructionPath(round, step, executor))
    const inst = JSON.parse(raw || '{}')
    instruction = inst.instruction || ''
  } catch {}

  if (!instruction) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 调度指令为空，无法执行` })
    return
  }

  // 2. 读参考文件
  const goals = await api.readBlueprint?.('goals') || ''
  const architecture = await api.readBlueprint?.('architecture') || ''
  const reviewRules = await api.readBlueprint?.('review-rules') || ''

  // 3. 调 LLM
  const execModel = await resolveExecModel()
  log({ timestamp: Date.now(), category: 'API', sourceName: '执行窗', message: `[API] 执行窗 调用 ${execModel} 生成代码（第 ${round} 轮）` })

  const userPrompt = `## 调度指令（核心任务）：\n\n${instruction}\n\n## 目标对齐（参考）：\n${goals.slice(0, 2000)}\n\n## 架构树（参考）：\n${architecture.slice(0, 3000)}\n\n## 审查规则（参考）：\n${reviewRules.slice(0, 2000)}`

  let llmReply: any
  try {
    llmReply = await withTimeout(api.ai.chat({
      modelId: execModel,
      apiKey: '',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    }), 180000, '代码生成')
  } catch (e: any) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] LLM 调用失败: ${e.message}` })
    await appendStatus(api, executor, round, 'execute', 'failed-timeout', e.message)
    return
  }

  const fullReply = llmReply?.content ?? ''
  let files = parseCodeFiles(fullReply)

  // 解析失败：先让 LLM 把原文重排成标准格式再解析一次
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 首次解析 0 文件，尝试格式化重试（${executor.toUpperCase()}${round}）` })
    files = await reformatAndParse(api, fullReply, log)
  }

  if (files.length === 0) {
    await appendStatus(api, executor, round, 'execute', 'failed-parse', '重试后仍0文件')
    // 仍失败：写回原始输出到「本窗口」终端 + 明确错误日志（不再硬编码 'd'）
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] LLM 输出未解析到代码文件（重试后仍失败）` })
    try {
      await api.storage.append(executor, {
        round: `${executor.toUpperCase()}${round}-mv${dispatchSeq}`,
        timestamp: new Date().toISOString(),
        role: 'model',
        content: `[执行] 第 ${round} 轮 — 未解析到代码文件（已格式化重试仍失败）\n\nLLM 原始输出（前800字）：\n${fullReply.slice(0, 800)}`,
      })
    } catch {}
    return
  }

  await writeFilesAndReview(round, dispatchSeq, '01', executor, step, files, log, api)
}

/** 审查不通过 → 重写循环：读 reject 文件 → LLM 重写 → 送审迭代+1 → 再送审（V 段跟随调度版次、不随送审迭代变） */
async function runReExecutor(round: string, executor: string = 'D', rejectCount: string = '01', version: string = '01') {
  const api = (window as any).electronAPI
  if (!api) return

  const log = useSyslogStore.getState().addLog

  // 1. 读审查不通过意见（由 e08 写入 d05-review.md）
  let reviewContent = ''
  try {
    reviewContent = await api.file.readRaw(getRejectPath(round, version, rejectCount, executor))
  } catch {}
  if (!reviewContent) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 驳回文件为空，无法重写` })
    return
  }

  // 2. 读原始调度指令（保留上下文）
  let originalInstruction = ''
  try {
    const raw = await api.file.readRaw(getInstructionPath(round, dispatchStepMap[`${round}-${executor}`] || round, executor))
    const inst = JSON.parse(raw || '{}')
    originalInstruction = inst.instruction || ''
  } catch {}

  // 3. 解析驳回指令中的 reject_files（硬约束：LLM 只能动这些文件）
  let rejectFilesList = ''
  try {
    const rj = JSON.parse(reviewContent)
    const rFiles = rj.reject_files || rj.rejectFiles || ''
    if (rFiles) {
      rejectFilesList = typeof rFiles === 'string' ? rFiles.trim() : rFiles.join('\n')
    }
  } catch {}

  // 4. 送审迭代 = 驳回迭代 + 1（01→02→…→05；第 06 次由 window-agent 触发熔断，不再送审）
  const newIter = String(parseInt(rejectCount || '01') + 1).padStart(2, '0')

  log({ timestamp: Date.now(), category: '执行', sourceName: '执行窗', message: `[执行窗] 第 ${round} 轮 审查不通过 → V${version} 第 ${newIter} 次送审（驳回后重写）` })

  // 5. 读参考文件
  const goals = await api.readBlueprint?.('goals') || ''
  const architecture = await api.readBlueprint?.('architecture') || ''
  const reviewRules = await api.readBlueprint?.('review-rules') || ''

  // 6. 调 LLM 重写（使用打回专用的 system prompt）
  const execModel = await resolveExecModel()
  log({ timestamp: Date.now(), category: 'API', sourceName: '执行窗', message: `[API] 执行窗 调用 ${execModel} 按审查意见重写（V${version} 第 ${newIter} 次送审）` })

  const userPrompt = `## 审查不通过意见（来自 301 审查窗）：\n\n${reviewContent}\n\n## ⚠️ 仅限修改以下文件（硬约束）:\n${rejectFilesList || '(见上方 reject_files)'}\n\n## 这是第 ${newIter} 次送审:\n${parseInt(newIter) >= 5 ? '已进入铁腕期——多写一个文件、少写一个文件、路径偏差一级都直接再次驳回。' : parseInt(newIter) >= 3 ? '已进入收紧期——不允许新增任何工单外文件。' : ''}\n\n## 原始调度指令（参考上下文）：\n${originalInstruction}\n\n## 架构树（参考）：\n${architecture.slice(0, 3000)}\n\n## 审查规则（避免再被打回）：\n${reviewRules.slice(0, 2000)}`

  let llmReply: any
  try {
    llmReply = await withTimeout(api.ai.chat({
      modelId: execModel,
      apiKey: '',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_REJECT },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    }), 180000, '重写代码')
  } catch (e: any) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 重写 LLM 调用失败: ${e.message}` })
    return
  }

  const fullReply = llmReply?.content ?? ''
  let files = parseCodeFiles(fullReply)
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 重写首次解析 0 文件，尝试格式化重试` })
    files = await reformatAndParse(api, fullReply, log)
  }

  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 重写未解析到代码文件（重试后仍失败）` })
    try {
      await api.storage.append(executor, {
        round: `${executor.toUpperCase()}${round}-mv${version}`,
        timestamp: new Date().toISOString(),
        role: 'model',
        content: `[重写] 第 ${round} 轮 — 未解析到代码文件（已格式化重试仍失败）\n\nLLM 原始输出（前800字）：\n${fullReply.slice(0, 800)}`,
      })
    } catch {}
    return
  }

  await writeFilesAndReview(round, version, newIter, executor, dispatchStepMap[`${round}-${executor}`] || round, files, log, api)
}

/** 通用：写历史纠查修正文件 + 发 RC 送审广播（与 writeFilesAndReview 同构，仅信标换成 RC） */
async function writeFilesAndReconcile(
  round: string, version: string, submitIter: string, executor: string,
  files: Array<{ path: string; code: string }>,
  log: ReturnType<typeof useSyslogStore.getState.addLog>, api: any,
) {
  const results: string[] = []
  let wroteCount = 0
  for (const file of files) {
    const relPath = file.path.replace(/^workspace\//, '')
    try {
      await api.file.write(relPath, file.code)
      const kb = (file.code.length / 1024).toFixed(1)
      results.push(`✅ ${file.path} (${kb} KB)`)
      wroteCount++
      log({ timestamp: Date.now(), category: '保存', sourceName: '执行窗', message: `[保存] ${file.path} (${kb} KB)` })
    } catch (e: any) {
      results.push(`❌ ${file.path} — 写入失败: ${e.message}`)
      log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] ${file.path} 写入失败: ${e.message}` })
    }
  }

  const isFirst = submitIter === '01'
  const roundTag = isFirst
    ? `第 ${round} 轮 历史纠查 rc${version} 首次送审`
    : `第 ${round} 轮 历史纠查 rc${version} 第${parseInt(submitIter)}次送审（驳回后重写）`
  const summary = `[执行] ${roundTag} 已完成\n\n已写入 ${wroteCount} 个历史文件：\n${results.join('\n')}`

  try {
    await api.storage.append(executor, {
      round: `${executor.toUpperCase()}${round}-mrc${version}`,
      timestamp: new Date().toISOString(),
      role: 'model',
      content: summary,
    })
  } catch {}

  log({ timestamp: Date.now(), category: '执行', sourceName: '执行窗', message: `[执行窗] ${roundTag} 完成 — ${wroteCount} 个历史文件已写入 workspace/` })

  // 发 rc 送审广播（信标 = {执行体}{轮}-rc{版}-{迭}，e11 复核）
  const reviewCode = `${executor.toUpperCase()}${round}-rc${version}-${submitIter}`
  bus.emit('agent:broadcast', {
    sourceId: executor,
    sourceName: '执行窗',
    eventType: reviewCode,
    message: `401 ${roundTag} 完成 → 请求 301 历史纠查复核（RC${version} 第 ${submitIter} 次送审）`,
    category: '执行',
    timestamp: Date.now(),
  })
  log({ timestamp: Date.now(), category: '广播', sourceName: '执行窗', message: `[广播] 发送 ${reviewCode}（RC${version} 第 ${submitIter} 次送审）→ 请求 301 历史纠查复核` })
}

/** 历史纠查：读 C 族工单 → LLM 按新架构修正历史文件 → 写结果摘要 → 发 RC 送审。
 *  首次派单（rejectNote 为空）提交同迭代；驳回后重写（rejectNote 非空）提交迭代+1，与新架构送审 V 语义一致。 */
async function runReconcileExecutor(round: string, executor: string = 'D', version: string = '01', iter: string = '01') {
  const api = (window as any).electronAPI
  if (!api) return
  const log = useSyslogStore.getState().addLog
  const orderPath = `runtime/reconcile/C${round}-rc${version}-${iter}-${executor}.json`
  const rejectPath = `runtime/reconcile/C${round}-rc${version}-${iter}-${executor}-reject.json`
  log({ timestamp: Date.now(), category: '执行', sourceName: '执行窗', message: `[执行窗] 第 ${round} 轮 历史纠查 C${round}-rc${version}-${iter}-${executor} 开始（按新架构修正历史代码）` })

  let order = ''
  let rejectNote = ''
  try {
    const raw = await api.file.readRaw(orderPath)
    const o = JSON.parse(raw || '{}')
    order = o.directive || o.instruction || ''
  } catch {}
  try {
    const rj = await api.file.readRaw(rejectPath)
    const r = JSON.parse(rj || '{}')
    rejectNote = r.rejectNote || ''
  } catch {}

  if (!order) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 历史纠查工单为空（${orderPath}），无法执行` })
    return
  }

  const goals = await api.readBlueprint?.('goals') || ''
  const architecture = await api.readBlueprint?.('architecture') || ''
  const reviewRules = await api.readBlueprint?.('review-rules') || ''

  const systemPrompt = rejectNote ? SYSTEM_PROMPT_RECONCILE_REJECT : SYSTEM_PROMPT_RECONCILE
  const rejectSection = rejectNote
    ? `\n\n## 301 审查窗打回意见（必须逐条对照修改）：\n${rejectNote}`
    : ''
  const userPrompt = `## 历史纠查工单（核心任务）：\n\n${order}\n\n## 最新架构树（按此修正）：\n${architecture.slice(0, 4000)}\n\n## 目标对齐（参考）：\n${goals.slice(0, 2000)}\n\n## 审查规则（避免再被打回）：\n${reviewRules.slice(0, 2000)}${rejectSection}`
  const execModel = await resolveExecModel()
  log({ timestamp: Date.now(), category: 'API', sourceName: '执行窗', message: `[API] 执行窗 调用 ${execModel} 按新架构修正历史代码（第 ${round} 轮 c${round}-rc${version}-${iter}-${executor}）` })
  let llmReply: any
  try {
    llmReply = await withTimeout(api.ai.chat({ modelId: execModel, apiKey: '', messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], stream: false }), 180000, '历史纠查')
  } catch (e: any) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 历史纠查 LLM 调用失败: ${e.message}` })
    return
  }
  let files = parseCodeFiles(llmReply?.content ?? '')
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 历史纠查首次解析 0 文件，尝试格式化重试` })
    files = await reformatAndParse(api, llmReply?.content ?? '', log)
  }
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 历史纠查 LLM 输出未解析到代码文件（重试后仍失败）` })
    return
  }
  try {
    await api.file.writeRaw(`runtime/reconcile/C${round}-rc${version}-${iter}-${executor}-result.json`,
      JSON.stringify({ round, executor, version, iter, files: files.map(f => f.path), summary: rejectNote ? '按驳回意见二次修正历史文件' : '已按新架构修正历史文件' }, null, 2))
  } catch {}
  // 首次送审提交同迭代；驳回后重写提交迭代+1（与新架构送审 V 的语义一致）
  const submitIter = rejectNote ? String(parseInt(iter, 10) + 1).padStart(2, '0') : iter
  await writeFilesAndReconcile(round, version, submitIter, executor, files, log, api)
}

/**
 * 审查意见处理：读 runtime/advisory/C{轮}-ac{序号}-{窗}.json，按 kind 行动。
 * - diagnose：重跑自己原工单（首执行路径 runExecutor）。
 * - reassign：接手别人（fromExecutor）的任务，读其调度工单写同批文件，
 *   以本窗口身份提交送审（301 按文件清单销账原槽，与谁写无关）。
 */
async function runAdvisoryExecutor(round: string, seq: string, executor: string) {
  const api = (window as any).electronAPI
  if (!api) return
  const log = useSyslogStore.getState().addLog
  const advisoryPath = `runtime/advisory/C${round}-ac${seq}-${executor}.json`
  let advisory: any = {}
  try {
    const raw = await api.file.readRaw(advisoryPath)
    advisory = JSON.parse(raw || '{}')
  } catch {}
  if (!advisory.kind) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 审查意见文件为空（${advisoryPath}），无法处理` })
    return
  }
  log({ timestamp: Date.now(), category: '督导', sourceName: '执行窗', message: `[执行窗] 第 ${round} 轮 收到审查意见(${advisory.kind}) seq=${seq}` })
  if (advisory.kind === 'diagnose') {
    const step = advisory.step || dispatchStepMap[`${round}-${executor}`] || round
    const dispatchSeq = advisory.dispatchSeq || '01'
    await runExecutor(round, dispatchSeq, step, executor)
  } else if (advisory.kind === 'reassign') {
    const fromExecutor = advisory.fromExecutor || ''
    const step = advisory.step || dispatchStepMap[`${round}-${fromExecutor}`] || round
    const dispatchSeq = advisory.dispatchSeq || '01'
    await runReassignExecutor(round, dispatchSeq, step, executor, fromExecutor, advisory.targetFiles || [], log, api)
  }
}

/** 接手别人任务：读 fromExecutor 的调度工单 → LLM 写那批文件 → 以本窗口身份提交送审（301 按文件清单销账原槽） */
async function runReassignExecutor(
  round: string, dispatchSeq: string, step: string, executor: string,
  fromExecutor: string, targetFiles: string[], log: any, api: any,
) {
  await appendStatus(api, executor, round, 'reassign', 'started', `接手${fromExecutor}任务 s${step}`)
  let instruction = ''
  try {
    const raw = await api.file.readRaw(getInstructionPath(round, step, fromExecutor))
    const inst = JSON.parse(raw || '{}')
    instruction = inst.instruction || ''
  } catch {}
  if (!instruction) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 接手任务调度指令为空（${fromExecutor} s${step}），无法执行` })
    await appendStatus(api, executor, round, 'reassign', 'failed-empty', `原窗${fromExecutor}工单为空`)
    return
  }
  const goals = await api.readBlueprint?.('goals') || ''
  const architecture = await api.readBlueprint?.('architecture') || ''
  const reviewRules = await api.readBlueprint?.('review-rules') || ''
  const userPrompt = `## 调度指令（接手任务，核心任务）：\n\n${instruction}\n\n## 目标对齐（参考）：\n${goals.slice(0, 2000)}\n\n## 架构树（参考）：\n${architecture.slice(0, 3000)}\n\n## 审查规则（参考）：\n${reviewRules.slice(0, 2000)}`
  const execModel = await resolveExecModel()
  let llmReply: any
  try {
    llmReply = await withTimeout(api.ai.chat({
      modelId: execModel, apiKey: '', stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }), 180000, '接手任务代码生成')
  } catch (e: any) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 接手任务 LLM 调用失败: ${e.message}` })
    await appendStatus(api, executor, round, 'reassign', 'failed-timeout', e.message)
    return
  }
  const fullReply = llmReply?.content ?? ''
  let files = parseCodeFiles(fullReply)
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 接手任务首次解析 0 文件，尝试格式化重试` })
    files = await reformatAndParse(api, fullReply, log)
  }
  if (files.length === 0) {
    log({ timestamp: Date.now(), category: '错误', sourceName: '执行窗', message: `[执行窗] 接手任务未解析到代码文件（重试后仍失败）` })
    await appendStatus(api, executor, round, 'reassign', 'failed-parse', '重试后仍0文件')
    return
  }
  await writeFilesAndReview(round, dispatchSeq, '01', executor, step, files, log, api)
}

/**
 * 启动 401 执行驱动器（全局调用一次）
 */
export function setupExecutorDriver() {
  if (initialized) return
  initialized = true

  const handler = async (event: any) => {
    if (!event.eventType) return

    // e10 发出的定向调度（版次≠00，00是e05→e10触发信标）
    const m = event.eventType.match(/^B(\d{4})-s(\d{4})-(\d{2})-([A-Z])$/)
    if (m && m[3] !== '00') {
      const round = m[1]
      const step = m[2]
      const dispatchSeq = m[3]
      const executor = m[4]
      try { await runExecutor(round, dispatchSeq, step, executor) } catch (e: any) {
        useSyslogStore.getState().addLog({
          timestamp: Date.now(), category: '错误', sourceName: '执行窗',
          message: `[执行窗] 第 ${round} 轮执行失败: ${e.message ?? '未知错误'}`,
        })
      }
      return
    }

    // 定向驳回：C{轮次}-r{版次}-{序号}-{执行体}（执行体从 D 起顺延，故用 [A-Z]）
    const rejectMatch = event.eventType.match(/^C(\d{4})-r(\d{2})-(\d{2})-([A-Z])$/)
    if (rejectMatch) {
      const round = rejectMatch[1]
      const version = rejectMatch[2]
      const rejectCount = rejectMatch[3]
      const executor = rejectMatch[4]
      try { await runReExecutor(round, executor, rejectCount, version) } catch (e: any) {
        useSyslogStore.getState().addLog({
          timestamp: Date.now(), category: '错误', sourceName: '执行窗',
          message: `[执行窗] 第 ${round} 轮重写失败: ${e.message ?? '未知错误'}`,
        })
      }
      return
    }

    // 历史纠查派单/驳回（C 族，301 发出）：C{轮}-rc{版}-{迭}-{执行体}
    // （e09 发，命令窗口按新架构修正历史代码；驳回复用同信标，迭代不变，窗口重写后迭代+1 再送审）
    const rcMatch = event.eventType.match(/^C(\d{4})-rc(\d{2})-(\d{2})-([A-Z])$/)
    if (rcMatch) {
      const round = rcMatch[1]
      const version = rcMatch[2]
      const iter = rcMatch[3]
      const executor = rcMatch[4]
      try { await runReconcileExecutor(round, executor, version, iter) } catch (e: any) {
        useSyslogStore.getState().addLog({
          timestamp: Date.now(), category: '错误', sourceName: '执行窗',
          message: `[执行窗] 第 ${round} 轮历史纠查执行失败: ${e.message ?? '未知错误'}`,
        })
      }
      return
    }

    // 审查意见 / 督导（301 发出）：C{轮}-ac{序号}-{执行体}
    // kind=diagnose：重跑自己原工单（首执行路径）；kind=reassign：接手别人（fromExecutor）的任务
    const acMatch = event.eventType.match(/^C(\d{4})-ac(\d{2})-([A-Z])$/)
    if (acMatch) {
      const round = acMatch[1]
      const seq = acMatch[2]
      const executor = acMatch[3]
      try { await runAdvisoryExecutor(round, seq, executor) } catch (e: any) {
        useSyslogStore.getState().addLog({
          timestamp: Date.now(), category: '错误', sourceName: '执行窗',
          message: `[执行窗] 第 ${round} 轮审查意见处理失败: ${e.message ?? '未知错误'}`,
        })
      }
      return
    }
  }

  bus.on('agent:broadcast', handler)
}
