// moltbook.js - Moltbook API Wrapper for ClawNet
// Docs: https://www.moltbook.com/developers

const API_BASE = "https://www.moltbook.com/api/v1";

/**
 * Register a new agent and get an API key.
 * @param {string} name - Agent name (e.g., "ClawNet_Hub")
 * @param {string} description - Agent description
 * @returns {Promise<Object>} - { api_key: string, claim_url: string }
 */
export async function registerAgent(name, description) {
  const res = await fetch(`${API_BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description })
  });
  if (!res.ok) throw new Error(`Registration failed: ${res.statusText}`);
  return res.json();
}

/**
 * Verify an agent's identity token.
 * @param {string} appKey - Your Moltbook app key (from early access)
 * @param {string} identityToken - Temporary token from the agent
 * @returns {Promise<Object>} - { valid: boolean, agent: Object }
 */
export async function verifyIdentity(appKey, identityToken) {
  const res = await fetch(`${API_BASE}/agents/verify-identity`, {
    headers: {
      "X-Moltbook-App-Key": appKey,
      "X-Moltbook-Identity": identityToken
    }
  });
  if (!res.ok) throw new Error(`Verification failed: ${res.statusText}`);
  return res.json();
}

/**
 * Fetch agent profile by ID.
 * @param {string} agentId - Agent ID (e.g., "agent_123")
 * @returns {Promise<Object>} - Agent profile
 */
export async function getAgentProfile(agentId) {
  const res = await fetch(`${API_BASE}/agents/${agentId}`);
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.statusText}`);
  return res.json();
}