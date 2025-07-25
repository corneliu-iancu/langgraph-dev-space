# Adobe Corp Jira MCP Server

This MCP server provides a secure interface to Adobe's internal Jira instance, enabling AI assistants to interact with Jira through a standardized protocol. It's part of the Adobe Model Context Protocol (MCP) Servers collection.

## 🎯 Features

- **Issue Management**
  - Search issues using JQL (Jira Query Language)
  - Create new issues with customizable fields
  - Update existing issues (priority, status, etc.)
  - Transition issues between statuses
  - Retrieve issue details and metadata

- **Authentication & Security**
  - Secure token-based authentication
  - Environment-based configuration
  - Sensitive data redaction in logs
  - Error handling with detailed feedback

- **Integration Support**
  - Compatible with Adobe's internal Jira instance
  - Standardized MCP interface
  - Extensible tool architecture
  - Comprehensive logging

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or later)
- Access to Adobe's Jira instance (jira.corp.adobe.com)
- Jira API credentials
- Docker (optional, for containerized deployment)

### Installation

1. Clone the repository:
   Standard (HTTPS)
   ```bash
   git clone https://github.com/Adobe-AIFoundations/adobe-mcp-servers.git
   cd adobe-mcp-servers/src/corp-jira
   ```
   SSH
   ```bash
   git clone git@github.com:Adobe-AIFoundations/adobe-mcp-servers.git
   cd adobe-mcp-servers/src/corp-jira
   ```


### Configuration

1. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Configure the required environment variables:
   ```env
   # Required
   JIRA_EMAIL=LDAP # WITHOUT the @adobe.com
   JIRA_PERSONAL_ACCESS_TOKEN=LDAP_password # NOT the PAT token from Jira

   # Optional
   JIRA_API_BASE_URL=https://jira.corp.adobe.com/rest/api/2
   JIRA_LOG_FILE=/path/to/jira-api.log
   JIRA_DEFAULT_PROJECT=PROJECT_KEY
   ```

## Build

### Local Build
```bash
npm install
npm run build
```

### Debugging
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Docker Build (Not yet supported)
```bash
docker build -t mcp/corp-jira -f src/corp-jira/Dockerfile .
```

### Usage with Cline in VS Code

1. Install the Cline VS Code extension
2. Open Cline chat interface in VS Code
3. Looks for the MCP Servers > Configure MCP Servers section
4. Add the following configuration:

```json
{
  "mcpServers": {
    "corp-jira": {
      "command": "node",
      "args": [
        "{absolute_path_to_mcp_servers_project}/src/corp-jira/dist/index.js"
      ],
      "env": {
        "JIRA_PERSONAL_ACCESS_TOKEN": "<LDAP-PASSWORD>",
        "JIRA_EMAIL": "<LDAP>"
      },
      "autoApprove": [],
      "disabled": false
    }
  }
}
```

### Usage with Cursor IDE

1. Install the Cursor IDE
2. Go to menu: Cursor > Settings > Cursor Settings > MCP Servers
3. Go to tab `MCP` then click `Add new MCP server`
5. Fill in server name: `corp-jira` and keep the default type `command`
6. In the `Command` field, enter the following:
```bash
node {absolute_path_to_mcp_servers_project}/src/corp-jira/dist/index.js
```

For new Cursor versions, configure the Jira MCP as below:
```json
{
  "mcpServers": {
    "corp-jira": {
      "command": "node",
      "args": [
        "{absolute_path_to_mcp_servers_project}/src/corp-jira/dist/index.js"
      ],
      "env": {
        "JIRA_PERSONAL_ACCESS_TOKEN": "<LDAP-PASSWORD>",
        "JIRA_EMAIL": "<LDAP>",
        "JIRA_API_BASE_URL": "https://jira.corp.adobe.com/rest/api/2",
        "JIRA_LOG_FILE": "{absolute path to log file destination}",
        "JIRA_DEFAULT_PROJECT": "<Default Proj for your team>"
      },
      "autoApprove": [],
      "disabled": false
    }
  }
}
```
## Security Note

This server interacts with Adobe's internal GitHub instance. Ensure you follow all corporate security policies when using this tool.

## 🔍 Troubleshooting

If authentication fails try executing a `curl` call with your LDAP credentials:

```bash
curl --head  --user "$LDAP_USER:$LDAP_PASSWORD" -H "Content-Type: application/json"  "https://jira.corp.adobe.com/rest/api/2/issue/SKYOPS-61156"
```

Inspecting the response headers should indicate the reason for the failure. In particular, if you see the following entry
```
X-Authentication-Denied-Reason: CAPTCHA_CHALLENGE; login-url=https://jira.corp.adobe.com/login.jsp
```

Access the [Developer Portal](https://developer-paas.pe.corp.adobe.com) and unlock your Jira account. Access should be restored immediately.

## 🧪 Demo Scripts

The `demo/` directory contains several demonstration scripts that showcase the server's functionality:

### Running Demo Scripts

```bash
# Build the project first
npm run build

# Run the project configuration demo
node demo/demo-get-project-config.js

# Run other demo scripts
node demo/demo-success-case.js
node demo/demo-error-handling.js
node demo/demo-get-issue-types.js
node demo/demo-get-issuetype-metadata.js
```

### Available Demos

- **`demo-get-project-config.js`**: Demonstrates fetching project configuration and metadata
- **`demo-get-issue-types.js`**: Shows fetching available issue types for project creation with pagination
- **`demo-get-issuetype-metadata.js`**: Shows fetching detailed field metadata for specific project/issue type combinations
- **`demo-success-case.js`**: Shows successful issue creation with proper field validation
- **`demo-error-handling.js`**: Demonstrates improved error handling with detailed feedback

## 🔧 Available Tools

### 1. `test_jira_auth`
Tests authentication with Jira API.
```typescript
// Example
{
  "random_string": "test"
}
```

### 2. `search_jira_issues`
Searches for Jira issues using JQL.
```typescript
// Example
{
  "jql": "project = PROJ AND status = Open",
  "maxResults": 50,
  "fields": ["summary", "status", "priority"]
}
```

### 3. `create_jira_issue`
Creates a new Jira issue.
```typescript
// Example for projects requiring QE Lead (like LM)
{
  "fields": {
    "project": {
      "key": "LM"
    },
    "summary": "Test issue",
    "description": "This is a test issue",
    "issuetype": {
      "name": "Task"
    },
    "customfield_18203": {
      "name": "username" // Replace with actual username
    }
  }
}

// Example for projects NOT requiring QE Lead
{
  "fields": {
    "project": {
      "key": "PROJ"
    },
    "summary": "Test issue",
    "description": "This is a test issue",
    "issuetype": {
      "name": "Task"
    }
    // No customfield_18203 needed
  }
}
```

**Note:** The `customfield_18203` field (QE Lead) is required when creating issues in certain projects like LM. For other projects that don't require this field, you can simply omit it from the request.

### 4. `update_jira_issue`
Updates an existing Jira issue, including changing its status.
```typescript
// Example for updating fields
{
  "issueIdOrKey": "PROJ-123",
  "fields": {
    "priority": { "name": "Critical" },
    "description": "Updated description"
  }
}

// Example for changing status
{
  "issueIdOrKey": "PROJ-123",
  "fields": {
    "status": {
      "name": "In Progress",
      "comment": "Moving to In Progress"
    }
  }
}
```

### 5. `get_jira_transitions`
Gets available transitions for a Jira issue.
```typescript
// Example
{
  "issueIdOrKey": "PROJ-123"
}
```

### 6. `transition_jira_status`
Transitions the status of a Jira issue by applying a transition ID.
```typescript
// Example
{
  "issueIdOrKey": "PROJ-123",
  "transitionId": "4", // ID for "Start Progress" transition
  "comment": "Moving to In Progress"
}
```

### 7. `transition_jira_status_by_name`
Transitions the status of a Jira issue by specifying the target status name.
```typescript
// Example
{
  "issueIdOrKey": "PROJ-123",
  "statusName": "In Progress",
  "comment": "Moving to In Progress"
}
```

### 8. `get_all_components_using_project`
Gets all components for a Jira project using project ID or key.
```typescript
// Example
{
  "projectIdOrKey": "ASSETS" // or a numeric project ID like "12345"
}
```

**Description:**
- Returns all non-archived components for the specified Jira project.
- The `projectIdOrKey` parameter can be either the project key (e.g., `ASSETS`) or the numeric project ID (e.g., `12345`).
- Each component in the response includes:
  - `component_id`: The component's unique ID
  - `component_name`: The name of the component
  - `ownership`: The username of the component lead, or `unassigned` if not set
- The response also includes the total count of components returned.
### 8. `get_project_config`
Gets project configuration including available issue types, priorities, components, and other metadata. This helps understand project context for other operations.
```typescript
// Example with full metadata
{
  "projectKey": "PS",
  "includeMetadata": true
}

// Example with basic info only (faster)
{
  "projectKey": "PS",
  "includeMetadata": false
}
```

**Response includes:**
- Basic project information (name, description, lead, type)
- Available issue types and whether they're subtasks
- System priorities
- Project components (if any)
- Project versions (if any)
- Workflow statuses and categories
- Custom fields and their requirements

This operation is particularly useful for AI models to:
- Validate parameters before creating/updating issues
- Suggest valid values for issue fields
- Understand project structure and constraints
- Provide context-aware assistance

### 9. `get_jira_issuetypes`
Gets issue types available for creating issues in a specific project. This tool retrieves create metadata issue types using the `/issue/createmeta` endpoint.
```typescript
// Example with default pagination
{
  "projectIdOrKey": "PS",
  "startAt": 0,
  "maxResults": 50
}

// Example with custom pagination
{
  "projectIdOrKey": "PROJ",
  "startAt": 10,
  "maxResults": 20
}
```

**Response includes:**
- Complete list of issue types available for issue creation
- Detailed metadata (descriptions, icons, hierarchy levels)
- Distinction between standard issue types and subtasks
- Project scope information for each issue type
- Pagination support (startAt, maxResults, total)

**Key Features:**
- **Pagination Support**: Handle projects with many issue types efficiently
- **Rich Metadata**: Icons, descriptions, hierarchy levels, and project scope
- **Subtask Detection**: Clear identification of subtask vs. standard issue types
- **Creation Context**: Only returns issue types that can actually be used for creating issues

This operation is essential for AI models to:
- Validate issue type names before creating issues
- Suggest appropriate issue types to users
- Understand project workflow and issue hierarchy
- Provide visual context with issue type icons
- Guide users through issue creation with proper type selection

### 10. `get_jira_issuetype_metadata`
Gets create field metadata for a specific project and issue type combination. Returns detailed field metadata that can be used to populate create issue requests.
```typescript
// Example with default pagination
{
  "projectIdOrKey": "PS",
  "issueTypeId": "1",
  "startAt": 0,
  "maxResults": 50
}

// Example with custom pagination (max 200)
{
  "projectIdOrKey": "PROJ", 
  "issueTypeId": "10",
  "startAt": 0,
  "maxResults": 100
}
```

**Response includes:**
- Complete field metadata for the specific project/issue type combination
- Field requirements (required vs optional)
- Field types and validation constraints
- Allowed values for select/multi-select fields
- Default values for fields
- Field descriptions and help text
- Project context information

**Key Features:**
- **Pagination Support**: Handle projects with many fields efficiently (max 200 per request)
- **Field-Level Details**: Complete information about each field including type, constraints, and allowed values
- **Context-Specific**: Returns only fields relevant to the specific project and issue type combination
- **Creation-Ready**: Provides all information needed to populate create issue requests accurately

This operation is crucial for AI models to:
- Understand exactly what fields are available and required for issue creation
- Validate field values before making create requests
- Suggest appropriate field values based on allowed options
- Generate dynamic forms for issue creation
- Provide field-specific help and guidance to users
- Ensure create requests comply with project-specific field requirements

**Note:** Use this in combination with `get_project_config` to first discover available issue types, then get detailed field metadata for specific issue types.

## 🔄 Status Transition Methods

There are three ways to transition the status of a Jira issue:

1. **Using `update_jira_issue` with status field**:
   ```typescript
   {
     "issueIdOrKey": "PROJ-123",
     "fields": {
       "status": {
         "name": "In Progress",
         "comment": "Moving to In Progress"
       }
     }
   }
   ```

2. **Using `transition_jira_status` with transition ID**:
   ```typescript
   {
     "issueIdOrKey": "PROJ-123",
     "transitionId": "4", // ID for "Start Progress" transition
     "comment": "Moving to In Progress"
   }
   ```

3. **Using `transition_jira_status_by_name` with status name**:
   ```typescript
   {
     "issueIdOrKey": "PROJ-123",
     "statusName": "In Progress",
     "comment": "Moving to In Progress"
   }
   ```

### Key Differences

- **`update_jira_issue` with status field**: Allows updating other fields along with changing status
- **`transition_jira_status`**: Requires knowing the exact transition ID (use `get_jira_transitions` first)
- **`transition_jira_status_by_name`**: Most intuitive approach, uses human-readable status names

### 🔧 Recent Improvements in Status Transitions

**Enhanced Comment Handling** *(Updated in status.ts)*

The status transition methods (`transition_jira_status` and `transition_jira_status_by_name`) have been significantly improved to handle comments more reliably:

#### Key Changes:
- **Separate API Calls for Comments**: Comments are no longer included in the transition request body. Instead, they are handled via separate API calls to ensure reliability.
- **Two-Step Process**: 
  1. First, the status transition is performed without the comment
  2. If a comment is provided, it's added via a separate API call to `addJiraComment`
- **Improved Reliability**: This approach ensures comments work regardless of Jira workflow screen configuration
- **Better Error Handling**: Transition can succeed even if comment addition fails, with detailed error reporting

#### Technical Implementation:
```typescript
// Old behavior: Comments included in transition request (unreliable)
// New behavior: Two-step process for better reliability

// Step 1: Transition status (without comment)
const body = createTransitionRequestBody(transitionId, resolution, fields);
await jiraRequest(`issue/${issueIdOrKey}/transitions`, { method: "POST", body });

// Step 2: Add comment separately (if provided)
if (comment) {
  await addJiraComment({ issueIdOrKey, comment: { body: comment } });
}
```

#### Benefits:
- **Consistent Behavior**: Works across all Jira projects regardless of workflow configuration
- **Graceful Degradation**: Status transitions succeed even if comment addition fails
- **Better Debugging**: Clear separation of concerns for troubleshooting
- **Enhanced Logging**: Detailed feedback on both transition and comment operations

This improvement addresses common issues where status transitions would fail due to Jira workflow screen configurations that don't allow comments during transitions.

## 📝 Error Handling

All operations return a standardized response format:

```typescript
{
  "success": boolean,
  "message": string,
  "data": any // Optional
}
```

If an operation fails, the response will include:
- `success: false`
- A descriptive error message
- Additional error details when available
