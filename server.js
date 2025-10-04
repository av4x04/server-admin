// server-admin/server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// This list now acts as a default for first-time users.
// The user can add, edit, and remove servers, which will be saved in their browser's local storage.
const SERVERS = [
  {
    name: 'Server A - Main Project',
    url: 'https://server-v1-c2nb.onrender.com/',
    description: 'Main production server',
    // Example Deploy Hook URL for the reset feature.
    deployHookUrl: 'https://api.render.com/deploy/srv-d3fupkripnbc73bi0c0g?key=7NlFsc1B2Dg'
  },
  {
    name: 'Server B - Staging',
    url: 'https://your-second-server.onrender.com/', // << THAY URL SERVER CỦA BẠN VÀO ĐÂY
    description: 'Staging environment',
    deployHookUrl: '' // Leave empty if no deploy hook
  },
  {
    name: 'Server C - Dev',
    url: 'https://your-third-server.onrender.com/', // << THAY URL SERVER CỦA BẠN VÀO ĐÂY
    description: 'Development instance',
    deployHookUrl: ''
  }
];

// API endpoint to client to get the default list of servers
app.get('/api/servers', (req, res) => {
  res.json(SERVERS);
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Any request that doesn't match a static file will return index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Admin server listening on http://localhost:${PORT}`);
});
