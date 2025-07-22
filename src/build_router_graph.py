import asyncio
from typing import Literal, TypedDict
from langgraph.graph import StateGraph
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import BaseMessage
from src.configuration import Configuration
from src import mcp_wrapper as mcp
from langchain_core.documents import Document
from src.retriever import make_retriever

class State(TypedDict):
    messages: list[BaseMessage]
    status: Literal["idle", "building", "success", "error"]

async def build_router(state: State, *, config: RunnableConfig): 
    """Build the router"""
    status = "idle"
    configuration = Configuration.from_runnable_config(config)
    mcp_servers = configuration.mcp_server_config["mcpServers"]

    try:
        # Gather routing descriptions directly without a shared dictionary
        routing_descriptions = await asyncio.gather(
            *[
                mcp.apply(server_name, server_config, mcp.RoutingDescription())
                for server_name, server_config in mcp_servers.items()
            ]
        )

        documents = [
            Document(page_content=description, metadata={"id": server_name})
            for server_name, description in routing_descriptions
        ]

        with make_retriever(config) as retriever:
            await retriever.aadd_documents(documents)

        print("=" * 100)
        print(documents)
        print("=" * 100)

        status = "success"
    except Exception as e:
        status = "error"
        print(f"Exception in run: {e}")

    return {"status": status}


graph = StateGraph(State)
graph.add_node("build_router", build_router)
graph.set_entry_point("build_router")
