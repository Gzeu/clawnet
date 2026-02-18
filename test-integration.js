#!/usr/bin/env node

/**
 * ClawNet Integration Test
 * Tests the connection between OpenClaw and ClawNet mesh
 */

const http = require('http');
const https = require('https');

const CLAWNET_URL = process.env.CLAWNET_URL || 'http://localhost:4000';

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP request helper
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CLAWNET_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  console.log('\n🦞 ClawNet Integration Test\n');
  console.log(`Testing: ${CLAWNET_URL}\n`);

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  // Test 1: Health Check
  try {
    log('blue', 'Test 1: Health Check...');
    const res = await request('GET', '/health');
    if (res.status === 200 && res.data?.status === 'healthy') {
      log('green', '  ✅ Health check passed');
      results.passed++;
      results.tests.push({ name: 'Health Check', status: 'PASS' });
    } else {
      log('red', `  ❌ Health check failed: ${res.status}`);
      results.failed++;
      results.tests.push({ name: 'Health Check', status: 'FAIL', error: `Status: ${res.status}` });
    }
  } catch (e) {
    log('red', `  ❌ Health check error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Health Check', status: 'FAIL', error: e.message });
  }

  // Test 2: Register Agent
  try {
    log('blue', 'Test 2: Register Agent...');
    const res = await request('POST', '/api/v1/agents/register', {
      id: 'test-agent-' + Date.now(),
      name: 'Test Agent',
      capabilities: {
        skills: ['testing', 'coding'],
        tools: ['read', 'write'],
        domains: ['software'],
        maxContextTokens: 100000,
      },
    });
    if (res.status === 201 && res.data?.success) {
      log('green', '  ✅ Agent registered');
      results.passed++;
      results.tests.push({ name: 'Register Agent', status: 'PASS' });
    } else {
      log('red', `  ❌ Registration failed: ${JSON.stringify(res.data)}`);
      results.failed++;
      results.tests.push({ name: 'Register Agent', status: 'FAIL' });
    }
  } catch (e) {
    log('red', `  ❌ Registration error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Register Agent', status: 'FAIL', error: e.message });
  }

  // Test 3: List Agents
  try {
    log('blue', 'Test 3: List Agents...');
    const res = await request('GET', '/api/v1/agents');
    if (res.status === 200 && Array.isArray(res.data?.agents)) {
      log('green', `  ✅ Found ${res.data.agents.length} agents`);
      results.passed++;
      results.tests.push({ name: 'List Agents', status: 'PASS' });
    } else {
      log('red', `  ❌ List failed: ${res.status}`);
      results.failed++;
      results.tests.push({ name: 'List Agents', status: 'FAIL' });
    }
  } catch (e) {
    log('red', `  ❌ List error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'List Agents', status: 'FAIL', error: e.message });
  }

  // Test 4: Write Memory
  try {
    log('blue', 'Test 4: Write Memory...');
    const res = await request('POST', '/api/v1/memory/write', {
      key: 'test-memory-' + Date.now(),
      value: { test: true, timestamp: Date.now() },
      createdBy: { id: 'test-agent' },
      tags: ['test'],
    });
    if (res.status === 201 && res.data?.id) {
      log('green', `  ✅ Memory written: ${res.data.id}`);
      results.passed++;
      results.tests.push({ name: 'Write Memory', status: 'PASS' });
    } else {
      log('red', `  ❌ Write failed: ${JSON.stringify(res.data)}`);
      results.failed++;
      results.tests.push({ name: 'Write Memory', status: 'FAIL' });
    }
  } catch (e) {
    log('red', `  ❌ Write error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Write Memory', status: 'FAIL', error: e.message });
  }

  // Test 5: Search Memory
  try {
    log('blue', 'Test 5: Search Memory...');
    const res = await request('POST', '/api/v1/memory/search', {
      tags: ['test'],
      limit: 10,
    });
    if (res.status === 200 && Array.isArray(res.data?.entries)) {
      log('green', `  ✅ Found ${res.data.total} entries`);
      results.passed++;
      results.tests.push({ name: 'Search Memory', status: 'PASS' });
    } else {
      log('red', `  ❌ Search failed: ${res.status}`);
      results.failed++;
      results.tests.push({ name: 'Search Memory', status: 'FAIL' });
    }
  } catch (e) {
    log('red', `  ❌ Search error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Search Memory', status: 'FAIL', error: e.message });
  }

  // Test 6: Get Stats
  try {
    log('blue', 'Test 6: Get Stats...');
    const res = await request('GET', '/api/v1/stats');
    if (res.status === 200) {
      log('green', `  ✅ Stats: ${res.data.agents.total} agents, ${res.data.memory.totalEntries} memories`);
      results.passed++;
      results.tests.push({ name: 'Get Stats', status: 'PASS', data: res.data });
    } else {
      log('red', `  ❌ Stats failed: ${res.status}`);
      results.failed++;
      results.tests.push({ name: 'Get Stats', status: 'FAIL' });
    }
  } catch (e) {
    log('red', `  ❌ Stats error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Get Stats', status: 'FAIL', error: e.message });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${results.passed} passed, ${results.failed} failed\n`);

  if (results.failed === 0) {
    log('green', '✅ All tests passed! ClawNet is operational.\n');
  } else {
    log('yellow', '⚠️  Some tests failed. Check if ClawNet is running:\n');
    console.log('  cd E:\\github\\clawnet');
    console.log('  docker-compose up -d\n');
  }

  return results;
}

// Run tests
test()
  .then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    log('red', `\n❌ Test suite error: ${err.message}\n`);
    console.log('\nMake sure ClawNet is running:');
    console.log('  cd E:\\github\\clawnet');
    console.log('  docker-compose up -d\n');
    process.exit(1);
  });