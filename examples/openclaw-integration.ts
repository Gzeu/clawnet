/**
 * OpenClaw + ClawNet Integration Example
 * 
 * This example shows how to use ClawNet agents within OpenClaw sessions.
 * Run this in an OpenClaw session to test multi-agent collaboration.
 */

import {
  OpenClawAgent,
  createResearcherAgent,
  createCoderAgent,
  createOrchestratorAgent,
  ToolDefinition,
} from '@clawnet/adapter-openclaw';

// ============================================
// EXAMPLE 1: Basic Agent Setup
// ============================================

async function basicSetup() {
  // Create a researcher agent
  const researcher = createResearcherAgent('researcher-01', {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    sessionKey: process.env.OPENCLAW_SESSION_KEY,
  });

  // Register tools
  researcher.registerTool({
    name: 'search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    handler: async (params) => {
      // In production, call web_search tool
      console.log(`Searching for: ${params.query}`);
      return { results: ['Result 1', 'Result 2'] };
    },
  });

  researcher.registerTool({
    name: 'summarize',
    description: 'Summarize text content',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to summarize' },
      },
      required: ['text'],
    },
    handler: async (params) => {
      // In production, use LLM to summarize
      return { summary: `Summary of: ${params.text.substring(0, 100)}...` };
    },
  });

  // Connect to ClawNet mesh
  await researcher.connect();

  console.log('Researcher agent ready!');
  console.log('Tools:', researcher.getTools());

  return researcher;
}

// ============================================
// EXAMPLE 2: Context Handoff
// ============================================

async function contextHandoff() {
  const researcher = createResearcherAgent('researcher-01');
  const coder = createCoderAgent('coder-01');

  await researcher.connect();
  await coder.connect();

  // Simulate researcher hitting context limit
  researcher.updateContextTokens(95000); // Near 100k limit

  // Handoff to coder
  await researcher.handoff({
    context: 'Analyzed 3 libraries: React, Vue, Svelte. React has best ecosystem...',
    task: 'Create sample project using the recommended library',
    requiredCapabilities: ['coding', 'frontend'],
    reason: 'context_limit',
  });

  console.log('Handoff initiated from researcher to coder');
}

// ============================================
// EXAMPLE 3: Task Delegation
// ============================================

async function taskDelegation() {
  const orchestrator = createOrchestratorAgent('orchestrator-01');
  await orchestrator.connect();

  // Delegate research task
  const researchTaskId = await orchestrator.delegateTask({
    name: 'Research AI frameworks',
    description: 'Research and compare AI frameworks for our use case',
    requiredCapabilities: ['web-search', 'analysis'],
    input: {
      topic: 'LLM frameworks',
      criteria: ['performance', 'ease of use', 'community'],
    },
    priority: 'high',
  });

  console.log(`Research task delegated: ${researchTaskId}`);

  // Delegate coding task
  const codingTaskId = await orchestrator.delegateTask({
    name: 'Implement authentication',
    description: 'Implement JWT authentication for the API',
    requiredCapabilities: ['coding', 'security'],
    input: {
      language: 'typescript',
      framework: 'fastify',
    },
    priority: 'normal',
  });

  console.log(`Coding task delegated: ${codingTaskId}`);
}

// ============================================
// EXAMPLE 4: Skill Borrowing
// ============================================

async function skillBorrowing() {
  const researcher = createResearcherAgent('researcher-01');
  await researcher.connect();

  // Researcher needs to post to Twitter but doesn't have the skill
  const approved = await researcher.borrowSkill(
    'twitter',// Skill name
    60000,        // Duration: 1 minute
    'Need to share research findings'// Reason
  );

  if (approved) {
    console.log('Twitter skill borrowed! Can now post tweets.');
    // Use the borrowed skill...
  } else {
    console.log('Skill borrowing denied.');
  }
}

// ============================================
// EXAMPLE 5: Shared Memory
// ============================================

async function sharedMemory() {
  const researcher = createResearcherAgent('researcher-01');
  const coder = createCoderAgent('coder-01');

  await researcher.connect();
  await coder.connect();

  // Researcher stores knowledge
  await researcher.remember('best-practices-api', {
    patterns: ['rate-limiting', 'caching', 'pagination'],
    tools: ['express-rate-limit', 'redis', 'prisma'],
    references: ['https://example.com/api-guide'],
  }, ['api', 'best-practices', 'backend']);

  // Coder recalls the knowledge
  const knowledge = await coder.recall({
    tags: ['api', 'best-practices'],
  });

  console.log('Retrieved knowledge:', knowledge);
}

// ============================================
// EXAMPLE 6: Multi-Agent Workflow
// ============================================

async function multiAgentWorkflow() {
  const orchestrator = createOrchestratorAgent('orchestrator-01');
  const researcher = createResearcherAgent('researcher-01');
  const coder = createCoderAgent('coder-01');

  await Promise.all([
    orchestrator.connect(),
    researcher.connect(),
    coder.connect(),
  ]);

  // Define workflow
  const workflow = [
    {
      step: 'research',
      agent: researcher,
      task: 'Research best authentication patterns',
      capabilities: ['web-search', 'analysis'],
    },
    {
      step: 'implement',
      agent: coder,
      task: 'Implement authentication based on research',
      capabilities: ['coding', 'security'],
      dependsOn: ['research'],
    },
    {
      step: 'review',
      agent: coder,
      task: 'Code review and security audit',
      capabilities: ['code-review', 'security-analysis'],
      dependsOn: ['implement'],
    },
  ];

  console.log('Workflow defined with', workflow.length, 'steps');
  
  // In production, orchestrator would execute this workflow
  // by delegating tasks to appropriate agents in order,
  // passing context between them
}

// ============================================
// EXAMPLE 7: OpenClaw Session Integration
// ============================================

/**
 * Integration with OpenClaw session
 * This would be called from within an OpenClaw agent
 */
async function openclawIntegration() {
  // In OpenClaw, you would create an agent that uses ClawNet
  const agent = new OpenClawAgent({
    identity: {
      id: 'openclaw-agent-01',
      name: 'ClawNetAgent',
    },
    capabilities: {
      skills: ['general', 'coordination'],
      tools: ['handoff', 'delegate', 'remember'],
      domains: ['general'],
      maxContextTokens: 100000,
    },
    openclaw: {
      // Use OpenClaw connection details
      gatewayUrl: process.env.OPENCLAW_GATEWAY_URL,
      gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
      sessionKey: process.env.OPENCLAW_SESSION_KEY,
    },
  });

  await agent.connect();

  // Register OpenClaw-compatible tools
  agent.registerTool({
    name: 'clawnet_handoff',
    description: 'Handoff context to another specialized agent',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Target agent role (researcher, coder, analyzer)' },
        task: { type: 'string', description: 'Task for the receiving agent' },
        reason: { type: 'string', enum: ['context_limit', 'specialization', 'user_request'] },
      },
      required: ['to', 'task', 'reason'],
    },
    handler: async (params) => {
      await agent.handoff({
        context: 'Current context would be extracted here',
        task: params.task as string,
        requiredCapabilities: [params.to as string],
        reason: params.reason as any,
      });
      return { status: 'handoff_initiated' };
    },
  });

  agent.registerTool({
    name: 'clawnet_delegate',
    description: 'Delegate a task to a specialized agent',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required capabilities',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          default: 'normal',
        },
      },
      required: ['task', 'capabilities'],
    },
    handler: async (params) => {
      const taskId = await agent.delegateTask({
        name: 'Delegated task',
        description: params.task as string,
        requiredCapabilities: params.capabilities as string[],
        input: {},
        priority: (params.priority as any) || 'normal',
      });
      return { taskId, status: 'delegated' };
    },
  });

  agent.registerTool({
    name: 'clawnet_remember',
    description: 'Store knowledge in shared memory for other agents',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Knowledge key' },
        value: { type: 'object', description: 'Knowledge value' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization',
        },
      },
      required: ['key', 'value'],
    },
    handler: async (params) => {
      await agent.remember(
        params.key as string,
        params.value,
        params.tags as string[] | undefined
      );
      return { status: 'stored' };
    },
  });

  agent.registerTool({
    name: 'clawnet_recall',
    description: 'Recall knowledge from shared memory',
    parameters: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to search',
        },
        searchText: { type: 'string', description: 'Text to search' },
      },
    },
    handler: async (params) => {
      const results = await agent.recall({
        tags: params.tags as string[] | undefined,
        searchText: params.searchText as string | undefined,
      });
      return { results };
    },
  });

  console.log('OpenClaw agent integrated with ClawNet!');
  console.log('Available tools:', agent.getTools());

  return agent;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('=== ClawNet + OpenClaw Integration Examples ===\n');

  console.log('1. Basic Setup');
  await basicSetup();
  console.log('\n---\n');

  console.log('2. Context Handoff');
  await contextHandoff();
  console.log('\n---\n');

  console.log('3. Task Delegation');
  await taskDelegation();
  console.log('\n---\n');

  console.log('4. Skill Borrowing');
  await skillBorrowing();
  console.log('\n---\n');

  console.log('5. Shared Memory');
  await sharedMemory();
  console.log('\n---\n');

  console.log('6. Multi-Agent Workflow');
  await multiAgentWorkflow();
  console.log('\n---\n');

  console.log('7. OpenClaw Integration');
  await openclawIntegration();
}

main().catch(console.error);