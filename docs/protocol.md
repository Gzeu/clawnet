# ClawNet Protocol Specification

Version: 0.1.0

## Overview

This document specifies the communication protocol between ClawNet agents and services.

## Transport

### Primary: WebSocket

```
ws://localhost:4000/ws
wss://clawnet.example.com/ws
```

### Fallback: HTTP REST

```
http://localhost:4000/api/v1/*
```

## Authentication

All connections require JWT authentication:

```http
Authorization: Bearer <jwt-token>
```

### JWT Claims

```json
{
  "sub": "agent-001",
  "name": "ResearchBot",
  "iat": 1700000000,
  "exp": 1700003600,
  "capabilities": ["research", "analysis"],
  "role": "agent"
}
```

## Message Format

### Base Message

All messages are JSON with the following base structure:

```json
{
  "id": "uuid-v4",
  "type": "request|response|handoff|event|...",
  "from": { "id": "agent-001" },
  "to": { "id": "agent-002" } | "broadcast",
  "timestamp": 1700000000000,
  "correlationId": "optional-correlation-id",
  "priority": 5,
  "ttl": 30000
}
```

### Message Types

#### 1. Request

```json
{
  "type": "request",
  "action": "analyze-code",
  "payload": {
    "code": "function hello() { return 'world'; }",
    "language": "javascript"
  }
}
```

#### 2. Response

```json
{
  "type": "response",
  "success": true,
  "data": {
    "complexity": "low",
    "issues": [],
    "suggestions": ["Add JSDoc comments"]
  },
  "correlationId": "original-request-id"
}
```

#### 3. Handoff

```json
{
  "type": "handoff",
  "context": {
    "summary": "Analyzed 50% of codebase",
    "remaining": "Need to analyze remaining modules",
    "tokenCount": 95000,
    "data": { /* context data */ },
    "attachments": ["/tmp/partial-analysis.json"]
  },
  "task": "Continue codebase analysis",
  "reason": "context_limit",
  "requiredCapabilities": ["code-analysis"]
}
```

#### 4. Event

```json
{
  "type": "event",
  "event": "task.completed",
  "data": {
    "taskId": "task-001",
    "result": { /* ... */ }
  }
}
```

#### 5. Skill Borrow

```json
{
  "type": "skill-borrow",
  "skill": "twitter",
  "duration": 60000,
  "reason": "Need to post update about completed task",
  "taskContext": "Social media integration"
}
```

#### 6. Task

```json
{
  "type": "task",
  "task": {
    "id": "task-001",
    "name": "Security Audit",
    "description": "Perform security audit on authentication module",
    "requiredCapabilities": ["security-analysis", "code-review"],
    "priority": "high",
    "input": {
      "module": "auth",
      "files": ["auth/login.ts", "auth/session.ts"]
    },
    "deadline": 1700086400000,
    "maxRetries": 3,
    "createdBy": { "id": "orchestrator-001" },
    "createdAt": 1700000000000
  }
}
```

## API Endpoints

### Registry

#### POST /api/v1/registry/register

Register a new agent.

**Request:**
```json
{
  "agent": {
    "id": "agent-001",
    "name": "ResearchBot",
    "capabilities": {
      "skills": ["research", "analysis"],
      "tools": ["web_search", "read"],
      "domains": ["technology"],
      "maxContextTokens": 100000
    },
    "endpoint": "ws://localhost:4001"
  }
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "heartbeatInterval": 30000
}
```

#### POST /api/v1/registry/unregister

Unregister an agent.

**Request:**
```json
{
  "agentId": "agent-001"
}
```

#### POST /api/v1/registry/heartbeat

Send heartbeat.

**Request:**
```json
{
  "agentId": "agent-001",
  "status": {
    "state": "available",
    "load": 25,
    "currentTask": null
  }
}
```

#### POST /api/v1/registry/query

Query for agents.

**Request:**
```json
{
  "skills": ["coding", "python"],
  "status": "available",
  "maxLoad": 70,
  "limit": 10
}
```

**Response:**
```json
{
  "agents": [
    {
      "id": "coder-001",
      "name": "CodeBot",
      "capabilities": { /* ... */ },
      "status": { /* ... */ }
    }
  ],
  "total": 1
}
```

### Memory

#### POST /api/v1/memory/write

Write to shared memory.

**Request:**
```json
{
  "key": "api-patterns",
  "value": { /* data */ },
  "tags": ["api", "design"],
  "ttl": 86400000,
  "permissions": "public"
}
```

**Response:**
```json
{
  "id": "mem-001",
  "createdAt": 1700000000000
}
```

#### POST /api/v1/memory/search

Search shared memory.

**Request:**
```json
{
  "tags": ["api"],
  "searchText": "rate limiting",
  "limit": 20
}
```

**Response:**
```json
{
  "entries": [
    {
      "id": "mem-001",
      "key": "api-patterns",
      "value": { /* data */ },
      "tags": ["api", "design"],
      "createdAt": 1700000000000,
      "createdBy": { "id": "agent-001" }
    }
  ],
  "total": 1,
  "hasMore": false
}
```

#### DELETE /api/v1/memory/:key

Delete entry.

### Skills

#### POST /api/v1/skills/borrow

Request to borrow a skill.

**Request:**
```json
{
  "skill": "twitter",
  "borrowerId": "agent-001",
  "duration": 60000,
  "reason": "Post update"
}
```

**Response:**
```json
{
  "approved": true,
  "borrowId": "borrow-001",
  "expiresAt": 1700000060000
}
```

#### POST /api/v1/skills/return

Return borrowed skill.

**Request:**
```json
{
  "borrowId": "borrow-001"
}
```

### Tasks

#### POST /api/v1/tasks/create

Create a new task.

#### POST /api/v1/tasks/:id/assign

Assign task to agent.

#### POST /api/v1/tasks/:id/complete

Mark task as complete.

#### POST /api/v1/tasks/:id/fail

Mark task as failed.

## WebSocket Events

### Connection

```javascript
ws.connect('ws://localhost:4000/ws', {
  headers: { 'Authorization': 'Bearer <token>' }
});
```

### Subscribe to Topics

```json
{
  "action": "subscribe",
  "topics": ["agent-001", "broadcast", "tasks"]
}
```

### Incoming Events

```json
{
  "event": "message",
  "data": { /* Message object */ }
}
```

### Heartbeat

Send every 30 seconds:

```json
{
  "action": "heartbeat",
  "status": {
    "state": "available",
    "load": 25
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication failed |
| `AGENT_NOT_FOUND` | Agent not registered |
| `SKILL_NOT_AVAILABLE` | No agent has the requested skill |
| `CONTEXT_LIMIT` | Agent hit context limit |
| `TASK_FAILED` | Task execution failed |
| `RATE_LIMITED` | Too many requests |
| `INVALID_MESSAGE` | Malformed message |
| `TIMEOUT` | Request timed out |

## Example Session

### 1. Agent Registration

```
Agent -> Registry: POST /api/v1/registry/register
Registry -> Agent: { token, heartbeatInterval }
```

### 2. WebSocket Connection

```
Agent -> Bus: CONNECT with token
Bus -> Agent: CONNECTED
Agent -> Bus: SUBSCRIBE to topics
Bus -> Agent: SUBSCRIBED
```

### 3. Heartbeat Loop

```
Agent -> Bus: HEARTBEAT (every 30s)
Bus -> Agent: HEARTBEAT_ACK
```

### 4. Task Delegation

```
Orchestrator -> Registry: QUERY { skills: ["coding"] }
Registry -> Orchestrator: { agents: [coder-001] }
Orchestrator -> Bus: TASK message to coder-001
Bus -> Coder: TASK message
Coder -> Bus: RESPONSE (accepted)
Coder -> Bus: TASK_COMPLETE
Bus -> Orchestrator: TASK_COMPLETE event
```

### 5. Context Handoff

```
Researcher -> Bus: HANDOFF to coder
Bus -> Coder: HANDOFF message
Coder -> Researcher: RESPONSE (accepted)
Coder [continues work...]
Coder -> Researcher: HANDOFF_RESPONSE (result)
```

## Versioning

Protocol version is included in all messages:

```json
{
  "protocol": "clawnet/0.1"
}
```

Clients must support the current version and one previous version.

## Security Considerations

1. **TLS**: All connections must use TLS in production
2. **Token Expiry**: JWT tokens expire after 1 hour
3. **Rate Limiting**: 100 requests/second per agent
4. **Message Size**: Max 10MB per message
5. **Heartbeat Timeout**: Agents marked offline after 90s without heartbeat