// server-admin/server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Danh sách các server con cần quản lý
// Bạn có thể thêm hoặc bớt các server ở đây
const SERVERS = [
  {
    name: 'Server A - Main Project',
    url: 'https://server-v1-c2nb.onrender.com/',
    description: 'Main production server'
  },
  {
    name: 'Server B - Staging',
    url: 'https://your-second-server.onrender.com/', // << THAY URL SERVER CỦA BẠN VÀO ĐÂY
    description: 'Staging environment'
  },
  {
    name: 'Server C - Dev',
    url: 'https://your-third-server.onrender.com/', // << THAY URL SERVER CỦA BẠN VÀO ĐÂY
    description: 'Development instance'
  }
];

// API endpoint để client lấy danh sách server
app.get('/api/servers', (req, res) => {
  res.json(SERVERS);
});

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Bất kỳ request nào không khớp sẽ trả về index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
