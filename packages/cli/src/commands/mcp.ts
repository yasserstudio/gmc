import type { Command } from "commander";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description(
      "Start an MCP (Model Context Protocol) server over stdio — exposes gmc tools to AI assistants",
    )
    .action(async () => {
      const { createGmcMcpServer } = await import("@gmc-cli/mcp");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

      const opts = program.opts();
      const profile = opts["profile"] as string | undefined;
      const account = opts["account"] as string | undefined;
      const server = createGmcMcpServer({ profile, accountId: account });
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
