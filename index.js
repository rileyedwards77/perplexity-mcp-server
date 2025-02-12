#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "path";
import { homedir } from "os";
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
    throw new Error("PERPLEXITY_API_KEY environment variable is required");
}
class PerplexityServer {
    constructor() {
        this.server = new Server({
            name: "perplexity-server",
            version: "0.1.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
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
        process.on("SIGINT", () => __awaiter(this, void 0, void 0, function* () {
            yield this.server.close();
            process.exit(0);
        }));
    }
    getChatHistory() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = yield readFile(this.chatHistoryFile, "utf-8");
                return JSON.parse(data);
            }
            catch (error) {
                if (error.code === "ENOENT") {
                    // File does not exist, return empty history
                    return {};
                }
                throw error;
            }
        });
    }
    saveChatHistory(history) {
        return __awaiter(this, void 0, void 0, function* () {
            yield writeFile(this.chatHistoryFile, JSON.stringify(history, null, 2), "utf-8");
        });
    }
    getMessagesForChat(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const history = yield this.getChatHistory();
            return history[chatId] || [];
        });
    }
    addMessageToChat(chatId, message) {
        return __awaiter(this, void 0, void 0, function* () {
            const history = yield this.getChatHistory();
            if (!history[chatId]) {
                history[chatId] = [];
            }
            history[chatId].push(message);
            yield this.saveChatHistory(history);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, () => __awaiter(this, void 0, void 0, function* () {
            return ({
                tools: [
                    {
                        name: "chat_perplexity",
                        description: "Maintains ongoing conversations with Perplexity AI. Creates new chats or continues existing ones with full history context.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    description: "The message to send to Perplexity AI",
                                },
                                chat_id: {
                                    type: "string",
                                    description: "Optional: ID of an existing chat to continue. If not provided, a new chat will be created.",
                                },
                            },
                            required: ["message"],
                        },
                    },
                    {
                        name: "search",
                        description: "Perform a general search query to get comprehensive information on any topic",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The search query or question",
                                },
                                detail_level: {
                                    type: "string",
                                    description: "Optional: Desired level of detail (brief, normal, detailed)",
                                    enum: ["brief", "normal", "detailed"],
                                },
                            },
                            required: ["query"],
                        },
                    },
                    {
                        name: "get_documentation",
                        description: "Get documentation and usage examples for a specific technology, library, or API",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The technology, library, or API to get documentation for",
                                },
                                context: {
                                    type: "string",
                                    description: "Additional context or specific aspects to focus on",
                                },
                            },
                            required: ["query"],
                        },
                    },
                    {
                        name: "find_apis",
                        description: "Find and evaluate APIs that could be integrated into a project",
                        inputSchema: {
                            type: "object",
                            properties: {
                                requirement: {
                                    type: "string",
                                    description: "The functionality or requirement you're looking to fulfill",
                                },
                                context: {
                                    type: "string",
                                    description: "Additional context about the project or specific needs",
                                },
                            },
                            required: ["requirement"],
                        },
                    },
                    {
                        name: "check_deprecated_code",
                        description: "Check if code or dependencies might be using deprecated features",
                        inputSchema: {
                            type: "object",
                            properties: {
                                code: {
                                    type: "string",
                                    description: "The code snippet or dependency to check",
                                },
                                technology: {
                                    type: "string",
                                    description: "The technology or framework context (e.g., 'React', 'Node.js')",
                                },
                            },
                            required: ["code"],
                        },
                    },
                ],
            });
        }));
        this.server.setRequestHandler(CallToolRequestSchema, (request) => __awaiter(this, void 0, void 0, function* () {
            try {
                switch (request.params.name) {
                    case "chat_perplexity": {
                        const { message, chat_id = crypto.randomUUID() } = request.params.arguments;
                        // Get chat history
                        const history = yield this.getMessagesForChat(chat_id);
                        // Add new user message
                        const userMessage = { role: "user", content: message };
                        yield this.addMessageToChat(chat_id, userMessage);
                        // Prepare messages array with history
                        const messages = [...history, userMessage];
                        // Call Perplexity API
                        const response = yield this.axiosInstance.post("/chat/completions", {
                            model: "sonar-reasoning-pro",
                            messages,
                        });
                        // Save assistant's response
                        const assistantMessage = {
                            role: "assistant",
                            content: response.data.choices[0].message.content,
                        };
                        yield this.addMessageToChat(chat_id, assistantMessage);
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({
                                        chat_id,
                                        response: assistantMessage.content,
                                    }, null, 2),
                                },
                            ],
                        };
                    }
                    case "get_documentation": {
                        const { query, context = "" } = request.params.arguments;
                        const response = yield this.axiosInstance.get(`/search?q=documentation ${query} ${context}`);
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
                        const { query, detail_level = "normal" } = request.params.arguments;
                        const response = yield this.axiosInstance.get(`/search?q=${query}&details=${detail_level}`);
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
                            .arguments;
                        const response = yield this.axiosInstance.get(`/search?q=API for ${requirement} ${context}`);
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
                        const { code, technology = "" } = request.params.arguments;
                        const response = yield this.axiosInstance.get(`/search?q=deprecated code ${code} ${technology}`);
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
                        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
                }
            }
            catch (error) {
                console.error("Error calling Perplexity API:", error);
                throw new McpError(ErrorCode.InternalError, `Perplexity API error: ${error.message}`);
            }
        }));
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const transport = new StdioServerTransport();
            yield this.server.connect(transport);
            console.error("Perplexity MCP server running on stdio");
        });
    }
}
const server = new PerplexityServer();
server.run().catch(console.error);
