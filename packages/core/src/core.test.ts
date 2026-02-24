import { describe, it, expect } from "vitest";
import { AgentClass as Agent } from "./index"; // Presupun că există o clasă Agent

describe("ClawNet Core", () => {
  it("should create an agent with a name", () => {
    const agent = new Agent({ name: "TestAgent" });
    expect(agent.name).toBe("TestAgent");
  });

  it("should allow adding skills", () => {
    const agent = new Agent({ name: "TestAgent" });
    agent.addSkill("weather");
    expect(agent.capabilities.skills).toContain("weather");
  });
});