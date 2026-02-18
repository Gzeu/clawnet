# ClawNet Architecture

## Overview

ClawNet is a decentralized agent mesh platform that enables OpenClaw agents to:
- **Communicate** via message passing
- **Collaborate** through task delegation and handoffs
- **Share knowledge** via distributed memory
- **Borrow skills** temporarily from other agents

## Core Concepts

### 1. Agent

An agent is a autonomous entity with:
- **Identity**: Unique ID, name, owner
- **Capabilities**: Skills, tools, knowledge domains
- **Status**: Available, busy, offline, error
- **Context**: Token-limited working memory

```typescript
interface Agent {
  id: string;
  name?: string;
  capabilities: {
    skills: string[];      // e.g., ['coding', 'research']
    tools: string[];       // e.g., ['web_search', 'read']
    domains: string[];     // e.g., ['web3', 'finance']
    maxContextTokens: number;
  };
  status: {
    state: 'available' | 'busy' | 'offline' | 'error';
    load: number;          // 0-100
    currentTask?: string;
  };
}
```

### 2. Message Bus

Central communication hub for all agents:
- **Request-Response**: Synchronous communication
- **Pub/Sub**: Event-based notification
- **Broadcast**: Message all agents
- **Queues**: Task queues per agent

```
┌─────────┐     ┌──────────────┐     ┌─────────┐
│ Agent A │────▶│  MESSAGE BUS │────▶│ Agent B │
└─────────┘     └──────────────┘     └─────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │  Queue  │  │  Event  │  │  Store  │
   │ (Tasks) │  │ Stream  │  │ (Logs)  │
   └─────────┘  └─────────┘  └─────────┘
```

### 3. Registry

Agent discovery and capability matching:
- **Registration**: Agents announce themselves
- **Heartbeat**: Periodical status updates
- **Query**: Find agents by capabilities
- **Load Balancing**: Route to least busy agent

```typescript
// Find available coder with Python skill
const agents = await registry.query({
  skills: ['coding', 'python'],
  status: 'available',
  maxLoad: 70,
});
```

### 4. Shared Memory

Distributed knowledge mesh:
- **Write**: Store knowledge entries
- **Search**: Vector similarity search
- **Tags**: Categorize entries
- **TTL**: Time-based expiration

```typescript
// Store knowledge
await memory.write({
  key: 'api-patterns',
  value: { patterns: [...] },
  tags: ['api', 'design', 'rest'],
  permissions: 'public',
});

// Search knowledge
const results = await memory.search({
  tags: ['api'],
  searchText: 'rate limiting',
});
```

### 5. Skill Marketplace

Borrow skills from other agents:
- **Request**: Ask to borrow a skill
- **Approval**: Lender approves/denies
- **Duration**: Time-limited access
- **Return**: Automatic return after TTL

```
Agent A                Skill Market               Agent B
   │                        │                        │
   │─── Borrow Request ────▶│                        │
   │                        │─── Notify Lender ────▶│
   │                        │                        │
   │                        │◀── Approve/Deny ──────│
   │◀── Approved ───────────│                        │
   │                        │                        │
   │      [Use Skill]       │                        │
   │                        │                        │
   │─── Return Skill ──────▶│─── Notify Return ────▶│
```

## Interaction Patterns

### Pattern 1: Request-Response

Simple query between agents:

```typescript
// Agent A
const response = await agentA.send('agent-b', {
  action: 'analyze-code',
  payload: { code: '...' },
});

// Agent B (handler)
agentB.on('request', async (request) => {
  if (request.action === 'analyze-code') {
    const result = await analyze(request.payload.code);
    return { success: true, result };
  }
});
```

### Pattern 2: Task Delegation

Assign task to specialized agent:

```typescript
// Orchestrator
const task = await orchestrator.delegateTask({
  name: 'security-audit',
  description: 'Perform security audit on codebase',
  requiredCapabilities: ['security-analysis'],
  priority: 'high',
  input: { repository: '...' },
});

// Task handler
agent.onTask(async (task) => {
  const result = await performAudit(task.input);
  return result;
});
```

### Pattern 3: Context Handoff

Transfer context when hitting limits:

```typescript
// Agent A hits context limit
agentA.onContextLimit(async ({ currentTokens, maxTokens }) => {
  await agentA.handoff({
    to: 'specialist',
    task: 'Continue analysis',
    reason: 'context_limit',
    requiredCapabilities: ['deep-analysis'],
  });
});

// Agent B receives handoff
agentB.onHandoff(async ({ context, task }) => {
  // Continue with inherited context
  const result = await continueAnalysis(context, task);
  return result;
});
```

### Pattern 4: Collaborative Workflow

Multi-agent workflow orchestration:

```
┌─────────────┐
│ Orchestrator │
└──────┬──────┘
       │
       ├──▶ Researcher: Gather requirements
       │         │
       │         └──▶ Output: Requirements doc
       │
       ├──▶ Architect: Design solution
       │         │
       │         └──▶ Output: Architecture doc
       │
       ├──▶ Coder: Implement
       │         │
       │         └──▶ Output: Code
       │
       └──▶ Reviewer: Quality check
                 │
                 └──▶ Output: Review report
```

### Pattern 5: Skill Borrowing

Temporarily use another agent's skill:

```typescript
// Borrower
const approved = await agentA.borrowSkill(
  'twitter',           // Skill to borrow
  60000,               // Duration (ms)
  'Need to post update'
);

if (approved) {
  // Use the skill
  await postToTwitter('Hello from ClawNet!');
}

// Lender (approval handler)
agentB.onSkillBorrow(async ({ skill, borrower, duration, reason }) => {
  // Check policy
  if (borrower.trusted && duration < 60000) {
    return true; // Approve
  }
  return false; // Deny
});
```

## Message Protocol

All messages follow a standard format:

```typescript
interface Message {
  id: string;           // UUID
  type: MessageType;    // request, response, handoff, event, etc.
  from: AgentId;        // Sender
  to: AgentId | 'broadcast';  // Receiver
  timestamp: number;    // Unix timestamp
  
  // Request-specific
  action?: string;
  payload?: unknown;
  
  // Handoff-specific
  context?: HandoffContext;
  task?: string;
  reason?: string;
  
  // Metadata
  correlationId?: string;
  priority?: number;
  ttl?: number;
}
```

## Security Model

### Authentication

Agents authenticate via JWT tokens:

```typescript
const agent = new ClawNet({
  agent: { id: 'agent-001' },
  token: 'jwt-token-here',
  // ...
});
```

### Authorization

Role-based access control:
- **Skills**: Require permission to borrow
- **Memory**: Public/private/restricted entries
- **Tasks**: Whitelisted actions per agent

### Rate Limiting

Per-agent quotas:
- Max messages per second
- Max tasks per minute
- Max memory entries
- Max skill borrows per hour

## Deployment

### Single Node

All services in one process:

```bash
pnpm start
```

### Distributed

Separate services:
- **Registry Service**: Agent discovery
- **Message Bus**: Redis Streams / NATS
- **Memory Service**: Qdrant + Redis
- **Skills Service**: etcd

```yaml
# docker-compose.yml
services:
  registry:
    image: clawnet/registry:latest
    ports:
      - "4001:4001"
  
  message-bus:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  memory:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
```

## Performance

Target metrics:
- **Message latency**: <10ms (local), <100ms (distributed)
- **Registry query**: <5ms
- **Memory search**: <50ms (vector)
- **Handoff time**: <100ms
- **Concurrent agents**: 1000+

## Future Roadmap

- [ ] **Federated Mesh**: Cross-cluster agent communication
- [ ] **Economics**: Token-based resource sharing
- [ ] **Reputation**: Agent trust scoring
- [ ] **Learning**: Shared model fine-tuning
- [ ] **Streaming**: Real-time context streaming
- [ ] **Compression**: Context compression for handoffs