/**
 * ClawNet Message Bus
 * Redis-backed message broker for agent communication
 */

import Redis from 'ioredis';
import { v4 as uuid } from 'uuid';
import EventEmitter from 'eventemitter3';
import type {
  AgentId,
  Message,
  RequestMessage,
  ResponseMessage,
  HandoffMessage,
  EventMessage,
  TaskMessage,
  SkillBorrowMessage,
} from '@clawnet/core';

// ============================================
// TYPES
// ============================================

export interface MessageBusConfig {
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
  /** Message TTL in milliseconds */
  messageTtl?: number;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Maximum retries for failed messages */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface MessageBusEvents {
  'message': (message: Message) => void;
  'request': (request: RequestMessage) => void;
  'response': (response: ResponseMessage) => void;
  'handoff': (handoff: HandoffMessage) => void;
  'event': (event: EventMessage) => void;
  'task': (task: TaskMessage) => void;
  'skill-borrow': (borrow: SkillBorrowMessage) => void;
  'error': (error: Error) => void;
  'connected': () => void;
  'disconnected': () => void;
}

interface PendingRequest {
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================
// MESSAGE BUS
// ============================================

export class MessageBus extends EventEmitter<MessageBusEvents> {
  // Explicitly declare emit to satisfy TypeScript
  emit<K extends keyof MessageBusEvents>(event: K, ...args: Parameters<MessageBusEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
  private config: Required<MessageBusConfig>;
  private publisher: Redis;
  private subscriber: Redis;
  private agentId?: AgentId;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private isConnected: boolean = false;
  private streamConsumers: Map<string, string> = new Map();

  constructor(config: MessageBusConfig = {}) {
    super();
    
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      redisHost: config.redisHost || 'localhost',
      redisPort: config.redisPort || 6379,
      redisPassword: config.redisPassword || '',
      redisDb: config.redisDb || 0,
      messageTtl: config.messageTtl || 86400000, // 24 hours
      requestTimeout: config.requestTimeout || 30000, // 30 seconds
      maxRetries: config.maxRetries || 3,
      debug: config.debug || false,
    };

    // Initialize Redis clients
    const redisOptions: Redis.RedisOptions = {
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword || undefined,
      db: this.config.redisDb,
      retryStrategy: (times) => {
        if (times > 10) {
          this.emit('error', new Error('Redis connection failed after 10 retries'));
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    };

    this.publisher = new Redis(this.config.redisUrl || redisOptions);
    this.subscriber = new Redis(this.config.redisUrl || redisOptions);

    this.setupErrorHandlers();
  }

  // ============================================
  // CONNECTION
  // ============================================

  async connect(agentId: AgentId): Promise<void> {
    this.agentId = agentId;
    
    // Wait for Redis connection
    await Promise.all([
      this.publisher.ping(),
      this.subscriber.ping(),
    ]);

    // Subscribe to agent's message stream
    const streamKey = this.getAgentStreamKey(agentId);
    await this.subscribeToStream(streamKey);

    // Subscribe to broadcast channel
    await this.subscribeToStream('clawnet:broadcast');

    this.isConnected = true;
    this.emit('connected');
    this.log(`Connected as agent ${agentId.id}`);
  }

  async disconnect(): Promise<void> {
    if (!this.agentId) return;

    // Stop consuming streams
    for (const [stream, consumer] of this.streamConsumers) {
      try {
        await this.subscriber.xgroup('DELCONSUMER', stream, consumer);
      } catch (e) {
        // Ignore errors
      }
    }

    // Close connections
    await Promise.all([
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);

    this.isConnected = false;
    this.emit('disconnected');
    this.log('Disconnected');
  }

  private setupErrorHandlers(): void {
    this.publisher.on('error', (err) => {
      this.emit('error', err);
      this.log(`Publisher error: ${err.message}`);
    });

    this.subscriber.on('error', (err) => {
      this.emit('error', err);
      this.log(`Subscriber error: ${err.message}`);
    });
  }

  // ============================================
  // STREAM MANAGEMENT
  // ============================================

  private async subscribeToStream(streamKey: string): Promise<void> {
    const consumerGroup = `clawnet-${this.agentId?.id || 'default'}`;
    const consumerName = `${consumerGroup}-consumer`;

    // Create consumer group if not exists
    try {
      await this.subscriber.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM');
    } catch (e: any) {
      if (!e.message.includes('BUSYGROUP')) {
        throw e;
      }
    }

    this.streamConsumers.set(streamKey, consumerName);

    // Start consuming in background
    this.consumeStream(streamKey, consumerGroup, consumerName);
  }

  private async consumeStream(streamKey: string, group: string, consumer: string): Promise<void> {
    while (this.isConnected) {
      try {
        // Read new messages
        const messages = await this.subscriber.xreadgroup(
          'GROUP', group, consumer,
          'COUNT', 10,
          'BLOCK', 1000,
          'STREAMS', streamKey, '>'
        );

        if (messages) {
          for (const [stream, entries] of messages) {
            for (const [id, fields] of entries) {
              await this.handleStreamMessage(streamKey, group, consumer, id, fields);
            }
          }
        }
      } catch (e: any) {
        if (this.isConnected) {
          this.log(`Stream consume error: ${e.message}`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  private async handleStreamMessage(
    streamKey: string,
    group: string,
    consumer: string,
    messageId: string,
    fields: string[]
  ): Promise<void> {
    try {
      // Parse fields into object
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      // Parse message
      const message = JSON.parse(data.message) as Message;
      
      // Acknowledge message
      await this.subscriber.xack(streamKey, group, messageId);

      // Handle message
      await this.handleMessage(message);
    } catch (e: any) {
      this.log(`Error handling message: ${e.message}`);
    }
  }

  // ============================================
  // MESSAGE HANDLING
  // ============================================

  private async handleMessage(message: Message): Promise<void> {
    this.log(`Received ${message.type} from ${message.from.id}`);
    this.emit('message', message);

    switch (message.type) {
      case 'request':
        this.emit('request', message as RequestMessage);
        break;
      case 'response':
        this.handleResponse(message as ResponseMessage);
        break;
      case 'handoff':
        this.emit('handoff', message as HandoffMessage);
        break;
      case 'event':
        this.emit('event', message as EventMessage);
        break;
      case 'task':
        this.emit('task', message as TaskMessage);
        break;
      case 'skill-borrow':
        this.emit('skill-borrow', message as SkillBorrowMessage);
        break;
    }
  }

  private handleResponse(response: ResponseMessage): void {
    const pending = this.pendingRequests.get(response.correlationId || '');
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.correlationId || '');
      pending.resolve(response);
    }
    this.emit('response', response);
  }

  // ============================================
  // SENDING MESSAGES
  // ============================================

  async send(message: Message): Promise<void> {
    this.ensureConnected();

    const streamKey = message.to === 'broadcast'
      ? 'clawnet:broadcast'
      : this.getAgentStreamKey(message.to as AgentId);

    await this.publisher.xadd(
      streamKey,
      '*',
      'message', JSON.stringify(message),
      'type', message.type,
      'from', message.from.id,
      'timestamp', message.timestamp.toString()
    );

    this.log(`Sent ${message.type} to ${typeof message.to === 'string' ? message.to : message.to.id}`);
  }

  async request<T = unknown>(request: Omit<RequestMessage, 'id' | 'from' | 'timestamp'>): Promise<ResponseMessage> {
    this.ensureConnected();

    const messageId = uuid();
    const fullRequest: RequestMessage = {
      ...request,
      id: messageId,
      from: this.agentId!,
      timestamp: Date.now(),
    } as RequestMessage;

    // Create pending request
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request timeout: ${messageId}`));
      }, this.config.requestTimeout);

      this.pendingRequests.set(messageId, {
        resolve: resolve as any,
        reject,
        timeout,
      });

      this.send(fullRequest).catch((err) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(messageId);
        reject(err);
      });
    });
  }

  async respond(requestId: string, response: Omit<ResponseMessage, 'id' | 'from' | 'timestamp' | 'correlationId'>): Promise<void> {
    this.ensureConnected();

    const fullResponse: ResponseMessage = {
      ...response,
      id: uuid(),
      from: this.agentId!,
      timestamp: Date.now(),
      correlationId: requestId,
      type: 'response',
      to: this.agentId!, // Will be overridden by the request's from
    } as ResponseMessage;

    await this.send(fullResponse);
  }

  async broadcast(message: Omit<Message, 'id' | 'from' | 'to' | 'timestamp'>): Promise<void> {
    const fullMessage: Message = {
      ...message,
      id: uuid(),
      from: this.agentId!,
      to: 'broadcast',
      timestamp: Date.now(),
    } as Message;

    await this.send(fullMessage);
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  async sendHandoff(to: AgentId, handoff: Omit<HandoffMessage, 'id' | 'from' | 'to' | 'type' | 'timestamp'>): Promise<void> {
    await this.send({
      ...handoff,
      id: uuid(),
      type: 'handoff',
      from: this.agentId!,
      to,
      timestamp: Date.now(),
    } as HandoffMessage);
  }

  async sendEvent(event: string, data: Record<string, unknown>): Promise<void> {
    await this.broadcast({
      type: 'event',
      event,
      data,
    } as Omit<EventMessage, 'id' | 'from' | 'to' | 'timestamp'>);
  }

  async sendTask(to: AgentId, task: Omit<TaskMessage, 'id' | 'from' | 'to' | 'type' | 'timestamp'>): Promise<void> {
    await this.send({
      ...task,
      id: uuid(),
      type: 'task',
      from: this.agentId!,
      to,
      timestamp: Date.now(),
    } as TaskMessage);
  }

  // ============================================
  // UTILITY
  // ============================================

  private getAgentStreamKey(agentId: AgentId): string {
    return `clawnet:agent:${agentId.id}`;
  }

  private ensureConnected(): void {
    if (!this.isConnected || !this.agentId) {
      throw new Error('MessageBus not connected. Call connect() first.');
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[MessageBus] ${message}`);
    }
  }
}

// ============================================
// EXPORTS
// ============================================

export default MessageBus;