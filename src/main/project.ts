/**
 * @file 项目管理器 — 检测安装盘符，创建 GoleynxProjects\P001 完整结构
 */
import { join, parse } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs'
import { app } from 'electron'
function getEnginesSourceDir(): string {
  // 打包后引擎随 extraResources 落在 resources/engines；开发期读源码 src/main/engines
  if (app.isPackaged) return join(process.resourcesPath, 'engines')
  return join(app.getAppPath(), 'src', 'main', 'engines')
}


interface ProjectEntry {
  id: string
  name: string
  createdAt: string
}

interface ProjectIndex {
  activeProject: string
  projects: ProjectEntry[]
}

let _activeProjectId = ''

export function getInstallDrive(appPath: string): string { return parse(appPath).root }

export function getProjectsRoot(appPath: string): string {
  return join(getInstallDrive(appPath), 'GoleynxProjects')
}

function indexFile(appPath: string): string {
  return join(getProjectsRoot(appPath), 'project-index.json')
}

function loadIndex(appPath: string): ProjectIndex {
  const root = getProjectsRoot(appPath)
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const fp = indexFile(appPath)
  if (existsSync(fp)) {
    try { return JSON.parse(readFileSync(fp, 'utf-8')) } catch {}
  }
  const idx: ProjectIndex = {
    activeProject: 'P001',
    projects: [{ id: 'P001', name: '新项目', createdAt: new Date().toISOString() }],
  }
  writeFileSync(fp, JSON.stringify(idx, null, 2), 'utf-8')
  return idx
}

function saveIndex(appPath: string, idx: ProjectIndex) {
  writeFileSync(indexFile(appPath), JSON.stringify(idx, null, 2), 'utf-8')
}


// ═══════════════════════════════════════════════════
// P001 完整初始化 — 所有目录、文件在项目创建时一次性生成
// ═══════════════════════════════════════════════════

function ensureProjectDir(appPath: string, projectId: string) {
  const base = join(getProjectsRoot(appPath), projectId)
  const g = (p: string) => join(base, '.goleynx', p)

  // 1. 递归创建所有目录
  const dirs = [
    g('core'),
    g('runtime/terminals/a'),
    g('runtime/terminals/b'),
    g('runtime/terminals/c'),
    g('runtime/terminals/d'),
    g('runtime/panels/b'),
    g('runtime/panels/c'),
    g('runtime/panels/d'),
    g('runtime/advisory'),
    g('runtime/steps'),
    g('engines'),
    join(base, 'workspace'),
  ]
  dirs.forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }) })

  // 2. 预创建终端空 conversations.json
  const terminalFiles = [
    g('runtime/terminals/a/conversations.json'),
    g('runtime/terminals/b/conversations.json'),
    g('runtime/terminals/c/conversations.json'),
    g('runtime/terminals/d/conversations.json'),
  ]
  terminalFiles.forEach(fp => {
    if (!existsSync(fp)) writeFileSync(fp, '[]', 'utf-8')
  })

  // 3. 预创建面板空状态文件
  const panelFiles: Record<string, string> = {
    'b/steps.json': JSON.stringify({ steps: [], currentStep: 0, totalFiles: 0 }),
    'b/statuses.json': '[]',
    'c/reviews.json': '[]',
    'd/status.json': JSON.stringify({ files: {} }),
  }
  Object.entries(panelFiles).forEach(([rel, content]) => {
    const fp = g(`runtime/panels/${rel}`)
    if (!existsSync(fp)) writeFileSync(fp, content, 'utf-8')
  })

  // 3.5 预创建轮次持久化文件（初始 0001）
  const roundFile = g('runtime/round.json')
  if (!existsSync(roundFile)) writeFileSync(roundFile, JSON.stringify({ currentRound: 1 }, null, 2), 'utf-8')

  // 4. 同步 engines 引擎文件（来源：软件本体 src/main/engines，每次覆盖 → 改一个只影响一个）
  const engineSourceDir = getEnginesSourceDir()
  const engineFiles = ['e01', 'e02', 'e03', 'e05', 'e06', 'e07', 'e08', 'e09', 'e10']
  for (const name of engineFiles) {
    const srcFile = join(engineSourceDir, `${name}.json`)
    const dstFile = g(`engines/${name}.json`)
    if (existsSync(srcFile)) copyFileSync(srcFile, dstFile)
    else console.warn(`[engines] 缺少源文件: ${srcFile}`)
  }
  // 调度指令目录 & 驳回指令目录（信标同名文件存放）
  const dispatchDir = g('runtime/dispatch')
  if (!existsSync(dispatchDir)) mkdirSync(dispatchDir, { recursive: true })
  const rejectDir = g('runtime/reject')
  if (!existsSync(rejectDir)) mkdirSync(rejectDir, { recursive: true })

  // 执行体持久化文件（初始1个 = D）
  const executorsFile = g('runtime/executors.json')
  if (!existsSync(executorsFile)) {
    writeFileSync(executorsFile, JSON.stringify({
      executors: [{ id: '1', letter: 'D', title: '执行体 1 (D)' }],
      count: 1,
    }, null, 2), 'utf-8')
  }

  // 5. 创建 5 个核心模板文件
  createTemplateFiles(base)
}

const TEMPLATES: Record<string, string> = {
  'requirements.md': `# 需求清单

> 本文件为**当前项目**的 D02 需求清单标准。
> 301 审查窗根据 D01 目标对齐自动生成顶层目录需求。
> 任何与此需求清单不一致的架构设计，必须打回。

---

【更新逻辑】本文件采用「追加式更新」：每轮 e02 跑完都会在本文件末尾追加一段更新记录，已有内容永久保留。
`,
  'goals.md': `# 目标对齐

> 本文件为**当前项目**的 D01 目标对齐标准。
> 201 中枢窗收到 A000X 广播后 → 读 101 对话 → 提炼目标 → 追加写入本文件。
> 任何与此目标不一致的代码，必须打回。

---

【更新逻辑】本文件采用「追加式更新」：每轮 e01 跑完都会在本文件末尾追加一段更新记录，已有内容永久保留。
`,
  'architecture.md': `# 架构结构树

> 本文件为**当前项目**的 D03 架构结构标准。
> 301 审查窗根据 D02 需求清单 + 审查规则自动生成。
> 任何未经 301 审查的文件变更，必须打回。

---

## 📋 建议开发顺序

> 以下为 401 执行窗的开发顺序建议（非强制，201 调度时可参考）：
> 1. **UI 骨架优先** — 先写页面布局、组件壳，让项目能跑
> 2. **公共基础设施** — 再写 API 层、状态管理、工具函数
> 3. **业务逻辑最后** — 最后写具体功能实现

---

【更新逻辑】本文件采用「追加式更新」：每轮 e03 跑完都会在本文件末尾追加一段更新记录，已有内容永久保留。
`,
  'review-rules.md': `# 审查规则明细

> 本文件为**当前项目**的 301 审查窗最高判决标准。
> 301 收到任何 D 系列（401 执行窗）完成代码的广播时，必须首先读取本文件，再执行审查。
> 任何违反以下原则的代码片段，必须无条件打回并要求拆解重写。

---

## 角色与纪律

你是当前项目的 AI 审查官（301 审查窗）。

- **你永远不写业务代码。** 你的唯一职责是审查其他 AI 执行窗写的代码。
- 你的审查结论直接控制流水线：通过 → 写入文件并更新架构树；打回 → 驳回给 401 强制拆解。
- 审查必须严格依据本文件的量化规则，不得因为"代码能跑通"就降低架构标准。

---

## 一、绝对单一职责与分层

大模型极易写出"牵一发而动全身"的面条代码，必须通过强制拆解来防御：

1. **职责唯一** — 一个文件只能完成一件事（如：只负责网络请求，或只负责 UI 渲染，或只负责数据解析）。
2. **UI 与逻辑绝缘** — 严禁在一个文件内同时包含界面渲染代码与核心业务逻辑/数据库读写操作。
3. **数据与视图分离** — 数据模型文件不得引用任何 UI 组件。
4. **组件原子化** — 复杂 UI 必须拆解。颜色主题、动画光影、排版布局、点击交互逻辑必须分属独立文件，严禁全部堆砌在一个视图类中。
5. **主线程保护** — 大文件读写、密集型数学计算、加解密等耗时操作，必须强制剥离到独立后台线程/异步任务池中，严禁阻塞 UI 主线程。

---

## 二、魔法字符零容忍

防止 AI 上下文遗忘导致的拼写错误和状态混乱：

1. **拒绝散装硬编码** — 业务逻辑中严禁出现裸露的字符串常量（如 \`"isTyping"\`）或魔法数字（如 \`1001\`、\`#FF0000\`）。
2. **设立常量塔** — 所有系统状态 Key、事件总线 ID、页面路由枚举、颜色配置，必须统一抽取到专门的全局常量文件中，作为 Single Source of Truth（唯一事实来源）。
3. **审查红线** — 如果在普通业务层代码中发现裸露的魔法字符，直接判定审查不通过。

---

## 三、拆解规则

1. **UI 与逻辑分离** — 按钮的颜色方案、光影效果、文字渲染、点击行为各自独立文件。
2. **数据与视图分离** — 数据模型、数据获取、数据缓存各自独立，不与 UI 耦合。
3. **工具与业务分离** — 通用工具函数必须放入 tools/ 目录，不得混入 src/ 业务代码。
4. **全局与局部分离** — 跨模块共享的常量、日志、配置放入 tools/，模块私有的放在模块内部。
5. 拆解后的文件通过明确的 import 接口通信，禁止隐式耦合（全局变量、原型链修改等）。

---

## 四、全局通讯与状态溯源

防止模块间隐式耦合与状态失控：

1. **纯函数原则** — tools/ 或 utils/ 下的函数必须是无状态、无副作用的纯函数。严禁在工具函数内部直接修改外部全局变量。
2. **收口全局状态** — 任何全局状态的读写，必须通过专属的"管家"（Manager）或状态中心进行显式调用。
3. **日志雷达管制** — 各业务模块严禁私自调用底层系统的 \`print\` / \`console.log\`。所有日志输出必须通过统一的全局日志站分流，确保可一键静默。

---

## 五、依赖与引用关系检查

1. **按需引入** — 每个文件的 import 列表必须极简，只引用真正需要的依赖。
2. **禁止循环引用** — 引用图必须是有向无环图（DAG）。A 依赖 B，则 B 不能依赖 A。
3. **单向依赖流** — tools/、utils/、core/ 等底层模块严禁反向引入 views/、pages/ 等业务层代码。
4. **引用路径规范** — 必须使用相对路径或已注册的路径别名。

---

## 六、量化红线

| 审查维度 | 触发阈值 | 裁判结论 | 执行动作 |
|----------|----------|----------|----------|
| 单文件行数 | ≥ 400 行 | ❌ 严重违规 | 强制打回，根据逻辑边界拆分为多个子文件 |
| 单函数/方法行数 | ≥ 80 行 | ❌ 严重违规 | 强制打回，将过长逻辑抽离为私有子函数 |
| 嵌套层级 | ≥ 4 层 | ⚠️ 警告 | 使用提前返回（Early Return）优化结构 |
| 单一文件职责 | 职责混杂（UI+逻辑） | ❌ 严重违规 | 强制打回，要求 UI 与数据/逻辑分离 |
| 单文件行数 | ≥ 200 行 | ⚠️ 警告 | 建议拆解 |

---

## 七、架构自更新机制

当 301 审查窗强制 401 拆解代码并最终复审通过后，301 必须执行：

1. **登记造册** — 将新裂变出来的子文件及其对应的单一职责，同步更新到架构树文档（architecture.md）中。
2. **保持解耦** — 确保新拆解的文件在架构树中归属于正确的目录，维持原有层级关系，绝不破坏未修改的模块。

---

## 通过标准

同时满足以上七条 → ✅ 审查通过。
任一条出现 ❌ 严重违规 → 🚫 打回，附带打回原因和拆解建议。
`,
  'steps.md': `# 项目开发步骤

> 本文件由 E05 引擎根据架构树、需求清单、目标对齐自动生成。
> 若架构或目标发生变化，最新开发步骤追加到已有内容后方，已生成的永不覆盖。
> 滚动到末尾即可查看最新开发步骤，底部 --- 分隔符下方内容为当前调度目标。
`,
  'summary.md': '',
}

function createTemplateFiles(projectBase: string) {
  const coreDir = join(projectBase, '.goleynx', 'core')
  const now = new Date().toISOString().slice(0, 10)
  const projectId = parse(projectBase).base

  Object.entries(TEMPLATES).forEach(([filename, template]) => {
    const fp = join(coreDir, filename)
    if (!existsSync(fp)) {
      writeFileSync(fp, template.replace(/\{PROJECT\}/g, projectId).replace(/\{DATE\}/g, now), 'utf-8')
    }
  })
}

// ═══════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════

export function initProjectSystem(appPath: string): string {
  const idx = loadIndex(appPath)
  idx.projects = idx.projects.map(p =>
    typeof p === 'string' ? { id: p, name: p, createdAt: new Date().toISOString() } : p
  ) as ProjectEntry[]
  idx.projects.forEach(p => ensureProjectDir(appPath, p.id))
  const ids = idx.projects.map(p => p.id)
  if (!idx.activeProject || !ids.includes(idx.activeProject)) {
    idx.activeProject = ids[0] || 'P001'
    saveIndex(appPath, idx)
  }
  _activeProjectId = idx.activeProject
  return _activeProjectId
}

export function renameProject(appPath: string, projectId: string, newName: string) {
  const idx = loadIndex(appPath)
  const p = idx.projects.find(p => p.id === projectId)
  if (!p) throw new Error(`Project ${projectId} not found`)
  p.name = newName
  saveIndex(appPath, idx)
}

export function listProjects(appPath: string): ProjectEntry[] {
  return loadIndex(appPath).projects
}

export function getActiveProjectId(): string { return _activeProjectId || 'P001' }

export function createProject(appPath: string): string {
  const idx = loadIndex(appPath)
  const nextNum = idx.projects.length + 1
  const pid = `P${String(nextNum).padStart(3, '0')}`
  idx.projects.push({ id: pid, name: pid, createdAt: new Date().toISOString() })
  idx.activeProject = pid
  saveIndex(appPath, idx)
  ensureProjectDir(appPath, pid)
  _activeProjectId = pid
  return pid
}

// 路径函数
function golenxDir(appPath: string, sub: string): string {
  return join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', sub)
}

export function getProjectCoreDir(appPath: string): string { return golenxDir(appPath, 'core') }
export function getTerminalsDir(appPath: string): string { return golenxDir(appPath, 'runtime/terminals') }
export function getPanelsDir(appPath: string): string { return golenxDir(appPath, 'runtime/panels') }
export function getEnginesDir(appPath: string): string { return golenxDir(appPath, 'engines') }
export function getProjectWorkspaceDir(appPath: string): string {
  return join(getProjectsRoot(appPath), getActiveProjectId(), 'workspace')
}
