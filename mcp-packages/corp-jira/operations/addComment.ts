import { z } from "zod";
import { jiraRequest } from "../common/utils.js";

// Schema for comment body
const CommentBodySchema = z.object({
  body: z.string(),
  visibility: z.object({
    type: z.string(),
    value: z.string()
  }).optional()
});

// Schema for add comment request
export const AddJiraCommentSchema = z.object({
  issueIdOrKey: z.string(),
  comment: CommentBodySchema
});

export type AddJiraCommentRequest = z.infer<typeof AddJiraCommentSchema>;

/**
 * Adds a comment to a Jira issue
 * @param params The parameters for adding a comment
 * @returns The result of the operation
 */
export async function addJiraComment(params: AddJiraCommentRequest) {
  const { issueIdOrKey, comment } = params;
  
  try {
    const response = await jiraRequest(`issue/${issueIdOrKey}/comment`, {
      method: "POST",
      body: comment
    });
    
    return {
      success: true,
      message: "Comment added successfully",
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
