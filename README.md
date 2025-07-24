# LangGraph Assistant with MCP

A LangGraph-based assistant that integrates with Model Context Protocol (MCP) servers to provide dynamic tool access and workflow orchestration.

## Features

- **Dynamic MCP Integration**: Automatically discover and load tools from MCP servers
- **LangGraph Workflows**: Structured agent workflows with state management  
- **Tool Execution**: Seamless execution of MCP tools within LangGraph flows
- **Multi-Server Support**: Connect to multiple MCP servers simultaneously
- **Examples & Notebooks**: Comprehensive examples covering agents, routing, orchestration, and more

## Quick Start

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure MCP servers**
   - Edit `mcp-servers-config.json` with your MCP server configurations
   - Set required environment variables (e.g., `NOTION_SECRET`)

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Add your API keys (OpenAI, etc.)
   ```

4. **Run the assistant**
   ```bash
   python main.py
   ```

## Configuration

The assistant automatically discovers MCP servers from `mcp-servers-config.json`. Currently configured servers:
- **Notion**: Workspace operations (pages, databases, blocks)

## Examples

Explore the `src/examples/` directory for comprehensive notebooks covering:
- Agent architectures
- Workflow orchestration  
- Routing and parallelization
- Prompt chaining
- Evaluation and optimization

## Project Structure

```
├── main.py                    # Main assistant application
├── src/
│   ├── mcp_wrapper.py         # MCP server integration
│   ├── state/                 # State management
│   ├── examples/              # Example notebooks
│   └── utils.py               # Utility functions
├── mcp-servers-config.json    # MCP server configurations
└── requirements.txt           # Dependencies
```

## Requirements

- Python ≥3.11.9
- OpenAI API key
- MCP server configurations (Notion, etc.) 