import { z } from "zod";
import { jiraRequest } from "../common/utils.js";
import { formatResponse, handleOperationError } from "./update.js";
import { addJiraComment } from "./addComment.js";

// Schema for status transition request
export const TransitionJiraStatusSchema = z.object({
  issueIdOrKey: z.string(),
  transitionId: z.string(),
  comment: z.string().optional(),
  resolution: z.object({
    name: z.string()
  }).optional(),
  fields: z.record(z.string(), z.any()).optional(),
});

export type TransitionJiraStatusRequest = z.infer<typeof TransitionJiraStatusSchema>;

// Define interfaces for Jira API responses
export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

/**
 * Gets available transitions for a Jira issue
 * @param issueIdOrKey The issue ID or key
 * @returns Available transitions for the issue
 */
export async function getJiraTransitions(issueIdOrKey: string): Promise<{ success: boolean; message: string; data?: unknown }> {
  try {
    const response = await jiraRequest(`issue/${issueIdOrKey}/transitions`) as JiraTransitionsResponse;
    return formatResponse(true, `Successfully retrieved transitions for issue ${issueIdOrKey}`, response);
  } catch (error) {
    return handleOperationError(error, "retrieving transitions");
  }
}

/**
 * Finds a transition ID by target status name
 * @param transitions The list of available transitions
 * @param targetStatusName The target status name to find
 * @returns The transition ID or null if not found
 */
export function findTransitionIdByStatusName(
  transitions: JiraTransition[], 
  targetStatusName: string
): string | null {
  const targetTransition = transitions.find(
    transition => transition.to.name.toLowerCase() === targetStatusName.toLowerCase()
  );
  
  return targetTransition ? targetTransition.id : null;
}

/**
 * Creates a transition request body without comment
 * 
 * Comments are now handled via separate API calls to ensure they work
 * regardless of Jira workflow screen configuration.
 * 
 * @param transitionId The transition ID
 * @param resolution Optional resolution to set
 * @param additionalFields Optional additional fields to set
 * @returns The transition request body
 */
export function createTransitionRequestBody(
  transitionId: string,
  resolution?: { name: string },
  additionalFields?: Record<string, any>
): any {
  const body: any = {
    transition: {
      id: transitionId
    }
  };

  // Add resolution if provided
  if (resolution) {
    body.fields = body.fields || {};
    body.fields.resolution = resolution;
  }

  // Add additional fields if provided
  if (additionalFields) {
    body.fields = { ...body.fields, ...additionalFields };
  }

  return body;
}

/**
 * Transitions the status of a Jira issue by applying a transition
 * 
 * This function now automatically handles comments via separate API calls:
 * 1. First transitions the status (without comment)
 * 2. Then adds the comment if provided (via separate API call)
 * 
 * This ensures comments work regardless of Jira workflow screen configuration.
 * 
 * @param params The status transition parameters
 * @returns Result of the status transition operation
 */
export async function transitionJiraStatus(params: TransitionJiraStatusRequest): Promise<{ success: boolean; message: string; data?: unknown }> {
  const { issueIdOrKey, transitionId, comment, resolution, fields } = params;
  
  try {
    // Create the transition request body (without comment)
    const body = createTransitionRequestBody(transitionId, resolution, fields);

    // Make the request to transition the issue status
    const response = await jiraRequest(`issue/${issueIdOrKey}/transitions`, {
      method: "POST",
      body: body
    });
    
    let message = `Successfully transitioned status of issue ${issueIdOrKey}`;
    let commentResult = null;
    
    // If comment is provided, add it via separate API call
    if (comment) {
      try {
        commentResult = await addJiraComment({
          issueIdOrKey,
          comment: {
            body: comment
          }
        });

        if (commentResult.success) {
          message += ` and added comment`;
        } else {
          message += ` but failed to add comment: ${commentResult.message}`;
        }
      } catch (commentError) {
        message += ` but failed to add comment: ${commentError instanceof Error ? commentError.message : 'Unknown error'}`;
      }
    }
    
    return formatResponse(
      true, 
      message,
      { transition: response, comment: commentResult }
    );
  } catch (error) {
    return handleOperationError(error, "transitioning status");
  }
}

/**
 * Transitions a Jira issue to a status by name
 * 
 * This function now automatically handles comments via separate API calls:
 * 1. First transitions the status (without comment)
 * 2. Then adds the comment if provided (via separate API call)
 * 
 * This ensures comments work regardless of Jira workflow screen configuration.
 * 
 * @param issueIdOrKey The issue ID or key
 * @param statusName The target status name
 * @param comment Optional comment to add (handled via separate API call)
 * @param resolution Optional resolution to set
 * @param additionalFields Optional additional fields to set
 * @returns Result of the status transition operation
 */
export async function transitionJiraStatusByName(
  issueIdOrKey: string,
  statusName: string,
  comment?: string,
  resolution?: { name: string },
  additionalFields?: Record<string, any>
): Promise<{ success: boolean; message: string; data?: unknown }> {
  try {
    // Get available transitions
    const transitionsResponse = await jiraRequest(`issue/${issueIdOrKey}/transitions`) as JiraTransitionsResponse;
    
    // Find the transition ID by status name
    const transitionId = findTransitionIdByStatusName(transitionsResponse.transitions, statusName);
    
    if (!transitionId) {
      return formatResponse(
        false,
        `Could not find a transition to status "${statusName}". Available transitions are: ${transitionsResponse.transitions.map(t => t.to.name).join(', ')}`
      );
    }
    
    // Create and execute the transition
    return transitionJiraStatus({
      issueIdOrKey,
      transitionId,
      comment,
      resolution,
      fields: additionalFields
    });
  } catch (error) {
    return handleOperationError(error, "transitioning status by name");
  }
} 