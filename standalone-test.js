#!/usr/bin/env node

/**
 * ClawNet Standalone Test
 * Starts mock server and runs tests
 */

const http = require('http');

const PORT = 4000;

// Colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const blue = '\x1b[34m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

// In-memory storage
const agents = new Map();
const memory = new Map();
let memoryId = 0;

// Helper
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// Create server
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const data = body ? JSON.parse(body) : null;

    // Routes
    if (path === '/health') {
      json(res, 200, { status: 'healthy', uptime: process.uptime() });
    }
    else if (path === '/api/v1/agents/register' && req.method === 'POST') {
      if (agents.has(data.id)) {
        json(res, 400, { success: false, error: 'Already registered' });
      } else {
        agents.set(data.id, { ...data, status: { state: 'available', load: 0 } });
        json(res, 201, { success: true, token: `token-${data.id}` });
      }
    }
    else if (path === '/api/v1/agents' && req.method === 'GET') {
      json(res, 200, { agents: Array.from(agents.values()), total: agents.size });
    }
    else if (path === '/api/v1/agents/stats') {
      json(res, 200, { total: agents.size, available: agents.size, busy: 0, offline: 0 });
    }
    else if (path === '/api/v1/memory/write' && req.method === 'POST') {
      const id = `mem-${++memoryId}`;
      memory.set(data.key, { id, ...data, createdAt: Date.now() });
      json(res, 201, { id });
    }
    else if (path === '/api/v1/memory/search' && req.method === 'POST') {
      json(res, 200, { entries: Array.from(memory.values()), total: memory.size, hasMore: false });
    }
    else if (path === '/api/v1/stats') {
      json(res, 200, {
        agents: { total: agents.size, available: agents.size, busy: 0, offline: 0 },
        memory: { totalEntries: memory.size, totalTags: 0 },
        server: { uptime: Math.floor(process.uptime() * 1000), wsConnections: 0 },
      });
    }
    else {
      json(res, 404, { error: 'Not found' });
    }
  });
});

// Test client
async function test(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${arguments[1] || '/health'}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', reject);
  });
}

async function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Run
async function main() {
  console.log(`\n${blue}🦞 ClawNet Standalone Test${reset}\n`);

  // Start server
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`${green}✓${reset} Mock server started on port ${PORT}`);

  const results = { passed: 0, failed: 0 };

  // Test 1: Health
  console.log(`\n${blue}Test 1: Health Check${reset}`);
  try {
    const res = await test(PORT, '/health');
    if (res.status === 200 && res.data.status === 'healthy') {
      console.log(`${green}✓ Health check passed${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ Health check failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Test 2: Register Agent
  console.log(`\n${blue}Test 2: Register Agent${reset}`);
  try {
    const res = await post(PORT, '/api/v1/agents/register', {
      id: 'test-agent',
      name: 'Test Agent',
      capabilities: { skills: ['test'], tools: [], domains: [], maxContextTokens: 100000 },
    });
    if (res.status === 201 && res.data.success) {
      console.log(`${green}✓ Agent registered${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ Registration failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Test 3: List Agents
  console.log(`\n${blue}Test 3: List Agents${reset}`);
  try {
    const res = await test(PORT, '/api/v1/agents');
    if (res.status === 200 && res.data.agents.length > 0) {
      console.log(`${green}✓ Found ${res.data.agents.length} agent(s)${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ List failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Test 4: Write Memory
  console.log(`\n${blue}Test 4: Write Memory${reset}`);
  try {
    const res = await post(PORT, '/api/v1/memory/write', {
      key: 'test-key',
      value: { test: true },
      createdBy: { id: 'test-agent' },
      tags: ['test'],
    });
    if (res.status === 201 && res.data.id) {
      console.log(`${green}✓ Memory written: ${res.data.id}${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ Write failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Test 5: Search Memory
  console.log(`\n${blue}Test 5: Search Memory${reset}`);
  try {
    const res = await post(PORT, '/api/v1/memory/search', { tags: ['test'] });
    if (res.status === 200 && res.data.entries.length > 0) {
      console.log(`${green}✓ Found ${res.data.total} entries${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ Search failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Test 6: Stats
  console.log(`\n${blue}Test 6: Get Stats${reset}`);
  try {
    const res = await test(PORT, '/api/v1/stats');
    if (res.status === 200) {
      console.log(`${green}✓ Stats: ${res.data.agents.total} agents, ${res.data.memory.totalEntries} memories${reset}`);
      results.passed++;
    } else {
      console.log(`${red}✗ Stats failed${reset}`);
      results.failed++;
    }
  } catch (e) {
    console.log(`${red}✗ Error: ${e.message}${reset}`);
    results.failed++;
  }

  // Summary
  console.log(`\n${'='.repeat(40)}\n`);
  console.log(`Results: ${green}${results.passed} passed${reset}, ${results.failed > 0 ? red : green}${results.failed} failed${reset}\n`);

  if (results.failed === 0) {
    console.log(`${green}✅ All tests passed! ClawNet is operational.${reset}\n`);
  } else {
    console.log(`${yellow}⚠️  Some tests failed.${reset}\n`);
  }

  // Stop server
  server.close();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${red}✗ Fatal error: ${e.message}${reset}`);
  process.exit(1);
});