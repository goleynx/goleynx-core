/**
 * @file Electron 主进程入口
 * @module main/index
 * @description 创建 BrowserWindow，加载渲染进程。
 */

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { setupIPC } from './ipc'
import { loadWindowState, saveWindowState } from './window'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const savedBounds = loadWindowState()

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 900,
    minHeight: 500,
    title: 'Goleynx',
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (savedBounds.x !== undefined && savedBounds.y !== undefined) {
    mainWindow.setBounds(savedBounds)
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow.getBounds())
    }
  })

  // HMR 热更新开发模式
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
