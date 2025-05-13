const { fs, path, marked, __dirname } = window.nodeAPI;


// 修改 docs 目录路径为相对路径
const docsDir = path.join(__dirname, 'docs');
let docs = {};
let menuItemsElements = []; // <--- 添加：用于存储菜单项DOM元素

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
  menuItemsElements = []; // <--- 添加：清空数组
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

    item.onclick = () => onMenuItemClick(key);
    item.tabIndex = index; // 使菜单项可聚焦
    menu.appendChild(item);
    menuItemsElements.push(item); // <--- 添加：存储菜单项元素

    // 如果是当前活动项，添加活动类
    if (currentActiveKey === key) {
      item.classList.add('active');
    }
  });

  // 添加键盘事件监听
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = Array.from(document.querySelectorAll('.menu-item')).filter(item => item.style.display !== 'none');
      const activeItem = items.find(item => item.classList.contains('active'));
      let currentIndex = items.indexOf(activeItem);
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
        onMenuItemClick(items[currentIndex].dataset.key, { keepInput: true });
        items[currentIndex].focus();
      }
      e.preventDefault();
    }
  });
}

// 当前活动的命令键
let currentActiveKey = '';

// <--- 添加：新的搜索处理函数 -->
function handleCommandSearch(action) {
  console.log('[ArthasDocs|Search] handleCommandSearch called with action:', action);
  
  if (!action || typeof action.text === 'undefined') {
    console.warn('[ArthasDocs|Search] Invalid action or action.text is undefined. Aborting search.');
    menuItemsElements.forEach(itemElement => {
      itemElement.style.display = '';
    });
    // 搜索为空时，自动展示第一个命令文档
    if (menuItemsElements.length > 0) {
      const firstKey = menuItemsElements[0].dataset.key;
      showContent(firstKey);
    }
    // 退出全屏
    exitFullscreen();
    return;
  }

  const searchText = action.text;
  const lowerSearchText = searchText.toLowerCase().trim();
  console.log('[ArthasDocs|Search] lowerSearchText:', lowerSearchText);
  console.log('[ArthasDocs|Search] Current menuItemsElements count:', menuItemsElements.length);

  // 判断是否需要全屏（输入内容以空格结尾）
  if (searchText.endsWith(' ')) {
    document.body.classList.add('fullscreen');
    // 优先显示当前选中的命令
    if (currentActiveKey && docs[currentActiveKey]) {
      showContent(currentActiveKey);
    } else {
      // 没有选中过命令时，回退到第一个匹配命令
      let firstMatchedKey = null;
      menuItemsElements.forEach((itemElement) => {
        if (itemElement.style.display !== 'none' && !firstMatchedKey) {
          firstMatchedKey = itemElement.dataset.key;
        }
      });
      if (firstMatchedKey) showContent(firstMatchedKey);
    }
  } else {
    document.body.classList.remove('fullscreen');
  }

  let firstMatchedKey = null;
  menuItemsElements.forEach((itemElement, index) => {
    const commandKey = itemElement.dataset.key ? itemElement.dataset.key.toLowerCase() : '';
    if (commandKey.includes(lowerSearchText)) {
      itemElement.style.display = '';
      if (firstMatchedKey === null) {
        firstMatchedKey = itemElement.dataset.key;
      }
    } else {
      itemElement.style.display = 'none';
    }
  });
  // 实时切换文档区为第一个匹配命令（非全屏时）
  if (!searchText.endsWith(' ') && firstMatchedKey) {
    showContent(firstMatchedKey);
  }
  console.log('[ArthasDocs|Search] handleCommandSearch finished.');
}
// <--- 结束：新的搜索处理函数 -->

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
  // localStorage.setItem('arthasDocsLastActiveKey', key); // <--- 移除记忆功能

  // 处理表格，将其包裹在滚动容器中
  content.querySelectorAll('.doc-content table').forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

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
    if (newWidth >= 160) {
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

// 文档类别切换功能
const categoryButton = document.getElementById('categoryButton');
const categoryDropdown = document.getElementById('categoryDropdown');
let currentCategory = 'all';
let docGroups = [];

// 加载文档分组
function loadDocGroups() {
  try {
    const groupsPath = path.join(__dirname, 'docs-group.json');
    if (fs.existsSync(groupsPath)) {
      docGroups = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));

      // 添加分组选项到下拉菜单
      docGroups.forEach(group => {
        const option = document.createElement('a');
        option.href = '#';
        option.setAttribute('data-category', group.name);
        option.textContent = group.name;
        categoryDropdown.appendChild(option);
      });
    } else {
      console.warn('文档分组文件不存在:', groupsPath);
    }
  } catch (error) {
    console.error('加载文档分组失败:', error);
  }
}

// 根据分组过滤菜单
function filterMenuByCategory(category) {
  // 如果是全部文档，显示所有项
  if (category === 'all') {
    initMenu();
    return;
  }

  // 查找对应的分组
  const group = docGroups.find(g => g.name === category);
  if (!group) {
    console.warn('未找到分组:', category);
    return;
  }

  // 根据分组的 filter 属性过滤菜单
  const menu = document.getElementById('menu');
  menu.innerHTML = '';
  menuItemsElements = []; // <--- 添加：清空 menuItemsElements 以便搜索功能正确工作

  group.filter.forEach((key, index) => {
    if (docs[key]) {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.dataset.key = key;

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

      item.onclick = () => onMenuItemClick(key);
      item.tabIndex = index;
      menu.appendChild(item);
      menuItemsElements.push(item); // <--- 添加：填充 menuItemsElements

      // 如果是当前活动项，添加活动类
      if (currentActiveKey === key) {
        item.classList.add('active');
      }
    }
  });
}

// 点击按钮显示下拉菜单
categoryButton.addEventListener('click', (e) => {
  e.stopPropagation();
  categoryDropdown.classList.toggle('show');

  // 如果下拉菜单已经显示，添加点击其他地方关闭的事件监听器
  if (categoryDropdown.classList.contains('show')) {
    const closeDropdown = () => {
      categoryDropdown.classList.remove('show');
      document.removeEventListener('click', closeDropdown);
    };

    // 使用 setTimeout 确保当前点击不会触发关闭
    setTimeout(() => {
      document.addEventListener('click', closeDropdown);
    }, 0);
  }
});

// 点击下拉菜单项
categoryDropdown.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    e.preventDefault();
    const category = e.target.getAttribute('data-category');
    if (category !== currentCategory) {
      currentCategory = category;
      categoryButton.textContent = `${category === 'all' ? '全部文档' : category}`;

      // 更新菜单项选中状态
      document.querySelectorAll('#categoryDropdown a').forEach(a => {
        a.classList.remove('active');
      });
      e.target.classList.add('active');

      // 过滤菜单
      filterMenuByCategory(category);

      showNotification(`已切换到${category === 'all' ? '全部文档' : `"${category}"分组`}`, 'success');
    }
    categoryDropdown.classList.remove('show');
  }
});

// 点击下拉菜单项不应该关闭下拉菜单
categoryDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
});

// 统一聚焦搜索框的方法
function focusSearchInput(options = {}) {
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    setTimeout(() => {
      if (options.keepInput) {
        // 只聚焦，不重置内容，且不传 text 字段，避免 [object Object]
        utools.setSubInput(handleCommandSearch, { placeholder: '搜索命令...空格全屏', isFocus: true });
      } else {
        // 默认行为，重置内容
        utools.setSubInput(handleCommandSearch, '搜索命令...空格全屏', true);
      }
    }, 50);
  }
}

// uTools窗口每次激活都设置搜索框，解决窗口重用后搜索框丢失问题
if (window.utools && typeof window.utools.onPluginEnter === 'function') {
  window.utools.onPluginEnter(() => {
    focusSearchInput();
  });
}

// 命令点击后聚焦搜索框
function onMenuItemClick(key, opts = {}) {
  showContent(key);
  focusSearchInput(opts);
}

// 分组切换后聚焦搜索框
// 在 categoryDropdown.addEventListener('click', ...) 里切换分组后加 focusSearchInput();
// 退出全屏时聚焦搜索框
function exitFullscreen() {
  document.body.classList.remove('fullscreen');
  focusSearchInput();
}

// 全局监听空格键，无论焦点在哪里都能全屏
// 仅当不是输入框/textarea等可编辑元素时才触发
function isEditableElement(el) {
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    const active = document.activeElement;
    // 如果焦点在输入框，允许输入空格
    if (isEditableElement(active)) return;
    // 已经全屏则不重复
    if (!document.body.classList.contains('fullscreen')) {
      document.body.classList.add('fullscreen');
    }
    e.preventDefault();
  }
  // 监听 ESC 退出全屏
  if (e.code === 'Escape' && document.body.classList.contains('fullscreen')) {
    exitFullscreen();
  }
});

// <--- 修改：DOMContentLoaded 事件监听器 -->
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ArthasDocs] DOMContentLoaded event fired.');
  loadDocs();
  loadDocGroups(); 
  
  initMenu(); 

  // 移除 setSubInput 调用，改为 onPluginEnter 统一管理
  // if (window.utools) {
  //   ...
  // }
  // ... fallback input 保留 ...

  // 默认显示第一个文档
  const keys = Object.keys(docs);
  if (keys.length > 0) {
    showContent(keys[0]);
  }

  // uTools窗口每次激活都设置搜索框，解决窗口重用后搜索框丢失问题
  if (window.utools && typeof window.utools.onPluginEnter === 'function') {
    window.utools.onPluginEnter(() => {
      setTimeout(() => {
        utools.setSubInput(handleCommandSearch, '搜索命令...空格全屏', true);
      }, 100);
    });
  }
});
// <--- 结束：修改后的 DOMContentLoaded -->

// 选中文本浮动"复制"按钮
let copyBtn = null;
let lastSelectionText = '';
let lastMouseUpPos = null;

function showCopyButton(x, y) {
  if (!copyBtn) {
    copyBtn = document.createElement('button');
    copyBtn.textContent = '复制';
    copyBtn.style.position = 'fixed';
    copyBtn.style.zIndex = 9999;
    copyBtn.style.padding = '2px 8px'; // 更小
    copyBtn.style.fontSize = '12px'; // 更小
    copyBtn.style.background = '#f0f0f0'; // 灰色主题
    copyBtn.style.color = '#444';
    copyBtn.style.border = '1px solid #ccc';
    copyBtn.style.borderRadius = '3px';
    copyBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.10)';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.transition = 'opacity 0.2s, background 0.2s, color 0.2s';
    copyBtn.style.opacity = '0.95';
    copyBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 防止失焦
    });
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = '#e0e0e0';
      copyBtn.style.color = '#222';
      copyBtn.style.borderColor = '#bbb';
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = '#f0f0f0';
      copyBtn.style.color = '#444';
      copyBtn.style.borderColor = '#ccc';
    });
    copyBtn.addEventListener('click', () => {
      if (lastSelectionText) {
        if (window.utools && window.utools.copyText) {
          window.utools.copyText(lastSelectionText);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lastSelectionText);
        }
      }
      hideCopyButton();
      focusSearchInput();
    });
    document.body.appendChild(copyBtn);
  }
  copyBtn.style.left = x + 'px';
  copyBtn.style.top = y + 'px';
  copyBtn.style.display = 'block';
}

function hideCopyButton() {
  if (copyBtn) {
    copyBtn.style.display = 'none';
  }
  lastSelectionText = '';
}

function isSelectionInContent() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const content = document.querySelector('.content');
  if (!content) return false;
  return content.contains(range.commonAncestorContainer);
}

function updateCopyButton() {
  requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideCopyButton();
      return;
    }
    const text = sel.toString();
    if (!text.trim()) {
      hideCopyButton();
      return;
    }
    if (!isSelectionInContent()) {
      hideCopyButton();
      return;
    }
    lastSelectionText = text;
    // 优先用鼠标松开位置，否则用选区下方
    let x, y;
    if (lastMouseUpPos) {
      x = lastMouseUpPos.x;
      y = lastMouseUpPos.y + 8; // 稍微下移
      lastMouseUpPos = null; // 用完即清空
    } else {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 6;
    }
    showCopyButton(x, y);
  });
}

// 监听内容区选中事件
const contentEl = document.querySelector('.content');
// selectionchange 只用于隐藏按钮
// 鼠标拖动过程中不显示按钮
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim() || !isSelectionInContent()) {
    hideCopyButton();
  }
});
if (contentEl) {
  contentEl.addEventListener('mousedown', () => {
    hideCopyButton(); // 拖动开始时立即隐藏按钮
  });
  contentEl.addEventListener('mouseup', (e) => {
    lastMouseUpPos = { x: e.clientX, y: e.clientY };
    updateCopyButton(); // 直接调用，无延迟
  });
  contentEl.addEventListener('keyup', () => {
    lastMouseUpPos = null;
    updateCopyButton(); // 直接调用，无延迟
  });
}
// 点击内容区以外区域时隐藏按钮，并聚焦搜索框（如果选区消失）
window.addEventListener('mousedown', (e) => {
  if (copyBtn && copyBtn.style.display === 'block') {
    if (!copyBtn.contains(e.target)) {
      hideCopyButton();
    }
  }
  // 判断选区是否消失，若消失则聚焦搜索框
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      focusSearchInput();
    }
  }, 0);
});
