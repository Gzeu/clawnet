import { describe, it, expect, beforeEach } from 'vitest';
import {
  OpenClawAgent,
  createResearcherAgent,
  createCoderAgent,
  createOrchestratorAgent,
} from '../src/index';

describe('OpenClawAgent', () => {
  let agent: OpenClawAgent;

  beforeEach(() => {
    agent = createResearcherAgent('test-agent');
  });

  describe('lifecycle', () => {
    it('should create agent with correct identity', () => {
      const info = agent.getInfo();
      expect(info.id).toBe('test-agent');
      expect(info.name).toBe('Researcher');
    });

    it('should start offline', () => {
      const status = agent.getStatus();
      expect(status.state).toBe('offline');
    });

    it('should connect and become available', async () => {
      await agent.connect();
      const status = agent.getStatus();
      expect(status.state).toBe('available');
    });

    it('should disconnect and become offline', async () => {
      await agent.connect();
      await agent.disconnect();
      const status = agent.getStatus();
      expect(status.state).toBe('offline');
    });
  });

  describe('tools', () => {
    it('should register tools', async () => {
      agent.registerTool({
        name: 'test-tool',
        description: 'A test tool',
        parameters: {},
        handler: async () => 'result',
      });

      const tools = agent.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
    });

    it('should execute tools', async () => {
      agent.registerTool({
        name: 'echo',
        description: 'Echo tool',
        parameters: {},
        handler: async (params) => params,
      });

      await agent.connect();
      const result = await agent.executeTool('echo', { message: 'hello' });
      expect(result).toEqual({ message: 'hello' });
    });

    it('should throw for unknown tool', async () => {
      await agent.connect();
      await expect(agent.executeTool('unknown', {})).rejects.toThrow('Tool not found');
    });

    it('should update status during tool execution', async () => {
      let statusDuringExecution: string | undefined;
      
      agent.registerTool({
        name: 'slow-tool',
        description: 'Slow tool',
        parameters: {},
        handler: async () => {
          statusDuringExecution = agent.getStatus().state;
          return 'done';
        },
      });

      await agent.connect();
      await agent.executeTool('slow-tool', {});
      
      expect(statusDuringExecution).toBe('busy');
    });
  });

  describe('handoff', () => {
    it('should initiate handoff', async () => {
      await agent.connect();
      
      await expect(agent.handoff({
        context: 'Test context',
        task: 'Test task',
        reason: 'context_limit',
      })).resolves.not.toThrow();
    });

    it('should throw when not connected', async () => {
      await expect(agent.handoff({
        context: 'Test',
        task: 'Task',
        reason: 'context_limit',
      })).rejects.toThrow('not connected');
    });
  });

  describe('task delegation', () => {
    it('should delegate task', async () => {
      await agent.connect();
      
      const taskId = await agent.delegateTask({
        name: 'Test task',
        description: 'A test task',
        requiredCapabilities: ['test'],
        input: { foo: 'bar' },
      });
      
      expect(taskId).toMatch(/^task-/);
    });

    it('should throw when not connected', async () => {
      await expect(agent.delegateTask({
        name: 'Test',
        description: 'Test',
        requiredCapabilities: [],
        input: {},
      })).rejects.toThrow('not connected');
    });
  });

  describe('memory', () => {
    it('should store and retrieve memory', async () => {
      await agent.connect();
      
      await agent.remember('test-key', { data: 'test' }, ['tag1']);
      
      // In production, this would retrieve from shared memory
      const results = await agent.recall({ key: 'test-key' });
      expect(results).toEqual([]);
    });

    it('should throw when not connected', async () => {
      await expect(agent.remember('key', {})).rejects.toThrow('not connected');
      await expect(agent.recall({})).rejects.toThrow('not connected');
    });
  });

  describe('skill borrowing', () => {
    it('should borrow skill', async () => {
      await agent.connect();
      
      const approved = await agent.borrowSkill('twitter', 60000, 'Need to post');
      expect(approved).toBe(true);
    });

    it('should throw when not connected', async () => {
      await expect(agent.borrowSkill('skill', 1000, 'reason')).rejects.toThrow('not connected');
    });
  });

  describe('context tracking', () => {
    it('should track context tokens', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      await agent.connect();
      
      // Under 90% - no warning
      agent.updateContextTokens(50000);
      expect(consoleSpy).not.toHaveBeenCalled();
      
      // Over 90% - should warn
      agent.updateContextTokens(95000);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});

describe('Agent Factory Functions', () => {
  it('should create researcher agent', () => {
    const agent = createResearcherAgent('researcher-01');
    const info = agent.getInfo();
    
    expect(info.name).toBe('Researcher');
    expect(info.capabilities.skills).toContain('web-search');
    expect(info.capabilities.maxContextTokens).toBe(100000);
  });

  it('should create coder agent', () => {
    const agent = createCoderAgent('coder-01');
    const info = agent.getInfo();
    
    expect(info.name).toBe('Coder');
    expect(info.capabilities.skills).toContain('coding');
    expect(info.capabilities.maxContextTokens).toBe(150000);
  });

  it('should create orchestrator agent', () => {
    const agent = createOrchestratorAgent('orchestrator-01');
    const info = agent.getInfo();
    
    expect(info.name).toBe('Orchestrator');
    expect(info.capabilities.skills).toContain('task-decomposition');
    expect(info.capabilities.maxContextTokens).toBe(50000);
  });
});

// Import vi for mocking
import { vi } from 'vitest';