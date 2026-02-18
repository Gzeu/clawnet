#!/usr/bin/env node

/**
 * ClawNet CLI Tool
 * Manage agents, memory, and messages from command line
 */

const Redis = require('ioredis');
const readline = require('readline');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class ClawNetCLI {
  constructor() {
    this.redis = new Redis(REDIS_URL);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async close() {
    await this.redis.quit();
    this.rl.close();
  }

  // ============================================
  // AGENTS
  // ============================================

  async registerAgent(id, name, skills) {
    const agent = {
      id,
      name,
      capabilities: { skills: skills.split(','), tools: [], domains: [] },
      status: { state: 'available', load: 0, lastHeartbeat: Date.now() }
    };
    
    await this.redis.hset(`clawnet:agent:${id}`, 'data', JSON.stringify(agent));
    await this.redis.sadd('clawnet:agents', id);
    
    for (const skill of agent.capabilities.skills) {
      await this.redis.sadd(`clawnet:skill:${skill.trim()}`, id);
    }
    
    console.log(`✅ Agent registered: ${id}`);
    return agent;
  }

  async listAgents() {
    const agentIds = await this.redis.smembers('clawnet:agents');
    console.log(`\n📋 Agents (${agentIds.length}):\n`);
    
    for (const id of agentIds) {
      const data = await this.redis.hget(`clawnet:agent:${id}`, 'data');
      if (data) {
        const agent = JSON.parse(data);
        console.log(`  ${agent.status.state === 'available' ? '🟢' : '🔴'} ${id}`);
        console.log(`     Name: ${agent.name}`);
        console.log(`     Skills: ${agent.capabilities.skills.join(', ')}`);
        console.log(`     Status: ${agent.status.state}`);
        console.log('');
      }
    }
  }

  async findAgents(skill) {
    const agentIds = await this.redis.smembers(`clawnet:skill:${skill}`);
    console.log(`\n🔍 Agents with skill "${skill}" (${agentIds.length}):\n`);
    
    for (const id of agentIds) {
      const data = await this.redis.hget(`clawnet:agent:${id}`, 'data');
      if (data) {
        const agent = JSON.parse(data);
        console.log(`  ${agent.status.state === 'available' ? '🟢' : '🔴'} ${id} - ${agent.name}`);
      }
    }
  }

  async unregisterAgent(id) {
    const data = await this.redis.hget(`clawnet:agent:${id}`, 'data');
    if (data) {
      const agent = JSON.parse(data);
      for (const skill of agent.capabilities.skills) {
        await this.redis.srem(`clawnet:skill:${skill.trim()}`, id);
      }
    }
    
    await this.redis.del(`clawnet:agent:${id}`);
    await this.redis.srem('clawnet:agents', id);
    console.log(`✅ Agent unregistered: ${id}`);
  }

  // ============================================
  // MEMORY
  // ============================================

  async setMemory(key, value, tags = []) {
    const entry = {
      key,
      value,
      tags,
      createdAt: Date.now()
    };
    
    await this.redis.setex(`clawnet:memory:${key}`, 86400, JSON.stringify(entry));
    
    for (const tag of tags) {
      await this.redis.sadd(`clawnet:memory:tag:${tag}`, key);
    }
    
    console.log(`✅ Memory stored: ${key}`);
    return entry;
  }

  async getMemory(key) {
    const data = await this.redis.get(`clawnet:memory:${key}`);
    if (data) {
      const entry = JSON.parse(data);
      console.log(`\n📖 Memory: ${key}\n`);
      console.log(JSON.stringify(entry, null, 2));
      return entry;
    }
    console.log(`❌ Memory not found: ${key}`);
    return null;
  }

  async searchMemory(tag) {
    const keys = await this.redis.smembers(`clawnet:memory:tag:${tag}`);
    console.log(`\n🔍 Memory with tag "${tag}" (${keys.length}):\n`);
    
    for (const key of keys) {
      const data = await this.redis.get(`clawnet:memory:${key}`);
      if (data) {
        const entry = JSON.parse(data);
        console.log(`  📄 ${key}: ${JSON.stringify(entry.value).substring(0, 50)}...`);
      }
    }
  }

  // ============================================
  // MESSAGES
  // ============================================

  async sendMessage(from, to, type, data) {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await this.redis.xadd('clawnet:messages', '*', {
      id,
      type,
      from,
      to,
      data,
      timestamp: Date.now().toString()
    });
    console.log(`✅ Message sent: ${type} from ${from} to ${to}`);
  }

  async listMessages(count = 10) {
    const messages = await this.redis.xrevrange('clawnet:messages', '+', '-', count);
    console.log(`\n📨 Recent messages (${messages.length}):\n`);
    
    for (const [id, fields] of messages) {
      const data = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      console.log(`  ${data.type}: ${data.from} → ${data.to}`);
      console.log(`     ID: ${id}`);
      console.log(`     Data: ${data.data}`);
      console.log('');
    }
  }

  // ============================================
  // STATS
  // ============================================

  async stats() {
    const agents = await this.redis.scard('clawnet:agents');
    const messages = await this.redis.xlen('clawnet:messages');
    const memoryKeys = await this.redis.keys('clawnet:memory:*');
    const skillKeys = await this.redis.keys('clawnet:skill:*');
    
    console.log('\n📊 ClawNet Stats:\n');
    console.log(`  Agents:      ${agents}`);
    console.log(`  Messages:    ${messages}`);
    console.log(`  Memories:    ${memoryKeys.length}`);
    console.log(`  Skills:      ${skillKeys.length}`);
    console.log('');
  }

  // ============================================
  // CLEAR
  // ============================================

  async clearAll() {
    const keys = await this.redis.keys('clawnet:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(`✅ Cleared ${keys.length} keys`);
    } else {
      console.log('No keys to clear');
    }
  }
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const cli = new ClawNetCLI();
  
  try {
    const command = args[0];
    const subcommand = args[1];
    
    switch (command) {
      case 'agent':
        switch (subcommand) {
          case 'register':
            await cli.registerAgent(args[2], args[3], args[4] || '');
            break;
          case 'list':
            await cli.listAgents();
            break;
          case 'find':
            await cli.findAgents(args[2]);
            break;
          case 'unregister':
            await cli.unregisterAgent(args[2]);
            break;
          default:
            console.log('Usage: clawnet agent <register|list|find|unregister>');
        }
        break;
        
      case 'memory':
        switch (subcommand) {
          case 'set':
            await cli.setMemory(args[2], args[3], args[4]?.split(',') || []);
            break;
          case 'get':
            await cli.getMemory(args[2]);
            break;
          case 'search':
            await cli.searchMemory(args[2]);
            break;
          default:
            console.log('Usage: clawnet memory <set|get|search>');
        }
        break;
        
      case 'message':
        switch (subcommand) {
          case 'send':
            await cli.sendMessage(args[2], args[3], args[4], args[5] || '');
            break;
          case 'list':
            await cli.listMessages(parseInt(args[2]) || 10);
            break;
          default:
            console.log('Usage: clawnet message <send|list>');
        }
        break;
        
      case 'stats':
        await cli.stats();
        break;
        
      case 'clear':
        await cli.clearAll();
        break;
        
      case 'ping':
        const pong = await cli.redis.ping();
        console.log(`Redis: ${pong}`);
        break;
        
      default:
        console.log(`
🦞 ClawNet CLI

Usage:
  clawnet agent register <id> <name> <skills>   Register an agent
  clawnet agent list                             List all agents
  clawnet agent find <skill>                     Find agents by skill
  clawnet agent unregister <id>                  Unregister an agent

  clawnet memory set <key> <value> <tags>        Store in memory
  clawnet memory get <key>                       Get from memory
  clawnet memory search <tag>                    Search by tag

  clawnet message send <from> <to> <type> <data> Send a message
  clawnet message list [count]                   List recent messages

  clawnet stats                                  Show stats
  clawnet clear                                  Clear all data
  clawnet ping                                   Test Redis connection
`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await cli.close();
  }
}

main();