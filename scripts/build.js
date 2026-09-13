/**
 * 组装一个干净的发布目录（默认 `.dist/`），只包含插件运行时真正需要的文件。
 *
 * 为什么要这么做：
 *   1. uTools 发布要求「发布文件夹下不能包含 .git/、.gitignore、.vscode/、
 *      *.js.map 等版本控制/编辑器文件」（见官方 FAQ「发布时的资源清洁」）；
 *   2. 官方也建议「切勿将整个项目的根目录打包成插件应用」。
 *   所以这里按白名单复制，而不是在项目根目录直接打包。
 *
 * 用法：
 *   npm run build             # 生成 .dist/
 *   node scripts/build.js out # 生成到指定目录
 *   node scripts/build.js --check   # 只校验已有 .dist/，不重新生成
 */

'use strict'

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..')
const OUT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(ROOT, '.dist'))
const CHECK_ONLY = process.argv.includes('--check')

/* 白名单：插件运行必需的文件 / 目录 */
const INCLUDE = [
  'plugin.json',
  'index.html',
  'index.js',
  'style.css',
  'preload.js',
  'logo.png',
  'docs',
  'images',
  'docs-list.json',
  'docs-group.json',
  'package.json',
  'node_modules',
  'scripts/normalize-md.js' // preload.js 运行时 require 的就是它
]

/* 发布目录里绝对不允许出现的文件 / 目录（uTools 官方清单 + 常见垃圾） */
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
  '.dist',
  '.DS_Store'
]
const FORBIDDEN_EXTS = ['.map']

/* 复制时顺手跳过的无用文件（sourcemap 也在 uTools 的禁止清单里） */
const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db'])
const shouldSkip = (name) =>
  SKIP_NAMES.has(name) || FORBIDDEN_EXTS.some((ext) => name.endsWith(ext))

/* ------------------------------------------------------------------ *
 * 复制
 * ------------------------------------------------------------------ */
function copyEntry(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      if (shouldSkip(name)) continue
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
      { filename: rel(file) }
    )
    return true
  } catch (err) {
    return err.message
  }
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')

function validate() {
  const problems = []
  const entries = walk(OUT)

  // 1. 不允许出现的文件
  for (const e of entries) {
    const base = path.posix.basename(e)
    if (FORBIDDEN_NAMES.includes(base)) problems.push(`发布目录里不该有：${e}`)
    if (FORBIDDEN_EXTS.some((ext) => base.endsWith(ext))) problems.push(`发布目录里不该有 sourcemap：${e}`)
  }

  // 2. 必需文件
  const required = [
    'plugin.json',
    'index.html',
    'index.js',
    'style.css',
    'preload.js',
    'logo.png',
    'docs-list.json',
    'docs-group.json',
    'package.json',
    'node_modules/marked/package.json',
    'scripts/normalize-md.js',
    'images/arthas-web-ui.png'
  ]
  for (const r of required) {
    if (!fs.existsSync(path.join(OUT, r))) problems.push(`缺少必需文件：${r}`)
  }

  // 3. 插件入口声明的文件都在
  if (fs.existsSync(path.join(OUT, 'plugin.json'))) {
    const plugin = JSON.parse(fs.readFileSync(path.join(OUT, 'plugin.json'), 'utf8'))
    for (const field of ['main', 'preload', 'logo']) {
      if (plugin[field] && !fs.existsSync(path.join(OUT, plugin[field]))) {
        problems.push(`plugin.json 里的 ${field} 指向的文件不存在：${plugin[field]}`)
      }
    }
  }

  // 4. logo 必须是正方形
  const logo = path.join(OUT, 'logo.png')
  if (fs.existsSync(logo)) {
    const size = readPngSize(logo)
    if (!size) problems.push('logo.png 不是有效 PNG')
    else if (size.width !== size.height) {
      problems.push(`logo.png 必须是正方形，当前为 ${size.width}x${size.height}`)
    }
  }

  // 5. 文档齐全
  if (fs.existsSync(path.join(OUT, 'docs-list.json'))) {
    const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, 'docs-list.json'), 'utf8')))
    for (const key of keys) {
      if (!fs.existsSync(path.join(OUT, 'docs', `${key}.md`))) {
        problems.push(`docs-list.json 里的 ${key} 缺少 docs/${key}.md`)
      }
    }
    const mdCount = fs.readdirSync(path.join(OUT, 'docs')).filter((f) => f.endsWith('.md')).length
    if (mdCount !== keys.length) problems.push(`docs 数量(${mdCount}) 与 docs-list.json(${keys.length}) 不一致`)
  }

  // 6. 被 preload require 的脚本不能带 shebang（否则插件打不开）
  for (const f of ['preload.js', 'scripts/normalize-md.js']) {
    const full = path.join(OUT, f)
    if (!fs.existsSync(full)) continue
    const result = compilesLikePreload(full)
    if (result !== true) problems.push(`${f} 无法在 Electron 式加载器下编译：${result}`)
  }

  return { problems, entries }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
function main() {
  if (!CHECK_ONLY) {
    emptyDir(OUT)
    for (const item of INCLUDE) {
      const src = path.join(ROOT, item)
      if (!fs.existsSync(src)) {
        console.error(`[skip] 源文件不存在：${item}`)
        continue
      }
      copyEntry(src, path.join(OUT, item))
    }
    console.log(`\n已生成发布目录：${rel(OUT)}/`)
  }

  const { problems, entries } = validate()
  const files = entries.filter((e) => fs.statSync(path.join(OUT, e)).isFile())
  const bytes = files.reduce((sum, f) => sum + fs.statSync(path.join(OUT, f)).size, 0)

  console.log(`文件数：${files.length}    总大小：${(bytes / 1024 / 1024).toFixed(2)} MB`)
  console.log('顶层内容：')
  for (const name of fs.readdirSync(OUT).sort()) {
    const full = path.join(OUT, name)
    const isDir = fs.statSync(full).isDirectory()
    if (isDir) {
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
  console.log('\n✅ 校验通过：没有 .git 等禁止文件，运行时依赖齐全，logo 为正方形')
  console.log('   在 uTools 开发者工具里选择该目录即可打包。')
}

main()
