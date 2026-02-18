/**
 * ClawNet Memory
 * Shared memory store for agent knowledge mesh
 */

import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import type {
  AgentId,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
} from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface MemoryConfig {
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
  /** Default TTL in milliseconds */
  defaultTtl?: number;
  /** Maximum entries per agent */
  maxEntriesPerAgent?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface WriteOptions {
  /** Key for the entry */
  key: string;
  /** Value to store */
  value: unknown;
  /** Created by agent */
  createdBy: AgentId;
  /** Tags for categorization */
  tags?: string[];
  /** TTL in milliseconds */
  ttl?: number;
  /** Access permissions */
  permissions?: 'public' | 'private' | 'restricted';
  /** Allowed agents for restricted access */
  allowedAgents?: string[];
}

// ============================================
// MEMORY STORE
// ============================================

export class MemoryStore {
  private config: Required<MemoryConfig>;
  private redis: Redis;

  // Redis key prefixes
  private readonly PREFIX_ENTRY = 'clawnet:mem:entry:';
  private readonly PREFIX_KEY = 'clawnet:mem:key:';
  private readonly PREFIX_TAG = 'clawnet:mem:tag:';
  private readonly PREFIX_AGENT = 'clawnet:mem:agent:';
  private readonly SET_ALL = 'clawnet:mem:all';

  constructor(config: MemoryConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      redisHost: config.redisHost || 'localhost',
      redisPort: config.redisPort || 6379,
      redisPassword: config.redisPassword || '',
      redisDb: config.redisDb || 0,
      defaultTtl: config.defaultTtl || 86400000, // 24 hours
      maxEntriesPerAgent: config.maxEntriesPerAgent || 1000,
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
  // WRITE
  // ============================================

  /**
   * Write to memory
   */
  async write(options: WriteOptions): Promise<MemoryEntry> {
    const id = uuid();
    const now = Date.now();
    const ttl = options.ttl || this.config.defaultTtl;

    // Check agent limit
    const agentCount = await this.redis.zcard(this.PREFIX_AGENT + options.createdBy.id);
    if (agentCount >= this.config.maxEntriesPerAgent) {
      // Remove oldest entry
      const oldest = await this.redis.zrange(this.PREFIX_AGENT + options.createdBy.id, 0, 0);
      if (oldest.length > 0) {
        await this.delete(oldest[0]);
      }
    }

    const entry: MemoryEntry = {
      id,
      key: options.key,
      value: options.value,
      createdBy: options.createdBy,
      createdAt: now,
      ttl,
      tags: options.tags || [],
      permissions: options.permissions || 'public',
      allowedAgents: options.allowedAgents,
    };

    // Store entry
    const entryKey = this.PREFIX_ENTRY + id;
    await this.redis.set(entryKey, JSON.stringify(entry), 'PX', ttl);

    // Index by key
    await this.redis.set(this.PREFIX_KEY + options.key, id, 'PX', ttl);

    // Index by tags
    if (options.tags) {
      for (const tag of options.tags) {
        await this.redis.sadd(this.PREFIX_TAG + tag, id);
        await this.redis.expire(this.PREFIX_TAG + tag, Math.ceil(ttl / 1000));
      }
    }

    // Index by agent
    await this.redis.zadd(this.PREFIX_AGENT + options.createdBy.id, now, id);

    // Add to all entries
    await this.redis.zadd(this.SET_ALL, now, id);

    this.log(`Wrote entry ${id} with key "${options.key}"`);
    return entry;
  }

  /**
   * Update existing entry
   */
  async update(id: string, updates: Partial<Pick<MemoryEntry, 'value' | 'tags' | 'ttl'>>): Promise<MemoryEntry | null> {
    const entry = await this.get(id);
    if (!entry) return null;

    const updated: MemoryEntry = {
      ...entry,
      value: updates.value !== undefined ? updates.value : entry.value,
      tags: updates.tags || entry.tags,
      ttl: updates.ttl || entry.ttl,
    };

    // Update entry
    await this.redis.set(this.PREFIX_ENTRY + id, JSON.stringify(updated), 'PX', updated.ttl);

    // Update tag indices if tags changed
    if (updates.tags) {
      // Remove from old tags
      for (const tag of entry.tags || []) {
        await this.redis.srem(this.PREFIX_TAG + tag, id);
      }
      // Add to new tags
      for (const tag of updates.tags) {
        await this.redis.sadd(this.PREFIX_TAG + tag, id);
      }
    }

    this.log(`Updated entry ${id}`);
    return updated;
  }

  // ============================================
  // READ
  // ============================================

  /**
   * Get entry by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    const data = await this.redis.get(this.PREFIX_ENTRY + id);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get entry by key
   */
  async getByKey(key: string): Promise<MemoryEntry | null> {
    const id = await this.redis.get(this.PREFIX_KEY + key);
    if (!id) return null;
    return this.get(id);
  }

  /**
   * Get multiple entries by IDs
   */
  async getMany(ids: string[]): Promise<MemoryEntry[]> {
    if (ids.length === 0) return [];
    
    const entries = await Promise.all(ids.map(id => this.get(id)));
    return entries.filter((e): e is MemoryEntry => e !== null);
  }

  // ============================================
  // DELETE
  // ============================================

  /**
   * Delete entry by ID
   */
  async delete(id: string): Promise<boolean> {
    const entry = await this.get(id);
    if (!entry) return false;

    // Remove from all indices
    await this.redis.del(this.PREFIX_ENTRY + id);
    await this.redis.del(this.PREFIX_KEY + entry.key);

    // Remove from tags
    for (const tag of entry.tags || []) {
      await this.redis.srem(this.PREFIX_TAG + tag, id);
    }

    // Remove from agent index
    await this.redis.zrem(this.PREFIX_AGENT + entry.createdBy.id, id);

    // Remove from all entries
    await this.redis.zrem(this.SET_ALL, id);

    this.log(`Deleted entry ${id}`);
    return true;
  }

  /**
   * Delete entry by key
   */
  async deleteByKey(key: string): Promise<boolean> {
    const id = await this.redis.get(this.PREFIX_KEY + key);
    if (!id) return false;
    return this.delete(id);
  }

  /**
   * Delete all entries by agent
   */
  async deleteByAgent(agentId: AgentId): Promise<number> {
    const ids = await this.redis.zrange(this.PREFIX_AGENT + agentId.id, 0, -1);
    await Promise.all(ids.map(id => this.delete(id)));
    return ids.length;
  }

  // ============================================
  // SEARCH
  // ============================================

  /**
   * Search memory
   */
  async search(query: MemoryQuery): Promise<MemorySearchResult> {
    let entryIds: string[] = [];

    // Search by key pattern
    if (query.key) {
      const id = await this.redis.get(this.PREFIX_KEY + query.key);
      if (id) entryIds = [id];
    }
    // Search by tags
    else if (query.tags && query.tags.length > 0) {
      // Get entries that have ALL tags
      const tagSets = await Promise.all(
        query.tags.map(tag => this.redis.smembers(this.PREFIX_TAG + tag))
      );
      entryIds = this.intersect(tagSets);
    }
    // Search by creator
    else if (query.createdBy) {
      entryIds = await this.redis.zrange(
        this.PREFIX_AGENT + query.createdBy,
        0, -1,
        'REV'// Newest first
      );
    }
    // Get all entries
    else {
      entryIds = await this.redis.zrange(this.SET_ALL, 0, -1, 'REV');
    }

    // Get entries
    let entries = await this.getMany(entryIds);

    // Filter by search text
    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      entries = entries.filter(entry => {
        const valueStr = JSON.stringify(entry.value).toLowerCase();
        return valueStr.includes(searchLower) ||
          entry.key.toLowerCase().includes(searchLower);
      });
    }

    // Apply pagination
    const total = entries.length;
    const offset = query.offset || 0;
    const limit = query.limit || 20;
    const paginatedEntries = entries.slice(offset, offset + limit);

    return {
      entries: paginatedEntries,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Find entries by tag
   */
  async findByTag(tag: string): Promise<MemoryEntry[]> {
    const ids = await this.redis.smembers(this.PREFIX_TAG + tag);
    return this.getMany(ids);
  }

  /**
   * Find entries by agent
   */
  async findByAgent(agentId: AgentId): Promise<MemoryEntry[]> {
    const ids = await this.redis.zrange(this.PREFIX_AGENT + agentId.id, 0, -1, 'REV');
    return this.getMany(ids);
  }

  // ============================================
  // STATS
  // ============================================

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalTags: number;
    entriesByAgent: Record<string, number>;
    topTags: Array<{ tag: string; count: number }>;
  }> {
    const totalEntries = await this.redis.zcard(this.SET_ALL);

    // Get all tags
    const tagKeys = await this.redis.keys(this.PREFIX_TAG + '*');
    const tags = tagKeys.map(k => k.replace(this.PREFIX_TAG, ''));
    
    // Get tag counts
    const tagCounts = await Promise.all(
      tags.map(async tag => ({
        tag,
        count: await this.redis.scard(this.PREFIX_TAG + tag),
      }))
    );
    
    // Sort by count
    tagCounts.sort((a, b) => b.count - a.count);

    return {
      totalEntries,
      totalTags: tags.length,
      entriesByAgent: {}, // Would need to scan all agent keys
      topTags: tagCounts.slice(0, 10),
    };
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    // Redis TTL handles expiration automatically
    // This method can be used for manual cleanup if needed
    let cleaned = 0;

    // Check for entries without TTL
    const ids = await this.redis.zrange(this.SET_ALL, 0, -1);
    for (const id of ids) {
      const ttl = await this.redis.pttl(this.PREFIX_ENTRY + id);
      if (ttl === -1) {
        // No TTL, set default
        const entry = await this.get(id);
        if (entry) {
          await this.redis.expire(
            this.PREFIX_ENTRY + id,
            Math.ceil(this.config.defaultTtl / 1000)
          );
        }
      }
    }

    this.log(`Cleanup completed, cleaned ${cleaned} entries`);
    return cleaned;
  }

  /**
   * Clear all memory
   */
  async clear(): Promise<void> {
    const keys = await this.redis.keys('clawnet:mem:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    this.log('Memory cleared');
  }

  // ============================================
  // UTILITY
  // ============================================

  private intersect(arrays: string[][]): string[] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];
    
    return arrays[0].filter(item => 
      arrays.every(arr => arr.includes(item))
    );
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[Memory] ${message}`);
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.log('Memory store closed');
  }
}

// ============================================
// EXPORTS
// ============================================

export default MemoryStore;