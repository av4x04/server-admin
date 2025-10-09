// server-admin/server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

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

// Xử lý kết nối Socket.IO để giữ cho server "bận rộn"
io.on('connection', (socket) => {
  console.log('Admin dashboard client connected for keep-alive:', socket.id);

  // Gửi một tín hiệu heartbeat sau mỗi 20 giây để giữ kết nối sống
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat', { timestamp: new Date().toISOString() });
  }, 20000);

  socket.on('disconnect', () => {
    console.log('Admin dashboard client disconnected:', socket.id);
    clearInterval(heartbeatInterval);
  });
});

server.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
