import { create } from 'zustand'

interface EditorStore {
  currentCode: string
  currentFilePath: string
  /** 最近一次成功写入磁盘的时间戳 */
  lastSavedTime: number | null
  setCode: (code: string) => void
  setFilePath: (path: string) => void
  markSaved: () => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  currentCode: '',
  currentFilePath: '',
  lastSavedTime: null,
  setCode: (code) => set({ currentCode: code }),
  setFilePath: (path) => set({ currentFilePath: path }),
  markSaved: () => set({ lastSavedTime: Date.now() }),
}))
