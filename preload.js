const fs = require('fs');
const path = require('path');
const marked = require('marked');

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