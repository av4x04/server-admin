const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const https = require('https');
const os = require('os');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 60000
});

const PORT = process.env.PORT || 4000;
const SHELL = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

// --- 1. PROXY LOGIC (Must be before static files) ---
// Route: /p/3000/some/path -> Proxy to http://localhost:3000/some/path

const dynamicProxy = createProxyMiddleware({
    target: 'http://localhost:8080', // Fallback default
    changeOrigin: true,
    ws: true, // Enable WebSocket support
    router: (req) => {
        const match = req.url.match(/^\/p\/(\d+)/);
        if (match) {
            const port = parseInt(match[1]);
            if (port === PORT) return null; // Don't proxy to self
            return `http://localhost:${port}`;
        }
        return null;
    },
    pathRewrite: (path, req) => {
        return path.replace(/^\/p\/\d+/, '') || '/';
    },
    logger: console,
    on: {
        error: (err, req, res) => {
            const isWebSocket = req.upgrade || (res && !res.writeHead);
            if (isWebSocket) {
                if (req.socket) req.socket.destroy();
                return;
            }
            if (res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end(`Proxy Error: Target service is not running.\n${err.message}`);
            }
        }
    }
});

app.use('/p', dynamicProxy);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// --- 2. TERMINAL LOGIC ---

class RingBuffer {
  constructor(limitBytes) {
    this.buf = Buffer.allocUnsafe(limitBytes);
    this.limit = limitBytes;
    this.start = 0;
    this.len = 0;
  }
  append(input) {
    const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
    if (b.length >= this.limit) {
      b.copy(this.buf, 0, b.length - this.limit);
      this.start = 0;
      this.len = this.limit;
      return;
    }
    const free = this.limit - this.len;
    if (b.length > free) {
      this.start = (this.start + (b.length - free)) % this.limit;
      this.len = this.limit;
    } else {
      this.len += b.length;
    }
    const writePos = (this.start + this.len - b.length) % this.limit;
    const firstPart = Math.min(b.length, this.limit - writePos);
    b.copy(this.buf, writePos, 0, firstPart);
    if (firstPart < b.length) {
      b.copy(this.buf, 0, firstPart);
    }
  }
  toString(enc = 'utf8') {
    if (this.len === 0) return '';
    if (this.start + this.len <= this.limit) {
      return this.buf.slice(this.start, this.start + this.len).toString(enc);
    } else {
      const tailLen = (this.start + this.len) - this.limit;
      return Buffer.concat([
        this.buf.slice(this.start, this.limit),
        this.buf.slice(0, tailLen)
      ]).toString(enc);
    }
  }
}

const sessions = new Map();
const HISTORY_LIMIT = 1024 * 512; // 512KB

function getNextSessionNumber() {
    const usedNumbers = Array.from(sessions.values())
        .map(s => {
            const match = s.name.match(/^Session (\d+)$/);
            return match ? parseInt(match[1], 10) : null;
        })
        .filter(n => n !== null)
        .sort((a, b) => a - b);
    
    let nextNumber = 1;
    for (const num of usedNumbers) {
        if (num === nextNumber) nextNumber++;
        else break;
    }
    return nextNumber;
}

function createSession(isInitial = false) {
  const id = uuidv4();
  let ptyProc;

  try {
    ptyProc = pty.spawn(SHELL, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, COLORTERM: 'truecolor' }
    });
  } catch (err) {
    console.error('Failed to spawn PTY:', err);
    return null;
  }

  const sessionNumber = getNextSessionNumber();
  const session = {
    id,
    name: `Session ${sessionNumber}`,
    pty: ptyProc,
    history: new RingBuffer(HISTORY_LIMIT),
  };

  ptyProc.on('data', (d) => {
    try {
      session.history.append(d);
      io.to(session.id).emit('output', d); // Send to room matching session ID
    } catch (err) {
      console.error(`Error on PTY data for session ${session.id}:`, err);
    }
  });

  ptyProc.on('exit', (code) => {
    console.log(`PTY for session ${session.id} exited with code ${code}`);
    sessions.delete(session.id);
    io.emit('session-closed', { id: session.id, name: session.name });
  });

  sessions.set(id, session);
  io.emit('session-created', { id: session.id, name: session.name });
  return session;
}

// Create one initial session
if (sessions.size === 0) createSession(true);


// --- 3. SYSTEM STATUS & UPTIME MONITOR LOGIC ---

let lastCpuTimes = os.cpus().map(cpu => ({ ...cpu.times }));

function getCpuUsage() {
    const currentCpuTimes = os.cpus();
    const usage = currentCpuTimes.map((cpu, i) => {
        const lastTimes = lastCpuTimes[i];
        const currentTimes = cpu.times;
        const idle = currentTimes.idle - lastTimes.idle;
        const total = (currentTimes.user - lastTimes.user) +
                      (currentTimes.nice - lastTimes.nice) +
                      (currentTimes.sys - lastTimes.sys) +
                      (currentTimes.irq - lastTimes.irq) +
                      idle;
        return total === 0 ? 0 : 100 * (1 - idle / total);
    });
    lastCpuTimes = currentCpuTimes.map(cpu => ({ ...cpu.times }));
    return usage;
}

setInterval(() => {
    const cpus = getCpuUsage();
    const totalCpu = cpus.reduce((acc, curr) => acc + curr, 0) / cpus.length;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    io.emit('system-stats', {
        cpu: totalCpu,
        cpus: cpus,
        ram: { total: totalMem, used: usedMem, percent: (usedMem / totalMem) * 100 },
        info: {
            hostname: 'av4x04@admin',
            platform: os.platform(),
            release: os.release(),
            nodeVersion: process.version,
            uptime: os.uptime(),
        }
    });
}, 1500);

// Uptime logic
const HARDCODED_UPTIME_SITES = [
    { uid: 'hc_site_1', name: 'Server Terminal v1', url: 'https://server-terminal-v1-m4pg.onrender.com', isHardcoded: true },
];

let sites = [...HARDCODED_UPTIME_SITES];
const statuses = {};
const checkIntervals = {};
const CHECK_INTERVAL = 60000;

function checkSiteStatus(site) {
    const startTime = Date.now();
    const req = https.get(site.url, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - startTime;
        const status = (res.statusCode >= 200 && res.statusCode < 400) ? 'up' : 'down';
        const update = { uid: site.uid, status, responseTime };
        statuses[site.uid] = update;
        io.emit('uptime:update', update);
        res.resume();
    }).on('error', (err) => {
        const update = { uid: site.uid, status: 'down', responseTime: -1 };
        statuses[site.uid] = update;
        io.emit('uptime:update', update);
    });

    req.on('timeout', () => {
        req.destroy();
        const update = { uid: site.uid, status: 'down', responseTime: -1 };
        statuses[site.uid] = update;
        io.emit('uptime:update', update);
    });
}

function startMonitoring(site) {
    if (checkIntervals[site.uid]) clearInterval(checkIntervals[site.uid]);
    checkSiteStatus(site);
    checkIntervals[site.uid] = setInterval(() => checkSiteStatus(site), CHECK_INTERVAL);
}
function stopMonitoring(uid) {
    if (checkIntervals[uid]) { clearInterval(checkIntervals[uid]); delete checkIntervals[uid]; }
}
sites.forEach(startMonitoring);


// --- 4. SOCKET.IO HANDLERS ---

function createBucket() {
  let tokens = capacity;
  let last = Date.now();
  return {
    take(n = 1) {
      const now = Date.now();
      const delta = now - last;
      if (delta > 0) {
        tokens = Math.min(capacity, tokens + (delta / 1000) * refillRate);
        last = now;
      }
      if (tokens >= n) { tokens -= n; return true; }
      return false;
    }
  };
}

io.on('connection', (socket) => {
  // console.log(`Client connected: ${socket.id}`);
  
  // -- Admin/Monitoring Handlers --
  socket.on('system:subscribe', () => {
    // Immediate stats update
    const cpus = getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    socket.emit('system-stats', {
        cpu: 0, cpus: cpus,
        ram: { total: totalMem, used: totalMem - freeMem, percent: ((totalMem - freeMem) / totalMem) * 100 },
        info: { hostname: 'av4x04@admin', platform: os.platform(), release: os.release(), nodeVersion: process.version, uptime: os.uptime() }
    });
  });

  socket.on('uptime:subscribe', () => {
      socket.emit('uptime:full_list', { sites, statuses });
  });

  socket.on('uptime:add_site', (siteData) => {
      if (!siteData.name || !siteData.url) return;
      const newSite = { uid: 'site_' + Date.now(), name: siteData.name, url: siteData.url, isHardcoded: false };
      sites.push(newSite);
      startMonitoring(newSite);
      io.emit('uptime:site_added', newSite);
  });

  socket.on('uptime:delete_site', (uid) => {
      const siteIndex = sites.findIndex(s => s.uid === uid);
      if (siteIndex > -1) {
          stopMonitoring(uid);
          sites.splice(siteIndex, 1);
          delete statuses[uid];
          io.emit('uptime:site_removed', uid);
      }
  });


  // -- Terminal Handlers --
  const bucket = createBucket();

  // Send current sessions list
  const sessionList = Array.from(sessions.values()).map(s => ({ id: s.id, name: s.name }));
  socket.emit('sessions-list', sessionList);

  socket.on('switch-session', (sessionId) => {
    socket.rooms.forEach(room => { if (room !== socket.id) socket.leave(room); });
    const session = sessions.get(sessionId);
    if (session) {
      socket.join(sessionId);
      const h = session.history.toString();
      if (h.length) socket.emit('history', h);
    }
  });

  socket.on('create-session', () => {
    createSession(false);
  });

  socket.on('close-session', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session) session.pty.kill();
  });

  socket.on('input', ({ sessionId, data }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.pty) return;
    const bytes = Buffer.byteLength(String(data), 'utf8');
    if (!bucket.take(bytes)) return;
    try { session.pty.write(String(data)); } catch (e) {}
  });

  socket.on('resize', ({ sessionId, cols, rows }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    try { session.pty.resize(Number(cols), Number(rows)); } catch (e) {}
  });

  socket.on('disconnect', () => {
    // console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Admin Server listening on http://localhost:${PORT}`);
});