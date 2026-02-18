/**
 * ClawNet Registry
 * Agent discovery and registration service
 */

import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import type {
  Agent,
  AgentId,
  AgentStatus,
  AgentCapabilities,
  RegistryQuery,
} from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface RegistryConfig {
  /** Redis connection URL */
  redisUrl?: string;
  /** Redis host */
  redisHost?: string;
  /** Redis port */
  redisPort?: number;
  /** Redis password */
  redisPassword?: string;
  /** Redis database */
  redisDb?: number;
  /** Heartbeat timeout in milliseconds */
  heartbeatTimeout?: number;
  /** Token expiration in milliseconds */
  tokenExpiration?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface RegistrationResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface AgentRecord {
  agent: Agent;
  token: string;
  registeredAt: number;
  lastHeartbeat: number;
}

// ============================================
// REGISTRY
// ============================================

export class Registry {
  private config: Required<RegistryConfig>;
  private redis: Redis;
  private heartbeatChecker?: ReturnType<typeof setInterval>;

  // Redis key prefixes
  private readonly PREFIX_AGENT = 'clawnet:agent:';
  private readonly PREFIX_TOKEN = 'clawnet:token:';
  private readonly PREFIX_SKILL = 'clawnet:skill:';
  private readonly PREFIX_DOMAIN = 'clawnet:domain:';
  private readonly PREFIX_TOOL = 'clawnet:tool:';
  private readonly PREFIX_STATUS = 'clawnet:status:';
  private readonly SET_AGENTS = 'clawnet:agents';

  constructor(config: RegistryConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      redisHost: config.redisHost || 'localhost',
      redisPort: config.redisPort || 6379,
      redisPassword: config.redisPassword || '',
      redisDb: config.redisDb || 0,
      heartbeatTimeout: config.heartbeatTimeout || 90000, // 90 seconds
      tokenExpiration: config.tokenExpiration || 3600000, // 1 hour
      debug: config.debug || false,
    };

    this.redis = new Redis(this.config.redisUrl || {
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword || undefined,
      db: this.config.redisDb,
    });
  }

  // ============================================
  // REGISTRATION
  // ============================================

  /**
   * Register a new agent
   */
  async register(agentData: Omit<Agent, 'status' | 'createdAt' | 'updatedAt'>): Promise<RegistrationResult> {
    const agentId = agentData.id;
    
    // Check if already registered
    const existing = await this.get(agentId);
    if (existing) {
      return { success: false, error: 'Agent already registered' };
    }

    // Generate auth token
    const token = this.generateToken();
    
    // Create agent record
    const now = Date.now();
    const agent: Agent = {
      ...agentData,
      status: {
        state: 'available',
        load: 0,
        lastHeartbeat: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    // Store agent
    await this.storeAgent(agent, token);

    // Index by capabilities
    await this.indexAgentCapabilities(agent);

    this.log(`Agent registered: ${agentId.id} (${agent.name || 'unnamed'})`);

    return {
      success: true,
      token,
    };
  }

  /**
   * Unregister an agent
   */
  async unregister(agentId: AgentId): Promise<boolean> {
    const agent = await this.get(agentId);
    if (!agent) return false;

    // Remove from indices
    await this.removeAgentFromIndices(agent);

    // Remove agent record
    await this.redis.del(this.PREFIX_AGENT + agentId.id);
    await this.redis.del(this.PREFIX_TOKEN + agentId.id);
    await this.redis.srem(this.SET_AGENTS, agentId.id);

    this.log(`Agent unregistered: ${agentId.id}`);
    return true;
  }

  /**
   * Get agent by ID
   */
  async get(agentId: AgentId | string): Promise<Agent | null> {
    const id = typeof agentId === 'string' ? agentId : agentId.id;
    const data = await this.redis.get(this.PREFIX_AGENT + id);
    
    if (!data) return null;
    
    const record: AgentRecord = JSON.parse(data);
    return record.agent;
  }

  /**
   * Validate auth token
   */
  async validateToken(agentId: AgentId, token: string): Promise<boolean> {
    const stored = await this.redis.get(this.PREFIX_TOKEN + agentId.id);
    return stored === token;
  }

  // ============================================
  // HEARTBEAT
  // ============================================

  /**
   * Update agent heartbeat
   */
  async heartbeat(agentId: AgentId, status: Partial<AgentStatus>): Promise<boolean> {
    const agent = await this.get(agentId);
    if (!agent) return false;

    const now = Date.now();
    agent.status = {
      ...agent.status,
      ...status,
      lastHeartbeat: now,
    };
    agent.updatedAt = now;

    // Update status index
    await this.redis.hset(this.PREFIX_STATUS, agentId.id, agent.status.state);

    // Update stored agent
    const data = await this.redis.get(this.PREFIX_AGENT + agentId.id);
    if (data) {
      const record: AgentRecord = JSON.parse(data);
      record.agent = agent;
      record.lastHeartbeat = now;
      await this.redis.set(this.PREFIX_AGENT + agentId.id, JSON.stringify(record));
    }

    return true;
  }

  /**
   * Start heartbeat checker (marks agents offline if no heartbeat)
   */
  startHeartbeatChecker(intervalMs: number = 30000): void {
    this.heartbeatChecker = setInterval(async () => {
      await this.checkHeartbeats();
    }, intervalMs);
  }

  /**
   * Stop heartbeat checker
   */
  stopHeartbeatChecker(): void {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
      this.heartbeatChecker = undefined;
    }
  }

  private async checkHeartbeats(): Promise<void> {
    const now = Date.now();
    const agents = await this.listAll();

    for (const agent of agents) {
      const timeSinceHeartbeat = now - agent.status.lastHeartbeat;
      
      if (timeSinceHeartbeat > this.config.heartbeatTimeout) {
        // Mark as offline
        if (agent.status.state !== 'offline') {
          agent.status.state = 'offline';
          await this.redis.hset(this.PREFIX_STATUS, agent.id.id, 'offline');
          this.log(`Agent marked offline: ${agent.id.id} (no heartbeat for ${timeSinceHeartbeat}ms)`);
        }
      }
    }
  }

  // ============================================
  // DISCOVERY
  // ============================================

  /**
   * Query agents by capabilities
   */
  async query(query: RegistryQuery): Promise<Agent[]> {
    let agentIds: string[] = [];

    // Query by skills
    if (query.skills && query.skills.length > 0) {
      const skillSets = await Promise.all(
        query.skills.map(skill => this.redis.smembers(this.PREFIX_SKILL + skill))
      );
      agentIds = this.intersect(skillSets);
    } else {
      // Get all agents
      agentIds = await this.redis.smembers(this.SET_AGENTS);
    }

    // Filter by tools
    if (query.tools && query.tools.length > 0) {
      const toolSets = await Promise.all(
        query.tools.map(tool => this.redis.smembers(this.PREFIX_TOOL + tool))
      );
      const toolAgents = this.intersect(toolSets);
      agentIds = agentIds.filter(id => toolAgents.includes(id));
    }

    // Filter by domains
    if (query.domains && query.domains.length > 0) {
      const domainSets = await Promise.all(
        query.domains.map(domain => this.redis.smembers(this.PREFIX_DOMAIN + domain))
      );
      const domainAgents = this.intersect(domainSets);
      agentIds = agentIds.filter(id => domainAgents.includes(id));
    }

    // Get agents
    const agents = await Promise.all(
      agentIds.map(id => this.get(id))
    );

    // Filter by status
    let results = agents.filter((a): a is Agent => a !== null);
    
    if (query.status) {
      results = results.filter(a => a.status.state === query.status);
    }

    // Filter by max load
    if (query.maxLoad !== undefined) {
      results = results.filter(a => a.status.load <= query.maxLoad!);
    }

    // Sort by load (least loaded first)
    results.sort((a, b) => a.status.load - b.status.load);

    // Limit results
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * List all agents
   */
  async listAll(): Promise<Agent[]> {
    const agentIds = await this.redis.smembers(this.SET_AGENTS);
    const agents = await Promise.all(
      agentIds.map(id => this.get(id))
    );
    return agents.filter((a): a is Agent => a !== null);
  }

  /**
   * List agents by status
   */
  async listByStatus(status: AgentStatus['state']): Promise<Agent[]> {
    const agents = await this.listAll();
    return agents.filter(a => a.status.state === status);
  }

  // ============================================
  // STATUS
  // ============================================

  /**
   * Update agent status
   */
  async updateStatus(agentId: AgentId, status: Partial<AgentStatus>): Promise<boolean> {
    return this.heartbeat(agentId, status);
  }

  /**
   * Get agent status
   */
  async getStatus(agentId: AgentId): Promise<AgentStatus | null> {
    const agent = await this.get(agentId);
    return agent?.status || null;
  }

  /**
   * Get mesh statistics
   */
  async getStats(): Promise<{
    total: number;
    available: number;
    busy: number;
    offline: number;
    error: number;
  }> {
    const agents = await this.listAll();
    
    return {
      total: agents.length,
      available: agents.filter(a => a.status.state === 'available').length,
      busy: agents.filter(a => a.status.state === 'busy').length,
      offline: agents.filter(a => a.status.state === 'offline').length,
      error: agents.filter(a => a.status.state === 'error').length,
    };
  }

  // ============================================
  // STORAGE HELPERS
  // ============================================

  private async storeAgent(agent: Agent, token: string): Promise<void> {
    const now = Date.now();
    const record: AgentRecord = {
      agent,
      token,
      registeredAt: now,
      lastHeartbeat: now,
    };

    // Store agent
    await this.redis.set(
      this.PREFIX_AGENT + agent.id.id,
      JSON.stringify(record)
    );

    // Store token
    await this.redis.set(
      this.PREFIX_TOKEN + agent.id.id,
      token,
      'PX',
      this.config.tokenExpiration
    );

    // Add to agents set
    await this.redis.sadd(this.SET_AGENTS, agent.id.id);

    // Set status
    await this.redis.hset(this.PREFIX_STATUS, agent.id.id, agent.status.state);
  }

  private async indexAgentCapabilities(agent: Agent): Promise<void> {
    const id = agent.id.id;

    // Index by skills
    for (const skill of agent.capabilities.skills) {
      await this.redis.sadd(this.PREFIX_SKILL + skill, id);
    }

    // Index by tools
    for (const tool of agent.capabilities.tools) {
      await this.redis.sadd(this.PREFIX_TOOL + tool, id);
    }

    // Index by domains
    for (const domain of agent.capabilities.domains) {
      await this.redis.sadd(this.PREFIX_DOMAIN + domain, id);
    }
  }

  private async removeAgentFromIndices(agent: Agent): Promise<void> {
    const id = agent.id.id;

    // Remove from skill indices
    for (const skill of agent.capabilities.skills) {
      await this.redis.srem(this.PREFIX_SKILL + skill, id);
    }

    // Remove from tool indices
    for (const tool of agent.capabilities.tools) {
      await this.redis.srem(this.PREFIX_TOOL + tool, id);
    }

    // Remove from domain indices
    for (const domain of agent.capabilities.domains) {
      await this.redis.srem(this.PREFIX_DOMAIN + domain, id);
    }

    // Remove from status index
    await this.redis.hdel(this.PREFIX_STATUS, id);
  }

  // ============================================
  // UTILITY
  // ============================================

  private generateToken(): string {
    return `clawnet_${uuid().replace(/-/g, '')}`;
  }

  private intersect(arrays: string[][]): string[] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];
    
    return arrays[0].filter(item => 
      arrays.every(arr => arr.includes(item))
    );
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[Registry] ${message}`);
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Close connection
   */
  async close(): Promise<void> {
    this.stopHeartbeatChecker();
    await this.redis.quit();
    this.log('Registry closed');
  }
}

// ============================================
// EXPORTS
// ============================================

export default Registry;