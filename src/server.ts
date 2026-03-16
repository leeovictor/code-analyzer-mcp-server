import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'code-analyzer',
  version: '1.0.0',
});

// Tools serão registradas nas próximas fases:
// import { registerListFiles } from './tools/listFiles.js';
// import { registerGetFileContent } from './tools/getFileContent.js';
// import { registerSearchCode } from './tools/searchCode.js';
// import { registerFindFunction } from './tools/findFunction.js';
// import { registerFindReferences } from './tools/findReferences.js';
// import { registerDependencyGraph } from './tools/dependencyGraph.js';
// import { registerExplainFileStructure } from './tools/explainFileStructure.js';

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[code-analyzer] MCP server started. ROOT_DIR:', process.env.ROOT_DIR);
}

main().catch((err) => {
  console.error('[code-analyzer] Fatal error:', err);
  process.exit(1);
});
