import asyncio
import os
import json
import logging
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.prebuilt import create_react_agent

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class NotionSessionManager:
    """Manages the Notion MCP session lifecycle"""
    
    def __init__(self):
        self.notion_secret = os.getenv("NOTION_SECRET")
        self.server_params = StdioServerParameters(
            command="node",
            args=["C:/Users/corne/Projects/notion-mcp-server/bin/cli.mjs"],
            env={
                "OPENAPI_MCP_HEADERS": f"{{\"Authorization\": \"Bearer {self.notion_secret}\", \"Notion-Version\": \"2022-06-28\" }}"
            }
        )
        self.session = None
        self.stdio_context = None
        self.session_context = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.stdio_context = stdio_client(self.server_params)
        read, write = await self.stdio_context.__aenter__()
        
        self.session_context = ClientSession(read, write)
        self.session = await self.session_context.__aenter__()
        await self.session.initialize()
        
        return self.session
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session_context:
            await self.session_context.__aexit__(exc_type, exc_val, exc_tb)
        if self.stdio_context:
            await self.stdio_context.__aexit__(exc_type, exc_val, exc_tb)

async def get_tools(session):
    """Simple function to get Notion MCP tools from an active session"""
    return await load_mcp_tools(session)

async def main():
    """Main function - keeping session alive during agent execution"""
    
    async with NotionSessionManager() as session:
        tools = await get_tools(session)
        agent = create_react_agent("openai:gpt-4.1", tools)
        agent_response = await agent.ainvoke({
            "messages": "What is the latest task in my tasks database - e50e97145d4a466580f98e9a59cdb7e3?"
        })
        
        for m in agent_response["messages"]:
            m.pretty_print()

if __name__ == "__main__":
    asyncio.run(main())