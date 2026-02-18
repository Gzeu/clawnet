/**
 * ClawNet Server
 * Main server for running the ClawNet mesh
 */

import { Registry } from '@clawnet/registry';
import { MessageBus } from '@clawnet/message-bus';
import { MemoryStore } from '@clawnet/memory';
import type { Agent, AgentId } from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface ClawNetServerConfig {
  /** Port for HTTP API */
  port?: number;
  /** Redis URL */
  redisUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ServerStats {
  agents: {
    total: number;
    available: number;
    busy: number;
    offline: number;
  };
  memory: {
    totalEntries: number;
    totalTags: number;
  };
  uptime: number;
}

// ============================================
// CLAWNET SERVER
// ============================================

export class ClawNetServer {
  private config: Required<ClawNetServerConfig>;
  private registry: Registry;
  private memory: MemoryStore;
  private startTime: number = 0;

  constructor(config: ClawNetServerConfig = {}) {
    this.config = {
      port: config.port || 4000,
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      debug: config.debug || false,
    };

    this.registry = new Registry({
      redisUrl: this.config.redisUrl,
      debug: this.config.debug,
    });

    this.memory = new MemoryStore({
      redisUrl: this.config.redisUrl,
      debug: this.config.debug,
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async start(): Promise<void> {
    this.startTime = Date.now();
    
    // Start heartbeat checker
    this.registry.startHeartbeatChecker(30000);
    
    this.log(`ClawNet Server started`);
    this.log(`Registry: Ready`);
    this.log(`Memory: Ready`);
    this.log(`Port: ${this.config.port}`);
  }

  async stop(): Promise<void> {
    this.registry.stopHeartbeatChecker();
    await this.registry.close();
    await this.memory.close();
    
    this.log('ClawNet Server stopped');
  }

  // ============================================
  // REGISTRY OPERATIONS
  // ============================================

  async registerAgent(agent: Omit<Agent, 'status' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; token?: string; error?: string }> {
    return this.registry.register(agent);
  }

  async unregisterAgent(agentId: AgentId): Promise<boolean> {
    return this.registry.unregister(agentId);
  }

  async getAgent(agentId: AgentId | string): Promise<Agent | null> {
    return this.registry.get(agentId);
  }

  async findAgents(query: {
    skills?: string[];
    tools?: string[];
    domains?: string[];
    status?: string;
    maxLoad?: number;
    limit?: number;
  }): Promise<Agent[]> {
    return this.registry.query(query);
  }

  async heartbeat(agentId: AgentId, status: Partial<Agent['status']>): Promise<boolean> {
    return this.registry.heartbeat(agentId, status);
  }

  // ============================================
  // MEMORY OPERATIONS
  // ============================================

  async remember(key: string, value: unknown, options?: {
    agentId?: AgentId;
    tags?: string[];
    ttl?: number;
  }): Promise<{ id: string }> {
    const entry = await this.memory.write({
      key,
      value,
      createdBy: options?.agentId || { id: 'system' },
      tags: options?.tags,
      ttl: options?.ttl,
    });
    
    return { id: entry.id };
  }

  async recall(query: {
    key?: string;
    tags?: string[];
    searchText?: string;
    limit?: number;
  }): Promise<{ entries: Array<{ key: string; value: unknown; tags?: string[] }>; total: number }> {
    const result = await this.memory.search({
      key: query.key,
      tags: query.tags,
      searchText: query.searchText,
      limit: query.limit || 20,
    });
    
    return {
      entries: result.entries.map(e => ({
        key: e.key,
        value: e.value,
        tags: e.tags,
      })),
      total: result.total,
    };
  }

  async forget(key: string): Promise<boolean> {
    return this.memory.deleteByKey(key);
  }

  // ============================================
  // STATS
  // ============================================

  async getStats(): Promise<ServerStats> {
    const [agentStats, memoryStats] = await Promise.all([
      this.registry.getStats(),
      this.memory.getStats(),
    ]);
    
    return {
      agents: agentStats,
      memory: {
        totalEntries: memoryStats.totalEntries,
        totalTags: memoryStats.totalTags,
      },
      uptime: Date.now() - this.startTime,
    };
  }

  // ============================================
  // UTILITY
  // ============================================

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ClawNet] ${message}`);
  }

  // ============================================
  // HEALTH CHECK
  // ============================================

  async healthCheck(): Promise<{ status: string; uptime: number }> {
    return {
      status: 'healthy',
      uptime: Date.now() - this.startTime,
    };
  }
}

// ============================================
// CLI ENTRY POINT
// ============================================

export async function main() {
  const server = new ClawNetServer({
    port: parseInt(process.env.CLAWNET_PORT || '4000'),
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

  // Keep process alive
  console.log('\nClawNet Mesh Server running');
  console.log('Press Ctrl+C to stop\n');

  // Print stats periodically
  setInterval(async () => {
    const stats = await server.getStats();
    console.log(`Stats: ${stats.agents.total} agents, ${stats.memory.totalEntries} memories, uptime: ${Math.round(stats.uptime / 1000)}s`);
  }, 60000);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}