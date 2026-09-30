import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS, handleToolCall } from '../tools';
import { logger } from '../utils/logger';

function createServer() {
  const s = new Server({
    name: 'facebook-mcp-server',
    version: '1.0.0',
  }, {
    capabilities: { tools: {} }
  });

  s.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS
  }));

  s.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleToolCall(name, args || {});
    } catch (error: any) {
      logger.error(`Error executing tool ${name}:`, error.message);
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${error.message}` }]
      };
    }
  });

  return s;
}

async function main() {
  const mode = process.env.MCP_TRANSPORT || 'http';

  if (mode === 'stdio') {
    // ── Stdio transport (Claude Desktop / local MCP clients) ──────────
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Facebook MCP Server running (stdio).');
  } else {
    // ── Streamable HTTP transport ─────────────────────────────────────
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const expressModule = await import('express');
    const express = expressModule.default;
    const dotenv = await import('dotenv');
    dotenv.default.config();

    const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
    const app = express();
    app.use(express.json());

    // Health-check endpoint
    app.get('/health', (_req: any, res: any) => {
      res.json({ status: 'ok', server: 'facebook-mcp-server', version: '1.0.0' });
    });

    // MCP Streamable HTTP endpoint — stateless, one transport per request
    app.post('/mcp', async (req: any, res: any) => {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.listen(MCP_PORT, () => {
      logger.info('');
      logger.info('==============================================');
      logger.info(` Facebook MCP Server (HTTP) — port ${MCP_PORT}`);
      logger.info('==============================================');
      logger.info(` MCP URL     : http://localhost:${MCP_PORT}/mcp`);
      logger.info(` Health      : http://localhost:${MCP_PORT}/health`);
      logger.info('==============================================');
    });
  }
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
