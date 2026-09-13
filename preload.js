const fs = require('fs');
const path = require('path');
const marked = require('marked');

/* ------------------------------------------------------------------ *
 * 文档规范化
 *
 * 复用 scripts/normalize-md.js，保证「磁盘上的文档」与「实际渲染结果」
 * 始终使用同一份实现。
 *
 * 注意：uTools 的 preload 运行在 Electron 的 vm 里，模块加载器不像 Node
 * 那样会剥掉文件开头的 `#!` shebang，所以被 require 的脚本文件不能带
 * shebang，否则会抛 SyntaxError 直接导致整个插件打不开。
 * 这里再做一层兜底，即使脚本加载失败也保证 window.nodeAPI 可用。
 * ------------------------------------------------------------------ */
let normalizeMarkdown;
try {
  normalizeMarkdown = require('./scripts/normalize-md.js').normalize;
} catch (err) {
  console.error('[arthas] 加载 scripts/normalize-md.js 失败，将跳过文档规范化：', err);
  normalizeMarkdown = (text) => String(text == null ? '' : text);
}

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 转义 HTML 文本（不转义引号，便于代码高亮匹配字符串） */
function escapeCodeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ------------------------------------------------------------------ *
 * 代码高亮
 *
 * 注意：marked v5 起 `highlight` 选项已被移除，必须通过自定义
 * `renderer.code` 来实现；同时 marked v5 起 renderer 接收的是 token
 * 对象而不是位置参数。
 *
 * 这里的实现思路是：先做 HTML 转义，再用「一个合并正则 + 分组索引」
 * 一次性替换，避免多个 replace 互相破坏对方插入的标签。
 * ------------------------------------------------------------------ */
const ARTHAS_COMMANDS = [
  'as\\.sh', 'arthas-boot\\.jar', 'arthas-client\\.jar',
  'jad', 'sc', 'sm', 'dump', 'jvm', 'thread', 'dashboard', 'heapdump',
  'options', 'cls', 'reset', 'version', 'session', 'sysprop', 'sysenv',
  'vmoption', 'logger', 'getstatic', 'ognl', 'mbean', 'mc', 'redefine',
  'retransform', 'classloader', 'monitor', 'watch', 'trace', 'stack',
  'tt', 'jfr', 'profiler', 'vmtool', 'perfcounter', 'memory', 'pwd',
  'tee', 'grep', 'help', 'history', 'keymap', 'stop', 'quit', 'auth',
  'base64', 'cat', 'echo'
].join('|');

const SHELL_COMMANDS = [
  'echo', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find',
  'awk', 'sed', 'curl', 'wget', 'tar', 'zip', 'unzip', 'chmod', 'chown',
  'ps', 'kill', 'pkill', 'top', 'df', 'du', 'free', 'ifconfig', 'ip',
  'ssh', 'scp', 'rsync', 'sudo', 'su', 'apt', 'yum', 'dnf', 'brew',
  'systemctl', 'service', 'crontab', 'git', 'docker', 'java', 'javac',
  'mvn', 'gradle', 'base64', 'jps', 'jstack', 'md5sum'
].join('|');

const JAVA_KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
  'char', 'class', 'const', 'continue', 'default', 'do', 'double',
  'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto',
  'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long',
  'native', 'new', 'package', 'private', 'protected', 'public', 'return',
  'short', 'static', 'strictfp', 'super', 'switch', 'synchronized',
  'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile',
  'while', 'true', 'false', 'null'
].join('|');

/** 用「合并正则」做一次扫描，避免多次 replace 相互污染 */
function buildHighlighter(patterns) {
  const combined = new RegExp(patterns.map(p => `(${p.re.source})`).join('|'), 'gm');
  return function highlight(code) {
    return code.replace(combined, (...args) => {
      for (let i = 0; i < patterns.length; i++) {
        const value = args[i + 1];
        if (value !== undefined) {
          return `<span class="${patterns[i].cls}">${value}</span>`;
        }
      }
      return args[0];
    });
  };
}

const highlightJava = buildHighlighter([
  { re: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/, cls: 'comment' },
  { re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, cls: 'string' },
  { re: /@\w+/, cls: 'annotation' },
  { re: new RegExp(`\\b(?:${JAVA_KEYWORDS})\\b`), cls: 'keyword' },
  { re: /\b\d+(?:\.\d+)?\b/, cls: 'number' },
  { re: new RegExp(`\\b(?:${ARTHAS_COMMANDS})\\b`), cls: 'arthas-command' }
]);

const highlightShell = buildHighlighter([
  { re: /^[$#](?=\s)/, cls: 'prompt' },
  { re: /(?:^|\s)#(?![!{]).*$/, cls: 'comment' },
  { re: /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/, cls: 'string' },
  { re: new RegExp(`\\b(?:${ARTHAS_COMMANDS})\\b`), cls: 'arthas-command' },
  { re: new RegExp(`\\b(?:${SHELL_COMMANDS})\\b`), cls: 'bash-command' },
  { re: /\s-{1,2}[A-Za-z][\w-]*/, cls: 'option' }
]);

function highlightCode(text, lang) {
  const escaped = escapeCodeHtml(text);
  if (lang === 'java') return highlightJava(escaped);
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') return highlightShell(escaped);
  return escaped;
}

/* ------------------------------------------------------------------ *
 * marked 渲染器（marked v5+ 的 token 参数风格）
 * ------------------------------------------------------------------ */
const renderer = {
  heading(token) {
    const level = token.depth;
    const id = slugify(token.text);
    const inner = this.parser ? this.parser.parseInline(token.tokens) : escapeHtml(token.text);
    return `<h${level} id="${id}"><a class="md-anchor" href="#${id}" aria-hidden="true"></a>${inner}</h${level}>\n`;
  },

  code(token) {
    const lang = String(token.lang || '').trim().split(/\s+/)[0].toLowerCase();
    const inner = highlightCode(token.text || '', lang);
    const className = ['language-' + (lang || 'text'), 'code-block', lang].filter(Boolean).join(' ');
    return `<pre><code class="${className}">${inner}</code></pre>\n`;
  },

  image(token) {
    let href = typeof token.href === 'string' ? token.href : '';
    const title = token.title || '';
    const alt = token.text || '';

    // 处理相对路径，如 ../images/xxx.png -> ./images/xxx.png
    if (href.indexOf('../') === 0) {
      href = href.replace(/^\.\.\//, './');
    }
    // 本地图片使用绝对路径，保证 file:// 页面能正确加载
    if (href && href.indexOf('http') !== 0 && href.indexOf('/') !== 0 && !/^[a-zA-Z]+:/.test(href)) {
      href = path.join(__dirname, href);
    }

    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" title="${escapeHtml(title)}" />`;
  }
};

marked.use({
  gfm: true,
  breaks: true,
  renderer
});

/* ------------------------------------------------------------------ *
 * 暴露给渲染进程
 * ------------------------------------------------------------------ */
window.nodeAPI = {
  fs,
  path,
  marked,
  slugify,
  normalizeMarkdown,
  __dirname
};

window.exports = {
  arthas: {
    mode: 'none',
    args: {
      enter: () => {
        // 插件装载时触发
      }
    }
  }
};
