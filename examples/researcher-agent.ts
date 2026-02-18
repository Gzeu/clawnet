import { ClawNet } from '@clawnet/sdk';

// ============================================
// RESEARCHER AGENT
// An agent specialized in research
// ============================================

const researcher = new ClawNet({
  agent: {
    id: 'researcher-001',
    name: 'ResearchBot',
  },
  capabilities: {
    skills: ['web-search', 'document-analysis', 'summarization'],
    tools: ['web_search', 'web_fetch', 'read', 'write'],
    domains: ['technology', 'science', 'business'],
    maxContextTokens: 100000,
    languages: ['en', 'ro'],
  },
});

// Handle context limit - handoff to coder
researcher.onContextLimit(async ({ currentTokens, maxTokens }) => {
  console.log(`Context limit reached: ${currentTokens}/${maxTokens}`);
  
  await researcher.handoff({
    to: 'coder', // Role-based handoff
    task: 'Continue implementation based on this research',
    reason: 'context_limit',
    requiredCapabilities: ['coding', 'implementation'],
  });
});

// Handle incoming handoffs
researcher.onHandoff(async ({ context, task, from }) => {
  console.log(`Received handoff from ${from.id}: ${task}`);
  console.log(`Context summary: ${context.summary}`);
  console.log(`Remaining work: ${context.remaining}`);
  
  // Process with inherited context
  const result = await performResearch(context, task);
  
  return result;
});

// Handle task delegation
researcher.onTask(async (task) => {
  console.log(`Received task: ${task.name}`);
  console.log(`Priority: ${task.priority}`);
  console.log(`Input:`, task.input);
  
  const result = await performResearch(null, task.description);
  
  return result;
});

// Handle skill borrowing requests
researcher.onSkillBorrow(async ({ skill, borrower, duration, reason }) => {
  console.log(`${borrower.id} wants to borrow skill "${skill}" for ${duration}ms`);
  console.log(`Reason: ${reason}`);
  
  // Approve or deny based on policy
  const approved = true; // Could have more complex logic
  
  return approved;
});

// Connect to mesh
async function main() {
  await researcher.connect();
  console.log('Researcher agent connected!');
  
  // Example: Delegate a subtask
  const subTask = await researcher.delegateTask({
    name: 'Analyze code quality',
    description: 'Analyze the codebase for quality issues',
    requiredCapabilities: ['code-analysis'],
    priority: 'normal',
    input: { repository: 'https://github.com/example/repo' },
  });
  
  console.log('Delegated task:', subTask.id);
  
  // Example: Store knowledge in shared memory
  await researcher.remember('gpt4-capabilities', {
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
  }, ['ai', 'llm', 'openai']);
  
  // Example: Find other agents
  const coders = await researcher.findAgent({
    skills: ['coding', 'debugging'],
    status: 'available',
  });
  
  console.log(`Found ${coders.length} available coders`);
}

async function performResearch(context: any, task: string): Promise<unknown> {
  // Implementation would use web_search, web_fetch, etc.
  console.log(`Performing research: ${task}`);
  return { research: 'results...' };
}

main().catch(console.error);