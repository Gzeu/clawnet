/**
 * ClawNet SDK
 * Agent Mesh Platform for OpenClaw
 */

import {v4 as uuid} from 'uuid';
import EventEmitter from 'eventemitter3';
import type {
  Agent,
  AgentCapabilities,
  AgentId,
  AgentStatus,
  ClawNetConfig,
  HandoffMessage,
  Message,
  RequestMessage,
  ResponseMessage,
  SkillBorrowMessage,
  TaskDefinition,
  TaskExecution,
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  RegistryQuery,
  Event,
  EventType,
  ClawNetError,
  ContextLimitError,
} from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface ClawNetEvents {
  'message': (message: Message) => void;
  'request': (request: RequestMessage) => void;
  'handoff': (handoff: HandoffMessage) => void;
  'event': (event: Event) => void;
  'skill-borrow': (borrow: SkillBorrowMessage) => void;
  'task': (task: TaskExecution) => void;
  'context-limit': (info: { currentTokens: number; maxTokens: number }) => void;
  'error': (error: Error) => void;
  'connected': () => void;
  'disconnected': () => void;
}

export interface HandoffContext {
  /** Summary of work done */
  summary: string;
  /** Remaining work */
  remaining: string;
  /** Token count */
  tokenCount: number;
  /** Raw context data */
  data?: unknown;
  /** Attachments */
  attachments?: string[];
}

export interface HandoffOptions {
  /** Target agent or role */
  to: string | AgentId;
  /** Task for receiving agent */
  task: string;
  /** Reason for handoff */
  reason: HandoffMessage['reason'];
  /** Required capabilities */
  requiredCapabilities?: string[];
}

// ============================================
// CLAWNET CLIENT
// ============================================

export class ClawNet extends EventEmitter<ClawNetEvents> {
  private config: ClawNetConfig;
  private agent: Agent;
  private messageBus: MessageBusClient;
  private registry: RegistryClient;
  private memory: MemoryClient;
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private currentContextTokens: number = 0;

  constructor(config: ClawNetConfig) {
    super();
    
    this.config = {
      heartbeatInterval: 30000,
      requestTimeout: 30000,
      maxRetries: 3,
      debug: false,
      ...config,
    };

    this.agent = {
      ...config.agent,
      capabilities: config.capabilities,
      status: {
        state: 'available',
        lastHeartbeat: Date.now(),
        load: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Initialize clients
    this.messageBus = new MessageBusClient(this.config.messageBusEndpoint);
    this.registry = new RegistryClient(this.config.registryEndpoint);
    this.memory = new MemoryClient(this.config.memoryEndpoint);

    this.setupMessageHandlers();
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async connect(): Promise<void> {
    // Register with registry
    await this.registry.register(this.agent);
    
    // Connect to message bus
    await this.messageBus.connect(this.agent.id);
    
    // Start heartbeat
    this.startHeartbeat();
    
    this.emit('connected');
    this.log('Connected to ClawNet mesh');
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    await this.messageBus.disconnect();
    await this.registry.unregister(this.agent.id);
    this.emit('disconnected');
    this.log('Disconnected from ClawNet mesh');
  }

  // ============================================
  // MESSAGING
  // ============================================

  async send(to: AgentId | string, message: Omit<RequestMessage, 'id' | 'from' | 'to' | 'type' | 'timestamp'>): Promise<ResponseMessage> {
    const request: RequestMessage = {
      id: uuid(),
      type: 'request',
      from: this.agent.id,
      to: typeof to === 'string' ? { id: to } : to,
      timestamp: Date.now(),
      ...message,
    };

    const response = await this.messageBus.request(request);
    return response as ResponseMessage;
  }

  async broadcast(message: Omit<Message, 'id' | 'from' | 'to' | 'timestamp'>): Promise<void> {
    const msg: Message = {
      id: uuid(),
      from: this.agent.id,
      to: 'broadcast',
      timestamp: Date.now(),
      ...message,
    } as Message;

    await this.messageBus.broadcast(msg);
  }

  // ============================================
  // HANDOFF
  // ============================================

  async handoff(options: HandoffOptions): Promise<void> {
    const context: HandoffContext = {
      summary: this.generateContextSummary(),
      remaining: this.getRemainingWork(),
      tokenCount: this.currentContextTokens,
      data: this.getContext(),
    };

    const to = typeof options.to === 'string' 
      ? await this.findAgentForHandoff(options.to, options.requiredCapabilities)
      : options.to;

    const message: HandoffMessage = {
      id: uuid(),
      type: 'handoff',
      from: this.agent.id,
      to,
      timestamp: Date.now(),
      context,
      task: options.task,
      reason: options.reason,
      requiredCapabilities: options.requiredCapabilities,
    };

    await this.messageBus.send(message);
    this.log(`Handoff initiated to ${typeof to === 'object' ? to.id : to}`);
  }

  onHandoff(handler: (handoff: HandoffMessage) => Promise<unknown>): void {
    this.on('handoff', async (handoff) => {
      try {
        this.setContext(handoff.context);
        const result = await handler(handoff);
        await this.send(handoff.from, {
          action: 'handoff-response',
          payload: { success: true, result },
        });
      } catch (error) {
        await this.send(handoff.from, {
          action: 'handoff-response',
          payload: { success: false, error: String(error) },
        });
      }
    });
  }

  onContextLimit(handler: (info: { currentTokens: number; maxTokens: number }) => void): void {
    this.on('context-limit', handler);
  }

  // ============================================
  // SKILL BORROWING
  // ============================================

  async borrowSkill(skill: string, duration: number, reason: string): Promise<boolean> {
    const agents = await this.registry.query({ skills: [skill] });
    
    if (agents.length === 0) {
      throw new Error(`No agent has skill: ${skill}`);
    }

    const message: SkillBorrowMessage = {
      id: uuid(),
      type: 'skill-borrow',
      from: this.agent.id,
      to: agents[0].id,
      timestamp: Date.now(),
      skill,
      duration,
      reason,
    };

    const response = await this.messageBus.request(message);
    return response.success || false;
  }

  onSkillBorrow(handler: (borrow: SkillBorrowMessage) => Promise<boolean>): void {
    this.on('skill-borrow', async (borrow) => {
      try {
        const approved = await handler(borrow);
        await this.send(borrow.from, {
          action: 'skill-borrow-response',
          payload: { approved },
        });
      } catch (error) {
        await this.send(borrow.from, {
          action: 'skill-borrow-response',
          payload: { approved: false, error: String(error) },
        });
      }
    });
  }

  // ============================================
  // TASK DELEGATION
  // ============================================

  async delegateTask(task: Omit<TaskDefinition, 'id' | 'createdBy' | 'createdAt'>): Promise<TaskExecution> {
    const fullTask: TaskDefinition = {
      ...task,
      id: uuid(),
      createdBy: this.agent.id,
      createdAt: Date.now(),
    };

    // Find suitable agent
    const agents = await this.registry.query({
      skills: task.requiredCapabilities,
      status: 'available',
      maxLoad: 80,
    });

    if (agents.length === 0) {
      throw new Error('No available agent for this task');
    }

    // Assign to least loaded agent
    const agent = agents.sort((a, b) => a.status.load - b.status.load)[0];
    
    const execution: TaskExecution = {
      ...fullTask,
      status: 'assigned',
      assignedTo: agent.id,
      progress: 0,
      retries: 0,
    };

    await this.messageBus.send({
      id: uuid(),
      type: 'task',
      from: this.agent.id,
      to: agent.id,
      timestamp: Date.now(),
      task: execution,
    } as any);

    return execution;
  }

  onTask(handler: (task: TaskExecution) => Promise<unknown>): void {
    this.on('task', async (task) => {
      try {
        this.updateStatus({ state: 'busy', currentTask: task.id });
        const result = await handler(task);
        this.updateStatus({ state: 'available', currentTask: undefined });
        
        await this.send(task.createdBy, {
          action: 'task-complete',
          payload: { taskId: task.id, result },
        });
      } catch (error) {
        this.updateStatus({ state: 'available', currentTask: undefined });
        
        await this.send(task.createdBy, {
          action: 'task-failed',
          payload: { taskId: task.id, error: String(error) },
        });
      }
    });
  }

  // ============================================
  // MEMORY
  // ============================================

  async remember(key: string, value: unknown, tags?: string[]): Promise<MemoryEntry> {
    return this.memory.write({
      key,
      value,
      createdBy: this.agent.id,
      tags,
    });
  }

  async recall(query: MemoryQuery): Promise<MemorySearchResult> {
    return this.memory.search(query);
  }

  async forget(key: string): Promise<void> {
    await this.memory.delete(key);
  }

  // ============================================
  // REGISTRY
  // ============================================

  async findAgent(query: RegistryQuery): Promise<Agent[]> {
    return this.registry.query(query);
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.registry.get(agentId);
  }

  // ============================================
  // CONTEXT MANAGEMENT
  // ============================================

  addToContext(tokens: number): void {
    this.currentContextTokens += tokens;
    
    if (this.currentContextTokens >= this.agent.capabilities.maxContextTokens) {
      this.emit('context-limit', {
        currentTokens: this.currentContextTokens,
        maxTokens: this.agent.capabilities.maxContextTokens,
      });
    }
  }

  protected setContext(context: HandoffContext): void {
    this.currentContextTokens = context.tokenCount;
    // Override in subclass to handle context data
  }

  protected getContext(): unknown {
    // Override in subclass to return context data
    return null;
  }

  protected generateContextSummary(): string {
    // Override in subclass
    return 'Context summary not implemented';
  }

  protected getRemainingWork(): string {
    // Override in subclass
    return 'Remaining work description not implemented';
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private setupMessageHandlers(): void {
    this.messageBus.onMessage((message) => {
      this.emit('message', message);
      
      switch (message.type) {
        case 'request':
          this.emit('request', message as RequestMessage);
          break;
        case 'handoff':
          this.emit('handoff', message as HandoffMessage);
          break;
        case 'skill-borrow':
          this.emit('skill-borrow', message as SkillBorrowMessage);
          break;
        case 'event':
          this.emit('event', message as Event);
          break;
        case 'task':
          // Handle task assignment
          break;
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.registry.heartbeat(this.agent.id, {
        ...this.agent.status,
        lastHeartbeat: Date.now(),
      });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  private updateStatus(status: Partial<AgentStatus>): void {
    this.agent.status = { ...this.agent.status, ...status };
    this.agent.updatedAt = Date.now();
  }

  private async findAgentForHandoff(role: string, capabilities?: string[]): Promise<AgentId> {
    const agents = await this.registry.query({
      skills: capabilities,
      status: 'available',
      maxLoad: 70,
    });

    if (agents.length === 0) {
      throw new Error(`No available agent for handoff to role: ${role}`);
    }

    return agents[0].id;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[ClawNet:${this.agent.id}] ${message}`);
    }
  }
}

// ============================================
// CLIENT STUBS (to be implemented)
// ============================================

class MessageBusClient extends EventEmitter<{ message: (msg: Message) => void }> {
  private endpoint?: string;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint;
  }

  async connect(_agentId: AgentId): Promise<void> {
    // TODO: Implement WebSocket connection
  }

  async disconnect(): Promise<void> {
    // TODO: Implement disconnect
  }

  async send(_message: Message): Promise<void> {
    // TODO: Implement send
  }

  async request(_message: Message): Promise<ResponseMessage> {
    // TODO: Implement request/response pattern
    return {} as ResponseMessage;
  }

  async broadcast(_message: Message): Promise<void> {
    // TODO: Implement broadcast
  }

  onMessage(handler: (msg: Message) => void): void {
    this.on('message', handler);
  }
}

class RegistryClient {
  private endpoint?: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint;
  }

  async register(_agent: Agent): Promise<void> {
    // TODO: Implement registration
  }

  async unregister(_agentId: AgentId): Promise<void> {
    // TODO: Implement unregistration
  }

  async heartbeat(_agentId: AgentId, _status: AgentStatus): Promise<void> {
    // TODO: Implement heartbeat
  }

  async get(_agentId: string): Promise<Agent | null> {
    // TODO: Implement get
    return null;
  }

  async query(_query: RegistryQuery): Promise<Agent[]> {
    // TODO: Implement query
    return [];
  }
}

class MemoryClient {
  private endpoint?: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint;
  }

  async write(_entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
    // TODO: Implement write
    return {} as MemoryEntry;
  }

  async search(_query: MemoryQuery): Promise<MemorySearchResult> {
    // TODO: Implement search
    return { entries: [], total: 0, hasMore: false };
  }

  async delete(_key: string): Promise<void> {
    // TODO: Implement delete
  }
}

// ============================================
// EXPORTS
// ============================================

export * from '@clawnet/core';