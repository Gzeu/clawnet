/**
 * ClawNet Quick Test
 * Test the API without Docker build
 */

const Redis = require('ioredis');

async function testRedis() {
  console.log('🧪 Testing Redis connection...\n');
  
  const redis = new Redis({ host: 'localhost', port: 6379 });
  
  try {
    // Test basic operations
    await redis.set('clawnet:test', 'Hello from ClawNet!');
    const value = await redis.get('clawnet:test');
    console.log('✅ Redis SET/GET:', value);
    
    // Test HASH
    await redis.hset('clawnet:agent:test-001', {
      name: 'TestAgent',
      status: 'available',
      skills: JSON.stringify(['coding', 'testing'])
    });
    const agent = await redis.hgetall('clawnet:agent:test-001');
    console.log('✅ Redis HSET/HGETALL:', agent);
    
    // Test SET
    await redis.sadd('clawnet:skills:coding', 'test-001', 'test-002');
    const agents = await redis.smembers('clawnet:skills:coding');
    console.log('✅ Redis SADD/SMEMBERS:', agents);
    
    // Test STREAM
    await redis.xadd('clawnet:stream:test', '*', 'message', JSON.stringify({ type: 'test', data: 'hello' }));
    const stream = await redis.xrange('clawnet:stream:test', '-', '+');
    console.log('✅ Redis XADD/XRANGE:', stream);
    
    console.log('\n🎉 All Redis tests passed!');
    
  } catch (error) {
    console.error('❌ Redis error:', error.message);
  } finally {
    await redis.quit();
  }
}

async function testClawNetAPI() {
  console.log('\n🧪 Testing ClawNet API concepts...\n');
  
  const redis = new Redis({ host: 'localhost', port: 6379 });
  
  try {
    // Simulate agent registration
    const agent = {
      id: 'developer-001',
      name: 'Developer Agent',
      capabilities: {
        skills: ['coding', 'testing', 'debugging'],
        tools: ['read', 'write', 'exec'],
        domains: ['software'],
        maxContextTokens: 100000
      },
      status: {
        state: 'available',
        load: 0,
        lastHeartbeat: Date.now()
      }
    };
    
    // Register agent
    await redis.hset(`clawnet:agent:${agent.id}`, {
      data: JSON.stringify(agent)
    });
    await redis.sadd('clawnet:agents', agent.id);
    console.log('✅ Agent registered:', agent.id);
    
    // Index by skills
    for (const skill of agent.capabilities.skills) {
      await redis.sadd(`clawnet:skill:${skill}`, agent.id);
    }
    console.log('✅ Agent indexed by skills:', agent.capabilities.skills);
    
    // Query agents by skill
    const codingAgents = await redis.smembers('clawnet:skill:coding');
    console.log('✅ Query "coding" skill:', codingAgents);
    
    // Store memory
    await redis.setex(
      'clawnet:memory:pattern-001',
      3600,
      JSON.stringify({
        key: 'pattern-001',
        value: { pattern: 'Repository pattern', usage: 'Data access' },
        tags: ['pattern', 'architecture'],
        createdBy: agent.id
      })
    );
    console.log('✅ Memory stored: pattern-001');
    
    // Send message via stream
    await redis.xadd('clawnet:messages', '*', {
      type: 'handoff',
      from: agent.id,
      to: 'reviewer-001',
      data: JSON.stringify({
        task: 'Review code',
        reason: 'context_limit'
      })
    });
    console.log('✅ Message sent via stream');
    
    // Get stats
    const totalAgents = await redis.scard('clawnet:agents');
    console.log('\n📊 Stats:');
    console.log('   Total agents:', totalAgents);
    console.log('   Skills indexed:', (await redis.keys('clawnet:skill:*')).length);
    console.log('   Messages in stream:', (await redis.xlen('clawnet:messages')));
    
    console.log('\n🎉 All ClawNet API tests passed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await redis.quit();
  }
}

async function main() {
  console.log('═════════════════════════════════════════');
  console.log('        ClawNet Quick Test Suite        ');
  console.log('═════════════════════════════════════════\n');
  
  await testRedis();
  await testClawNetAPI();
  
  console.log('\n═════════════════════════════════════════');
  console.log('✅ All tests completed!');
  console.log('═════════════════════════════════════════');
}

main().catch(console.error);