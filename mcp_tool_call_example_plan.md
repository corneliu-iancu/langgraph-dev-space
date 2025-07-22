# MCP Tool Call Example - Implementation Plan

## Objective
Create a simplified example that isolates `mcp_wrapper.py` usage and demonstrates MCP tool calling capabilities without the complexity of retrieval systems.

## Inspiration
Taking inspiration from `build_router_graph.py` for MCP server detection and configuration handling, but simplifying the workflow.

## Plan Overview

### 1. Create Simple State Structure
```python
class SimpleMCPState(TypedDict):
    messages: list[BaseMessage]
    available_tools: list[dict[str, Any]]
    selected_server: str | None
    status: Literal["idle", "loading_tools", "ready", "calling_tool", "error"]
```

### 2. MCP Server Discovery Node
- **Function**: `discover_mcp_servers`
- **Purpose**: Detect and load all available MCP servers
- **Implementation**:
  - Load `mcp-servers-config.json` directly from the project root
  - Parse the JSON to access `mcpServers` configuration
  - Use `asyncio.gather()` with `mcp.GetTools()` to fetch all available tools
  - Store tools in state for later use

### 3. Tool Selection Node (Optional)
- **Function**: `select_tools_for_llm`
- **Purpose**: Filter or prepare tools for LLM binding
- **Implementation**:
  - Simple passthrough initially
  - Could add filtering logic later
  - Prepare tools in OpenAI function calling format

### 4. LLM with MCP Tools Node
- **Function**: `llm_with_mcp_tools`
- **Purpose**: Core LLM that can call MCP tools
- **Implementation**:
  - Bind available tools to LLM model
  - Process user message
  - Handle tool calls if generated
  - Return response

### 5. MCP Tool Execution Node
- **Function**: `execute_mcp_tool`
- **Purpose**: Execute actual MCP tool calls
- **Implementation**:
  - Extract tool call details from LLM response
  - Determine which MCP server handles the tool
  - Use `mcp.RunTool()` via `mcp.apply()`
  - Return tool results

### 6. Response Formatting Node
- **Function**: `format_response`
- **Purpose**: Format final response to user
- **Implementation**:
  - Combine LLM response with tool results
  - Create appropriate message format
  - Handle errors gracefully

## Simplified Architecture

```
User Input → Discover MCP Servers → LLM with MCP Tools → Execute MCP Tool → Format Response
```

## Key Simplifications from Current System

1. **No Retrieval System**: Direct tool calling without vector search/routing
2. **No Complex Routing**: All tools available to LLM directly
3. **Minimal State**: Only essential state tracking
4. **Single Graph**: One simple linear graph instead of multiple graphs
5. **Direct Tool Mapping**: Simple mapping of tool names to MCP servers

## File Structure

```
src/
├── examples/
│   ├── simple_mcp_example.py          # Main implementation
│   └── simple_mcp_state.py            # State definitions
└── mcp_wrapper.py                     # Existing (isolated usage)
```

## Implementation Steps

1. **Step 1**: Create `simple_mcp_state.py` with state definitions
2. **Step 2**: Implement MCP server discovery function
3. **Step 3**: Create LLM node with tool binding
4. **Step 4**: Implement MCP tool execution function
5. **Step 5**: Build the simple StateGraph
6. **Step 6**: Add basic error handling and logging
7. **Step 7**: Create usage example/demo

## Key Benefits

- **Isolated Usage**: Clear separation of MCP wrapper functionality
- **Simple Example**: Easy to understand and extend
- **Reusable Pattern**: Can be extended for more complex use cases
- **Direct Tool Access**: No routing complexity, all tools available
- **Minimal Dependencies**: Fewer moving parts, easier debugging

## Testing Strategy

1. **Unit Tests**: Test each node function independently
2. **Integration Test**: Full graph execution with mock MCP servers
3. **Real MCP Test**: Test with actual MCP server (e.g., filesystem, memory)
4. **Error Scenarios**: Test error handling and recovery

## Future Extensions

- Add tool filtering/selection logic
- Implement tool usage analytics
- Add caching for repeated tool calls
- Support for streaming responses
- Tool call parallelization 