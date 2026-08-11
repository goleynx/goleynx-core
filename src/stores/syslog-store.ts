import { create } from 'zustand'
import type { LogCategory, SystemLogEntry } from '@shared/bus'

function persistLog(entry: Omit<SystemLogEntry, 'id'>) {
  try { (window as any).electronAPI?.file?.syslogAppend?.(entry) } catch { /* fire-and-forget */ }
}

interface SyslogStore {
  enabled: boolean
  logs: SystemLogEntry[]
  setEnabled: (enabled: boolean) => void
  addLog: (entry: Omit<SystemLogEntry, 'id'>) => void
  clearLogs: () => void
}

export const useSyslogStore = create<SyslogStore>((set) => ({
  enabled: true,
  logs: [],
  setEnabled: (enabled) => set({ enabled }),
  addLog: (entry) => {
    persistLog(entry)  // 异步落盘到 runtime/syslog/{date}.log（不阻塞 UI）
    set((s) => ({
      logs: s.enabled
        ? [...s.logs, { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]
        : s.logs,
    }))
  },
  clearLogs: () => set({ logs: [] }),
}))
