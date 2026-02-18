/**
 * ClawNet HTTP & WebSocket API
 * RESTful API and real-time WebSocket for ClawNet mesh
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { v4 as uuid } from 'uuid';
import { Registry } from '@clawnet/registry';
import { MemoryStore } from '@clawnet/memory';
import type { Agent, AgentId, Message } from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface ApiServerConfig {
  /** Server port */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Redis URL */
  redisUrl?: string;
  /** Enable CORS */
  cors?: boolean;
  /** CORS origins */
  corsOrigins?: string[];
  /** JWT secret for auth */
  jwtSecret?: string;
  /** Enable debug logging */
  debug?: boolean;
}

interface WebSocketClient {
  id: string;
  agentId?: AgentId;
  socket: any;
  subscriptions: Set<string>;
}

// ============================================
// API SERVER
// ============================================

export class ApiServer {
  private config: Required<Omit<ApiServerConfig, 'corsOrigins'>> & { corsOrigins?: string[] };
  private fastify: ReturnType<typeof Fastify>;
  private registry: Registry;
  private memory: MemoryStore;
  private wsClients: Map<string, WebSocketClient> = new Map();
  private startTime: number = 0;

  constructor(config: ApiServerConfig = {}) {
    this.config = {
      port: config.port || 4000,
      host: config.host || '0.0.0.0',
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      cors: config.cors ?? true,
      corsOrigins: config.corsOrigins,
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'clawnet-secret',
      debug: config.debug || false,
    };

    this.fastify = Fastify({
      logger: this.config.debug,
    });

    this.registry = new Registry({
      redisUrl: this.config.redisUrl,
      debug: this.config.debug,
    });

    this.memory = new MemoryStore({
      redisUrl: this.config.redisUrl,
      debug: this.config.debug,
    });

    this.setupPlugins();
    this.setupRoutes();
    this.setupWebSockets();
  }

  // ============================================
  // SETUP
  // ============================================

  private async setupPlugins(): Promise<void> {
    // CORS
    if (this.config.cors) {
      await this.fastify.register(cors, {
        origin: this.config.corsOrigins || true,
      });
    }

    // WebSocket
    await this.fastify.register(websocket);
  }

  private setupRoutes(): void {
    // ============================================
    // HEALTH
    // ============================================

    this.fastify.get('/health', async () => ({
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
    }));

    // ============================================
    // AGENTS
    // ============================================

    // Register agent
    this.fastify.post('/api/v1/agents/register', async (request, reply) => {
      try {
        const body = request.body as any;
        const result = await this.registry.register(body);
        
        if (result.success) {
          // Notify WebSocket clients
          this.broadcast({
            type: 'event',
            event: 'agent.registered',
            data: { agentId: body.id },
          });
          
          return reply.status(201).send(result);
        }
        
        return reply.status(400).send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Unregister agent
    this.fastify.post('/api/v1/agents/unregister', async (request, reply) => {
      try {
        const body = request.body as any;
        const success = await this.registry.unregister(body.agentId);
        
        if (success) {
          this.broadcast({
            type: 'event',
            event: 'agent.unregistered',
            data: { agentId: body.agentId },
          });
        }
        
        return reply.send({ success });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Heartbeat
    this.fastify.post('/api/v1/agents/heartbeat', async (request, reply) => {
      try {
        const body = request.body as any;
        const success = await this.registry.heartbeat(body.agentId, body.status);
        return reply.send({ success });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Get agent
    this.fastify.get('/api/v1/agents/:id', async (request, reply) => {
      try {
        const params = request.params as any;
        const agent = await this.registry.get(params.id);
        
        if (!agent) {
          return reply.status(404).send({ error: 'Agent not found' });
        }
        
        return reply.send({ agent });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Query agents
    this.fastify.post('/api/v1/agents/query', async (request, reply) => {
      try {
        const body = request.body as any;
        const agents = await this.registry.query(body);
        return reply.send({ agents, total: agents.length });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // List all agents
    this.fastify.get('/api/v1/agents', async (request, reply) => {
      try {
        const agents = await this.registry.listAll();
        return reply.send({ agents, total: agents.length });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Agent stats
    this.fastify.get('/api/v1/agents/stats', async (request, reply) => {
      try {
        const stats = await this.registry.getStats();
        return reply.send(stats);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ============================================
    // MEMORY
    // ============================================

    // Write to memory
    this.fastify.post('/api/v1/memory/write', async (request, reply) => {
      try {
        const body = request.body as any;
        const entry = await this.memory.write({
          key: body.key,
          value: body.value,
          createdBy: body.createdBy || { id: 'api' },
          tags: body.tags,
          ttl: body.ttl,
        });
        
        // Notify subscribers
        this.broadcastToTopic('memory', {
          type: 'event',
          event: 'memory.written',
          data: { key: body.key, id: entry.id },
        });
        
        return reply.status(201).send({ id: entry.id, createdAt: entry.createdAt });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Read from memory
    this.fastify.get('/api/v1/memory/:key', async (request, reply) => {
      try {
        const params = request.params as any;
        const entry = await this.memory.getByKey(params.key);
        
        if (!entry) {
          return reply.status(404).send({ error: 'Entry not found' });
        }
        
        return reply.send({ entry });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Search memory
    this.fastify.post('/api/v1/memory/search', async (request, reply) => {
      try {
        const body = request.body as any;
        const result = await this.memory.search({
          key: body.key,
          tags: body.tags,
          searchText: body.searchText,
          limit: body.limit || 20,
          offset: body.offset || 0,
        });
        
        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Delete from memory
    this.fastify.delete('/api/v1/memory/:key', async (request, reply) => {
      try {
        const params = request.params as any;
        const success = await this.memory.deleteByKey(params.key);
        
        if (!success) {
          return reply.status(404).send({ error: 'Entry not found' });
        }
        
        this.broadcastToTopic('memory', {
          type: 'event',
          event: 'memory.deleted',
          data: { key: params.key },
        });
        
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // Memory stats
    this.fastify.get('/api/v1/memory/stats', async (request, reply) => {
      try {
        const stats = await this.memory.getStats();
        return reply.send(stats);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ============================================
    // MESSAGES
    // ============================================

    // Send message
    this.fastify.post('/api/v1/messages/send', async (request, reply) => {
      try {
        const body = request.body as any;
        
        // Add message ID and timestamp
        const message = {
          id: uuid(),
          timestamp: Date.now(),
          ...body,
        };
        
        // Broadcast to target
        if (body.to === 'broadcast') {
          this.broadcast(message);
        } else {
          this.sendToAgent(body.to, message);
        }
        
        return reply.status(202).send({ id: message.id, sent: true });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });

    // ============================================
    // STATS
    // ============================================

    this.fastify.get('/api/v1/stats', async (request, reply) => {
      try {
        const [agentStats, memoryStats] = await Promise.all([
          this.registry.getStats(),
          this.memory.getStats(),
        ]);
        
        return reply.send({
          agents: agentStats,
          memory: {
            totalEntries: memoryStats.totalEntries,
            totalTags: memoryStats.totalTags,
            topTags: memoryStats.topTags,
          },
          server: {
            uptime: Date.now() - this.startTime,
            wsConnections: this.wsClients.size,
          },
        });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    });
  }

  // ============================================
  // WEBSOCKET
  // ============================================

  private setupWebSockets(): void {
    this.fastify.register(async (fastify) => {
      // Main WebSocket endpoint
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        const clientId = uuid();
        const client: WebSocketClient = {
          id: clientId,
          socket: connection.socket,
          subscriptions: new Set(),
        };
        
        this.wsClients.set(clientId, client);
        this.log(`WebSocket client connected: ${clientId}`);
        
        // Send welcome message
        connection.socket.send(JSON.stringify({
          type: 'connected',
          clientId,
          timestamp: Date.now(),
        }));
        
        // Handle messages
        connection.socket.on('message', async (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleWsMessage(client, message);
          } catch (error: any) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              error: error.message,
            }));
          }
        });
        
        // Handle close
        connection.socket.on('close', () => {
          this.wsClients.delete(clientId);
          this.log(`WebSocket client disconnected: ${clientId}`);
        });
      });
    });
  }

  private async handleWsMessage(client: WebSocketClient, message: any): Promise<void> {
    switch (message.action) {
      case 'identify':
        client.agentId = message.agentId;
        client.socket.send(JSON.stringify({
          type: 'identified',
          agentId: message.agentId,
        }));
        break;
        
      case 'subscribe':
        if (message.topics) {
          for (const topic of message.topics) {
            client.subscriptions.add(topic);
          }
        }
        client.socket.send(JSON.stringify({
          type: 'subscribed',
          topics: Array.from(client.subscriptions),
        }));
        break;
        
      case 'unsubscribe':
        if (message.topics) {
          for (const topic of message.topics) {
            client.subscriptions.delete(topic);
          }
        }
        client.socket.send(JSON.stringify({
          type: 'unsubscribed',
          topics: Array.from(client.subscriptions),
        }));
        break;
        
      case 'heartbeat':
        if (client.agentId) {
          await this.registry.heartbeat(client.agentId, message.status || {});
        }
        client.socket.send(JSON.stringify({
          type: 'heartbeat_ack',
          timestamp: Date.now(),
        }));
        break;
        
      case 'message':
        if (message.to === 'broadcast') {
          this.broadcast(message);
        } else {
          this.sendToAgent(message.to, message);
        }
        break;
        
      default:
        client.socket.send(JSON.stringify({
          type: 'error',
          error: `Unknown action: ${message.action}`,
        }));
    }
  }

  // ============================================
  // BROADCASTING
  // ============================================

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    for (const client of this.wsClients.values()) {
      client.socket.send(data);
    }
  }

  broadcastToTopic(topic: string, message: any): void {
    const data = JSON.stringify(message);
    for (const client of this.wsClients.values()) {
      if (client.subscriptions.has(topic)) {
        client.socket.send(data);
      }
    }
  }

  sendToAgent(agentId: AgentId | string, message: any): void {
    const id = typeof agentId === 'string' ? agentId : agentId.id;
    const data = JSON.stringify(message);
    
    for (const client of this.wsClients.values()) {
      if (client.agentId?.id === id) {
        client.socket.send(data);
      }
    }
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async start(): Promise<void> {
    this.startTime = Date.now();
    
    // Start registry heartbeat checker
    this.registry.startHeartbeatChecker(30000);
    
    // Start server
    await this.fastify.listen({
      port: this.config.port,
      host: this.config.host,
    });
    
    this.log(`API Server started on http://${this.config.host}:${this.config.port}`);
    this.log(`WebSocket endpoint: ws://${this.config.host}:${this.config.port}/ws`);
  }

  async stop(): Promise<void> {
    // Stop heartbeat checker
    this.registry.stopHeartbeatChecker();
    
    // Close WebSocket connections
    for (const client of this.wsClients.values()) {
      client.socket.close();
    }
    this.wsClients.clear();
    
    // Close Redis connections
    await this.registry.close();
    await this.memory.close();
    
    // Close server
    await this.fastify.close();
    
    this.log('API Server stopped');
  }

  // ============================================
  // UTILITY
  // ============================================

  private log(message: string): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [API] ${message}`);
    }
  }
}

// ============================================
// CLI ENTRY
// ============================================

export async function main() {
  const server = new ApiServer({
    port: parseInt(process.env.CLAWNET_PORT || '4000'),
    host: process.env.CLAWNET_HOST || '0.0.0.0',
    redisUrl: process.env.REDIS_URL,
    debug: process.env.DEBUG === 'true',
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });

  await server.start();

  console.log('\nClawNet API Server running');
  console.log('Press Ctrl+C to stop\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}