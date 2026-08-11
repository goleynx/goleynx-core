/** 文件状态管理 — 从终端执行记录和审查记录中加载所有文件的状态 */

export type FileStatus = 'empty' | 'written' | 'under_review' | 'approved' | 'rejected' | 'dirty'

export const STATUS_LABEL: Record<FileStatus, string> = {
  empty: '⚪ 空',
  written: '📝 已写',
  under_review: '🟡 审查中',
  approved: '✅ 通过',
  rejected: '❌ 驳回',
  dirty: '🟠 手动修改',
}

/** 文件状态在 4% 状态栏中的图标 */
export const STATUS_ICON: Record<FileStatus, string> = {
  empty: '■',
  written: '●',
  under_review: '●',
  approved: '✓',
  rejected: '✗',
  dirty: '■',
}

/** 文件状态在 4% 状态栏中的颜色 */
export const STATUS_COLOR: Record<FileStatus, string> = {
  empty: '#9ca3af',
  written: '#f59e0b',
  under_review: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  dirty: '#9ca3af',
}

/** 获取单个文件状态 */
export function getFileStatus(_filePath: string): FileStatus {
  return 'empty'
}

/** 设置单个文件状态 */
export function setFileStatus(_filePath: string, _status: FileStatus): void {
  // 状态通过 loadStatusMap() 统一加载
}

/** 获取所有文件的状态表 */
export function getStatusMap(): Record<string, FileStatus> {
  return {}
}

/**
 * 从 401 终端记录中提取已写入的文件路径
 * executor-driver 代码生成格式：✅ workspace/xxx.ts (N.N KB)
 * 这是 TypeScript 代码生成的，格式 100% 一致
 */
function extractWrittenFiles(entries: any[]): string[] {
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.content || typeof entry.content !== 'string') continue
    // 匹配 "✅ workspace/xxx.ts (N.N KB)" 格式
    const regex = /✅\s+(workspace\/[^\s)]+)/g
    let m
    while ((m = regex.exec(entry.content)) !== null) {
      const p = m[1].trim()
      if (!paths.includes(p)) paths.push(p)
    }
  }
  return paths
}

/**
 * 从 401 终端根目录 conversations.json（e08 打回通知）提取文件路径
 * e08 引擎在审查不通过时写入，每条通知的"需要重写的文件"段落列出完整文件清单
 * 格式：需要重写的文件：\nworkspace/xxx.ts\nworkspace/yyy.ts\n...
 */
function extractFilesFromRejectNotices(entries: any[]): string[] {
  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.content || typeof entry.content !== 'string') continue
    // 直接从内容中提取所有 workspace/ 开头的路径
    const regex = /workspace\/[^\n\r\s,)'"]+/g
    let m
    while ((m = regex.exec(entry.content)) !== null) {
      const p = m[0].trim()
      if (!paths.includes(p)) paths.push(p)
    }
  }
  return paths
}

/**
 * 加载所有文件的状态表
 * 1. 读 File 2（d/conversations.json）→ executor-driver 的 ✅ 执行摘要
 * 2. 读 File 1（terminals/d/conversations.json）→ e08 的打回通知（含完整文件清单）
 * 3. 合并两个来源 → 完整文件清单
 * 4. 读 reviews.json → 找最新"最终审查"结果（pass / reject）
 * 5. 交叉匹配 → 有文件 + pass=approved / + reject=rejected / + 无审查=written
 */
export async function loadStatusMap(): Promise<Record<string, FileStatus>> {
  const api = (window as any).electronAPI
  if (!api) return {}

  const map: Record<string, FileStatus> = {}
  const writtenFiles: string[] = []

  // 1. 读 File 2（executor-driver 执行摘要）→ ✅ 格式
  try {
    const entries = await api.storage?.get?.('d')
    if (Array.isArray(entries)) {
      for (const fp of extractWrittenFiles(entries)) {
        if (!writtenFiles.includes(fp)) writtenFiles.push(fp)
      }
    }
  } catch {}

  // 2. 读 File 1（e08 打回通知，根目录 conversations.json）→ 完整文件清单
  try {
    const raw = await api.file.readRaw('runtime/terminals/d/conversations.json')
    const entries = JSON.parse(raw || '[]')
    if (Array.isArray(entries)) {
      for (const fp of extractFilesFromRejectNotices(entries)) {
        if (!writtenFiles.includes(fp)) writtenFiles.push(fp)
      }
    }
  } catch {}

  if (writtenFiles.length === 0) return map

  // 3. 读 reviews.json → 找最新"最终审查"状态
  let latestReviewStatus: 'pass' | 'reject' | null = null
  try {
    const raw = await api.file.readRaw('runtime/panels/c/reviews.json')
    const reviews = JSON.parse(raw || '[]')
    if (Array.isArray(reviews)) {
      for (const review of reviews) {
        if (review.reviewType && review.reviewType.includes('最终审查')) {
          if (review.status === 'pass') latestReviewStatus = 'pass'
          else if (review.status === 'reject') latestReviewStatus = 'reject'
        }
      }
    }
  } catch {}

  // 4. 映射文件状态
  for (const fp of writtenFiles) {
    if (latestReviewStatus === 'pass') {
      map[fp] = 'approved'        // ✓ 绿色
    } else if (latestReviewStatus === 'reject') {
      map[fp] = 'rejected'        // ✗ 红色
    } else {
      map[fp] = 'written'         // ● 橙色（已写入，等待审查）
    }
  }

  return map
}
