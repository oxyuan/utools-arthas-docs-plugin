const fs = require('fs');
const path = require('path');
const marked = require('marked');

// 创建自定义渲染器来处理图片路径
const renderer = new marked.Renderer();

// 自定义图片渲染器，处理相对路径
renderer.image = function(href, title, text) {
  // 确保 href 是字符串
  if (!href || typeof href !== 'string') {
    href = '';
  }

  // 处理相对路径，如 ../images/xxx.png
  if (href && href.indexOf('../') === 0) {
    // 将 ../images/xxx.png 转换为 ./images/xxx.png
    href = href.replace(/^\.\.\//, './');
  }

  // 确保 title 和 text 是字符串
  title = title || '';
  text = text || '';

  // 构建标准的 img 标签，使用绝对路径
  if (href && href.indexOf('http') !== 0) {
    // 使用 __dirname 构建绝对路径
    const absolutePath = path.join(__dirname, href);
    return `<img src="${absolutePath}" alt="${text}" title="${title}" />`;
  } else {
    return `<img src="${href}" alt="${text}" title="${title}" />`;
  }
};

// 配置 marked 以支持代码高亮和自定义渲染器
marked.setOptions({
  renderer: renderer,
  highlight: function(code, lang) {
    // 增强的代码高亮实现
    if (lang === 'java') {
      // Java 关键字高亮
      code = code.replace(/\b(public|private|protected|class|interface|enum|abstract|extends|implements|static|final|synchronized|volatile|transient|native|strictfp|void|int|long|float|double|byte|short|char|String|boolean|true|false|null|new|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|throws|this|super|instanceof|import|package|assert)\b/g, '<span class="keyword">$1</span>');

      // Java 注释高亮
      code = code.replace(/(\/\/.*?$|\/*.*?\*\/)/gm, '<span class="comment">$1</span>');

      // Java 字符串高亮
      code = code.replace(/(["'])(?:\\.|[^\\])*?\1/g, '<span class="string">$&</span>');

      // Java 注解高亮
      code = code.replace(/(@\w+)\b/g, '<span class="annotation">$1</span>');

      // Java 数字高亮
      code = code.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="number">$1</span>');

      // Arthas 特有命令高亮
      code = code.replace(/\b(jad|sc|sm|dump|jvm|thread|dashboard|heapdump|options|cls|reset|version|session|sysprop|sysenv|vmoption|logger|getstatic|ognl|mbean|mc|redefine|retransform|classloader|monitor|watch|trace|stack|tt|jfr|profiler)\b/g, '<span class="arthas-command">$1</span>');
    } else if (lang === 'bash' || lang === 'sh') {
      // Bash 命令行提示符高亮
      code = code.replace(/^(\$|#)(.*)/gm, '<span class="prompt">$1</span><span class="command">$2</span>');

      // Bash 命令高亮
      code = code.replace(/\b(echo|cd|ls|mkdir|rm|cp|mv|cat|grep|find|awk|sed|curl|wget|tar|zip|unzip|chmod|chown|ps|kill|pkill|top|df|du|free|ifconfig|ip|ssh|scp|rsync|sudo|su|apt|yum|dnf|brew|systemctl|service|crontab|git|docker|java|javac|mvn|gradle)\b/g, '<span class="bash-command">$1</span>');

      // Arthas 特有命令高亮
      code = code.replace(/\b(as\.sh|arthas-boot\.jar|arthas-client\.jar|jad|sc|sm|dump|jvm|thread|dashboard|heapdump|options|cls|reset|version|session|sysprop|sysenv|vmoption|logger|getstatic|ognl|mbean|mc|redefine|retransform|classloader|monitor|watch|trace|stack|tt|jfr|profiler)\b/g, '<span class="arthas-command">$1</span>');

      // 选项高亮
      code = code.replace(/\s(-{1,2}\w+)/g, ' <span class="option">$1</span>');

      // 字符串高亮
      code = code.replace(/(["'])(?:\\.|[^\\])*?\1/g, '<span class="string">$&</span>');

      // 注释高亮
      code = code.replace(/(#.*?$)/gm, '<span class="comment">$1</span>');
    }
    return '<div class="code-block ' + (lang || '') + '">' + code + '</div>';
  }
});

// 定义 __dirname 并传递给渲染进程
window.nodeAPI = {
  fs,
  path,
  marked,
  __dirname: __dirname // 添加 __dirname
};

window.exports = {
  "arthas": {
    mode: "none",
    args: {
      enter: (action) => {
        // 插件装载时触发
      }
    }
  }
};