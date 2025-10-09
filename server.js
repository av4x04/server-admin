// server-admin/server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Bất kỳ request nào không khớp sẽ trả về index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- UPTIME MONITOR LOGIC (SERVER-SIDE) ---

const HARDCODED_UPTIME_SITES = [
    { uid: 'hc_site_1', name: 'Server Terminal v1', url: 'https://server-terminal-v1-rvg9.onrender.com', isHardcoded: true },
    { uid: 'hc_site_2', name: 'Server Terminal v2', url: 'https://server-terminal-v2-lil8.onrender.com', isHardcoded: true },
    { uid: 'hc_site_3', name: 'Server Terminal v3', url: 'https://server-terminal-v3-eqdx.onrender.com', isHardcoded: true },
    { uid: 'hc_site_4', name: 'Server Terminal v4', url: 'https://server-terminal-v4.onrender.com', isHardcoded: true },
];

// --- Refactored State Management ---
// 1. Serializable Configuration Data: A clean list of sites to monitor.
let sites = [...HARDCODED_UPTIME_SITES];

// 2. Serializable Runtime Status: Stores the current status of each site.
const statuses = {};

// 3. Non-Serializable Runtime State: Stores interval IDs. NEVER sent to client.
const checkIntervals = {};

const CHECK_INTERVAL = 60000; // Check every 60 seconds

/**
 * Checks the status of a single URL.
 * @param {object} site - The site to check { uid, url }.
 */
function checkSiteStatus(site) {
    const startTime = Date.now();
    const req = https.get(site.url, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - startTime;
        const status = (res.statusCode >= 200 && res.statusCode < 400) ? 'up' : 'down';
        
        const update = { uid: site.uid, status, responseTime };
        statuses[site.uid] = update;
        io.emit('uptime:update', update);

        res.resume(); // Consume response data to free up memory
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

/**
 * Starts the monitoring interval for a site.
 * @param {object} site - The site to monitor.
 */
function startMonitoring(site) {
    if (checkIntervals[site.uid]) {
        clearInterval(checkIntervals[site.uid]);
    }
    checkSiteStatus(site); // Initial check
    checkIntervals[site.uid] = setInterval(() => checkSiteStatus(site), CHECK_INTERVAL);
}

/**
 * Stops monitoring a site.
 * @param {string} uid - The unique ID of the site.
 */
function stopMonitoring(uid) {
    if (checkIntervals[uid]) {
        clearInterval(checkIntervals[uid]);
        delete checkIntervals[uid];
    }
}

// Start monitoring all initial sites
sites.forEach(startMonitoring);


io.on('connection', (socket) => {
  console.log(`Admin UI client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Admin UI client disconnected: ${socket.id}`);
  });

  // --- Uptime Event Handlers ---
  socket.on('uptime:subscribe', () => {
      // Always send a clean, serializable state to the client.
      socket.emit('uptime:full_list', {
        sites: sites,
        statuses: statuses
      });
  });

  socket.on('uptime:add_site', (siteData) => {
      if (!siteData.name || !siteData.url) return;
      
      const newSite = {
          uid: 'site_' + Date.now(),
          name: siteData.name,
          url: siteData.url,
          isHardcoded: false, // User-added sites are not hardcoded
      };
      
      sites.push(newSite);
      startMonitoring(newSite);
      io.emit('uptime:site_added', newSite);
  });

  socket.on('uptime:delete_site', (uid) => {
      const siteIndex = sites.findIndex(s => s.uid === uid);
      if (siteIndex > -1) {
          const site = sites[siteIndex];
          // IMPORTANT: Prevent deleting hardcoded sites
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
