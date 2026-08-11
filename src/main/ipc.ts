import { ipcMain, app } from 'electron'
import { join, relative, isAbsolute } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, appendFileSync } from 'fs'
import { dirname } from 'path'
import { aiChat, ALL_PROVIDERS, getAvailableModels, setKey, getKey, deleteKey, hasKey } from './ai'
import { appendConversation, getConversation, AgentMessage } from '../shared/utils/storage-service'
import {
  initProjectSystem, getProjectCoreDir, getProjectWorkspaceDir,
  getProjectsRoot, createProject, getActiveProjectId, listProjects, renameProject,
  getTerminalsDir, getPanelsDir,
} from './project'

export function setupIPC() {
  // 启动时初始化项目系统
  const appPath = app.getAppPath()
  initProjectSystem(appPath)

  ipcMain.handle('window:minimize', e => e.sender.getOwnerBrowserWindow()?.minimize())
  ipcMain.handle('window:maximize', e => { const w=e.sender.getOwnerBrowserWindow(); w?.isMaximized()?w.unmaximize():w?.maximize() })
  ipcMain.handle('window:close', e => e.sender.getOwnerBrowserWindow()?.close())

  // 蓝图阅读 — 从项目 core/ 读取
  ipcMain.handle('file:read-blueprint', async (_e, id: string) => {
    const m: Record<string, string> = {
      requirements: 'requirements.md',
      goals: 'goals.md',
      architecture: 'architecture.md',
      'review-rules': 'review-rules.md',
      steps: 'steps.md',
      summary: 'summary.md',
    }
    const f = m[id]; if (!f) return null
    const p = join(getProjectCoreDir(appPath), f)
    return existsSync(p) ? readFileSync(p, 'utf-8') : null
  })

  // 蓝图写入 — 写入项目 core/ 目录
  ipcMain.handle('file:write-blueprint', async (_e, id: string, content: string) => {
    const m: Record<string, string> = {
      requirements: 'requirements.md',
      goals: 'goals.md',
      architecture: 'architecture.md',
      'review-rules': 'review-rules.md',
      steps: 'steps.md',
      summary: 'summary.md',
    }
    const f = m[id]; if (!f) return { success: false, error: 'Invalid doc id' }
    const p = join(getProjectCoreDir(appPath), f)
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, content, 'utf-8')
    return { success: true, path: p }
  })

  // 文件原始读写 — 任意 .goleynx/ 下相对路径（引擎/终端/面板通用）
  ipcMain.handle('file:read-raw', async (_e, relPath: string) => {
    const p = join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', relPath)
    return existsSync(p) ? readFileSync(p, 'utf-8') : null
  })

  ipcMain.handle('file:write-raw', async (_e, relPath: string, content: string) => {
    const p = join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', relPath)
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, content, 'utf-8')
    return { success: true, path: p }
  })

  // .goleynx/ 目录列表 — 列出指定子目录下的 .json 文件（窗口代理扫描引擎用）
  ipcMain.handle('file:list-raw', async (_e, relPath: string) => {
    const p = join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', relPath)
    if (!existsSync(p)) return []
    return readdirSync(p, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => e.name)
  })

  // Keys
  ipcMain.handle('key:set', async (_e, id: string, key: string) => { setKey(id, key); return true })
  ipcMain.handle('key:get', async (_e, id: string) => getKey(id))
  ipcMain.handle('key:delete', async (_e, id: string) => { deleteKey(id); return true })
  ipcMain.handle('key:has', async (_e, id: string) => hasKey(id))

  // Models
  ipcMain.handle('ai:providers', async () => ALL_PROVIDERS)
  ipcMain.handle('ai:available', async () => getAvailableModels())

  // AI Chat
  ipcMain.handle('ai:chat', async (_e, args: { modelId: string, apiKey?: string, messages: { role: string, content: string }[], stream?: boolean }) => {
    const { modelId, messages, stream } = args
    const apiKey = args.apiKey || getKey(modelId) || ''
    if (!apiKey) throw new Error('未配置 API 密钥，请在设置 → API 密钥页保存密钥')
    if (stream) {
      const w = _e.sender.getOwnerBrowserWindow()
      return aiChat(modelId, apiKey, messages, true, (c) => w?.webContents.send('ai:chunk', c))
    }
    return aiChat(modelId, apiKey, messages, false)
  })

  // Storage — 数据落到项目的 data/terminals/ 目录
  ipcMain.handle('storage:append', async (_e, agentId: string, message: AgentMessage) => {
    const dataRoot = getTerminalsDir(appPath)
    await appendConversation(dataRoot, agentId, message)
    return true
  })

  ipcMain.handle('storage:get', async (_e, agentId: string) => {
    const dataRoot = getTerminalsDir(appPath)
    return getConversation(dataRoot, agentId)
  })

  // File write — 代码落到项目的 workspace/ 目录
  ipcMain.handle('file:write', async (_e, filename: string, content: string) => {
    const workspaceRoot = getProjectWorkspaceDir(appPath)
    const fullPath = join(workspaceRoot, filename)
    const dir = dirname(fullPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    return { success: true, path: fullPath }
  })

  // Workspace 文件树 — 递归列出 workspace/ 目录结构
  ipcMain.handle('file:list-workspace', async () => {
    const root = getProjectWorkspaceDir(appPath)
    const walk = (dirPath: string): any[] => {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter(e => !e.name.startsWith('.')) // 排除隐藏文件
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
        .map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'folder' : 'file',
          children: e.isDirectory() ? walk(join(dirPath, e.name)) : undefined,
        }))
    }
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true })
      return []
    }
    return walk(root)
  })

  // Workspace 文件读取 — 读 workspace/ 下指定文件的完整内容
  ipcMain.handle('file:read-workspace', async (_e, relPath: string) => {
    const root = getProjectWorkspaceDir(appPath)
    const fullPath = join(root, relPath)
    if (!existsSync(fullPath)) return null
    return readFileSync(fullPath, 'utf-8')
  })

  // Workspace 文件删除 — 仅允许删除 workspace/ 下的文件/目录（防越权/路径穿越）。
  // 用途：E08 契约裁决发现「调度指令私自创建了架构树(D03)不存在的目录层」（任何层名通用），
  // 清理其中被错写到错误位置的代码。relPath 必须是相对 workspace 的合法路径，禁止 '..' 与绝对路径。
  ipcMain.handle('file:delete-workspace', async (_e, relPath: string) => {
    const root = getProjectWorkspaceDir(appPath)
    const safe = (relPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!safe || safe.includes('..')) return { success: false, error: 'invalid path' }
    const fullPath = join(root, safe)
    const rel = relative(root, fullPath)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return { success: false, error: 'path escape' }
    if (!existsSync(fullPath)) return { success: true, skipped: true }
    rmSync(fullPath, { recursive: true, force: true })
    return { success: true, path: fullPath }
  })

  // 项目管理
  ipcMain.handle('project:list', async () => {
    return listProjects(appPath)
  })

  ipcMain.handle('project:info', async () => {
    const list = listProjects(appPath)
    const active = list.find(p => p.id === getActiveProjectId())
    return {
      id: getActiveProjectId(),
      name: active?.name ?? getActiveProjectId(),
      root: getProjectsRoot(appPath),
      core: getProjectCoreDir(appPath),
      runtime: join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', 'runtime'),
      workspace: getProjectWorkspaceDir(appPath),
    }
  })

  ipcMain.handle('project:create', async () => {
    return createProject(appPath)
  })

  ipcMain.handle('project:rename', async (_e, projectId: string, newName: string) => {
    renameProject(appPath, projectId, newName)
    return true
  })

  // 执行体管理 — 按字母顺序创建 terminals/{letter}/ 目录
  ipcMain.handle('executor:create', async () => {
    const terminalsDir = getTerminalsDir(appPath)
    const panelsDir2 = getPanelsDir(appPath)
    if (!existsSync(terminalsDir)) mkdirSync(terminalsDir, { recursive: true })
    if (!existsSync(panelsDir2)) mkdirSync(panelsDir2, { recursive: true })

    // 找到下一个可用的执行体字母
    const execLetters = ['d','e','f','g','h']
    const existing = readdirSync(terminalsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
    let nextLetter = 'd'
    for (const l of execLetters) {
      if (!existing.includes(l)) { nextLetter = l; break }
    }

    const execDir = join(terminalsDir, nextLetter)
    const panelDir = join(panelsDir2, nextLetter)
    mkdirSync(execDir, { recursive: true })
    mkdirSync(panelDir, { recursive: true })

    const cf = join(execDir, 'conversations.json')
    if (!existsSync(cf)) writeFileSync(cf, '[]', 'utf-8')

    const sf = join(panelDir, 'status.json')
    if (!existsSync(sf)) writeFileSync(sf, JSON.stringify({ files: {} }), 'utf-8')

    return { agentId: nextLetter, path: execDir }
  })

  // 系统日志持久化 — 追加一行到 runtime/syslog/{date}.log（JSONL 格式）
  ipcMain.handle('file:syslog-append', async (_e, entry: Record<string, unknown>) => {
    try {
      const runtimeDir = join(getProjectsRoot(appPath), getActiveProjectId(), '.goleynx', 'runtime')
      const today = new Date().toISOString().slice(0, 10)
      const logDir = join(runtimeDir, 'syslog')
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
      const line = JSON.stringify({ ...entry, _persisted: Date.now() }) + '\n'
      appendFileSync(join(logDir, `${today}.log`), line, 'utf-8')
    } catch { /* 落盘失败不阻塞 UI */ }
  })
}