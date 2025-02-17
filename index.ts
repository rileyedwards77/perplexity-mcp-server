#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "path";
import { homedir } from "os";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  throw new Error("PERPLEXITY_API_KEY environment variable is required");
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatHistory {
  [chatId: string]: ChatMessage[];
}

class PerplexityServer {
  private server: Server;
  private axiosInstance;
  private chatHistoryFile: string;

  constructor() {
    this.server = new Server(
      {
        name: "perplexity-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: "https://api.perplexity.ai",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    this.chatHistoryFile = join(homedir(), ".perplexity-mcp", "chat_history.json");

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async getChatHistory(): Promise<ChatHistory> {
    try {
      const data = await readFile(this.chatHistoryFile, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File does not exist, return empty history
        return {};
      }
      throw error;
    }
  }

  private async saveChatHistory(history: ChatHistory) {
    await writeFile(this.chatHistoryFile, JSON.stringify(history, null, 2), "utf-8");
  }

  private async getMessagesForChat(chatId: string): Promise<ChatMessage[]> {
    const history = await this.getChatHistory();
    return history[chatId] || [];
  }

  private async addMessageToChat(chatId: string, message: ChatMessage) {
    const history = await this.getChatHistory();
    if (!history[chatId]) {
      history[chatId] = [];
    }
    history[chatId].push(message);
    await this.saveChatHistory(history);
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "chat_perplexity",
          description:
            "Maintains ongoing conversations with Perplexity AI. Creates new chats or continues existing ones with full history context.",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to send to Perplexity AI",
              },
              chat_id: {
                type: "string",
                description:
                  "Optional: ID of an existing chat to continue. If not provided, a new chat will be created.",
              },
            },
            required: ["message"],
          },
        },
        {
          name: "search",
          description:
            "Perform a general search query to get comprehensive information on any topic",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query or question",
              },
              detail_level: {
                type: "string",
                description:
                  "Optional: Desired level of detail (brief, normal, detailed)",
                enum: ["brief", "normal", "detailed"],
              },
            },
            required: ["query"],
          },
        },
        {
          name: "get_documentation",
          description:
            "Get documentation and usage examples for a specific technology, library, or API",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "The technology, library, or API to get documentation for",
              },
              context: {
                type: "string",
                description:
                  "Additional context or specific aspects to focus on",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "find_apis",
          description:
            "Find and evaluate APIs that could be integrated into a project",
          inputSchema: {
            type: "object",
            properties: {
              requirement: {
                type: "string",
                description:
                  "The functionality or requirement you're looking to fulfill",
              },
              context: {
                type: "string",
                description:
                  "Additional context about the project or specific needs",
              },
            },
            required: ["requirement"],
          },
        },
        {
          name: "check_deprecated_code",
          description:
            "Check if code or dependencies might be using deprecated features",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The code snippet or dependency to check",
              },
              technology: {
                type: "string",
                description:
                  "The technology or framework context (e.g., 'React', 'Node.js')",
              },
            },
            required: ["code"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "chat_perplexity": {
            const { message, chat_id = crypto.randomUUID() } =
              request.params.arguments as {
                message: string;
                chat_id?: string;
              };

            // Get chat history
            const history = await this.getMessagesForChat(chat_id);

            // Add new user message
            const userMessage: ChatMessage = { role: "user", content: message };
            await this.addMessageToChat(chat_id, userMessage);

            // Prepare messages array with history
            const messages = [...history, userMessage];

            // Call Perplexity API
            const response = await this.axiosInstance.post("/chat/completions", {
              model: "sonar-medium-online",
              messages,
            });

            // Save assistant's response
            const assistantMessage: ChatMessage = {
              role: "assistant",
              content: response.data.choices[0].message.content,
            };
            await this.addMessageToChat(chat_id, assistantMessage);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      chat_id,
                      response: assistantMessage.content,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "get_documentation": {
            const { query, context = "" } =
              request.params.arguments as {
                query: string;
                context?: string;
              };
            const response = await this.axiosInstance.post('/search', {
              query: `documentation ${query} ${context}`
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          }

          case "search": {
            const { query, detail_level = "normal" } =
              request.params.arguments as {
                query: string;
                detail_level?: string;
              };

            // Map detail level to model
            const model = detail_level === "detailed" ? "sonar-reasoning-pro" :  // Most expensive, best reasoning
                        detail_level === "brief" ? "sonar" :                     // Basic, cheapest at $1/$1
                        "sonar-reasoning";                                       // Middle ground at $1/$5
            
            // System prompt optimized for Claude
            const systemPrompt = `You are providing search results to Claude, an AI assistant.
            Skip unnecessary explanations - Claude can interpret and explain the data itself.`;
            
            // Call Perplexity API
            // Note: max_tokens could be increased for detailed responses, but consider cost implications
            // sonar-reasoning-pro can use >1000 tokens and does multiple searches
            console.error('Sending request:', JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
              ],
              max_tokens: 1000,
              temperature: 0.2,
              top_p: 0.9
            }, null, 2));
            const response = await this.axiosInstance.post('/chat/completions', {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
              ],
              max_tokens: 1000,
              temperature: 0.2,
              top_p: 0.9
            });
            console.error('Got response:', response.data);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          }

          case "find_apis": {
            const { requirement, context = "" } = request.params
              .arguments as {
              requirement: string;
              context?: string;
            };
            const response = await this.axiosInstance.post('/search', {
              query: `API for ${requirement} ${context}`
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          }

          case "check_deprecated_code": {
            const { code, technology = "" } = request.params.arguments as {
              code: string;
              technology?: string;
            };
            const response = await this.axiosInstance.post('/search', {
              query: `deprecated code ${code} ${technology}`
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Tool not found: ${request.params.name}`
            );
        }
      } catch (error: any) {
        console.error("Error calling Perplexity API:", error);
        throw new McpError(
          ErrorCode.InternalError,
          `Perplexity API error: ${error.message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Perplexity MCP server running on stdio");
  }
}

const server = new PerplexityServer();
server.run().catch(console.error);
