from typing import TypedDict, Annotated, Sequence
from langgraph.graph import add_messages
from langchain_core.messages import AnyMessage
from dataclasses import dataclass, field
from langchain_core.documents import Document

def add_queries(existing: Sequence[str], new: Sequence[str]) -> Sequence[str]:
    """Combine existing queries with new queries.

    Args:
        existing (Sequence[str]): The current list of queries in the state.
        new (Sequence[str]): The new queries to be added.

    Returns:
        Sequence[str]: A new list containing all queries from both input sequences.
    """
    return list(existing) + list(new)

class BuilderState(TypedDict):
    pass

@dataclass(kw_only=True)
class InputState:
    """Represents the input state for the agent.

    This class defines the structure of the input state, which includes
    the messages exchanged between the user and the agent. It serves as
    a restricted version of the full State, providing a narrower interface
    to the outside world compared to what is maintained internally.
    """
    messages: Annotated[Sequence[AnyMessage], add_messages]
    """Messages track the primary execution state of the agent.
    
    Follows a Human/AI conversational pattern, potentially including tool calls.
    Messages are append-only unless a new message has the same ID as an existing one."""

@dataclass(kw_only=True)
class State(InputState):
    """The state of your graph / agent."""

    queries: Annotated[list[str], add_queries] = field(default_factory=list)
    """A list of search queries that the agent has generated."""

    retrieved_docs: list[Document] = field(default_factory=list)
    """Populated by the retriever. This is a list of documents that the agent can reference."""

    current_mcp_server: str = field(default="")

    current_tool: dict[str, str] = field(default_factory=dict)

    summarized_memory: str = field(
        default="",
        metadata={"description": "Persistent conversation memory."}
    )