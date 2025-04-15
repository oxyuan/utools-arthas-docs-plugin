const { fs, path, marked, __dirname } = window.nodeAPI;


// 修改 docs 目录路径为相对路径
const docsDir = path.join(__dirname, 'docs');
let docs = {};

// 加载文档
function loadDocs() {
  try {
    // 调试：打印路径
    const listPath = path.join(__dirname, 'docs-list.json');
    console.log('Loading docs list from:', listPath);
    
    // 加载 docs-list.json
    const order = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
    console.log('Document order:', order);
    
    // 按照顺序加载文档
    order.forEach(file => {
      // 去掉文件名的 .md 扩展名（如果存在）
      const baseName = file.endsWith('.md') ? file.slice(0, -3) : file;
      const filePath = path.join(docsDir, `${baseName}.md`);
      console.log('Loading document:', filePath);
      
      if (fs.existsSync(filePath)) {
        const key = path.basename(baseName, '.md');
        const content = fs.readFileSync(filePath, 'utf-8');
        docs[key] = {
          title: key,
          content: marked.parse(content)
        };
      } else {
        console.warn('Document not found:', filePath);
      }
    });
    
    console.log('Loaded documents:', Object.keys(docs));
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
    item.textContent = docs[key].title;
    item.onclick = () => showContent(key);
    item.tabIndex = index; // 使菜单项可聚焦
    menu.appendChild(item);
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

// 显示内容
function showContent(key) {
  const content = document.getElementById('content');
  const doc = docs[key];
  content.innerHTML = `
    <h1>${doc.title}</h1>
    <div>${doc.content}</div>
  `;

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
    if (item.textContent === doc.title) {
      item.classList.add('active');
    }
  });
}

// 添加分隔条功能
const resizer = document.getElementById('resizer');
const sidebar = document.querySelector('.sidebar');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResize);
});

function resize(e) {
  if (isResizing) {
    const newWidth = e.clientX;
    sidebar.style.width = `${newWidth}px`;
  }
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResize);
}

// 版本切换功能
const versionButton = document.getElementById('versionButton');
let currentVersion = '4.0.4';

versionButton.addEventListener('click', () => {
  // 这里可以添加切换版本的逻辑
  // 例如：加载不同版本的文档或跳转到其他页面
  alert('版本切换功能待实现');
});

// 初始化
loadDocs();
initMenu();
// 默认显示第一个文档
if (Object.keys(docs).length > 0) {
  showContent(Object.keys(docs)[0]);
}
