const nodeAPI = window.nodeAPI || {};
const { fs, path, marked, slugify, __dirname } = nodeAPI;
const normalizeMarkdown =
  typeof nodeAPI.normalizeMarkdown === 'function'
    ? nodeAPI.normalizeMarkdown
    : (text) => String(text == null ? '' : text);

if (!nodeAPI.fs) {
  console.error(
    '[arthas] window.nodeAPI 不可用：preload.js 未成功加载，文档将无法读取。请查看上方的 preload 报错信息。'
  );
}

const PLACEHOLDER_TEXT = '搜索命令...空格全屏';
let previousSearchText = ''; // 用于检测全屏状态转换和普通搜索内容变化
let lastActiveKeyBeforeFullscreen = null; // 用于记住全屏前的选中项
let tocScrollHandler = null; // 当前文档的目录 scrollspy 监听器（切换文档时需要解绑）

// 文档根目录：docs/<version>/ 下按版本分目录存放
const DOCS_ROOT = path.join(__dirname, 'docs');
// 当前生效的版本目录，由 setVersion() 赋值
let docsDir = DOCS_ROOT;
let docs = {};
let menuItemsElements = []; // <--- 添加：用于存储菜单项DOM元素

// 扫描版本目录：docs/1.2.3/ 这样的 semver 目录才算一个版本
const VERSION_DIR_RE = /^\d+\.\d+\.\d+$/;

function compareVersionDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i]; // 降序：新版本在前
  }
  return 0;
}

function listVersions() {
  try {
    return fs
      .readdirSync(DOCS_ROOT)
      .filter(name => {
        if (!VERSION_DIR_RE.test(name)) return false;
        try {
          return fs.statSync(path.join(DOCS_ROOT, name)).isDirectory();
        } catch (err) {
          return false;
        }
      })
      .sort(compareVersionDesc);
  } catch (err) {
    console.error('[arthas] 读取版本目录失败：', err);
    return [];
  }
}

// 没有 docs-list.json 时，直接按目录里的 md 文件兜底生成
function buildDocsMapFromDisk() {
  const map = {};
  try {
    fs.readdirSync(docsDir)
      .filter(name => name.endsWith('.md') && name !== 'README.md')
      .sort()
      .forEach(name => {
        map[name.replace(/\.md$/, '')] = '';
      });
  } catch (err) {
    console.error('[arthas] 扫描文档目录失败：', err);
  }
  return map;
}

// 加载文档
function loadDocs() {
  docs = {};
  try {
    const listPath = path.join(docsDir, 'docs-list.json');

    // 加载当前版本的 docs-list.json，缺失时按目录扫描兜底
    let docsMap;
    if (fs.existsSync(listPath)) {
      docsMap = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
    } else {
      console.warn('[arthas] 未找到 docs-list.json，按目录扫描：', listPath);
      docsMap = buildDocsMapFromDisk();
    }

    // 遍历文档映射
    Object.keys(docsMap).forEach(key => {
      const filePath = path.join(docsDir, `${key}.md`);

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const normalized = normalizeMarkdown(content);
        docs[key] = {
          title: key,
          description: docsMap[key],
          content: marked.parse(normalized)
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
      // --- MODIFICATION FOR REQUEST 1: Fullscreen arrow key scrolling ---
      if (document.body.classList.contains('fullscreen')) {
        const contentElement = document.getElementById('content');
        if (contentElement) {
          const scrollAmount = 60; // Adjust scroll speed as needed
          if (e.key === 'ArrowDown') {
            contentElement.scrollTop += scrollAmount;
          } else { // ArrowUp
            contentElement.scrollTop -= scrollAmount;
          }
        }
        e.preventDefault(); // Prevent default page scroll and menu navigation
        return; // Stop further processing for arrow keys in fullscreen
      }
      // --- END MODIFICATION FOR REQUEST 1 ---

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
  const rawActionText = action.text;
  // Ensure currentSearchText is always a string
  const currentSearchText = (typeof rawActionText === 'string' || rawActionText instanceof String) ? rawActionText : '';

  console.log(`[Search_Entry] currentSearchText: "${currentSearchText}" (raw: "${rawActionText}", type: ${typeof rawActionText}), previousSearchText_at_entry: "${previousSearchText}", currentActiveKey: "${currentActiveKey}"`);

  if (typeof rawActionText !== 'string' && !(rawActionText instanceof String)) {
    console.warn(`[Search_Warning] Received non-string action.text. Type: ${typeof rawActionText}, Value:`, rawActionText, ". Treated as empty string.");
  }

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
    const descElement = itemElement.querySelector('.menu-item-desc');

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
      if (descElement) {
        const desc = (docs[originalKey] && docs[originalKey].description) ? String(docs[originalKey].description) : '';
        const d = desc.toLowerCase();
        const idx = d.indexOf(lowerSearchText);
        if (idx !== -1 && lowerSearchText) {
          const b = desc.substring(0, idx);
          const m = desc.substring(idx, idx + lowerSearchText.length);
          const a = desc.substring(idx + lowerSearchText.length);
          descElement.innerHTML = `${escapeHtml(b)}<span class="highlight">${escapeHtml(m)}</span>${escapeHtml(a)}`;
        } else {
          descElement.textContent = desc;
        }
      }
    } else {
      itemElement.style.display = 'none';
      if (titleElement) {
        titleElement.textContent = originalKey;
      }
      if (descElement) {
        const desc = (docs[originalKey] && docs[originalKey].description) ? String(docs[originalKey].description) : '';
        descElement.textContent = desc;
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

  console.log('[Search] handleCommandSearch finished. Active key:', currentActiveKey, 'First matched:', firstMatchedKey, 'Fullscreen:', document.body.classList.contains('fullscreen'));
  // IMPORTANT: previousSearchText is updated *after* all logic, reflecting the text that *led* to the current state.
  previousSearchText = currentSearchText; 
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
  if (!content || !doc) return;
  content.innerHTML = `
    <h1>${key}</h1>
    <div class="doc-description">${doc.description || ''}</div>
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

  const docContentEl = content.querySelector('.doc-content');

  // 注意：真正带滚动条的是 `#content`(.content)，`.doc-content` 只是它的内容容器，
  // 它的 scrollTop 恒为 0，所以目录跳转和 scrollspy 都必须作用在 .content 上。
  const scrollHost = content;

  /** 元素在滚动容器内容坐标系里的偏移（与当前滚动位置无关） */
  const offsetWithin = el =>
    el.getBoundingClientRect().top -
    scrollHost.getBoundingClientRect().top +
    scrollHost.scrollTop;

  const decodeAnchor = raw => {
    try {
      return decodeURIComponent(raw);
    } catch (err) {
      return raw;
    }
  };

  // 滚动到某个锚点。返回 false 表示目标不存在。
  const scrollToAnchor = id => {
    if (!id || !docContentEl) return false;
    const target = Array.from(docContentEl.querySelectorAll('[id]')).find(
      el => el.id === id
    );
    if (!target) return false;
    const top = Math.max(offsetWithin(target) - 8, 0);
    if (typeof scrollHost.scrollTo === 'function') {
      scrollHost.scrollTo({ top, behavior: 'smooth' });
    } else {
      scrollHost.scrollTop = top;
    }
    return true;
  };

  // `#content` 是常驻元素，切换文档时只替换它的 innerHTML，
  // 所以上一个文档的 scrollspy 监听器要先解绑，否则会不断累积。
  if (tocScrollHandler) {
    scrollHost.removeEventListener('scroll', tocScrollHandler);
    tocScrollHandler = null;
  }

  // 目录与正文标题共用同一套编号：先按渲染后的 h2~h4 顺序算出编号，
  // 一边写进标题本身，一边用来生成目录。这样点击目录跳过去后，
  // 目标标题前面就带着同一个序号，能立刻确认自己落在哪一节。
  const headingEls = docContentEl
    ? Array.from(docContentEl.querySelectorAll('h2, h3, h4')).filter(
        h => h.parentElement === docContentEl // 忽略引用块里的标题
      )
    : [];
  const tocItems = [];
  const numEls = [];
  {
    const counters = [];
    headingEls.forEach(h => {
      const level = Number(h.tagName.slice(1));
      // 多级编号：h2 → 1，h3 → 1.1，h4 → 1.1.1。
      // 标题层级可能跳级（例如 h2 下面直接是 h4），这里统一按「上一级的下一级」
      // 处理，保证编号连续，不会出现 1.0.1 这种读不懂的序号。
      const depth = Math.max(1, Math.min(level - 1, counters.length + 1));
      counters.length = depth;
      counters[depth - 1] = (counters[depth - 1] || 0) + 1;
      const number = counters.join('.');
      const text = h.textContent.trim();
      if (!h.id) h.id = slugify(text);

      const num = document.createElement('span');
      num.className = 'heading-num';
      num.textContent = number;
      h.insertBefore(num, h.firstChild);

      numEls.push(num);
      tocItems.push({ id: h.id, text, level, depth, number });
    });

    // 全篇共用一列右对齐的序号：数字右缘、标题左缘各自成一条竖线，
    // 换到下一级不会因为字号变小反而往前缩。
    if (numEls.length) {
      let gutter = 0;
      numEls.forEach(el => {
        gutter = Math.max(gutter, el.getBoundingClientRect().width);
      });
      const width = Math.ceil(gutter) + 'px';
      numEls.forEach(el => {
        el.style.minWidth = width;
      });
    }
  }

  if (tocItems.length && docContentEl) {
    const tocEl = document.createElement('nav');
    tocEl.className = 'doc-toc';
    const list = document.createElement('ul');
    let maxNumLength = 1;
    tocItems.forEach(i => {
      maxNumLength = Math.max(maxNumLength, i.number.length);

      const li = document.createElement('li');
      // 缩进按「实际层级」而不是原始标题级别：首个标题是 h3 时它等价于一级条目，
      // 不能挂着 toc-level-3 缩进 16px，否则和编号 1 对不上。
      li.className = 'toc-level-' + (i.depth + 1);
      const a = document.createElement('a');
      a.href = '#' + i.id;
      a.dataset.anchorId = i.id; // 直接用原始 id，避免 hash 被百分号编码后比对不上
      const num = document.createElement('span');
      num.className = 'toc-num';
      num.textContent = i.number;
      a.appendChild(num);
      a.appendChild(document.createTextNode(i.text));
      li.appendChild(a);
      list.appendChild(li);
    });
    tocEl.appendChild(list);
    // 让所有条目的文字左边缘对齐：编号列宽度取当前文档最长编号
    tocEl.style.setProperty('--toc-num-width', maxNumLength + 'ch');
    docContentEl.insertAdjacentElement('afterbegin', tocEl);
    const links = Array.from(tocEl.querySelectorAll('a'));
    const spy = () => {
      let activeId = null;
      const top = scrollHost.scrollTop + 16;
      for (const h of headingEls) {
        if (offsetWithin(h) <= top) activeId = h.id;
      }
      links.forEach(a => {
        a.classList.toggle('active', a.dataset.anchorId === activeId);
      });
    };
    tocScrollHandler = spy;
    scrollHost.addEventListener('scroll', spy);
    spy();
  }

  // 文档内的锚点链接（顶部目录、标题旁的 `#`）不能靠浏览器默认行为跳转：
  // 真正带滚动条的是 `.content`（`.doc-content` 只是内容容器），hash 跳转不会作用到它，
  // 而且下面的通用链接处理会把 `#id` 当成外链丢给系统浏览器，所以这里统一接管。
  if (docContentEl) {
    docContentEl.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const id =
          link.dataset.anchorId ||
          decodeAnchor((link.getAttribute('href') || '').slice(1));
        if (!scrollToAnchor(id)) return;
        // 平滑滚动期间 scrollspy 还没被触发，先立刻给出高亮反馈
        docContentEl.querySelectorAll('.doc-toc a').forEach(a => {
          a.classList.toggle('active', (a.dataset.anchorId || '') === id);
        });
      });
    });
  }

  const codes = content.querySelectorAll('.doc-content pre > code');
  codes.forEach(code => {
    const pre = code.parentElement;
    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', () => {
      const text = code.innerText;
      if (window.utools && window.utools.copyText) {
        window.utools.copyText(text);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  const calloutTypes = [
    { key: '提示', cls: 'tip' },
    { key: '注意', cls: 'note' },
    { key: '警告', cls: 'warning' },
    { key: '小技巧', cls: 'info' },
    { key: '说明', cls: 'info' }
  ];

  // (1) 文档里的容器统一规范化为 `> **提示**` 的引用块形式，
  //     这里把整个引用块转换成带样式的 callout。
  content.querySelectorAll('.doc-content blockquote').forEach(blockquote => {
    const first = blockquote.querySelector('p');
    if (!first || !first.querySelector('strong')) return;
    const title = (first.textContent || '').trim().replace(/[:：]\s*$/, '');
    const type = calloutTypes.find(ct => ct.key === title);
    if (!type) return;

    const wrap = document.createElement('div');
    wrap.className = 'callout ' + type.cls;
    const head = document.createElement('strong');
    head.textContent = title;
    wrap.appendChild(head);

    first.remove();
    while (blockquote.firstChild) wrap.appendChild(blockquote.firstChild);
    blockquote.replaceWith(wrap);
  });

  // (2) 普通段落以「提示：」/「注意：」开头的形式
  content.querySelectorAll('.doc-content p').forEach(p => {
    const t = (p.textContent || '').trim();
    for (const ct of calloutTypes) {
      if (t.startsWith(ct.key + '：') || t.startsWith(ct.key + ':')) {
        const wrap = document.createElement('div');
        wrap.className = 'callout ' + ct.cls;
        const strong = document.createElement('strong');
        strong.textContent = ct.key;
        const rest = document.createElement('span');
        rest.textContent = t.slice(ct.key.length + 1);
        wrap.appendChild(strong);
        wrap.appendChild(rest);
        p.replaceWith(wrap);
        break;
      }
    }
  });

  // 处理超链接点击事件
  //  - 站外链接（http/https/mailto …）交给 uTools 用系统浏览器打开
  //  - 文档内锚点（`#` 开头）由上面的 scrollToAnchor 处理，这里直接放行
  //  - 指向其它命令文档的链接（`/doc/xxx.md`）直接在插件里切换文档
  content.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = (link.getAttribute('href') || '').trim();
      // 文档内锚点：交给 scrollToAnchor 处理，这里不拦截
      if (href.startsWith('#')) return;

      e.preventDefault(); // 阻止默认行为
      if (!href) return;

      // `/doc/xxx.md` -> 切换到对应的命令文档
      const docMatch = href.match(/(?:^|\/)([\w.-]+)\.md$/i);
      if (docMatch && !/^[a-z][a-z0-9+.-]*:/i.test(href) && docs[docMatch[1]]) {
        showContent(docMatch[1]);
        scrollHost.scrollTop = 0;
        return;
      }

      // 相对路径链接（图片、附件等）在插件里没有对应页面，不开系统浏览器
      if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//')) {
        console.warn('[ArthasDocs] 跳过无法处理的相对链接:', href);
        return;
      }

      // 使用 uTools 的 API 打开外部链接
      if (window.utools && typeof window.utools.shellOpenExternal === 'function') {
        window.utools.shellOpenExternal(href);
      } else {
        console.warn('uTools API 不可用，无法打开外部链接:', href);
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

// 加载文档分组（按当前版本目录）
function loadDocGroups() {
  docGroups = [];
  try {
    const groupsPath = path.join(docsDir, 'docs-group.json');
    if (fs.existsSync(groupsPath)) {
      docGroups = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));
    } else {
      console.warn('文档分组文件不存在:', groupsPath);
    }
  } catch (error) {
    console.error('加载文档分组失败:', error);
    docGroups = [];
  }
  rebuildCategoryOptions();
}

// 重建分组下拉：切换版本后分组会变，必须整组重画
function rebuildCategoryOptions() {
  if (!categoryDropdown) return;

  currentCategory = 'all';
  categoryButton.textContent = '全部文档';
  categoryDropdown.innerHTML = '';

  const allOption = document.createElement('a');
  allOption.href = '#';
  allOption.setAttribute('data-category', 'all');
  allOption.textContent = '全部文档';
  allOption.classList.add('active');
  categoryDropdown.appendChild(allOption);

  docGroups.forEach(group => {
    const option = document.createElement('a');
    option.href = '#';
    option.setAttribute('data-category', group.name);
    option.textContent = group.name;
    categoryDropdown.appendChild(option);
  });
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
  // 分组下拉与版本下拉互斥
  if (typeof closeVersionDropdown === 'function') closeVersionDropdown();
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

/* ------------------------------------------------------------------ *
 * 版本切换（左上角弧形角标）
 *
 *   默认只占很小一块，鼠标移上去才展开；点击弹出所有已收录的版本目录。
 *   版本列表来自 docs/ 下的 semver 目录，新版本排在最前。
 * ------------------------------------------------------------------ */
const versionCorner = document.getElementById('versionCorner');
const versionButton = document.getElementById('versionButton');
const versionDropdown = document.getElementById('versionDropdown');
const versionShortLabel = document.getElementById('versionShort');
const versionFullLabel = document.getElementById('versionFull');
const switcherEl = document.getElementById('switcher');

const VERSION_STORE_KEY = 'arthas-docs:version';
let versions = [];
let currentVersion = '';

// 角标展开时，分组按钮的文字跟着右移，避免两块内容叠在一起
function setVersionExpanded(expanded) {
  if (switcherEl) switcherEl.classList.toggle('version-expanded', !!expanded);
}

if (versionCorner) {
  versionCorner.addEventListener('mouseenter', () => setVersionExpanded(true));
  versionCorner.addEventListener('mouseleave', () => {
    if (!versionDropdown.classList.contains('show')) setVersionExpanded(false);
  });
}

if (versionButton) {
  versionButton.addEventListener('focus', () => setVersionExpanded(true));
  versionButton.addEventListener('blur', () => {
    if (!versionDropdown.classList.contains('show') && !versionCorner.matches(':hover')) {
      setVersionExpanded(false);
    }
  });
}

function readStoredVersion() {
  try {
    if (window.utools && utools.dbStorage) return utools.dbStorage.getItem(VERSION_STORE_KEY);
  } catch (err) {
    /* 忽略：回落 localStorage */
  }
  try {
    return localStorage.getItem(VERSION_STORE_KEY);
  } catch (err) {
    return null;
  }
}

function storeVersion(version) {
  try {
    if (window.utools && utools.dbStorage) utools.dbStorage.setItem(VERSION_STORE_KEY, version);
  } catch (err) {
    /* 忽略 */
  }
  try {
    localStorage.setItem(VERSION_STORE_KEY, version);
  } catch (err) {
    /* 忽略 */
  }
}

function buildVersionOptions() {
  if (!versionDropdown) return;
  versionDropdown.innerHTML = '';
  const latest = versions[0];

  versions.forEach(version => {
    const item = document.createElement('a');
    item.href = '#';
    item.setAttribute('data-version', version);
    if (version === currentVersion) item.classList.add('active');

    const label = document.createElement('span');
    label.textContent = version;
    item.appendChild(label);

    const tag = document.createElement('span');
    tag.className = 'version-tag' + (version === latest ? ' is-latest' : '');
    tag.textContent = version === latest ? '最新' : '旧版';
    item.appendChild(tag);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeVersionDropdown();
      setVersion(version);
    });

    versionDropdown.appendChild(item);
  });
}

function updateVersionUI() {
  if (!currentVersion) return;
  if (versionShortLabel) versionShortLabel.textContent = currentVersion;
  if (versionFullLabel) versionFullLabel.textContent = currentVersion;
  buildVersionOptions();
}

function openVersionDropdown() {
  versionDropdown.classList.add('show');
  versionCorner.classList.add('open');
  versionButton.setAttribute('aria-expanded', 'true');
  setVersionExpanded(true);
  setTimeout(() => document.addEventListener('click', closeVersionDropdown), 0);
}

function closeVersionDropdown() {
  if (versionDropdown) versionDropdown.classList.remove('show');
  if (versionCorner) versionCorner.classList.remove('open');
  if (versionButton) versionButton.setAttribute('aria-expanded', 'false');
  // 鼠标还停在角标上时保持展开，避免文字跳回去
  if (versionCorner && !versionCorner.matches(':hover')) setVersionExpanded(false);
  document.removeEventListener('click', closeVersionDropdown);
}

// 切换版本：换目录 -> 重载文档 -> 重画分组与菜单 -> 回到第一篇
function setVersion(version) {
  if (!version) return;
  if (version === currentVersion && Object.keys(docs).length) return;

  const previous = currentVersion;
  currentVersion = version;
  docsDir = path.join(DOCS_ROOT, version);

  docs = {};
  currentActiveKey = '';

  loadDocs();
  loadDocGroups();
  initMenu();

  const keys = Object.keys(docs);
  const contentEl = document.getElementById('content');
  if (keys.length) {
    showContent(keys[0]);
  } else if (contentEl) {
    contentEl.innerHTML = '<h1>文档为空</h1><p>该版本目录下没有可用的 Markdown 文档。</p>';
  }

  updateVersionUI();
  storeVersion(version);

  if (previous && previous !== version) {
    showNotification(`已切换到 ${version} 版本文档`, 'success');
  }
}

function initVersions() {
  versions = listVersions();
  if (!versions.length) {
    console.error('[arthas] docs/ 下没有找到任何版本目录');
    loadDocs();
    loadDocGroups();
    initMenu();
    const keys = Object.keys(docs);
    if (keys.length) showContent(keys[0]);
    return;
  }

  const stored = readStoredVersion();
  const start = versions.includes(stored) ? stored : versions[0];
  setVersion(start);
}

if (versionButton) {
  versionButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (versionDropdown.classList.contains('show')) {
      closeVersionDropdown();
    } else {
      // 分组下拉和版本下拉互斥
      categoryDropdown.classList.remove('show');
      openVersionDropdown();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && versionDropdown && versionDropdown.classList.contains('show')) {
    closeVersionDropdown();
  }
});

// 统一聚焦搜索框的方法
function focusSearchInput(options = {}) {
  console.log(`[FocusSearchInput_Entry] Called. keepInput: ${options.keepInput}, getSubInput type: ${window.utools ? typeof window.utools.getSubInput : 'utools_NA'}, setSubInput type: ${window.utools ? typeof window.utools.setSubInput : 'utools_NA'}`);
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    let textToSet = '';
    let source = 'empty_default';

    if (options.keepInput === true) {
      if (typeof utools.getSubInput === 'function') {
        const currentSubInput = utools.getSubInput();
        if (currentSubInput && typeof currentSubInput.text === 'string') {
          textToSet = currentSubInput.text;
          source = 'getSubInput_success';
          console.log('[FocusSearchInput] keepInput:true. Successfully got text from utools.getSubInput():', `"${textToSet}"`);
        } else {
          textToSet = previousSearchText || ''; // Fallback
          source = 'getSubInput_failed_fallback_previousSearchText';
          console.log('[FocusSearchInput] keepInput:true. utools.getSubInput() did not return valid text. Fallback to previousSearchText:', `"${textToSet}"`);
        }
      } else {
        textToSet = previousSearchText || ''; // Fallback
        source = 'getSubInput_unavailable_fallback_previousSearchText';
        console.log('[FocusSearchInput] keepInput:true. utools.getSubInput() is NOT a function. Fallback to previousSearchText:', `"${textToSet}"`);
      }
    } else {
      // For keepInput: false (or undefined), textToSet remains '', source is 'empty_default' (clearing input)
      source = 'clearing_input';
      console.log('[FocusSearchInput] keepInput:false (or undefined). Setting input to empty string.');
    }

    console.log(`[FocusSearchInput_Set] Attempting utools.setSubInput with text: "${textToSet}" (source: ${source}), selectAll: true`);
    utools.setSubInput(handleCommandSearch, textToSet, true);
  } else {
    console.warn('[FocusSearchInput_Error] utools.setSubInput is not available or window.utools is not defined.');
  }
}

// uTools窗口每次激活都设置搜索框，解决窗口重用后搜索框丢失问题
if (window.utools && typeof window.utools.onPluginEnter === 'function') {
  window.utools.onPluginEnter(() => {
    console.log('[onPluginEnter] Plugin entered. Scheduling setSubInput to PLACEHOLDER_TEXT.');
    if (window.utools && typeof window.utools.setSubInput === 'function') {
        setTimeout(() => { 
            console.log('[onPluginEnter_Timeout] Executing delayed setSubInput with PLACEHOLDER_TEXT.');
            utools.setSubInput(handleCommandSearch, PLACEHOLDER_TEXT, true);
        }, 100); // 100ms delay might be important
    } else {
      console.warn('[onPluginEnter_Timeout_Error] utools.setSubInput not available when trying to set placeholder.');
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
    if (isEditableElement(active)) {
      console.log('[GlobalKeydown_Space] Space pressed in an editable element. Ignoring.');
      return; 
    }

    e.preventDefault(); 
    console.log('[GlobalKeydown_Space] Space pressed on non-editable element. Prevented default. Allowing uTools to process and call handleCommandSearch.');
    // We no longer try to inspect utools.getSubInput() here or conditionally return.
    // uTools will capture the space, append it to its current sub-input value,
    // and then call handleCommandSearch with the new, space-appended text.
    // handleCommandSearch is responsible for interpreting this.
  }
  // 监听 ESC 退出全屏
  if (e.code === 'Escape' && document.body.classList.contains('fullscreen')) {
    console.log('[GlobalKeydown_Escape] Escape pressed in fullscreen. Exiting fullscreen.');
    exitFullscreen();
  }
});

// <--- 修改：DOMContentLoaded 事件监听器 -->
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ArthasDocs] DOMContentLoaded event fired.');
  // 版本目录 -> 文档 -> 分组 -> 菜单 -> 首页文档，全部在 initVersions 里串起来
  initVersions();

  // 移除了此处的 setSubInput 调用，统一由 onPluginEnter 管理初始状态
  // if (window.utools) {
  //   ...
  // }
  // ... fallback input 保留 ...

  // 首页文档已在 initVersions() 里跟随当前版本渲染，这里不再重复渲染

  // onPluginEnter 中已处理初始的 setSubInput
  const searchInputElement = document.getElementById('search-input'); // Renamed for clarity

  if (searchInputElement) { // Check if the DOM element exists
    document.addEventListener('mouseup', (event) => {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';

      // Scenario: Text is selected, copy button is visible. User clicks elsewhere (not on copy button).
      if (copyBtn && copyBtn.style.display === 'block' && !copyBtn.contains(event.target)) {
        // Check if the click target is a "neutral" area (not another interactive element).
        const targetIsNeutral = !event.target.closest('button, a, input, textarea, select, .sidebar, #resizer, .menu-item') &&
                                event.target !== searchInputElement;
        
        if (targetIsNeutral) {
          hideCopyButton();
          focusSearchInput({ keepInput: false });
          return; // Explicitly handled.
        }
      }

      // Fallback: If text is selected, and user clicks a neutral area,
      // and it wasn't the copy button itself (its own handler runs for that),
      // and it wasn't the "click away from visible copy button" scenario handled above.
      if (selectedText) {
        const generallyClickedNeutralArea = 
            event.target !== searchInputElement && // searchInputElement might be null, this is fine
            !event.target.closest('button, a, input, textarea, select, .sidebar, #resizer, .menu-item');

        const notClickingCopyButtonItself = !(copyBtn && copyBtn.contains(event.target));

        if (generallyClickedNeutralArea && notClickingCopyButtonItself) {
            focusSearchInput({ keepInput: false });
        }
      }
    });
  }
});
// <--- 结束：修改后的 DOMContentLoaded -->

// 选中文本浮动"复制"按钮
let copyBtn = null;
let lastSelectionText = '';
let lastMouseUpPos = null;
let contentIsDragging = false; // <--- Add new state variable

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
  contentEl.addEventListener('mousedown', (e) => {
    contentIsDragging = false;
    // Do NOT hide copy button here unconditionally.
    // If it's a mousedown on the copy button itself, its own handler will work.
    // If it's mousedown on content starting a drag, mousemove will hide.
    // If it's mousedown on content that will be a click, document.mouseup will handle.
  });

  contentEl.addEventListener('mousemove', (e) => {
    // Check if primary mouse button is pressed (dragging) and drag just started
    if (e.buttons === 1 && !contentIsDragging) { 
        contentIsDragging = true;
        hideCopyButton(); // Hide button when dragging starts
    }
  });

  contentEl.addEventListener('mouseup', (e) => {
    lastMouseUpPos = { x: e.clientX, y: e.clientY };
    // updateCopyButton should be called whether it was a click or drag end,
    // to reflect current selection.
    updateCopyButton(); 

    // Reset for next interaction, after updateCopyButton might have used lastMouseUpPos
    contentIsDragging = false; 
  });
  contentEl.addEventListener('keyup', () => {
    lastMouseUpPos = null; // Reset mouse position for keyboard selection
    updateCopyButton(); // Update copy button based on keyboard selection changes
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
