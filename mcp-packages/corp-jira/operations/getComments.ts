import { z } from "zod";
import { jiraRequest, buildUrl } from "../common/utils.js";

// Schema for get comments request
export const GetJiraCommentsSchema = z.object({
  issueIdOrKey: z.string(),
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  orderBy: z.string().optional(),
  expand: z.string().optional()
});

export type GetJiraCommentsRequest = z.infer<typeof GetJiraCommentsSchema>;

/**
 * Gets comments for a Jira issue
 * @param params The parameters for retrieving comments
 * @returns The comments for the issue
 */
export async function getJiraComments(params: GetJiraCommentsRequest) {
  const { issueIdOrKey, ...queryParams } = params;
  
  try {
    // Build the URL with query parameters
    const endpoint = `issue/${issueIdOrKey}/comment`;
    
    const response = await jiraRequest(endpoint, {
      method: "GET"
    });
    
    return {
      success: true,
      data: response
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      error
    };
  }
}
