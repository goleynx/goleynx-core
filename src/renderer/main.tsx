/**
 * @file React 渲染进程入口
 * @module renderer/main
 * @description 挂载 React 根组件到 DOM，配置全局 Provider。
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/styles/global.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('未找到 #root 元素，请检查 index.html')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
