/**
 * OpenClaw Adapter for ClawNet
 * Enables ClawNet agents to communicate with OpenClaw sessions
 */

import type { 
  Agent, 
  AgentId, 
  AgentCapabilities,
  Message,
  TaskExecution,
  HandoffMessage,
} from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface OpenClawConfig {
  /** Gateway URL */
  gatewayUrl?: string;
  /** Gateway token */
  gatewayToken?: string;
  /** Session key for the agent */
  sessionKey?: string;
  /** Agent label for identification */
  label?: string;
  /** Model to use for this agent */
  model?: string;
}

export interface OpenClawAgentConfig {
  /** OpenClaw connection config */
  openclaw: OpenClawConfig;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Agent identity */
  identity: AgentId;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface HandoffRequest {
  /** Context to transfer */
  context: string;
  /** Task for receiving agent */
  task: string;
  /** Required capabilities */
  requiredCapabilities?: string[];
  /** Reason for handoff */
  reason: 'context_limit' | 'specialization' | 'user_request';
}

// ============================================
// OPENCLAW AGENT ADAPTER
// ============================================

export class OpenClawAgent {
  private config: OpenClawAgentConfig;
  private agent: Agent;
  private tools: Map<string, ToolDefinition> = new Map();
  private isConnected: boolean = false;
  private messageHandlers: Map<string, (msg: Message) => Promise<unknown>> = new Map();

  constructor(config: OpenClawAgentConfig) {
    this.config = config;
    
    this.agent = {
      ...config.identity,
      capabilities: config.capabilities,
      status: {
        state: 'offline',
        lastHeartbeat: Date.now(),
        load: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async connect(): Promise<void> {
    // In production, this would connect to ClawNet mesh
    // For now, we simulate connection
    this.agent.status.state = 'available';
    this.isConnected = true;
    console.log(`[OpenClawAgent:${this.agent.id}] Connected`);
  }

  async disconnect(): Promise<void> {
    this.agent.status.state = 'offline';
    this.isConnected = false;
    console.log(`[OpenClawAgent:${this.agent.id}] Disconnected`);
  }

  // ============================================
  // TOOLS REGISTRATION
  // ============================================

  /**
   * Register a tool that this agent can execute
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    console.log(`[OpenClawAgent:${this.agent.id}] Registered tool: ${tool.name}`);
  }

  /**
   * Get all registered tools in OpenClaw format
   */
  getTools(): Array<{name: string; description: string; parameters: Record<string, unknown>}> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    this.agent.status.state = 'busy';
    this.agent.status.load = 100;
    
    try {
      const result = await tool.handler(params);
      return result;
    } finally {
      this.agent.status.state = 'available';
      this.agent.status.load = 0;
    }
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  /**
   * Register handler for incoming messages
   */
  onMessage(type: string, handler: (msg: Message) => Promise<unknown>): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Handle incoming message from OpenClaw
   */
  async handleMessage(msg: Message): Promise<unknown> {
    const handler = this.messageHandlers.get(msg.type);
    if (handler) {
      return handler(msg);
    }
    
    // Default handlers
    switch (msg.type) {
      case 'request':
        return this.handleRequest(msg);
      case 'handoff':
        return this.handleHandoff(msg as HandoffMessage);
      case 'task':
        return this.handleTask(msg as any);
      default:
        throw new Error(`Unknown message type: ${msg.type}`);
    }
  }

  private async handleRequest(msg: Message): Promise<unknown> {
    const request = msg as any;
    
    if (request.action === 'execute-tool') {
      const { tool, params } = request.payload as { tool: string; params: Record<string, unknown> };
      return this.executeTool(tool, params);
    }
    
    throw new Error(`Unknown action: ${request.action}`);
  }

  private async handleHandoff(msg: HandoffMessage): Promise<unknown> {
    console.log(`[OpenClawAgent:${this.agent.id}] Received handoff from ${msg.from.id}`);
    console.log(`  Context: ${msg.context.summary}`);
    console.log(`  Task: ${msg.task}`);
    
    // Process handoff - in production, this would be handled by the agent's logic
    return {
      received: true,
      contextTokens: msg.context.tokenCount,
      task: msg.task,
    };
  }

  private async handleTask(msg: { task: TaskExecution }): Promise<unknown> {
    const { task } = msg;
    
    console.log(`[OpenClawAgent:${this.agent.id}] Received task: ${task.name}`);
    console.log(`  Priority: ${task.priority}`);
    console.log(`  Input:`, task.input);
    
    // Execute task based on capabilities
    // In production, this would invoke the appropriate tool or logic
    
    return {
      taskId: task.id,
      status: 'completed',
      result: 'Task processed successfully',
    };
  }

  // ============================================
  // CLAWNET OPERATIONS
  // ============================================

  /**
   * Handoff context to another agent
   */
  async handoff(request: HandoffRequest): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    console.log(`[OpenClawAgent:${this.agent.id}] Initiating handoff`);
    console.log(`  Reason: ${request.reason}`);
    console.log(`  Required capabilities: ${request.requiredCapabilities?.join(', ') || 'any'}`);
    
    // In production, send to ClawNet mesh
    // For now, log the handoff request
  }

  /**
   * Find agents with specific capabilities
   */
  async findAgents(capabilities: string[]): Promise<Agent[]> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    // In production, query ClawNet registry
    // For now, return empty array
    return [];
  }

  /**
   * Delegate task to another agent
   */
  async delegateTask(task: {
    name: string;
    description: string;
    requiredCapabilities: string[];
    input: unknown;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  }): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    console.log(`[OpenClawAgent:${this.agent.id}] Delegating task: ${task.name}`);
    
    // In production, send to ClawNet task queue
    // Return task ID for tracking
    return `task-${Date.now()}`;
  }

  /**
   * Store knowledge in shared memory
   */
  async remember(key: string, value: unknown, tags?: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    console.log(`[OpenClawAgent:${this.agent.id}] Storing memory: ${key}`);
    console.log(`  Tags: ${tags?.join(', ') || 'none'}`);
    
    // In production, store in ClawNet shared memory
  }

  /**
   * Recall knowledge from shared memory
   */
  async recall(query: {
    key?: string;
    tags?: string[];
    searchText?: string;
  }): Promise<unknown[]> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    console.log(`[OpenClawAgent:${this.agent.id}] Recalling memory`);
    
    // In production, query ClawNet shared memory
    return [];
  }

  /**
   * Borrow a skill from another agent
   */
  async borrowSkill(skill: string, duration: number, reason: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Agent not connected to ClawNet');
    }
    
    console.log(`[OpenClawAgent:${this.agent.id}] Borrowing skill: ${skill}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Reason: ${reason}`);
    
    // In production, request from ClawNet skill marketplace
    return true;
  }

  // ============================================
  // OPENCLAW INTEGRATION
  // ============================================

  /**
   * Get agent status for OpenClaw heartbeat
   */
  getStatus(): Agent['status'] {
    return { ...this.agent.status };
  }

  /**
   * Get agent info
   */
  getInfo(): Agent {
    return { ...this.agent };
  }

  /**
   * Update context token count (for handoff decisions)
   */
  updateContextTokens(tokens: number): void {
    if (tokens >= this.agent.capabilities.maxContextTokens * 0.9) {
      console.warn(`[OpenClawAgent:${this.agent.id}] Context limit approaching: ${tokens}/${this.agent.capabilities.maxContextTokens}`);
    }
  }
}

// ============================================
// PRE-BUILT AGENT TYPES
// ============================================

/**
 * Create a Researcher agent
 */
export function createResearcherAgent(id: string, config?: Partial<OpenClawConfig>): OpenClawAgent {
  return new OpenClawAgent({
    identity: { id, name: 'Researcher' },
    capabilities: {
      skills: ['web-search', 'document-analysis', 'summarization', 'fact-checking'],
      tools: ['web_search', 'web_fetch', 'read', 'write'],
      domains: ['general', 'technology', 'science', 'business'],
      maxContextTokens: 100000,
    },
    openclaw: config || {},
  });
}

/**
 * Create a Coder agent
 */
export function createCoderAgent(id: string, config?: Partial<OpenClawConfig>): OpenClawAgent {
  return new OpenClawAgent({
    identity: { id, name: 'Coder' },
    capabilities: {
      skills: ['coding', 'debugging', 'refactoring', 'code-review', 'testing'],
      tools: ['read', 'write', 'edit', 'exec', 'browser'],
      domains: ['software', 'web', 'backend', 'frontend'],
      maxContextTokens: 150000,
    },
    openclaw: config || {},
  });
}

/**
 * Create an Analyzer agent
 */
export function createAnalyzerAgent(id: string, config?: Partial<OpenClawConfig>): OpenClawAgent {
  return new OpenClawAgent({
    identity: { id, name: 'Analyzer' },
    capabilities: {
      skills: ['data-analysis', 'visualization', 'statistics', 'reporting'],
      tools: ['read', 'exec', 'write'],
      domains: ['data', 'analytics', 'business'],
      maxContextTokens: 80000,
    },
    openclaw: config || {},
  });
}

/**
 * Create a Writer agent
 */
export function createWriterAgent(id: string, config?: Partial<OpenClawConfig>): OpenClawAgent {
  return new OpenClawAgent({
    identity: { id, name: 'Writer' },
    capabilities: {
      skills: ['writing', 'editing', 'translation', 'summarization'],
      tools: ['read', 'write', 'edit'],
      domains: ['content', 'documentation', 'marketing'],
      maxContextTokens: 60000,
    },
    openclaw: config || {},
  });
}

/**
 * Create an Orchestrator agent
 */
export function createOrchestratorAgent(id: string, config?: Partial<OpenClawConfig>): OpenClawAgent {
  return new OpenClawAgent({
    identity: { id, name: 'Orchestrator' },
    capabilities: {
      skills: ['task-decomposition', 'agent-coordination', 'workflow-management', 'planning'],
      tools: ['memory', 'message', 'session'],
      domains: ['orchestration', 'coordination'],
      maxContextTokens: 50000,
    },
    openclaw: config || {},
  });
}