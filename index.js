const { fs, path, marked, __dirname } = window.nodeAPI;

const PLACEHOLDER_TEXT = '搜索命令...空格全屏';
let previousSearchText = ''; // 用于检测全屏状态转换和普通搜索内容变化
let lastActiveKeyBeforeFullscreen = null; // 用于记住全屏前的选中项

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
  const currentSearchText = action.text || '';
  console.log(`[Search] Current: "${currentSearchText}", Previous: "${previousSearchText}", ActiveKey: "${currentActiveKey}"`);

  // --- 修改：优先处理来自占位符或有效空输入的空格全屏意图 ---
  const currentInputIsJustSpace = currentSearchText.trim() === '' && currentSearchText.length > 0 && currentSearchText.endsWith(' ');
  const previousInputWasEffectivelyEmpty = previousSearchText.trim() === '' || previousSearchText === PLACEHOLDER_TEXT;

  if (currentInputIsJustSpace && previousInputWasEffectivelyEmpty) {
    console.log('[Search] Detected space on effectively empty input. Forcing fullscreen for active key:', currentActiveKey);
    
    lastActiveKeyBeforeFullscreen = currentActiveKey; 
    
    document.body.classList.add('fullscreen');
    
    if (docs[currentActiveKey]) {
      showContent(currentActiveKey);
    } else if (lastActiveKeyBeforeFullscreen && docs[lastActiveKeyBeforeFullscreen]) { 
      showContent(lastActiveKeyBeforeFullscreen);
    } else if (menuItemsElements.length > 0) { 
        const firstItem = menuItemsElements.find(item => item.style.display !== 'none') || menuItemsElements[0];
        if(firstItem) showContent(firstItem.dataset.key);
    }

    menuItemsElements.forEach(itemElement => {
      itemElement.style.display = ''; 
      const titleElement = itemElement.querySelector('.menu-item-title');
      if (titleElement) titleElement.textContent = itemElement.dataset.key; 
      
      if (itemElement.dataset.key === currentActiveKey) {
        itemElement.classList.add('active');
      } else {
        itemElement.classList.remove('active');
      }
    });

    previousSearchText = currentSearchText; 
    return; 
  }
  // --- 结束修改 ---

  let isEffectivelyEmpty = (currentSearchText.trim() === '' || currentSearchText === PLACEHOLDER_TEXT);
  // Consider previousSearchText initial state: '' is effectively empty.
  let wasEffectivelyEmpty = (previousSearchText.trim() === '' || previousSearchText === PLACEHOLDER_TEXT);

  if (isEffectivelyEmpty) {
    menuItemsElements.forEach(itemElement => {
      itemElement.style.display = '';
      const titleElement = itemElement.querySelector('.menu-item-title');
      if (titleElement) titleElement.textContent = itemElement.dataset.key; // Reset title
    });
    document.body.classList.remove('fullscreen');

    // Case 1: Search just became effectively empty (e.g., cleared by user) OR it's the initial call with placeholder.
    if (!wasEffectivelyEmpty || (currentSearchText === PLACEHOLDER_TEXT && previousSearchText.trim() === '')) {
      console.log('[Search] Became effectively empty or initial placeholder call.');
      // If current text is genuinely empty (not placeholder), set input to placeholder.
      // Avoid redundant setSubInput if already placeholder.
      if (currentSearchText.trim() === '' && currentSearchText !== PLACEHOLDER_TEXT && window.utools) {
        utools.setSubInput(handleCommandSearch, PLACEHOLDER_TEXT, true);
      }

      // Show content: prefer current active if still valid, else first visible.
      const currentActiveItem = menuItemsElements.find(item => item.dataset.key === currentActiveKey && item.style.display !== 'none');
      if (currentActiveItem) {
          showContent(currentActiveKey);
      } else if (menuItemsElements.length > 0) {
          const firstVisibleItem = menuItemsElements.find(item => item.style.display !== 'none');
          if (firstVisibleItem) showContent(firstVisibleItem.dataset.key);
      }
    }
    // Case 2: Search was already effectively empty and remains so (e.g., space pressed on placeholder/empty input).
    else { // This implies isEffectivelyEmpty && wasEffectivelyEmpty
      console.log('[Search] Remained effectively empty. No content/selection change intended.');
      // Safeguard: If input somehow became truly empty string (not placeholder), restore placeholder.
      // This can happen if keydown preventDefault + uTools interaction clears it before this callback.
      if (currentSearchText.trim() === '' && currentSearchText !== PLACEHOLDER_TEXT && window.utools) {
         utools.setSubInput(handleCommandSearch, PLACEHOLDER_TEXT, true);
      }
      // IMPORTANT: Do NOT call showContent() here to change the displayed item or currentActiveKey.
      // The existing selection and content should persist.
    }

    previousSearchText = currentSearchText; // Update previousSearchText to the current state
    lastActiveKeyBeforeFullscreen = null; // Reset fullscreen memory
    return; // Exit: all logic for effectively empty search is handled.
  }

  // --- Logic for non-effectively-empty search starts here ---
  console.log('[Search] Processing non-empty search:', currentSearchText);

  const lowerSearchText = currentSearchText.toLowerCase().trim(); // Trim for filtering
  let isNowFullscreen = currentSearchText.endsWith(' '); // Ends with actual space
  let wasFullscreenClass = document.body.classList.contains('fullscreen');

  if (isNowFullscreen) {
    if (!wasFullscreenClass) {
      console.log('[Search] Entering fullscreen. Saving active key:', currentActiveKey);
      lastActiveKeyBeforeFullscreen = currentActiveKey; // Save key before entering fullscreen
    }
    document.body.classList.add('fullscreen');
    const searchTextForFullscreen = lowerSearchText.slice(0, -1).trim(); // Text without the trailing space
    // ... (existing fullscreen content display logic, using searchTextForFullscreen and lastActiveKeyBeforeFullscreen) ...
    // (Ensure this logic correctly uses lastActiveKeyBeforeFullscreen or currentActiveKey based on searchTextForFullscreen)
    if (lastActiveKeyBeforeFullscreen && docs[lastActiveKeyBeforeFullscreen] && 
        ( (searchTextForFullscreen === '' && currentActiveKey === lastActiveKeyBeforeFullscreen) || 
          (searchTextForFullscreen !== '' && lastActiveKeyBeforeFullscreen.toLowerCase().includes(searchTextForFullscreen)) ) ) {
        showContent(lastActiveKeyBeforeFullscreen);
    } else if (currentActiveKey && docs[currentActiveKey] && 
               ( (searchTextForFullscreen === '' && menuItemsElements.find(item => item.dataset.key === currentActiveKey && item.style.display !== 'none')) || 
                  (searchTextForFullscreen !== '' && currentActiveKey.toLowerCase().includes(searchTextForFullscreen)) ) ){
        showContent(currentActiveKey);
    } else {
      let firstVisibleAndMatchingKey = null;
      for (const itemElement of menuItemsElements) {
        if (itemElement.style.display !== 'none') {
          const itemKey = itemElement.dataset.key;
          if (searchTextForFullscreen === '' || (itemKey && itemKey.toLowerCase().includes(searchTextForFullscreen))) {
            firstVisibleAndMatchingKey = itemKey;
            break;
          }
        }
      }
      if (firstVisibleAndMatchingKey) {
        showContent(firstVisibleAndMatchingKey);
      } else if (menuItemsElements.length > 0 && menuItemsElements[0].style.display !== 'none') {
        showContent(menuItemsElements[0].dataset.key);
      }
    }

  } else { // Not ending with a space (not fullscreen intent or exiting fullscreen)
    document.body.classList.remove('fullscreen');
    if (wasFullscreenClass) { // Just exited fullscreen (space was deleted)
      console.log('[Search] Exited fullscreen. Attempting to restore/filter with:', lowerSearchText, 'Last key before FS:', lastActiveKeyBeforeFullscreen);
      // Filtering logic below will apply. We want to see if lastActiveKeyBeforeFullscreen should be prioritized.
    }
  }

  let firstMatchedKey = null;
  let activeKeyRestoredOrPrioritized = false;

  // If just exited fullscreen, try to make lastActiveKeyBeforeFullscreen the active one if it matches current filter
  if (wasFullscreenClass && !isNowFullscreen && lastActiveKeyBeforeFullscreen && 
      lastActiveKeyBeforeFullscreen.toLowerCase().includes(lowerSearchText)) {
      const potentialItem = menuItemsElements.find(el => el.dataset.key === lastActiveKeyBeforeFullscreen);
      // Check if it's still in the DOM and would be visible after filtering (this check is a bit redundant as filtering happens next)
      if (potentialItem) { 
        firstMatchedKey = lastActiveKeyBeforeFullscreen;
        activeKeyRestoredOrPrioritized = true;
        console.log('[Search] Prioritized active key from fullscreen exit:', firstMatchedKey);
      }
  }

  // Filter and highlight menu items
  menuItemsElements.forEach((itemElement) => {
    const originalKey = itemElement.dataset.key;
    const commandKey = originalKey ? originalKey.toLowerCase() : '';
    const titleElement = itemElement.querySelector('.menu-item-title');

    if (commandKey.includes(lowerSearchText)) { // Match against trimmed, lowercased search text
      itemElement.style.display = '';
      if (!activeKeyRestoredOrPrioritized && firstMatchedKey === null) {
        firstMatchedKey = originalKey;
      }
      if (titleElement) {
        const matchStartIndex = commandKey.indexOf(lowerSearchText);
        if (matchStartIndex !== -1) {
          const before = originalKey.substring(0, matchStartIndex);
          const matchedPart = originalKey.substring(matchStartIndex, matchStartIndex + lowerSearchText.length);
          const after = originalKey.substring(matchStartIndex + lowerSearchText.length);
          titleElement.innerHTML = `${escapeHtml(before)}<span class="highlight">${escapeHtml(matchedPart)}</span>${escapeHtml(after)}`;
        } else {
          titleElement.textContent = originalKey;
        }
      }
    } else {
      itemElement.style.display = 'none';
      if (titleElement) {
        titleElement.textContent = originalKey;
      }
    }
  });

  // Update content display for non-fullscreen mode or when exiting fullscreen
  if (!isNowFullscreen) {
    if (firstMatchedKey) {
      showContent(firstMatchedKey);
      // Update .active class on menu items
      document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.key === firstMatchedKey) {
          item.classList.add('active');
        }
      });
    } else { // No match found for non-empty search
      const content = document.getElementById('content');
      content.innerHTML = '<h1>未找到匹配的命令</h1>';
    }
  }
  
  // Cleanup if exited fullscreen state
  if (!isNowFullscreen && wasFullscreenClass) {
    lastActiveKeyBeforeFullscreen = null;
  }

  previousSearchText = currentSearchText; // Update previousSearchText for the next call
  console.log('[Search] handleCommandSearch finished. Active key:', currentActiveKey, 'First matched:', firstMatchedKey, 'Fullscreen:', document.body.classList.contains('fullscreen'));
}

// HTML转义函数，防止XSS
function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') {
        return '';
    }
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
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
  console.log('[FocusSearchInput] Called. keepInput:', options.keepInput, 'getSubInput type:', window.utools ? typeof window.utools.getSubInput : 'utools not defined', 'setSubInput type:', window.utools ? typeof window.utools.setSubInput : 'utools not defined');
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    setTimeout(() => {
      if (options.keepInput === true) { // 明确检查 true
        if (typeof utools.getSubInput === 'function') {
          const currentSubInput = utools.getSubInput();
          if (currentSubInput && typeof currentSubInput.text === 'string') {
            utools.setSubInput(handleCommandSearch, currentSubInput.text, true);
            console.log('[FocusSearchInput] keepInput:true, getSubInput successful, called setSubInput with text:', currentSubInput.text);
          } else {
            // 将警告降级为日志，因为这是已知行为且已处理
            console.log('[FocusSearchInput] keepInput:true, getSubInput() did not return valid text. ' +
                         'Skipping explicit utools.setSubInput() call to avoid altering current input text. ' +
                         'Text persistence relies on uTools default behavior.');
          }
        } else {
          // 将警告降级为日志，因为这是已知行为且已处理
          console.log('[FocusSearchInput] keepInput:true, utools.getSubInput() is NOT a function. ' +
                       'Skipping explicit utools.setSubInput() call to avoid altering current input text. ' +
                       'Text persistence relies on uTools default behavior.');
        }
      } else {
        console.log('[FocusSearchInput] keepInput:false (or undefined), calling setSubInput with empty string to clear/reset.');
        utools.setSubInput(handleCommandSearch, '', true); 
      }
    }, 50);
  }
}

// uTools窗口每次激活都设置搜索框，解决窗口重用后搜索框丢失问题
if (window.utools && typeof window.utools.onPluginEnter === 'function') {
  window.utools.onPluginEnter(() => {
    if (window.utools && typeof window.utools.setSubInput === 'function') {
        setTimeout(() => { 
            // Set initial input text to placeholder; handleCommandSearch will process it.
            utools.setSubInput(handleCommandSearch, PLACEHOLDER_TEXT, true);
        }, 100);
    }
  });
}

// 命令点击后聚焦搜索框
function onMenuItemClick(key, opts = {}) { // opts 会是 {keepInput: true} 或 {}
  showContent(key);
  focusSearchInput(opts); // 若鼠标点击，opts为{}，则keepInput为false，会清空
}

// 分组切换后聚焦搜索框
// 在 categoryDropdown.addEventListener('click', ...) 里切换分组后加 focusSearchInput();
// 退出全屏时聚焦搜索框
function exitFullscreen() {
  document.body.classList.remove('fullscreen');
  focusSearchInput(); // 调用时无参数，options.keepInput 为 false，会清空
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
    if (isEditableElement(active)) return; // Allow space in actual input/textarea elements

    e.preventDefault(); // Prevent default browser action for space (e.g., scroll) first.

    if (window.utools && typeof utools.getSubInput === 'function') {
      const subInput = utools.getSubInput();
      const text = subInput ? subInput.text : '';
      // If input is effectively empty (truly empty or placeholder), block fullscreen intent.
      if (text.trim() === '' || text === PLACEHOLDER_TEXT) {
        console.log('[ArthasDocs|Keydown] Space pressed on empty/placeholder input. Fullscreen intent blocked.');
        // The setSubInput callback (handleCommandSearch) will manage the state.
        // Crucially, we return here so no fullscreen intent is implied by this keydown.
        return;
      }
    }
    // If we reach here, search is NOT empty/placeholder. Space implies fullscreen intent.
    // handleCommandSearch will be called by uTools with the text + " " and will manage fullscreen class.
    console.log('[ArthasDocs|Keydown] Space on non-empty text. Fullscreen intent allowed to be processed by handleCommandSearch.');
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

  // 移除了此处的 setSubInput 调用，统一由 onPluginEnter 管理初始状态
  // if (window.utools) {
  //   ...
  // }
  // ... fallback input 保留 ...

  // 默认显示第一个文档
  const keys = Object.keys(docs);
  if (keys.length > 0) {
    showContent(keys[0]);
  }

  // onPluginEnter 中已处理初始的 setSubInput
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
      focusSearchInput(); // 调用时无参数，options.keepInput 为 false，会清空
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
      // focusSearchInput(); // 取消这里的调用，避免非预期的清空行为。仅在特定操作后主动聚焦/清空。
    }
  }, 0);
});
