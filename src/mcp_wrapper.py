from abc import ABC, abstractmethod
import asyncio
import os
from datetime import datetime
from typing import Any
from mcp import (
    ClientSession,
    StdioServerParameters,
    stdio_client,
)
import pydantic_core
from langchain_core.tools import ToolException
from langchain_mcp_adapters.tools import load_mcp_tools


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
        result = await session.call_tool(self.tool_name, arguments=self.kwargs)
        content = pydantic_core.to_json(result.content).decode()
        if result.isError:
            raise ToolException(content)
        return content


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

    print(f"📝 [{datetime.now().isoformat()}] Starting session with (server: {server_name})")
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await fn(server_name, session)
