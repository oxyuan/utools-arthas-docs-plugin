/**
 * Arthas 文档 Markdown 规范化脚本
 *
 * ⚠️ 本文件会被 preload.js `require`，所以：
 *   1. 文件开头 **不能加 `#!` shebang**。uTools 的 preload 跑在 Electron 的
 *      vm 里，它的模块加载器不会像 Node 那样剥掉 shebang，会直接抛
 *      `SyntaxError: Invalid or unexpected token`，导致整个插件打不开。
 *      运行时请用 `npm run normalize` / `node scripts/normalize-md.js`。
 *   2. 只能使用 CommonJS 语法（`require` / `module.exports`）。
 *
 * 这些文档最初由「HTML 页面 -> Markdown」转换而来，会留下大量转换痕迹，
 * 例如标题里的锚点链接 `## [#](#参数说明) 参数说明`、被压平的提示块
 * `> 提示`、丢失的表格内联代码、缺失的代码块语言标注等。
 *
 * 本脚本把这些痕迹统一清理成规范、稳定的 Markdown。
 *
 * 用法（在仓库根目录执行）：
 *   npm run normalize                       # 就地修复 plugin/docs/*.md
 *   npm run check                           # 只检查，不写入（退出码 1 表示存在差异）
 *   node plugin/scripts/normalize-md.js --stdout <file>   # 打印规范化结果，便于对比
 */

'use strict'

const fs = require('fs')
const path = require('path')

const DOCS_DIR = path.join(__dirname, '..', 'docs')

/* 文档按版本分目录存放：docs/<version>/*.md
 * 同时兼容早期扁平存放的 docs/*.md（若存在）。
 * 版本目录下的 README.md 是索引，不做规范化。 */
const VERSION_DIR_RE = /^\d+\.\d+\.\d+$/

function collectDocFiles() {
  const files = []
  let entries = []
  try {
    entries = fs.readdirSync(DOCS_DIR).sort()
  } catch (err) {
    return files
  }

  for (const name of entries) {
    const full = path.join(DOCS_DIR, name)
    let stat
    try {
      stat = fs.statSync(full)
    } catch (err) {
      continue
    }
    if (stat.isDirectory()) {
      if (!VERSION_DIR_RE.test(name)) continue
      for (const f of fs.readdirSync(full).filter(x => x.endsWith('.md') && x !== 'README.md').sort()) {
        files.push({ rel: `${name}/${f}`, full: path.join(full, f) })
      }
    } else if (name.endsWith('.md')) {
      files.push({ rel: name, full })
    }
  }
  return files
}

/** 提示类容器的标题，对应站点的 ::: tip / ::: warning 等容器 */
const CALLOUT_TITLES = ['提示', '注意', '警告', '小技巧', '说明']

/* ------------------------------------------------------------------ *
 * 1. 标题锚点
 *    `## [#](#参数说明) 参数说明`  ->  `## 参数说明`
 * ------------------------------------------------------------------ */
function stripHeadingAnchors(text) {
  return text.replace(/^([ \t]{0,3}#{1,6})[ \t]*\[#\]\(#[^)]*\)[ \t]*/gm, '$1 ')
}

/* ------------------------------------------------------------------ *
 * 1b. Setext 标题
 *    转换器把 `<h2 id="jvm-相关">jvm 相关</h2>` 变成了：
 *        [#](#jvm-相关) jvm 相关
 *        -------------------
 *    需要还原成 `## jvm 相关`。
 * ------------------------------------------------------------------ */
function stripInlineAnchor(line) {
  return line.replace(/^\s*\[#\]\(#[^)]*\)\s*/, '').trim()
}

function looksLikeBlockStart(line) {
  return /^\s*(#{1,6}\s|>|\||```|[-*+]\s|\d+[.)]\s)/.test(line)
}

function normalizeSetextHeadings(text) {
  const lines = text.split('\n')
  const out = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]*```/.test(lines[i])) inFence = !inFence
    const candidate = lines[i]
    const next = lines[i + 1]
    if (
      !inFence &&
      candidate.trim() &&
      !looksLikeBlockStart(candidate) &&
      next !== undefined
    ) {
      if (/^[ \t]*=+\s*$/.test(next)) {
        out.push(`# ${stripInlineAnchor(candidate)}`)
        i++
        continue
      }
      if (/^[ \t]*-{2,}\s*$/.test(next)) {
        out.push(`## ${stripInlineAnchor(candidate)}`)
        i++
        continue
      }
    }
    out.push(candidate)
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 2. 异常控制字符
 *    文档里残留了 U+0008（退格）等不可见字符，直接移除。
 * ------------------------------------------------------------------ */
function stripControlChars(text) {
  // 保留 \n(\u000a) 与 \t(\u0009)，其余 C0/C1 控制字符全部删除
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
}

/* ------------------------------------------------------------------ *
 * 3b. 图片路径
 *    文档放在 docs/ 下，所以引用图片时写的是 `../images/x.png`；
 *    但渲染结果会被注入到插件根目录的 index.html 里，
 *    要改写成相对插件根目录的 `images/x.png`，否则打包后会加载不到。
 * ------------------------------------------------------------------ */
function normalizeImagePaths(text) {
  return text.replace(
    /(!\[[^\]]*\]\()(?:\.\.\/)+(?=[^)]*\))/g,
    '$1'
  )
}

/* ------------------------------------------------------------------ *
 * 3. 全角符号误用
 *    例如 `class-pattern／method-pattern` 中的全角斜杠。
 * ------------------------------------------------------------------ */
function normalizeFullwidthSymbols(text) {
  return text
    .replace(/\uFF0F/g, '/') // ／ -> /
    .replace(/\uFF5E/g, '~') // ～ -> ~
}

/* ------------------------------------------------------------------ *
 * 4. 代码块语言标注
 * ------------------------------------------------------------------ */

function inferCodeLang(body) {
  const text = String(body || '')
  const first = (text.split('\n')[0] || '').trim()

  const javaLike =
    /^\s*(package|import|public|private|protected|abstract|final|@\w+)/m.test(text) ||
    /\b(class|interface|enum)\s+[A-Z]\w*/.test(text)
  if (javaLike) return 'java'

  const shellLike =
    /^[$#]\s/.test(first) ||
    /^\[arthas@[^\]]*\]\$/.test(first) ||
    /\b(curl|wget|ssh|scp|grep|sed|awk|mvn|gradle|java|javac|ls|cd|cat|echo)\b/.test(first) ||
    /^(as\.sh|arthas|jad|sc|sm|watch|trace|tt|thread|dashboard|classloader|logger|mbean|ognl|options|profiler|jvm|jfr|vmoption|vmtool|heapdump|dump|getstatic|redefine|retransform|mc|base64|sysenv|sysprop|session|version|reset|memory|perfcounter|keymap|history|help|pwd|tee|grep|stop|quit|cls|auth|batch)\b/.test(
      first
    )
  if (shellLike) return 'bash'

  if (/^\s*[[{]/.test(first)) return 'json'
  if (/^\s*<\?xml/.test(first)) return 'xml'
  if (/^\s*<[a-zA-Z!]/.test(first)) return 'html'

  return 'text'
}

function fixCodeLang(body, lang) {
  const l = String(lang || '').trim().toLowerCase()

  // 明确的内容 -> 语言修正表
  const exact = [
    [/^base64\s|^base64\s+-d/, 'bash'],
    [/^options\s+disable-sub-class/, 'bash'],
    [/^(monitor|watch|trace|stack|tt|thread|jad|sc|sm|jvm|dashboard)\s/, 'bash'],
    [/^ts=\d{4}-\d\d-\d\d/, 'text'],
  ]
  for (const [re, target] of exact) {
    if (re.test(body.trim())) return target
  }

  if (l === 'java') {
    // 之前用「包含 class 关键字」的粗糙规则把 `base64 < Test.class > out` 之流误判为 java
    return /(^|\n)\s*(package|import|public|private|protected|abstract|final|@\w+)/.test(body) ||
      /\b(class|interface|enum)\s+[A-Z]\w*/.test(body)
      ? 'java'
      : inferCodeLang(body)
  }

  if (!l) return inferCodeLang(body)
  return l
}

function normalizeCodeFences(text) {
  return text.replace(
    /^([ \t]*)```([^\n`]*)\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm,
    (match, indent, lang, body) => {
      const fixed = fixCodeLang(body, lang)
      return `${indent}\`\`\`${fixed}\n${body}\`\`\``
    }
  )
}

/* ------------------------------------------------------------------ *
 * 4b. 文档内锚点链接
 *    上游站点用的是英文锚点 id，而本地文档的标题 id 是由中文标题 slug 出来的，
 *    直接抄过来的链接（如 `#special_command_results`）点不动，这里换成真实 id。
 * ------------------------------------------------------------------ */
const ANCHOR_ALIASES = {
  special_command_results: '特殊命令结果',
  change_watch_value_to_map: 'watch-命令输出-map-对象'
}

function normalizeAnchorLinks(text) {
  return text.replace(/\]\(#([^)]+)\)/g, (match, id) => {
    const target = ANCHOR_ALIASES[id]
    return target ? `](#${target})` : match
  })
}

/* ------------------------------------------------------------------ *
 * 5. 引用块 / 提示块
 *
 *    转换器把站点上的容器拍平成了：
 *        > 提示
 *        > 内容……
 *    并且多个相邻容器会被合并进同一个引用块；同时引用块后面的正文
 *    会因为没有空行而被「懒延续」吞进引用里。
 *
 *    统一整理为：
 *        > **提示**
 *        >
 *        > 内容……
 * ------------------------------------------------------------------ */

const TITLE_RE = new RegExp(
  `^>\\s*\\*{0,2}\\s*(${CALLOUT_TITLES.join('|')})\\s*\\*{0,2}\\s*([:：])?\\s*(.*)$`
)

function parseQuoteLine(line) {
  const m = line.match(TITLE_RE)
  if (!m) return null
  const title = m[1]
  const rest = (m[3] || '').trim()
  // 只有「标题独占一行」或「标题后面紧跟冒号」才算标题，
  // `> 注意，xxx` / `> 注意一条记录只能停止一次。` 属于普通引用内容。
  if (rest && !m[2]) return null
  return { title, rest }
}

function renderQuoteGroup(group) {
  const out = []
  const content = group.content.slice()
  while (content.length && !content[0]) content.shift()
  while (content.length && !content[content.length - 1]) content.pop()

  if (group.title) {
    out.push(`> **${group.title}**`)
    out.push('>')
    // 容器标题后面重复出现的「注意：」等前缀去掉
    if (content.length) {
      content[0] = content[0].replace(
        new RegExp(`^\\*{0,2}\\s*${group.title}\\s*\\*{0,2}\\s*[:：，,]?\\s*`),
        ''
      )
    }
  }
  content.forEach(line => out.push(line ? `> ${line}` : '>'))
  return out
}

function normalizeBlockquotes(text) {
  const lines = text.split('\n')
  const out = []
  let i = 0
  let inFence = false

  while (i < lines.length) {
    const line = lines[i]
    if (/^[ \t]*```/.test(line)) inFence = !inFence

    if (!inFence && /^>/.test(line)) {
      const block = []
      while (i < lines.length && /^>/.test(lines[i])) {
        block.push(lines[i])
        i++
      }

      // 拆分被合并在一起的多个容器
      const groups = []
      let current = null
      for (const raw of block) {
        const title = parseQuoteLine(raw)
        if (title) {
          if (current) groups.push(current)
          current = { title: title.title, content: title.rest ? [title.rest] : [] }
        } else {
          if (!current) current = { title: null, content: [] }
          current.content.push(raw.replace(/^>[ \t]?/, '').replace(/[ \t]+$/, ''))
        }
      }
      if (current) groups.push(current)

      groups.forEach((group, index) => {
        if (index > 0) out.push('')
        out.push(...renderQuoteGroup(group))
      })
      out.push('')
      continue
    }

    out.push(line)
    i++
  }

  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 6. 列表
 * ------------------------------------------------------------------ */
function normalizeLists(text) {
  const lines = text.split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) inFence = !inFence
    if (inFence) {
      out.push(line)
      continue
    }
    out.push(
      line
        // 引用块内的列表
        .replace(/^(>[ \t]*)[•·∙]\s+/, '$1- ')
        .replace(/^(>[ \t]*)[*+]\s+/, '$1- ')
        // 列表项目符号统一为 `-`
        .replace(/^([ \t]*)[•·∙]\s+/, '$1- ')
        .replace(/^([ \t]*)[*+]\s+/, '$1- ')
    )
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 7. 列表项被挤到同一行
 *    转换器会把相邻的列表项合并成一行，例如：
 *        `1. 匹配到的函数没有被执行2. 条件表达式结果是 false`
 * ------------------------------------------------------------------ */
function splitMergedListItems(text) {
  const lines = text.split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) inFence = !inFence
    if (inFence) {
      out.push(line)
      continue
    }
    if (/^\s*\d+[.)]\s/.test(line)) {
      const parts = line.split(/(?<=[\u4e00-\u9fa5。！？：；）】])(?=\d+[.)]\s)/)
      if (parts.length > 1) {
        out.push(...parts.map(p => p.replace(/[ \t]+$/, '')))
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 7b. 表格里的尖括号占位符
 *    `[m <arg>]` 这样的写法会被 Markdown 当成 HTML 标签直接吞掉，
 *    必须放进行内代码里。
 * ------------------------------------------------------------------ */
function normalizeTablePlaceholders(text) {
  const lines = text.split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) inFence = !inFence
    if (inFence || !/^\s*\|/.test(line)) {
      out.push(line)
      continue
    }
    out.push(
      line
        .replace(/\[([^[\]]*)`(<[^<>]+>)`([^[\]]*)\]/g, '`[$1$2$3]`')
        .replace(/(?<!`)\[([^[\]`]*<[^<>]+>[^[\]`]*)\](?!`)/g, '`[$1]`')
    )
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 8. 表格
 *    补齐缺失的分隔行，并剔除重复的分隔行。
 * ------------------------------------------------------------------ */
function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line) && (line.match(/\|/g) || []).length >= 2
}
function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-') && line.includes('|')
}
function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}
function isEscapedPipe(text, index) {
  let backslashes = 0
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++
  return backslashes % 2 === 1
}
function countTableCells(line) {
  let n = 1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && !isEscapedPipe(line, i)) n++
  }
  // `| a | b |` 首尾竖线各多算了一次
  return n - (line.trim().startsWith('|') ? 1 : 0) - (line.trim().endsWith('|') ? 1 : 0)
}
function joinTableRow(cells) {
  return `| ${cells.join(' | ')} |`
}

function normalizeTables(text) {
  const lines = text.split('\n')
  const out = []
  let inFence = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (/^[ \t]*```/.test(line)) inFence = !inFence
    if (inFence || !isTableRow(line) || isTableSeparator(line)) {
      out.push(line)
      i++
      continue
    }

    const block = []
    while (i < lines.length && isTableRow(lines[i])) {
      block.push(lines[i])
      i++
    }

    const rows = block.filter(l => !isTableSeparator(l)).map(splitTableRow)
    if (rows.length >= 2) {
      const columns = Math.max(...rows.map(r => r.length))
      const padded = rows.map(r => {
        const c = r.slice()
        while (c.length < columns) c.push('')
        return c
      })
      // 已有对齐信息则保留
      const sepRow = block.find(isTableSeparator)
      const aligns = sepRow
        ? splitTableRow(sepRow).map(c => (/^:-+:$/.test(c) ? ':---:' : /-+:$/.test(c) ? '---:' : /^:-+/.test(c) ? ':---' : '---'))
        : []
      while (aligns.length < columns) aligns.push('---')
      out.push(joinTableRow(padded[0]))
      out.push(joinTableRow(aligns))
      for (let r = 1; r < padded.length; r++) out.push(joinTableRow(padded[r]))
    } else {
      out.push(...block)
    }
  }

  return out.join('\n')
}

/* ------------------------------------------------------------------ *
 * 8. 空行 / 缩进
 * ------------------------------------------------------------------ */

function lineKind(line) {
  if (/^\s*$/.test(line)) return 'blank'
  if (/^[ \t]{0,3}#{1,6}(\s|$)/.test(line)) return 'heading'
  if (/^\s*(```|~~~)/.test(line)) return 'fence'
  if (/^\s*>/.test(line)) return 'quote'
  if (/^\s*\|/.test(line)) return 'table'
  if (/^[ \t]*([-*+]|\d+[.)])\s+/.test(line)) return 'list'
  if (/^[ \t]+\S/.test(line)) return 'indent'
  return 'text'
}

function needsBlankBetween(prevKind, curKind) {
  if (prevKind === 'blank') return false
  const pairs = [
    ['text', 'list'],
    ['list', 'text'],
    ['text', 'heading'],
    ['list', 'heading'],
    ['indent', 'heading'],
    ['text', 'table'],
    ['list', 'table'],
    ['quote', 'text'],
    ['text', 'quote'],
    ['list', 'quote'],
    ['heading', 'text'],
    ['heading', 'list'],
    ['heading', 'table'],
    ['heading', 'quote'],
    ['table', 'text'],
    ['table', 'list'],
    ['table', 'heading'],
    ['fence', 'text'],
    ['fence', 'list'],
    ['fence', 'heading'],
    ['fence', 'quote'],
    ['fence', 'table'],
    ['fence', 'indent']
  ]
  return pairs.some(([a, b]) => a === prevKind && b === curKind)
}

function normalizeSpacing(text) {
  const lines = text.split('\n').map(l => l.replace(/[ \t]+$/, ''))
  const out = []
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence && out.length && lineKind(out[out.length - 1]) !== 'blank') {
        out.push('')
      }
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }

    const kind = lineKind(line)
    if (kind === 'blank') {
      if (out.length === 0) continue
      if (lineKind(out[out.length - 1]) === 'blank') continue
      out.push('')
      continue
    }

    const prevKind = out.length ? lineKind(out[out.length - 1]) : 'blank'
    if (needsBlankBetween(prevKind, kind)) out.push('')
    out.push(line)
  }

  // 收敛尾部空行
  while (out.length && lineKind(out[out.length - 1]) === 'blank') out.pop()
  return out.join('\n') + '\n'
}

/* ------------------------------------------------------------------ *
 * 9. 其它
 * ------------------------------------------------------------------ */
function normalizeThematicBreaks(text) {
  // 转换器把 <hr> 变成了超长的横线，统一为 `---`（不要动代码块里的输出）
  const lines = text.split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) inFence = !inFence
    if (!inFence && /^[ \t]*([-*_])\1{9,}[ \t]*$/.test(line)) {
      out.push('---')
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function stripTrailingSpaces(text) {
  return text.replace(/[ \t]+$/gm, '')
}

function normalize(text) {
  let s = String(text || '')
  s = s.replace(/\r\n?/g, '\n')
  s = stripControlChars(s)
  s = stripHeadingAnchors(s)
  s = normalizeSetextHeadings(s)
  s = normalizeFullwidthSymbols(s)
  s = normalizeImagePaths(s)
  s = normalizeAnchorLinks(s)
  s = normalizeCodeFences(s)
  s = normalizeBlockquotes(s)
  s = normalizeLists(s)
  s = splitMergedListItems(s)
  s = normalizeTablePlaceholders(s)
  s = normalizeTables(s)
  s = normalizeThematicBreaks(s)
  s = normalizeSpacing(s)
  s = stripTrailingSpaces(s)
  return s
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */
function main() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const stdoutIdx = args.indexOf('--stdout')

  if (stdoutIdx !== -1) {
    const file = args[stdoutIdx + 1]
    process.stdout.write(normalize(fs.readFileSync(file, 'utf8')))
    return
  }

  const files = collectDocFiles()

  let changed = 0
  for (const { rel, full } of files) {
    const raw = fs.readFileSync(full, 'utf8')
    const normalized = normalize(raw)
    if (normalized === raw) {
      console.log(`[ok]    ${rel}`)
      continue
    }
    changed++
    if (checkOnly) {
      console.log(`[diff]  ${rel}`)
    } else {
      fs.writeFileSync(full, normalized, 'utf8')
      console.log(`[fixed] ${rel}`)
    }
  }

  console.log(`\n${checkOnly ? '需要修复' : '已修复'} ${changed}/${files.length} 个文件`)
  if (checkOnly && changed > 0) process.exitCode = 1
}

if (require.main === module) main()

module.exports = { normalize }
