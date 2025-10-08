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

// Define hardcoded servers that cannot be deleted
const HARDCODED_SERVERS = [
    {
        uid: 'hardcoded-1',
        name: 'Terminal-v1',
        url: 'https://server-terminal-v1-rvg9.onrender.com',
        description: 'Default Server 1',
        deployHookUrl: '',
        isHardcoded: true
    },
    {
        uid: 'hardcoded-2',
        name: 'Terminal-v2',
        url: 'https://server-terminal-v2-lil8.onrender.com',
        description: 'Default Server 2',
        deployHookUrl: '',
        isHardcoded: true
    }
];

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
const terminalLoader = document.getElementById('terminal-loader');
const loaderAscii = document.getElementById('loader-ascii');
const loaderText = document.getElementById('loader-text');

/**
 * Loads hardcoded servers and any user-added servers from localStorage.
 */
function loadServers() {
    const storedUserServers = localStorage.getItem(STORAGE_KEY);
    let userServers = [];
    try {
      if (storedUserServers) {
          userServers = JSON.parse(storedUserServers);
      }
    } catch (e) {
      console.error("Error parsing user servers from localStorage", e);
      localStorage.removeItem(STORAGE_KEY); // Clear corrupted data
    }
    // The final list is always the hardcoded ones plus the user's custom ones
    servers = [...HARDCODED_SERVERS, ...userServers];
}

/**
 * Saves only the user-added (non-hardcoded) servers to localStorage.
 */
function saveServers() {
    const userServers = servers.filter(s => !s.isHardcoded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userServers));
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

        // Do not show the options menu for hardcoded servers
        const actionsHtml = !server.isHardcoded ? `
            <div class="tab-actions">
                <button class="options-btn" title="Options"><i class="fas fa-ellipsis-v"></i></button>
                <div class="options-menu">
                    <a href="#" class="reboot-btn"><i class="fas fa-sync-alt"></i> Reboot</a>
                    <a href="#" class="delete-btn delete"><i class="fas fa-trash-alt"></i> Delete</a>
                </div>
            </div>
        ` : '';

        serverElement.innerHTML = `
            <div class="icon-circle"><i class="${iconClass}"></i></div>
            <div class="tab-meta">
                <div class="tab-name">${server.name}</div>
                <div class="tab-sub">${server.description || server.url}</div>
            </div>
            ${actionsHtml}
        `;

        // Event listener for selecting the server
        serverElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-actions')) {
                connectToServer(server);
            }
        });

        // Add event listeners for the options menu only for non-hardcoded servers
        if (!server.isHardcoded) {
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
        }

        serverListContainer.appendChild(serverElement);
    });
}

/**
 * Shows a connection message in the terminal overlay.
 * @param {object} server - The server object being connected to.
 */
function showConnectionAnimation(server) {
    if (connectionAnimationInterval) {
        clearInterval(connectionAnimationInterval);
        connectionAnimationInterval = null;
    }
    term.reset();
    terminalLoader.classList.remove('hidden');

    loaderAscii.textContent = '\n(>_<)\n\n';
    loaderText.textContent = `Connecting to ${server.name}...`;
}


/**
 * Establishes a Socket.IO connection to a specific server.
 * @param {object} server - The server object to connect to.
 */
function connectToServer(server) {
  if (activeServerUrl === server.url) return;

  if (currentSocket) currentSocket.disconnect();

  activeServerUrl = server.url;
  statusText.textContent = `Connecting...`;
  terminalTitle.textContent = server.name;

  showConnectionAnimation(server);

  renderServerList(); // Re-render to update active state

  currentSocket = io(server.url, { transports: ['websocket'] });

  currentSocket.on('connect', () => {
    if (connectionAnimationInterval) clearInterval(connectionAnimationInterval);
    connectionAnimationInterval = null;
    terminalLoader.classList.add('hidden');
    console.log(`🟢 Connected to server: ${server.url}`);
    statusText.textContent = `Connected: ${server.name}`;
    term.write(`\r\n\x1b[32m✅ Connection established to ${server.name}\x1b[0m\r\n`);
  });

  currentSocket.on('disconnect', () => {
    if (connectionAnimationInterval) clearInterval(connectionAnimationInterval);
    connectionAnimationInterval = null;
    terminalLoader.classList.add('hidden');
    console.log(`🔴 Disconnected from server: ${server.url}`);
    if (activeServerUrl === server.url) {
        statusText.textContent = 'Disconnected';
        term.write('\r\n\x1b[31m⚠️ Connection lost. Attempting to reconnect...\x1b[0m\r\n');
    }
  });
  
  currentSocket.on('output', data => {
      if(connectionAnimationInterval) { // Stop animation on first output
        clearInterval(connectionAnimationInterval);
        connectionAnimationInterval = null;
        terminalLoader.classList.add('hidden');
      }
      term.write(data);
  });

  currentSocket.on('history', history => {
    if(connectionAnimationInterval) {
        clearInterval(connectionAnimationInterval);
        connectionAnimationInterval = null;
        terminalLoader.classList.add('hidden');
        term.reset(); // Clear animation before writing history
    }
    term.write(history);
  });
}

async function handleReboot(server) {
    if (!server.deployHookUrl) {
        term.write(`\r\n\x1b[31m[Error] Server '${server.name}' does not have a Deploy Hook URL configured.\x1b[0m\r\n`);
        term.write(`\r\n\x1b[33mPlease edit the server information to add a deploy hook.\x1b[0m\r\n`);
        return;
    }

    term.write(`\r\n\x1b[33m[Reboot] Sending reboot command to '${server.name}'...\x1b[0m\r\n`);
    
    try {
        // We use 'no-cors' mode because many webhooks don't return the necessary CORS headers
        // for the browser to read the response. This command will send the request
        // without a CORS preflight, but we cannot inspect the response.
        // For a "fire and forget" reboot trigger, this is sufficient.
        await fetch(server.deployHookUrl, { 
            method: 'POST',
            mode: 'no-cors'
        });

        term.write(`\r\n\x1b[32m[Reboot] Reboot signal sent successfully. The server will restart shortly.\x1b[0m\r\n`);
        
    } catch (error) {
        console.error('Error triggering deploy hook:', error);
        term.write(`\r\n\x1b[31m[Reboot Error] Could not send reboot command: ${error.message}\x1b[0m\r\n`);
    }
}

function handleDelete(serverToDelete) {
    if (serverToDelete.isHardcoded) {
        alert('Default servers cannot be deleted.');
        return;
    }

    if (!confirm(`Are you sure you want to delete server '${serverToDelete.name}'? This action cannot be undone.`)) return;

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
            statusText.textContent = 'No Server Selected';
            term.write('No servers available. Please add a server to begin.');
        }
    }
    renderServerList();
}


/**
 * Shows the modal for adding a new server.
 */
function showModal() {
    serverForm.reset();
    document.getElementById('server-id').value = '';
    document.getElementById('modal-title').innerHTML = 'Add New Server <i class="fas fa-plus-circle"></i>';
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
        isHardcoded: false, // User-added servers are never hardcoded
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
      // This case should not happen anymore with hardcoded servers, but it's good practice to keep it.
      statusText.textContent = 'No Servers';
      terminalLoader.classList.remove('hidden');
      loaderAscii.textContent = '\n(>_<)\n\n';
      loaderText.textContent = 'No servers configured. Please add one to start.';
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

// Initialize when the page is loaded
window.addEventListener('load', initializeDashboard);
