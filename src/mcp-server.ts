
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { runPipeline, PipelineContext } from './pipeline/orchestrator.js';
import { searchClaimsFTS, searchClaimsByTags } from './memory/claims.js';
import { mapAppLogic } from './utils/logic-mapper.js';
import { getDb } from './db/connection.js';
import { createEmitter } from './ws/broadcaster.js';

// Load .env
dotenvConfig({ path: join(homedir(), '.deep-research', '.env') });

const server = new Server(
  {
    name: "self-evo",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "research_query",
        description: "Trigger a deep multi-stage research pipeline on a topic. Use this for complex architecture, library comparisons, or learning new concepts.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The research query" },
            depth: { type: "string", enum: ["instant", "quick", "standard", "deep"], default: "standard" },
          },
          required: ["query"],
        },
      },
      {
        name: "kb_search",
        description: "Search the local Knowledge Base for verified claims and architectural patterns.",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search query or keywords" },
            tags: { type: "array", items: { type: "string" }, description: "Filter by tags (e.g. 'code', 'workflow')" },
          },
          required: ["q"],
        },
      },
      {
        name: "map_logic",
        description: "Generate a 'Logic Map' for an app idea. Shows the Input, Plumbing, Memory, and Output pipes needed to build it.",
        inputSchema: {
          type: "object",
          properties: {
            app_idea: { type: "string", description: "A description of the app you want to build (e.g. 'a scraper for tech news')" },
          },
          required: ["app_idea"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "map_logic") {
      const idea = String(args?.app_idea);
      const logicMap = mapAppLogic(idea);
      return {
        content: [{ type: "text", text: JSON.stringify(logicMap, null, 2) }],
      };
    }

    if (name === "research_query") {
      const query = String(args?.query);
      const depth = (args?.depth as any) || "standard";

      const ctx: PipelineContext = {
        query,
        depth,
        emit: () => {}, // Silent for MCP
        keys: {
          exa: process.env.EXA_API_KEY || '',
          serper: process.env.SERPER_API_KEY || '',
          groq: process.env.GROQ_API_KEY || '',
          mistral: process.env.MISTRAL_API_KEY || '',
          googleai: process.env.GOOGLE_AI_KEY || '',
        },
      };

      const report = await runPipeline(ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    }

    if (name === "kb_search") {
      const q = String(args?.q);
      const tags = args?.tags as string[];

      let results;
      if (tags && tags.length > 0) {
        results = searchClaimsByTags(tags);
      } else {
        results = searchClaimsFTS(q);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }
});

/**
 * Main function
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Self-Evo MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
