/**
 * 安装 plugin/ 的依赖（marked），并顺手清理依赖里带的 .map。
 *
 * 由根目录 package.json 的 postinstall 调用，所以只需要在仓库根目录执行一次
 * `npm install` 就够了；当然也可以手动 `npm run install:plugin`。
 *
 * 注意：
 *   1. plugin/ 里的 package.json 故意不写任何 scripts，避免 postinstall 递归；
 *   2. 子进程会清掉继承来的 npm_config_* / npm_lifecycle_* 环境变量，
 *      否则嵌套的 npm install 行为会受父进程影响。
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const PLUGIN_DIR = path.join(ROOT, 'plugin')

function runNpmInstall() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^npm_(lifecycle|config|package|command|exec)/.test(key)) delete env[key]
  }
  env.npm_config_global = 'false'

  const npmCli = process.env.npm_execpath
  const args = ['install', '--no-audit', '--no-fund', '--loglevel=error']

  const result = npmCli && /\.(?:c?js|mjs)$/.test(npmCli)
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd: PLUGIN_DIR, env, stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd: PLUGIN_DIR,
        env,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      })

  return result.status === 0
}

function main() {
  console.log('安装 plugin/ 依赖 ...')
  if (!runNpmInstall()) {
    console.error('⚠️ 自动安装失败，请手动执行：cd plugin && npm install')
    process.exitCode = 1
    return
  }
  if (!fs.existsSync(path.join(PLUGIN_DIR, 'node_modules', 'marked'))) {
    console.error('⚠️ plugin/node_modules/marked 不存在，请手动执行：cd plugin && npm install')
    process.exitCode = 1
    return
  }

  // 依赖里一般会带 sourcemap，顺手清掉
  const { stripDebug } = require('./strip-debug.js')
  const dirty = stripDebug(PLUGIN_DIR)
  if (dirty.length) {
    dirty.forEach((rel) => fs.rmSync(path.join(PLUGIN_DIR, rel), { force: true }))
    console.log(`plugin/ 依赖安装完成，并清理了 ${dirty.length} 个 .map 调试文件`)
  } else {
    console.log('plugin/ 依赖安装完成')
  }
}

main()
