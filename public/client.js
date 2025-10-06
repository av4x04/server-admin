// server-admin/public/client.js

const term = new Terminal({
  theme: {
    background: 'transparent',
    foreground: '#e6eef2',
    cursor: '#00d084',
    selection: 'rgba(0, 208, 132, 0.3)',
    black: '#0b0b0c',
    red: '#ff7b7b',
    green: '#7ef3b2',
    yellow: '#ffd27a',
    blue: '#75d1ff',
    magenta: '#c792ea',
    cyan: '#89ddff',
    white: '#e6eef2',
    brightBlack: '#8b8f92',
    brightRed: '#ff9e9e',
    brightGreen: '#a1f8cd',
    brightYellow: '#ffe5a8',
    brightBlue: '#a4e1ff',
    brightMagenta: '#e4b9ff',
    brightCyan: '#b8edff',
    brightWhite: '#ffffff',
  },
  fontSize: 14,
  fontFamily: 'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
  cursorBlink: true,
  cursorStyle: 'block',
  allowTransparency: true,
  windowsMode: false,
  scrollback: 1000,
});

term.open(document.getElementById('terminal'));

const ICONS = ['fas fa-server', 'fas fa-database', 'fas fa-network-wired', 'fas fa-laptop-code'];

// --- Global state and DOM elements ---
let currentSocket = null;
let activeServerUrl = null;
let servers = [];

const statusText = document.getElementById('status-text');
const serverListContainer = document.getElementById('server-list');
const terminalTitle = document.getElementById('terminal-title');
const terminalElement = document.getElementById('terminal');
const loaderElement = document.getElementById('loader');

// Modal elements
const addServerModal = document.getElementById('add-server-modal');
const addServerBtn = document.getElementById('add-server-btn');
const cancelAddServerBtn = document.getElementById('cancel-add-server');
const addServerForm = document.getElementById('add-server-form');

// --- Functions ---

/**
 * Hiển thị loader và ẩn terminal.
 */
function showLoader() {
  terminalElement.style.display = 'none';
  loaderElement.style.display = 'flex';
}

/**
 * Ẩn loader và hiển thị terminal.
 */
function hideLoader() {
  loaderElement.style.display = 'none';
  terminalElement.style.display = 'block';
}

/**
 * Thiết lập kết nối Socket.IO đến một server cụ thể.
 * @param {string} url - URL của server terminal.
 * @param {string} name - Tên của server để hiển thị.
 */
function connectToServer(url, name) {
  if (activeServerUrl === url && currentSocket && currentSocket.connected) {
    return; // Đã kết nối đến server này rồi
  }

  if (currentSocket) {
    currentSocket.disconnect();
  }

  activeServerUrl = url;
  term.reset();
  showLoader();
  statusText.textContent = `Đang kết nối đến ${name}...`;
  terminalTitle.textContent = name;
  
  document.querySelectorAll('#server-list .tab-item').forEach(item => {
    item.classList.toggle('active', item.dataset.url === url);
  });

  currentSocket = io(url, { transports: ['websocket'], reconnection: true, reconnectionAttempts: 5 });

  currentSocket.on('connect', () => {
    console.log(`🟢 Đã kết nối đến server: ${url}`);
    statusText.textContent = `Đã kết nối: ${name}`;
    hideLoader();
    term.write('\x1b[32m✅ Kết nối thành công!\x1b[0m\r\n');
  });

  currentSocket.on('disconnect', () => {
    console.log(`🔴 Mất kết nối với server: ${url}`);
    if (activeServerUrl === url) {
        statusText.textContent = 'Mất kết nối';
        hideLoader();
        term.write('\x1b[31m⚠️  Mất kết nối với server.\x1b[0m\r\n');
    }
  });

  currentSocket.on('connect_error', (err) => {
    console.error(`Lỗi kết nối đến ${url}:`, err.message);
    if (activeServerUrl === url) {
        statusText.textContent = `Lỗi kết nối`;
        hideLoader();
        term.write(`\x1b[31m❌ Không thể kết nối đến ${name}. Vui lòng kiểm tra lại URL và trạng thái server.\x1b[0m\r\n`);
    }
  });
  
  currentSocket.on('output', data => term.write(data));
  currentSocket.on('history', history => term.write(history));
}

term.onData(data => {
  if (currentSocket && currentSocket.connected) {
    currentSocket.emit('input', data);
  }
});

/**
 * Render lại danh sách server trên UI.
 */
function renderServerList() {
  serverListContainer.innerHTML = '';
  servers.forEach((server, index) => {
    const iconClass = ICONS[index % ICONS.length];
    const serverElement = document.createElement('div');
    serverElement.className = 'tab-item';
    serverElement.setAttribute('role', 'listitem');
    serverElement.dataset.url = server.url;
    serverElement.dataset.name = server.name;
    serverElement.dataset.resetUrl = server.resetUrl || '';

    serverElement.innerHTML = `
      <div class="icon-circle"><i class="${iconClass}"></i></div>
      <div class="tab-meta">
        <div class="tab-name">${server.name}</div>
        <div class="tab-sub">${server.description || server.url}</div>
      </div>
      <div class="tab-actions">
        <button class="tab-actions-btn" aria-label="Hành động"><i class="fas fa-ellipsis-v"></i></button>
        <ul class="actions-menu">
          <li class="reset"><i class="fas fa-sync-alt fa-fw"></i> Khởi động lại</li>
          <li class="delete"><i class="fas fa-trash-alt fa-fw"></i> Xóa</li>
        </ul>
      </div>
    `;
    
    // Event listener for connecting
    serverElement.addEventListener('click', (e) => {
      // Don't connect if clicking on the action button
      if (!e.target.closest('.tab-actions')) {
        connectToServer(server.url, server.name);
      }
    });

    // Event listeners for actions menu
    const actionBtn = serverElement.querySelector('.tab-actions-btn');
    const actionMenu = serverElement.querySelector('.actions-menu');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionMenu.classList.toggle('visible');
    });

    serverElement.querySelector('.reset').addEventListener('click', (e) => {
        e.stopPropagation();
        handleResetServer(server.resetUrl, server.name);
        actionMenu.classList.remove('visible');
    });

    serverElement.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteServer(server.url, server.name);
        actionMenu.classList.remove('visible');
    });

    serverListContainer.appendChild(serverElement);
  });
  // Hide all action menus when clicking outside
  document.body.addEventListener('click', () => {
      document.querySelectorAll('.actions-menu.visible').forEach(menu => menu.classList.remove('visible'));
  }, true);
}


/**
 * Lấy danh sách server từ API và khởi tạo dashboard.
 */
async function initializeDashboard() {
  try {
    const response = await fetch('/api/servers');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    servers = await response.json();
    renderServerList();

    if (servers.length > 0) {
      connectToServer(servers[0].url, servers[0].name);
    } else {
      statusText.textContent = 'Không có server';
      hideLoader();
      term.write('Chào mừng! Hãy thêm server đầu tiên bằng nút "+" ở bên trái.');
    }
  } catch (error) {
    console.error("Không thể tải danh sách server:", error);
    statusText.textContent = 'Lỗi tải danh sách';
    hideLoader();
    term.write(`\x1b[31m Lỗi: Không thể tải danh sách server. Vui lòng kiểm tra lại server admin.\x1b[0m`);
  }
}

// --- Action Handlers ---

async function handleAddServer(e) {
  e.preventDefault();
  const formData = new FormData(addServerForm);
  const newServer = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newServer),
    });
    if (!response.ok) throw new Error('Failed to add server');
    servers = await response.json();
    renderServerList();
    closeAddServerModal();
    // Connect to the newly added server
    connectToServer(newServer.url, newServer.name);
  } catch (error) {
    console.error('Lỗi khi thêm server:', error);
    alert('Không thể thêm server. Vui lòng kiểm tra lại thông tin.');
  }
}

async function handleDeleteServer(url, name) {
  if (!confirm(`Bạn có chắc chắn muốn xóa server "${name}" không?`)) return;

  try {
    const response = await fetch('/api/servers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url }),
    });
    if (!response.ok) throw new Error('Failed to delete server');
    servers = await response.json();
    renderServerList();

    // If the active server was deleted, connect to the first one
    if (activeServerUrl === url) {
        activeServerUrl = null; // reset active url
        term.reset();
        if (servers.length > 0) {
            connectToServer(servers[0].url, servers[0].name);
        } else {
            statusText.textContent = 'Không có server';
            hideLoader();
            term.write('Tất cả server đã được xóa.');
        }
    }
  } catch (error) {
    console.error('Lỗi khi xóa server:', error);
    alert('Không thể xóa server.');
  }
}

async function handleResetServer(resetUrl, name) {
  if (!resetUrl) {
      alert(`Server "${name}" không có URL Reset được cấu hình.`);
      return;
  }
  if (!confirm(`Bạn có chắc chắn muốn khởi động lại server "${name}" không?`)) return;
  
  try {
      const response = await fetch('/api/servers/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to send reset request');
      alert(`Đã gửi yêu cầu khởi động lại cho server "${name}".`);
  } catch (error) {
      console.error('Lỗi khi reset server:', error);
      alert(`Không thể khởi động lại server: ${error.message}`);
  }
}


// --- Modal ---
function openAddServerModal() {
  addServerForm.reset();
  addServerModal.style.display = 'flex';
}
function closeAddServerModal() {
  addServerModal.style.display = 'none';
}


function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
}

// --- Event Listeners ---
addServerBtn.addEventListener('click', openAddServerModal);
cancelAddServerBtn.addEventListener('click', closeAddServerModal);
addServerModal.addEventListener('click', (e) => {
    if (e.target === addServerModal) closeAddServerModal();
});
addServerForm.addEventListener('submit', handleAddServer);
window.addEventListener('load', initializeDashboard);
