import { z } from "zod";
import { jiraRequest } from "../common/utils.js";
import { transitionJiraStatusByName } from "./status.js";

interface Label {
  name?: string;
}

// Schema for issue fields that can be updated
const UpdateFieldsSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  assignee: z.object({
    name: z.string()
  }).optional(),
  priority: z.object({
    name: z.string()
  }).optional(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.object({
    name: z.string()
  })).optional(),
  versions: z.array(z.object({
    name: z.string()
  })).optional(),
  customfield_10000: z.record(z.string(), z.any()).optional(),
  // Add status field that will be handled specially
  status: z.object({
    name: z.string(), // Use name instead of ID for more intuitive API
    comment: z.string().optional(),
    resolution: z.object({
      name: z.string()
    }).optional()
  }).optional(),
  customfield_11800: z.string().optional(), // Epic Link field - direct string
});

// Extend the schema to accept linkedIssues
const LinkedIssueSchema = z.object({
  fromIssueKey: z.string(), // The "outward" issue (the blocker)
  toIssueKey: z.string(),   // The "inward" issue (the blocked)
  type: z.string(),         // e.g., 'Blocks', 'Relates', etc.
});

// Schema for update issue request
export const UpdateJiraIssueSchema = z.object({
  issueIdOrKey: z.string(),
  fields: UpdateFieldsSchema.optional(),
  update: z.record(z.string(), z.any()).optional(),
  linkedIssues: z.array(LinkedIssueSchema).optional(),
});

export type UpdateJiraIssueRequest = z.infer<typeof UpdateJiraIssueSchema>;

// Define interfaces for Jira API responses
interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

/**
 * Updates an existing Jira issue
 * This function handles both regular field updates and status transitions
 * Status changes are provided through the fields.status.name property
 * @param params The issue update parameters
 * @returns The updated issue
 */
export async function updateJiraIssue(params: UpdateJiraIssueRequest): Promise<{ success: boolean; message: string; data?: unknown }> {
  const { issueIdOrKey, fields, update, linkedIssues } = params;
  
  try {
    // First, fetch the current issue to get existing labels
    const currentIssue = await jiraRequest(`issue/${issueIdOrKey}?fields=labels`, {
      method: "GET"
    }) as { fields?: { labels?: Label[] } };
    
    const existingLabels = currentIssue.fields?.labels || [];
    const existingLabelNames = existingLabels.map((label: Label) => typeof label === "string" ? label : label.name || "");
    
    // Prepare fields without status and handle labels by merging with existing ones
    let fieldsWithoutStatus = fields ? { ...fields } : {};
    
    // Merge existing labels with new labels (if any provided)
    const newLabels = fieldsWithoutStatus.labels || [];
    const allLabels = [...new Set([...existingLabelNames, ...newLabels])];
    
    // Set the merged labels
    fieldsWithoutStatus.labels = allLabels;
    
    // Extract status field if present (we'll handle it separately)
    const statusField = fieldsWithoutStatus.status;
    if (fieldsWithoutStatus.status) {
      delete fieldsWithoutStatus.status;
    }
    
    // First, update the issue fields if provided (excluding status)
    if ((fieldsWithoutStatus && Object.keys(fieldsWithoutStatus).length > 0) || (update && Object.keys(update).length > 0)) {
      await jiraRequest(`issue/${issueIdOrKey}`, {
        method: "PUT",
        body: {
          fields: fieldsWithoutStatus || {},
          update: update || {}
        }
      });
    }
    
    // Handle linked issues if provided
    if (linkedIssues && linkedIssues.length > 0) {
      const linkPromises = linkedIssues.map(link => {
        const linkBody: { 
          type: { name: string }; 
          outwardIssue: { key: string }; 
          inwardIssue: { key: string }; 
        } = {
          type: { name: link.type },
          outwardIssue: { key: link.fromIssueKey },
          inwardIssue: { key: link.toIssueKey }
        };
        return jiraRequest('issueLink', {
          method: 'POST',
          body: linkBody
        });
      });
      await Promise.all(linkPromises);
    }
    
    // Then, handle status transition if provided
    if (statusField) {
      // Use the consolidated status transition logic
      const transitionResult = await transitionJiraStatusByName(
        issueIdOrKey,
        statusField.name,
        statusField.comment,
        statusField.resolution
      );
      
      if (!transitionResult.success) {
        return transitionResult;
      }
      
      return formatResponse(
        true,
        `Successfully updated issue ${issueIdOrKey} and transitioned to status "${statusField.name}"`,
        transitionResult.data
      );
    }
    
    // If no status was provided, just return success for the field update
    return formatResponse(
      true,
      `Successfully updated issue ${issueIdOrKey}`
    );
  } catch (error) {
    return handleOperationError(error, "updating issue");
  }
}

export function formatResponse(success: boolean, message: string, data?: unknown) {
  return {
    success,
    message,
    data
  };
}

export function handleOperationError(error: unknown, operation: string): ReturnType<typeof formatResponse> {
  const errorDetails = error instanceof Error 
    ? error.message 
    : 'Unknown error occurred';
  
  console.error(`${operation} Error:`, error);
  
  return formatResponse(false, `Error ${operation}: ${errorDetails}`);
}