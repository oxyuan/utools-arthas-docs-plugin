/**
 * 清理「调试文件」。
 *
 * uTools 要求发布目录里不能包含调试产物，常见的有：
 *   *.js.map / *.css.map      （sourcemap，会把源码暴露出去）
 *   *.js.gz  / *.css.gz       （预压缩的调试/构建产物）
 * node_modules 里也会带 .map（例如 marked 就自带 3 个），所以必须递归清理。
 *
 * 用法：
 *   npm run strip-debug              # 清理 plugin/
 *   npm run strip-debug -- release   # 清理指定目录（可传多个）
 *   npm run strip-debug -- --check   # 只检查有没有残留，有残留则退出码 1
 */

'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

/* 需要清理的调试文件后缀 */
const DEBUG_EXTS = ['.js.map', '.css.map', '.js.gz', '.css.gz', '.map']

/* 顺便检查一下有没有混进版本控制 / 编辑器目录（只警告，不自动删） */
const FORBIDDEN_NAMES = [
  '.git',
  '.gitignore',
  '.gitmodules',
  '.gitattributes',
  '.github',
  '.vscode',
  '.idea',
  '.cursor',
  '.trae'
]

const isDebugFile = (name) => DEBUG_EXTS.some((ext) => name.endsWith(ext))

/** 递归收集调试文件，返回相对 base 的路径 */
function stripDebug(dir, found = [], base = dir) {
  if (!fs.existsSync(dir)) return found
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      stripDebug(full, found, base)
      continue
    }
    if (isDebugFile(name)) found.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return found
}

function findForbidden(dir, found = []) {
  if (!fs.existsSync(dir)) return found
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (FORBIDDEN_NAMES.includes(name)) {
      found.push(path.relative(dir, full).split(path.sep).join('/'))
      continue
    }
    if (fs.statSync(full).isDirectory()) findForbidden(full, found)
  }
  return found
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
function main() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const dirs = args.filter((a) => !a.startsWith('--'))
  const targets = (dirs.length ? dirs : ['plugin']).map((d) => path.resolve(ROOT, d))

  let totalRemoved = 0
  let dirty = 0

  for (const dir of targets) {
    const name = path.relative(ROOT, dir) || '.'
    if (!fs.existsSync(dir)) {
      console.error(`跳过不存在的目录：${name}`)
      continue
    }

    const dirtyFiles = stripDebug(dir)
    if (dirtyFiles.length) {
      dirty += dirtyFiles.length
      if (!checkOnly) {
        for (const rel of dirtyFiles) fs.rmSync(path.join(dir, rel), { force: true })
      }
    }

    if (checkOnly) {
      if (dirtyFiles.length) {
        console.error(`${name}/ 仍有 ${dirtyFiles.length} 个调试文件：`)
        dirtyFiles.slice(0, 5).forEach((f) => console.error('  - ' + f))
        if (dirtyFiles.length > 5) console.error(`  ...另有 ${dirtyFiles.length - 5} 个`)
      } else {
        console.log(`${name}/ 没有调试文件`)
      }
    } else if (dirtyFiles.length) {
      console.log(`${name}/ 清理了 ${dirtyFiles.length} 个调试文件（*.js.map / *.css.map / *.js.gz / *.css.gz）`)
    } else {
      console.log(`${name}/ 没有需要清理的调试文件`)
    }
    totalRemoved += dirtyFiles.length

    const forbidden = findForbidden(dir)
    if (forbidden.length) {
      console.warn(`${name}/ ⚠️ 混进了版本控制 / 编辑器目录，打包前请删除：`)
      forbidden.forEach((f) => console.warn('  - ' + f))
    }
  }

  if (checkOnly && dirty) process.exitCode = 1
  if (!checkOnly && totalRemoved) console.log(`\n共清理 ${totalRemoved} 个调试文件`)
}

module.exports = { stripDebug, findForbidden, isDebugFile }

if (require.main === module) main()
