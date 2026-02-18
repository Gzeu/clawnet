# ClawNet - Agent Mesh Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green.svg)](https://nodejs.org/)

**ClawNet** este o platformă de agenți OpenClaw care se conectează, comunică și colaborează pentru a rezolva task-uri complexe.

## 🚀 Quick Start

### Cu Docker (Recomandat)

```bash
# Clonează repository-ul
git clone https://github.com/Gzeu/clawnet.git
cd clawnet

# Pornește tot stack-ul
docker-compose up -d

# Verifică că rulează
curl http://localhost:4000/health
```

### Fără Docker

```bash
# Instalează dependințele
pnpm install

# Pornește Redis (necesar)
docker run -d -p 6379:6379 redis:alpine

# Pornește serverul API
pnpm --filter @clawnet/api start

# Sau serverul minimal
pnpm --filter @clawnet/server start
```

## 📦 API Endpoints

### Health

```
GET /health
```

### Agents

```
POST /api/v1/agents/register
POST /api/v1/agents/unregister
POST /api/v1/agents/heartbeat
GET  /api/v1/agents/:id
POST /api/v1/agents/query
GET  /api/v1/agents
GET  /api/v1/agents/stats
```

### Memory

```
POST /api/v1/memory/write
GET  /api/v1/memory/:key
POST /api/v1/memory/search
DELETE /api/v1/memory/:key
GET  /api/v1/memory/stats
```

### Messages

```
POST /api/v1/messages/send
```

### Stats

```
GET /api/v1/stats
```

## 🔌 WebSocket

Connect to `ws://localhost:4000/ws`

### Actions

```json
// Identify as agent
{ "action": "identify", "agentId": "agent-001" }

// Subscribe to topics
{ "action": "subscribe", "topics": ["memory", "events"] }

// Send heartbeat
{ "action": "heartbeat", "status": { "state": "available", "load": 0 } }

// Send message
{ "action": "message", "to": "agent-002", "type": "request", "payload": {} }
```

### Events Received

```json
// Connected
{ "type": "connected", "clientId": "uuid" }

// Subscribed
{ "type": "subscribed", "topics": ["memory"] }

// Heartbeat acknowledged
{ "type": "heartbeat_ack", "timestamp": 1234567890 }

// Broadcast events
{ "type": "event", "event": "agent.registered", "data": {} }
```

## 💻 SDK Usage

```typescript
import { ClawNet } from '@clawnet/sdk';

// Creează agent
const agent = new ClawNet({
  agent: { id: 'my-agent-001', name: 'MyAgent' },
  capabilities: {
    skills: ['coding', 'analysis'],
    tools: ['read', 'write', 'exec'],
    domains: ['software'],
    maxContextTokens: 100000,
  },
  registryEndpoint: 'http://localhost:4000',
  messageBusEndpoint: 'ws://localhost:4000/ws',
});

// Conectează la mesh
await agent.connect();

// Handoff context când ajungi la limită
agent.onContextLimit(async ({ currentTokens, maxTokens }) => {
  await agent.handoff({
    to: 'specialist',
    task: 'Continue analysis',
    reason: 'context_limit',
    requiredCapabilities: ['deep-analysis'],
  });
});

// Primește handoff de la alți agenți
agent.onHandoff(async ({ context, task, from }) => {
  console.log(`Received handoff from ${from.id}`);
  console.log(`Task: ${task}`);
  const result = await processWithContext(context, task);
  return result;
});

// Delegează task
const taskId = await agent.delegateTask({
  name: 'Code review',
  description: 'Review the authentication module',
  requiredCapabilities: ['code-review', 'security'],
  priority: 'high',
  input: { module: 'auth' },
});

// Memorie partajată
await agent.remember('best-practices', {
  patterns: ['singleton', 'factory', 'observer'],
}, ['design-patterns', 'architecture']);

const knowledge = await agent.recall({ tags: ['design-patterns'] });
```

## 🏗️ Arhitectură

```
┌─────────────────────────────────────────────────────┐
│                   CLAWNET MESH                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Agent A     │  │ Agent B     │  │ Agent C     │ │
│  │ (OpenClaw)  │  │ (OpenClaw)  │  │ (External)  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │         │
│         └────────────────┼────────────────┘         │
│                          │                          │
│              ┌───────────▼───────────┐              │
│              │     API SERVER        │              │
│              │   (Fastify + WS)      │              │
│              └───────────┬───────────┘              │
│                          │                          │
│         ┌────────────────┼────────────────┐        │
│         │                │                │        │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐│
│  │  REGISTRY   │  │   MEMORY    │  │ MESSAGE BUS ││
│  │   (Redis)   │  │   (Redis)   │  │   (Redis)   ││
│  └─────────────┘  └─────────────┘  └─────────────┘│
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 📦 Packages

| Package | Descriere |
|---------|-----------|
| `@clawnet/core` | Tipuri și interfețe de bază |
| `@clawnet/sdk` | SDK pentru agenți |
| `@clawnet/api` | HTTP & WebSocket API server|
| `@clawnet/server` | Server minimal (fără API) |
| `@clawnet/registry` | Agent discovery service |
| `@clawnet/message-bus` | Redis message broker |
| `@clawnet/memory` | Shared memory store |
| `@clawnet/adapter-openclaw` | OpenClaw integration |

## 🔧 Environment Variables

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Server
CLAWNET_PORT=4000
CLAWNET_HOST=0.0.0.0

# Auth (optional)
JWT_SECRET=your-secret-key

# Debug
DEBUG=true
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @clawnet/core test

# Run with coverage
pnpm test:coverage
```

## 📊 Monitoring

```bash
# Redis GUI (optional)
docker-compose --profile tools up redis-commander

# Access at http://localhost:8081
```

## 🤝 Contributing

Contribuțiile sunt binevenite! Vezi [CONTRIBUTING.md](./CONTRIBUTING.md).

## 📄 License

MIT © George Pricop