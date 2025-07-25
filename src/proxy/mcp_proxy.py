from abc import ABC, abstractmethod
import asyncio
import os
import logging
from datetime import datetime
from typing import Any
from mcp import (
    ClientSession,
    StdioServerParameters,
    stdio_client,
)
# Add SSE client support for URL-based servers
try:
    from mcp.client.sse import sse_client
    SSE_AVAILABLE = True
except ImportError:
    SSE_AVAILABLE = False
    print("⚠️ SSE client not available, URL-based servers will not work")

import pydantic_core
from langchain_core.tools import ToolException
from langchain_mcp_adapters.tools import load_mcp_tools

# Configure logging
logger = logging.getLogger(__name__)


class MCPSessionFunction(ABC):
    @abstractmethod
    async def __call__(self, server_name: str, session: ClientSession) -> Any:
        pass


class GetLangChainTools(MCPSessionFunction):
    """Get tools using the LangChain MCP adapter for proper format conversion"""
    async def __call__(
        self, server_name: str, session: ClientSession
    ) -> list[Any]:
        # Use the adapter to get properly formatted LangChain tools
        return await load_mcp_tools(session)


class RunTool(MCPSessionFunction):
    def __init__(self, tool_name: str, **kwargs):
        self.tool_name = tool_name
        self.kwargs = kwargs

    async def __call__(
        self,
        server_name: str,
        session: ClientSession,
    ) -> Any:
        logger.info(f"🔧 Executing tool '{self.tool_name}' on server '{server_name}' with args: {self.kwargs}")
        
        try:
            result = await session.call_tool(self.tool_name, arguments=self.kwargs)
            content = pydantic_core.to_json(result.content).decode()
            
            if result.isError:
                logger.error(f"❌ MCP tool '{self.tool_name}' returned error: {content}")
                # Preserve full error context with structured information
                raise ToolException(f"MCP Tool Error from {server_name}: {content}")
            
            logger.info(f"✅ Tool '{self.tool_name}' executed successfully on '{server_name}'")
            logger.debug(f"Tool result preview: {content[:100]}...")
            return content
            
        except ToolException:
            # Re-raise ToolException with preserved context
            raise
        except Exception as e:
            logger.error(f"❌ Unexpected error executing tool '{self.tool_name}' on '{server_name}': {e}")
            raise ToolException(f"Tool execution failed on {server_name}: {str(e)}")


def interpolate_env_vars(value: str, env_vars: dict) -> str:
    """Interpolate environment variables in format ${VAR_NAME}"""
    import re
    
    def replace_var(match):
        var_name = match.group(1)
        return env_vars.get(var_name, match.group(0))  # Return original if not found
    
    return re.sub(r'\$\{([^}]+)\}', replace_var, value)


async def apply(server_name: str, server_config: dict, fn: MCPSessionFunction) -> Any:
    # Non-blocking environment access
    env_vars = await asyncio.to_thread(lambda: dict(os.environ))
    
    # Check if this is a URL-based server
    if "url" in server_config:
        if not SSE_AVAILABLE:
            raise Exception(f"SSE client not available for URL-based server: {server_name}")
        
        url = server_config["url"]
        print(f"📝 [{datetime.now().isoformat()}] Starting SSE session with URL-based server: {server_name} ({url})")
        
        # For URL-based servers, use SSE client
        async with sse_client(url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await fn(server_name, session)
    
    else:
        # Handle stdio-based servers (existing logic)
        if "command" not in server_config or "args" not in server_config:
            raise Exception(f"Server {server_name} must have either 'url' or both 'command' and 'args'")
        
        # Interpolate environment variables in server config
        server_env = server_config.get("env") or {}
        interpolated_env = {}
        for key, value in server_env.items():
            if isinstance(value, str):
                interpolated_env[key] = interpolate_env_vars(value, env_vars)
            else:
                interpolated_env[key] = value

        server_params = StdioServerParameters(
            command=server_config["command"],
            args=server_config["args"],
            env={**env_vars, **interpolated_env},
        )

        print(f"📝 [{datetime.now().isoformat()}] Starting stdio session with server: {server_name}")
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await fn(server_name, session)
