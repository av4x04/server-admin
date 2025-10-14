// server-admin/server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const https = require('https');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Any request that doesn't match a static file will return index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- SYSTEM STATUS LOGIC (SERVER-SIDE) ---
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
        ram: {
            total: totalMem,
            used: usedMem,
            percent: (usedMem / totalMem) * 100,
        },
        info: {
            hostname: 'av4x04@admin',
            platform: os.platform(),
            release: os.release(),
            nodeVersion: process.version,
            uptime: os.uptime(),
        }
    });
}, 1500); // Send stats every 1.5 seconds


// --- UPTIME MONITOR LOGIC (SERVER-SIDE) ---

const HARDCODED_UPTIME_SITES = [
    { uid: 'hc_site_0', name: 'Server Admin', url: 'https://server-admin-v1-fp0s.onrender.com', isHardcoded: true },
    { uid: 'hc_site_1', name: 'Server Terminal v1', url: 'https://server-terminal-v1-rvg9.onrender.com', isHardcoded: true },
    { uid: 'hc_site_2', name: 'Server Terminal v2', url: 'https://server-terminal-v2-lil8.onrender.com', isHardcoded: true },
    { uid: 'hc_site_3', name: 'Server Terminal v3', url: 'https://server-terminal-v3-eqdx.onrender.com', isHardcoded: true },
    { uid: 'hc_site_4', name: 'Server Terminal v4', url: 'https://server-terminal-v4.onrender.com', isHardcoded: true },
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
    if (checkIntervals[site.uid]) {
        clearInterval(checkIntervals[site.uid]);
    }
    checkSiteStatus(site);
    checkIntervals[site.uid] = setInterval(() => checkSiteStatus(site), CHECK_INTERVAL);
}

function stopMonitoring(uid) {
    if (checkIntervals[uid]) {
        clearInterval(checkIntervals[uid]);
        delete checkIntervals[uid];
    }
}

sites.forEach(startMonitoring);

io.on('connection', (socket) => {
  console.log(`Admin UI client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Admin UI client disconnected: ${socket.id}`);
  });
  
  // System Status subscription
  socket.on('system:subscribe', () => {
    // Send initial full data on subscribe
    const cpus = getCpuUsage();
    const totalCpu = cpus.reduce((acc, curr) => acc + curr, 0) / cpus.length;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    socket.emit('system-stats', {
        cpu: totalCpu,
        cpus: cpus,
        ram: { total: totalMem, used: usedMem, percent: (usedMem / totalMem) * 100 },
        info: {
            hostname: 'av4x04@admin', platform: os.platform(), release: os.release(),
            nodeVersion: process.version, uptime: os.uptime(),
        }
    });
  });

  // Uptime Event Handlers
  socket.on('uptime:subscribe', () => {
      socket.emit('uptime:full_list', { sites, statuses });
  });

  socket.on('uptime:add_site', (siteData) => {
      if (!siteData.name || !siteData.url) return;
      
      const newSite = {
          uid: 'site_' + Date.now(),
          name: siteData.name,
          url: siteData.url,
          isHardcoded: false,
      };
      
      sites.push(newSite);
      startMonitoring(newSite);
      io.emit('uptime:site_added', newSite);
  });

  socket.on('uptime:delete_site', (uid) => {
      const siteIndex = sites.findIndex(s => s.uid === uid);
      if (siteIndex > -1) {
          const site = sites[siteIndex];
          if (site.isHardcoded) {
              console.warn(`Attempted to delete hardcoded site: ${site.name}. Denied.`);
              return;
          }
          
          stopMonitoring(uid);
          sites.splice(siteIndex, 1);
          delete statuses[uid];
          io.emit('uptime:site_removed', uid);
      }
  });
});

server.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
