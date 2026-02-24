/**
 * ClawNet Mock Server
 * Simulates ClawNet API for testing without full setup
 */

const http = require('http');

const PORT = process.env.CLAWNET_PORT || 4000;

// Global rate limiting state
const requestCounts = new Map();

// Rate Limiting Middleware
const rateLimit = (maxRequests, windowMs) => {
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const windowKey = `${ip}:${Math.floor(now / windowMs)}`;
    
    if (!requestCounts.has(windowKey)) {
      requestCounts.set(windowKey, { count: 1, lastReset: now });
    } else {
      const record = requestCounts.get(windowKey);
      if (now - record.lastReset > windowMs) {
        record.count = 1;
        record.lastReset = now;
      } else {
        record.count++;
        if (record.count > maxRequests) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Too many requests',
            message: `Limit of ${maxRequests} requests per ${windowMs / 1000} seconds exceeded.`,
          }));
          return;
        }
      }
    }
    next();
  };
};

// Apply rate limiting to critical endpoints
const applyRateLimit = rateLimit(100, 60 * 1000);

// In-memory storage
const agents = new Map();
const memory = new Map();
let memoryId = 0;

// Helper
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// Server
const server = http.createServer((req, res) => {
  // Apply rate limiting to API endpoints
  if (req.url.startsWith('/api/v1/')) {
    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const windowKey = `${ip}:${Math.floor(now / 60000)}`;
    
    if (!requestCounts.has(windowKey)) {
      requestCounts.set(windowKey, { count: 1, lastReset: now });
    } else {
      const record = requestCounts.get(windowKey);
      if (now - record.lastReset > 60000) {
        record.count = 1;
        record.lastReset = now;
      } else {
        record.count++;
        if (record.count > 100) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Too many requests',
            message: 'Limit of 100 requests per minute exceeded.'
          }));
          return;
        }
      }
    }
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const data = body ? JSON.parse(body) : null;
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    // Routes
    if (path === '/health') {
      json(res, 200, { status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
    }
    // Agents
    else if (path === '/api/v1/agents/register' && req.method === 'POST') {
      const id = data.id;
      if (agents.has(id)) {
        json(res, 400, { success: false, error: 'Agent already registered' });
      } else {
        agents.set(id, {
          ...data,
          status: { state: 'available', load: 0, lastHeartbeat: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        json(res, 201, { success: true, token: `mock-token-${id}` });
      }
    }
    else if (path === '/api/v1/agents' && req.method === 'GET') {
      json(res, 200, { agents: Array.from(agents.values()), total: agents.size });
    }
    else if (path.startsWith('/api/v1/agents/')) {
      const id = path.split('/')[4];
      const agent = agents.get(id);
      if (agent) {
        json(res, 200, { agent });
      } else {
        json(res, 404, { error: 'Agent not found' });
      }
    }
    else if (path === '/api/v1/agents/query' && req.method === 'POST') {
      let results = Array.from(agents.values());
      if (data.skills) {
        results = results.filter(a => data.skills.some(s => a.capabilities.skills.includes(s)));
      }
      if (data.status) {
        results = results.filter(a => a.status.state === data.status);
      }
      if (data.maxLoad !== undefined) {
        results = results.filter(a => a.status.load <= data.maxLoad);
      }
      if (data.limit) {
        results = results.slice(0, data.limit);
      }
      json(res, 200, { agents: results, total: results.length });
    }
    else if (path === '/api/v1/agents/heartbeat' && req.method === 'POST') {
      const id = data.agentId?.id || data.agentId;
      const agent = agents.get(id);
      if (agent) {
        agent.status = { ...agent.status, ...data.status, lastHeartbeat: Date.now() };
        json(res, 200, { success: true });
      } else {
        json(res, 404, { success: false, error: 'Agent not found' });
      }
    }
    else if (path === '/api/v1/agents/stats' && req.method === 'GET') {
      const all = Array.from(agents.values());
      json(res, 200, {
        total: all.length,
        available: all.filter(a => a.status.state === 'available').length,
        busy: all.filter(a => a.status.state === 'busy').length,
        offline: all.filter(a => a.status.state === 'offline').length,
        error: all.filter(a => a.status.state === 'error').length,
      });
    }
    // Memory
    else if (path === '/api/v1/memory/write' && req.method === 'POST') {
      const id = `mem-${++memoryId}`;
      memory.set(data.key, {
        id,
        key: data.key,
        value: data.value,
        createdBy: data.createdBy,
        createdAt: Date.now(),
        tags: data.tags || [],
      });
      json(res, 201, { id, createdAt: Date.now() });
    }
    else if (path.startsWith('/api/v1/memory/') && req.method === 'GET') {
      const key = path.split('/')[4];
      const entry = memory.get(key);
      if (entry) {
        json(res, 200, { entry });
      } else {
        json(res, 404, { error: 'Entry not found' });
      }
    }
    else if (path === '/api/v1/memory/search' && req.method === 'POST') {
      let results = Array.from(memory.values());
      if (data.tags) {
        results = results.filter(e => data.tags.some(t => e.tags.includes(t)));
      }
      if (data.searchText) {
        const search = data.searchText.toLowerCase();
        results = results.filter(e =>
          e.key.toLowerCase().includes(search) ||
          JSON.stringify(e.value).toLowerCase().includes(search)
        );
      }
      if (data.limit) {
        results = results.slice(0, data.limit);
      }
      json(res, 200, { entries: results, total: results.length, hasMore: false });
    }
    else if (path.startsWith('/api/v1/memory/') && req.method === 'DELETE') {
      const key = path.split('/')[4];
      if (memory.delete(key)) {
        json(res, 200, { success: true });
      } else {
        json(res, 404, { error: 'Entry not found' });
      }
    }
    else if (path === '/api/v1/memory/stats' && req.method === 'GET') {
      json(res, 200, {
        totalEntries: memory.size,
        totalTags: new Set(Array.from(memory.values()).flatMap(e => e.tags)).size,
        topTags: [],
      });
    }
    // Stats
    else if (path === '/api/v1/stats') {
      json(res, 200, {
        agents: {
          total: agents.size,
          available: Array.from(agents.values()).filter(a => a.status.state === 'available').length,
          busy: Array.from(agents.values()).filter(a => a.status.state === 'busy').length,
          offline: Array.from(agents.values()).filter(a => a.status.state === 'offline').length,
        },
        memory: {
          totalEntries: memory.size,
          totalTags: 0,
        },
        server: {
          uptime: Math.floor(process.uptime() * 1000),
          wsConnections: 0,
        },
      });
    }
    // Messages
    else if (path === '/api/v1/messages/send' && req.method === 'POST') {
      json(res, 202, { id: `msg-${Date.now()}`, sent: true });
    }
    // Not found
    else {
      json(res, 404, { error: 'Not found' });
    }
  });
});

// Start
server.listen(PORT, () => {
  console.log(`\n🦞 ClawNet Mock Server running on http://localhost:${PORT}\n`);
  console.log('Endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/v1/agents/register');
  console.log('  GET  /api/v1/agents');
  console.log('  POST /api/v1/agents/query');
  console.log('  POST /api/v1/agents/heartbeat');
  console.log('  GET  /api/v1/agents/stats');
  console.log('  POST /api/v1/memory/write');
  console.log('  GET  /api/v1/memory/:key');
  console.log('  POST /api/v1/memory/search');
  console.log('  GET  /api/v1/stats');
  console.log('\nPress Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});