/**
 * 生成干净的发布目录 release/。
 *
 * 为什么要多这一层：
 *   1. uTools 要求发布目录里不能有调试文件与版本控制目录
 *      （*.js.map、*.css.map、*.js.gz、*.css.gz、.git/、.vscode/ 等）；
 *   2. 官方也建议「切勿将整个项目的根目录打包成插件应用」。
 *   所以仓库根目录只放工程文件（.git、scripts、README 等），插件本体在 plugin/，
 *   发布时再把 plugin/ 复制一份、剔除调试产物到 release/。
 *
 * 用法：
 *   npm run build:release     # 生成 release/ 并校验
 *   npm run check:release     # 只校验已有的 release/
 */

'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const { isDebugFile } = require('./strip-debug.js')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'plugin')
const OUT = path.resolve(ROOT, 'release')
const CHECK_ONLY = process.argv.includes('--check')

/* 发布目录里绝对不允许出现的文件 / 目录 */
const FORBIDDEN_NAMES = [
  '.git',
  '.gitignore',
  '.gitmodules',
  '.gitattributes',
  '.github',
  '.vscode',
  '.idea',
  '.cursor',
  '.trae',
  '.utoolsignore',
  '.DS_Store'
]

/* 复制时顺手跳过的无用文件（package-lock.json 是开发用的，运行时不需要） */
const SKIP_NAMES = new Set([...FORBIDDEN_NAMES, 'Thumbs.db', 'package-lock.json'])

/* 插件运行时必需的文件 */
const REQUIRED = [
  'plugin.json',
  'index.html',
  'index.js',
  'style.css',
  'preload.js',
  'logo.png',
  'package.json',
  'node_modules/marked/package.json',
  'scripts/normalize-md.js', // preload.js 运行时 require 的就是它
  'images/arthas-web-ui.png'
]

/* 文档按版本分目录：docs/<version>/ */
const VERSION_DIR_RE = /^\d+\.\d+\.\d+$/

/* ------------------------------------------------------------------ *
 * 复制 / 清理
 * ------------------------------------------------------------------ */
function copyEntry(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      if (SKIP_NAMES.has(name) || isDebugFile(name)) continue
      copyEntry(path.join(src, name), path.join(dest, name))
    }
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return fs.mkdirSync(dir, { recursive: true })
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git') continue // 保险：绝不删版本库
    fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */
function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    out.push(rel)
    if (fs.statSync(full).isDirectory()) walk(full, base, out)
  }
  return out
}

const isFile = (rel) => {
  const full = path.join(OUT, rel)
  return fs.existsSync(full) && fs.statSync(full).isFile()
}

function readPngSize(file) {
  const buf = fs.readFileSync(file)
  if (buf.length < 24 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** 模拟 uTools / Electron 的加载器：不会剥掉 `#!` shebang */
function compilesLikePreload(file) {
  const src = fs.readFileSync(file, 'utf8')
  try {
    new vm.Script(
      '(function (exports, require, module, __filename, __dirname, process, global, Buffer) {\n' +
        src +
        '\n})',
      { filename: path.relative(ROOT, file) }
    )
    return true
  } catch (err) {
    return err.message
  }
}

function validate() {
  const problems = []
  const entries = walk(OUT)

  // 1. 不允许出现的文件（版本控制 / 编辑器 / sourcemap / 预压缩产物）
  for (const e of entries) {
    const base = path.posix.basename(e)
    if (FORBIDDEN_NAMES.includes(base)) problems.push(`发布目录里不该有：${e}`)
    if (isDebugFile(base)) problems.push(`发布目录里不该有调试文件：${e}`)
  }

  // 2. 必需文件
  for (const r of REQUIRED) {
    if (!isFile(r)) problems.push(`缺少必需文件：${r}`)
  }

  // 3. plugin.json 声明的入口都在
  if (isFile('plugin.json')) {
    const plugin = JSON.parse(fs.readFileSync(path.join(OUT, 'plugin.json'), 'utf8'))
    for (const field of ['main', 'preload', 'logo']) {
      if (plugin[field] && !isFile(plugin[field])) {
        problems.push(`plugin.json 里的 ${field} 指向的文件不存在：${plugin[field]}`)
      }
    }
  }

  // 4. logo 必须是正方形（uTools 发布要求）
  if (isFile('logo.png')) {
    const size = readPngSize(path.join(OUT, 'logo.png'))
    if (!size) problems.push('logo.png 不是有效 PNG')
    else if (size.width !== size.height) {
      problems.push(`logo.png 必须是正方形，当前为 ${size.width}x${size.height}`)
    }
  }

  // 5. 文档齐全（每个版本目录各自一份 docs-list.json / docs-group.json）
  const docsRoot = path.join(OUT, 'docs')
  const versionDirs = fs.existsSync(docsRoot)
    ? fs.readdirSync(docsRoot).filter((name) => {
        if (!VERSION_DIR_RE.test(name)) return false
        return fs.statSync(path.join(docsRoot, name)).isDirectory()
      }).sort()
    : []

  if (!versionDirs.length) {
    problems.push('docs/ 下没有任何版本目录（docs/<version>/）')
  }

  for (const version of versionDirs) {
    const dir = path.join(docsRoot, version)
    const listPath = path.join(dir, 'docs-list.json')
    if (!fs.existsSync(listPath)) {
      problems.push(`版本 ${version} 缺少 docs-list.json`)
      continue
    }
    if (!fs.existsSync(path.join(dir, 'docs-group.json'))) {
      problems.push(`版本 ${version} 缺少 docs-group.json`)
    }

    const keys = Object.keys(JSON.parse(fs.readFileSync(listPath, 'utf8')))
    for (const key of keys) {
      if (!fs.existsSync(path.join(dir, `${key}.md`))) {
        problems.push(`版本 ${version} 的 docs-list.json 里 ${key} 缺少 ${key}.md`)
      }
    }
    const mdCount = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').length
    if (mdCount !== keys.length) {
      problems.push(`版本 ${version} 的文档数量(${mdCount}) 与 docs-list.json(${keys.length}) 不一致`)
    }
  }

  // 6. 被 preload require 的本地模块必须跟着打包，且不能带 shebang
  if (isFile('preload.js')) {
    const src = fs.readFileSync(path.join(OUT, 'preload.js'), 'utf8')
    const requires = [...src.matchAll(/require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g)].map((m) => m[1])
    for (const req of requires) {
      const target = req.replace(/^\.\//, '')
      if (!isFile(target) && !isFile(target + '.js') && !fs.existsSync(path.join(OUT, target))) {
        problems.push(`preload.js require 的 ${req} 没有打包进发布目录`)
      }
    }
  }
  for (const f of ['preload.js', 'scripts/normalize-md.js']) {
    if (!isFile(f)) continue
    const result = compilesLikePreload(path.join(OUT, f))
    if (result !== true) problems.push(`${f} 无法在 Electron 式加载器下编译：${result}`)
  }

  return { problems, entries }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
function main() {
  if (!CHECK_ONLY) {
    if (!fs.existsSync(SRC)) {
      console.error('找不到 plugin/ 目录')
      process.exitCode = 1
      return
    }
    emptyDir(OUT)
    for (const name of fs.readdirSync(SRC)) {
      if (SKIP_NAMES.has(name) || isDebugFile(name)) continue
      copyEntry(path.join(SRC, name), path.join(OUT, name))
    }
    console.log(`\n已生成发布目录：release/`)
  }

  const { problems, entries } = validate()
  const files = entries.filter((e) => fs.statSync(path.join(OUT, e)).isFile())
  const bytes = files.reduce((sum, f) => sum + fs.statSync(path.join(OUT, f)).size, 0)

  console.log(`文件数：${files.length}    总大小：${(bytes / 1024 / 1024).toFixed(2)} MB`)
  console.log('顶层内容：')
  for (const name of fs.readdirSync(OUT).sort()) {
    const full = path.join(OUT, name)
    if (fs.statSync(full).isDirectory()) {
      const n = walk(full, OUT).filter((e) => fs.statSync(path.join(OUT, e)).isFile()).length
      console.log(`  ${name}/  (${n} 个文件)`)
    } else {
      console.log(`  ${name}`)
    }
  }

  if (problems.length) {
    console.error(`\n❌ 校验未通过（${problems.length} 项）：`)
    problems.forEach((p) => console.error('  - ' + p))
    process.exitCode = 1
    return
  }
  console.log('\n✅ 校验通过：无调试文件与版本控制目录，运行时依赖齐全，logo 为正方形')
  console.log('   在 uTools 开发者工具中选择 release/ 目录进行打包 / 发布。')
}

main()
