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

      item.onclick = () => showContent(key);
      item.tabIndex = index;
      menu.appendChild(item);

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

// 初始化
loadDocs();
loadDocGroups();
initMenu();
// 默认显示第一个文档
if (Object.keys(docs).length > 0) {
  showContent(Object.keys(docs)[0]);
}
