const fs = require('fs');
const path = require('path');
const marked = require('marked');

// 配置 marked 以支持代码高亮
marked.setOptions({
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