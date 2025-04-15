const { fs, path, marked, __dirname } = window.nodeAPI;


// 修改 docs 目录路径为相对路径
const docsDir = path.join(__dirname, 'docs');
let docs = {};

// 加载文档
function loadDocs() {
  try {
    // 调试：打印路径
    const listPath = path.join(__dirname, 'docs-list.json');

    // 加载 docs-list.json
    const docsMap = JSON.parse(fs.readFileSync(listPath, 'utf-8'));

    // 遍历文档映射
    Object.keys(docsMap).forEach(key => {
      const filePath = path.join(docsDir, `${key}.md`);
      console.log('Loading document:', filePath);

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        docs[key] = {
          title: key,
          description: docsMap[key],
          content: marked.parse(content)
        };
      } else {
        console.warn('Document not found:', filePath);
      }
    });
  } catch (error) {
    console.error('加载文档失败:', error);
  }
}

// 初始化菜单
function initMenu() {
  const menu = document.getElementById('menu');
  menu.innerHTML = '';
  const keys = Object.keys(docs);

  keys.forEach((key, index) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.key = key; // 存储命令名以便于搜索

    // 创建标题元素
    const title = document.createElement('div');
    title.className = 'menu-item-title';
    title.textContent = key;

    // 创建描述元素
    const desc = document.createElement('div');
    desc.className = 'menu-item-desc';
    desc.textContent = docs[key].description;

    // 添加到菜单项
    item.appendChild(title);
    item.appendChild(desc);

    item.onclick = () => showContent(key);
    item.tabIndex = index; // 使菜单项可聚焦
    menu.appendChild(item);

    // 如果是当前活动项，添加活动类
    if (currentActiveKey === key) {
      item.classList.add('active');
    }
  });

  // 添加键盘事件监听
  document.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('.menu-item');
    const activeItem = document.querySelector('.menu-item.active');
    let currentIndex = Array.from(items).indexOf(activeItem);

    if (e.key === 'ArrowDown') {
      if (currentIndex < items.length - 1) {
        currentIndex++;
      }
    } else if (e.key === 'ArrowUp') {
      if (currentIndex > 0) {
        currentIndex--;
      }
    }

    if (items[currentIndex]) {
      items[currentIndex].click();
      items[currentIndex].focus();
    }
  });
}

// 当前活动的命令键
let currentActiveKey = '';

// 显示内容
function showContent(key) {
  const content = document.getElementById('content');
  const doc = docs[key];
  content.innerHTML = `
    <h1>${key}</h1>
    <div class="doc-description">${doc.description}</div>
    <div class="doc-content">${doc.content}</div>
  `;

  // 记录当前活动的命令键
  currentActiveKey = key;

  // 处理超链接点击事件
  content.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault(); // 阻止默认行为
      const href = link.getAttribute('href');
      if (href) {
        // 使用 uTools 的 API 打开外部链接
        if (window.utools) {
          window.utools.shellOpenExternal(href);
        } else {
          console.warn('uTools API 不可用，无法打开外部链接:', href);
        }
      }
    });
  });

  // 更新菜单项选中状态
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.key === key) {
      item.classList.add('active');
    }
  });
}



// 添加分隔条功能
const resizer = document.getElementById('resizer');
const sidebar = document.querySelector('.sidebar');
let isResizing = false;

resizer.addEventListener('mousedown', () => {
  isResizing = true;
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResize);
});

function resize(e) {
  if (isResizing) {
    const newWidth = e.clientX;
    // 限制最小宽度
    if (newWidth >= 180) {
      sidebar.style.width = `${newWidth}px`;
    }
  }
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResize);
}

// 通知功能
function showNotification(message, type = '', duration = 3000) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = 'notification show';

  if (type) {
    notification.classList.add(type);
  }

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.textContent = '';
      if (type) {
        notification.classList.remove(type);
      }
    }, 300);
  }, duration);
}

// 版本切换功能
const versionButton = document.getElementById('versionButton');
const versionDropdown = document.getElementById('versionDropdown');
let currentVersion = '4.0.4';

// 点击按钮显示下拉菜单
versionButton.addEventListener('click', (e) => {
  e.stopPropagation();
  // 当前只有一个版本，显示提示信息
  showNotification(`当前仅支持 Arthas ${currentVersion} 版本文档`, 'info');
});

// 点击下拉菜单项
versionDropdown.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    e.preventDefault();
    const version = e.target.getAttribute('data-version');
    if (version !== currentVersion) {
      currentVersion = version;
      versionButton.textContent = `切换版本 (当前: ${currentVersion})`;
      showNotification(`已切换到 Arthas ${currentVersion} 文档`, 'success');
    } else {
      showNotification(`当前已经是 Arthas ${currentVersion} 文档`, 'info');
    }
    versionDropdown.classList.remove('show');
  }
});

// 点击其他地方关闭下拉菜单
document.addEventListener('click', () => {
  versionDropdown.classList.remove('show');
});

// 初始化
loadDocs();
initMenu();
// 默认显示第一个文档
if (Object.keys(docs).length > 0) {
  showContent(Object.keys(docs)[0]);
}
