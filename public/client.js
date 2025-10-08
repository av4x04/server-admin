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
const STORAGE_KEY = 'admin-servers-list';

let currentSocket = null;
let activeServerUrl = null;
let servers = [];
let connectionAnimationInterval = null;

// UI Elements
const statusText = document.getElementById('status-text');
const serverListContainer = document.getElementById('server-list');
const terminalTitle = document.getElementById('terminal-title');
const modalOverlay = document.getElementById('modal-overlay');
const serverForm = document.getElementById('server-form');

const DEFAULT_SERVERS = [
    {
        uid: 'default-1',
        name: 'Server A - Main Project',
        url: 'https://server-v1-c2nb.onrender.com/',
        description: 'Main production server',
        deployHookUrl: 'https://api.render.com/deploy/srv-d3j0h7je5dus739f2cc0?key=75kshW-Qsbk'
    },
    {
        uid: 'default-2',
        name: 'Server B - Staging',
        url: 'https://your-second-server.onrender.com/',
        description: 'Staging environment',
        deployHookUrl: ''
    },
];

/**
 * Loads servers from localStorage or uses defaults.
 */
function loadServers() {
    const storedServers = localStorage.getItem(STORAGE_KEY);
    if (storedServers) {
        servers = JSON.parse(storedServers);
    } else {
        servers = DEFAULT_SERVERS;
        saveServers();
    }
}

/**
 * Saves the current server list to localStorage.
 */
function saveServers() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

/**
 * Renders the list of servers in the sidebar.
 */
function renderServerList() {
    serverListContainer.innerHTML = ''; // Clear existing list
    
    servers.forEach((server, index) => {
        const iconClass = ICONS[index % ICONS.length];
        const serverElement = document.createElement('div');
        serverElement.className = 'tab-item';
        if (server.url === activeServerUrl) {
            serverElement.classList.add('active');
        }
        serverElement.setAttribute('role', 'listitem');
        serverElement.dataset.uid = server.uid;

        serverElement.innerHTML = `
            <div class="icon-circle"><i class="${iconClass}"></i></div>
            <div class="tab-meta">
                <div class="tab-name">${server.name}</div>
                <div class="tab-sub">${server.description || server.url}</div>
            </div>
            <div class="tab-actions">
                <button class="options-btn" title="Tùy chọn"><i class="fas fa-ellipsis-v"></i></button>
                <div class="options-menu">
                    <a href="#" class="reboot-btn"><i class="fas fa-sync-alt"></i> Khởi động lại</a>
                    <a href="#" class="delete-btn delete"><i class="fas fa-trash-alt"></i> Xóa Server</a>
                </div>
            </div>
        `;

        // Event listener for selecting the server
        serverElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-actions')) {
                connectToServer(server);
            }
        });

        // Event listeners for the options menu
        const optionsBtn = serverElement.querySelector('.options-btn');
        const optionsMenu = serverElement.querySelector('.options-menu');
        const rebootBtn = serverElement.querySelector('.reboot-btn');
        const deleteBtn = serverElement.querySelector('.delete-btn');

        optionsBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isVisible = optionsMenu.classList.contains('show');
            document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
            if (!isVisible) {
              optionsMenu.classList.add('show');
            }
        });

        rebootBtn.addEventListener('click', e => {
            e.stopPropagation();
            optionsMenu.classList.remove('show');
            handleReboot(server);
        });

        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            optionsMenu.classList.remove('show');
            handleDelete(server);
        });

        serverListContainer.appendChild(serverElement);
    });
}

/**
 * Shows a connection animation in the terminal.
 * @param {object} server - The server object being connected to.
 */
function showConnectionAnimation(server) {
    if (connectionAnimationInterval) clearInterval(connectionAnimationInterval);
    term.reset();

    const duckFrames = [
        '   __\n_<(o )~\n \\/---',
        '   __\n_<(o )~\n  \\---/',
    ];
    let frameIndex = 0;
    let dots = '';

    connectionAnimationInterval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        const text = `\x1b[33mĐang kết nối tới Vịt-chủ: \x1b[1m${server.name}\x1b[0m\x1b[33m${dots}\x1b[0m`;
        
        // \x1b[2J clears the screen, \x1b[H moves cursor to home
        term.write('\x1b[2J\x1b[H'); 
        term.write(text + '\r\n\r\n');
        term.write(duckFrames[frameIndex] + '\r\n');
        
        frameIndex = (frameIndex + 1) % duckFrames.length;
    }, 400);
}


/**
 * Establishes a Socket.IO connection to a specific server.
 * @param {object} server - The server object to connect to.
 */
function connectToServer(server) {
  if (activeServerUrl === server.url) return;

  if (currentSocket) currentSocket.disconnect();

  activeServerUrl = server.url;
  statusText.textContent = `Đang kết nối đến ${server.name}...`;
  terminalTitle.textContent = server.name;

  showConnectionAnimation(server);

  renderServerList(); // Re-render to update active state

  currentSocket = io(server.url, { transports: ['websocket'] });

  currentSocket.on('connect', () => {
    clearInterval(connectionAnimationInterval);
    connectionAnimationInterval = null;
    console.log(`🟢 Đã kết nối đến server: ${server.url}`);
    statusText.textContent = `Đã kết nối: ${server.name}`;
    term.write('\r\n\x1b[32m✅ Vịt-chủ đã trả lời! Kết nối thành công!\x1b[0m\r\n');
  });

  currentSocket.on('disconnect', () => {
    clearInterval(connectionAnimationInterval);
    connectionAnimationInterval = null;
    console.log(`🔴 Mất kết nối với server: ${server.url}`);
    if (activeServerUrl === server.url) {
        statusText.textContent = 'Mất kết nối';
        term.write('\r\n\x1b[31m⚠️ Vịt-chủ đi lạc rồi! Mất kết nối...\x1b[0m\r\n');
    }
  });
  
  currentSocket.on('output', data => {
      if(connectionAnimationInterval) { // Stop animation on first output
        clearInterval(connectionAnimationInterval);
        connectionAnimationInterval = null;
      }
      term.write(data);
  });

  currentSocket.on('history', history => {
    if(connectionAnimationInterval) {
        clearInterval(connectionAnimationInterval);
        connectionAnimationInterval = null;
        term.reset(); // Clear animation before writing history
    }
    term.write(history);
  });
}

async function handleReboot(server) {
    if (!server.deployHookUrl) {
        term.write(`\r\n\x1b[31m Lỗi: Server '${server.name}' không có "Nút Reboot thần kỳ" 🚀.\x1b[0m\r\n`);
        return;
    }
    term.write(`\r\n\x1b[33m🚀 Gửi tín hiệu vũ trụ để reboot '${server.name}'...\x1b[0m\r\n`);
    try {
        const response = await fetch(server.deployHookUrl, { method: 'POST' });
        if (response.ok) {
            term.write(`\x1b[32m✅ Vịt-chủ đã nhận tín hiệu và đang khởi động lại!\x1b[0m\r\n`);
        } else {
            term.write(`\x1b[31m❌ Tín hiệu vũ trụ bị nhiễu: ${response.status} ${response.statusText}\x1b[0m\r\n`);
        }
    } catch (error) {
        console.error("Lỗi reboot:", error);
        term.write(`\x1b[31m❌ Lỗi mạng khi gửi tín hiệu: ${error.message}\x1b[0m\r\n`);
    }
}

function handleDelete(serverToDelete) {
    if (!confirm(`Bạn có chắc chắn muốn "thả" Vịt-chủ '${serverToDelete.name}' về với tự nhiên không? 🦆`)) return;

    servers = servers.filter(s => s.uid !== serverToDelete.uid);
    saveServers();

    if (activeServerUrl === serverToDelete.url) {
        if (currentSocket) currentSocket.disconnect();
        currentSocket = null;
        activeServerUrl = null;
        term.reset();
        terminalTitle.textContent = 'Terminal';
        
        if (servers.length > 0) {
            connectToServer(servers[0]);
        } else {
            statusText.textContent = 'Trống';
            term.write('Chuồng trống trơn. Hãy thêm một Vịt-chủ để bắt đầu.');
        }
    }
    renderServerList();
}


/**
 * Shows the modal for adding a new server.
 */
function showModal() {
    serverForm.reset();
    modalOverlay.classList.add('show');
}

/**
 * Hides the modal.
 */
function hideModal() {
    modalOverlay.classList.remove('show');
}

function handleFormSubmit(event) {
    event.preventDefault();
    const newServer = {
        uid: 'server_' + Date.now(),
        name: document.getElementById('server-name').value,
        url: document.getElementById('server-url').value,
        description: document.getElementById('server-description').value,
        deployHookUrl: document.getElementById('server-deploy-hook').value,
    };
    servers.push(newServer);
    saveServers();
    renderServerList();
    hideModal();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
}

/**
 * Main initialization function.
 */
function initializeDashboard() {
  loadServers();
  renderServerList();
  
  if (servers.length > 0) {
    connectToServer(servers[0]);
  } else {
      statusText.textContent = 'Không có server nào';
      term.write('Không tìm thấy Vịt-chủ nào. Hãy thêm một server để bắt đầu.');
  }

  // Event Listeners
  document.getElementById('add-server-btn').addEventListener('click', showModal);
  document.getElementById('cancel-btn').addEventListener('click', hideModal);
  serverForm.addEventListener('submit', handleFormSubmit);

  // Close menus/modals with a click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.options-btn') && !e.target.closest('.options-menu')) {
      document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
    }
    if (e.target === modalOverlay) {
        hideModal();
    }
  });

  // Send terminal input data
  term.onData(data => {
    if (currentSocket) {
      currentSocket.emit('input', data);
    }
  });
}

// Khởi chạy khi trang được tải
window.addEventListener('load', initializeDashboard);
