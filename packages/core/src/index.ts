/**
 * ClawNet Core Types
 * Agent Mesh Platform for OpenClaw
 */

// ============================================
// AGENT TYPES
// ============================================

export interface AgentId {
  /** Unique identifier for the agent */
  id: string;
  /** Agent name/alias */
  name?: string;
  /** Agent owner/user */
  owner?: string;
}

export interface AgentCapabilities {
  /** Skills this agent possesses */
  skills: string[];
  /** Tools available to this agent */
  tools: string[];
  /** Knowledge domains */
  domains: string[];
  /** Maximum context tokens */
  maxContextTokens: number;
  /** Supported languages */
  languages?: string[];
}

export interface AgentStatus {
  /** Current state */
  state: 'available' | 'busy' | 'offline' | 'error';
  /** Current task ID if busy */
  currentTask?: string;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
  /** Load percentage (0-100) */
  load: number;
  /** Error message if in error state */
  error?: string;
}

export interface Agent extends AgentId {
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Current status */
  status: AgentStatus;
  /** Agent metadata */
  metadata?: Record<string, unknown>;
  /** API endpoint for direct communication */
  endpoint?: string;
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

// ============================================
// MESSAGE TYPES
// ============================================

export type MessageType = 
  | 'request'      // Request for action
  | 'response'     // Response to request
  | 'handoff'      // Context handoff
  | 'event'        // Event notification
  | 'skill-borrow' // Skill borrowing request
  | 'skill-return' // Return borrowed skill
  | 'task'         // Task delegation
  | 'query'        // Query registry/memory
  | 'broadcast';   // Broadcast to all agents

export interface MessageMetadata {
  /** Message timestamp */
  timestamp: number;
  /** Correlation ID for request/response */
  correlationId?: string;
  /** Reply-to message ID */
  replyTo?: string;
  /** Priority (1-10, default 5) */
  priority?: number;
  /** TTL in milliseconds */
  ttl?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface BaseMessage extends MessageMetadata {
  /** Message ID */
  id: string;
  /** Message type */
  type: MessageType;
  /** Sender agent */
  from: AgentId;
  /** Target agent(s) */
  to: AgentId | AgentId[] | 'broadcast';
}

export interface RequestMessage extends BaseMessage {
  type: 'request';
  /** Action to perform */
  action: string;
  /** Request payload */
  payload: unknown;
}

export interface ResponseMessage extends BaseMessage {
  type: 'response';
  /** Success status */
  success: boolean;
  /** Response data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

export interface HandoffMessage extends BaseMessage {
  type: 'handoff';
  /** Context to transfer */
  context: {
    /** Summary of what was done */
    summary: string;
    /** Remaining work to do */
    remaining: string;
    /** Token count of context */
    tokenCount: number;
    /** Raw context data */
    data?: unknown;
    /** Attachments (file paths, URLs) */
    attachments?: string[];
  };
  /** Task for receiving agent */
  task: string;
  /** Expected capabilities */
  requiredCapabilities?: string[];
  /** Handoff reason */
  reason: 'context_limit' | 'specialization' | 'load_balance' | 'user_request';
}

export interface EventMessage extends BaseMessage {
  type: 'event';
  /** Event name */
  event: string;
  /** Event data */
  data: Record<string, unknown>;
}

export interface SkillBorrowMessage extends BaseMessage {
  type: 'skill-borrow';
  /** Skill to borrow */
  skill: string;
  /** Duration in milliseconds */
  duration: number;
  /** Reason for borrowing */
  reason: string;
  /** Task that needs the skill */
  taskContext?: string;
}

export interface TaskMessage extends BaseMessage {
  type: 'task';
  /** Task definition */
  task: TaskDefinition;
}

export type Message = 
  | RequestMessage 
  | ResponseMessage 
  | HandoffMessage 
  | EventMessage 
  | SkillBorrowMessage 
  | TaskMessage;

// ============================================
// TASK TYPES
// ============================================

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export type TaskStatus = 
  | 'pending'
  | 'assigned'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskDefinition {
  /** Task ID */
  id: string;
  /** Task name */
  name: string;
  /** Task description */
  description: string;
  /** Required capabilities */
  requiredCapabilities: string[];
  /** Task priority */
  priority: TaskPriority;
  /** Input data */
  input: unknown;
  /** Expected output */
  expectedOutput?: string;
  /** Deadline timestamp */
  deadline?: number;
  /** Max retries */
  maxRetries?: number;
  /** Parent task ID (for subtasks) */
  parentTaskId?: string;
  /** Created by */
  createdBy: AgentId;
  /** Created timestamp */
  createdAt: number;
}

export interface TaskExecution extends TaskDefinition {
  /** Current status */
  status: TaskStatus;
  /** Assigned agent */
  assignedTo?: AgentId;
  /** Progress percentage (0-100) */
  progress: number;
  /** Output data */
  output?: unknown;
  /** Error message */
  error?: string;
  /** Started timestamp */
  startedAt?: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Retry count */
  retries: number;
  /** Child task IDs */
  childTasks?: string[];
}

// ============================================
// SKILL TYPES
// ============================================

export interface Skill {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Skill version */
  version: string;
  /** Required dependencies */
  dependencies?: string[];
  /** Required permissions */
  permissions?: string[];
  /** Owner agent */
  owner: AgentId;
  /** Is publicly available */
  public: boolean;
  /** Usage count */
  usageCount: number;
  /** Rating (1-5) */
  rating?: number;
}

export interface SkillBorrow {
  /** Borrow ID */
  id: string;
  /** Skill being borrowed */
  skill: Skill;
  /** Borrower agent */
  borrower: AgentId;
  /** Lender agent */
  lender: AgentId;
  /** Start time */
  startedAt: number;
  /** Duration in milliseconds */
  duration: number;
  /** Expires at */
  expiresAt: number;
  /** Context of borrow */
  context?: string;
}

// ============================================
// MEMORY TYPES
// ============================================

export interface MemoryEntry {
  /** Entry ID */
  id: string;
  /** Key */
  key: string;
  /** Value */
  value: unknown;
  /** Created by agent */
  createdBy: AgentId;
  /** Created timestamp */
  createdAt: number;
  /** TTL in milliseconds */
  ttl?: number;
  /** Tags for search */
  tags?: string[];
  /** Access permissions */
  permissions?: 'public' | 'private' | 'restricted';
  /** Allowed agents (for restricted) */
  allowedAgents?: string[];
}

export interface MemoryQuery {
  /** Search key pattern */
  key?: string;
  /** Search tags */
  tags?: string[];
  /** Search in value */
  searchText?: string;
  /** Created by agent */
  createdBy?: string;
  /** Max results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface MemorySearchResult {
  /** Matching entries */
  entries: MemoryEntry[];
  /** Total count */
  total: number;
  /** Has more results */
  hasMore: boolean;
}

// ============================================
// REGISTRY TYPES
// ============================================

export interface AgentRegistration {
  /** Agent to register */
  agent: Agent;
  /** Authentication token */
  token?: string;
  /** Registration timestamp */
  registeredAt: number;
}

export interface RegistryQuery {
  /** Filter by skills */
  skills?: string[];
  /** Filter by tools */
  tools?: string[];
  /** Filter by domains */
  domains?: string[];
  /** Filter by status */
  status?: AgentStatus['state'];
  /** Max load percentage */
  maxLoad?: number;
  /** Limit results */
  limit?: number;
}

// ============================================
// EVENT TYPES
// ============================================

export type EventType = 
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.status_changed'
  | 'task.created'
  | 'task.assigned'
  | 'task.completed'
  | 'task.failed'
  | 'handoff.initiated'
  | 'handoff.completed'
  | 'skill.borrowed'
  | 'skill.returned'
  | 'memory.written'
  | 'memory.deleted';

export interface Event {
  /** Event ID */
  id: string;
  /** Event type */
  type: EventType;
  /** Event data */
  data: Record<string, unknown>;
  /** Event timestamp */
  timestamp: number;
  /** Source agent */
  source: AgentId;
}

// ============================================
// CONFIG TYPES
// ============================================

export interface ClawNetConfig {
  /** Agent identity */
  agent: AgentId;
  /** Capabilities */
  capabilities: AgentCapabilities;
  /** Registry endpoint */
  registryEndpoint?: string;
  /** Message bus endpoint */
  messageBusEndpoint?: string;
  /** Memory endpoint */
  memoryEndpoint?: string;
  /** Authentication token */
  token?: string;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Request timeout (ms) */
  requestTimeout?: number;
  /** Max retries */
  maxRetries?: number;
  /** Debug mode */
  debug?: boolean;
}

// ============================================
// ERROR TYPES
// ============================================

export class ClawNetError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ClawNetError';
  }
}

export class AgentNotFoundError extends ClawNetError {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, 'AGENT_NOT_FOUND', { agentId });
    this.name = 'AgentNotFoundError';
  }
}

export class SkillNotAvailableError extends ClawNetError {
  constructor(skill: string) {
    super(`Skill not available: ${skill}`, 'SKILL_NOT_AVAILABLE', { skill });
    this.name = 'SkillNotAvailableError';
  }
}

export class ContextLimitError extends ClawNetError {
  constructor(currentTokens: number, maxTokens: number) {
    super(
      `Context limit reached: ${currentTokens}/${maxTokens}`,
      'CONTEXT_LIMIT',
      { currentTokens, maxTokens }
    );
    this.name = 'ContextLimitError';
  }
}

export class TaskFailedError extends ClawNetError {
  constructor(taskId: string, reason: string) {
    super(`Task failed: ${taskId} - ${reason}`, 'TASK_FAILED', { taskId, reason });
    this.name = 'TaskFailedError';
  }
}