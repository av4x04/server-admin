// server-admin/server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

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
const UPTIME_CHECK_INTERVAL = 60000; // 60 seconds

// Trạng thái được lưu trong bộ nhớ. Sẽ mất khi server khởi động lại.
const uptimeState = {
    sites: [], // Mảng { uid, name, url }
    statuses: {}, // Map { [uid]: { status: 'up'|'down'|'pending', responseTime: number, lastChecked: timestamp } }
};

async function checkSite(site) {
    const startTime = Date.now();
    let statusUpdate = {
        status: 'down',
        responseTime: 0,
        lastChecked: startTime,
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // Timeout 15 giây

        const response = await fetch(site.url, { signal: controller.signal });
        clearTimeout(timeout);

        const endTime = Date.now();
        statusUpdate.responseTime = endTime - startTime;
        
        // Coi tất cả mã trạng thái 2xx hoặc 3xx là "up"
        if (response.status >= 200 && response.status < 400) {
            statusUpdate.status = 'up';
        }

    } catch (error) {
        // Lỗi (timeout, lỗi mạng) được coi là 'down'
        console.log(`Error checking ${site.url}:`, error.name);
    }
    
    uptimeState.statuses[site.uid] = statusUpdate;
    // Gửi cập nhật đến tất cả client
    io.emit('uptime:update', { uid: site.uid, ...statusUpdate });
}

function startMonitoring() {
    console.log(`Uptime monitor started. Checking every ${UPTIME_CHECK_INTERVAL / 1000} seconds.`);
    setInterval(() => {
        console.log('Running scheduled uptime checks...');
        uptimeState.sites.forEach(checkSite);
    }, UPTIME_CHECK_INTERVAL);
}

// Bắt đầu vòng lặp giám sát khi server khởi động
startMonitoring();


// --- XỬ LÝ KẾT NỐI SOCKET.IO ---
io.on('connection', (socket) => {
  console.log(`Admin UI client connected: ${socket.id}`);
  
  // --- SỰ KIỆN UPTIME ---
  socket.on('uptime:subscribe', () => {
      // Khi client đăng ký (mở view), gửi cho họ toàn bộ trạng thái hiện tại
      socket.emit('uptime:full_list', uptimeState);
  });
  
  socket.on('uptime:add_site', (siteData) => {
      const newSite = {
          uid: 'uptime_' + Date.now(),
          name: siteData.name,
          url: siteData.url,
      };
      uptimeState.sites.push(newSite);
      // Khởi tạo trạng thái là pending
      uptimeState.statuses[newSite.uid] = { status: 'pending', responseTime: 0, lastChecked: null };
      
      console.log(`Site added: ${newSite.name} (${newSite.url})`);
      
      // Gửi thông báo cho tất cả client rằng một trang mới đã được thêm
      io.emit('uptime:site_added', newSite);
      
      // Thực hiện kiểm tra ban đầu ngay lập tức
      checkSite(newSite);
  });
  
  socket.on('uptime:delete_site', (uid) => {
      uptimeState.sites = uptimeState.sites.filter(s => s.uid !== uid);
      delete uptimeState.statuses[uid];
      
      console.log(`Site deleted: ${uid}`);
      
      // Gửi thông báo cho tất cả client rằng một trang đã bị xóa
      io.emit('uptime:site_removed', uid);
  });

  socket.on('disconnect', () => {
    console.log(`Admin UI client disconnected: ${socket.id}`);
  });
});


server.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
