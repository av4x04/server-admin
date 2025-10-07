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

let currentSocket = null;
let activeServerUrl = null;

const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const serverListContainer = document.getElementById('server-list');
const terminalTitle = document.getElementById('terminal-title');


/**
 * Thiết lập kết nối Socket.IO đến một server cụ thể.
 * @param {string} url - URL của server terminal.
 * @param {string} name - Tên của server để hiển thị.
 */
function connectToServer(url, name) {
  if (activeServerUrl === url) {
    return; // Đã kết nối đến server này rồi
  }

  // Ngắt kết nối cũ nếu có
  if (currentSocket) {
    currentSocket.disconnect();
  }

  // Cập nhật UI
  activeServerUrl = url;
  term.reset(); // Xóa sạch terminal
  statusText.textContent = `Đang kết nối đến ${name}...`;
  terminalTitle.textContent = name;
  term.write(`\x1b[33m--- Đang kết nối đến ${name} (${url}) ---\x1b[0m\r\n`);

  // Cập nhật trạng thái active cho danh sách server
  document.querySelectorAll('#server-list .tab-item').forEach(item => {
    if (item.dataset.url === url) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Tạo kết nối mới
  currentSocket = io(url, {
    transports: ['websocket'] // Ưu tiên websocket để ổn định
  });

  // Xử lý sự kiện từ socket
  currentSocket.on('connect', () => {
    console.log(`🟢 Đã kết nối đến server: ${url}`);
    statusText.textContent = `Đã kết nối: ${name}`;
    term.write('\x1b[32m✅ Kết nối thành công!\x1b[0m\r\n');
  });

  currentSocket.on('disconnect', () => {
    console.log(`🔴 Mất kết nối với server: ${url}`);
    if (activeServerUrl === url) {
        statusText.textContent = 'Mất kết nối';
        term.write('\x1b[31m⚠️  Mất kết nối với server.\x1b[0m\r\n');
    }
  });
  
  currentSocket.on('output', data => term.write(data));
  currentSocket.on('history', history => term.write(history));
}

// Gửi dữ liệu từ terminal (người dùng gõ) đến server đang hoạt động
term.onData(data => {
  if (currentSocket) {
    currentSocket.emit('input', data);
  }
});

/**
 * Lấy danh sách server từ API và hiển thị ra màn hình.
 */
async function initializeDashboard() {
  try {
    const response = await fetch('/api/servers');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const servers = await response.json();
    
    serverListContainer.innerHTML = ''; // Xóa danh sách cũ

    servers.forEach((server, index) => {
      const iconClass = ICONS[index % ICONS.length];
      const serverElement = document.createElement('div');
      serverElement.className = 'tab-item';
      serverElement.setAttribute('role', 'listitem');
      serverElement.dataset.url = server.url;
      serverElement.dataset.name = server.name;
      
      serverElement.innerHTML = `
        <div class="icon-circle"><i class="${iconClass}"></i></div>
        <div class="tab-meta">
          <div class="tab-name">${server.name}</div>
          <div class="tab-sub">${server.description || server.url}</div>
        </div>
      `;
      
      serverElement.addEventListener('click', () => {
        connectToServer(server.url, server.name);
        // Tự động đóng menu trên di động sau khi chọn
        if (window.innerWidth <= 900 && document.querySelector('.left-panel.is-open')) {
          window.toggleMenu();
        }
      });
      
      serverListContainer.appendChild(serverElement);
    });

    // Tự động kết nối đến server đầu tiên
    if (servers.length > 0) {
      connectToServer(servers[0].url, servers[0].name);
    } else {
        statusText.textContent = 'Không có server nào';
        term.write('Không tìm thấy server nào được cấu hình.');
    }

  } catch (error) {
    console.error("Không thể tải danh sách server:", error);
    statusText.textContent = 'Lỗi tải danh sách';
    term.write(`\x1b[31m Lỗi: Không thể tải danh sách server. Vui lòng kiểm tra file server.js trên server admin.\x1b[0m`);
  }
}

// Khởi chạy khi trang được tải
window.addEventListener('load', initializeDashboard);
