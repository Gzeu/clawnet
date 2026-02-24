import { AgentInterface, AgentCapabilities, AgentStatus } from './index';

export class Agent implements AgentInterface {
  id: string;
  name: string;
  capabilities: AgentCapabilities;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
  endpoint?: string;
  createdAt: number;
  updatedAt: number;

  constructor(params: { 
    id?: string;
    name: string;
    capabilities?: Partial<AgentCapabilities>;
    endpoint?: string;
    metadata?: Record<string, unknown>;
  }) {
    this.id = params.id || Math.random().toString(36).substring(2, 9);
    this.name = params.name;
    this.capabilities = {
      skills: params.capabilities?.skills || [],
      tools: params.capabilities?.tools || [],
      domains: params.capabilities?.domains || [],
      maxContextTokens: params.capabilities?.maxContextTokens || 8000,
      languages: params.capabilities?.languages || ['en'],
    };
    this.status = {
      state: 'available',
      lastHeartbeat: Date.now(),
      load: 0,
    };
    this.endpoint = params.endpoint;
    this.metadata = params.metadata;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addSkill(skill: string): void {
    if (!this.capabilities.skills.includes(skill)) {
      this.capabilities.skills.push(skill);
    }
  }

  removeSkill(skill: string): void {
    this.capabilities.skills = this.capabilities.skills.filter(s => s !== skill);
  }

  updateStatus(newStatus: Partial<AgentStatus>): void {
    this.status = { ...this.status, ...newStatus };
    this.updatedAt = Date.now();
  }
}