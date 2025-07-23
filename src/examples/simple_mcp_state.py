from typing import TypedDict, Literal, Any
from langchain_core.messages import BaseMessage


class SimpleMCPState(TypedDict):
    messages: list[BaseMessage]
    available_tools: list[Any]  # Now stores actual LangChain tool objects instead of schemas
    mcp_servers: dict[str, Any]  # MCP server configurations for on-demand execution
    server_manager: Any | None  # MCPServerManager instance for managing persistent sessions
    status: Literal["idle", "loading_tools", "ready", "calling_tool", "error", "finished"] 