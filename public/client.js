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
        uid: 'internal-system-status',
        name: 'System Status',
        description: 'Giám sát tài nguyên server admin',
        isLocal: true,
        icon: 'fas fa-tachometer-alt'
    }
];

// Define hardcoded servers that cannot be deleted
const HARDCODED_SERVERS = [
    {
        uid: 'hardcoded-1', name: 'Terminal-v1', url: 'https://server-terminal-v1-rvg9.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3j6j0ffte5s73an1ch0?key=-_PhfYyBRnI',
        isHardcoded: true
    },
    
    {
        uid: 'hardcoded-2', name: 'Terminal-v2', url: 'https://server-terminal-v2-lil8.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3j6ugjipnbc73ekvm0g?key=EDEEiKz3oH8',
        isHardcoded: true
    },

    {
        uid: 'hardcoded-3', name: 'Terminal-v3', url: 'https://server-terminal-v3-eqdx.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3jqk995pdvs73elek5g?key=v7yihKTBnaE',
        isHardcoded: true
    },

    {
        uid: 'hardcoded-4', name: 'Terminal-v4', url: 'https://server-terminal-v4.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3jt996uk2gs739e998g?key=N-8qwaYuFaU',
        isHardcoded: true
    }
];

let adminSocket; // Socket for admin panel features like Uptime
let currentSocket = null;
let activeServerUid = null;
let allServices = []; // Combined list of local services and remote servers
let userServers = [];
const resettingServers = {}; // State to track resetting servers: { [uid]: endTime }

// Terminal multi-session state
let terminalSessions = new Map();
let activeTerminalSessionId = null;

// UI Elements
const statusText = document.getElementById('status-text');
const serverListContainer = document.getElementById('server-list');
const modalOverlay = document.getElementById('modal-overlay');
const serverForm = document.getElementById('server-form');
const terminalLoader = document.getElementById('terminal-loader');
const loaderAscii = document.getElementById('loader-ascii');
const loaderText = document.getElementById('loader-text');
const terminalTabsContainer = document.getElementById('terminal-tabs-container');

// Views
const allViews = document.querySelectorAll('.view-container');
const terminalView = document.getElementById('terminal-view');
const uptimeView = document.getElementById('uptime-view');
const systemStatusView = document.getElementById('system-status-view');

function switchToView(viewId) {
    allViews.forEach(view => {
        view.style.display = view.id === viewId ? 'flex' : 'none';
    });
}

function loadServers() {
    const storedUserServers = localStorage.getItem(SERVER_STORAGE_KEY);
    try {
        userServers = storedUserServers ? JSON.parse(storedUserServers) : [];
    } catch (e) {
        console.error("Error parsing user servers from localStorage", e);
        userServers = [];
    }
    allServices = [...LOCAL_SERVICES, ...HARDCODED_SERVERS, ...userServers];
}

function saveServers() {
    localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify(userServers));
}

function renderServerList() {
    serverListContainer.innerHTML = '';
    allServices.forEach((service, index) => {
        const iconClass = service.icon || ICONS[index % ICONS.length];
        const serverElement = document.createElement('div');
        serverElement.className = 'tab-item';
        if (service.uid === activeServerUid) serverElement.classList.add('active');
        serverElement.dataset.uid = service.uid;

        let actionsHtml = !service.isLocal ? `
            <div class="tab-actions">
                <button class="options-btn" title="Tùy chọn"><i class="fas fa-ellipsis-v"></i></button>
                <div class="options-menu">
                    <a href="#" class="reset-btn"><i class="fas fa-sync-alt"></i> Reset</a>
                    ${!service.isHardcoded ? `<a href="#" class="delete-btn delete"><i class="fas fa-trash-alt"></i> Xóa</a>` : ''}
                </div>
            </div>` : '';
        
        serverElement.innerHTML = `
            <div class="icon-circle"><i class="${iconClass}"></i></div>
            <div class="tab-meta">
                <div class="tab-name">${service.name}</div>
                <div class="tab-sub">${service.description || service.url}</div>
            </div>
            ${actionsHtml}`;
        
        serverElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-actions')) selectServer(service);
        });

        if (!service.isLocal) {
            const optionsBtn = serverElement.querySelector('.options-btn');
            optionsBtn.addEventListener('click', e => {
                e.stopPropagation();
                document.querySelectorAll('.options-menu.show').forEach(m => m.classList.remove('show'));
                optionsBtn.nextElementSibling.classList.toggle('show');
            });
            serverElement.querySelector('.reset-btn').addEventListener('click', e => {
                e.stopPropagation();
                handleReset(service);
            });
            if (!service.isHardcoded) {
                serverElement.querySelector('.delete-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    handleDelete(service);
                });
            }
        }
        serverListContainer.appendChild(serverElement);
    });
}

function selectServer(service) {
    if (activeServerUid === service.uid) return;

    // Unsubscribe from any previous local service subscriptions
    if (adminSocket && activeServerUid && allServices.find(s => s.uid === activeServerUid)?.isLocal) {
        adminSocket.emit('system-status:unsubscribe');
    }

    activeServerUid = service.uid;
    if (currentSocket) currentSocket.disconnect();
    currentSocket = null;
    
    // Reset terminal session state
    terminalSessions.clear();
    activeTerminalSessionId = null;
    renderTerminalTabs();
    
    renderServerList();

    if (service.isLocal) {
        terminalLoader.classList.add('hidden');
        if (service.uid === 'internal-uptime') {
            switchToView('uptime-view');
            statusText.textContent = 'Uptime Monitor';
            initializeUptimeMonitor();
        } else if (service.uid === 'internal-system-status') {
            switchToView('system-status-view');
            statusText.textContent = 'System Status';
            initializeSystemStatus();
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
        if (activeServerUid === server.uid) selectServer(server);
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
        term.focus();
    });

    currentSocket.on('disconnect', () => {
        if (activeServerUid === server.uid) {
            statusText.textContent = 'Mất kết nối';
            term.write('\r\n\x1b[31m⚠️ Mất kết nối.\x1b[0m\r\n');
        }
    });
  
    currentSocket.on('output', data => term.write(data));
    currentSocket.on('history', history => {
        terminalLoader.classList.add('hidden');
        term.reset();
        term.write(history);
    });

    // Multi-session listeners
    currentSocket.on('sessions-list', (sessionList) => {
        terminalSessions.clear();
        sessionList.forEach(s => terminalSessions.set(s.id, s));
        if (terminalSessions.size > 0 && !terminalSessions.has(activeTerminalSessionId)) {
            const firstSessionId = terminalSessions.keys().next().value;
            switchTerminalSession(firstSessionId);
        } else {
            renderTerminalTabs();
        }
    });

    currentSocket.on('session-created', (session) => {
        terminalSessions.set(session.id, session);
        renderTerminalTabs();
        switchTerminalSession(session.id);
    });

    currentSocket.on('session-closed', ({ id }) => {
        const wasActive = (id === activeTerminalSessionId);
        if (terminalSessions.has(id)) {
            terminalSessions.delete(id);
            if (wasActive && terminalSessions.size > 0) {
                switchTerminalSession(terminalSessions.keys().next().value);
            } else if (terminalSessions.size === 0) {
                activeTerminalSessionId = null;
                term.reset();
                renderTerminalTabs();
            } else {
                renderTerminalTabs();
            }
        }
    });
}

function renderTerminalTabs() {
    terminalTabsContainer.innerHTML = '';
    if (allServices.find(s => s.uid === activeServerUid)?.isLocal) return;

    terminalSessions.forEach(session => {
        const tab = document.createElement('button');
        tab.className = 'tab-btn';
        tab.dataset.sessionId = session.id;
        tab.textContent = session.name;
        if (session.id === activeTerminalSessionId) tab.classList.add('active');

        const closeBtn = document.createElement('i');
        closeBtn.className = 'fas fa-times close-tab-btn';
        if (terminalSessions.size > 1) {
            tab.appendChild(closeBtn);
            closeBtn.onclick = e => {
                e.stopPropagation();
                if (confirm(`Bạn có chắc muốn đóng "${session.name}"?`)) {
                    currentSocket.emit('close-session', session.id);
                }
            };
        }
        tab.onclick = () => switchTerminalSession(session.id);
        terminalTabsContainer.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.title = 'Phiên mới';
    addBtn.textContent = '+';
    addBtn.onclick = () => currentSocket.emit('create-session');
    terminalTabsContainer.appendChild(addBtn);
}

function switchTerminalSession(sessionId) {
    if (!terminalSessions.has(sessionId) || sessionId === activeTerminalSessionId) return;
    
    activeTerminalSessionId = sessionId;
    currentSocket.emit('switch-session', sessionId);
    term.reset();
    renderTerminalTabs();
    term.focus();
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
        term.write(`\r\n\x1b[32m[Reset] Tín hiệu đã được gửi. Server sẽ khởi động lại.\x1b[0m\r\n`);
        const RESET_DURATION = 180000; // 3 minutes
        resettingServers[server.uid] = Date.now() + RESET_DURATION;
        if (activeServerUid === server.uid) showResettingOverlay(server, RESET_DURATION);
    } catch (error) {
        term.write(`\r\n\x1b[31m[Lỗi Reset] Không thể gửi lệnh: ${error.message}\x1b[0m\r\n`);
    }
}

function handleDelete(serverToDelete) {
    if (serverToDelete.isHardcoded || !confirm(`Bạn có chắc muốn xóa '${serverToDelete.name}'?`)) return;
    userServers = userServers.filter(s => s.uid !== serverToDelete.uid);
    saveServers();
    loadServers();
    if (activeServerUid === serverToDelete.uid) {
        selectServer(allServices[0]);
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
    userServers.push({
        uid: 'server_' + Date.now(),
        name: document.getElementById('server-name').value,
        url: document.getElementById('server-url').value,
        description: document.getElementById('server-description').value,
        deployHookUrl: document.getElementById('server-deploy-hook').value,
    });
    saveServers();
    loadServers();
    renderServerList();
    hideModal();
}

// --- SYSTEM STATUS LOGIC (CLIENT-SIDE) ---
function initializeSystemStatus() {
    if (adminSocket && adminSocket.connected) {
        adminSocket.emit('system-status:subscribe');
    }
}

function updateSystemStatusView(data) {
    // Memory
    const memUsed = data.memory.total - data.memory.free;
    const memTotal = data.memory.total;
    const memProc = data.memory.process;
    const memPercent = (memUsed / memTotal) * 100;
    
    document.getElementById('mem-progress').style.width = `${memPercent.toFixed(2)}%`;
    document.getElementById('mem-text').textContent = `${(memUsed / 1024 / 1024).toFixed(1)} MB / ${(memTotal / 1024 / 1024).toFixed(1)} MB`;
    document.getElementById('mem-proc-text').textContent = `Process: ${(memProc / 1024 / 1024).toFixed(1)} MB`;

    // CPU
    const cpuPercent = parseFloat(data.cpu);
    document.getElementById('cpu-arc-fg').style.strokeDasharray = `${cpuPercent.toFixed(1)}, 100`;
    document.getElementById('cpu-text').textContent = `${cpuPercent.toFixed(1)} %`;

    // Info
    const uptime = new Date(data.uptime * 1000).toISOString().substr(11, 8);
    document.getElementById('uptime-text').textContent = uptime;
    document.getElementById('node-version-text').textContent = data.nodeVersion;
    document.getElementById('platform-text').textContent = data.platform;
}


// --- UPTIME MONITOR LOGIC (CLIENT-SIDE) ---
const uptimeModalOverlay = document.getElementById('uptime-modal-overlay');
const uptimeForm = document.getElementById('uptime-form');
const uptimeViewContent = document.getElementById('uptime-view-content');

function initializeUptimeMonitor() {
    if (adminSocket && adminSocket.connected) {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-spinner fa-spin"></i><p>Đang tải dữ liệu...</p></div>`;
        adminSocket.emit('uptime:subscribe');
    } else {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-exclamation-triangle"></i><p>Không thể kết nối server admin.</p></div>`;
    }
}

function renderUptimeList(state) {
    uptimeViewContent.innerHTML = '';
    if (!state.sites || state.sites.length === 0) {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-satellite-dish"></i><p>Chưa có website nào được theo dõi.</p></div>`;
        return;
    }
    state.sites.forEach(site => {
        const card = createUptimeCard(site);
        uptimeViewContent.appendChild(card);
        if (state.statuses[site.uid]) updateUptimeCard(site.uid, state.statuses[site.uid]);
    });
}

function createUptimeCard(site) {
    const card = document.createElement('div');
    card.className = 'uptime-card';
    card.dataset.uid = site.uid;
    const deleteBtnHtml = !site.isHardcoded ? `<button class="btn ghost danger uptime-delete-btn" style="padding: 4px 8px; font-size: 12px;">Xóa</button>` : '';
    card.innerHTML = `
        <div class="uptime-header">
            <div class="uptime-title">${site.name} ${site.isHardcoded ? '<i class="fas fa-lock" style="font-size: 10px; color: var(--muted);"></i>' : ''}</div>
            <div class="uptime-status pending">Pending...</div>
        </div>
        <div class="uptime-url">${site.url}</div>
        <div class="uptime-meta">
            <span>Response: <span class="uptime-response">- ms</span></span>
            ${deleteBtnHtml}
        </div>`;
    if (!site.isHardcoded) {
        card.querySelector('.uptime-delete-btn').addEventListener('click', e => {
            e.stopPropagation();
            deleteUptimeSite(site.uid);
        });
    }
    return card;
}

function updateUptimeCard(uid, statusData) {
    const card = document.querySelector(`.uptime-card[data-uid="${uid}"]`);
    if (!card) return;
    const statusEl = card.querySelector('.uptime-status');
    const responseEl = card.querySelector('.uptime-response');
    statusEl.classList.remove('up', 'down', 'pending');
    switch(statusData.status) {
        case 'up':
            statusEl.classList.add('up'); statusEl.textContent = 'Up';
            responseEl.textContent = `${statusData.responseTime} ms`; break;
        case 'down':
            statusEl.classList.add('down'); statusEl.textContent = 'Down';
            responseEl.textContent = 'N/A'; break;
        default:
            statusEl.classList.add('pending'); statusEl.textContent = 'Checking...';
            responseEl.textContent = '- ms'; break;
    }
}

function showUptimeModal() { uptimeForm.reset(); uptimeModalOverlay.classList.add('show'); }
function hideUptimeModal() { uptimeModalOverlay.classList.remove('show'); }

function handleUptimeFormSubmit(e) {
    e.preventDefault();
    adminSocket.emit('uptime:add_site', {
        name: document.getElementById('uptime-name').value,
        url: document.getElementById('uptime-url').value,
    });
    hideUptimeModal();
}

function deleteUptimeSite(uid) {
    if (!confirm('Bạn có chắc muốn ngừng theo dõi website này?')) return;
    adminSocket.emit('uptime:delete_site', uid);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

function initializeDashboard() {
  adminSocket = io();
  adminSocket.on('connect', () => {
    // Re-initialize the currently selected local service upon reconnection
    const activeService = allServices.find(s => s.uid === activeServerUid);
    if (activeService?.isLocal) {
        if (activeService.uid === 'internal-uptime') initializeUptimeMonitor();
        if (activeService.uid === 'internal-system-status') initializeSystemStatus();
    }
  });
  adminSocket.on('uptime:full_list', renderUptimeList);
  adminSocket.on('uptime:site_added', (newSite) => {
      const emptyState = uptimeViewContent.querySelector('.empty-uptime');
      if (emptyState) emptyState.remove();
      uptimeViewContent.appendChild(createUptimeCard(newSite));
  });
  adminSocket.on('uptime:site_removed', (uid) => {
      document.querySelector(`.uptime-card[data-uid="${uid}"]`)?.remove();
      if (uptimeViewContent.childElementCount === 0) renderUptimeList({ sites: [], statuses: {} });
  });
  adminSocket.on('uptime:update', (updateData) => updateUptimeCard(updateData.uid, updateData));
  adminSocket.on('system-status:update', updateSystemStatusView);
  
  loadServers();
  renderServerList();
  
  if (allServices.length > 0) {
    selectServer(allServices[0]);
  } else {
      statusText.textContent = 'No Services';
      terminalLoader.classList.remove('hidden');
      loaderAscii.textContent = '(>_<)';
      loaderText.textContent = 'Không có dịch vụ nào.';
  }

  // Event Listeners
  document.getElementById('add-server-btn').addEventListener('click', showModal);
  document.getElementById('cancel-btn').addEventListener('click', hideModal);
  serverForm.addEventListener('submit', handleFormSubmit);

  document.getElementById('add-uptime-site-btn').addEventListener('click', showUptimeModal);
  document.getElementById('uptime-cancel-btn').addEventListener('click', hideUptimeModal);
  uptimeForm.addEventListener('submit', handleUptimeFormSubmit);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.options-btn')) {
        document.querySelectorAll('.options-menu.show').forEach(m => m.classList.remove('show'));
    }
    if (e.target === modalOverlay) hideModal();
    if (e.target === uptimeModalOverlay) hideUptimeModal();
  });

  term.onData(data => {
    if (currentSocket && activeTerminalSessionId) {
        currentSocket.emit('input', { sessionId: activeTerminalSessionId, data });
    }
  });
}

window.addEventListener('load', initializeDashboard);
