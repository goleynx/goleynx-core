/**
 * @file 全局应用状态
 * @module stores/app-store
 * @description 管理全局状态：主题、语言、日志级别、任务列表、执行体数组、蓝图面板。
 */

import { create } from 'zustand'
import { APP_CONFIG } from '@shared/config/app'

type Theme = 'light' | 'dark'
type Language = 'zh-CN' | 'en-US'
type LogLevel = 'debug' | 'warn' | 'error' | 'silent'

export interface ExecutionAgent {
  id: string
  letter: string
  title: string
}

export interface TaskItem {
  id: string
  name: string
}

export type BlueprintDocId = 'requirements' | 'goals' | 'architecture' | 'review-rules' | 'steps' | 'summary'
export type SettingsTabId = '' | 'general' | 'appearance' | 'language' | 'model' | 'api' | 'about'

/** 全局轮次运行状态 */
export type RunnerState = 'IDLE' | 'RUNNING' | 'QUEUED' | 'STOPPED'

interface AppStore {
  theme: Theme
  language: Language
  logLevel: LogLevel
  isHistoryOpen: boolean
  executionAgents: ExecutionAgent[]
  taskList: TaskItem[]
  activeTaskId: string
  isBlueprintOpen: boolean
  activeBlueprintDoc: BlueprintDocId
  /** 当前接管的 Agent 控制台 ID（'a' 为默认主对话） */
  activeChatAgentId: string
  /** 设置中心是否打开（空间劫持） */
  isSettingsOpen: boolean
  /** 当前选中的设置 Tab */
  activeSettingsTab: SettingsTabId
  /** 系统日志面板是否打开（占用右侧执行体区域） */
  isSystemLogOpen: boolean
  /** 蓝图刷新计数器（任何 Agent 写入 blueprint 后 +1，蓝图面板监听到变化后重新加载） */
  blueprintRefreshCounter: number
  /** 全局轮次运行状态（IDLE/RUNNING/QUEUED/STOPPED） */
  runnerState: RunnerState
  /** 当前轮次（1=A0001, 2=A0002...） */
  currentRound: number
  /** 正在结束的轮次（10秒倒计时中，显示"A{N} 已结束"），null=没在倒计时 */
  endingRound: number | null
  /** 被中止的轮次（STP 触发后，显示"A{N} 已中止"），null=没在中止 */
  stoppedRound: number | null

  /** 当前在等 user_confirm 的引擎代码（如 'e02'/'e03'），用于 C{轮次}-u{序号} 路由重跑对应引擎 */
  confirmingEngine: string | null

  setTheme: (theme: Theme) => void
  setLanguage: (lang: Language) => void
  setLogLevel: (level: LogLevel) => void
  toggleTheme: () => void
  toggleHistoryOpen: () => void
  addTask: (task: TaskItem) => void
  renameTask: (id: string, name: string) => void
  loadTasks: (tasks: TaskItem[]) => void
  addExecutionAgent: () => void
  switchActiveTask: (id: string) => void
  setBlueprintDoc: (doc: BlueprintDocId) => void
  toggleBlueprintOpen: () => void
  /** 切换到指定 Agent 内部终端 */
  switchChatAgent: (agentId: string) => void
  /** 打开/关闭设置中心 */
  toggleSettings: (open?: boolean) => void
  /** 切换设置 Tab */
  setSettingsTab: (tab: SettingsTabId) => void
  /** 打开/关闭系统日志面板 */
  toggleSystemLogOpen: () => void
  /** 触發蓝图面板重新读取文件 */
  triggerBlueprintRefresh: () => void
  /** 设置全局轮次运行状态 */
  setRunnerState: (s: RunnerState) => void
  /** 设置当前轮次 */
  setCurrentRound: (n: number) => void
  /** 设置正在结束的轮次（10秒倒计时） */
  setEndingRound: (n: number | null) => void
  /** 设置被中止的轮次（STP 触发） */
  setStoppedRound: (n: number | null) => void
  setConfirmingEngine: (engine: string | null) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  theme: APP_CONFIG.defaultTheme as Theme,
  language: APP_CONFIG.defaultLanguage as Language,
  logLevel: APP_CONFIG.logLevel as LogLevel,
  isHistoryOpen: false,
  executionAgents: [{ id: '1', letter: 'D', title: '执行体 1 (D)' }],
  taskList: [],
  activeTaskId: '',
  isBlueprintOpen: false,
  activeBlueprintDoc: 'goals',
  activeChatAgentId: 'a',
  isSettingsOpen: false,
  activeSettingsTab: '',
  isSystemLogOpen: false,
  blueprintRefreshCounter: 0,
  runnerState: 'IDLE',
  currentRound: 1,
  endingRound: null,
  stoppedRound: null,
  confirmingEngine: null,

  setTheme: (theme) => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
    set({ theme })
  },

  setLanguage: (language) => set({ language }),
  setLogLevel: (logLevel) => set({ logLevel }),

  toggleTheme: () => {
    const { theme } = get()
    get().setTheme(theme === 'dark' ? 'light' : 'dark')
  },

  toggleHistoryOpen: () => {
    set((s) => ({ isHistoryOpen: !s.isHistoryOpen, isBlueprintOpen: false }))
  },

  addTask: (task) => set((s) => ({ taskList: [...s.taskList, task] })),

  renameTask: (id, name) => set((s) => ({
    taskList: s.taskList.map(t => t.id === id ? { ...t, name } : t),
  })),

  loadTasks: (tasks) => set({ taskList: tasks, activeTaskId: tasks[0]?.id ?? '' }),

  addExecutionAgent: () => {
    set((s) => {
      const newLetter = String.fromCharCode('D'.charCodeAt(0) + s.executionAgents.length)
      const updated = [
        ...s.executionAgents,
        {
          id: Date.now().toString(),
          letter: newLetter,
          title: `执行体 ${s.executionAgents.length + 1} (${newLetter})`,
        },
      ]
      // 持久化到 runtime/executors.json（异步，不阻塞 UI）
      const api = (window as any).electronAPI
      if (api?.file?.writeRaw) {
        api.file.writeRaw(
          'runtime/executors.json',
          JSON.stringify({ executors: updated, count: updated.length }, null, 2),
        ).catch(() => {})
      }
      return { executionAgents: updated }
    })
  },

  switchActiveTask: (id) => set({ activeTaskId: id }),

  setBlueprintDoc: (doc) => set({ activeBlueprintDoc: doc }),

  toggleBlueprintOpen: () => {
    set((s) => ({ isBlueprintOpen: !s.isBlueprintOpen, isHistoryOpen: false }))
  },

  switchChatAgent: (agentId) => set({ activeChatAgentId: agentId }),

  toggleSettings: (open) => {
    set((s) => {
      const nextOpen = open ?? !s.isSettingsOpen
      return {
        isSettingsOpen: nextOpen,
        isBlueprintOpen: nextOpen ? false : s.isBlueprintOpen,
        isHistoryOpen: nextOpen ? false : s.isHistoryOpen,
        activeSettingsTab: nextOpen ? '' : s.activeSettingsTab,
      }
    })
  },

  setSettingsTab: (tab) => set({ activeSettingsTab: tab }),

  toggleSystemLogOpen: () => set((s) => ({ isSystemLogOpen: !s.isSystemLogOpen })),

  triggerBlueprintRefresh: () => set((s) => ({ blueprintRefreshCounter: s.blueprintRefreshCounter + 1 })),

  setRunnerState: (runnerState) => set({ runnerState }),
  setCurrentRound: (currentRound) => set({ currentRound }),
  setEndingRound: (endingRound) => set({ endingRound }),
  setStoppedRound: (stoppedRound) => set({ stoppedRound }),
  setConfirmingEngine: (confirmingEngine) => set({ confirmingEngine }),
}))
