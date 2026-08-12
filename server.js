const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'ai');
const jsonFile = path.join(dataDir, 'subscribers.json');
const txtFile = path.join(dataDir, 'subscribers.txt');

function ensureDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(jsonFile)) {
    fs.writeFileSync(jsonFile, '[]', 'utf8');
  }
  if (!fs.existsSync(txtFile)) {
    fs.writeFileSync(txtFile, '# Subscriber emails\n# Add one email address per line\n', 'utf8');
  }
}

function writeSubscriber(email) {
  const normalized = email.trim();
  if (!normalized) return false;

  const subscribers = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (!subscribers.includes(normalized)) {
    subscribers.push(normalized);
    fs.writeFileSync(jsonFile, JSON.stringify(subscribers, null, 2), 'utf8');
  }

  const txtContent = fs.readFileSync(txtFile, 'utf8');
  const lines = txtContent.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  if (!lines.includes(normalized)) {
    fs.appendFileSync(txtFile, `${normalized}\n`, 'utf8');
  }

  return true;
}

function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    callback(body);
  });
}

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

ensureDataFiles();

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (parsed.pathname === '/subscribe' && req.method === 'POST') {
    parseBody(req, body => {
      try {
        const payload = JSON.parse(body);
        const email = (payload.email || '').trim();
        if (!email || !email.includes('@')) {
          return sendJson(res, 400, { status: 'error', message: 'Invalid email' });
        }

        const saved = writeSubscriber(email);
        if (!saved) {
          return sendJson(res, 400, { status: 'error', message: 'Invalid email' });
        }

        return sendJson(res, 200, { status: 'success', email });
      } catch (error) {
        return sendJson(res, 400, { status: 'error', message: 'Invalid JSON' });
      }
    });
    return;
  }

  if (parsed.pathname === '/subscribers' && req.method === 'GET') {
    const list = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    return sendJson(res, 200, { status: 'success', subscribers: list });
  }

  const publicRoot = __dirname;
  let filePath = path.join(publicRoot, parsed.pathname === '/' ? 'index.html' : parsed.pathname);

  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
