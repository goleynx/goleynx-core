import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: { node: process.versions.node, electron: process.versions.electron, chrome: process.versions.chrome },
  window: { minimize: () => ipcRenderer.invoke('window:minimize'), maximize: () => ipcRenderer.invoke('window:maximize'), close: () => ipcRenderer.invoke('window:close') },
  readBlueprint: (docId: string) => ipcRenderer.invoke('file:read-blueprint', docId),
  writeBlueprint: (docId: string, content: string) => ipcRenderer.invoke('file:write-blueprint', docId, content),
  ai: {
    providers: () => ipcRenderer.invoke('ai:providers'),
    availableModels: () => ipcRenderer.invoke('ai:available'),
    chat: (args: any) => ipcRenderer.invoke('ai:chat', args),
    onChunk: (cb: any) => { ipcRenderer.on('ai:chunk', (_e, c) => cb(c)); return () => ipcRenderer.removeAllListeners('ai:chunk') },
  },
  key: { set: (id: string, key: string) => ipcRenderer.invoke('key:set', id, key), get: (id: string) => ipcRenderer.invoke('key:get', id), delete: (id: string) => ipcRenderer.invoke('key:delete', id), has: (id: string) => ipcRenderer.invoke('key:has', id) },
  storage: {
    append: (agentId: string, message: { timestamp: string; role: 'user' | 'model'; content: string; modelId?: string }) =>
      ipcRenderer.invoke('storage:append', agentId, message),
    get: (agentId: string) => ipcRenderer.invoke('storage:get', agentId),
  },
  file: {
    write: (filename: string, content: string) => ipcRenderer.invoke('file:write', filename, content),
    readRaw: (relPath: string) => ipcRenderer.invoke('file:read-raw', relPath),
    writeRaw: (relPath: string, content: string) => ipcRenderer.invoke('file:write-raw', relPath, content),
    listRaw: (relPath: string) => ipcRenderer.invoke('file:list-raw', relPath),
    listWorkspace: () => ipcRenderer.invoke('file:list-workspace'),
    readWorkspace: (relPath: string) => ipcRenderer.invoke('file:read-workspace', relPath),
    deleteWorkspace: (relPath: string) => ipcRenderer.invoke('file:delete-workspace', relPath),
    syslogAppend: (entry: Record<string, unknown>) => ipcRenderer.invoke('file:syslog-append', entry),
  },
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    info: () => ipcRenderer.invoke('project:info'),
    create: () => ipcRenderer.invoke('project:create'),
    rename: (projectId: string, newName: string) => ipcRenderer.invoke('project:rename', projectId, newName),
  },
  executor: {
    create: () => ipcRenderer.invoke('executor:create'),
  },
})
