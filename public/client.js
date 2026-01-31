// server-admin/public/client.js

// Pure Admin Client - No Local Terminal Logic inside Client
// But supports opening remote ports for monitored servers

const term = new Terminal({
  theme: {
    background: 'transparent',
    foreground: '#e6eef2',
    cursor: '#00d084',
    selection: 'rgba(0, 208, 132, 0.3)',
  },
  fontSize: 14,
  fontFamily: 'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
  cursorBlink: true, cursorStyle: 'block', allowTransparency: true,
  windowsMode: false, scrollback: 1000,
});
term.open(document.getElementById('terminal'));

const ICONS = ['fas fa-server', 'fas fa-database', 'fas fa-network-wired', 'fas fa-laptop-code'];
const SERVER_STORAGE_KEY = 'admin-servers-list';

// Define local/internal services (Just Monitoring)
const LOCAL_SERVICES = [
    {
        uid: 'internal-system',
        name: 'System Status',
        description: 'Giám sát tài nguyên admin',
        isLocal: true,
        icon: 'fas fa-tachometer-alt'
    },
    {
        uid: 'internal-uptime',
        name: 'Uptime Monitor',
        description: 'Giám sát trạng thái website',
        isLocal: true,
        icon: 'fas fa-heartbeat'
    }
];

// Define hardcoded servers
const HARDCODED_SERVERS = [
    {
        uid: 'hardcoded-1', name: 'Terminal-v1', url: 'https://server-terminal-v1-m4pg.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d5t1h4sr85hc73durba0?key=QxGp3s79mLg',
        isHardcoded: true
    },
    {
        uid: 'hardcoded-2', name: 'Terminal-v2', url: 'https://server-terminal-v2-lil8.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d3j6ugjipnbc73ekvm0g?key=EDEEiKz3oH8',
        isHardcoded: true
    },
    {
        uid: 'hardcoded-3', name: 'Terminal-v3', url: 'https://server-terminal-v3-iuxk.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d5t1qp49c44c739l2r6g?key=2HtI7SXQiSA',
        isHardcoded: true
    },
    {
        uid: 'hardcoded-4', name: 'Terminal-v4', url: 'https://server-terminal-v4.onrender.com',
        description: 'Server-Terminal 🚀', deployHookUrl: 'https://api.render.com/deploy/srv-d5t230718n1s73fvei0g?key=-6ymKLG698o',
        isHardcoded: true
    }
];

let adminSocket;
let currentSocket = null; // Used for remote terminal connection
let activeServerUid = null;
let allServices = [];
let userServers = [];
const resettingServers = {};

// Terminal State
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
                <div class="tab-sub">${service.description || service.url || ''}</div>
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

    activeServerUid = service.uid;
    if (currentSocket) {
        currentSocket.disconnect();
        currentSocket = null;
    }
    
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
        } else if (service.uid === 'internal-system') {
            switchToView('system-view');
            statusText.textContent = 'System Status';
            if (adminSocket && adminSocket.connected) {
                adminSocket.emit('system:subscribe');
            }
        }
    } else {
        switchToView('terminal-view');
        connectToTerminalServer(service);
    }
}

// Logic to Open Port on REMOTE Server
window.openPort = function() {
    const portInput = document.getElementById('port-input');
    const port = portInput.value.trim();
    
    if (!port) {
        alert('Please enter a port number.');
        return;
    }

    const activeService = allServices.find(s => s.uid === activeServerUid);
    
    if (activeService && !activeService.isLocal && activeService.url) {
        // Construct URL for the Remote Server
        // e.g., https://server-terminal-v1.../p/3000/
        const url = `${activeService.url}/p/${port}/`;
        window.open(url, '_blank');
    } else {
        alert('Please select a remote server (Terminal) first.');
    }
};

function showConnectionAnimation(server) {
    term.reset();
    terminalLoader.classList.remove('hidden');
    loaderAscii.textContent = '\n(>_<)\n\n';
    loaderText.textContent = `Connecting to ${server.name}...`;
}

function showResettingOverlay(server, duration) {
    if (currentSocket) currentSocket.disconnect();
    currentSocket = null;
    term.reset();
    switchToView('terminal-view');
    terminalLoader.classList.remove('hidden');
    loaderAscii.textContent = '\n(>_<)\n\n';
    loaderText.textContent = 'Server rebooting... Wait 3 mins';
    statusText.textContent = `Resetting: ${server.name}`;
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
  
    statusText.textContent = `Connecting...`;
    document.getElementById('terminal-title').textContent = server.name;
    showConnectionAnimation(server);

    // Connect to the REMOTE server via Socket.IO
    currentSocket = io(server.url, { transports: ['websocket'] });

    currentSocket.on('connect', () => {
        terminalLoader.classList.add('hidden');
        statusText.textContent = `Connected: ${server.name}`;
        if (activeTerminalSessionId) {
            currentSocket.emit('switch-session', activeTerminalSessionId);
        }
        term.focus();
    });

    currentSocket.on('disconnect', () => {
        if (activeServerUid === server.uid) {
            statusText.textContent = 'Disconnected';
            term.write('\r\n\x1b[31m⚠️ Disconnected from remote server.\x1b[0m\r\n');
        }
    });
  
    currentSocket.on('output', data => term.write(data));
    currentSocket.on('history', history => {
        terminalLoader.classList.add('hidden');
        term.reset();
        term.write(history);
    });

    // Multi-session
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
        terminalSessions.delete(id);
        if (wasActive && terminalSessions.size > 0) {
            switchTerminalSession(terminalSessions.keys().next().value);
        } else {
            renderTerminalTabs();
            if (terminalSessions.size === 0) {
                activeTerminalSessionId = null;
                term.reset();
            }
        }
    });
}

function renderTerminalTabs() {
    terminalTabsContainer.innerHTML = '';
    // If local service selected, do nothing
    if (allServices.find(s => s.uid === activeServerUid)?.isLocal) return;

    terminalSessions.forEach(session => {
        const tab = document.createElement('button');
        tab.className = 'tab-btn';
        tab.textContent = session.name;
        if (session.id === activeTerminalSessionId) tab.classList.add('active');

        const closeBtn = document.createElement('i');
        closeBtn.className = 'fas fa-times close-tab-btn';
        if (terminalSessions.size > 1) {
            tab.appendChild(closeBtn);
            closeBtn.onclick = e => {
                e.stopPropagation();
                if (confirm(`Close "${session.name}"?`)) {
                    currentSocket.emit('close-session', session.id);
                }
            };
        }
        tab.onclick = () => switchTerminalSession(session.id);
        terminalTabsContainer.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
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
        alert('Missing Deploy Hook URL.');
        return;
    }
    if (activeServerUid !== server.uid) selectServer(server);
    term.write(`\r\n\x1b[33m[Reset] Sending signal to '${server.name}'...\x1b[0m\r\n`);
    
    try {
        await fetch(server.deployHookUrl, { method: 'POST', mode: 'no-cors' });
        term.write(`\r\n\x1b[32m[Reset] Signal sent.\x1b[0m\r\n`);
        const RESET_DURATION = 180000;
        resettingServers[server.uid] = Date.now() + RESET_DURATION;
        if (activeServerUid === server.uid) showResettingOverlay(server, RESET_DURATION);
    } catch (error) {
        term.write(`\r\n\x1b[31m[Error] ${error.message}\x1b[0m\r\n`);
    }
}

function handleDelete(server) {
    if (confirm(`Delete '${server.name}'?`)) {
        userServers = userServers.filter(s => s.uid !== server.uid);
        saveServers();
        loadServers();
        if (activeServerUid === server.uid) selectServer(allServices[0]);
        renderServerList();
    }
}

function showModal() {
    serverForm.reset();
    document.getElementById('modal-title').innerText = 'Add Server';
    modalOverlay.classList.add('show');
}
function hideModal() { modalOverlay.classList.remove('show'); }

function handleFormSubmit(e) {
    e.preventDefault();
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

// Uptime UI Logic
const uptimeModalOverlay = document.getElementById('uptime-modal-overlay');
const uptimeViewContent = document.getElementById('uptime-view-content');

function initializeUptimeMonitor() {
    if (adminSocket && adminSocket.connected) {
        uptimeViewContent.innerHTML = `<div class="empty-uptime"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;
        adminSocket.emit('uptime:subscribe');
    }
}

function renderUptimeList(state) {
    uptimeViewContent.innerHTML = '';
    if (!state.sites || state.sites.length === 0) return;
    state.sites.forEach(site => {
        const card = document.createElement('div');
        card.className = 'uptime-card';
        card.dataset.uid = site.uid;
        card.innerHTML = `
            <div class="uptime-header">
                <div class="uptime-title">${site.name}</div>
                <div class="uptime-status pending">Pending</div>
            </div>
            <div class="uptime-url">${site.url}</div>
            <div class="uptime-meta">
                <span class="uptime-response">- ms</span>
                ${!site.isHardcoded ? `<button class="btn ghost danger uptime-del-btn" style="font-size:10px;padding:2px 5px">Xóa</button>` : ''}
            </div>`;
        
        if(!site.isHardcoded) {
            card.querySelector('.uptime-del-btn').addEventListener('click', () => adminSocket.emit('uptime:delete_site', site.uid));
        }
        
        uptimeViewContent.appendChild(card);
        if (state.statuses[site.uid]) updateUptimeCard(site.uid, state.statuses[site.uid]);
    });
}

function updateUptimeCard(uid, data) {
    const card = document.querySelector(`.uptime-card[data-uid="${uid}"]`);
    if (!card) return;
    const statusEl = card.querySelector('.uptime-status');
    const respEl = card.querySelector('.uptime-response');
    
    statusEl.className = `uptime-status ${data.status}`;
    statusEl.textContent = data.status === 'up' ? 'Up' : 'Down';
    respEl.textContent = data.responseTime > -1 ? `${data.responseTime}ms` : 'N/A';
}

function showUptimeModal() { document.getElementById('uptime-form').reset(); uptimeModalOverlay.classList.add('show'); }
function hideUptimeModal() { uptimeModalOverlay.classList.remove('show'); }

// System UI Logic
const cpuChartPath = document.getElementById('cpu-chart-path');
const cpuCoresContainer = document.getElementById('cpu-cores-container');
let cpuHistory = [];

function updateSystemStats(stats) {
    document.getElementById('cpu-usage-text').textContent = `${stats.cpu.toFixed(1)}%`;
    cpuHistory.push(stats.cpu);
    if(cpuHistory.length > 40) cpuHistory.shift();
    
    const path = cpuHistory.map((v, i) => `${(i/39)*100},${30-(v/100)*30}`).join(' L ');
    cpuChartPath.setAttribute('d', `M ${path} L 100,30 L 0,30 Z`);
    
    document.getElementById('ram-usage-text').textContent = `${(stats.ram.used/1073741824).toFixed(2)} GB`;
    document.getElementById('ram-total-text').textContent = `${(stats.ram.total/1073741824).toFixed(2)} GB Total`;
    document.getElementById('ram-progress-bar').style.width = `${stats.ram.percent}%`;
    
    document.getElementById('info-hostname').textContent = stats.info.hostname;
    document.getElementById('info-os').textContent = stats.info.platform;
    document.getElementById('info-node').textContent = stats.info.nodeVersion;
    
    cpuCoresContainer.innerHTML = '';
    stats.cpus.forEach((c, i) => {
        cpuCoresContainer.innerHTML += `
            <div class="cpu-core-item">
                <span class="label">C${i}</span>
                <div class="progress-bar" style="height:6px"><div class="progress-bar-inner" style="width:${c}%"></div></div>
            </div>`;
    });
}

function initializeDashboard() {
  adminSocket = io();
  adminSocket.on('connect', () => {
     const active = allServices.find(s => s.uid === activeServerUid);
     if (active?.isLocal && active.uid === 'internal-system') adminSocket.emit('system:subscribe');
  });
  
  adminSocket.on('uptime:full_list', renderUptimeList);
  adminSocket.on('uptime:site_added', s => renderUptimeList({sites: [s], statuses:{}})); // Simplified reload
  adminSocket.on('uptime:update', d => updateUptimeCard(d.uid, d));
  adminSocket.on('system-stats', updateSystemStats);

  loadServers();
  renderServerList();
  if(allServices.length) selectServer(allServices[0]);

  // Listeners
  document.getElementById('add-server-btn').onclick = showModal;
  document.getElementById('cancel-btn').onclick = hideModal;
  document.getElementById('server-form').onsubmit = handleFormSubmit;
  document.getElementById('add-uptime-site-btn').onclick = showUptimeModal;
  document.getElementById('uptime-cancel-btn').onclick = hideUptimeModal;
  document.getElementById('uptime-form').onsubmit = (e) => {
      e.preventDefault();
      adminSocket.emit('uptime:add_site', {
          name: document.getElementById('uptime-name').value,
          url: document.getElementById('uptime-url').value
      });
      hideUptimeModal();
  };
  
  term.onData(data => {
      if (currentSocket && activeTerminalSessionId) currentSocket.emit('input', {sessionId: activeTerminalSessionId, data});
  });
}

window.onload = initializeDashboard;