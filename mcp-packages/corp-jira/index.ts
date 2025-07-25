#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';

import * as search from './operations/search.js';
import * as create from './operations/create.js';
import * as update from './operations/update.js';
import * as auth from './operations/auth.js';
import * as status from './operations/status.js';
import * as getComments from './operations/getComments.js';
import * as addComment from './operations/addComment.js';
import * as getProjectComponents from './operations/getProjectComponents.js';
import * as getProjectConfig from './operations/getProjectConfig.js';
import * as getIssueTypeMetadata from './operations/getIssueTypeMetadata.js';
import * as getIssueTypes from './operations/getIssueTypes.js';
import { VERSION } from "./common/version.js";
import { isJiraError } from "./common/errors.js";

// Simple file logger class
class FileLogger {
  private logFile: string;

  constructor(logFile: string = 'mcp-jira-debug.log') {
    this.logFile = join(process.cwd(), logFile);
    
    // Ensure log directory exists
    const dir = dirname(this.logFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Append a server start message to the log file on startup
    appendFileSync(this.logFile, `=== MCP JIRA Server Started at ${new Date().toISOString()} ===\n`);
  }

  log(level: 'INFO' | 'ERROR' | 'DEBUG', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${level}: ${message}`;
    
    if (data) {
      logEntry += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    logEntry += '\n' + '-'.repeat(80) + '\n';
    
    appendFileSync(this.logFile, logEntry);
    
    // Also log to stderr for immediate feedback
    process.stderr.write(`${level}: ${message}\n`);
  }

  info(message: string, data?: any) {
    this.log('INFO', message, data);
  }

  error(message: string, data?: any) {
    this.log('ERROR', message, data);
  }

  debug(message: string, data?: any) {
    this.log('DEBUG', message, data);
  }
}

const getDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const logger = new FileLogger(
  (process.cwd() + '/logs/jira_mcp_server') +
  getDateString() +
  '.log'
);

const server = new Server(
  {
    name: "corp-jira-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "test_jira_auth",
        description: "Test authentication with Jira API",
        inputSchema: zodToJsonSchema(auth.AuthTestSchema),
      },
      {
        name: "search_jira_issues",
        description: "Search for Jira issues using JQL (Jira Query Language). " +
          "The 'jql' parameter is required and should contain a valid JQL query. " +
          "Common JQL examples: " +
          "• 'reporter = currentUser()' - find issues reported by current user " +
          "• 'assignee = currentUser()' - find issues assigned to current user " +
          "• 'creator = currentUser()' - find issues created by current user " +
          "• 'project = PROJECT_KEY' - find issues in specific project " +
          "• 'status = \"In Progress\"' - find issues with specific status " +
          "• 'created >= -30d' - find issues created in last 30 days " +
          "• 'reporter = currentUser() AND created >= -7d' - combine conditions with AND/OR",
        inputSchema: zodToJsonSchema(search.JiraSearchSchema),
      },
      {
        name: "create_jira_issue",
        description: "Create a new Jira issue\n\n# Text Formatting Notation Help\n\n## Headings\n\nTo create a header, place `hn.` at the start of the line (where `n` can be a number from 1-6).\n\n```\nh1. Biggest heading\n# Biggest heading  \n\nh2. Bigger heading\n## Bigger heading  \n\nh3. Big heading\n### Big heading  \n\nh4. Normal heading\n#### Normal heading  \n\nh5. Small heading\n##### Small heading  \n\nh6. Smallest heading\n###### Smallest heading  \n```\n\n---\n\n## Text Effects\n\nChange the formatting of words and sentences.\n\n- `*strong*` → **strong**\n- `_emphasis_` → *emphasis*\n- `??citation??` → citation\n- `-deleted-` → ~~deleted~~\n- `+inserted+` → inserted\n- `^superscript^` → superscript\n- `~subscript~` → subscript\n- `{{monospaced}}` → `monospaced`\n\nBlockquote:\n```\nbq. Some block quoted text\n> Some block quoted text\n```\n\nMulti-line quote:\n```\n{quote}\n    here is quotable content\n{quote}\n```\n> here is quotable content  \n\nChange text color:\n```\n{color:red}\nlook ma, red text!\n{color}\n```\n> look ma, red text!\n\n---\n\n## Text Breaks\n\n- Paragraph break: `(empty line)`\n- Line break: `\\`\n- Horizontal ruler: `----`\n- Symbols: `---` → —, `--` → –\n\n---\n\n## Links\n\n- Internal link: `[My Page#anchor]`\n- External link:\n  - `[http://example.com]` → <http://example.com>\n  - `[Text|http://example.com]` → [Text](http://example.com)\n- Email: `[mailto:email@example.com]`\n- File link: `[file:///path/to/file.txt]`\n- Anchor: `{anchor:anchorname}`\n- User link: `[~username]`\n\n---\n\n## Lists\n\n### Bulleted Lists\n```\n* Item 1\n* Item 2\n** Sub-item 2.1\n** Sub-item 2.2\n```\n\n### Numbered Lists\n```\n# Item 1\n# Item 2\n## Sub-item 2.1\n```\n\n### Mixed Lists\n```\n1. Numbered\n    * Nested bullet\n```\n\n---\n\n## Images\n\n```\n!http://example.com/image.png!\n!image.png|thumbnail!\n!image.png|align=right, vspace=4!\n```\n\n---\n\n## Attachments\n\n```\n!media.mov!\n!spaceKey:page^attachment.mov!\n!media.mov|width=300,height=400!\n```\n\n---\n\n## Tables\n\n```\n||Header 1||Header 2||Header 3||\n|Cell 1|Cell 2|Cell 3|\n|Cell 4|Cell 5|Cell 6|\n```\n\n---\n\n## Advanced Formatting\n\nPreformatted text:\n```\n{noformat}\nPreformatted text here\n{noformat}\n```\n\nPanels:\n```\n{panel}\nContent inside a panel\n{panel}\n\n{panel:title=Title|borderStyle=dashed|borderColor=#ccc|bgColor=#fff}\nStyled panel content\n{panel}\n```",
        inputSchema: zodToJsonSchema(create.CreateJiraIssueSchema),
      },
      {
        name: "update_jira_issue",
        description: "Update an existing Jira issue\n\n# Text Formatting Notation Help\n\n## Headings\n\nTo create a header, place `hn.` at the start of the line (where `n` can be a number from 1-6).\n\n```\nh1. Biggest heading\n# Biggest heading  \n\nh2. Bigger heading\n## Bigger heading  \n\nh3. Big heading\n### Big heading  \n\nh4. Normal heading\n#### Normal heading  \n\nh5. Small heading\n##### Small heading  \n\nh6. Smallest heading\n###### Smallest heading  \n```\n\n---\n\n## Text Effects\n\nChange the formatting of words and sentences.\n\n- `*strong*` → **strong**\n- `_emphasis_` → *emphasis*\n- `??citation??` → citation\n- `-deleted-` → ~~deleted~~\n- `+inserted+` → inserted\n- `^superscript^` → superscript\n- `~subscript~` → subscript\n- `{{monospaced}}` → `monospaced`\n\nBlockquote:\n```\nbq. Some block quoted text\n> Some block quoted text\n```\n\nMulti-line quote:\n```\n{quote}\n    here is quotable content\n{quote}\n```\n> here is quotable content  \n\nChange text color:\n```\n{color:red}\nlook ma, red text!\n{color}\n```\n> look ma, red text!\n\n---\n\n## Text Breaks\n\n- Paragraph break: `(empty line)`\n- Line break: `\\`\n- Horizontal ruler: `----`\n- Symbols: `---` → —, `--` → –\n\n---\n\n## Links\n\n- Internal link: `[My Page#anchor]`\n- External link:\n  - `[http://example.com]` → <http://example.com>\n  - `[Text|http://example.com]` → [Text](http://example.com)\n- Email: `[mailto:email@example.com]`\n- File link: `[file:///path/to/file.txt]`\n- Anchor: `{anchor:anchorname}`\n- User link: `[~username]`\n\n---\n\n## Lists\n\n### Bulleted Lists\n```\n* Item 1\n* Item 2\n** Sub-item 2.1\n** Sub-item 2.2\n```\n\n### Numbered Lists\n```\n# Item 1\n# Item 2\n## Sub-item 2.1\n```\n\n### Mixed Lists\n```\n1. Numbered\n    * Nested bullet\n```\n\n---\n\n## Images\n\n```\n!http://example.com/image.png!\n!image.png|thumbnail!\n!image.png|align=right, vspace=4!\n```\n\n---\n\n## Attachments\n\n```\n!media.mov!\n!spaceKey:page^attachment.mov!\n!media.mov|width=300,height=400!\n```\n\n---\n\n## Tables\n\n```\n||Header 1||Header 2||Header 3||\n|Cell 1|Cell 2|Cell 3|\n|Cell 4|Cell 5|Cell 6|\n```\n\n---\n\n## Advanced Formatting\n\nPreformatted text:\n```\n{noformat}\nPreformatted text here\n{noformat}\n```\n\nPanels:\n```\n{panel}\nContent inside a panel\n{panel}\n\n{panel:title=Title|borderStyle=dashed|borderColor=#ccc|bgColor=#fff}\nStyled panel content\n{panel}\n```",
        inputSchema: zodToJsonSchema(update.UpdateJiraIssueSchema),
      },
      {
        name: "get_jira_comments",
        description: "Get comments for a Jira issue",
        inputSchema: zodToJsonSchema(getComments.GetJiraCommentsSchema),
      },
      {
        name: "add_jira_comment",
        description: "Add a comment to a Jira issue",
        inputSchema: zodToJsonSchema(addComment.AddJiraCommentSchema),
      },
      {
        name: "transition_jira_status",
        description: "Transition the status of a Jira issue by applying a transition",
        inputSchema: zodToJsonSchema(status.TransitionJiraStatusSchema),
      },
      {
        name: "get_jira_transitions",
        description: "Get available transitions for a Jira issue",
        inputSchema: zodToJsonSchema(z.object({ issueIdOrKey: z.string() })),
      },
      {
        name: "transition_jira_status_by_name",
        description: "Transition the status of a Jira issue by specifying the target status name",
        inputSchema: zodToJsonSchema(z.object({
          issueIdOrKey: z.string(),
          statusName: z.string(),
          comment: z.string().optional(),
          resolution: z.object({ name: z.string() }).optional(),
          fields: z.record(z.any()).optional()
        })),
      },
      {
        name: "get_all_components_using_project",
        description: "Get all components for a Jira project using project ID or key",
        inputSchema: zodToJsonSchema(getProjectComponents.GetProjectComponentsSchema),
      },
      {
        name: "get_project_config",
        description: "Get project configuration including available issue types, priorities, components, and other metadata. This helps understand project context for other operations.",
        inputSchema: zodToJsonSchema(getProjectConfig.GetProjectConfigSchema),
      },
      {
        name: "get_jira_issuetype_metadata",
        description: "Get create field metadata for a project and issue type id. Returns field metadata for a specified project and issuetype id. Use this information to populate requests for creating issues.",
        inputSchema: zodToJsonSchema(getIssueTypeMetadata.GetJiraIssueTypeMetadataSchema),
      },
      {
        name: "get_jira_issuetype",
        description: "Get issue types for a project. Returns available issue types for creating issues in the specified project.",
        inputSchema: zodToJsonSchema(getIssueTypes.GetIssueTypesSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  logger.info(`CallTool request received for: ${request.params.name}`, {
    toolName: request.params.name,
    arguments: request.params.arguments
  });

  try {
    if (!request.params.arguments) {
      const error = "Arguments are required";
      logger.error(error);
      throw new Error(error);
    }

    switch (request.params.name) {
      case "test_jira_auth": {
        const result = await auth.testAuth();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "search_jira_issues": {
        const args = search.JiraSearchSchema.parse(request.params.arguments);
        const results = await search.searchJiraIssues(args);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "create_jira_issue": {
        const args = create.CreateJiraIssueSchema.parse(request.params.arguments);
        const result = await create.createJiraIssue(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_jira_issue": {
        const args = update.UpdateJiraIssueSchema.parse(request.params.arguments);
        const result = await update.updateJiraIssue(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to update issue');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_jira_comments": {
        const args = getComments.GetJiraCommentsSchema.parse(request.params.arguments);
        const result = await getComments.getJiraComments(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to get issue comments');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_jira_comment": {
        const args = addComment.AddJiraCommentSchema.parse(request.params.arguments);
        const result = await addComment.addJiraComment(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to add comment to issue');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "transition_jira_status": {
        const args = status.TransitionJiraStatusSchema.parse(request.params.arguments);
        const result = await status.transitionJiraStatus(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to transition issue status');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "transition_jira_status_by_name": {
        const { issueIdOrKey, statusName, comment, resolution, fields } = z.object({
          issueIdOrKey: z.string(),
          statusName: z.string(),
          comment: z.string().optional(),
          resolution: z.object({ name: z.string() }).optional(),
          fields: z.record(z.any()).optional()
        }).parse(request.params.arguments);
        
        const result = await status.transitionJiraStatusByName(
          issueIdOrKey,
          statusName,
          comment,
          resolution,
          fields
        );
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to transition issue status by name');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_jira_transitions": {
        const { issueIdOrKey } = z.object({ issueIdOrKey: z.string() }).parse(request.params.arguments);
        const result = await status.getJiraTransitions(issueIdOrKey);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to get issue transitions');
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_all_components_using_project": {
        const args = getProjectComponents.GetProjectComponentsSchema.parse(request.params.arguments);
        const result = await getProjectComponents.getProjectComponents(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to get project components');
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_project_config": {
        const args = getProjectConfig.GetProjectConfigSchema.parse(request.params.arguments);
        const result = await getProjectConfig.getProjectConfig(args);

        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error('Failed to get project components');
        }

        logger.info("get_project_config completed successfully", { projectKey: result?.key });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_jira_issuetype_metadata": {
        const args = getIssueTypeMetadata.GetJiraIssueTypeMetadataSchema.parse(request.params.arguments);
        const result = await getIssueTypeMetadata.getJiraIssueTypeMetadata(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          const error = 'Failed to get issue type metadata';
          logger.error(error, { result });
          throw new Error(error);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_jira_issuetype": {
        logger.debug("Executing get_jira_issuetype", { args: request.params.arguments });
        const args = getIssueTypes.GetIssueTypesSchema.parse(request.params.arguments);
        const result = await getIssueTypes.getIssueTypes(args);
        
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          const error = 'Failed to get issue types';
          logger.error(error, { result });
          throw new Error(error);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        const error = `Unknown tool: ${request.params.name}`;
        logger.error(error);
        throw new Error(error);
    }
  } catch (error) {
    logger.error(`Error in CallTool handler for ${request.params.name}`, { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      originalArguments: request.params.arguments
    });

    if (error instanceof z.ZodError) {
      // Format Zod validation errors in a more user-friendly way
      const fieldErrors = error.errors.map(err => {
        const path = err.path.join('.');
        return `• ${path}: ${err.message}`;
      }).join('\n');
      
      const errorMessage = `Input validation failed:\n${fieldErrors}\n\nPlease check that all required fields are provided with correct data types.`;
      logger.error("Zod validation error", { fieldErrors: error.errors });
      throw new Error(errorMessage);
    }
    
    if (isJiraError(error)) {
      const jiraError = error as any;
      let errorMessage = `Jira API error: ${error.message}`;
      
      // Add status code information
      if (jiraError.status) {
        errorMessage += ` (Status: ${jiraError.status})`;
      }
      
      // Add detailed field errors if available
      if (jiraError.response && typeof jiraError.response === 'object') {
        const response = jiraError.response as any;
        
        if (response.errors && typeof response.errors === 'object') {
          const fieldErrors = Object.entries(response.errors)
            .map(([field, msg]) => `• ${field}: ${msg}`)
            .join('\n');
          errorMessage += `\n\nField Errors:\n${fieldErrors}`;
        }
        
        if (response.errorMessages && Array.isArray(response.errorMessages)) {
          errorMessage += `\n\nAdditional Details:\n${response.errorMessages.map((msg: string) => `• ${msg}`).join('\n')}`;
        }
      }
      
      logger.error("Jira API error details", { 
        status: jiraError.status,
        response: jiraError.response 
      });
      throw new Error(errorMessage);
    }
    
    throw error;
  }
});

async function runServer() {
  logger.info("Starting MCP JIRA server");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP JIRA server connected and ready");
  process.stderr.write("Corporate Jira MCP Server running on stdio\n");
}

runServer().catch((error) => {
  logger.error("Fatal error in main()", { error: error.message, stack: error.stack });
  console.error("Fatal error in main():", error);
  process.exit(1);
});
