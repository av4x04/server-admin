// server-admin/server.js
const express = require('express');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const PORT = process.env.PORT || 4000;
const SERVERS_FILE_PATH = path.join(__dirname, 'servers.json');

// Middleware để parse JSON body
app.use(express.json());

// --- Helper Functions ---

/**
 * Đọc danh sách server từ file JSON.
 * Nếu file không tồn tại, tạo file với dữ liệu mặc định.
 * @returns {Promise<Array>} Danh sách server.
 */
async function readServers() {
  try {
    await fs.access(SERVERS_FILE_PATH);
    const data = await fs.readFile(SERVERS_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Nếu file không tồn tại, tạo file mới với dữ liệu mặc định
    const defaultServers = [
      {
        name: 'Server Mẫu',
        url: 'https://server-v1-c2nb.onrender.com/',
        description: 'Đây là server mặc định',
        resetUrl: 'https://api.render.com/deploy/srv-your-id?key=your-key'
      }
    ];
    await writeServers(defaultServers);
    return defaultServers;
  }
}

/**
 * Ghi danh sách server vào file JSON.
 * @param {Array} servers - Mảng các server cần ghi.
 */
async function writeServers(servers) {
  await fs.writeFile(SERVERS_FILE_PATH, JSON.stringify(servers, null, 2), 'utf-8');
}


// --- API Endpoints ---

// Lấy danh sách server
app.get('/api/servers', async (req, res) => {
  try {
    const servers = await readServers();
    res.json(servers);
  } catch (error) {
    res.status(500).json({ message: 'Không thể đọc danh sách server.' });
  }
});

// Thêm một server mới
app.post('/api/servers', async (req, res) => {
  try {
    const { name, url, resetUrl, description } = req.body;
    if (!name || !url) {
      return res.status(400).json({ message: 'Tên và URL là bắt buộc.' });
    }
    const servers = await readServers();
    servers.push({ name, url, resetUrl, description: description || url });
    await writeServers(servers);
    res.status(201).json(servers);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi thêm server.' });
  }
});

// Xóa một server
app.delete('/api/servers', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ message: 'URL là bắt buộc để xóa.' });
        }
        let servers = await readServers();
        const newServers = servers.filter(server => server.url !== url);
        if (servers.length === newServers.length) {
            return res.status(404).json({ message: 'Không tìm thấy server để xóa.' });
        }
        await writeServers(newServers);
        res.json(newServers);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa server.' });
    }
});


// Gửi yêu cầu reset (deploy hook)
app.post('/api/servers/reset', async (req, res) => {
  const { resetUrl } = req.body;
  if (!resetUrl) {
    return res.status(400).json({ message: 'resetUrl là bắt buộc.' });
  }

  try {
    // Dùng fetch để gọi deploy hook của Render
    const response = await fetch(resetUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Deploy hook failed with status: ${response.status}`);
    }
    res.status(200).json({ message: 'Yêu cầu khởi động lại đã được gửi thành công.' });
  } catch (error) {
    console.error('Lỗi khi reset server:', error);
    res.status(500).json({ message: 'Không thể gửi yêu cầu khởi động lại.' });
  }
});


// --- Static File Serving ---

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Bất kỳ request nào không khớp sẽ trả về index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
