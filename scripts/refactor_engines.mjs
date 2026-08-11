// 一次性重构脚本：把 project.ts 里内联的 8 个引擎常量抽到 src/main/engines/*.json，
// 并把初始化逻辑改为「从源目录复制（每次覆盖）」。只做文本变换，不依赖 electron 运行时。
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_TS = join(__dirname, '..', 'src', 'main', 'project.ts')
const ENGINES_DIR = join(__dirname, '..', 'src', 'main', 'engines')

const NAMES = ['E01', 'E07', 'E02', 'E03', 'E05', 'E08', 'E06', 'E10']
const FILE_MAP = { E01: 'e01', E07: 'e07', E02: 'e02', E03: 'e03', E05: 'e05', E08: 'e08', E06: 'e06', E10: 'e10' }

// 找到 `const ENGINE_ExX = JSON.stringify(` 对应对象/数组字面量，以及整个调用结尾的 `)`
function findLiteral(orig, name) {
  const marker = `const ENGINE_${name} = JSON.stringify(`
  const idx = orig.indexOf(marker)
  if (idx < 0) throw new Error(`找不到常量 ENGINE_${name}`)
  const openParen = idx + marker.length - 1

  // 1) 找到字面量开头的 { 或 [（在字符串之外）
  let p = idx + marker.length
  let inStr = null
  let openIdx = -1
  let openChar = ''
  while (p < orig.length) {
    const c = orig[p]
    if (inStr) {
      if (c === '\\') { p += 2; continue }
      if (c === inStr) inStr = null
      p++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; p++; continue }
    if (c === '{' || c === '[') { openIdx = p; openChar = c; break }
    p++
  }
  if (openIdx < 0) throw new Error(`找不到对象开头 ENGINE_${name}`)

  // 2) 匹配对应的 } 或 ]（跳过字符串与嵌套括号）
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  while (p < orig.length) {
    const c = orig[p]
    if (inStr) {
      if (c === '\\') { p += 2; continue }
      if (c === inStr) inStr = null
      p++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; p++; continue }
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0 && c === closeChar) { p++; break }
    }
    p++
  }
  const literal = orig.slice(openIdx, p)

  // 3) 找到 JSON.stringify(...) 调用结尾的 `)`
  let pp = openParen
  let parenDepth = 0
  let inStr2 = null
  while (pp < orig.length) {
    const c = orig[pp]
    if (inStr2) {
      if (c === '\\') { pp += 2; continue }
      if (c === inStr2) inStr2 = null
      pp++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr2 = c; pp++; continue }
    if (c === '(') parenDepth++
    else if (c === ')') { parenDepth--; if (parenDepth === 0) { pp++; break } }
    pp++
  }
  return { idx, literal, callClose: pp }
}

const orig = readFileSync(PROJECT_TS, 'utf-8')
mkdirSync(ENGINES_DIR, { recursive: true })
const ranges = []
for (const name of NAMES) {
  const { idx, literal, callClose } = findLiteral(orig, name)
  let obj
  try {
    obj = eval('(' + literal + ')')
  } catch (e) {
    throw new Error(`解析 ENGINE_${name} 失败: ${e.message}`)
  }
  const json = JSON.stringify(obj, null, 2)
  writeFileSync(join(ENGINES_DIR, `${FILE_MAP[name]}.json`), json, 'utf-8')
  console.log(`✓ ${FILE_MAP[name]}.json (${json.length} bytes)`)

  // 删除范围：含前导注释行 + 整个 `const ENGINE_ExX = JSON.stringify(...)；`
  const lineStart = orig.lastIndexOf('\n', idx) + 1
  const prevLineStart = orig.lastIndexOf('\n', lineStart - 1) + 1
  const prevLine = orig.slice(prevLineStart, lineStart).trim()
  let removeStart = lineStart
  if (prevLine.startsWith('//')) removeStart = prevLineStart
  let after = callClose
  if (orig[after] === ';') after++
  while (orig[after] === '\n' || orig[after] === '\r') after++
  ranges.push({ removeStart, after })
}

// ── Pass 2：改写 project.ts ──
let t = orig
ranges.sort((a, b) => b.removeStart - a.removeStart)
for (const r of ranges) {
  t = t.slice(0, r.removeStart) + t.slice(r.after)
}

t = t.replace(
  "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'",
  "import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs'"
)
t = t.replace(
  "import type { ElectronApp } from 'electron'",
  "import { app, type ElectronApp } from 'electron'"
)

const loader = `
function getEnginesSourceDir(): string {
  // 打包后引擎随 extraResources 落在 resources/engines；开发期读源码 src/main/engines
  if (app.isPackaged) return join(process.resourcesPath, 'engines')
  return join(app.getAppPath(), 'src', 'main', 'engines')
}
`
t = t.replace(
  "import { app, type ElectronApp } from 'electron'",
  "import { app, type ElectronApp } from 'electron'" + loader
)

const startM = t.indexOf('  // 4. 预创建 engines 引擎文件')
const endM = t.indexOf('  // 调度指令目录 & 驳回指令目录')
if (startM < 0 || endM < 0) throw new Error('找不到初始化第 4 步区块')
const NEW_BLOCK = `  // 4. 同步 engines 引擎文件（来源：软件本体 src/main/engines，每次覆盖 → 改一个只影响一个）
  const engineSourceDir = getEnginesSourceDir()
  const engineFiles = ['e01', 'e02', 'e03', 'e05', 'e06', 'e07', 'e08', 'e10']
  for (const name of engineFiles) {
    const srcFile = join(engineSourceDir, \`\${name}.json\`)
    const dstFile = g(\`engines/\${name}.json\`)
    if (existsSync(srcFile)) copyFileSync(srcFile, dstFile)
    else console.warn(\`[engines] 缺少源文件: \${srcFile}\`)
  }`
t = t.slice(0, startM) + NEW_BLOCK + '\n' + t.slice(endM)

writeFileSync(PROJECT_TS, t, 'utf-8')
console.log('✓ project.ts 已改写')
console.log('✓ 重构完成')
