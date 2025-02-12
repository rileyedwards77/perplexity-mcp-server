# Perplexity AI MCP Server

This project implements an MCP server that provides access to the Perplexity AI API.  The server files have been moved from the `perplexity-server` directory to the root directory for easier access.

## Features

*   Chatting with Perplexity AI
*   Searching with Perplexity AI
*   Getting documentation for technologies, libraries, and APIs
*   Finding APIs
*   Checking for deprecated code

## Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/fr0ziii/perplexity-mcp-server.git
    ```

2.  Install dependencies:

    ```bash
    cd perplexity-mcp-server
    npm install
    ```

3.  Configure the MCP server:

    *   Add the following configuration to your MCP settings file:

        ```json
        {
          "mcpServers": {
            "perplexity-server": {
              "command": "node",
              "args": [
                "./build/index.js"
              ],
              "env": {
                "PERPLEXITY_API_KEY": "your-perplexity-api-key"
              },
              "disabled": false,
              "autoApprove": []
            }
          }
        }
        ```

    *   Replace `your-perplexity-api-key` with your Perplexity AI API key.

## Usage

Once the server is configured, you can use the provided tools to interact with Perplexity AI.

## License

MIT
