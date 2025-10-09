// server-admin/public/client.js

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
  cursorBlink: true, cursorStyle: 'block', allowTransparency: true,
  windowsMode: false, scrollback: 1000,
});
term.open(document.getElementById('terminal'));

const ICONS = ['fas fa-server', 'fas fa-database', 'fas fa-network-wired', 'fas fa-laptop-code'];
const SERVER_STORAGE_KEY = 'admin-servers-list';

// Define local/internal services
const LOCAL_SERVICES = [
    {
        uid: 'internal-uptime',
        name: 'Uptime Monitor',
        description: 'Giám sát trạng thái website',
        isLocal: true,
        icon: 'fas fa-heartbeat'
    },
    {
        uid: 'internal-browser',
        name: 'Web Browser',
        description: 'Trình duyệt web tích hợp',
        isLocal: true,
        icon: 'fas fa-globe'
    }
];

// Define hardcoded servers that cannot be deleted
const HARDCODED_SERVERS = [
    {
        uid: 'hardcoded-1', name: 'Terminal-v1', url: 'https://server-terminal-v1-rvg9.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: '', isHardcoded: true
    },
    {
        uid: 'hardcoded-2', name: 'Terminal-v2', url: 'https://server-terminal-v2-lil8.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3j6ugjipnbc73ekvm0g?key=EDEEiKz3oH8',
        isHardcoded: true
    }
];

let adminSocket; // Socket for admin panel features like Uptime
let currentSocket = null;
let activeServerUid = null;
let allServices = []; // Combined list of local services and remote servers
let userServers = [];
const resettingServers = {}; // State to track resetting servers: { [uid]: endTime }

// UI Elements
const statusText = document.getElementById('status-text');
const serverListContainer = document.getElementById('server-list');
const modalOverlay = document.getElementById('modal-overlay');
const serverForm = document.getElementById('server-form');
const terminalLoader = document.getElementById('terminal-loader');
const loaderAscii = document.getElementById('loader-ascii');
const loaderText = document.getElementById('loader-text');

// Views
const allViews = document.querySelectorAll('.view-container');
const terminalView = document.getElementById('terminal-view');
const uptimeView = document.getElementById('uptime-view');
const browserView = document.getElementById('browser-view');


/**
 * Switches the main view in the right panel.
 * @param {string} viewId The ID of the view to show.
 */
function switchToView(viewId) {
    allViews.forEach(view => {
        view.style.display = view.id === viewId ? 'flex' : 'none';
    });
}

/**
 * Loads user-defined servers from localStorage.
 */
function loadServers() {
    const storedUserServers = localStorage.getItem(SERVER_STORAGE_KEY);
    try {
        userServers = storedUserServers ? JSON.parse(storedUserServers) : [];
    } catch (e) {
        console.error("Error parsing user servers from localStorage", e);
        localStorage.removeItem(SERVER_STORAGE_KEY);
        userServers = [];
    }
    allServices = [...LOCAL_SERVICES, ...HARDCODED_SERVERS, ...userServers];
}

function saveServers() {
    localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify(userServers));
}

/**
 * Renders the combined list of services and servers in the sidebar.
 */
function renderServerList() {
    serverListContainer.innerHTML = '';
    allServices.forEach((service, index) => {
        const iconClass = service.icon || ICONS[index % ICONS.length];
        const serverElement = document.createElement('div');
        serverElement.className = 'tab-item';
        if (service.uid === activeServerUid) {
            serverElement.classList.add('active');
        }
        serverElement.setAttribute('role', 'listitem');
        serverElement.dataset.uid = service.uid;

        let actionsHtml = '';
        if (!service.isLocal) {
            actionsHtml = `
            <div class="tab-actions">
                <button class="options-btn" title="Tùy chọn"><i class="fas fa-ellipsis-v"></i></button>
                <div class="options-menu">
                    <a href="#" class="reset-btn"><i class="fas fa-sync-alt"></i> Reset</a>
                    ${!service.isHardcoded ? `<a href="#" class="delete-btn delete"><i class="fas fa-trash-alt"></i> Xóa</a>` : ''}
                </div>
            </div>`;
        }
        
        serverElement.innerHTML = `
            <div class="icon-circle"><i class="${iconClass}"></i></div>
            <div class="tab-meta">
                <div class="tab-name">${service.name}</div>
                <div class="tab-sub">${service.description || service.url}</div>
            </div>
            ${actionsHtml}
        `;
        
        serverElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-actions')) {
                selectServer(service);
            }
        });

        if (!service.isLocal) {
            const optionsBtn = serverElement.querySelector('.options-btn');
            const optionsMenu = serverElement.querySelector('.options-menu');
            optionsBtn.addEventListener('click', e => {
                e.stopPropagation();
                document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
                optionsMenu.classList.add('show');
            });

            serverElement.querySelector('.reset-btn').addEventListener('click', e => {
                e.stopPropagation();
                optionsMenu.classList.remove('show');
                handleReset(service);
            });

            if (!service.isHardcoded) {
                serverElement.querySelector('.delete-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    optionsMenu.classList.remove('show');
                    handleDelete(service);
                });
            }
        }
        serverListContainer.appendChild(serverElement);
    });
}

/**
 * Main handler for when a user selects an item from the left panel.
 * @param {object} service The selected service or server object.
 */
function selectServer(service) {
    if (activeServerUid === service.uid) return;

    activeServerUid = service.uid;
    if (currentSocket) {
        currentSocket.disconnect();
        currentSocket = null;
    }
    
    renderServerList(); // Update active highlight

    if (service.isLocal) {
        terminalLoader.classList.add('hidden'); // Hide terminal loader
        if (service.uid === 'internal-uptime') {
            switchToView('uptime-view');
            statusText.textContent = 'Uptime Monitor';
            initializeUptimeMonitor();
        } else if (service.uid === 'internal-browser') {
            switchToView('browser-view');
            statusText.textContent = 'Web Browser';
        }
    } else {
        switchToView('terminal-view');
        connectToTerminalServer(service);
    }
}

function showConnectionAnimation(server) {
    term.reset();
    terminalLoader.classList.remove('hidden');
    loaderAscii.textContent = '\n(>_<)\n\n';
    loaderText.textContent = `Đang kết nối đến ${server.name}...`;
}

function showResettingOverlay(server, duration) {
    if (currentSocket && currentSocket.connected) currentSocket.disconnect();
    currentSocket = null;
    term.reset();
    switchToView('terminal-view');
    terminalLoader.classList.remove('hidden');
    loaderAscii.textContent = '\n(>_<)\n\n';
    loaderText.textContent = 'Server đang khởi động lại. Chờ 3 phút...';
    statusText.textContent = `Đang reset: ${server.name}`;
    document.getElementById('terminal-title').textContent = server.name;

    setTimeout(() => {
        delete resettingServers[server.uid];
        if (activeServerUid === server.uid) {
            selectServer(server);
        }
    }, duration);
}

function connectToTerminalServer(server) {
  const resetEndTime = resettingServers[server.uid];
  if (resetEndTime && Date.now() < resetEndTime) {
      showResettingOverlay(server, resetEndTime - Date.now());
      return;
  }
  
  statusText.textContent = `Đang kết nối...`;
  document.getElementById('terminal-title').textContent = server.name;
  showConnectionAnimation(server);

  currentSocket = io(server.url, { transports: ['websocket'] });

  currentSocket.on('connect', () => {
    terminalLoader.classList.add('hidden');
    statusText.textContent = `Đã kết nối: ${server.name}`;
    term.write(`\r\n\x1b[32m✅ Kết nối thành công đến ${server.name}\x1b[0m\r\n`);
  });

  currentSocket.on('disconnect', () => {
    terminalLoader.classList.add('hidden');
    if (activeServerUid === server.uid) {
        statusText.textContent = 'Mất kết nối';
        term.write('\r\n\x1b[31m⚠️ Mất kết nối. Đang thử kết nối lại...\x1b[0m\r\n');
    }
  });
  
  currentSocket.on('output', data => {
      terminalLoader.classList.add('hidden');
      term.write(data);
  });

  currentSocket.on('history', history => {
    terminalLoader.classList.add('hidden');
    term.reset();
    term.write(history);
  });
}

async function handleReset(server) {
    if (!server.deployHookUrl) {
        alert(`Server '${server.name}' chưa được cấu hình Deploy Hook URL.`);
        return;
    }
    
    if (activeServerUid !== server.uid) selectServer(server);

    term.write(`\r\n\x1b[33m[Reset] Đang gửi lệnh reset đến '${server.name}'...\x1b[0m\r\n`);
    
    try {
        await fetch(server.deployHookUrl, { method: 'POST', mode: 'no-cors' });
        term.write(`\r\n\x1b[32m[Reset] Tín hiệu reset đã được gửi. Server sẽ khởi động lại.\x1b[0m\r\n`);
        const RESET_DURATION = 180000; // 3 minutes
        resettingServers[server.uid] = Date.now() + RESET_DURATION;
        if (activeServerUid === server.uid) {
            showResettingOverlay(server, RESET_DURATION);
        }
    } catch (error) {
        console.error('Lỗi khi kích hoạt deploy hook:', error);
        term.write(`\r\n\x1b[31m[Lỗi Reset] Không thể gửi lệnh reset: ${error.message}\x1b[0m\r\n`);
    }
}

function handleDelete(serverToDelete) {
    if (serverToDelete.isHardcoded || !confirm(`Bạn có chắc muốn xóa server '${serverToDelete.name}'?`)) return;

    userServers = userServers.filter(s => s.uid !== serverToDelete.uid);
    saveServers();
    loadServers(); // Recalculate allServices

    if (activeServerUid === serverToDelete.uid) {
        if (currentSocket) currentSocket.disconnect();
        currentSocket = null;
        activeServerUid = null;
        term.reset();
        selectServer(allServices[0]); // Select the first available service
    }
    renderServerList();
}

function showModal() {
    serverForm.reset();
    document.getElementById('server-id').value = '';
    document.getElementById('modal-title').innerHTML = 'Thêm Server Mới <i class="fas fa-plus-circle"></i>';
    modalOverlay.classList.add('show');
}

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
    userServers.push(newServer);
    saveServers();
    loadServers();
    renderServerList();
    hideModal();
}

// --- UPTIME MONITOR LOGIC (CLIENT-SIDE) ---
const uptimeModalOverlay = document.getElementById('uptime-modal-overlay');
const uptimeForm = document.getElementById('uptime-form');
const uptimeViewContent = document.getElementById('uptime-view-content');

/**
 * Called when the Uptime Monitor view is opened.
 * Subscribes to server-side events.
 */
function initializeUptimeMonitor() {
    if (adminSocket && adminSocket.connected) {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-spinner fa-spin"></i><p>Đang tải dữ liệu từ server...</p></div>`;
        adminSocket.emit('uptime:subscribe');
    } else {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-exclamation-triangle"></i><p>Không thể kết nối tới server admin.<br>Vui lòng làm mới trang.</p></div>`;
    }
}

/**
 * Renders the entire list of uptime sites from server data.
 * @param {object} state - The full state object from the server { sites, statuses }.
 */
function renderUptimeList(state) {
    uptimeViewContent.innerHTML = '';
    if (!state.sites || state.sites.length === 0) {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-satellite-dish"></i><p>Chưa có website nào được theo dõi.<br>Hãy thêm một trang để bắt đầu giám sát.</p></div>`;
        return;
    }
    state.sites.forEach(site => {
        const card = createUptimeCard(site);
        uptimeViewContent.appendChild(card);
        if (state.statuses[site.uid]) {
            updateUptimeCard(site.uid, state.statuses[site.uid]);
        }
    });
}

/**
 * Creates an HTML element for a single uptime site card.
 * @param {object} site - The site data { uid, name, url }.
 * @returns {HTMLElement} The card element.
 */
function createUptimeCard(site) {
    const card = document.createElement('div');
    card.className = 'uptime-card';
    card.dataset.uid = site.uid;
    card.innerHTML = `
        <div class="uptime-header">
            <div class="uptime-title">${site.name}</div>
            <div class="uptime-status pending">Pending...</div>
        </div>
        <div class="uptime-url">${site.url}</div>
        <div class="uptime-meta">
            <span>Response: <span class="uptime-response">- ms</span></span>
            <button class="btn ghost danger uptime-delete-btn" style="padding: 4px 8px; font-size: 12px;">Delete</button>
        </div>
    `;
    card.querySelector('.uptime-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteUptimeSite(site.uid);
    });
    return card;
}

/**
 * Updates an existing uptime card with new status information.
 * @param {string} uid - The unique ID of the site.
 * @param {object} statusData - The new status { status, responseTime }.
 */
function updateUptimeCard(uid, statusData) {
    const card = document.querySelector(`.uptime-card[data-uid="${uid}"]`);
    if (!card) return;

    const statusEl = card.querySelector('.uptime-status');
    const responseEl = card.querySelector('.uptime-response');

    statusEl.classList.remove('up', 'down', 'pending');
    
    switch(statusData.status) {
        case 'up':
            statusEl.classList.add('up');
            statusEl.textContent = 'Up';
            responseEl.textContent = `${statusData.responseTime} ms`;
            break;
        case 'down':
            statusEl.classList.add('down');
            statusEl.textContent = 'Down';
            responseEl.textContent = 'N/A';
            break;
        default:
            statusEl.classList.add('pending');
            statusEl.textContent = 'Checking...';
            responseEl.textContent = '- ms';
            break;
    }
}

function showUptimeModal() {
    uptimeForm.reset();
    uptimeModalOverlay.classList.add('show');
}

function hideUptimeModal() {
    uptimeModalOverlay.classList.remove('show');
}

/**
 * Handles the submission of the "Add Site" form.
 * Emits an event to the server.
 */
function handleUptimeFormSubmit(e) {
    e.preventDefault();
    const siteData = {
        name: document.getElementById('uptime-name').value,
        url: document.getElementById('uptime-url').value,
    };
    adminSocket.emit('uptime:add_site', siteData);
    hideUptimeModal();
}

/**
 * Handles the deletion of an uptime site.
 * Emits an event to the server.
 */
function deleteUptimeSite(uid) {
    if (!confirm('Bạn có chắc muốn ngừng theo dõi website này?')) return;
    adminSocket.emit('uptime:delete_site', uid);
}


// --- WEB BROWSER LOGIC ---
const browserUrlInput = document.getElementById('browser-url-input');
const browserIframe = document.getElementById('browser-iframe');

function initializeBrowser() {
    document.getElementById('browser-nav-form').addEventListener('submit', e => {
        e.preventDefault();
        let url = browserUrlInput.value.trim();
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        browserIframe.src = url || 'about:blank';
    });
    document.getElementById('browser-back-btn').addEventListener('click', () => browserIframe.contentWindow.history.back());
    document.getElementById('browser-forward-btn').addEventListener('click', () => browserIframe.contentWindow.history.forward());
    document.getElementById('browser-reload-btn').addEventListener('click', () => browserIframe.contentWindow.location.reload());
}


// --- GLOBAL INITIALIZATION ---
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

function initializeDashboard() {
  adminSocket = io();
  adminSocket.on('connect', () => {
    console.log('✅ Admin socket connected.');
    if (activeServerUid === 'internal-uptime') {
        initializeUptimeMonitor();
    }
  });
  adminSocket.on('disconnect', () => console.warn('⚠️ Admin socket lost connection.'));

  // --- Listen for Uptime events from server ---
  adminSocket.on('uptime:full_list', (state) => {
      console.log('Received full uptime list from server:', state);
      renderUptimeList(state);
  });
  
  adminSocket.on('uptime:site_added', (newSite) => {
      console.log('Server added new site:', newSite);
      const emptyState = uptimeViewContent.querySelector('.empty-uptime');
      if (emptyState) emptyState.remove();
      const card = createUptimeCard(newSite);
      uptimeViewContent.appendChild(card);
  });
  
  adminSocket.on('uptime:site_removed', (uid) => {
      console.log('Server removed site:', uid);
      const card = document.querySelector(`.uptime-card[data-uid="${uid}"]`);
      if (card) card.remove();
      if (uptimeViewContent.childElementCount === 0) {
          renderUptimeList({ sites: [], statuses: {} });
      }
  });
  
  adminSocket.on('uptime:update', (updateData) => {
      updateUptimeCard(updateData.uid, updateData);
  });
  
  loadServers();
  renderServerList();
  
  if (allServices.length > 0) {
    selectServer(allServices[0]);
  } else {
      statusText.textContent = 'No Services';
      terminalLoader.classList.remove('hidden');
      loaderAscii.textContent = '\n(>_<)\n\n';
      loaderText.textContent = 'Không có dịch vụ nào.';
  }

  // Event Listeners
  document.getElementById('add-server-btn').addEventListener('click', showModal);
  document.getElementById('cancel-btn').addEventListener('click', hideModal);
  serverForm.addEventListener('submit', handleFormSubmit);

  document.getElementById('add-uptime-site-btn').addEventListener('click', showUptimeModal);
  document.getElementById('uptime-cancel-btn').addEventListener('click', hideUptimeModal);
  uptimeForm.addEventListener('submit', handleUptimeFormSubmit);
  
  initializeBrowser();

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.options-btn') && !e.target.closest('.options-menu')) {
      document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
    }
    if (e.target === modalOverlay) hideModal();
    if (e.target === uptimeModalOverlay) hideUptimeModal();
  });

  term.onData(data => {
    if (currentSocket) currentSocket.emit('input', data);
  });
}

window.addEventListener('load', initializeDashboard);
