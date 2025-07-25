import asyncio
import json
import os
import sys
import logging
from pathlib import Path
from typing import Any
from dotenv import load_dotenv

# Add project root to Python path for direct execution
if __name__ == "__main__":
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate

# Load environment variables
load_dotenv()

from src.state.simple_mcp_state import SimpleMCPState
from src.proxy.mcp_proxy import apply, GetLangChainTools, RunTool
from src.utils import load_chat_model, extract_error_details, log_tool_execution

# Configure logging
logger = logging.getLogger(__name__)


async def discover_mcp_servers(state: SimpleMCPState) -> SimpleMCPState:
    """
    Discover and load all available MCP servers from mcp-servers-config.json
    """
    logger.info("🔍 Starting MCP server discovery...")
    
    try:
        config_path = Path(__file__).parent.parent / "mcp-servers-config.json"
        logger.debug(f"Loading MCP config from: {config_path}")
        
        with open(config_path, 'r') as f:
            config_data = json.load(f)
        mcp_servers = config_data.get("mcpServers", {})
        
        if not mcp_servers:
            logger.warning("⚠️ No MCP servers found in configuration")
            return {**state, "status": "error"}
        
        logger.info(f"📋 Found {len(mcp_servers)} MCP server(s): {list(mcp_servers.keys())}")
        
        all_langchain_tools = []
        for server_name, server_config in mcp_servers.items():
            logger.info(f"📝 Getting LangChain tools from server: {server_name}")
            logger.debug(f"Server config: {server_config}")
            
            try:
                langchain_tools = await apply(server_name, server_config, GetLangChainTools())
                all_langchain_tools.extend(langchain_tools)
                
                logger.info(f"✅ Got {len(langchain_tools)} LangChain tools from {server_name}")
                if langchain_tools:
                    tool_names = [tool.name for tool in langchain_tools if hasattr(tool, 'name')]
                    logger.debug(f"Tools from {server_name}: {tool_names}")
                    
            except Exception as e:
                logger.error(f"❌ Failed to get tools from server {server_name}: {e}")
                # Continue with other servers
                continue
        
        logger.info(f"✅ Successfully collected {len(all_langchain_tools)} LangChain tools from MCP servers")
        
        return {
            **state,
            "available_tools": all_langchain_tools,  # Store LangChain tools for binding
            "mcp_servers": mcp_servers,  # Store configs for on-demand execution  
            "status": "loading_tools"
        }
        
    except FileNotFoundError:
        logger.error("❌ mcp-servers-config.json not found")
        return {**state, "status": "error"}
    except json.JSONDecodeError as e:
        logger.error(f"❌ Failed to parse mcp-servers-config.json: {e}")
        return {**state, "status": "error"}
    except Exception as e:
        logger.error(f"❌ Error discovering MCP servers: {e}")
        return {**state, "status": "error"}

async def llm_with_mcp_tools(state: SimpleMCPState) -> SimpleMCPState:
    """
    LLM node that can call MCP tools
    Binds available tools to LLM and processes user messages
    """
    logger.info("🤖 Starting LLM processing...")
    
    try:
        messages = state.get("messages", [])
        available_tools = state.get("available_tools", [])
        
        if not messages:
            logger.warning("⚠️ No messages to process")
            return {**state, "status": "error"}
        
        logger.info(f"📝 Processing {len(messages)} message(s)")
        logger.debug(f"Last message type: {type(messages[-1]).__name__}")
        
        # Simple system prompt for our example
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant with access to various tools. Use them when needed to help the user."),
            ("placeholder", "{messages}")
        ])
        
        # Load the chat model
        logger.debug("Loading chat model...")
        model = load_chat_model("azure_openai")
        
        if available_tools:
            logger.info(f"🔗 Binding {len(available_tools)} LangChain tools to LLM")
            tool_names = [tool.name for tool in available_tools if hasattr(tool, 'name')]
            logger.debug(f"Available tools: {tool_names}")
            llm_with_tools = model.bind_tools(available_tools)
        else:
            logger.warning("⚠️ No tools available for binding")
            llm_with_tools = model
        
        # Create prompt with messages
        logger.debug("Creating prompt and invoking LLM...")
        formatted_prompt = await prompt.ainvoke({"messages": messages})
        
        response = await llm_with_tools.ainvoke(formatted_prompt)

        # Check if response has tool calls
        if hasattr(response, 'tool_calls') and response.tool_calls:
            logger.info(f"🔧 LLM generated {len(response.tool_calls)} tool call(s)")
            tool_names = [call.get('name', 'unknown') for call in response.tool_calls]
            logger.debug(f"Tool calls requested: {tool_names}")
            status = "calling_tool"
        else:
            logger.info("💬 LLM generated text response")
            logger.info(f"🆕 Response preview: {str(response.content)[:100]}...")
            status = "ready"
        
        updated_messages = messages + [response]
        
        return {
            **state,
            "messages": updated_messages,
            "status": status
        }
        
    except Exception as e:
        logger.error(f"❌ Error in LLM processing: {e}")
        return {**state, "status": "error"}


async def execute_single_tool(tool_call: dict, mcp_servers: dict) -> ToolMessage:
    """Execute a single tool call across available servers"""
    tool_name = tool_call["name"]
    tool_args = tool_call["args"]
    tool_call_id = tool_call["id"]
    
    # logger.debug(f"Executing tool: {tool_name} with args: {tool_args}")
    logger.debug(f"Executing tool: {tool_name}.")
    
    last_error = None
    for server_name, server_config in mcp_servers.items():
        try:
            log_tool_execution(tool_name, server_name, tool_args, "started")
            
            tool_output = await apply(server_name, server_config, RunTool(tool_name, **tool_args))
            
            log_tool_execution(tool_name, server_name, tool_args, "success", str(tool_output)[:100])
            return ToolMessage(content=str(tool_output), tool_call_id=tool_call_id)
            
        except Exception as e:
            last_error = e
            error_details = extract_error_details(e)
            log_tool_execution(tool_name, server_name, tool_args, "failed", error_details)
            
            # Stop trying other servers for validation errors
            if "validation_error" in str(e).lower() or "400" in str(e):
                logger.info(f"🛑 Validation error for {tool_name}, stopping server attempts")
                return ToolMessage(content=error_details, tool_call_id=tool_call_id)
    
    # No server could execute the tool
    final_error = extract_error_details(last_error) if last_error else f"Tool {tool_name} not found on any server"
    logger.error(f"❌ Tool {tool_name} failed on all servers")
    return ToolMessage(content=f"Error: {final_error}", tool_call_id=tool_call_id)


async def process_tool_calls(tool_calls: list, mcp_servers: dict) -> list[ToolMessage]:
    """Process all tool calls and return tool messages"""
    tool_messages = []
    total_tools = len(tool_calls)
    logger.info(f"🔧 Processing {total_tools} tool call(s)")
    
    for i, tool_call in enumerate(tool_calls, 1):
        logger.info(f"🔧 [{i}/{total_tools}] Executing tool: {tool_call['name']}")
        tool_message = await execute_single_tool(tool_call, mcp_servers)
        tool_messages.append(tool_message)
    
    return tool_messages


async def execute_mcp_tool(state: SimpleMCPState) -> SimpleMCPState:
    """Execute MCP tool calls from the LLM response"""
    logger.info("⚡ Starting MCP tool execution phase...")
    
    try:
        messages = state.get("messages", [])
        if not messages:
            logger.warning("⚠️ No messages to process")
            return {**state, "status": "error"}
        
        last_message = messages[-1]
        if not (hasattr(last_message, 'tool_calls') and last_message.tool_calls):
            logger.warning("⚠️ No tool calls found")
            return {**state, "status": "error"}
        
        mcp_servers = state.get("mcp_servers", {})
        logger.info(f"📋 Found {len(mcp_servers)} MCP servers: {list(mcp_servers.keys())}")
        
        # Process all tool calls
        tool_messages = await process_tool_calls(last_message.tool_calls, mcp_servers)
        
        # Log summary
        successful = sum(1 for msg in tool_messages if not msg.content.startswith("Error:"))
        failed = len(tool_messages) - successful
        logger.info(f"✅ Tool execution completed: {successful} successful, {failed} failed")
        
        return {
            **state,
            "messages": messages + tool_messages,
            "status": "ready"
        }
        
    except Exception as e:
        logger.error(f"❌ Critical error in tool execution phase: {e}")
        return {**state, "status": "error"}


def should_continue(state: SimpleMCPState) -> str:
    """
    Determine if we should continue to tool execution or end
    """
    messages = state.get("messages", [])
    
    if not messages:
        return END
    
    last_message = messages[-1]
    
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "execute_tools"
    
    if isinstance(last_message, ToolMessage):
        return "llm_with_tools"
    
    # Otherwise, we're done
    return END


# Create the graph
graph = StateGraph(SimpleMCPState)
graph.add_node("discover_servers", discover_mcp_servers)
graph.add_node("llm_with_tools", llm_with_mcp_tools)
graph.add_node("execute_tools", execute_mcp_tool)

graph.set_entry_point("discover_servers")
graph.add_edge("discover_servers", "llm_with_tools")

graph.add_conditional_edges(
    "llm_with_tools",
    should_continue,
    {
        "execute_tools": "execute_tools",
        END: END
    }
)

graph.add_edge("execute_tools", "llm_with_tools")

graph = graph.compile()


if __name__ == "__main__":
    asyncio.run(graph.ainvoke({"messages": [HumanMessage(content="What is the current time?")]}))
