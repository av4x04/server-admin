// server-admin/public/client.js
// Architecture: Multi-Socket Connection Pool with Keep-Alive Terminals

// UI Elements
const serverListContainer = document.getElementById('server-list');
const terminalsContainer = document.getElementById('terminal'); // We will use this as the container for all terminal wrappers
const statusText = document.getElementById('status-text');
const terminalTitle = document.getElementById('terminal-title');
const terminalLoader = document.getElementById('terminal-loader');
const loaderText = document.getElementById('loader-text');
const terminalTabsContainer = document.getElementById('terminal-tabs-container');

// State
const connections = new Map(); // uid -> { socket, term, element, fitAddon, sessions: [], activeSessionId: null }
let activeServerUid = null;
let allServices = [];

// Configuration
const ICONS = ['fas fa-server', 'fas fa-database', 'fas fa-network-wired', 'fas fa-laptop-code'];
const SERVER_STORAGE_KEY = 'admin-servers-list';

// Data Sources
const LOCAL_SERVICES = [
    { uid: 'internal-system', name: 'System Status', isLocal: true, icon: 'fas fa-tachometer-alt' },
    { uid: 'internal-uptime', name: 'Uptime Monitor', isLocal: true, icon: 'fas fa-heartbeat' }
];
const HARDCODED_SERVERS = [
    { uid: 'hc-1', name: 'Terminal-v1', url: 'https://server-terminal-v1-m4pg.onrender.com', isHardcoded: true },
    { uid: 'hc-2', name: 'Terminal-v2', url: 'https://server-terminal-v2-lil8.onrender.com', isHardcoded: true },
    { uid: 'hc-3', name: 'Terminal-v3', url: 'https://server-terminal-v3-iuxk.onrender.com', isHardcoded: true },
    { uid: 'hc-4', name: 'Terminal-v4', url: 'https://server-terminal-v4.onrender.com', isHardcoded: true },
];

let adminSocket; // For local system monitoring

// --- CORE FUNCTIONS ---

function init() {
    loadServers();
    renderServerList();
    
    // Connect to local admin socket for monitoring features
    adminSocket = io();
    setupAdminSocketListeners();

    // Select first server by default
    if (allServices.length > 0) selectServer(allServices[0]);
    
    // Setup Global Event Listeners
    setupUIListeners();
}

function loadServers() {
    try {
        const stored = JSON.parse(localStorage.getItem(SERVER_STORAGE_KEY) || '[]');
        const userServers = Array.isArray(stored) ? stored : [];
        allServices = [...LOCAL_SERVICES, ...HARDCODED_SERVERS, ...userServers];
    } catch(e) {
        allServices = [...LOCAL_SERVICES, ...HARDCODED_SERVERS];
    }
}

function selectServer(service) {
    if (activeServerUid === service.uid) return;
    
    // 1. Hide current view/terminal
    if (activeServerUid) {
        const currentConn = connections.get(activeServerUid);
        if (currentConn) {
            currentConn.element.style.display = 'none';
        }
    }

    activeServerUid = service.uid;
    renderServerList(); // Update active class in sidebar

    // 2. Handle Local Views (System/Uptime)
    if (service.isLocal) {
        document.getElementById('terminal-view').style.display = 'none';
        if (service.uid === 'internal-system') {
            document.getElementById('system-view').style.display = 'flex';
            document.getElementById('uptime-view').style.display = 'none';
            adminSocket.emit('system:subscribe');
        } else {
            document.getElementById('system-view').style.display = 'none';
            document.getElementById('uptime-view').style.display = 'flex';
            initializeUptimeMonitor();
        }
        statusText.textContent = service.name;
        return;
    }

    // 3. Handle Remote Terminals
    document.getElementById('system-view').style.display = 'none';
    document.getElementById('uptime-view').style.display = 'none';
    document.getElementById('terminal-view').style.display = 'flex';
    terminalTitle.textContent = service.name;

    // Check if connection already exists
    let conn = connections.get(service.uid);
    if (conn) {
        // RESUME existing connection
        conn.element.style.display = 'block';
        statusText.textContent = conn.socket.connected ? `Connected: ${service.name}` : 'Disconnected';
        renderTerminalTabs(conn);
        setTimeout(() => conn.term.focus(), 0); // Focus back
    } else {
        // CREATE new connection
        createNewConnection(service);
    }
}

function createNewConnection(service) {
    // Show Loader
    terminalLoader.classList.remove('hidden');
    loaderText.textContent = `Connecting to ${service.name}...`;

    // Create DOM Element for this terminal
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.display = 'block';
    // Clear the container first? No, we append. But we need to make sure 'terminalsContainer' (which is #terminal) is empty initially?
    // Actually #terminal should be cleared once at start.
    // Better: #terminal is the container.
    terminalsContainer.appendChild(wrapper);

    // Initialize Xterm
    const term = new Terminal({
        theme: { background: 'transparent', foreground: '#e6eef2', cursor: '#00d084', selection: 'rgba(0, 208, 132, 0.3)' },
        fontSize: 14, fontFamily: 'Menlo, monospace', cursorBlink: true, allowTransparency: true
    });
    // FitAddon would go here if available. For now we rely on CSS/Resize logic.
    term.open(wrapper);

    // Connect Socket
    const socket = io(service.url, { transports: ['websocket'], forceNew: true });
    
    const connState = {
        socket,
        term,
        element: wrapper,
        sessions: [],
        activeSessionId: null,
        uid: service.uid
    };
    connections.set(service.uid, connState);

    // Socket Handlers
    socket.on('connect', () => {
        if (activeServerUid === service.uid) {
            terminalLoader.classList.add('hidden');
            statusText.textContent = `Connected: ${service.name}`;
            renderTerminalTabs(connState);
        }
    });

    socket.on('disconnect', () => {
        if (activeServerUid === service.uid) statusText.textContent = 'Disconnected';
        term.write('\r\n\x1b[31m⚠️ Disconnected.\x1b[0m\r\n');
    });

    socket.on('output', (data) => term.write(data));
    
    socket.on('history', (h) => {
        term.reset();
        term.write(h);
    });

    socket.on('sessions-list', (list) => {
        connState.sessions = list;
        // Auto-join logic
        if (list.length > 0) {
            // Try to recover session? For now just pick first.
            if (!connState.activeSessionId || !list.find(s => s.id === connState.activeSessionId)) {
                switchSession(connState, list[0].id);
            }
        }
        if (activeServerUid === service.uid) renderTerminalTabs(connState);
    });

    socket.on('session-created', (s) => {
        connState.sessions.push(s);
        switchSession(connState, s.id);
        if (activeServerUid === service.uid) renderTerminalTabs(connState);
    });

    socket.on('session-closed', ({id}) => {
        connState.sessions = connState.sessions.filter(s => s.id !== id);
        if (connState.activeSessionId === id) {
            if (connState.sessions.length > 0) switchSession(connState, connState.sessions[0].id);
            else {
                connState.activeSessionId = null;
                term.reset();
            }
        }
        if (activeServerUid === service.uid) renderTerminalTabs(connState);
    });

    // Terminal Input
    term.onData(data => {
        if (connState.activeSessionId) {
            socket.emit('input', { sessionId: connState.activeSessionId, data });
        }
    });
}

function switchSession(conn, sessionId) {
    conn.activeSessionId = sessionId;
    conn.socket.emit('switch-session', sessionId);
}

function renderTerminalTabs(conn) {
    terminalTabsContainer.innerHTML = '';
    conn.sessions.forEach(session => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${session.id === conn.activeSessionId ? 'active' : ''}`;
        btn.textContent = session.name;
        
        // Close Button
        if (conn.sessions.length > 1) {
            const close = document.createElement('i');
            close.className = 'fas fa-times close-tab-btn';
            close.onclick = (e) => {
                e.stopPropagation();
                if(confirm('Close session?')) conn.socket.emit('close-session', session.id);
            };
            btn.appendChild(close);
        }
        
        btn.onclick = () => {
            switchSession(conn, session.id);
            renderTerminalTabs(conn); // Re-render to update active class
            conn.term.focus();
        };
        terminalTabsContainer.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab-btn';
    addBtn.textContent = '+';
    addBtn.onclick = () => conn.socket.emit('create-session');
    terminalTabsContainer.appendChild(addBtn);
}

// --- SHARED UI LOGIC ---

function renderServerList() {
    serverListContainer.innerHTML = '';
    allServices.forEach(s => {
        const div = document.createElement('div');
        div.className = `tab-item ${s.uid === activeServerUid ? 'active' : ''}`;
        div.innerHTML = `
            <div class="icon-circle"><i class="${s.icon || 'fas fa-server'}"></i></div>
            <div class="tab-meta"><div class="tab-name">${s.name}</div><div class="tab-sub">${s.uid}</div></div>
        `;
        div.onclick = () => selectServer(s);
        serverListContainer.appendChild(div);
    });
}

// Global Port Opener
window.openPort = function() {
    const port = document.getElementById('port-input').value;
    if (!port || !activeServerUid) return;
    const service = allServices.find(s => s.uid === activeServerUid);
    if (service && !service.isLocal) {
        window.open(`${service.url}/p/${port}/`, '_blank');
    }
};

// Admin/Monitoring Logic (Simplified)
function setupAdminSocketListeners() {
    // Re-implement Uptime/System listeners here using adminSocket
    // (Existing code logic fits here, just referencing adminSocket)
    // For brevity, assuming initUptime and initSystem are called when view switches
}

function initializeUptimeMonitor() {
    // Fetch data via adminSocket
    adminSocket.emit('uptime:subscribe');
}

// --- BOOTSTRAP ---
window.onload = init;
