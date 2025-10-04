// server-admin/public/client.js

// --- DOM ELEMENTS ---
const termContainer = document.getElementById('terminal');
const statusTextEl = document.getElementById('status-text');
const loadingIndicatorEl = document.getElementById('loading-indicator');
const serverListContainer = document.getElementById('server-list');
const terminalTitleEl = document.getElementById('terminal-title');
const addServerBtn = document.getElementById('add-server-btn');
const addServerModal = document.getElementById('add-server-modal');
const cancelAddServerBtn = document.getElementById('cancel-add-server');
const addServerForm = document.getElementById('add-server-form');

// --- XTERM.JS SETUP ---
const term = new Terminal({
  theme: {
    background: 'transparent',
    foreground: '#e6eef2',
    cursor: '#00d084',
    selection: 'rgba(0, 208, 132, 0.3)',
    black: '#0b0b0c', red: '#ff7b7b', green: '#7ef3b2', yellow: '#ffd27a',
    blue: '#75d1ff', magenta: '#c792ea', cyan: '#89ddff', white: '#e6eef2',
    brightBlack: '#8b8f92', brightRed: '#ff9e9e', brightGreen: '#a1f8cd',
    brightYellow: '#ffe5a8', brightBlue: '#a4e1ff', brightMagenta: '#e4b9ff',
    brightCyan: '#b8edff', brightWhite: '#ffffff',
  },
  fontSize: 14,
  fontFamily: 'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
  cursorBlink: true,
  cursorStyle: 'block',
  allowTransparency: true,
  windowsMode: false,
  scrollback: 2000,
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(termContainer);

// --- APP STATE ---
const ICONS = ['fas fa-server', 'fas fa-database', 'fas fa-network-wired', 'fas fa-laptop-code'];
let servers = [];
let currentSocket = null;
let activeServerUrl = null;

// --- HELPER FUNCTIONS ---

/**
 * Toggles the visibility of the loading indicator and status text.
 * @param {boolean} isLoading - Whether the loading state should be shown.
 * @param {string} [text] - Optional text to display in the status element.
 */
function setConnectionStatus(isLoading, text = '') {
  if (isLoading) {
    loadingIndicatorEl.style.display = 'flex';
    statusTextEl.style.display = 'none';
  } else {
    loadingIndicatorEl.style.display = 'none';
    statusTextEl.style.display = 'block';
    statusTextEl.textContent = text;
  }
}

function writeToTerminal(message, type = 'info') {
    const colorMap = {
        info: '\x1b[36m', // Cyan
        success: '\x1b[32m', // Green
        error: '\x1b[31m', // Red
        warning: '\x1b[33m' // Yellow
    };
    const color = colorMap[type] || colorMap.info;
    term.write(`\r\n${color}[${type.toUpperCase()}] ${message}\x1b[0m\r\n`);
}


// --- SERVER DATA MANAGEMENT ---

async function loadServers() {
  const storedServers = localStorage.getItem('admin_servers');
  if (storedServers) {
    servers = JSON.parse(storedServers);
  } else {
    // Fetch default servers if none in localStorage
    try {
      const response = await fetch('/api/servers');
      if (!response.ok) throw new Error('Failed to fetch default servers');
      servers = await response.json();
      saveServers();
    } catch (error) {
      console.error(error);
      writeToTerminal("Could not load default server list.", 'error');
      servers = [];
    }
  }
}

function saveServers() {
  localStorage.setItem('admin_servers', JSON.stringify(servers));
}

// --- UI RENDERING ---

function renderServerList() {
  serverListContainer.innerHTML = ''; // Clear existing list
  if (servers.length === 0) {
    serverListContainer.innerHTML = `<div class="tab-sub" style="padding: 10px;">Không có server nào. Hãy thêm một server mới bằng nút '+' ở trên.</div>`;
    return;
  }
  
  servers.forEach((server, index) => {
    const iconClass = ICONS[index % ICONS.length];
    const serverElement = document.createElement('div');
    serverElement.className = 'tab-item';
    if (server.url === activeServerUrl) {
      serverElement.classList.add('active');
    }
    serverElement.setAttribute('role', 'listitem');
    serverElement.dataset.index = index;
    
    serverElement.innerHTML = `
      <div class="icon-circle"><i class="${iconClass}"></i></div>
      <div class="tab-meta">
        <div class="tab-name">${server.name}</div>
        <div class="tab-sub">${server.description || server.url}</div>
      </div>
      <div class="tab-actions">
        <button class="btn ghost" aria-label="Actions"><i class="fas fa-ellipsis-v"></i></button>
        <div class="actions-menu">
          <div class="actions-menu-item reset-server"><i class="fas fa-sync-alt fa-fw"></i> Khởi động lại</div>
          <div class="actions-menu-item danger delete-server"><i class="fas fa-trash-alt fa-fw"></i> Xóa</div>
        </div>
      </div>
    `;
    
    serverListContainer.appendChild(serverElement);
  });
}

// --- EVENT HANDLERS & LOGIC ---

/**
 * Handles clicks on the server list container, delegating to specific actions.
 */
function handleServerListClick(e) {
  const item = e.target.closest('.tab-item');
  if (!item) return;

  const index = parseInt(item.dataset.index, 10);
  const server = servers[index];
  
  const actionsButton = e.target.closest('.tab-actions button');
  const resetButton = e.target.closest('.reset-server');
  const deleteButton = e.target.closest('.delete-server');

  if (actionsButton) {
    e.stopPropagation();
    const menu = item.querySelector('.actions-menu');
    menu.classList.toggle('visible');
    return;
  }
  
  if (resetButton) {
    e.stopPropagation();
    handleResetServer(index);
    item.querySelector('.actions-menu').classList.remove('visible');
    return;
  }

  if (deleteButton) {
    e.stopPropagation();
    handleDeleteServer(index);
    item.querySelector('.actions-menu').classList.remove('visible');
    return;
  }
  
  // Default action: connect to the server
  if (server) {
    connectToServer(server.url, server.name);
  }
}

function handleResetServer(index) {
  const server = servers[index];
  if (!server || !server.deployHookUrl) {
    writeToTerminal(`Server '${server.name}' không có Deploy Hook URL được cấu hình.`, 'error');
    return;
  }
  
  writeToTerminal(`Đang gửi tín hiệu khởi động lại đến '${server.name}'...`, 'info');
  fetch(server.deployHookUrl)
    .then(response => {
      if (response.ok) {
        writeToTerminal(`Tín hiệu khởi động lại đã được gửi thành công đến '${server.name}'.`, 'success');
      } else {
        writeToTerminal(`Gửi tín hiệu thất bại. Server trả về mã lỗi ${response.status}.`, 'error');
      }
    })
    .catch(error => {
      console.error("Deploy hook fetch error:", error);
      writeToTerminal(`Lỗi mạng khi gửi tín hiệu khởi động lại.`, 'error');
    });
}

function handleDeleteServer(index) {
  const server = servers[index];
  if (confirm(`Bạn có chắc muốn xóa server '${server.name}' không?`)) {
    servers.splice(index, 1);
    saveServers();
    renderServerList();
    // If the active server was deleted, connect to the first one available
    if (activeServerUrl === server.url) {
      if (currentSocket) currentSocket.disconnect();
      activeServerUrl = null;
      term.reset();
      if (servers.length > 0) {
        connectToServer(servers[0].url, servers[0].name);
      } else {
        setConnectionStatus(false, "Không có server nào");
        terminalTitleEl.textContent = "Terminal";
      }
    }
  }
}

function handleAddServerSubmit(e) {
  e.preventDefault();
  const newServer = {
    name: document.getElementById('server-name').value,
    url: document.getElementById('server-url').value,
    deployHookUrl: document.getElementById('server-deploy-hook').value,
    description: document.getElementById('server-description').value,
  };
  servers.push(newServer);
  saveServers();
  renderServerList();
  addServerModal.classList.remove('visible');
  addServerForm.reset();
}

/**
 * Establishes a Socket.IO connection to a specific server.
 * @param {string} url - The URL of the terminal server.
 * @param {string} name - The display name of the server.
 */
function connectToServer(url, name) {
  if (activeServerUrl === url) {
    return; // Already connected to this server
  }

  if (currentSocket) {
    currentSocket.disconnect();
  }

  activeServerUrl = url;
  term.reset();
  setConnectionStatus(true);
  terminalTitleEl.textContent = name;
  writeToTerminal(`Đang kết nối đến ${name} (${url})`, 'warning');

  renderServerList(); // Re-render to update the 'active' class

  currentSocket = io(url, { transports: ['websocket'] });

  currentSocket.on('connect', () => {
    console.log(`🟢 Connected to server: ${url}`);
    setConnectionStatus(false, `Đã kết nối: ${name}`);
    writeToTerminal('Kết nối thành công!', 'success');
    fitAddon.fit();
  });

  currentSocket.on('disconnect', () => {
    console.log(`🔴 Disconnected from server: ${url}`);
    if (activeServerUrl === url) {
        setConnectionStatus(false, 'Mất kết nối');
        writeToTerminal('Mất kết nối với server.', 'error');
    }
  });
  
  currentSocket.on('output', data => term.write(data));
  currentSocket.on('history', history => term.write(history));
}

// --- INITIALIZATION ---

async function initializeDashboard() {
  await loadServers();
  renderServerList();

  if (servers.length > 0) {
    connectToServer(servers[0].url, servers[0].name);
  } else {
    setConnectionStatus(false, 'Không có server');
    term.write('Không tìm thấy server nào được cấu hình. Hãy thêm một server bằng cách nhấn nút "+".');
  }

  // --- GLOBAL EVENT LISTENERS ---
  term.onData(data => {
    if (currentSocket) {
      currentSocket.emit('input', data);
    }
  });
  
  window.addEventListener('resize', () => fitAddon.fit());

  // Modal listeners
  addServerBtn.addEventListener('click', () => addServerModal.classList.add('visible'));
  cancelAddServerBtn.addEventListener('click', () => addServerModal.classList.remove('visible'));
  addServerModal.addEventListener('click', (e) => {
    if (e.target === addServerModal) {
      addServerModal.classList.remove('visible');
    }
  });
  addServerForm.addEventListener('submit', handleAddServerSubmit);

  // Server list click delegation
  serverListContainer.addEventListener('click', handleServerListClick);

  // Hide actions menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-actions')) {
      document.querySelectorAll('.actions-menu.visible').forEach(menu => {
        menu.classList.remove('visible');
      });
    }
  });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
}

// Run the app
window.addEventListener('load', initializeDashboard);
