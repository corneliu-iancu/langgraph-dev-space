import asyncio
import json
import os
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate

# Load environment variables
load_dotenv()

from src.state.simple_mcp_state import SimpleMCPState
from src.proxy.mcp_proxy import apply, GetLangChainTools, RunTool
from src.utils import load_chat_model


async def discover_mcp_servers(state: SimpleMCPState) -> SimpleMCPState:
    """
    Discover and load all available MCP servers from mcp-servers-config.json
    """
    print("🔍 Discovering MCP servers...")
    
    try:
        config_path = Path(__file__).parent.parent / "mcp-servers-config.json"
        with open(config_path, 'r') as f:
            config_data = json.load(f)
        mcp_servers = config_data.get("mcpServers", {})
        
        if not mcp_servers:
            print("⚠️ No MCP servers found in configuration")
            return {**state, "status": "error"}
        
        print(f"📋 Found {len(mcp_servers)} MCP server(s): {list(mcp_servers.keys())}")
        
        all_langchain_tools = []
        for server_name, server_config in mcp_servers.items():
            print(f"📝 Getting LangChain tools from server: {server_name}")
            
            langchain_tools = await apply(server_name, server_config, GetLangChainTools())
            all_langchain_tools.extend(langchain_tools)
            
            print(f"✅ Got {len(langchain_tools)} LangChain tools from {server_name}")
        
        print(f"✅ Successfully collected {len(all_langchain_tools)} LangChain tools from MCP servers")
        
        return {
            **state,
            "available_tools": all_langchain_tools,  # Store LangChain tools for binding
            "mcp_servers": mcp_servers,  # Store configs for on-demand execution  
            "status": "loading_tools"
        }
        
    except FileNotFoundError:
        print("❌ mcp-servers-config.json not found")
        return {**state, "status": "error"}
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse mcp-servers-config.json: {e}")
        return {**state, "status": "error"}
    except Exception as e:
        print(f"❌ Error discovering MCP servers: {e}")
        return {**state, "status": "error"}

async def llm_with_mcp_tools(state: SimpleMCPState) -> SimpleMCPState:
    """
    LLM node that can call MCP tools
    Binds available tools to LLM and processes user messages
    """
    print("🤖 LLM processing message...")
    
    try:
        messages = state.get("messages", [])
        available_tools = state.get("available_tools", [])
        
        if not messages:
            print("⚠️ No messages to process")
            return {**state, "status": "error"}
        
        # Simple system prompt for our example
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant with access to various tools. Use them when needed to help the user."),
            ("placeholder", "{messages}")
        ])
        
        # Load the chat model
        model = load_chat_model("openai/gpt-4o-mini")
        
        if available_tools:
            print(f"🔗 Binding {len(available_tools)} LangChain tools to LLM")
            llm_with_tools = model.bind_tools(available_tools)
        else:
            print("⚠️ No tools available for binding")
            llm_with_tools = model
        
        # Create prompt with messages
        formatted_prompt = await prompt.ainvoke({"messages": messages})
        
        response = await llm_with_tools.ainvoke(formatted_prompt)

        # Check if response has tool calls
        if hasattr(response, 'tool_calls') and response.tool_calls:
            print(f"🔧 LLM generated {len(response.tool_calls)} tool call(s)")
            status = "calling_tool"
        else:
            print("💬 LLM generated text response")
            status = "ready"
        
        updated_messages = messages + [response]
        
        return {
            **state,
            "messages": updated_messages,
            "status": status
        }
        
    except Exception as e:
        print(f"❌ Error in LLM processing: {e}")
        return {**state, "status": "error"}


async def execute_mcp_tool(state: SimpleMCPState) -> SimpleMCPState:
    """
    Execute MCP tool calls from the LLM response
    """
    print("⚡ Executing MCP tools...")
    
    try:
        messages = state.get("messages", [])
        
        if not messages:
            print("⚠️ No messages to process")
            return {**state, "status": "error"}
        
        last_message = messages[-1]
        
        # Check if last message has tool calls
        if not (hasattr(last_message, 'tool_calls') and last_message.tool_calls):
            print("⚠️ No tool calls found in last message")
            return {**state, "status": "error"}
        
        # Get server configs for on-demand execution
        mcp_servers = state.get("mcp_servers", {})
        
        # Execute all tool calls using on-demand MCP server spawning
        tool_messages = []
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_call_id = tool_call["id"]
            
            print(f"🔧 Executing tool: {tool_name} with args: {tool_args}")
            
            # Find which server handles this tool and execute with fresh session
            tool_executed = False
            
            for server_name, server_config in mcp_servers.items():
                try:
                    # Use mcp.apply pattern - spawns fresh process each time
                    tool_output = await apply(
                        server_name,
                        server_config, 
                        RunTool(tool_name, **tool_args)
                    )
                    
                    print(f"✅ Tool {tool_name} executed successfully on server {server_name}")
                    tool_messages.append(
                        ToolMessage(
                            content=str(tool_output),
                            tool_call_id=tool_call_id
                        )
                    )
                    tool_executed = True
                    break
                    
                except Exception as e:
                    print(f"⚠️ Tool {tool_name} failed on server {server_name}: {e}")
                    continue
            
            if not tool_executed:
                print(f"❌ Tool {tool_name} could not be executed on any server")
                tool_messages.append(
                    ToolMessage(
                        content=f"Error: Tool {tool_name} could not be executed",
                        tool_call_id=tool_call_id
                    )
                )
        
        updated_messages = messages + tool_messages
        
        print(f"✅ Executed {len(tool_messages)} tool call(s)")
        
        return {
            **state,
            "messages": updated_messages,
            "status": "ready"
        }
        
    except Exception as e:
        print(f"❌ Error executing MCP tools: {e}")
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
