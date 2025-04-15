const fs = require('fs');
const path = require('path');
const marked = require('marked');

// 配置 marked 以支持代码高亮
marked.setOptions({
  highlight: function(code, lang) {
    // 简单的代码高亮实现
    if (lang === 'java') {
      // Java 关键字高亮
      code = code.replace(/\b(public|private|protected|class|interface|extends|implements|static|final|void|int|String|boolean|true|false|null|new|return|if|else|for|while|try|catch|throw|throws)\b/g, '<span class="keyword">$1</span>');
    } else if (lang === 'bash' || lang === 'sh') {
      // Bash 命令高亮
      code = code.replace(/^\$(.*)/gm, '$<span class="command">$1</span>');
      code = code.replace(/\b(echo|cd|ls|mkdir|rm|cp|mv|cat|grep|find|awk|sed|curl|wget|tar|zip|unzip)\b/g, '<span class="bash-command">$1</span>');
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