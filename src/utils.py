import os
import json
import logging
from datetime import datetime
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import AzureChatOpenAI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def load_chat_model(fully_specified_name: str) -> BaseChatModel:
    """Load a chat model from a fully specified name.

    Args:
        fully_specified_name (str): String in the format 'provider/model' or just model name.
                                   For Azure OpenAI, this can be 'azure/gpt-4o-mini' or just 'gpt-4o-mini'.
    """
    # Extract model name
    if "/" in fully_specified_name:
        provider, model = fully_specified_name.split("/", maxsplit=1)
    else:
        provider = "azure"  # Default to Azure
        model = fully_specified_name
    
    # Configure Azure OpenAI
    if provider.lower() in ["azure", "azure_openai"]:
        return AzureChatOpenAI(
            azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
            temperature=0,
            max_tokens=None,
            timeout=None,
            max_retries=2,
        )
    else:
        # Fallback to original implementation for other providers
        from langchain.chat_models import init_chat_model
        return init_chat_model(model, model_provider=provider)


def extract_error_details(exception: Exception) -> str:
    """Extract meaningful error details for LLM feedback
    
    Args:
        exception: The exception caught during tool execution
        
    Returns:
        str: Formatted error message suitable for LLM understanding
    """
    logger.error(f"Extracting error details from: {type(exception).__name__}: {exception}")
    
    # Handle ToolException from MCP
    if hasattr(exception, '__class__') and 'ToolException' in str(type(exception)):
        try:
            error_content = str(exception)
            logger.debug(f"Raw ToolException content: {error_content}")
            
            # Try to parse as JSON first
            try:
                error_data = json.loads(error_content)
                if isinstance(error_data, dict):
                    return format_structured_error(error_data)
            except json.JSONDecodeError:
                pass
            
            # If not JSON, check for common error patterns
            if "validation_error" in error_content.lower():
                return f"Validation Error: {error_content[:300]}..."
            elif "400 bad request" in error_content.lower():
                return format_http_error(error_content, 400)
            elif "401" in error_content:
                return format_http_error(error_content, 401)
            elif "404" in error_content:
                return format_http_error(error_content, 404)
            
            return f"Tool execution error: {error_content}"
            
        except Exception as parse_error:
            logger.warning(f"Failed to parse ToolException: {parse_error}")
            return f"Tool execution failed: {str(exception)}"
    
    # Handle other exception types
    return f"Unexpected error during tool execution: {str(exception)}"


def format_structured_error(error_data: dict) -> str:
    """Format structured error data for LLM understanding
    
    Args:
        error_data: Dictionary containing error information
        
    Returns:
        str: Human-readable error message
    """
    logger.debug(f"Formatting structured error: {error_data}")
    
    if not isinstance(error_data, dict):
        return str(error_data)
    
    # Extract common fields
    status = error_data.get('status', 'unknown')
    code = error_data.get('code', 'unknown_error')
    message = error_data.get('message', str(error_data))
    
    # Format for specific error types
    if code == 'validation_error':
        return format_validation_message(message, status)
    elif 'object' in error_data and error_data['object'] == 'error':
        return f"API Error ({status}): {message}"
    else:
        return f"Error ({status}): {message}"


def format_http_error(error_content: str, status_code: int) -> str:
    """Format HTTP errors for LLM understanding
    
    Args:
        error_content: Raw error content
        status_code: HTTP status code
        
    Returns:
        str: Formatted HTTP error message
    """
    logger.debug(f"Formatting HTTP {status_code} error")
    
    error_messages = {
        400: "Bad Request - The request was invalid or malformed",
        401: "Unauthorized - Authentication failed or token is invalid", 
        403: "Forbidden - Access denied to the requested resource",
        404: "Not Found - The requested resource does not exist",
        429: "Rate Limited - Too many requests, please wait before retrying",
        500: "Internal Server Error - Something went wrong on the server"
    }
    
    base_message = error_messages.get(status_code, f"HTTP {status_code} Error")
    
    # Extract additional context if available
    if "request_id" in error_content:
        return f"{base_message}. {error_content[:200]}..."
    
    return f"{base_message}: {error_content[:150]}..."


def format_validation_message(message: str, status: str) -> str:
    """Format validation messages to be more LLM-friendly
    
    Args:
        message: Validation error message
        status: HTTP status code
        
    Returns:
        str: Formatted message for LLM
    """
    if "body.children[0]" in message:
        return (
            f"Notion Block Validation Error ({status}): "
            f"The block content structure is incorrect. "
            f"Each block must have exactly one content type defined (paragraph, heading, list, etc.). "
            f"Original error: {message[:200]}..."
        )
    
    return f"Validation Error ({status}): {message}"


def log_tool_execution(tool_name: str, server_name: str, args: dict, status: str, details: str = ""):
    """Log tool execution with structured format
    
    Args:
        tool_name: Name of the tool being executed
        server_name: Name of the MCP server
        args: Tool arguments
        status: Execution status (started, success, failed)
        details: Additional details or error info
    """
    timestamp = datetime.now().isoformat()
    
    if status == "started":
        logger.info(f"🔧 [{timestamp}] TOOL_EXEC_START: {tool_name} on {server_name} with args: {args}")
    elif status == "success":
        logger.info(f"✅ [{timestamp}] TOOL_EXEC_SUCCESS: {tool_name} on {server_name}")
        if details:
            # This provides really useful information for the LLM to understand the result of the tool execution.
            logger.info(f"🆕 Result preview: {details[:100]}...")
    elif status == "failed":
        logger.error(f"❌ [{timestamp}] TOOL_EXEC_FAILED: {tool_name} on {server_name}")
        logger.error(f"    Error details: {details}")
    else:
        logger.warning(f"⚠️ [{timestamp}] TOOL_EXEC_{status.upper()}: {tool_name} on {server_name} - {details}")