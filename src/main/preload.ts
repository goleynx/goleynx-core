import { contextBridge } from 'electron'

/**
 * Preload 脚本 —— 暴露安全的 API 给渲染进程
 * 当前阶段仅暴露最小接口，后续按需扩展
 */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
})
