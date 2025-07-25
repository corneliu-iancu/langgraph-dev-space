import { z } from "zod";
import { jiraRequest } from "../common/utils.js";

// Flexible schema that matches Jira API documentation
// Fields can contain any properties since they vary by project/issue type
const IssueFieldsSchema = z.record(z.string(), z.any());



// Schema for history metadata (optional)
const HistoryMetadataSchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  descriptionKey: z.string().optional(),
  activityDescription: z.string().optional(),
  activityDescriptionKey: z.string().optional(),
  emailDescription: z.string().optional(),
  emailDescriptionKey: z.string().optional(),
  actor: z.object({
    id: z.string().optional(),
    displayName: z.string().optional(),
    type: z.string().optional(),
    avatarUrl: z.string().optional(),
    url: z.string().optional()
  }).optional(),
  generator: z.object({
    id: z.string().optional(),
    type: z.string().optional()
  }).optional(),
  cause: z.object({
    id: z.string().optional(),
    type: z.string().optional()
  }).optional(),
  extraData: z.record(z.string(), z.string()).optional()
}).optional();

// Schema for entity properties (optional)
const EntityPropertySchema = z.object({
  key: z.string(),
  value: z.any()
});

// Schema for issue transition (optional)
const IssueTransitionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  to: z.object({
    self: z.string().optional(),
    description: z.string().optional(),
    iconUrl: z.string().optional(),
    name: z.string().optional(),
    id: z.string().optional(),
    statusCategory: z.object({
      self: z.string().optional(),
      id: z.number().optional(),
      key: z.string().optional(),
      colorName: z.string().optional(),
      name: z.string().optional()
    }).optional()
  }).optional(),
  hasScreen: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  isInitial: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  isConditional: z.boolean().optional(),
  fields: z.record(z.string(), z.any()).optional(),
  expand: z.string().optional(),
  looping: z.boolean().optional()
}).optional();

// Schema for create issue request - matches Jira API documentation exactly
export const CreateJiraIssueSchema = z.object({
  fields: IssueFieldsSchema,
  update: z.record(z.string(), z.any()).optional(),
  historyMetadata: HistoryMetadataSchema,
  properties: z.array(EntityPropertySchema).optional(),
  transition: IssueTransitionSchema
}).strict();

export type CreateJiraIssueRequest = z.infer<typeof CreateJiraIssueSchema>;

/**
 * Creates a new Jira issue
 * @param params The issue creation parameters
 * @returns The created issue
 */
export async function createJiraIssue(params: CreateJiraIssueRequest) {
  try {
    // Basic validation - only check that fields object exists
    if (!params.fields || typeof params.fields !== 'object') {
      return {
        success: false,
        message: 'Fields object is required',
        suggestions: [
          'The "fields" object must contain the issue field values',
          'Use Get create issue metadata API to determine available fields for your project',
          'Common fields include: project, summary, issuetype, description, assignee, priority'
        ]
      };
    }

    // Make the API call without additional validation - let Jira validate the fields
    const result = await jiraRequest("issue", {
      method: "POST",
      body: params
    });

    return {
      success: true,
      message: `Successfully created issue ${(result as { key: string }).key}`,
      data: result
    };
  } catch (error) {
    console.error('Create Jira Issue Error:', error);

    // Enhanced error handling with detailed field information
    let errorMessage = 'Unknown error occurred';
    let additionalInfo: string[] = [];

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Try to extract structured error information from Jira API response
      if (error.name === 'JiraValidationError' || error.name === 'JiraError') {
        const jiraError = error as any;
        if (jiraError.response) {
          const response = jiraError.response;
          
          // Extract field-specific errors
          if (response.errors && typeof response.errors === 'object') {
            const fieldErrors = Object.entries(response.errors)
              .map(([field, msg]) => `• ${field}: ${msg}`);
            additionalInfo.push(`Field Errors:\n${fieldErrors.join('\n')}`);
          }
          
          // Extract general error messages
          if (response.errorMessages && Array.isArray(response.errorMessages)) {
            additionalInfo.push(`Additional Details:\n${response.errorMessages.map((msg: string) => `• ${msg}`).join('\n')}`);
          }
        }
      }
    }

    // Add general guidance for field validation errors
    if (errorMessage.toLowerCase().includes('required') || 
        errorMessage.toLowerCase().includes('mandatory') ||
        errorMessage.toLowerCase().includes('field')) {
      additionalInfo.push(`Common required fields:\n• project: { key: "PROJECT_KEY" }\n• summary: "Issue title"\n• issuetype: { name: "Issue type name" }\n\nUse the Get create issue metadata API to find all required and available fields for your specific project.`);
    }

    // Build comprehensive error message
    let fullErrorMessage = errorMessage;
    if (additionalInfo.length > 0) {
      fullErrorMessage += '\n\n' + additionalInfo.join('\n\n');
    }

    return {
      success: false,
      message: fullErrorMessage,
      error: error
    };
  }
}
