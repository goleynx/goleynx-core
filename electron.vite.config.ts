import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { builtinModules } from 'node:module'

// 只把 electron 和 Node 内置模块外置，其余 npm 依赖（如 openai）全部打进产物，
// 否则 electron-builder 排除 node_modules 后运行时 require('openai') 会崩。
const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  main: {
    build: {
      // electron-vite 专属字段：禁用依赖外置——所有 npm 依赖（含 openai）全部
      // 内联进 out/main/index.js。否则 electron-builder 排除 node_modules 后
      // 运行时 require('openai') 会因找不到包而崩溃（Cannot find module 'openai'）。
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external,
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        external,
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@panels': resolve(__dirname, 'src/renderer/panels'),
        '@stores': resolve(__dirname, 'src/stores')
      }
    },
    plugins: [react()]
  }
})
