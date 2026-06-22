import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@gmc-cli/config", () => ({
  getConfigDir: () => "/tmp/gmc-test",
  loadConfig: () => ({}),
  resolveProfile: () => ({ name: "default" }),
}));

vi.mock("@gmc-cli/auth", () => ({
  resolveAuth: vi.fn(async () => ({
    getAccessToken: async () => "tok",
    getClientEmail: () => "test@test.iam.gserviceaccount.com",
    getProjectId: () => "test-project",
  })),
}));

import { createGmcMcpServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("MCP server", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createGmcMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  it("lists all expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "accounts_get",
      "accounts_list",
      "datasources_list",
      "doctor",
      "issues_account",
      "preflight",
      "products_delete",
      "products_get",
      "products_insert",
      "products_list",
      "quota_list",
      "reports_query",
    ]);
  });

  it("each tool has a description", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("each tool has a valid input schema", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});
